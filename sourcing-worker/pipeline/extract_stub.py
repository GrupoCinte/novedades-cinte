"""Extracción profunda — stub Epic 1; Playwright real en Epic 3."""
from __future__ import annotations


def _needs_playwright(fuente: str) -> bool:
    f = (fuente or "").lower()
    return "linkedin" in f or "x-ray" in f or "xray" in f or "github" in f


def extract_candidatos(items: list[dict]) -> list[dict]:
    out: list[dict] = []
    for raw in items:
        perfil = dict(raw.get("perfil") or {})
        fuente = raw.get("fuente") or ""
        extraccion = {
            "estado": "pendiente_epic3",
            "nota": "Extracción Playwright (cookies EE/LI) — Epic 3",
        }
        if fuente.lower().startswith("el empleo"):
            extraccion = {
                "estado": "completado_parcial",
                "nota": "Datos base desde búsqueda El Empleo",
            }
        elif not _needs_playwright(fuente):
            extraccion = {"estado": "omitido", "nota": "Fuente sin extracción adicional"}
        perfil["extraccion"] = extraccion
        perfil["pipeline_etapa"] = "extraccion"
        out.append(
            {
                **raw,
                "etapa": "extraccion",
                "enriquecido": bool(raw.get("enriquecido")),
                "perfil": perfil,
            }
        )
    return out
