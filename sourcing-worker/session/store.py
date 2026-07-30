"""Obtiene cookies de sesión desde el backend (integraciones UI)."""
from __future__ import annotations

import os

import httpx

from config import CALLBACK_SECRET
from scrapers.utils import convertir_cookies, load_cookies

_cache: dict[str, list[dict]] = {}
_job_callback_base: str | None = None
_job_callback_secret: str | None = None


def bind_job_session(callback_base_url: str, callback_secret: str | None = None) -> None:
    global _job_callback_base, _job_callback_secret
    _job_callback_base = (callback_base_url or "").strip().rstrip("/") or None
    _job_callback_secret = (callback_secret or "").strip() or None
    invalidate_session_cache()


def clear_job_session() -> None:
    global _job_callback_base, _job_callback_secret
    _job_callback_base = None
    _job_callback_secret = None


def _callback_base() -> str:
    if _job_callback_base:
        return _job_callback_base
    return os.getenv("SOURCING_CALLBACK_BASE_URL", "http://127.0.0.1:3005").rstrip("/")


def _callback_secret() -> str:
    if _job_callback_secret:
        return _job_callback_secret
    return os.getenv("SOURCING_WORKER_CALLBACK_SECRET", CALLBACK_SECRET)


def fetch_session_cookies(provider: str, dominio: str) -> list[dict]:
    cache_key = f"{provider}:{dominio}"
    if cache_key in _cache:
        return _cache[cache_key]

    url = f"{_callback_base()}/api/atraccion/internal/integraciones/{provider}/cookies"
    try:
        with httpx.Client(timeout=15.0) as client:
            res = client.get(
                url,
                headers={"x-sourcing-worker-key": _callback_secret()},
            )
        if res.status_code == 200:
            data = res.json()
            raw = data.get("cookies") or []
            cookies = convertir_cookies(raw, dominio) if raw else []
            if cookies:
                _cache[cache_key] = cookies
                print(f"[session] {provider}: {len(cookies)} cookies desde integraciones UI")
                return cookies
        print(f"[session] {provider}: HTTP {res.status_code} en {url} — ¿conectó en Integraciones?")
    except Exception as exc:
        print(f"[session] {provider}: error al cargar sesión ({url}): {exc}")

    return []


def resolve_cookies(provider: str, file_path, dominio: str) -> list[dict]:
    """Prioridad: sesión UI (BD) → archivo legacy (dev)."""
    cookies = fetch_session_cookies(provider, dominio)
    if cookies:
        return cookies
    legacy = load_cookies(file_path, dominio)
    if legacy:
        print(f"[session] {provider}: cookies desde archivo legacy")
        return legacy
    return []


def invalidate_session_cache(provider: str | None = None) -> None:
    if provider:
        keys = [k for k in _cache if k.startswith(f"{provider}:")]
        for k in keys:
            _cache.pop(k, None)
    else:
        _cache.clear()


def _patch_integration_status(provider: str, estado: str, mensaje: str) -> None:
    url = f"{_callback_base()}/api/atraccion/internal/integraciones/{provider}/status"
    try:
        with httpx.Client(timeout=10.0) as client:
            res = client.patch(
                url,
                headers={
                    "Content-Type": "application/json",
                    "x-sourcing-worker-key": _callback_secret(),
                },
                json={"estado": estado, "mensaje": mensaje},
            )
        if res.status_code < 400:
            print(f"[session] {provider}: estado -> {estado}")
        else:
            print(f"[session] {provider}: no se pudo actualizar estado (HTTP {res.status_code})")
    except Exception as exc:
        print(f"[session] {provider}: error al actualizar estado: {exc}")


def mark_session_expired(provider: str, mensaje: str | None = None) -> None:
    """Advierte en UI; no borra cookies — el worker debe seguir intentando con ellas."""
    invalidate_session_cache(provider)
    msg = (mensaje or "El worker no pudo usar la sesión guardada. Renueve en Integraciones.").strip()
    _patch_integration_status(provider, "expirado", msg)


def mark_session_restored(provider: str, mensaje: str | None = None) -> None:
    msg = (mensaje or "Sesión verificada por el worker.").strip()
    _patch_integration_status(provider, "conectado", msg)
