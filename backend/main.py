import hashlib
import json
import os
import asyncio
import logging
import secrets
from datetime import datetime, timedelta
from typing import List
from urllib.parse import urlparse

import jwt as pyjwt
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from bs4 import BeautifulSoup
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from google import genai
from google.genai import types
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from database import SessionLocal, get_db
from models.bookmark import Bookmark, BookmarkStatus, SourceType
from models.api_key import ApiKey
from models.ai_usage import AIUsage
from models.chunk import Chunk
from auth import get_current_user, hash_api_key
from scraper import scrape_url
import storage
import chunking
from extractors import (
    extract_url,
    extract_file,
    source_type_for_filename,
    ExtractionError,
    SUPPORTED_UPLOAD_LABEL,
)
from extractors.base import ExtractedContent

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "20"))
EMBED_BATCH_SIZE = 100
CHAT_CHUNK_TOP_K = 8
CHAT_CHUNK_DISTANCE = 0.65
CHAT_CONTEXT_CHAR_BUDGET = 12000

logger = logging.getLogger("main")

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

app = FastAPI()

# Schema is managed by Alembic (see backend/migrations/). Run `alembic upgrade head`
# to apply pending migrations before starting the app.

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


# ── Rate Limiter ─────────────────────────────────────────────────────────────

def rate_limit_key(request: Request) -> str:
    """Key rate limits by the authenticated Clerk user when available, falling
    back to client IP for unauthenticated/malformed requests. The JWT is decoded
    without signature verification here purely for bucketing — real auth/authorization
    still happens in get_current_user via FastAPI's dependency injection."""
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:]
        try:
            decoded = pyjwt.decode(token, options={"verify_signature": False})
            sub = decoded.get("sub")
            if sub:
                return sub
        except Exception:
            pass
    return get_remote_address(request)

limiter = Limiter(key_func=rate_limit_key)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


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
    key_insight: str


class BookmarkResponse(BaseModel):
    id: int
    title: str | None = None
    url: str | None = None
    summary: str | None = None
    key_insight: str | None = None
    category: str | None = None
    user_id: str | None = None
    status: BookmarkStatus
    is_archived: bool = False
    created_at: datetime
    tags: List[str] = []
    source_type: SourceType = SourceType.URL
    file_name: str | None = None
    file_type: str | None = None
    page_count: int | None = None
    has_file: bool = False
    error_reason: str | None = None

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

    model_config = ConfigDict(from_attributes=True)


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


