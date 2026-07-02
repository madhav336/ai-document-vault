import json
import os
import time
import asyncio
import threading
import logging
from datetime import datetime
from typing import List
from urllib.parse import urlparse

from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from bs4 import BeautifulSoup
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session
from sqlalchemy import or_, text
from google import genai
from google.genai import types

from database import engine, Base, SessionLocal
from models.bookmark import Bookmark
from auth import get_current_user
from scraper import scrape_url

logger = logging.getLogger("main")

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

app = FastAPI()

# 1. Enable pgvector extension before creating tables
try:
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    print("pgvector extension verified/created.")
except Exception as e:
    print("Failed to verify/create pgvector extension:", e)

# 2. Run SQLAlchemy metadata mapping
Base.metadata.create_all(bind=engine)

def run_migrations():
    # A. Check and add status column
    has_status = True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT status FROM bookmarks LIMIT 1"))
    except Exception:
        has_status = False

    if not has_status:
        try:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE bookmarks ADD COLUMN status VARCHAR DEFAULT 'completed'"))
            print("Database migration: status column successfully added to bookmarks table.")
        except Exception as e:
            print("Failed to run status column migration:", e)

    # B. Check and add embedding column
    has_embedding = True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT embedding FROM bookmarks LIMIT 1"))
    except Exception:
        has_embedding = False

    if not has_embedding:
        try:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE bookmarks ADD COLUMN embedding vector(768)"))
            print("Database migration: embedding column successfully added.")
        except Exception as e:
            print("Failed to run embedding column migration:", e)

    # C. Check and add is_archived column
    has_is_archived = True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT is_archived FROM bookmarks LIMIT 1"))
    except Exception:
        has_is_archived = False

    if not has_is_archived:
        try:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE bookmarks ADD COLUMN is_archived BOOLEAN DEFAULT FALSE"))
            print("Database migration: is_archived column successfully added.")
        except Exception as e:
            print("Failed to run is_archived column migration:", e)

    # D. HNSW Index creation
    try:
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE INDEX IF NOT EXISTS bookmarks_embedding_hnsw_idx "
                "ON bookmarks USING hnsw (embedding vector_cosine_ops)"
            ))
        print("Database migration: HNSW vector index verified/created.")
    except Exception as e:
        print("Failed to run HNSW vector index migration:", e)

    # E. Check and add tags column
    has_tags = True
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT tags FROM bookmarks LIMIT 1"))
    except Exception:
        has_tags = False

    if not has_tags:
        try:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE bookmarks ADD COLUMN tags JSON"))
            print("Database migration: tags column successfully added.")
        except Exception as e:
            print("Failed to run tags column migration:", e)

run_migrations()

ENVIRONMENT = (os.getenv("ENVIRONMENT", "") or os.getenv("ENV", "")).lower()
is_production = ENVIRONMENT.startswith("prod")

allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
if allowed_origins_env:
    origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
else:
    origins = [
        "http://localhost:3000",
        "http://localhost",
        "capacitor://localhost",
        "https://ai-bookmark-vault.vercel.app",
    ]

