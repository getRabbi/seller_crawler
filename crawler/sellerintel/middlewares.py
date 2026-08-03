from __future__ import annotations

from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

from scrapy.crawler import Crawler
from scrapy.http import HtmlResponse, Request, Response, TextResponse


class FixtureOfficialSiteMiddleware:
    """Serve sanitized official-site fixtures without opening a network connection."""

    def __init__(self, crawler: Crawler) -> None:
        self._crawler = crawler

    @classmethod
    def from_crawler(cls, crawler: Crawler) -> FixtureOfficialSiteMiddleware:
        return cls(crawler)

    def process_request(self, request: Request) -> Response | None:
        spider: Any = self._crawler.spider
        fixture_dir: Path | None = getattr(spider, "fixture_dir", None)
        if fixture_dir is None:
            return None

        parsed = urlparse(request.url)
        path = unquote(parsed.path)
        if path == "/robots.txt":
            return TextResponse(
                request.url,
                status=200,
                body=b"User-agent: *\nAllow: /\n",
                encoding="utf-8",
                request=request,
            )

        fixture_path = _fixture_path(fixture_dir, path)
        if fixture_path is None or not fixture_path.is_file():
            return HtmlResponse(
                request.url,
                status=404,
                body=b"<html><title>Not found</title></html>",
                encoding="utf-8",
                request=request,
            )

        body = fixture_path.read_bytes()
        response_type = TextResponse if fixture_path.suffix.lower() == ".xml" else HtmlResponse
        return response_type(
            request.url,
            status=200,
            body=body,
            encoding="utf-8",
            request=request,
        )


def _fixture_path(fixture_dir: Path, path: str) -> Path | None:
    if path == "/":
        relative = Path("index.html")
    elif path == "/sitemap.xml":
        relative = Path("sitemap.xml")
    else:
        relative = Path(path.lstrip("/")).with_suffix(".html")
    candidate = (fixture_dir / relative).resolve()
    try:
        candidate.relative_to(fixture_dir.resolve())
    except ValueError:
        return None
    return candidate
