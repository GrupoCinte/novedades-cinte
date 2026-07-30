"""Enriquecimiento — stub Epic 1; EnrichLayer real en Epic 4."""
from __future__ import annotations


def enrich_candidatos(items: list[dict]) -> list[dict]:
    out: list[dict] = []
    for raw in items:
        perfil = dict(raw.get("perfil") or {})
        url = raw.get("url_perfil") or ""
        is_linkedin = "linkedin.com/in/" in url.lower()
        enriquecimiento = {
            "estado": "pendiente_epic4",
            "nota": "EnrichLayer (email, exp, skills, foto) — Epic 4",
        }
        if not is_linkedin:
            enriquecimiento = {
                "estado": "omitido",
                "nota": "Enriquecimiento API aplica principalmente a perfiles LinkedIn",
            }
        perfil["enriquecimiento"] = enriquecimiento
        perfil["pipeline_etapa"] = "enriquecimiento"
        out.append(
            {
                **raw,
                "etapa": "enriquecimiento",
                "enriquecido": False,
                "perfil": perfil,
            }
        )
    return out