# Security hardening: Strip out localhost and loopback origins in production environments
if is_production:
    origins = [
        o for o in origins 
        if "localhost" not in o and "127.0.0.1" not in o and "[::1]" not in o
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── DB dependency ────────────────────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Rate Limiter Dependency ──────────────────────────────────────────────────

class RateLimiter:
    def __init__(self, requests_limit: int, window_seconds: int):
        self.requests_limit = requests_limit
        self.window_seconds = window_seconds
        self.history = {}
        self.lock = threading.Lock()

    def __call__(self, request: Request, user_id: str = Depends(get_current_user)):
        now = time.time()
        key = user_id or (request.client.host if request.client else "unknown")
        
        with self.lock:
            user_history = self.history.get(key, [])
            user_history = [t for t in user_history if now - t < self.window_seconds]
            
            if len(user_history) >= self.requests_limit:
                raise HTTPException(
                    status_code=429,
                    detail="Rate limit exceeded. Please try again later."
                )
            
            user_history.append(now)
            self.history[key] = user_history

save_limiter = RateLimiter(requests_limit=5, window_seconds=60)
search_limiter = RateLimiter(requests_limit=20, window_seconds=60)


# ── Schemas ──────────────────────────────────────────────────────────────────

class BookmarkSchema(BaseModel):
    title: str
    url: str
    category: str | None = None  # Optional override; None = let AI decide
    tags: List[str] = []

    @field_validator("tags", mode="before")
    @classmethod
    def sanitize_tags(cls, v):
        if not v:
            return []
        if isinstance(v, list):
            return list(set(str(t).strip().lower() for t in v if str(t).strip()))
        return []

    @field_validator("url", mode="before")
    @classmethod
    def normalize_url(cls, v: str) -> str:
        if not isinstance(v, str):
            return v
        v = v.strip()
        if not v:
            raise ValueError("URL cannot be empty")
        
        # Validate that explicit protocols are strictly http or https
        if "://" in v:
            scheme = v.split("://", 1)[0].lower()
            if scheme not in ["http", "https"]:
                raise ValueError("Invalid URL scheme. Must be http or https.")
        else:
            v = "https://" + v
        
        parsed = urlparse(v)
        if not parsed.scheme or parsed.scheme.lower() not in ["http", "https"] or not parsed.netloc:
            raise ValueError("Invalid URL scheme or format. Must be http or https.")
        return v

# Pydantic model used as the structured output schema for Gemini
class BookmarkAI(BaseModel):
    summary: str
    category: str
    tags: List[str]


class BookmarkResponse(BaseModel):
    id: int
    title: str | None = None
    url: str
    summary: str | None = None
    category: str | None = None
    user_id: str | None = None
    status: str
    is_archived: bool = False
    created_at: datetime
    tags: List[str] = []

    @field_validator("tags", mode="before")
    @classmethod
    def normalize_tags(cls, v):
        if v is None:
            return []
        if isinstance(v, str):
            try:
                import json
                return json.loads(v)
            except Exception:
                return []
        if isinstance(v, list):
            return [str(item) for item in v]
        return []

    class Config:
        from_attributes = True


class BookmarkMessageResponse(BaseModel):
    message: str
    data: BookmarkResponse


class ChatMessage(BaseModel):
    role: str  # "user" or "model"
    content: str


class ChatRequest(BaseModel):
    message: str
    history: List[ChatMessage] = []


class ChatResponse(BaseModel):
    response: str
    sources: List[BookmarkResponse]


# ── AI helper ────────────────────────────────────────────────────────────────

VALID_CATEGORIES = [
    "Backend", "Frontend", "AI/ML", "DevOps", "Database",
    "Mobile", "Security", "Cloud", "Productivity", "Programming", "Other",
]

async def generate_summary(title: str, url: str, scraped_text: str | None = None, existing_categories: List[str] = None) -> dict:
    prompt = f"""
    You are generating metadata for a bookmark manager application.
    Analyze the bookmark below and return a JSON object.

    Bookmark Title: {title}
    Bookmark URL: {url}
    """
    if scraped_text:
        prompt += f"\nWebpage Content (Scraped):\n{scraped_text}\n"
        prompt += "\nInstructions: Use the webpage content above to write a highly accurate description."
    else:
        prompt += "\nInstructions: Scraped text was unavailable. Describe what this resource is about based on the Title and URL."

    categories_ctx = ""
    if existing_categories:
        categories_ctx = f" Here is a list of the user's existing broad categories: {existing_categories}. Reuse one of these if it matches well, otherwise generate a new broad capitalized category name if none of them apply."

    prompt += f"""
    Return a JSON object containing:
    - summary: A concise 2-3 sentence description of what this resource is about.
    - category: A VERY broad capitalized category name (e.g., 'Tech', 'Cooking', 'Finance', 'Design', 'Lifestyle', 'News', 'Education', 'Other'). Do not use specific technical subcategories like 'Frontend', 'Backend', 'AI/ML', 'DevOps', 'Mobile', 'Security', or 'Programming' as categories; classify them all under 'Tech' instead.{categories_ctx}
    - tags: An array of 3-5 specific subcategory keyword tags (lowercase, alphanumeric, no spaces, e.g. "nextjs", "react", "baking", "desserts", "programming", "mobile", "security").
    """
    max_retries = 3
    delay = 1.0
    for attempt in range(max_retries):
        try:
            response = await client.aio.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=BookmarkAI,
                    temperature=0.0,
                ),
            )
            data = json.loads(response.text)
            if "category" in data and isinstance(data["category"], str):
                data["category"] = data["category"].strip()
                if data["category"] == "":
                    data["category"] = "Other"
            else:
                data["category"] = "Other"
            
            if "tags" in data and isinstance(data["tags"], list):
                data["tags"] = list(set(str(t).strip().lower() for t in data["tags"] if str(t).strip()))
            else:
                data["tags"] = []
                
            return data
        except Exception as e:
            error_str = str(e)
            is_transient = "503" in error_str or "429" in error_str or "unavailable" in error_str.lower()
            if is_transient and attempt < max_retries - 1:
                logger.warning(f"Transient Gemini error (attempt {attempt+1}/{max_retries}): {e}. Retrying in {delay}s...")
                await asyncio.sleep(delay)
                delay *= 2
            else:
                logger.error(f"AI Summary failure on attempt {attempt+1}: {e}", exc_info=True)
                raise e

