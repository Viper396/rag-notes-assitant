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
- Chat supports Markdown assistant responses with source citation badges
- Responses stream in real time from the backend query endpoint
- Assistant responses include clickable follow-up question chips
- Input behavior: `Enter` sends, `Shift+Enter` inserts newline

## Implementation Notes

- Chroma persistence path: `backend/chroma_store`
- Upload flow: extract and chunk immediately, embed/store in background task
- Query flow: retrieve nearest chunks, stream Gemini answer, return source metadata
- Query filtering: when selected documents are checked in the sidebar, the frontend sends `filter_documents`; when none are selected, retrieval runs across all documents
- Follow-up generation: after each answer, a second Gemini call generates 3 follow-up suggestions returned as JSON strings
- Frontend dev proxy: `/api/*` rewrites to backend in development
