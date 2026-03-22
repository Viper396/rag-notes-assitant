from __future__ import annotations

import os
from typing import Any

from dotenv import load_dotenv
from langchain_google_genai import GoogleGenerativeAIEmbeddings

load_dotenv()


def retrieve_relevant_chunks(query: str, collection: Any, top_k: int = 5) -> list[dict[str, Any]]:
    """Retrieve top-k relevant chunks from Chroma for a query."""
    if not query.strip() or top_k <= 0:
        return []

    try:
        if collection.count() == 0:
            return []
    except Exception:
        # If count is unavailable, continue and rely on query result checks.
        pass

    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY is not set")

    embeddings = GoogleGenerativeAIEmbeddings(
        model="models/text-embedding-004",
        google_api_key=api_key,
    )
    query_vector = embeddings.embed_query(query)

    results = collection.query(
        query_embeddings=[query_vector],
        n_results=top_k,
        include=["documents", "metadatas", "distances"],
    )

    documents = (results.get("documents") or [[]])[0]
    metadatas = (results.get("metadatas") or [[]])[0]
    distances = (results.get("distances") or [[]])[0]

    if not documents:
        return []

    output: list[dict[str, Any]] = []
    for idx, text in enumerate(documents):
        metadata = metadatas[idx] if idx < len(metadatas) and metadatas[idx] else {}
        distance = distances[idx] if idx < len(distances) else None

        output.append(
            {
                "text": text,
                "source": metadata.get("source"),
                "page_number": metadata.get("page_number"),
                "distance": distance,
            }
        )

    return output
