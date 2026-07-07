"""Búsqueda X-Ray vía SerpAPI (fallback opcional)."""
from __future__ import annotations

import os
import time

import httpx


def serpapi_available() -> bool:
    return bool(os.getenv("SERPAPI_KEY", "").strip())


def buscar_serpapi(query: str, *, max_results: int = 25) -> list[dict]:
    key = os.getenv("SERPAPI_KEY", "").strip()
    if not key:
        return []
    try:
        with httpx.Client(timeout=30.0) as client:
            res = client.get(
                "https://serpapi.com/search",
                params={
                    "engine": "google",
                    "q": query,
                    "api_key": key,
                    "num": min(max_results, 25),
                    "gl": "co",
                    "hl": "es",
                },
            )
            if res.status_code >= 400:
                print(f"[serpapi] HTTP {res.status_code}: {res.text[:200]}")
                return []
            data = res.json()
            organic = data.get("organic_results") or []
            out = []
            for item in organic:
                out.append(
                    {
                        "title": item.get("title") or "",
                        "href": item.get("link") or "",
                        "body": item.get("snippet") or "",
                    }
                )
            time.sleep(0.5)
            return out
    except Exception as exc:
        print(f"[serpapi] error: {exc}")
        return []