class ApiKeyCreateRequest(BaseModel):
    name: str

    @field_validator("name", mode="before")
    @classmethod
    def clean_name(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Name cannot be empty")
        return v[:100]


class ApiKeyResponse(BaseModel):
    id: int
    name: str
    key_prefix: str
    created_at: datetime
    last_used_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class ApiKeyCreatedResponse(ApiKeyResponse):
    key: str  # raw key, returned only once at creation time


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
    - key_insight: A single declarative sentence of 10-15 words capturing the most immediately useful thing about this resource. Write it as a direct statement, not a question. Example: "Benchmarks comparing React SSR hydration strategies with interactive code examples."
    - category: A VERY broad capitalized category name (e.g., 'Tech', 'Cooking', 'Finance', 'Design', 'Lifestyle', 'News', 'Education', 'Other'). Do not use specific technical subcategories like 'Frontend', 'Backend', 'AI/ML', 'DevOps', 'Mobile', 'Security', or 'Programming' as categories; classify them all under 'Tech' instead.{categories_ctx}
    - tags: An array of 3-5 specific subcategory keyword tags (lowercase, alphanumeric, no spaces, e.g. "nextjs", "react", "baking", "desserts", "programming", "mobile", "security").
    """
    max_retries = 3
    delay = 1.0
    for attempt in range(max_retries):
        try:
            response = await client.aio.models.generate_content(
                model="gemini-3-flash-preview",
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

            # Sanitize key_insight: strip whitespace, enforce a 200-char cap, fall back to None
            raw_insight = data.get("key_insight", "")
            if isinstance(raw_insight, str) and raw_insight.strip():
                data["key_insight"] = raw_insight.strip()[:200]
            else:
                data["key_insight"] = None

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

# ── Gemini cost controls ─────────────────────────────────────────────────────
# The only paid piece of this stack is the Gemini API key. These two helpers
# keep spend bounded and low as more people use the app: reuse enrichment
# results across users for identical URLs, and cap Gemini-consuming actions
# per user per day so no single user (or bug) can run away with the bill.

GEMINI_DAILY_QUOTA_PER_USER = int(os.getenv("GEMINI_DAILY_QUOTA_PER_USER", "50"))


def check_and_consume_ai_quota(db: Session, user_id: str) -> bool:
    """Returns True and consumes one unit of quota if the user is under their
    daily Gemini-usage cap, False if they've hit it."""
    today = datetime.utcnow().date()
    row = (
        db.query(AIUsage)
        .filter(AIUsage.user_id == user_id, AIUsage.usage_date == today)
        .first()
    )
    if row is None:
        row = AIUsage(user_id=user_id, usage_date=today, count=0)
        db.add(row)
        db.flush()

    if row.count >= GEMINI_DAILY_QUOTA_PER_USER:
        return False

    row.count += 1
    db.commit()
    return True


def find_reusable_enrichment(db: Session, item: Bookmark) -> Bookmark | None:
    """Find any user's already-completed enrichment for the same source so a
    re-added item costs zero Gemini calls. URLs match on url; uploaded files
    match on content_hash."""
    query = db.query(Bookmark).filter(
        Bookmark.id != item.id,
        Bookmark.status == BookmarkStatus.COMPLETED,
        Bookmark.embedding.is_not(None),
    )
    if item.source_type == SourceType.URL and item.url:
        query = query.filter(Bookmark.url == item.url)
    elif item.content_hash:
        query = query.filter(Bookmark.content_hash == item.content_hash)
    else:
        return None
    return query.order_by(Bookmark.created_at.desc()).first()


async def embed_texts(texts: List[str]) -> List[list | None]:
    """Batch-embed a list of texts, returning one vector per input (None where a
    batch failed). Batching keeps Gemini call count and rate low for big docs."""
    results: List[list | None] = []
    for start in range(0, len(texts), EMBED_BATCH_SIZE):
        batch = texts[start:start + EMBED_BATCH_SIZE]
        vectors: List[list | None] = [None] * len(batch)
        for attempt in range(3):
            try:
                resp = await client.aio.models.embed_content(
                    model="gemini-embedding-001",
                    contents=batch,
                    config=types.EmbedContentConfig(output_dimensionality=768),
                )
                if resp and resp.embeddings:
                    for i, emb in enumerate(resp.embeddings):
                        if i < len(vectors):
                            vectors[i] = emb.values
                break
            except Exception as e:
                if attempt < 2:
                    await asyncio.sleep(1.0 * (attempt + 1))
                else:
                    logger.error(f"Embedding batch failed after retries: {e}")
        results.extend(vectors)
    return results


async def _build_and_store_chunks(db: Session, item: Bookmark, content: ExtractedContent):
    """Chunk the extracted text, embed the chunks in batches, and replace the
    item's chunk rows. Falls back to a single summary-derived chunk so every
    completed item is always retrievable in chat."""
    # Re-enrich cleanly: drop any existing chunks first (no duplicates).
    db.query(Chunk).filter(Chunk.document_id == item.id).delete()

    if content.pages:
        text_chunks, truncated = chunking.chunk_pages(content.pages)
    else:
        text_chunks, truncated = chunking.chunk_text(content.text or "")

    stored = 0
    if text_chunks:
        vectors = await embed_texts([c.content for c in text_chunks])
        for tc, vec in zip(text_chunks, vectors):
            if vec is None:
                continue
            db.add(Chunk(
                document_id=item.id,
                user_id=item.user_id,
                chunk_index=tc.index,
                content=tc.content,
                page_number=tc.page_number,
                embedding=vec,
            ))
            stored += 1

    # Safety net: guarantee at least one retrievable chunk using the summary
    # embedding we already computed (zero extra Gemini cost).
    if stored == 0 and item.embedding is not None:
        db.add(Chunk(
            document_id=item.id,
            user_id=item.user_id,
            chunk_index=0,
            content=item.summary or item.title or "",
            page_number=None,
            embedding=item.embedding,
        ))

    if truncated and content.page_count:
        item.error_reason = f"Large document — indexed the first {chunking.MAX_CHUNKS_PER_DOC} sections for search."


# ── Background Worker Task ───────────────────────────────────────────────────

async def enrich_item_task(
    bookmark_id: int,
    user_category: str | None = None,
    user_tags: List[str] | None = None,
    stagger_index: int = 0
):
    """
    Background worker: extract text (URL scrape or file parse), generate AI
    metadata + a summary embedding, and index the content as chunks for RAG.
    Uses an isolated DB session. stagger_index spreads concurrent bulk jobs.
    """
    if stagger_index > 0:
        await asyncio.sleep(stagger_index * 0.5)
    db = SessionLocal()
    try:
        item = db.query(Bookmark).filter(Bookmark.id == bookmark_id).first()
        if not item:
            return

        # 0. Reuse an existing identical-source enrichment — zero Gemini calls.
        reusable = find_reusable_enrichment(db, item)
        if reusable:
            if not item.title:
                item.title = reusable.title
            item.summary = reusable.summary
            item.key_insight = reusable.key_insight
            item.category = user_category or reusable.category
            item.tags = user_tags if user_tags is not None else reusable.tags
            item.embedding = reusable.embedding
            item.error_reason = None
            item.status = BookmarkStatus.COMPLETED
            db.flush()
            # Copy the source's chunks (with their embeddings) — no re-embedding.
            db.query(Chunk).filter(Chunk.document_id == item.id).delete()
            for src in db.query(Chunk).filter(Chunk.document_id == reusable.id).all():
                db.add(Chunk(
                    document_id=item.id, user_id=item.user_id, chunk_index=src.chunk_index,
                    content=src.content, page_number=src.page_number, embedding=src.embedding,
                ))
            db.commit()
            return

        # 0b. Per-user daily Gemini cap (one unit per enrichment; MAX_CHUNKS_PER_DOC
        # bounds the calls within a single large document).
        if not check_and_consume_ai_quota(db, item.user_id):
            item.status = BookmarkStatus.FAILED
            item.error_reason = "Daily AI usage limit reached. Retry this item tomorrow."
            if not item.category:
                item.category = user_category or "Other"
            if item.tags is None:
                item.tags = user_tags or []
            db.commit()
            return

        existing_categories = []
        try:
            existing_categories = [
                r[0] for r in db.query(Bookmark.category)
                .filter(Bookmark.user_id == item.user_id)
                .distinct().all()
                if r[0]
            ]
        except Exception as e:
            logger.warning(f"Failed to fetch existing categories for user {item.user_id}: {e}")

        # 1. Extract text via the right extractor for this source type.
        try:
            if item.source_type == SourceType.URL:
                content = await extract_url(item.url)
            else:
                file_bytes = await asyncio.get_running_loop().run_in_executor(
                    None, storage.get_object, item.storage_key
                )
                content = await asyncio.get_running_loop().run_in_executor(
                    None, extract_file, item.source_type, file_bytes, item.file_name or "file"
                )
        except ExtractionError as ee:
            item.status = BookmarkStatus.FAILED
            item.error_reason = ee.reason
            if not item.category:
                item.category = user_category or "Other"
            if item.tags is None:
                item.tags = user_tags or []
            db.commit()
            return

        if not item.title:
            item.title = content.title or item.file_name or "Untitled"
        if content.page_count is not None:
            item.page_count = content.page_count
        title_to_use = item.title
        source_label = item.url or f"(uploaded file: {item.file_name})"
        body_text = content.text or content.description or ""

        # 2. Summary / category / tags.
        ai = await generate_summary(title_to_use, source_label, body_text, existing_categories)
        item.summary = ai["summary"]
        item.key_insight = ai.get("key_insight")
        item.category = user_category or ai["category"]
        item.tags = user_tags if user_tags is not None else ai["tags"]

        # 3. Item-level summary embedding (powers card search + related).
        tags_str = f"\nTags: {', '.join(item.tags)}" if item.tags else ""
        body_snippet = f"\nContent: {body_text[:1500]}" if body_text else ""
        text_to_embed = (
            f"Title: {title_to_use}\nCategory: {item.category}\nSummary: {item.summary}{tags_str}{body_snippet}"
        )
        try:
            embed_resp = await client.aio.models.embed_content(
                model="gemini-embedding-001",
                contents=text_to_embed,
                config=types.EmbedContentConfig(output_dimensionality=768),
            )
            if embed_resp and embed_resp.embeddings:
                item.embedding = embed_resp.embeddings[0].values
        except Exception as embed_err:
            logger.error(f"Failed summary embedding for item {bookmark_id}: {embed_err}")

        db.flush()

        # 4. Chunk-level embeddings (powers deep RAG chat retrieval).
        try:
            await _build_and_store_chunks(db, item, content)
        except Exception as chunk_err:
            logger.error(f"Chunk indexing failed for item {bookmark_id}: {chunk_err}")

        # 5. Complete.
        item.status = BookmarkStatus.COMPLETED
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error in enrich task for item {bookmark_id}: {e}")
        try:
            item = db.query(Bookmark).filter(Bookmark.id == bookmark_id).first()
            if item:
                item.status = BookmarkStatus.FAILED
                item.error_reason = item.error_reason or "Processing failed. You can retry from the item."
                if not item.summary:
                    item.summary = "Processing failed."
                if not item.category:
                    item.category = user_category or "Other"
                if item.tags is None:
                    item.tags = user_tags or []
                db.commit()
        except Exception:
            pass
    finally:
        db.close()


# Backwards-compatible alias for existing references.
enrich_bookmark_task = enrich_item_task


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


@app.get("/bookmarks/{bookmark_id}", response_model=BookmarkResponse)
def get_bookmark(
    bookmark_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    bookmark = db.query(Bookmark).filter(Bookmark.id == bookmark_id, Bookmark.user_id == user_id).first()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    return bookmark


@app.get("/search", response_model=List[BookmarkResponse])
@limiter.limit("20/minute")
async def search_bookmarks(request: Request, q: str, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
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
                Bookmark.file_name.ilike(f"%{term}%"),
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

    # 2. Fetch Vector Results (Semantic conceptual recommendations) — skipped
    # (falling back to keyword-only results) once the user hits their daily
    # Gemini quota, rather than failing the whole search.
    query_vector = None
    if check_and_consume_ai_quota(db, user_id):
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


@app.post("/bookmarks", response_model=BookmarkMessageResponse)
@limiter.limit("5/minute")
def create_bookmark(
    request: Request,
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
        status=BookmarkStatus.PROCESSING,
        source_type=SourceType.URL,
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

    background_tasks.add_task(enrich_item_task, new_bookmark.id, user_category, bookmark.tags)
    return {"message": "Bookmark added", "data": new_bookmark}


@app.post("/documents/upload", response_model=BookmarkMessageResponse)
@limiter.limit("10/minute")
async def upload_document(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    if not storage.is_configured():
        raise HTTPException(status_code=503, detail="File uploads aren't configured on this server yet.")

    file_name = file.filename or "file"
    source_type = source_type_for_filename(file_name)
    if source_type is None:
        raise HTTPException(status_code=400, detail=f"Unsupported file type. Supported: {SUPPORTED_UPLOAD_LABEL}.")

    # Read with a hard cap so a huge upload can't buffer the whole file into memory.
    max_bytes = MAX_UPLOAD_MB * 1024 * 1024
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise HTTPException(status_code=400, detail=f"File exceeds the {MAX_UPLOAD_MB} MB limit.")
    if not data:
        raise HTTPException(status_code=400, detail="This file is empty.")

    content_hash = hashlib.sha256(data).hexdigest()

    # Gentle non-blocking notice if the same user already has this exact file.
    already = (
        db.query(Bookmark)
        .filter(
            Bookmark.user_id == user_id,
            Bookmark.content_hash == content_hash,
            Bookmark.is_archived == False,
        )
        .first()
    )

    # Store the original FIRST — never create a row pointing at a missing file.
    storage_key = storage.build_key(user_id, file_name)
    try:
        await asyncio.get_running_loop().run_in_executor(
            None, lambda: storage.put_object(storage_key, data, file.content_type)
        )
    except storage.StorageError as e:
        raise HTTPException(status_code=502, detail=str(e))

    new_item = Bookmark(
        title=None,
        url=None,
        summary="AI is analyzing...",
        category="Other",
        user_id=user_id,
        status=BookmarkStatus.PROCESSING,
        source_type=source_type,
        file_name=file_name,
        file_type=file.content_type,
        file_size=len(data),
        content_hash=content_hash,
        storage_key=storage_key,
    )
    db.add(new_item)
    try:
        db.commit()
        db.refresh(new_item)
    except Exception as e:
        db.rollback()
        storage.delete_object(storage_key)  # best-effort cleanup of the orphaned object
        logger.error(f"DB failure in upload_document: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database transaction failed.")

    background_tasks.add_task(enrich_item_task, new_item.id)
    message = "Already in your vault — re-processing." if already else "Document uploaded"
    return {"message": message, "data": new_item}


@app.get("/documents/{bookmark_id}/file")
def get_document_file(bookmark_id: int, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    item = db.query(Bookmark).filter(Bookmark.id == bookmark_id, Bookmark.user_id == user_id).first()
    if not item or not item.storage_key:
        raise HTTPException(status_code=404, detail="No file for this item.")
    try:
        url = storage.presigned_get_url(item.storage_key, item.file_name)
    except storage.StorageError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return {"url": url}


@app.delete("/bookmarks/{bookmark_id}")
def delete_bookmark(bookmark_id: int, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    bookmark = db.query(Bookmark).filter(Bookmark.id == bookmark_id, Bookmark.user_id == user_id).first()
    if not bookmark:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    storage_key = bookmark.storage_key  # capture before delete
    db.delete(bookmark)  # chunks cascade at the DB level
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Database transaction failure in delete_bookmark: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database transaction failed.")
    if storage_key:
        storage.delete_object(storage_key)  # best-effort; never blocks the delete
    return {"message": "Bookmark deleted"}


@app.put("/bookmarks/{bookmark_id}", response_model=BookmarkMessageResponse)
@limiter.limit("5/minute")
def update_bookmark(
    request: Request,
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
        bookmark.status in [BookmarkStatus.FAILED, BookmarkStatus.PROCESSING]
    )

    bookmark.title = updated.title
    bookmark.url = updated.url
    bookmark.tags = updated.tags

    if needs_enrichment:
        bookmark.status = BookmarkStatus.PROCESSING
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


@app.get("/bookmarks/{bookmark_id}/related", response_model=List[BookmarkResponse])
def get_related_bookmarks(
    bookmark_id: int,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    """
    Returns up to 5 bookmarks from the user's vault that are semantically
    similar to the given bookmark, using cosine distance on stored embeddings.
    Zero Gemini API calls — queries existing vectors only.
    """
    source = db.query(Bookmark).filter(
        Bookmark.id == bookmark_id,
        Bookmark.user_id == user_id
    ).first()

    if not source:
        raise HTTPException(status_code=404, detail="Bookmark not found")

    # If the source has no embedding yet (still processing), return empty
    if source.embedding is None:
        return []

    try:
        related = (
            db.query(Bookmark)
            .filter(
                Bookmark.user_id == user_id,
                Bookmark.id != bookmark_id,
                Bookmark.embedding.is_not(None),
                Bookmark.is_archived == False,
                Bookmark.embedding.cosine_distance(source.embedding) < 0.45
            )
            .order_by(Bookmark.embedding.cosine_distance(source.embedding))
            .limit(5)
            .all()
        )
    except Exception as e:
        logger.error(f"Failed to execute related bookmarks query for {bookmark_id}: {e}", exc_info=True)
        return []

    return related


@app.get("/stats")
def get_vault_stats(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    """
    Returns a summary of the user's vault: total count, recent activity,
    and a category breakdown. Zero Gemini API calls.
    """
    try:
        total = db.query(func.count(Bookmark.id)).filter(
            Bookmark.user_id == user_id,
            Bookmark.is_archived == False
        ).scalar() or 0

        archived_count = db.query(func.count(Bookmark.id)).filter(
            Bookmark.user_id == user_id,
            Bookmark.is_archived == True
        ).scalar() or 0

        thirty_days_ago = datetime.utcnow() - timedelta(days=30)
        recent_count = db.query(func.count(Bookmark.id)).filter(
            Bookmark.user_id == user_id,
            Bookmark.created_at >= thirty_days_ago
        ).scalar() or 0

        category_rows = (
            db.query(Bookmark.category, func.count(Bookmark.id))
            .filter(
                Bookmark.user_id == user_id,
                Bookmark.is_archived == False,
                Bookmark.category.is_not(None)
            )
            .group_by(Bookmark.category)
            .order_by(func.count(Bookmark.id).desc())
            .all()
        )

        return {
            "total": total,
            "archived": archived_count,
            "recent_30d": recent_count,
            "category_count": len(category_rows),
            "categories": [{"name": row[0], "count": row[1]} for row in category_rows]
        }
    except Exception as e:
        logger.error(f"Failed to compute vault stats for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to retrieve vault statistics.")


@app.post("/chat", response_model=ChatResponse)
async def chat_with_vault(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user)
):
    clean_message = payload.message.strip()
    if not clean_message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    # Chat needs two Gemini calls (embed + generate) per message, so it's
    # gated by the daily quota rather than degrading gracefully like search.
    if not check_and_consume_ai_quota(db, user_id):
        return {
            "response": "You've reached your daily AI usage limit. Please try chatting again tomorrow.",
            "sources": []
        }

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

    # B. Retrieve the most relevant CHUNKS across the user's items (page-level RAG),
    # under a distance threshold so irrelevant content never reaches the prompt.
    try:
        chunk_hits = (
            db.query(Chunk, Bookmark)
            .join(Bookmark, Chunk.document_id == Bookmark.id)
            .filter(
                Chunk.user_id == user_id,
                Chunk.embedding.is_not(None),
                Bookmark.is_archived == False,
                Chunk.embedding.cosine_distance(query_vector) < CHAT_CHUNK_DISTANCE,
            )
            .order_by(Chunk.embedding.cosine_distance(query_vector))
            .limit(CHAT_CHUNK_TOP_K)
            .all()
        )
    except Exception as e:
        logger.error(f"Database query failure in RAG chat: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database transaction failed.")

    if not chunk_hits:
        return {
            "response": "I couldn't find anything relevant in your vault for that. Try saving more, or rephrasing your question.",
            "sources": []
        }

    # C. Build a deduped, ordered source list (one citation index per document,
    # even when several of its chunks were retrieved) and a char-budgeted context.
    sources = []              # ordered unique parent documents
    source_index = {}         # document_id -> citation number
    context_blocks = []
    budget = CHAT_CONTEXT_CHAR_BUDGET
    for chunk, doc in chunk_hits:
        if doc.id not in source_index:
            sources.append(doc)
            source_index[doc.id] = len(sources)
        idx = source_index[doc.id]
        loc = f", p. {chunk.page_number}" if chunk.page_number else ""
        piece = chunk.content[:budget]
        budget -= len(piece)
        context_blocks.append(f"Source [{idx}] ({doc.title or doc.file_name or 'Untitled'}{loc}):\n{piece}")
        if budget <= 0:
            break

    context_str = "\n\n".join(context_blocks)

    system_instruction = (
        "You are the AI Assistant for the user's document vault (saved links and uploaded documents).\n"
        "Answer the user's question using ONLY the provided Source context list.\n"
        "If the answer cannot be inferred from the context, say you couldn't find it in their vault.\n"
        "Format your answer in clean markdown. Cite the sources you refer to using bracketed index numbers "
        "(e.g. [1], [2]) directly within your sentences (do not construct a separate sources list at the end)."
    )

    # Compile chat history — cap at last 20 messages to control Gemini token costs.
    # Older context is less relevant and significantly inflates input token counts.
    trimmed_history = payload.history[-20:] if len(payload.history) > 20 else payload.history

    contents = []
    for msg in trimmed_history:
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
            model="gemini-3-flash-preview",
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


# ── API Keys (used by the browser extension) ─────────────────────────────────

@app.post("/api-keys", response_model=ApiKeyCreatedResponse)
def create_api_key(
    payload: ApiKeyCreateRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    raw_key = f"abv_{secrets.token_urlsafe(32)}"
    api_key = ApiKey(
        user_id=user_id,
        name=payload.name,
        key_hash=hash_api_key(raw_key),
        key_prefix=raw_key[:12],
    )
    db.add(api_key)
    try:
        db.commit()
        db.refresh(api_key)
    except Exception as e:
        db.rollback()
        logger.error(f"Database transaction failure in create_api_key: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database transaction failed.")

    return ApiKeyCreatedResponse(key=raw_key, **ApiKeyResponse.model_validate(api_key).model_dump())


@app.get("/api-keys", response_model=List[ApiKeyResponse])
def list_api_keys(db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    return (
        db.query(ApiKey)
        .filter(ApiKey.user_id == user_id)
        .order_by(ApiKey.created_at.desc())
        .all()
    )


@app.delete("/api-keys/{key_id}")
def delete_api_key(key_id: int, db: Session = Depends(get_db), user_id: str = Depends(get_current_user)):
    api_key = db.query(ApiKey).filter(ApiKey.id == key_id, ApiKey.user_id == user_id).first()
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found")
    db.delete(api_key)
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Database transaction failure in delete_api_key: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Database transaction failed.")
    return {"message": "API key revoked"}


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
            status=BookmarkStatus.PROCESSING,
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
    # Tasks are staggered by 0.5s each to prevent a thundering-herd of concurrent
    # Gemini API calls when importing many bookmarks at once.
    if background_tasks:
        for index, b in enumerate(bookmarks_to_create):
            background_tasks.add_task(enrich_bookmark_task, b.id, stagger_index=index)

    return {
        "message": f"Successfully imported {imported_count} bookmarks. Skipped {skipped_count} duplicates/invalid links.",
        "imported": imported_count,
        "skipped": skipped_count,
        "limited": len(links) > 100
    }