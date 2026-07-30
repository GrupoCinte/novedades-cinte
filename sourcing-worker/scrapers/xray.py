"""X-Ray multi-sitio: DuckDuckGo + SerpAPI fallback."""
from __future__ import annotations

import os
import time
from datetime import datetime
from urllib.parse import urlparse

from ddgs import DDGS

from scrapers.serpapi_search import buscar_serpapi, serpapi_available
from scrapers.criterios_mapper import normalize_criterios, xray_skills, xray_variantes

# Solo sitios de PERFILES de persona. Se excluye computrabajo.com.co porque su
# contenido público indexable son ofertas de empleo, no perfiles de candidatos.
DEFAULT_SITES = [
    "linkedin.com/in",
    "co.linkedin.com/in",
    "github.com",
]

# Rutas de GitHub que NO son perfiles de persona (orgs, repos y páginas de sistema).
GITHUB_RESERVED = {
    "orgs", "topics", "search", "marketplace", "collections", "sponsors",
    "about", "pricing", "features", "enterprise", "login", "join", "explore",
    "notifications", "settings", "apps", "team", "customer-stories", "readme",
    "trending", "events", "security", "site", "contact", "nonprofit",
    "education", "git-guides", "mobile", "issues", "pulls", "codespaces",
    "new", "organizations", "dashboard", "stars", "watching",
}

# Patrones que delatan una OFERTA/aviso de empleo (no una persona).
JOB_URL_PATTERNS = (
    "/jobs", "/job/", "/ofertas", "/oferta", "/vacante", "/vacantes",
    "/empleo", "/empleos", "/trabajo", "/trabajos", "/careers", "/carreras",
    "/hiring", "/postula", "/aviso", "/reclutamiento",
)
JOB_TEXT_PATTERNS = (
    "postúlate", "postulate", "postular", "aplica ya", "oferta de empleo",
    "oferta laboral", "buscamos", "estamos buscando", "únete a", "unete a",
    "requisitos del cargo", "salario a convenir", "envía tu hoja de vida",
    "aplicar a este empleo", "convocatoria", "empleos en",
)

TRADUCCIONES = {
    "desarrollador": "developer",
    "programador": "programmer",
    "ingeniero": "engineer",
    "analista": "analyst",
    "arquitecto": "architect",
    "líder": "lead",
    "gerente": "manager",
}


def _sites_config() -> list[str]:
    raw = os.getenv("XRAY_SITES", "").strip()
    if not raw:
        return DEFAULT_SITES
    return [s.strip() for s in raw.split(",") if s.strip()]


def _normalize_candidate(raw: dict, fuente: str, ciudad: str, skills: list[str]) -> dict:
    return {
        "fuente": fuente,
        "nombre": raw.get("nombre") or "",
        "url_perfil": raw.get("url") or raw.get("url_perfil") or "",
        "perfil": {
            "cargo": raw.get("cargo") or "",
            "ciudad": raw.get("ciudad") or ciudad or "",
            "experiencia": raw.get("experiencia") or "",
            "email": raw.get("email") or "",
            "telefono": raw.get("telefono") or "",
            "skills": skills,
            "snippet": raw.get("snippet") or "",
            "motor_busqueda": raw.get("motor_busqueda") or "ddg",
            "fecha_encontrado": datetime.now().isoformat(timespec="seconds"),
        },
    }


def _fuente_from_url(url: str) -> str:
    u = url.lower()
    if "linkedin.com/in/" in u:
        return "LinkedIn (X-Ray)"
    if "github.com/" in u:
        return "GitHub (X-Ray)"
    if "computrabajo.com" in u:
        return "CompuTrabajo (X-Ray)"
    return "X-Ray"


def _build_query(sitio: str, variante: str, ciudad: str, skills: list[str] | None, strict_skills: bool) -> str:
    cargo_q = f'"{variante}"' if " " in variante else variante
    q = f"site:{sitio} {cargo_q}"
    if skills and strict_skills:
        parts = [f'"{s}"' if " " in s else s for s in skills[:3]]
        q += " (" + " OR ".join(parts) + ")" if len(parts) > 1 else " " + parts[0]
    q += f' "{ciudad}" Colombia' if ciudad else " Colombia -site:linkedin.com/in/ar"
    q += " -inurl:jobs -inurl:job -inurl:ofertas -inurl:oferta -inurl:vacantes -inurl:vacante"
    q += " -inurl:empleo -inurl:empleos -inurl:trabajo -inurl:careers -inurl:hiring"
    return q


