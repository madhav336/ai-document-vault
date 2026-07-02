# AI Bookmark Vault

AI Bookmark Vault is a full-stack, AI-powered bookmark manager. When you save a link, the backend scrapes the page, generates a summary using Google Gemini, categorizes the resource automatically, embeds it as a semantic vector, and stores everything in a PostgreSQL database. You end up with a searchable personal knowledge vault instead of a flat list of URLs you will never revisit.

Live: [https://ai-bookmark-vault.vercel.app](https://ai-bookmark-vault.vercel.app)

---

## What it actually does

Most bookmark managers just store a URL and a title. This one goes further in the background:

1. The page is scraped with an async HTTP client. The scraper enforces a 1MB cap, validates the content type, and blocks requests to private IP ranges to prevent SSRF.
2. The extracted text, title, and URL are passed to Gemini (gemini-2.5-flash) which returns a structured JSON object containing a 2-3 sentence summary, a broad category, and 3-5 keyword tags.
3. The same enriched content is then passed to a Gemini embedding model (gemini-embedding-001) to produce a 768-dimensional semantic vector stored alongside the record.
4. Search combines lexical matching (case-insensitive ILIKE) with cosine vector similarity, so you can find a bookmark by typing a concept rather than remembering the exact title.
5. The AI Chat feature uses retrieval-augmented generation. When you ask a question, the closest matching bookmarks are pulled by vector distance and injected as context into a Gemini prompt. The model answers using only your saved resources and cites them inline.

---

## Features

- Save bookmarks with title and URL. AI fills in the rest in the background.
- Automatic webpage scraping, summarization, category assignment, and tagging.
- Hybrid keyword and semantic vector search across your entire vault.
- RAG-powered chat assistant that answers questions using your bookmarks as its knowledge base.
- One-click bookmarklet for saving the current browser tab without opening the app.
- Bulk import via Netscape HTML bookmark files (the format all browsers export to).
- Archive and restore bookmarks without deleting them.
- Filter by category, tag, or archived status from the sidebar.
- Swipe-to-refresh on mobile.
- Real-time sync between the bookmarklet popup and the main tab using the BroadcastChannel API, so newly saved bookmarks appear instantly.
- Guided onboarding tour on first login, stored in Clerk user metadata so it only runs once.
- Per-user rate limiting on write and search endpoints (5 saves/min, 20 searches/min).

---

## Tech stack

**Frontend**
- Next.js 16 (App Router, React 19, TypeScript)
- Clerk for authentication (social login, session management)
- Vanilla CSS with CSS custom properties for theming
- Capacitor for Android packaging

**Backend**
- FastAPI (Python)
- SQLAlchemy ORM with PostgreSQL
- pgvector extension for vector storage and cosine distance queries
- httpx for async HTTP scraping
- BeautifulSoup4 for HTML parsing
- Google Gemini API for summarization and embeddings (google-genai SDK)
- PyJWT for RS256 JWT verification against Clerk public keys

**Database**
- PostgreSQL with the pgvector extension (hosted on Neon)

**Deployment**
- Vercel for the Next.js frontend (auto-deploys on push to main)
- Render for the FastAPI backend (auto-deploys on push to main)

---

## Repository structure

```
ai-bookmark-vault/
├── frontend/
│   ├── app/
│   │   ├── page.tsx           # Main application — dashboard, sidebar, chat, tour
│   │   ├── layout.tsx         # Root layout with ClerkProvider
│   │   ├── globals.css        # Global CSS variables and base styles
│   │   └── bookmarklet/
│   │       └── page.tsx       # Popup page that the bookmarklet opens to save a link
│   ├── proxy.ts               # Clerk middleware for route protection
│   ├── capacitor.config.ts    # Android app configuration
│   ├── next.config.ts
│   └── package.json
├── backend/
│   ├── main.py                # FastAPI app, all routes, background tasks, rate limiter
│   ├── auth.py                # JWT verification via Clerk (PEM key or JWKS)
│   ├── scraper.py             # Async webpage scraper with SSRF protection
│   ├── database.py            # SQLAlchemy engine and session setup
│   ├── models/
│   │   └── bookmark.py        # Bookmark ORM model
│   ├── .env.example           # Template for required environment variables
│   └── requirements.txt
└── README.md
```

---

## API reference

All endpoints require a valid Clerk JWT in the `Authorization: Bearer <token>` header. Every database query is scoped to the authenticated user's ID extracted from the token.

| Method | Path | Description |
|---|---|---|
| GET | `/bookmarks` | List bookmarks. Accepts `?archived=true` and `?skip=` / `?limit=` for pagination. |
| POST | `/bookmarks` | Create a bookmark. Scraping and AI enrichment happen in a background task. Rate-limited to 5/min. |
| PUT | `/bookmarks/{id}` | Update title, URL, category, or tags. Re-triggers enrichment if the URL changed. Rate-limited to 5/min. |
| DELETE | `/bookmarks/{id}` | Permanently delete a bookmark. |
| PATCH | `/bookmarks/{id}/archive` | Toggle the archived state of a bookmark. |
| GET | `/search` | Hybrid keyword and semantic vector search. Accepts `?q=`. Rate-limited to 20/min. |
| POST | `/chat` | RAG chat. Accepts `{ message, history }`. Retrieves relevant bookmarks by vector distance and answers using Gemini. |
| POST | `/bookmarks/import` | Bulk import from a Netscape HTML file. Capped at 2MB and 100 links per request. |

---

## Local setup

You need Node.js, Python 3.10+, and a PostgreSQL database with the pgvector extension installed. Neon provides this out of the box on their free tier.

### Clone the repository

```bash
git clone https://github.com/madhav336/ai-bookmark-vault.git
cd ai-bookmark-vault
```

### Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

```env
# PostgreSQL connection string with sslmode=require for Neon
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require

# Google AI Studio API key for Gemini summarization and embeddings
GEMINI_API_KEY=your_gemini_api_key

# Clerk authentication — choose one of the two options below.
# Option A: paste the RSA public key from your Clerk dashboard (recommended for production)
CLERK_PEM_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----

# Option B: use Clerk's JWKS URL (simpler for local dev)
CLERK_JWKS_URL=https://your-clerk-domain.clerk.accounts.dev/.well-known/jwks.json

# For local development only (disables JWT signature verification)
# CLERK_BYPASS_VERIFICATION=true

# Set to "production" in deployed environments. This causes the server to crash
# on startup if CLERK_BYPASS_VERIFICATION is also true, preventing accidental exposure.
ENVIRONMENT=development
```

Database tables and column migrations run automatically on startup. You do not need to run any migration commands manually.

Start the backend:

```bash
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`.

### Frontend

```bash
cd frontend
npm install
```

Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

Start the dev server:

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

---

## Deployment

### Vercel (frontend)

1. Connect your repository to Vercel and set the root directory to `frontend`.
2. Add the following environment variables in the Vercel dashboard:
   - `NEXT_PUBLIC_API_URL` — your Render backend URL
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
3. Every push to `main` triggers an automatic redeploy.

### Render (backend)

1. Connect your repository to Render and set the root directory to `backend`.
2. Set the build command to `pip install -r requirements.txt` and the start command to `uvicorn main:app --host 0.0.0.0 --port $PORT`.
3. Add the following environment variables in the Render dashboard:
   - `DATABASE_URL`
   - `GEMINI_API_KEY`
   - `CLERK_PEM_PUBLIC_KEY`
   - `ENVIRONMENT=production`
   - `ALLOWED_ORIGINS=https://ai-bookmark-vault.vercel.app`
4. Every push to `main` triggers an automatic redeploy.

The `ALLOWED_ORIGINS` variable is a comma-separated list of allowed CORS origins. In production, the backend automatically strips any localhost entries from this list even if they are accidentally included.

---

## Bookmarklet

The sidebar contains a draggable link labeled "Drag to Bookmark Bar". Once dragged to your browser's bookmarks bar, clicking it on any webpage opens a small popup that saves the current page to your vault without leaving the site. The popup authenticates using the same Clerk session as the main app, so no extra login is required.

When the popup successfully saves a bookmark, it broadcasts a sync event via the browser's BroadcastChannel API. The main app tab listens for this event and immediately refreshes the bookmark list, so the new entry appears without a manual reload.

---

## How search works

Searching runs two queries in parallel and merges the results.

The first pass does lexical matching against title, URL, summary, category, and tags using PostgreSQL ILIKE. This catches exact keyword hits precisely and quickly.

The second pass generates a vector embedding of the search query using the same Gemini model used during ingestion, then queries the pgvector HNSW index for bookmarks whose stored embeddings are within a cosine distance of 0.45. This catches conceptually related results even when no keywords match.

Lexical matches are returned first in the combined list, followed by semantic-only results.

---

## How RAG chat works

When you send a message in the chat panel, the backend:

1. Embeds the query using Gemini.
2. Retrieves up to 5 bookmarks from the database whose vector embeddings are within a cosine distance of 0.65 from the query.
3. Injects the titles, URLs, and summaries of those bookmarks as context into a Gemini prompt.
4. Returns the model's response along with the source bookmarks, which are rendered as inline citation links in the chat UI.

The model is instructed to answer only from the provided context. If no relevant bookmarks are found within the distance threshold, the endpoint returns an early response telling you there was nothing relevant in your vault.

---

## Security notes

- JWT verification uses RS256 with Clerk's public key. Setting `CLERK_BYPASS_VERIFICATION=true` while `ENVIRONMENT` starts with "prod" causes a hard crash at startup, so the bypass can never reach production accidentally.
- All outbound scraping requests pass through an SSRF check that resolves the hostname via DNS and rejects any address in a private, loopback, link-local, or reserved IP range.
- URL inputs on both the frontend and backend validate that the scheme is strictly `http` or `https`. Schemes like `javascript:`, `data:`, and `file:` are rejected.
- All database queries are scoped to the authenticated user's ID. There is no way to read or modify another user's bookmarks through the API.
- CORS is configured with an explicit origin allowlist. In production mode, localhost and loopback entries are stripped from the list automatically.

---

## Author

Madhav Dalvi

GitHub: [madhav336](https://github.com/madhav336)
