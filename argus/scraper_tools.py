import os
import json
import re
import urllib.request
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any

def fetch_url(url: str, timeout: int = 15) -> str:
    """Fetches text content from a URL with standard user agent headers."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; AINewsTracker/1.0; +https://cloud.google.com)"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"[Scraper] Warning: Failed to fetch {url}: {e}")
        return ""

def parse_rss_xml(xml_content: str, max_items: int = 5) -> List[Dict[str, str]]:
    """Parses standard RSS or Atom XML content into structured article dicts."""
    articles = []
    if not xml_content:
        return articles

    try:
        root = ET.fromstring(xml_content)
        # Handle Atom xmlns if present
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        
        # Check standard RSS items first
        items = root.findall(".//item")
        if not items:
            # Check Atom entries
            items = root.findall(".//atom:entry", ns)
            if not items:
                items = root.findall(".//entry")

        for item in items[:max_items]:
            title_elem = None
            link_elem = None
            date_elem = None
            desc_elem = None
            
            for child in item:
                tag_name = child.tag.split("}")[-1].lower()
                if tag_name == "title" and not title_elem:
                    title_elem = child
                elif tag_name in ["link", "href"] and not link_elem:
                    link_elem = child
                elif tag_name in ["pubdate", "published", "updated", "date"] and not date_elem:
                    date_elem = child
                elif tag_name in ["description", "summary", "content", "encoded"] and not desc_elem:
                    desc_elem = child

            title = title_elem.text.strip() if title_elem is not None and title_elem.text else "Untitled"
            
            # Extract link href if it's an Atom link attribute
            link = ""
            if link_elem is not None:
                link = link_elem.text.strip() if link_elem.text else link_elem.attrib.get("href", "")

            date = date_elem.text.strip() if date_elem is not None and date_elem.text else "Unknown Date"
            desc = desc_elem.text.strip() if desc_elem is not None and desc_elem.text else ""
            
            # Strip basic HTML tags from description for clean LLM consumption
            clean_desc = re.sub(r"<[^>]+>", " ", desc).strip()
            clean_desc = re.sub(r"\s+", " ", clean_desc)[:1000] # Cap at 1000 chars per article

            articles.append({
                "title": title,
                "link": link,
                "date": date,
                "summary": clean_desc
            })
    except Exception as e:
        print(f"[Scraper] Warning: XML parsing error: {e}")
    
    return articles

def parse_html_fallback(html_content: str, max_items: int = 5) -> List[Dict[str, str]]:
    """Simple regex/string fallback to extract major article headings and links from HTML news pages."""
    articles = []
    if not html_content:
        return articles

    # Find links with descriptive text (like headlines)
    links = re.findall(r"<a[^>]+href=[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", html_content, re.IGNORECASE | re.DOTALL)
    for href, content in links:
        clean_title = re.sub(r"<[^>]+>", " ", content).strip()
        clean_title = re.sub(r"\s+", " ", clean_title)
        if len(clean_title) > 20 and len(clean_title) < 150 and clean_title not in [a["title"] for a in articles]:
            if not href.startswith("http"):
                continue
            articles.append({
                "title": clean_title,
                "link": href,
                "date": datetime.now().strftime("%Y-%m-%d"),
                "summary": f"Headline extracted from page HTML: {clean_title}"
            })
            if len(articles) >= max_items:
                break

    # If we didn't find good link headlines, fall back to H1/H2 tags
    if not articles:
        headings = re.findall(r"<(h[123])[^>]*>(.*?)</\1>", html_content, re.IGNORECASE | re.DOTALL)
        for tag, content in headings[:max_items * 2]:
            clean_title = re.sub(r"<[^>]+>", " ", content).strip()
            clean_title = re.sub(r"\s+", " ", clean_title)
            if len(clean_title) > 15 and clean_title not in [a["title"] for a in articles]:
                articles.append({
                    "title": clean_title,
                    "link": "",
                    "date": datetime.now().strftime("%Y-%m-%d"),
                    "summary": f"Headline extracted from page HTML: {clean_title}"
                })
                if len(articles) >= max_items:
                    break
    return articles

def scrape_target(target: Dict[str, Any], max_items: int = 5) -> List[Dict[str, str]]:
    """Scrapes a target feed or page and returns structured articles."""
    url = target.get("url", "")
    feed_type = target.get("type", "rss")
    print(f"[Scraper] Fetching {target.get('name')} ({url})...")
    
    content = fetch_url(url)
    if not content:
        return []

    if feed_type == "rss":
        articles = parse_rss_xml(content, max_items=max_items)
        if not articles:
            # Fallback to HTML if XML parsing failed or was empty
            articles = parse_html_fallback(content, max_items=max_items)
    else:
        articles = parse_html_fallback(content, max_items=max_items)

    return articles

def save_raw_scrape(feed_name: str, articles: List[Dict[str, str]], base_dir: Path) -> Path:
    """Saves raw scraped articles to disk for auditability and checkpoint resumption."""
    scrapes_dir = base_dir / "scrapes"
    scrapes_dir.mkdir(parents=True, exist_ok=True)
    
    safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", feed_name.lower())
    timestamp = datetime.now().strftime("%Y%m%d")
    filepath = scrapes_dir / f"raw_{safe_name}_{timestamp}.json"
    
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump({"feed_name": feed_name, "scraped_at": datetime.now().isoformat(), "articles": articles}, f, indent=2)
        
    return filepath