# ── Background Worker Task ───────────────────────────────────────────────────

async def enrich_bookmark_task(bookmark_id: int, user_category: str | None = None, user_tags: List[str] | None = None):
    """
    Background worker task to scrape a webpage and generate AI metadata.
    Uses an isolated database session context.
    """
    db = SessionLocal()
    try:
        bookmark = db.query(Bookmark).filter(Bookmark.id == bookmark_id).first()
        if not bookmark:
            return

        existing_categories = []
        try:
            existing_categories = [
                r[0] for r in db.query(Bookmark.category)
                .filter(Bookmark.user_id == bookmark.user_id)
                .distinct().all()
                if r[0]
            ]
        except Exception as e:
            logger.warning(f"Failed to fetch existing categories for user {bookmark.user_id}: {e}")

        # 1. Web scraping
        scraped = await scrape_url(bookmark.url)
        
        # Fallback to scraped title if user didn't enter one, and save default title
        if not bookmark.title:
            bookmark.title = scraped.get("title") or "Untitled Bookmark"
        title_to_use = bookmark.title

        # 2. Call Gemini
        scraped_text = scraped.get("text") or scraped.get("description")
        ai = await generate_summary(title_to_use, bookmark.url, scraped_text, existing_categories)

        # 3. Save summary, category, and tags
        bookmark.summary = ai["summary"]
        bookmark.category = user_category or ai["category"]
        bookmark.tags = user_tags if user_tags is not None else ai["tags"]

        # 4. Generate Vector Embedding with Rich Content Representation (Resilient to failure)
        scraped_text_snippet = f"\nContent: {scraped_text[:1500]}" if scraped_text else ""
        tags_str = f"\nTags: {', '.join(bookmark.tags)}" if bookmark.tags else ""
        text_to_embed = (
            f"Title: {title_to_use}\n"
            f"Category: {bookmark.category}\n"
            f"Summary: {bookmark.summary}"
            f"{tags_str}"
            f"{scraped_text_snippet}"
        )
        try:
            embed_resp = await client.aio.models.embed_content(
                model="gemini-embedding-001",
                contents=text_to_embed,
                config=types.EmbedContentConfig(output_dimensionality=768)
            )
            if embed_resp and embed_resp.embeddings:
                bookmark.embedding = embed_resp.embeddings[0].values
        except Exception as embed_err:
            logger.error(f"Failed to generate embedding for bookmark {bookmark_id}: {embed_err}")

        # 5. Complete task
        bookmark.status = "completed"
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error in background task for bookmark {bookmark_id}: {e}")
        try:
            bookmark = db.query(Bookmark).filter(Bookmark.id == bookmark_id).first()
            if bookmark:
                bookmark.status = "failed"
                bookmark.summary = "AI summarization failed."
                if not bookmark.category:
                    bookmark.category = user_category or "Other"
                if bookmark.tags is None:
                    bookmark.tags = user_tags or []
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


