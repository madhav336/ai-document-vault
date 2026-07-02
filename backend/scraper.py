import logging
import socket
import ipaddress
import asyncio
from urllib.parse import urlparse
from bs4 import BeautifulSoup
import httpx

logger = logging.getLogger("scraper")

# Standard browser headers (Accept-Encoding omitted to let httpx handle decompression safely)
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
}

async def is_safe_url(url: str) -> bool:
    """
    Validates a URL to prevent SSRF (Server-Side Request Forgery).
    Ensures the URL resolves only to public, non-reserved IP addresses.
    Runs blocking DNS queries in a background thread executor.
    """
    try:
        parsed = urlparse(url)
        if not parsed.scheme or parsed.scheme.lower() not in ["http", "https"]:
            return False
        hostname = parsed.hostname
        if not hostname:
            return False
        
        # Run blocking socket lookup in default thread executor
        loop = asyncio.get_running_loop()
        addr_info = await loop.run_in_executor(
            None, 
            lambda: socket.getaddrinfo(hostname, None)
        )
        
        for family, socktype, proto, canonname, sockaddr in addr_info:
            ip_str = sockaddr[0]
            ip = ipaddress.ip_address(ip_str)
            # Block private, loopback, link-local, unspecified, and reserved IPs
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_unspecified:
                return False
        return True
    except Exception:
        return False

async def scrape_url(url: str) -> dict:
    """
    Downloads and parses a webpage to extract content for AI metadata generation.
    Returns:
        dict: {"title": str, "text": str, "description": str}
    """
    result = {"title": "", "text": "", "description": ""}
    
    # SSRF Prevention Check
    if not await is_safe_url(url):
        logger.warning(f"Blocked unsafe/private scraping request: {url}")
        return result

    try:
        async with httpx.AsyncClient() as client:
            # Stream the request chunk-by-chunk to prevent OOM from compression/gzip bombs
            async with client.stream("GET", url, headers=BROWSER_HEADERS, timeout=10, follow_redirects=True) as resp:
                if not resp.is_success:
                    return result
                
                content_type = resp.headers.get("Content-Type", "").lower()
                content_length_str = resp.headers.get("Content-Length", "0")
                try:
                    content_length = int(content_length_str)
                except ValueError:
                    content_length = 0

                # Early check: reject if header specifies > 1MB
                if content_length > 1024 * 1024:
                    logger.warning(f"Skipping large resource: {url} (Content-Length: {content_length})")
                    return result

                # Validate content type is a text-based/HTML resource
                if content_type and not any(t in content_type for t in ["text/html", "application/xhtml+xml", "text/plain", "application/xml"]):
                    logger.warning(f"Skipping non-text resource: {url} (Content-Type: {content_type})")
                    return result

                chunks = []
                total_bytes = 0
                # Download raw bytes iteratively, checking size on each chunk
                async for chunk in resp.aiter_bytes(chunk_size=4096):
                    total_bytes += len(chunk)
                    if total_bytes > 1024 * 1024:  # Abort if > 1MB
                        logger.warning(f"Aborted download: resource size exceeds 1MB: {url}")
                        return result
                    chunks.append(chunk)
                
                html_content = b"".join(chunks)

        if not html_content:
            return result

        # Parse HTML elements (BeautifulSoup handles encoding detection of bytes automatically)
        soup = BeautifulSoup(html_content, "html.parser")
        
        # 1. Title extraction
        if soup.title and soup.title.string:
            result["title"] = soup.title.string.strip()
            
        # 2. OpenGraph / Meta Description extraction
        meta_desc = ""
        meta_tags = [
            {"property": "og:description"},
            {"name": "description"},
            {"name": "twitter:description"},
            {"property": "twitter:description"}
        ]
        for tag_attr in meta_tags:
            tag = soup.find("meta", attrs=tag_attr)
            if tag and tag.get("content"):
                meta_desc = tag.get("content").strip()
                break
        result["description"] = meta_desc

        # 3. Main body text extraction
        for element in soup(["script", "style", "nav", "footer", "header", "noscript"]):
            element.decompose()

        text_elements = soup.find_all(["p", "h1", "h2", "h3", "li"])
        body_text = " ".join([el.get_text().strip() for el in text_elements if el.get_text()])
        
        # Clean whitespace gaps
        clean_text = " ".join(body_text.split())
        result["text"] = clean_text[:5000]

    except Exception as e:
        logger.error(f"Error scraping {url}: {e}", exc_info=True)

    return result
