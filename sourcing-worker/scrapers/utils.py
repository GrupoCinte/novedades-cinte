"""Utilidades compartidas scrapers."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path


def convertir_cookies(raw: list, dominio: str) -> list[dict]:
    out = []
    for c in raw:
        cookie = {
            "name": c.get("name", ""),
            "value": c.get("value", ""),
            "domain": c.get("domain", dominio),
            "path": c.get("path", "/"),
        }
        if c.get("expirationDate"):
            cookie["expires"] = int(c["expirationDate"])
        if c.get("secure") is not None:
            cookie["secure"] = c["secure"]
        if c.get("httpOnly") is not None:
            cookie["httpOnly"] = c["httpOnly"]
        same_site = c.get("sameSite")
        if same_site:
            ss = str(same_site).lower().replace("_", "")
            if ss in ("norestriction", "none"):
                cookie["sameSite"] = "None"
            elif ss == "lax":
                cookie["sameSite"] = "Lax"
            elif ss == "strict":
                cookie["sameSite"] = "Strict"
        out.append(cookie)
    return out


def load_cookies(path: Path, dominio: str) -> list[dict]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        raw = json.load(f)
    return convertir_cookies(raw, dominio)


def to_api_candidate(raw: dict, fuente: str, skills: list[str]) -> dict:
    return {
        "fuente": fuente,
        "nombre": raw.get("nombre") or "",
        "url_perfil": raw.get("url") or raw.get("url_perfil") or "",
        "perfil": {
            "cargo": raw.get("cargo") or "",
            "ciudad": raw.get("ciudad") or "",
            "experiencia": raw.get("experiencia") or "",
            "email": raw.get("email") or "",
            "telefono": raw.get("telefono") or "",
            "resumen_perfil": raw.get("resumen_perfil") or "",
            "salario": raw.get("salario") or "",
            "foto_url": raw.get("foto_url") or "",
            "skills": skills,
            "fecha_encontrado": datetime.now().isoformat(timespec="seconds"),
            "fecha_actualizacion": raw.get("fecha_actualizacion") or "",
            "resumee_id": raw.get("resumee_id") or "",
            "contactos": raw.get("contactos") or [],
            "experiencias": raw.get("experiencias") or [],
            "formacion": raw.get("formacion") or [],
            "habilidades": raw.get("habilidades") or [],
        },
    }
