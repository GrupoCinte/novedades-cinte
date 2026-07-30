"""Conexión guiada de sesiones El Empleo / LinkedIn (sin pegar cookies)."""
from __future__ import annotations

import asyncio
import time
from typing import Any

import httpx

from scrapers.utils import convertir_cookies

PROVIDERS: dict[str, dict[str, Any]] = {
    "elempleo": {
        "domain": ".elempleo.com",
        "login_url": "https://www.elempleo.com/co/empresas/buscar",
        "label": "El Empleo",
    },
    "linkedin": {
        "domain": ".linkedin.com",
        "login_url": "https://www.linkedin.com/login",
        "label": "LinkedIn",
    },
}

_connect_status: dict[str, dict[str, Any]] = {}


def get_connect_status(provider: str) -> dict[str, Any]:
    return dict(_connect_status.get(provider) or {"estado": "idle"})


EE_SEARCH_SELECTORS = (
    'select[name="SortByList.SelectedIds"]',
    ".resumeecontainer",
    ".ee-col-user-data-mobile",
)


def _has_empresa_auth_cookie(cookies: list) -> bool:
    names = {str(c.get("name") or "") for c in cookies}
    return ".ASPXAUTH" in names or any(n.startswith(".ASPXAUTH") for n in names)


def _has_auth_cookies(provider: str, cookies: list) -> bool:
    names = {str(c.get("name") or "") for c in cookies}
    if provider == "elempleo":
        return _has_empresa_auth_cookie(cookies)
    if provider == "linkedin":
        return "li_at" in names
    return False


async def _elempleo_session_ready(page, cookies: list) -> bool:
    if page.is_closed():
        return False
    if _has_empresa_auth_cookie(cookies):
        return True
    try:
        url = (page.url or "").lower()
        if "empresas/buscar" in url and "iniciar-sesion" not in url:
            return True
    except Exception:
        pass
    for sel in EE_SEARCH_SELECTORS:
        try:
            if await page.query_selector(sel):
                return True
        except Exception:
            if page.is_closed():
                raise RuntimeError(
                    "Cerró la ventana de Chrome antes de completar el login. "
                    "Pulse Conectar de nuevo y no cierre la ventana hasta ver candidatos en El Empleo."
                )
            # Navegación en curso tras login — reintentar en el siguiente ciclo
            return False
    return False


def _is_logged_in(provider: str, url: str) -> bool:
    u = (url or "").lower()
    if provider == "elempleo":
        if "iniciar-sesion" in u or "sessionexpired" in u:
            return False
        return "elempleo.com" in u and ("/empresas" in u or "/co/" in u)
    if provider == "linkedin":
        return "linkedin.com" in u and not any(x in u for x in ("login", "authwall", "checkpoint"))
    return False


async def _notify_backend(
    callback_base_url: str,
    callback_secret: str,
    provider: str,
    *,
    estado: str,
    cookies: list | None = None,
    mensaje: str | None = None,
):
    headers = {
        "Content-Type": "application/json",
        "x-sourcing-worker-key": callback_secret,
    }
    base = callback_base_url.rstrip("/")
    async with httpx.AsyncClient(timeout=30.0) as client:
        if cookies is not None:
            res = await client.put(
                f"{base}/api/atraccion/internal/integraciones/{provider}/cookies",
                headers=headers,
                json={"cookies": cookies, "mensaje": mensaje or "Sesión conectada"},
            )
        else:
            res = await client.patch(
                f"{base}/api/atraccion/internal/integraciones/{provider}/status",
                headers=headers,
                json={"estado": estado, "mensaje": mensaje},
            )
        if res.status_code >= 400:
            raise RuntimeError(f"Backend integración HTTP {res.status_code}: {res.text[:300]}")


