"""Plain text and Markdown extractor."""
from extractors.base import ExtractedContent, ExtractionError


def extract_text(data: bytes, file_name: str) -> ExtractedContent:
    # Decode tolerantly — user text files come in many encodings.
    try:
        content = data.decode("utf-8")
    except UnicodeDecodeError:
        content = data.decode("utf-8", errors="replace")

    content = content.strip()
    if not content:
        raise ExtractionError("This file is empty, so there's nothing to save.")

    # Title: first non-empty line (strip a leading Markdown heading marker),
    # falling back to the filename.
    title = ""
    for line in content.splitlines():
        line = line.strip()
        if line:
            title = line.lstrip("#").strip()
            break
    if not title:
        title = file_name

    return ExtractedContent(title=title[:300], text=content)
