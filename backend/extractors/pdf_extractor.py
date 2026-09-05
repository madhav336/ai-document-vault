"""PDF extractor — text + per-page content + page count, with clear failures
for encrypted and image-only (scanned) PDFs."""
import io

from pypdf import PdfReader
from pypdf.errors import PdfReadError

from extractors.base import ExtractedContent, ExtractionError

# Below this much extractable text a PDF is treated as unreadable (scanned or
# image-only) rather than enriched from a handful of stray characters.
MIN_USABLE_CHARS = 200


def extract_pdf(data: bytes, file_name: str) -> ExtractedContent:
    try:
        reader = PdfReader(io.BytesIO(data))
    except (PdfReadError, Exception) as e:
        raise ExtractionError("This file doesn't look like a valid PDF, so it can't be read.") from e

    if reader.is_encrypted:
        # Try an empty-password unlock (some PDFs are "encrypted" with no password).
        try:
            if reader.decrypt("") == 0:
                raise ExtractionError("This PDF is password-protected, so its text can't be read.")
        except ExtractionError:
            raise
        except Exception as e:
            raise ExtractionError("This PDF is password-protected, so its text can't be read.") from e

    pages: list[tuple[int, str]] = []
    for i, page in enumerate(reader.pages, start=1):
        try:
            page_text = page.extract_text() or ""
        except Exception:
            page_text = ""
        cleaned = " ".join(page_text.split())
        if cleaned:
            pages.append((i, cleaned))

    page_count = len(reader.pages)

    full_text = "\n\n".join(text for _, text in pages)

    # A scanned PDF often still carries a few stray characters from an OCR layer
    # or a text watermark, so "no pages at all" is too weak a test — require
    # enough text to actually be worth summarizing and embedding.
    if len(full_text.strip()) < MIN_USABLE_CHARS:
        raise ExtractionError(
            "No readable text was found in this PDF — it may be a scanned or image-only document."
        )

    # PDF metadata title if present, else filename.
    title = ""
    try:
        if reader.metadata and reader.metadata.title:
            title = str(reader.metadata.title).strip()
    except Exception:
        title = ""
    if not title:
        title = file_name

    return ExtractedContent(title=title[:300], text=full_text, pages=pages, page_count=page_count)
