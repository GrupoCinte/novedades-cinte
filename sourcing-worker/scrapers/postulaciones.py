"""Scrape postulaciones de una oferta El Empleo (panel empresas)."""
from __future__ import annotations

import asyncio
from datetime import datetime

from config import EE_COOKIES, PLAYWRIGHT_HEADLESS
from scrapers.utils import to_api_candidate
from session.store import resolve_cookies


def _validar_url_empresas(url: str) -> bool:
    return bool(url and "/empresas/" in url)


async def buscar_postulaciones(url_oferta: str, cargo: str = "", skills: list | None = None) -> tuple[list[dict], str | None]:
    if not _validar_url_empresas(url_oferta):
        return [], "URL debe ser del panel de empresas (/co/empresas/)"

    skills = skills or []
    candidatos: list[dict] = []

    from playwright.async_api import async_playwright

    cookies = resolve_cookies("elempleo", EE_COOKIES, ".elempleo.com")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=PLAYWRIGHT_HEADLESS)
        context = await browser.new_context()
        if cookies:
            await context.add_cookies(cookies)
        page = await context.new_page()
        await page.goto(url_oferta, wait_until="domcontentloaded")
        await asyncio.sleep(4)

        if "iniciar-sesion" in page.url:
            await browser.close()
            return [], "Sesión El Empleo expirada"

        pagina = 1
        while pagina <= 15:
            for _ in range(10):
                await page.evaluate("window.scrollBy(0,500)")
                await asyncio.sleep(0.3)
            await asyncio.sleep(2)

            tarjetas = await page.query_selector_all(".resumeecontainer")
            if not tarjetas:
                tarjetas = await page.query_selector_all(".ee-search-result-card, [data-card-id]")

            for t in tarjetas:
                try:
                    texto = (await t.inner_text()).strip()
                    if len(texto) < 10:
                        continue
                    email_hidden = await t.query_selector("input.data-email")
                    email = await email_hidden.get_attribute("value") if email_hidden else ""
                    card_el = await t.query_selector("[data-card-id]")
                    card_id = await card_el.get_attribute("data-card-id") if card_el else ""
                    nombre_el = await t.query_selector(
                        "a.ee-view-resumee, a[data-resumee-id], h3 a, .ee-name a, a[href*='hoja-de-vida']"
                    )
                    nombre = ""
                    url_cand = ""
                    if nombre_el:
                        nombre = (await nombre_el.inner_text()).strip()
                        href = await nombre_el.get_attribute("href") or ""
                        url_cand = href if href.startswith("http") else f"https://www.elempleo.com{href}"
                    raw = {
                        "nombre": nombre,
                        "cargo": cargo,
                        "email": email or "",
                        "telefono": "",
                        "url": url_cand or f"https://www.elempleo.com/co/empresas/postulacion#{card_id}",
                        "resumee_id": card_id,
                        "fuente": "El Empleo Postulaciones",
                        "fecha": datetime.now().strftime("%Y-%m-%d %H:%M"),
                        "skills": skills,
                        "resumen_perfil": texto[:250],
                    }
                    candidatos.append(to_api_candidate(raw))
                except Exception:
                    continue

            btn = await page.query_selector("a.next,[aria-label='Siguiente'],a[rel='next']")
            if not btn:
                break
            await btn.click()
            await asyncio.sleep(3)
            pagina += 1

        await browser.close()

    return candidatos, None if candidatos else "Sin postulados encontrados"
