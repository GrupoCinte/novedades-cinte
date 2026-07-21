"""Zoho Recruit — búsqueda vía API interna del backend (tokens OAuth en Node)."""
from __future__ import annotations

import httpx

from config import CALLBACK_SECRET


async def buscar_zoho(
    callback_base: str,
    job_id: str,
    criterios: dict,
    max_c: int,
    *,
    modo: str = "busqueda",
) -> tuple[list[dict], str | None]:
    """Devuelve (candidatos_api, error)."""
    base = callback_base.rstrip("/")
    headers = {
        "Content-Type": "application/json",
        "x-sourcing-worker-key": CALLBACK_SECRET or "",
    }
    payload = {
        "criterios": criterios,
        "max_candidatos": max_c,
        "modo": modo,
    }
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            res = await client.post(
                f"{base}/api/atraccion/internal/zoho/search",
                headers=headers,
                json=payload,
            )
            if res.status_code >= 400:
                return [], f"Zoho API HTTP {res.status_code}: {res.text[:300]}"
            data = res.json()
            items = data.get("candidatos") or []
            return items, data.get("error")
    except Exception as exc:
        return [], str(exc)[:480]
