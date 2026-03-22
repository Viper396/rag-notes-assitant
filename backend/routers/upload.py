import logging
from typing import Any

from chromadb.api.models.Collection import Collection
from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile
from pydantic import BaseModel

from db.chroma_client import get_collection
from services.ingestion import embed_and_store, extract_pdf_chunks

router = APIRouter()
logger = logging.getLogger(__name__)
PDF_CONTENT_TYPE = "application/pdf"


class UploadResponse(BaseModel):
    message: str
    document: str
    chunks_stored: int


def _is_pdf_upload(file: UploadFile) -> bool:
    """Return True when the uploaded file is a PDF."""
    return file.content_type == PDF_CONTENT_TYPE


def _embed_and_store_task(chunks: list[dict[str, Any]], collection: Collection) -> None:
    """Run embedding/storage in the background to keep upload response fast."""
    try:
        embed_and_store(chunks, collection)
    except Exception as exc:
        # Background task failures cannot be returned in the original HTTP response.
        logger.exception("Background embedding/storage failed: %s", exc)


@router.post("", response_model=UploadResponse)
async def upload_document(background_tasks: BackgroundTasks, file: UploadFile = File(...)) -> UploadResponse:
    """Upload a PDF, extract chunks, and schedule embedding asynchronously."""
    if not _is_pdf_upload(file):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    try:
        document_name = file.filename or "document.pdf"
        file_bytes = await file.read()
        chunks = extract_pdf_chunks(file_bytes=file_bytes, document_name=document_name)

        collection = get_collection()
        background_tasks.add_task(_embed_and_store_task, chunks, collection)

        return UploadResponse(
            message="Uploaded successfully",
            document=document_name,
            chunks_stored=len(chunks),
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
