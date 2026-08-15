"""Common interface every extractor implements, so the enrichment pipeline
doesn't care whether text came from a URL, a PDF, or a Word doc."""
from dataclasses import dataclass, field


class ExtractionError(Exception):
    """Raised when a source can't be read. `reason` is user-facing copy shown
    on the failed item — write it for a person, not a log."""

    def __init__(self, reason: str):
        self.reason = reason
        super().__init__(reason)


@dataclass
class ExtractedContent:
    title: str = ""
    text: str = ""
    # Optional per-page text as (page_number, text) for page-cited chunks (PDFs).
    pages: list[tuple[int, str]] = field(default_factory=list)
    page_count: int | None = None
    # Optional short description (e.g. a webpage meta description).
    description: str = ""
