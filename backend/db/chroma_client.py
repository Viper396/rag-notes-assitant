import chromadb
from chromadb.api.models.Collection import Collection

_client = chromadb.PersistentClient(path="./chroma_store")
_collection = _client.get_or_create_collection(
    name="lecture_notes",
    metadata={"hnsw:space": "cosine"},
)


def get_collection() -> Collection:
    return _collection
