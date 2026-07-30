"""Filtro de relevancia candidato vs criterios de vacante."""
from __future__ import annotations

import re
import unicodedata

STOPWORDS = frozenset({
    "de", "la", "el", "en", "y", "con", "para", "por", "del", "las", "los",
    "un", "una", "the", "and", "senior", "junior", "pleno", "semi",
})

SHORT_TECH = frozenset({
    "aws", "gcp", "sql", "api", "iot", "sap", "erp", "crm", "dev", "ops",
})


def _normalize(text: str) -> str:
    raw = unicodedata.normalize("NFD", str(text or ""))
    return "".join(c for c in raw if unicodedata.category(c) != "Mn").lower()


def significant_terms(*texts: str) -> set[str]:
    terms: set[str] = set()
    for text in texts:
        if not text:
            continue
        norm = _normalize(text)
        for word in re.findall(r"[\w+#.]+", norm):
            w = word.strip(".")
            if not w:
                continue
            if w in SHORT_TECH or (len(w) >= 4 and w not in STOPWORDS):
                terms.add(w)
    return terms


def profile_blob(raw: dict) -> str:
    parts = [
        raw.get("nombre") or "",
        raw.get("cargo") or "",
        raw.get("resumen_perfil") or "",
        " ".join(raw.get("habilidades") or []),
        " ".join(raw.get("experiencias") or []),
        " ".join(raw.get("formacion") or []),
    ]
    return _normalize(" ".join(parts))


def cargo_search_terms(
    cargo: str,
    cargos_equivalentes: list[str] | None = None,
) -> set[str]:
    terms = significant_terms(cargo)
    for alt in cargos_equivalentes or []:
        terms |= significant_terms(alt)
    return terms


def passes_relevance(
    raw: dict,
    cargo: str,
    skills: list[str] | None = None,
    keywords: list[str] | None = None,
    cargos_equivalentes: list[str] | None = None,
    *,
    relax: bool = False,
) -> bool:
    skills = skills or []
    keywords = keywords or []
    if not str(cargo or "").strip() and not skills and not keywords and not cargos_equivalentes:
        return True

    cargo_terms = cargo_search_terms(cargo, cargos_equivalentes)
    skill_terms = significant_terms(*skills)
    keyword_terms = significant_terms(*keywords)
    search_terms = cargo_terms | skill_terms | keyword_terms

    blob = profile_blob(raw)
    profile_cargo_terms = significant_terms(raw.get("cargo") or "")
    blob_terms = significant_terms(blob)

    if cargo_terms:
        overlap = profile_cargo_terms & cargo_terms
        needed = 1 if len(cargo_terms) <= 2 else max(2, (len(cargo_terms) + 1) // 2)
        if relax:
            needed = 1
        if len(overlap) >= needed:
            return True

    if skill_terms and skill_terms & blob_terms:
        return True

    hits = search_terms & blob_terms
    min_hits = 1 if relax else 2
    if len(hits) >= min_hits:
        return True

    return False


def merge_filter_terms(
    skills: list[str] | None,
    keywords: list[str] | None,
    *,
    limit: int = 8,
) -> list[str]:
    """Términos para relevancia (skills + keywords)."""
    out: list[str] = []
    seen: set[str] = set()
    for term in [*(skills or []), *(keywords or [])]:
        t = str(term or "").strip()
        if not t:
            continue
        key = _normalize(t)
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
        if len(out) >= limit:
            break
    return out


def merge_ee_filter_terms(skills: list[str] | None, *, limit: int = 3) -> list[str]:
    """Deprecated: usar palabras_clave_hv del criterio. Mantener compat tests."""
    out: list[str] = []
    seen: set[str] = set()
    for term in skills or []:
        t = str(term or "").strip()
        if not t or len(t) > 40:
            continue
        if len(t.split()) > 2:
            continue
        key = _normalize(t)
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
        if len(out) >= limit:
            break
    return out
