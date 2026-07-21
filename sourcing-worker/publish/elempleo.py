"""Publicar oferta en El Empleo (portado de ScrapingAT)."""
from __future__ import annotations

import asyncio

from config import EE_COOKIES, PLAYWRIGHT_HEADLESS
from session.store import resolve_cookies


async def _capture_postulaciones_url(page) -> str:
    """Navega al panel empresas y captura URL usable por postulaciones.py."""
    nav_urls = (
        "https://www.elempleo.com/co/empresas/ofertas/por-ver",
        "https://www.elempleo.com/co/empresas/ofertas",
        "https://www.elempleo.com/co/empresas",
    )
    for nav in nav_urls:
        try:
            await page.goto(nav, wait_until="domcontentloaded")
            await asyncio.sleep(2)
            if "iniciar-sesion" in page.url:
                return ""
            if "/empresas/" in page.url:
                link = await page.query_selector(
                    "a[href*='/empresas/'][href*='oferta'], a[href*='/empresas/'][href*='postul'], a[href*='/empresas/ofertas/']"
                )
                if link:
                    href = await link.get_attribute("href") or ""
                    if href.startswith("/"):
                        href = f"https://www.elempleo.com{href}"
                    if "/empresas/" in href:
                        return href
                return page.url
        except Exception:
            continue
    return page.url if "/empresas/" in page.url else ""


async def publicar_elempleo(cargo: str, ciudad: str, skills: list, texto_oferta: str, contrato: str = "Indefinido", modalidad: str = "Híbrido") -> dict:
    cookies = resolve_cookies("elempleo", EE_COOKIES, ".elempleo.com")
    if not cookies:
        return {"status": "error", "mensaje": "Sesión El Empleo no conectada"}

    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=PLAYWRIGHT_HEADLESS)
        context = await browser.new_context()
        await context.add_cookies(cookies)
        page = await context.new_page()
        url_publicada = ""
        try:
            await page.goto("https://www.elempleo.com/co/empresas/ofertas/seleccionar-producto")
            await page.wait_for_load_state("networkidle")
            await asyncio.sleep(2)
            if "iniciar-sesion" in page.url:
                await browser.close()
                return {"status": "error", "mensaje": "Sesión El Empleo expirada"}

            if "crear" not in page.url:
                await page.goto(
                    "https://www.elempleo.com/co/empresas/ofertas/crear",
                    referer="https://www.elempleo.com/co/empresas/ofertas/seleccionar-producto",
                )
                await page.wait_for_load_state("networkidle")
                await asyncio.sleep(2)

            for ph in ("título", "oferta", "Escribe el título"):
                el = await page.query_selector(f"input[placeholder*='{ph}']")
                if el:
                    await el.fill(cargo)
                    break

            desc = await page.query_selector("textarea")
            if desc:
                await desc.fill(texto_oferta[:4900])

            for skill in (skills or [])[:5]:
                inp = await page.query_selector("input[placeholder*='habilidad'], input[placeholder*='Habilidad']")
                if inp:
                    await inp.fill(skill)
                    await page.keyboard.press("Enter")
                    await asyncio.sleep(0.5)

            btn = await page.query_selector("button:has-text('Crear Oferta'), button:has-text('Crear')")
            if btn:
                await btn.click()
                await page.wait_for_load_state("networkidle")
                await asyncio.sleep(3)
                url_publicada = await _capture_postulaciones_url(page)
                if not url_publicada:
                    url_publicada = page.url

            await browser.close()
            if url_publicada and "/empresas/" in url_publicada:
                return {"status": "ok", "url_publicada": url_publicada, "mensaje": f"Oferta '{cargo}' publicada"}
            if url_publicada:
                return {"status": "ok", "url_publicada": url_publicada, "mensaje": f"Oferta '{cargo}' publicada (revise URL de postulaciones)"}
            return {"status": "error", "mensaje": "No se pudo confirmar publicación"}
        except Exception as exc:
            await browser.close()
            return {"status": "error", "mensaje": str(exc)[:400]}