def _is_person_url(url: str) -> bool:
    """True solo si la URL apunta a un PERFIL de persona (no repo/org/oferta)."""
    u = (url or "").lower()
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    host = (parsed.netloc or "").lower()
    segs = [s for s in (parsed.path or "").split("/") if s]
    if "linkedin.com" in host:
        return "/in/" in u
    if "github.com" in host:
        # Perfil de persona = exactamente un segmento no reservado (github.com/<user>).
        # Repos (user/repo), orgs y páginas de sistema quedan fuera.
        if len(segs) != 1:
            return False
        return segs[0].lower() not in GITHUB_RESERVED
    return True


def _looks_like_job(titulo: str, snippet: str, url: str) -> bool:
    u = (url or "").lower()
    if any(p in u for p in JOB_URL_PATTERNS):
        return True
    texto = f"{titulo} {snippet}".lower()
    return any(p in texto for p in JOB_TEXT_PATTERNS)


def _parse_result_item(titulo: str, url: str, snippet: str, ciudad: str, skills: list[str], strict_skills: bool) -> dict | None:
    if not url or not titulo:
        return None
    if _looks_like_job(titulo, snippet, url):
        return None
    if not _is_person_url(url):
        return None
    nombre = titulo.split(" - ")[0].split(" | ")[0].strip()
    if not nombre or len(nombre) < 2:
        return None
    if skills and strict_skills:
        texto = (snippet + titulo).lower()
        if not any(s.lower() in texto for s in skills):
            return None
    return {
        "nombre": nombre,
        "cargo": snippet[:200],
        "ciudad": ciudad,
        "url": url,
        "snippet": snippet,
    }


def _search_motors(query: str, max_results: int, use_serpapi: bool) -> list[dict]:
    resultados: list[dict] = []
    try:
        with DDGS() as ddgs:
            for item in ddgs.text(query, max_results=max_results):
                resultados.append(
                    {
                        "title": item.get("title", ""),
                        "href": item.get("href", ""),
                        "body": item.get("body", ""),
                        "motor_busqueda": "ddg",
                    }
                )
    except Exception as exc:
        print(f"[xray] ddg error: {exc}")

    if len(resultados) < 3 and use_serpapi and serpapi_available():
        for item in buscar_serpapi(query, max_results=max_results):
            item["motor_busqueda"] = "serpapi"
            href = item.get("href") or item.get("link") or ""
            if href and not any(r.get("href") == href for r in resultados):
                resultados.append(item)
    return resultados


def buscar_xray(criterios: dict, max_c: int) -> list[dict]:
    norm = normalize_criterios(criterios)
    cargo = norm["cargo"]
    ciudad = norm["ciudad"]
    skills = xray_skills(norm)
    variantes = xray_variantes(norm)
    sitios = _sites_config()
    candidatos: list[dict] = []
    cargo_lower = (cargo or "").lower()
    for esp, eng in TRADUCCIONES.items():
        if esp in cargo_lower:
            alt = cargo_lower.replace(esp, eng)
            if alt not in [v.lower() for v in variantes]:
                variantes.append(alt)
            break

    min_relax = int(os.getenv("XRAY_MIN_BEFORE_RELAX", "8"))
    use_serpapi = serpapi_available()
    max_por_sitio = max(8, max_c // max(len(sitios), 1))

    for strict_skills in (True, False):
        if len(candidatos) >= max_c:
            break
        if not strict_skills and len(candidatos) >= min_relax:
            break

        for sitio in sitios:
            if len(candidatos) >= max_c:
                break
            cands_sitio = [x for x in candidatos if sitio.split("/")[0] in (x.get("url_perfil") or "")]
            if len(cands_sitio) >= max_por_sitio:
                continue

            for variante in variantes:
                if len(candidatos) >= max_c:
                    break
                cands_sitio = [x for x in candidatos if sitio.split("/")[0] in (x.get("url_perfil") or "")]
                if len(cands_sitio) >= max_por_sitio:
                    break

                q = _build_query(sitio, variante, ciudad, skills, strict_skills)
                resultados = _search_motors(q, 25, use_serpapi)

                for item in resultados:
                    if len(candidatos) >= max_c:
                        break
                    titulo = item.get("title", "")
                    url = item.get("href", "")
                    snippet = item.get("body", "")
                    parsed = _parse_result_item(titulo, url, snippet, ciudad, skills, strict_skills)
                    if not parsed:
                        continue
                    if any((c.get("url_perfil") or "") == url for c in candidatos):
                        continue
                    cands_now = [x for x in candidatos if sitio.split("/")[0] in (x.get("url_perfil") or "")]
                    if len(cands_now) >= max_por_sitio:
                        continue
                    parsed["motor_busqueda"] = item.get("motor_busqueda", "ddg")
                    candidatos.append(
                        _normalize_candidate(parsed, _fuente_from_url(url), ciudad, skills)
                    )

                time.sleep(1 if strict_skills else 0.5)

    return candidatos
