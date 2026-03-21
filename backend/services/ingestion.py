from __future__ import annotations

import os
from io import BytesIO
from typing import Any

from dotenv import load_dotenv
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from pypdf import PdfReader

load_dotenv()


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


def embed_and_store(chunks: list[dict[str, Any]], collection: Any) -> None:
    if not chunks:
        return

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY is not set")

    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/text-embedding-004",
        google_api_key=api_key,
    )

    texts = [chunk["text"] for chunk in chunks]
    metadatas = [chunk["metadata"] for chunk in chunks]
    ids = [f"{meta['source']}_{meta['chunk_index']}" for meta in metadatas]

    embedded_vectors = embeddings.embed_documents(texts)

    collection.upsert(
        ids=ids,
        embeddings=embedded_vectors,
        documents=texts,
        metadatas=metadatas,
    )
