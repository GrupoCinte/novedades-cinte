"""Normaliza criterios de vacante y los adapta por fuente de búsqueda."""
from __future__ import annotations


def _list(val) -> list:
    if not val:
        return []
    if isinstance(val, list):
        return [str(x).strip() for x in val if str(x).strip()]
    return [str(val).strip()] if str(val).strip() else []


def normalize_criterios(raw: dict | None) -> dict:
    c = dict(raw or {})
    skills_req = _list(c.get("skills_requeridas") or c.get("skills"))
    skills_des = _list(c.get("skills_deseables"))
    cargo = str(c.get("cargo") or "").strip()
    equiv = _list(c.get("cargos_equivalentes"))
    if not equiv and cargo:
        equiv = [cargo]
    palabras = _list(c.get("palabras_clave_hv"))[:3]
    return {
        **c,
        "cargo": cargo,
        "cargos_equivalentes": equiv[:4],
        "skills_requeridas": skills_req,
        "skills_deseables": skills_des,
        "skills": skills_req,
        "palabras_clave_hv": palabras,
        "keywords_busqueda": _list(c.get("keywords_busqueda")),
        "ciudad": str(c.get("ciudad") or "").strip(),
        "experiencia_min": int(c.get("experiencia_min") or 0),
        "experiencia_max": c.get("experiencia_max"),
        "search_in_scope": c.get("search_in_scope") or "toda_hv",
        "hv_actualizada": c.get("hv_actualizada"),
        "profesion": c.get("profesion"),
        "nivel_estudios_min": c.get("nivel_estudios_min"),
        "area_trabajo": c.get("area_trabajo"),
        "ubicacion_tipo": c.get("ubicacion_tipo") or "todo",
    }


def palabras_clave_ee(criterios: dict) -> list[str]:
    c = normalize_criterios(criterios)
    return c["palabras_clave_hv"]


def cargos_equivalentes_ee(criterios: dict) -> list[str]:
    c = normalize_criterios(criterios)
    return c["cargos_equivalentes"]


def linkedin_keywords(criterios: dict) -> str:
    c = normalize_criterios(criterios)
    parts = []
    if c["cargos_equivalentes"]:
        parts.append(c["cargos_equivalentes"][0])
    elif c["cargo"]:
        parts.append(c["cargo"])
    parts.extend(c["palabras_clave_hv"][:2])
    return " ".join(parts)


def xray_variantes(criterios: dict) -> list[str]:
    c = normalize_criterios(criterios)
    out: list[str] = []
    seen: set[str] = set()
    for term in [c["cargo"], *c["cargos_equivalentes"], *c["keywords_busqueda"][:3]]:
        key = term.lower()
        if term and key not in seen:
            seen.add(key)
            out.append(term)
    return out[:6] or [c["cargo"] or "desarrollador"]


def xray_skills(criterios: dict) -> list[str]:
    c = normalize_criterios(criterios)
    return (c["skills_requeridas"] or c["skills"])[:5]
