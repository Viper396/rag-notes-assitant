from __future__ import annotations

from io import BytesIO
from typing import Any

from langchain.text_splitter import RecursiveCharacterTextSplitter
from pypdf import PdfReader


def extract_pdf_chunks(file_bytes: bytes, document_name: str) -> list[dict[str, Any]]:
    """Extract text from a PDF and return chunked text with metadata."""
    reader = PdfReader(BytesIO(file_bytes))
    splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=100)

    chunks: list[dict[str, Any]] = []

    for page_idx, page in enumerate(reader.pages, start=1):
        page_text = page.extract_text() or ""
        if not page_text.strip():
            continue

        page_chunks = splitter.split_text(page_text)
        for chunk_idx, chunk_text in enumerate(page_chunks):
            chunks.append(
                {
                    "text": chunk_text,
                    "metadata": {
                        "source": document_name,
                        "page_number": page_idx,
                        "chunk_index": chunk_idx,
                    },
                }
            )

    return chunks
