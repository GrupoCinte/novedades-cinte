"""Fase de enriquecimiento — EnrichLayer + datos EE existentes."""
from __future__ import annotations

import os

from pipeline.enrichlayer_client import enrichlayer_configured, fetch_person_profile


def _is_linkedin(url: str) -> bool:
    return "linkedin.com/in/" in (url or "").lower()


def _has_contact(perfil: dict) -> bool:
    return bool((perfil.get("email") or "").strip() or (perfil.get("telefono") or "").strip())


def _merge_enrich(perfil: dict, enriched: dict) -> dict:
    merged = dict(perfil)
    if not enriched:
        return merged

    for key in (
        "foto_url",
        "email",
        "cargo",
        "ciudad",
        "resumen_enriquecido",
        "skills_enriquecidos",
        "experiencias_detalle",
        "conexiones",
    ):
        val = enriched.get(key)
        if not val:
            continue
        if key in ("email", "cargo", "ciudad") and merged.get(key):
            continue
        merged[key] = val

    if enriched.get("nombre_completo") and not merged.get("nombre_guardado"):
        merged["nombre_enriquecido"] = enriched["nombre_completo"]

    if enriched.get("resumen_enriquecido") and not merged.get("resumen_perfil"):
        merged["resumen_perfil"] = enriched["resumen_enriquecido"]

    if enriched.get("experiencias_detalle") and not merged.get("experiencias"):
        merged["experiencias"] = [
            f"{e.get('titulo', '')} @ {e.get('empresa', '')}".strip(" @")
            for e in enriched["experiencias_detalle"]
            if e.get("titulo") or e.get("empresa")
        ]

    return merged


def _is_enriched(perfil: dict, enriched: dict) -> bool:
    if _has_contact(perfil):
        return True
    if enriched and (enriched.get("cargo") or enriched.get("skills_enriquecidos")):
        return True
    if perfil.get("resumen_enriquecido") or perfil.get("foto_url"):
        return True
    return False


def enrich_candidatos(items: list[dict]) -> list[dict]:
    max_li = int(os.getenv("SOURCING_ENRICH_LI_MAX", "15"))
    use_api = enrichlayer_configured()
    out: list[dict] = []
    li_done = 0

    for raw in items:
        perfil = dict(raw.get("perfil") or {})
        url = raw.get("url_perfil") or ""
        enriched_data: dict = {}

        if _is_linkedin(url) and use_api and li_done < max_li:
            enriched_data = fetch_person_profile(url)
            li_done += 1
            perfil = _merge_enrich(perfil, enriched_data)
            perfil["enriquecimiento"] = {
                "estado": "completado" if enriched_data else "fallido",
                "fuente": "enrichlayer",
                "nota": "Perfil enriquecido vía EnrichLayer" if enriched_data else "Sin respuesta EnrichLayer",
            }
        elif _is_linkedin(url) and use_api:
            perfil["enriquecimiento"] = {
                "estado": "omitido",
                "fuente": "enrichlayer",
                "nota": f"Límite de enriquecimiento LinkedIn ({max_li}) alcanzado",
            }
        elif _is_linkedin(url) and not use_api:
            perfil["enriquecimiento"] = {
                "estado": "omitido",
                "fuente": "none",
                "nota": "Configure ENRICHLAYER_API_KEY para enriquecer LinkedIn",
            }
        elif _has_contact(perfil):
            perfil["enriquecimiento"] = {
                "estado": "completado",
                "fuente": "elempleo",
                "nota": "Contacto disponible desde El Empleo",
            }
        else:
            perfil["enriquecimiento"] = {
                "estado": "omitido",
                "fuente": "none",
                "nota": "Sin enriquecimiento aplicable",
            }

        perfil["pipeline_etapa"] = "enriquecimiento"
        nombre = raw.get("nombre") or ""
        if enriched_data.get("nombre_completo"):
            nombre = enriched_data["nombre_completo"]

        out.append(
            {
                **raw,
                "nombre": nombre,
                "etapa": "enriquecimiento",
                "enriquecido": _is_enriched(perfil, enriched_data),
                "perfil": perfil,
            }
        )

    return out
