import json
import os
import time
import threading
import logging
from datetime import datetime
from typing import List
from urllib.parse import urlparse

from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
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

    @field_validator("url", mode="before")
    @classmethod
    def normalize_url(cls, v: str) -> str:
        if not isinstance(v, str):
            return v
        v = v.strip()
        if not v:
            raise ValueError("URL cannot be empty")
        if not v.startswith(("http://", "https://")):
            v = "https://" + v
        
        parsed = urlparse(v)
        if not parsed.scheme or parsed.scheme.lower() not in ["http", "https"] or not parsed.netloc:
            raise ValueError("Invalid URL scheme or format. Must be http or https.")
        return v

# Pydantic model used as the structured output schema for Gemini
class BookmarkAI(BaseModel):
    summary: str
    category: str


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

    class Config:
        from_attributes = True


class BookmarkMessageResponse(BaseModel):
    message: str
    data: BookmarkResponse


# ── AI helper ────────────────────────────────────────────────────────────────

VALID_CATEGORIES = [
    "Backend", "Frontend", "AI/ML", "DevOps", "Database",
    "Mobile", "Security", "Cloud", "Productivity", "Programming", "Other",
]

async def generate_summary(title: str, url: str, scraped_text: str | None = None) -> dict:
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

    prompt += f"""
    Return a JSON object containing:
    - summary: A concise 2-3 sentence description of what this resource is about.
    - category: Exactly one value from this list: {", ".join(VALID_CATEGORIES)}
    """
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
        # Validate that the returned category is one we recognise
        if data.get("category") not in VALID_CATEGORIES:
            data["category"] = "Other"
        return data
    except Exception as e:
        print("AI Summary error:", e)
        return {"summary": "Summary unavailable.", "category": "Other"}

# ── Background Worker Task ───────────────────────────────────────────────────

async def enrich_bookmark_task(bookmark_id: int, user_category: str | None = None):
    """
    Background worker task to scrape a webpage and generate AI metadata.
    Uses an isolated database session context.
    """
    db = SessionLocal()
    try:
        bookmark = db.query(Bookmark).filter(Bookmark.id == bookmark_id).first()
        if not bookmark:
            return

        # 1. Web scraping
        scraped = await scrape_url(bookmark.url)
        
        # Fallback to scraped title if user didn't enter one, and save default title
        if not bookmark.title:
            bookmark.title = scraped.get("title") or "Untitled Bookmark"
        title_to_use = bookmark.title

        # 2. Call Gemini
        scraped_text = scraped.get("text") or scraped.get("description")
        ai = await generate_summary(title_to_use, bookmark.url, scraped_text)

        # 3. Save summary and category
        bookmark.summary = ai["summary"]
        bookmark.category = user_category or ai["category"]

        # 4. Generate Vector Embedding with Rich Content Representation (Resilient to failure)
        scraped_text_snippet = f"\nContent: {scraped_text[:1500]}" if scraped_text else ""
        text_to_embed = (
            f"Title: {title_to_use}\n"
            f"Category: {bookmark.category}\n"
            f"Summary: {bookmark.summary}"
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
            print(f"Failed to generate embedding for bookmark {bookmark_id}: {embed_err}")

        # 5. Complete task
        bookmark.status = "completed"
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error in background task for bookmark {bookmark_id}: {e}")
        try:
            bookmark = db.query(Bookmark).filter(Bookmark.id == bookmark_id).first()
            if bookmark:
                bookmark.status = "failed"
                bookmark.summary = "AI summarization failed."
                if not bookmark.category:
                    bookmark.category = user_category or "Other"
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
    clean_q = q.strip()[:500]
    if not clean_q:
        return []

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
        print("Failed to embed search query:", e)

    # 1. Fetch Vector Results (with distance threshold)
    vector_results = []
    if query_vector:
        try:
            vector_results = (
                db.query(Bookmark)
                .filter(
                    Bookmark.user_id == user_id, 
                    Bookmark.embedding.is_not(None),
                    Bookmark.embedding.cosine_distance(query_vector) < 0.65
                )
                .order_by(Bookmark.embedding.cosine_distance(query_vector))
                .limit(20)
                .all()
            )
        except Exception as e:
            print("Failed to execute vector search:", e)

    # 2. Fetch Keyword Results (Multi-Term word order resilient)
    terms = [t for t in clean_q.split() if len(t) > 1]
    if not terms:
        terms = [clean_q] # Fallback to full query if short
        
    conditions = []
    for term in terms:
        conditions.append(
            or_(
                Bookmark.title.ilike(f"%{term}%"),
                Bookmark.url.ilike(f"%{term}%"),
                Bookmark.summary.ilike(f"%{term}%"),
                Bookmark.category.ilike(f"%{term}%"),
            )
        )

    keyword_results = (
        db.query(Bookmark)
        .filter(Bookmark.user_id == user_id, *conditions)
        .limit(20)
        .all()
    )

    # 3. Direct merge and deduplicate
    seen = set()
    combined = []
    for b in vector_results:
        if b.id not in seen:
            seen.add(b.id)
            combined.append(b)
    for b in keyword_results:
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
    user_category = bookmark.category if bookmark.category in VALID_CATEGORIES else None
    new_bookmark = Bookmark(
        title=bookmark.title,
        url=bookmark.url,
        summary="AI is analyzing...",
        category=user_category or "Other",
        user_id=user_id,
        status="processing"
    )
    db.add(new_bookmark)
    try:
        db.commit()
        db.refresh(new_bookmark)
    except Exception as e:
        db.rollback()
        logger.error(f"Database transaction failure in create_bookmark: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database transaction failed.")

    background_tasks.add_task(enrich_bookmark_task, new_bookmark.id, user_category)
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

    user_category = updated.category if updated.category in VALID_CATEGORIES else None
    
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
            
        background_tasks.add_task(enrich_bookmark_task, bookmark.id, user_category)
    else:
        # URL is unchanged and bookmark has summary - update metadata synchronously
        if user_category:
            bookmark.category = user_category
        # Keep existing auto category if user_category is None
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