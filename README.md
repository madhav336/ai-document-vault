# AI Document Vault

AI Document Vault is a full-stack AI-powered knowledge vault that ingests both web links and uploaded documents (PDF, Word, Markdown, plain text), then makes everything semantically searchable and chat-able.
Instead of storing plain bookmarks or files, the platform enriches every item with AI-generated summaries, categories, and tags, and indexes its content for passage-level retrieval-augmented chat.

Live Demo: [https://ai-bookmark-vault.vercel.app](https://ai-bookmark-vault.vercel.app)

---

## Features

- Save **links or documents** — URLs, PDFs, Word (.docx), Markdown, and plain text — all into one AI-searchable vault
- Semantic search across everything you've saved (pgvector + Gemini embeddings), not just keyword matching
- RAG chat: ask questions about your vault and get answers with **cited sources and page numbers** (documents are chunked and retrieved at the passage level)
- AI-generated summaries, key insights, categories, and tags for every item
- Drag-and-drop document upload anywhere on the dashboard; originals kept in object storage so you can re-open them
- Browser extension for one-click link capture from any tab (Chrome, Manifest V3)
- Bulk import from Chrome/Firefox/Safari/Brave HTML bookmark exports
- Cost controls: cross-user enrichment dedupe + per-user daily Gemini quota
- Cloud Postgres storage (Neon) with Alembic-managed schema migrations

---

## Tech Stack

### Frontend
- Next.js (React framework)
- React
- TypeScript

### Backend
- FastAPI (Python)
- SQLAlchemy ORM
- Pydantic

### Database
- PostgreSQL (Neon)

### AI/ML
- Google Gemini API (`gemini-3-flash-preview` for summarization/RAG chat, `gemini-embedding-001` for semantic search/chat)

### Deployment
- Vercel (Frontend)
- Railway or Render (Backend)

### Language Composition
- TypeScript: 78.3%
- Python: 16.2%
- Java: 2.4%
- CSS: 2.1%
- JavaScript: 1%

---

## Problem Statement

Modern browser bookmarks become cluttered very quickly.

Users often save:
- tutorials
- documentation
- articles
- GitHub repositories
- videos

but later struggle to:
- remember why they saved them
- retrieve them efficiently
- organize them meaningfully

AI Document Vault solves this by combining link and document management with AI-assisted summaries, semantic search, and retrieval-augmented chat.

---

## How It Works

### Bookmark Flow

1. User saves a resource URL
2. Frontend sends request to FastAPI backend
3. Backend stores bookmark in PostgreSQL
4. Gemini generates summary, category, tags, and vector embeddings (documents are also chunked for passage-level retrieval)
5. Frontend displays organized bookmark cards
6. Real-time synchronization between frontend and backend

---

## Architecture

```
Next.js Frontend (TypeScript, React)
        |
        | HTTP/REST API
        |
FastAPI Backend (Python)
        |
        | SQLAlchemy ORM
        |
PostgreSQL Database (Neon)
        |
        | External APIs
        |
Google Gemini API (summaries + embeddings) · Cloudflare R2 (file storage)
```

---

## Local Setup

### Prerequisites
- Node.js and npm
- Python 3.8+
- PostgreSQL (or use Neon for cloud database)
- Google Gemini API key

---

### 1. Clone Repository

```bash
git clone https://github.com/madhav336/ai-document-vault.git
cd ai-document-vault
```

---

### 2. Backend Setup

```bash
cd backend

python -m venv venv

# On Windows
venv\Scripts\activate

# On macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

Create `.env` file in backend directory:

```env
DATABASE_URL=your_postgresql_connection_string
GEMINI_API_KEY=your_gemini_api_key
BACKEND_PORT=8000

# Document uploads (optional — URL bookmarks work without these).
# S3-compatible object storage; Cloudflare R2's free tier (10GB, no egress) is ideal.
STORAGE_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
STORAGE_BUCKET=your_bucket
STORAGE_ACCESS_KEY=your_access_key
STORAGE_SECRET_KEY=your_secret_key
```

See `backend/.env.example` for the full list (upload size caps, chunking tuning, Gemini daily quota).

Apply database migrations, then run the backend:

```bash
alembic upgrade head
uvicorn main:app --reload
```

Backend will run on http://localhost:8000

---

### 3. Frontend Setup

```bash
cd frontend

npm install

npm run dev
```

Frontend will run on http://localhost:3000

---

### 4. Database Setup

Create a PostgreSQL database (local or via Neon) and update the DATABASE_URL in your .env file.

Schema is managed with Alembic (`backend/migrations/`). Run `alembic upgrade head` from the `backend` directory to apply all migrations to a fresh database.

---

### 5. Document uploads (optional)

To enable PDF/Word/Markdown/text uploads, create an S3-compatible bucket (Cloudflare R2 recommended — free tier, no egress fees), generate an access key/secret, and set the `STORAGE_*` variables above. Without them, URL bookmarks still work fully; the upload UI reports that uploads aren't configured. Documents are chunked and embedded so RAG chat can cite specific passages/pages.

---

### 6. Browser Extension (optional)

See [`extension/README.md`](extension/README.md) for load-unpacked install instructions. Generate a personal API key from **Settings → Browser Extension** in the web app first.

---

## API Endpoints

All endpoints require a Clerk session token (`Authorization: Bearer <token>`) or a personal API key (`X-API-Key: <key>`), and are scoped to the authenticated user.

### Items (links & documents)
- `GET /bookmarks` - List items (paginated, filterable by archived status)
- `POST /bookmarks` - Save a URL (triggers background AI enrichment)
- `POST /documents/upload` - Upload a PDF/Word/Markdown/text file (extracted, chunked, enriched)
- `GET /documents/{id}/file` - Short-lived presigned link to re-open the original file
- `PUT /bookmarks/{id}` - Update an item (re-enriches if the URL changed)
- `DELETE /bookmarks/{id}` - Delete an item (cascades chunks + removes stored file)
- `PATCH /bookmarks/{id}/archive` - Toggle archived status
- `GET /bookmarks/{id}/related` - Semantically related items (embedding similarity)
- `POST /bookmarks/import` - Bulk import from a Netscape-format HTML bookmarks file

### Search & Chat
- `GET /search?q=` - Hybrid keyword + semantic search
- `POST /chat` - RAG chat over your vault, with cited sources
- `GET /stats` - Vault summary stats (totals, recent activity, category breakdown)

### Personal API Keys
- `POST /api-keys` - Create a key (used by the browser extension)
- `GET /api-keys` - List your keys (metadata only)
- `DELETE /api-keys/{id}` - Revoke a key

---

## Future Improvements

- Publish the browser extension to the Chrome Web Store (currently load-unpacked only)
- Mobile app polish (Capacitor Android wrapper already scaffolded)
- Bookmark collections/folders and shareable links
- Export bookmarks to other formats

---

## Deployment

### Frontend (Vercel)
1. Connect repository to Vercel
2. Set environment variables
3. Deploy automatically on push to main

### Backend (Railway/Render)
1. Connect repository to hosting platform
2. Configure environment variables
3. Set Python runtime and startup command
4. Deploy automatically on push

---

## Learning Outcomes

This project provided experience with:
- Full-stack application architecture
- REST API design and implementation
- Frontend/backend communication patterns
- PostgreSQL database design and optimization
- SQLAlchemy ORM and database migrations
- Google Gemini API integration (embeddings, structured output, RAG)
- Document processing: text extraction, chunking, and vector indexing
- TypeScript for type-safe development
- Deployment workflows and CI/CD concepts
- Real-time data synchronization

---

## Repository Structure

```
ai-document-vault/
├── frontend/              # Next.js React application
│   ├── app/              # Next.js app directory
│   ├── components/       # React components
│   ├── public/           # Static assets
│   └── package.json
├── backend/              # FastAPI application
│   ├── main.py           # Entry point, routes, enrichment pipeline
│   ├── models/           # SQLAlchemy models (bookmark, chunk, api_key, ai_usage)
│   ├── extractors/       # URL / PDF / text / docx text extractors
│   ├── chunking.py       # Document chunking for RAG
│   ├── storage.py        # S3-compatible object storage
│   ├── scraper.py        # SSRF-safe web scraper
│   ├── migrations/       # Alembic migrations
│   ├── database.py       # Database configuration
│   └── requirements.txt
├── extension/            # Chrome Manifest V3 capture extension
└── README.md
```

---

## Contributing

Contributions are welcome. Please feel free to submit pull requests or open issues for bugs and feature requests.

---

## License

This project is open source and available under the MIT License.

---

## Author

Madhav Dalvi

GitHub: [madhav336](https://github.com/madhav336)

Project Repository: [ai-document-vault](https://github.com/madhav336/ai-document-vault)
