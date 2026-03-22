from __future__ import annotations

import os
from io import BytesIO
from typing import Any, TypedDict

from dotenv import load_dotenv
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from pypdf import PdfReader

load_dotenv()

EMBEDDING_MODEL = "models/text-embedding-004"
CHUNK_SIZE = 800
CHUNK_OVERLAP = 100


class ChunkMetadata(TypedDict):
    source: str
    page_number: int
    chunk_index: int


class ChunkRecord(TypedDict):
    text: str
    metadata: ChunkMetadata


def _get_google_api_key() -> str:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY is not set")
    return api_key


def _create_embeddings_client() -> GoogleGenerativeAIEmbeddings:
    return GoogleGenerativeAIEmbeddings(
        model=EMBEDDING_MODEL,
        google_api_key=_get_google_api_key(),
    )


def _build_chunk_id(metadata: ChunkMetadata) -> str:
    # ID format intentionally follows project requirement.
    return f"{metadata['source']}_{metadata['chunk_index']}"


def extract_pdf_chunks(file_bytes: bytes, document_name: str) -> list[ChunkRecord]:
    """Extract text from a PDF and return chunked text with metadata."""
    reader = PdfReader(BytesIO(file_bytes))
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
    )

    chunks: list[ChunkRecord] = []

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


def embed_and_store(chunks: list[ChunkRecord], collection: Any) -> None:
    if not chunks:
        return

    embeddings = _create_embeddings_client()

    texts = [chunk["text"] for chunk in chunks]
    metadatas = [chunk["metadata"] for chunk in chunks]
    ids = [_build_chunk_id(meta) for meta in metadatas]

    embedded_vectors = embeddings.embed_documents(texts)

    collection.upsert(
        ids=ids,
        embeddings=embedded_vectors,
        documents=texts,
        metadatas=metadatas,
    )
