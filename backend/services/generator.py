from __future__ import annotations

import os
from typing import Any, Iterator, Sequence, TypedDict

from dotenv import load_dotenv
from google.generativeai import GenerativeModel, configure

load_dotenv()

MODEL_NAME = "gemini-1.5-flash"
FALLBACK_MESSAGE = "I couldn't find this in your notes"


class AnswerSource(TypedDict):
    source: str
    page: int


class AnswerPayload(TypedDict):
    answer: str
    sources: list[AnswerSource]


def _get_google_api_key() -> str:
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY is not set")
    return api_key


def _create_generative_model() -> GenerativeModel:
    configure(api_key=_get_google_api_key())
    return GenerativeModel(MODEL_NAME)


def _format_context_chunks(context_chunks: list[dict[str, Any]]) -> str:
    if not context_chunks:
        return "No context chunks were provided."

    lines: list[str] = []
    for idx, chunk in enumerate(context_chunks, start=1):
        source = chunk.get("source") or "unknown"
        page_number = chunk.get("page_number")
        page_text = str(page_number) if isinstance(page_number, int) else "unknown"
        text = str(chunk.get("text") or "").strip()

        lines.append(f"{idx}. Source: {source}, Page: {page_text}")
        lines.append(f"   Content: {text}")

    return "\n".join(lines)


def _collect_sources(context_chunks: list[dict[str, Any]]) -> list[AnswerSource]:
    seen: set[tuple[str, int]] = set()
    sources: list[AnswerSource] = []

    for chunk in context_chunks:
        source = chunk.get("source")
        page = chunk.get("page_number")
        if isinstance(source, str) and isinstance(page, int):
            key = (source, page)
            if key not in seen:
                seen.add(key)
                sources.append({"source": source, "page": page})

    return sources


def build_prompt(
    query: str,
    context_chunks: list[dict[str, Any]],
    chat_history: Sequence[dict[str, str]] | None = None,
) -> str:
    context_block = _format_context_chunks(context_chunks)

    history_lines: list[str] = []
    for turn in chat_history or []:
        role = str(turn.get("role") or "user")
        content = str(turn.get("content") or "").strip()
        if content:
            history_lines.append(f"- {role}: {content}")
    history_block = "\n".join(history_lines) if history_lines else "None"

    return (
        "You are a study assistant answering questions using lecture note excerpts.\n\n"
        "Context sources:\n"
        f"{context_block}\n\n"
        "Chat history:\n"
        f"{history_block}\n\n"
        "User question:\n"
        f"{query}\n\n"
        "Instructions:\n"
        "- Use only the provided context.\n"
        "- Cite sources inline exactly in this format: [Source: filename, p.N].\n"
        "- If the context is insufficient, reply exactly with: "
        f"{FALLBACK_MESSAGE}\n"
    )


def stream_answer_tokens(
    query: str,
    context_chunks: list[dict[str, Any]],
    chat_history: Sequence[dict[str, str]] | None = None,
) -> Iterator[str]:
    """Yield Gemini-generated answer text chunks using streaming mode."""
    model = _create_generative_model()
    prompt = build_prompt(query=query, context_chunks=context_chunks, chat_history=chat_history)

    response_stream = model.generate_content(prompt, stream=True)
    yielded = False

    for chunk in response_stream:
        text = (getattr(chunk, "text", "") or "")
        if text:
            yielded = True
            yield text

    if not yielded:
        yield FALLBACK_MESSAGE


def generate_answer(
    query: str,
    context_chunks: list[dict[str, Any]],
    chat_history: Sequence[dict[str, str]] | None = None,
    stream: bool = False,
) -> AnswerPayload | Iterator[str]:
    """Generate an answer payload or stream answer tokens from Gemini."""
    if stream:
        return stream_answer_tokens(
            query=query,
            context_chunks=context_chunks,
            chat_history=chat_history,
        )

    model = _create_generative_model()
    prompt = build_prompt(query=query, context_chunks=context_chunks, chat_history=chat_history)

    response = model.generate_content(prompt)
    answer_text = (getattr(response, "text", "") or "").strip()
    if not answer_text:
        answer_text = FALLBACK_MESSAGE

    return {
        "answer": answer_text,
        "sources": _collect_sources(context_chunks),
    }
