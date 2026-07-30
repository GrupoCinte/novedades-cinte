"""Cliente EnrichLayer para perfiles LinkedIn (Epic 4)."""
from __future__ import annotations

import os
import time
from typing import Any

import httpx

_enrich_cache: dict[str, dict] = {}


def enrichlayer_configured() -> bool:
    return bool(get_enrichlayer_key())


def get_enrichlayer_key() -> str:
    return (
        os.getenv("ENRICHLAYER_API_KEY", "").strip()
        or os.getenv("ENRICHLAYER_KEY", "").strip()
    )


def _parse_experiences(data: dict) -> list[dict]:
    out = []
    for ex in (data.get("experiences") or [])[:5]:
        titulo = ex.get("title") or ""
        empresa = ex.get("company") or ""
        inicio = ex.get("starts_at") or {}
        fin = ex.get("ends_at") or {}
        anio_i = inicio.get("year", "") if isinstance(inicio, dict) else ""
        anio_f = fin.get("year", "") if isinstance(fin, dict) and fin else "Presente"
        if titulo or empresa:
            out.append(
                {
                    "titulo": titulo,
                    "empresa": empresa,
                    "inicio": str(anio_i),
                    "fin": str(anio_f),
                }
            )
    return out


def _parse_skills(data: dict) -> list[str]:
    skills = []
    for s in (data.get("accomplishment_skills") or [])[:8]:
        name = s.get("name") if isinstance(s, dict) else str(s)
        if name:
            skills.append(str(name))
    return skills


def fetch_person_profile(linkedin_url: str) -> dict[str, Any]:
    if not linkedin_url or "linkedin.com/in/" not in linkedin_url.lower():
        return {}
    if linkedin_url in _enrich_cache:
        return _enrich_cache[linkedin_url]

    key = get_enrichlayer_key()
    if not key:
        return {}

    try:
        with httpx.Client(timeout=20.0) as client:
            res = client.get(
                "https://enrichlayer.com/api/v2/person",
                params={"linkedin_profile_url": linkedin_url, "use_cache": "if-present"},
                headers={"Authorization": f"Bearer {key}"},
            )
        if res.status_code != 200:
            print(f"[enrichlayer] HTTP {res.status_code} url={linkedin_url[:60]}")
            return {}
        data = res.json()
    except Exception as exc:
        print(f"[enrichlayer] error url={linkedin_url[:60]}: {exc}")
        return {}

    email = ""
    if data.get("personal_emails"):
        email = data["personal_emails"][0]
    elif data.get("work_email"):
        email = data["work_email"]

    exp_list = _parse_experiences(data)
    skills = _parse_skills(data)
    resumen = (data.get("summary") or "")[:400]

    result = {
        "foto_url": data.get("profile_pic_url") or "",
        "email": email,
        "nombre_completo": data.get("full_name") or "",
        "cargo": data.get("occupation") or data.get("headline") or "",
        "ciudad": data.get("city") or data.get("country_full_name") or "",
        "resumen_enriquecido": resumen,
        "skills_enriquecidos": skills,
        "experiencias_detalle": exp_list,
        "conexiones": data.get("connections") or "",
    }
    _enrich_cache[linkedin_url] = result
    time.sleep(0.35)
    return result
