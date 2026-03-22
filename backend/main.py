from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.chroma_client import get_collection
from routers import query, upload

FRONTEND_ORIGIN = "http://localhost:3000"


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Initialize shared app resources before serving requests."""
    get_collection()
    yield


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api/upload", tags=["upload"])
app.include_router(query.router, prefix="/api/query", tags=["query"])


@app.get("/")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
