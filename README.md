# RAG Notes Assistant Backend

A FastAPI backend for uploading lecture-note PDFs, chunking and storing them in ChromaDB, and answering questions with Gemini using source-grounded context.

## Features

- PDF upload endpoint with background embedding
- ChromaDB persistent vector storage
- Retrieval endpoint with streamed Gemini responses
- Source-aware answers with inline citation guidance
- Document listing endpoint for stored notes

## Project Structure

- `backend/main.py`: FastAPI app setup and router mounting
- `backend/routers/upload.py`: Upload and ingestion trigger endpoint
- `backend/routers/query.py`: Query and documents endpoints
- `backend/services/ingestion.py`: PDF extraction, chunking, embedding, upsert
- `backend/services/retriever.py`: Query embedding + vector retrieval
- `backend/services/generator.py`: Prompting + Gemini answer generation
- `backend/db/chroma_client.py`: Chroma PersistentClient + collection access

## Prerequisites

- Python 3.11+
- A valid Google API key for Gemini and embeddings

## Environment Setup

1. Create and activate a virtual environment:

```bash
python -m venv .venv
# Windows PowerShell
.venv\Scripts\Activate.ps1
# Windows CMD
.venv\Scripts\activate.bat
```

2. Install dependencies:

```bash
.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
```

3. Configure environment variables:

```bash
copy .env.example .env
```

Then set `GOOGLE_API_KEY` in `.env`.

## Run the Backend

```bash
cd backend
..\.venv\Scripts\python.exe -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## API Endpoints

- `GET /` health check
- `POST /api/upload` upload a PDF file
- `POST /api/query` stream an answer for a question
- `GET /api/documents` list unique document names in Chroma

## Notes

- Chroma data is stored in `backend/chroma_store`.
- Upload processing is split into extraction/chunking (request thread) and embedding/upsert (background task) to keep uploads responsive.
