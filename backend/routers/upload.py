from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile

from db.chroma_client import get_collection
from services.ingestion import embed_and_store, extract_pdf_chunks

router = APIRouter()


def _embed_and_store_task(chunks: list[dict], collection) -> None:
    try:
        embed_and_store(chunks, collection)
    except Exception as exc:
        # Background task failures cannot be returned in the original HTTP response.
        print(f"Background embedding/storage failed: {exc}")


@router.post("")
async def upload_document(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    try:
        file_bytes = await file.read()
        chunks = extract_pdf_chunks(file_bytes=file_bytes, document_name=file.filename or "document.pdf")

        collection = get_collection()
        background_tasks.add_task(_embed_and_store_task, chunks, collection)

        return {
            "message": "Uploaded successfully",
            "document": file.filename,
            "chunks_stored": len(chunks),
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
