"""Split extracted document text into overlapping chunks for embedding.

Tokens are approximated by characters (~4 chars/token) since Gemini's tokenizer
isn't available locally. Overlap preserves meaning across chunk boundaries.
Page-aware when the extractor supplies per-page text (enables page citations).
"""
import os
from dataclasses import dataclass

CHUNK_SIZE_CHARS = int(os.getenv("CHUNK_SIZE_TOKENS", "800")) * 4
CHUNK_OVERLAP_CHARS = int(os.getenv("CHUNK_OVERLAP", "100")) * 4
MAX_CHUNKS_PER_DOC = int(os.getenv("MAX_CHUNKS_PER_DOC", "200"))


@dataclass
class TextChunk:
    index: int
    content: str
    page_number: int | None = None


def _split_text(text: str, size: int, overlap: int) -> list[str]:
    text = text.strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]

    chunks: list[str] = []
    start = 0
    step = max(1, size - overlap)
    while start < len(text):
        chunk = text[start:start + size].strip()
        if chunk:
            chunks.append(chunk)
        start += step
    return chunks


def chunk_pages(pages: list[tuple[int, str]]) -> tuple[list[TextChunk], bool]:
    """Chunk page-by-page so each chunk carries its page number.
    Returns (chunks, truncated)."""
    chunks: list[TextChunk] = []
    idx = 0
    for page_number, page_text in pages:
        for piece in _split_text(page_text, CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS):
            chunks.append(TextChunk(index=idx, content=piece, page_number=page_number))
            idx += 1
    return _cap(chunks)


def chunk_text(text: str) -> tuple[list[TextChunk], bool]:
    """Chunk flat text with no page information. Returns (chunks, truncated)."""
    chunks = [
        TextChunk(index=i, content=piece, page_number=None)
        for i, piece in enumerate(_split_text(text, CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS))
    ]
    return _cap(chunks)


def _cap(chunks: list[TextChunk]) -> tuple[list[TextChunk], bool]:
    if len(chunks) > MAX_CHUNKS_PER_DOC:
        return chunks[:MAX_CHUNKS_PER_DOC], True
    return chunks, False
