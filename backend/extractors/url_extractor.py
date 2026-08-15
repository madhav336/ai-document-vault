"""URL extractor — wraps the existing SSRF-safe scraper unchanged."""
from extractors.base import ExtractedContent, ExtractionError
from scraper import scrape_url


async def extract_url(url: str) -> ExtractedContent:
    scraped = await scrape_url(url)
    text = scraped.get("text") or scraped.get("description") or ""
    # scrape_url returns empty strings (not exceptions) on failure; a URL that
    # yielded nothing scrapable still enriches from title+URL, so we don't hard
    # fail here — matches the pre-existing behavior.
    return ExtractedContent(
        title=scraped.get("title", ""),
        text=text,
        description=scraped.get("description", ""),
    )
