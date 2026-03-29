from __future__ import annotations

import chromadb
from chromadb.api import ClientAPI
from chromadb.api.models.Collection import Collection

COLLECTION_NAME = "lecture_notes"
COLLECTION_METADATA = {"hnsw:space": "cosine"}

_client: ClientAPI | None = None
_collection: Collection | None = None


def _ensure_collection() -> Collection:
    global _client, _collection

    if _collection is not None:
        return _collection

    client = _client
    if client is None:
        client = chromadb.EphemeralClient()
        _client = client

    _collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata=COLLECTION_METADATA,
    )
    return _collection


def get_collection() -> Collection:
    """Return the shared Chroma collection instance."""
    return _ensure_collection()