async def _run_connect_flow(provider: str, callback_base_url: str, callback_secret: str):
    cfg = PROVIDERS.get(provider)
    if not cfg:
        raise ValueError(f"Proveedor desconocido: {provider}")

    _connect_status[provider] = {
        "estado": "conectando",
        "mensaje": f"Abriendo ventana de {cfg['label']}…",
        "started_at": time.time(),
    }

    try:
        await _notify_backend(
            callback_base_url,
            callback_secret,
            provider,
            estado="conectando",
            mensaje="Complete el inicio de sesión en la ventana que se abrió en este equipo.",
        )
    except Exception as exc:
        _connect_status[provider] = {"estado": "error", "mensaje": str(exc)}
        return

    from pathlib import Path
    from playwright.async_api import async_playwright
    from session.elempleo_auto_login import credentials_from_env, elempelo_auto_login

    ee_auto = provider == "elempleo" and all(credentials_from_env())
    timeout_sec = int(
        __import__("os").getenv(
            "SOURCING_CONNECT_TIMEOUT_SEC",
            "600" if provider == "elempleo" else "300",
        )
    )
    deadline = time.time() + timeout_sec
    raw_cookies: list[dict] = []
    profile_dir = Path(__file__).resolve().parent.parent / ".elempleo-profile"

    try:
        async with async_playwright() as p:
            browser = None
            if provider == "elempleo":
                profile_dir.mkdir(parents=True, exist_ok=True)
                launch_kwargs: dict[str, Any] = {
                    "headless": False,
                    "args": [
                        "--disable-blink-features=AutomationControlled",
                        "--no-sandbox",
                        "--start-maximized",
                    ],
                    "user_agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
                    ),
                    "viewport": {"width": 1366, "height": 768},
                    "locale": "es-CO",
                    "channel": "chrome",
                }
                try:
                    context = await p.chromium.launch_persistent_context(
                        str(profile_dir),
                        **launch_kwargs,
                    )
                except Exception:
                    launch_kwargs.pop("channel", None)
                    context = await p.chromium.launch_persistent_context(
                        str(profile_dir),
                        **launch_kwargs,
                    )
                await context.add_init_script(
                    "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
                )
                page = context.pages[0] if context.pages else await context.new_page()
            else:
                browser = await p.chromium.launch(
                    headless=False,
                    args=[
                        "--disable-blink-features=AutomationControlled",
                        "--no-sandbox",
                        "--start-maximized",
                    ],
                )
                context = await browser.new_context(
                    user_agent=(
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                        "(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
                    ),
                    viewport={"width": 1366, "height": 768},
                    locale="es-CO",
                )
                await context.add_init_script(
                    "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
                )
                page = await context.new_page()
            if provider == "elempleo":
                ee_email, ee_pass = credentials_from_env()
                if ee_email and ee_pass:
                    _connect_status[provider]["mensaje"] = (
                        "Ventana Chrome abierta con correo y contraseña. "
                        "No cierre la ventana hasta que CINTE muestre «Conectado»."
                    )
                    try:
                        await elempelo_auto_login(page, ee_email, ee_pass)
                    except RuntimeError:
                        raise
                    except Exception as exc:
                        if "closed" not in str(exc).lower():
                            raise
                        _connect_status[provider]["mensaje"] = (
                            "Ventana cerrada antes de guardar. Pulse Conectar de nuevo "
                            "y no cierre Chrome hasta ver el buscador de candidatos."
                        )
                else:
                    await page.goto(cfg["login_url"], wait_until="domcontentloaded")
            else:
                await page.goto(cfg["login_url"], wait_until="domcontentloaded")
            if not ee_auto:
                _connect_status[provider]["mensaje"] = (
                    f"Inicie sesión en {cfg['label']} en la ventana del navegador. "
                    "La conexión se guardará sola al detectar la sesión."
                )

            ee_last_nav = 0.0
            while time.time() < deadline:
                await asyncio.sleep(2)
                if page.is_closed():
                    raise RuntimeError(
                        "Cerró la ventana de Chrome antes de completar el login. "
                        "Pulse Conectar de nuevo y no cierre la ventana hasta ver candidatos en El Empleo."
                    )
                try:
                    raw_cookies = await context.cookies()
                    if provider == "elempleo":
                        if await _elempleo_session_ready(page, raw_cookies):
                            break
                        # Tras el login, El Empleo deja al usuario en el home. Si NO está
                        # en la página de login, navegar al buscador de empresas para
                        # forzar la cookie de empresa, detectar la sesión y cerrar la
                        # ventana solo (sin que el usuario navegue a mano). Se reintenta
                        # con throttle porque el login puede redirigir varias veces.
                        cur = (page.url or "").lower()
                        on_login = "iniciar-sesion" in cur or "sessionexpired" in cur
                        if (
                            not on_login
                            and "empresas/buscar" not in cur
                            and (time.time() - ee_last_nav) > 12
                        ):
                            ee_last_nav = time.time()
                            _connect_status[provider]["mensaje"] = (
                                "Abriendo el buscador de candidatos de El Empleo…"
                            )
                            try:
                                await page.goto(
                                    cfg["login_url"],
                                    wait_until="domcontentloaded",
                                    timeout=60000,
                                )
                                await asyncio.sleep(2)
                                raw_cookies = await context.cookies()
                                if await _elempleo_session_ready(page, raw_cookies):
                                    break
                            except Exception:
                                pass
                    elif _is_logged_in(provider, page.url) or _has_auth_cookies(
                        provider, raw_cookies
                    ):
                        break
                except RuntimeError:
                    raise
                except Exception:
                    continue

            if not page.is_closed():
                if browser is not None:
                    await browser.close()
                else:
                    await context.close()

        if not raw_cookies:
            msg = "Tiempo agotado — no se detectó sesión activa."
            _connect_status[provider] = {"estado": "error", "mensaje": msg}
            await _notify_backend(
                callback_base_url, callback_secret, provider, estado="error", mensaje=msg
            )
            return

        cookies = convertir_cookies(
            [
                {
                    "name": c.get("name"),
                    "value": c.get("value"),
                    "domain": c.get("domain"),
                    "path": c.get("path", "/"),
                    "expirationDate": c.get("expires"),
                    "secure": c.get("secure"),
                    "httpOnly": c.get("httpOnly"),
                }
                for c in raw_cookies
            ],
            cfg["domain"],
        )
        if not cookies:
            msg = "Sesión detectada pero no se pudieron leer cookies del dominio."
            _connect_status[provider] = {"estado": "error", "mensaje": msg}
            await _notify_backend(
                callback_base_url, callback_secret, provider, estado="error", mensaje=msg
            )
            return

        await _notify_backend(
            callback_base_url,
            callback_secret,
            provider,
            estado="conectado",
            cookies=cookies,
            mensaje=f"{cfg['label']} conectado correctamente",
        )
        _connect_status[provider] = {"estado": "conectado", "mensaje": "Sesión guardada"}

    except Exception as exc:
        msg = str(exc)[:300]
        _connect_status[provider] = {"estado": "error", "mensaje": msg}
        try:
            await _notify_backend(
                callback_base_url, callback_secret, provider, estado="error", mensaje=msg
            )
        except Exception:
            pass


async def start_connect_task(provider: str, callback_base_url: str, callback_secret: str):
    await _run_connect_flow(provider, callback_base_url, callback_secret)
