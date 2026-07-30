"""Configuración del worker de scraping (local)."""
from __future__ import annotations

import os
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

PORT = int(os.getenv("SOURCING_WORKER_PORT", "8090"))
CALLBACK_SECRET = os.getenv("SOURCING_WORKER_CALLBACK_SECRET", "local-sourcing-dev")
COOKIES_DIR = Path(os.getenv("SOURCING_COOKIES_DIR", Path(__file__).resolve().parent / "cookies"))
PLAYWRIGHT_HEADLESS = os.getenv("PLAYWRIGHT_HEADLESS", "true").lower() in ("1", "true", "yes")
MAX_CANDIDATOS_DEFAULT = int(os.getenv("SOURCING_MAX_CANDIDATOS", "30"))
ENRICH_LI_MAX = int(os.getenv("SOURCING_ENRICH_LI_MAX", "15"))

# EnrichLayer (Epic 4): ENRICHLAYER_API_KEY o ENRICHLAYER_KEY
# X-Ray (Epic 2): sitios separados por coma; SerpAPI opcional
# SERPAPI_KEY=
# XRAY_MIN_BEFORE_RELAX=8

EE_COOKIES = COOKIES_DIR / "elempleo_cookies.json"
LI_COOKIES = COOKIES_DIR / "linkedin_cookies.json"
