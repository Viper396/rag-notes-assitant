import chromadb
from chromadb.api.models.Collection import Collection

CHROMA_PATH = "./chroma_store"
COLLECTION_NAME = "lecture_notes"
COLLECTION_METADATA = {"hnsw:space": "cosine"}

_client: chromadb.PersistentClient | None = None
_collection: Collection | None = None


def _ensure_collection() -> Collection:
    global _client, _collection

    if _collection is not None:
        return _collection

    _client = chromadb.PersistentClient(path=CHROMA_PATH)
    _collection = _client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata=COLLECTION_METADATA,
    )
    return _collection


def get_collection() -> Collection:
    """Return the shared Chroma collection instance."""
    return _ensure_collection()