# Startup event and backfill embeddings task removed to simplify deployment and save API quotas


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/bookmarks", response_model=List[BookmarkResponse])
def get_bookmarks(
    skip: int = 0,
    limit: int = 50,
    archived: bool = False,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    return (
        db.query(Bookmark)
        .filter(Bookmark.user_id == user_id, Bookmark.is_archived == archived)
        .order_by(Bookmark.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@app.get("/search", response_model=List[BookmarkResponse], dependencies=[Depends(search_limiter)])
async def search_bookmarks(q: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    from sqlalchemy import cast, String
    clean_q = q.strip()[:500]
    if not clean_q:
        return []

    # 1. Fetch Keyword Results (Exact/lexical matching is highly precise)
    terms = [t for t in clean_q.split() if len(t) > 1]
    if not terms:
        terms = [clean_q]
        
    conditions = []
    for term in terms:
        conditions.append(
            or_(
                Bookmark.title.ilike(f"%{term}%"),
                Bookmark.url.ilike(f"%{term}%"),
                Bookmark.summary.ilike(f"%{term}%"),
                Bookmark.category.ilike(f"%{term}%"),
                cast(Bookmark.tags, String).ilike(f"%{term}%")
            )
        )

    try:
        keyword_results = (
            db.query(Bookmark)
            .filter(Bookmark.user_id == user_id, *conditions)
            .limit(20)
            .all()
        )
    except Exception as e:
        logger.error(f"Failed to execute keyword search: {e}", exc_info=True)
        keyword_results = []

    # 2. Fetch Vector Results (Semantic conceptual recommendations)
    query_vector = None
    try:
        embed_resp = await client.aio.models.embed_content(
            model="gemini-embedding-001",
            contents=clean_q,
            config=types.EmbedContentConfig(output_dimensionality=768)
        )
        if embed_resp and embed_resp.embeddings:
            query_vector = embed_resp.embeddings[0].values
    except Exception as e:
        logger.error(f"Failed to embed search query: {e}")

    vector_results = []
    if query_vector:
        try:
            vector_results = (
                db.query(Bookmark)
                .filter(
                    Bookmark.user_id == user_id, 
                    Bookmark.embedding.is_not(None),
                    Bookmark.embedding.cosine_distance(query_vector) < 0.45
                )
                .order_by(Bookmark.embedding.cosine_distance(query_vector))
                .limit(20)
                .all()
            )
        except Exception as e:
            logger.error(f"Failed to execute vector search: {e}")

    # 3. Direct merge: Lexical matches first, then unique semantic recommendations
    seen = set()
    combined = []
    for b in keyword_results:
        if b.id not in seen:
            seen.add(b.id)
            combined.append(b)
    for b in vector_results:
        if b.id not in seen:
            seen.add(b.id)
            combined.append(b)
            
    return combined


@app.post("/bookmarks", response_model=BookmarkMessageResponse, dependencies=[Depends(save_limiter)])
def create_bookmark(
    bookmark: BookmarkSchema,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    user_category = bookmark.category.strip() if bookmark.category and bookmark.category.strip() else None
    new_bookmark = Bookmark(
        title=bookmark.title,
        url=bookmark.url,
        summary="AI is analyzing...",
        category=user_category or "Other",
        user_id=user_id,
        status="processing",
        tags=bookmark.tags
    )
    db.add(new_bookmark)
    try:
        db.commit()
        db.refresh(new_bookmark)
    except Exception as e:
        db.rollback()
        logger.error(f"Database transaction failure in create_bookmark: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database transaction failed.")

    background_tasks.add_task(enrich_bookmark_task, new_bookmark.id, user_category, bookmark.tags)
    return {"message": "Bookmark added", "data": new_bookmark}


@app.delete("/bookmarks/{bookmark_id}")
def delete_bookmark(bookmark_id: int, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    bookmark = db.query(Bookmark).filter(Bookmark.id == bookmark_id, Bookmark.user_id == user_id).first()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    db.delete(bookmark)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Database transaction failure in delete_bookmark: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database transaction failed.")
    return {"message": "Bookmark deleted"}


@app.put("/bookmarks/{bookmark_id}", response_model=BookmarkMessageResponse, dependencies=[Depends(save_limiter)])
def update_bookmark(
    bookmark_id: int,
    updated: BookmarkSchema,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    bookmark = db.query(Bookmark).filter(Bookmark.id == bookmark_id, Bookmark.user_id == user_id).first()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")

    user_category = updated.category.strip() if updated.category and updated.category.strip() else None
    
    # Check if we should re-scrape and re-summarize
    needs_enrichment = (
        bookmark.url != updated.url or 
        not bookmark.summary or 
        bookmark.summary == "Summary unavailable." or
        bookmark.summary == "AI is analyzing..." or
        bookmark.status in ["failed", "processing"]
    )

    bookmark.title = updated.title
    bookmark.url = updated.url
    bookmark.tags = updated.tags

    if needs_enrichment:
        bookmark.status = "processing"
        bookmark.summary = "AI is re-analyzing..."
        try:
            db.commit()
            db.refresh(bookmark)
        except Exception as e:
            db.rollback()
            logger.error(f"Database transaction failure in update_bookmark (enrichment path): {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Database transaction failed.")
            
        background_tasks.add_task(enrich_bookmark_task, bookmark.id, user_category, updated.tags)
    else:
        if user_category:
            bookmark.category = user_category
        try:
            db.commit()
            db.refresh(bookmark)
        except Exception as e:
            db.rollback()
            logger.error(f"Database transaction failure in update_bookmark (metadata path): {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Database transaction failed.")

    return {"message": "Bookmark updated", "data": bookmark}


@app.patch("/bookmarks/{bookmark_id}/archive", response_model=BookmarkResponse)
def toggle_archive_bookmark(
    bookmark_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    bookmark = db.query(Bookmark).filter(Bookmark.id == bookmark_id, Bookmark.user_id == user_id).first()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    
    bookmark.is_archived = not bookmark.is_archived
    try:
        db.commit()
        db.refresh(bookmark)
    except Exception as e:
        db.rollback()
        logger.error(f"Database error during archive toggle: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database transaction failed.")
        
    return bookmark


@app.post("/chat", response_model=ChatResponse)
async def chat_with_vault(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    clean_message = payload.message.strip()
    if not clean_message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    # A. Generate embedding for query
    query_vector = None
    try:
        embed_resp = await client.aio.models.embed_content(
            model="gemini-embedding-001",
            contents=clean_message,
            config=types.EmbedContentConfig(output_dimensionality=768)
        )
        if embed_resp and embed_resp.embeddings:
            query_vector = embed_resp.embeddings[0].values
    except Exception as e:
        logger.error(f"Failed to generate embedding for chat query: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to parse search query.")

    if not query_vector:
        raise HTTPException(status_code=500, detail="Failed to compute query vector representation.")

    # B. Retrieve similar bookmarks using a safety distance threshold (DoS & Hallucination blocker)
    try:
        sources = (
            db.query(Bookmark)
            .filter(
                Bookmark.user_id == user_id,
                Bookmark.embedding.is_not(None),
                Bookmark.is_archived == False,
                Bookmark.embedding.cosine_distance(query_vector) < 0.65
            )
            .order_by(Bookmark.embedding.cosine_distance(query_vector))
            .limit(5)
            .all()
        )
    except Exception as e:
        logger.error(f"Database query failure in RAG chat: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database transaction failed.")

    # Early exit if no bookmarks are related to the user's query
    if not sources:
        return {
            "response": "I couldn't find any relevant bookmarks matching your question in your vault. Try saving more bookmarks or adjusting your query!",
            "sources": []
        }

    # C. Compile prompt context
    context_blocks = []
    for i, b in enumerate(sources, 1):
        scraped_content = b.summary or "No summary available."
        context_blocks.append(
            f"Source [{i}]:\n"
            f"Title: {b.title}\n"
            f"URL: {b.url}\n"
            f"Summary: {scraped_content}\n"
        )
    
    context_str = "\n\n".join(context_blocks)

    system_instruction = (
        "You are the AI Assistant for the user's Bookmark Vault.\n"
        "Your task is to answer the user's question using ONLY the provided Source context list.\n"
        "If the answer cannot be inferred from the context, respond saying you couldn't find the answer in their vault.\n"
        "Format your answer in clean markdown. Cite the sources you refer to using bracketed index numbers "
        "(e.g. [1], [2]) directly within your sentences (do not construct a separate sources list at the end)."
    )

    # Compile chat history and insert system instruction
    contents = []
    for msg in payload.history:
        contents.append(
            types.Content(
                role=msg.role,
                parts=[types.Part.from_text(text=msg.content)]
            )
        )
    
    # Append the current prompt containing the retrieved context
    prompt = f"Context:\n{context_str}\n\nUser Question: {clean_message}"
    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=prompt)]
        )
    )

    # D. Query Gemini
    try:
        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                temperature=0.3
            )
        )
        ai_reply = response.text if response.text else "Sorry, I could not generate a response."
    except Exception as e:
        logger.error(f"Gemini generation failure in RAG chat: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="AI generation failed.")

    return {"response": ai_reply, "sources": sources}


@app.post("/bookmarks/import")
async def import_bookmarks_html(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    # 1. Enforce 2MB size limit (DoS & memory lock protection)
    MAX_SIZE = 2 * 1024 * 1024  # 2MB
    content_bytes = await file.read(MAX_SIZE + 1)
    if len(content_bytes) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Import file exceeds the 2MB size limit.")

    try:
        content = content_bytes.decode("utf-8", errors="ignore")
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file encoding")

    soup = BeautifulSoup(content, "html.parser")
    links = soup.find_all("a")

    imported_count = 0
    skipped_count = 0

    # Limit to 100 links per import to prevent system/AI API rate limits overload
    targets = links[:100]
    
    bookmarks_to_create = []
    
    for link in targets:
        url = link.get("href")
        if not url:
            continue
        
        url_str = url.strip()
        # Enforce strict checks against relative paths, anchor hashes, and local protocols
        if url_str.startswith(("/", "#", "javascript:", "mailto:")):
            skipped_count += 1
            continue

        parsed_url = urlparse(url_str)
        if not parsed_url.scheme:
            url_str = "https://" + url_str
            parsed_url = urlparse(url_str)
        
        if parsed_url.scheme.lower() not in ["http", "https"]:
            skipped_count += 1
            continue

        title = link.text.strip() or url_str

        # Check duplicates for user
        exists = db.query(Bookmark).filter(Bookmark.url == url_str, Bookmark.user_id == user_id).first()
        if exists:
            skipped_count += 1
            continue

        bookmark = Bookmark(
            user_id=user_id,
            title=title,
            url=url_str,
            category="Other",
            status="processing",
            summary="Queued for bulk AI analysis..."
        )
        bookmarks_to_create.append(bookmark)

    if not bookmarks_to_create:
        return {
            "message": f"No new bookmarks to import. Skipped {skipped_count} invalid or duplicate links.",
            "imported": 0,
            "skipped": skipped_count,
            "limited": len(links) > 100
        }

    # 2. Transaction Commit Optimization: Grouped commit
    try:
        db.add_all(bookmarks_to_create)
        db.commit()
        for b in bookmarks_to_create:
            db.refresh(b)
        imported_count = len(bookmarks_to_create)
    except Exception as e:
        db.rollback()
        logger.error(f"Failed bulk import transaction commit: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database transaction failed during bulk import.")

    # 3. Async Background Task Scheduling
    if background_tasks:
        for b in bookmarks_to_create:
            background_tasks.add_task(enrich_bookmark_task, b.id)

    return {
        "message": f"Successfully imported {imported_count} bookmarks. Skipped {skipped_count} duplicates/invalid links.",
        "imported": imported_count,
        "skipped": skipped_count,
        "limited": len(links) > 100
    }