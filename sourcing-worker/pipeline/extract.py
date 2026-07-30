"""Fase de extracción — Epic 3."""
from __future__ import annotations

import asyncio


async def extract_candidatos(items: list[dict]) -> list[dict]:
    if not items:
        return []
    from pipeline.extract_linkedin import enrich_linkedin_profiles

    max_li = int(__import__("os").getenv("SOURCING_EXTRACT_LI_MAX", "12"))
    return await enrich_linkedin_profiles(items, max_profiles=max_li)


def extract_candidatos_sync(items: list[dict]) -> list[dict]:
    return asyncio.run(extract_candidatos(items))
