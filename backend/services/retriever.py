from __future__ import annotations

import os
from typing import Any, TypedDict

from chromadb.api.models.Collection import Collection
from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings

load_dotenv()

EMBEDDING_MODEL = "models/text-embedding-004"


class RetrievedChunk(TypedDict):
    text: str
    source: str | None
    page_number: int | None
    distance: float | None


def _get_google_api_key() -> str:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY is not set")
    return api_key


def _first_result_list(result: dict[str, Any], key: str) -> list[Any]:
    values = result.get(key) or [[]]
    return values[0] if values else []


def retrieve_relevant_chunks(query: str, collection: Collection, top_k: int = 5) -> list[RetrievedChunk]:
    """Retrieve top-k relevant chunks from Chroma for a query."""
    normalized_query = query.strip()
    if not normalized_query or top_k <= 0:
        return []

    try:
        if collection.count() == 0:
            return []
    except Exception:
        # If count is unavailable, continue and rely on query result checks.
        pass

    embeddings = GoogleGenerativeAIEmbeddings(
        model=EMBEDDING_MODEL,
        google_api_key=_get_google_api_key(),
    )
    query_vector = embeddings.embed_query(normalized_query)

    results = collection.query(
        query_embeddings=[query_vector],
        n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )

    documents = _first_result_list(results, "documents")
    metadatas = _first_result_list(results, "metadatas")
    distances = _first_result_list(results, "distances")

    if not documents:
        return []

    retrieved_chunks: list[RetrievedChunk] = []
    for idx, text in enumerate(documents):
        metadata = metadatas[idx] if idx < len(metadatas) and metadatas[idx] else {}
        distance = distances[idx] if idx < len(distances) else None

        retrieved_chunks.append(
            {
                "text": text,
                "source": metadata.get("source"),
                "page_number": metadata.get("page_number"),
                "distance": distance,
            }
        )

    return retrieved_chunks
