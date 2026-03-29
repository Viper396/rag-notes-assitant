# RAG Notes Assistant

Full-stack notes assistant:

- Backend: FastAPI + ChromaDB + Gemini
- Frontend: Next.js 14 (App Router) + Tailwind

The app lets you upload lecture-note PDFs, index them, and ask questions with source-cited answers.

## Project Layout

- `backend/` FastAPI API and retrieval/generation services
- `frontend/` Next.js chat interface

## Prerequisites

- Python 3.11+
- Node.js 18+
- npm 9+
- Google API key with Gemini and embedding access

## Environment Setup

1. Create Python virtual environment at repo root:

```bash
python -m venv .venv
```

2. Install backend dependencies:

```bash
.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
```

3. Create backend env file:

```bash
copy .env.example .env
```

Set `GOOGLE_API_KEY` in `.env`.

4. Install frontend dependencies:

```bash
cd frontend
npm install
```

`frontend/.env.local` is already configured for local backend access:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Required Environment Variables

Backend:

- `GOOGLE_API_KEY`: Gemini + embeddings API key
- `CHROMA_PATH` (optional): Chroma persistence path (default: `./chroma_store`)

Frontend:

- `NEXT_PUBLIC_API_URL`: backend base URL used for production rewrites

## Run Locally

Start backend (terminal 1):

```bash
cd backend
..\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Start frontend (terminal 2):

```bash
cd frontend
npm run dev
```

Open:

- Frontend: http://localhost:3000
- Backend: http://localhost:8000

## Deployment

### Render (Backend)

Config file: `backend/render.yaml`

- Free tier web service
- Build: `pip install -r requirements.txt`
- Start: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Persistent disk: mounted at `/chroma_store` (0.1GB)
- Set `GOOGLE_API_KEY` in Render dashboard environment settings

One-command deploy with Render Blueprint CLI:

```bash
render blueprint apply -f backend/render.yaml
```

### Vercel (Frontend)

Config file: `frontend/vercel.json` with API rewrite target.

Before deploy, set frontend production env var:

```bash
vercel env add NEXT_PUBLIC_API_URL production
```

Set the value to your Render backend URL, for example:

```text
https://your-render-url.onrender.com
```

One-command deploy:

```bash
cd frontend && vercel --prod
```

## API Summary

- `GET /` health check
- `POST /api/upload` upload a PDF
- `POST /api/query` stream an answer (supports optional `filter_documents` array)
- `GET /api/documents` list indexed document names

`POST /api/query` response includes:

- `answer`: streamed assistant answer text
- `sources`: source/page citations
- `follow_up_questions`: 3 suggested short follow-up questions

## Frontend Experience

- Sidebar includes a `+ Upload Notes` modal with drag-and-drop PDF upload (max 20MB)
- Upload UI includes file preview, progress bar, and success/error toasts
- Sidebar document list includes checkboxes for per-query filtering
- Each document card includes a `Summarize` action that opens a right-side summary drawer
- Chat supports Markdown assistant responses with source citation badges
- Responses stream in real time from the backend query endpoint
- Assistant responses include clickable follow-up question chips
- Sidebar has per-document `Summarize` actions opening a right-side summary drawer
- Input behavior: `Enter` sends, `Shift+Enter` inserts newline

## Implementation Notes

- Chroma persistence path: `backend/chroma_store`
- Upload flow: extract and chunk immediately, embed/store in background task
- Query flow: retrieve nearest chunks, stream Gemini answer, return source metadata
- Query filtering: when selected documents are checked in the sidebar, the frontend sends `filter_documents`; when none are selected, retrieval runs across all documents
- Summary flow: `Summarize` sends a document-scoped query and renders results in a dedicated side drawer with copy-to-clipboard
- Follow-up generation: after each answer, a second Gemini call generates 3 follow-up suggestions returned as JSON strings
- Frontend rewrites: `/api/*` points to localhost in development and `NEXT_PUBLIC_API_URL` in production
