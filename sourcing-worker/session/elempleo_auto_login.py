"""Login El Empleo: prellena credenciales; el usuario completa captcha si aplica."""
from __future__ import annotations

import asyncio
import os

EE_LOGIN_URL = "https://www.elempleo.com/co/iniciar-sesion"
EE_BUSCAR_URL = "https://www.elempleo.com/co/empresas/buscar"


async def _has_search_ui(page) -> bool:
    url = (page.url or "").lower()
    if "empresas/buscar" not in url or "iniciar-sesion" in url:
        return False
    try:
        for sel in (
            'select[name="SortByList.SelectedIds"]',
            ".resumeecontainer",
            'input[placeholder*="Diseñador"]',
        ):
            if await page.query_selector(sel):
                return True
    except Exception:
        pass
    return False


def _has_auth_cookie(cookie_list: list) -> bool:
    names = {str(c.get("name") or "") for c in cookie_list}
    return ".ASPXAUTH" in names or any(n.startswith(".ASPXAUTH") for n in names)


async def _dismiss_cookies(page) -> None:
    for sel in ('a:has-text("Aceptar")', 'button:has-text("Entiendo")'):
        try:
            loc = page.locator(sel).first
            if await loc.is_visible(timeout=1500):
                await loc.click(timeout=2000)
                await asyncio.sleep(0.5)
        except Exception:
            pass


async def elempelo_auto_login(page, email: str, password: str) -> None:
    """Prellena login y envía formulario. Si hay reCAPTCHA, espera acción humana en ventana visible."""
    email = (email or "").strip()
    password = password or ""
    if not email or not password:
        raise RuntimeError("Faltan EE_LOGIN_EMAIL o EE_LOGIN_PASSWORD")

    await page.goto(EE_LOGIN_URL, wait_until="domcontentloaded", timeout=60000)
    await asyncio.sleep(2)
    await _dismiss_cookies(page)

    ctx_cookies = await page.context.cookies()
    if _has_auth_cookie(ctx_cookies):
        print("[elempleo-login] ya hay sesión activa")
        if "empresas/buscar" not in (page.url or "").lower():
            await page.goto(EE_BUSCAR_URL, wait_until="domcontentloaded", timeout=60000)
        return

    if await _has_search_ui(page):
        return

    email_loc = page.locator('input[name="EmailField"]')
    pass_loc = page.locator('input[name="PasswordField"]')
    await email_loc.wait_for(state="visible", timeout=15000)
    await email_loc.fill(email)
    await pass_loc.fill(password)

    print("[elempleo-login] Credenciales listas — pulse «Inicia sesión» en la ventana de Chrome")

    # Esperar login manual (El Empleo bloquea clics automáticos con reCAPTCHA invisible)
    for i in range(300):
        await asyncio.sleep(2)
        try:
            if page.is_closed():
                break
            ctx_cookies = await page.context.cookies()
            if _has_auth_cookie(ctx_cookies):
                print("[elempleo-login] cookie de sesión detectada")
                if "empresas/buscar" not in (page.url or "").lower():
                    await page.goto(EE_BUSCAR_URL, wait_until="domcontentloaded", timeout=60000)
                    await asyncio.sleep(2)
                return
            if await _has_search_ui(page):
                print("[elempleo-login] buscador detectado")
                return
            url = (page.url or "").lower()
            if (
                "iniciar-sesion" not in url
                and "sessionexpired" not in url
                and "elempleo.com" in url
                and "empresas/buscar" not in url
            ):
                try:
                    await page.goto(EE_BUSCAR_URL, wait_until="domcontentloaded", timeout=60000)
                    await asyncio.sleep(2)
                except Exception:
                    pass
            if "empresas/buscar" in url and "iniciar-sesion" not in url:
                await asyncio.sleep(2)
                if await _has_search_ui(page):
                    return
            twofa = page.locator("#TwoFactorCode")
            try:
                if await twofa.is_visible(timeout=300):
                    print("[elempleo-login] código 2FA requerido — ingréselo en la ventana")
            except Exception:
                pass
            if i == 5 and "iniciar-sesion" in url:
                body = (await page.inner_text("body"))[:2000].lower()
                if any(x in body for x in ("incorrect", "inválid", "invalid", "no coincide")):
                    raise RuntimeError("Credenciales rechazadas por El Empleo")
        except RuntimeError:
            raise
        except Exception:
            continue

    await page.goto(EE_BUSCAR_URL, wait_until="domcontentloaded", timeout=60000)
    await asyncio.sleep(3)
    if page.is_closed():
        raise RuntimeError(
            "Cerró la ventana de Chrome antes de completar el login. "
            "Pulse Conectar de nuevo y no cierre la ventana."
        )
    if await _has_search_ui(page):
        return
    raise RuntimeError(
        "No se completó el login en la ventana de Chrome. "
        "Pulse Inicia sesión y no cierre la ventana hasta ver el buscador de candidatos."
    )


def credentials_from_env() -> tuple[str, str]:
    return os.getenv("EE_LOGIN_EMAIL", "").strip(), os.getenv("EE_LOGIN_PASSWORD", "").strip()
