"""Extractor registry — maps a source type to how its text is obtained.

URL extraction is async (network); file extraction is sync/CPU (parsing) and is
run in a thread executor by the caller so it never blocks the event loop.
"""
from models.bookmark import SourceType
from extractors.base import ExtractedContent, ExtractionError
from extractors.url_extractor import extract_url
from extractors.text_extractor import extract_text
from extractors.pdf_extractor import extract_pdf
from extractors.docx_extractor import extract_docx

# Allowed upload extensions → source type. URLs are handled separately.
UPLOAD_EXTENSIONS = {
    ".pdf": SourceType.PDF,
    ".txt": SourceType.TXT,
    ".md": SourceType.MD,
    ".markdown": SourceType.MD,
    ".docx": SourceType.DOCX,
}

# Human-facing list for error messages / UI.
SUPPORTED_UPLOAD_LABEL = "PDF, TXT, Markdown, or Word (.docx)"


def source_type_for_filename(file_name: str) -> SourceType | None:
    lower = (file_name or "").lower()
    for ext, st in UPLOAD_EXTENSIONS.items():
        if lower.endswith(ext):
            return st
    return None


def extract_file(source_type: SourceType, data: bytes, file_name: str) -> ExtractedContent:
    """Synchronous file extraction — call inside run_in_executor."""
    if source_type == SourceType.PDF:
        return extract_pdf(data, file_name)
    if source_type in (SourceType.TXT, SourceType.MD):
        return extract_text(data, file_name)
    if source_type == SourceType.DOCX:
        return extract_docx(data, file_name)
    raise ExtractionError("Unsupported file type.")


__all__ = [
    "ExtractedContent",
    "ExtractionError",
    "extract_url",
    "extract_file",
    "source_type_for_filename",
    "UPLOAD_EXTENSIONS",
    "SUPPORTED_UPLOAD_LABEL",
]
