"""LinkedIn — Playwright (requiere cookies de sesión)."""
from __future__ import annotations

import asyncio
import urllib.parse

from config import LI_COOKIES, PLAYWRIGHT_HEADLESS
from session.store import mark_session_expired, resolve_cookies
from scrapers.criterios_mapper import linkedin_keywords, normalize_criterios
from scrapers.utils import to_api_candidate


async def buscar_linkedin(
    criterios: dict,
    max_c: int,
) -> tuple[list[dict], str | None]:
    norm = normalize_criterios(criterios)
    cargo = linkedin_keywords(norm)
    ciudad = norm["ciudad"]
    skills = norm["skills_requeridas"] or norm["skills"]
    from playwright.async_api import async_playwright

    candidatos: list[dict] = []
    contador = 0

    cookies = resolve_cookies("linkedin", LI_COOKIES, ".linkedin.com")
    if not cookies:
        return [], "Conecte LinkedIn desde Atracción → Integraciones"

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=PLAYWRIGHT_HEADLESS,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
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
        await context.add_cookies(cookies)
        page = await context.new_page()

        url_busqueda = (
            "https://www.linkedin.com/search/results/people/?keywords="
            f"{urllib.parse.quote(cargo)}&geoUrn=%5B%22100876405%22%5D&origin=FACETED_SEARCH"
        )
        await page.goto(url_busqueda, wait_until="domcontentloaded")
        await asyncio.sleep(4)

        if any(x in page.url for x in ["login", "authwall", "checkpoint", "uas"]):
            await browser.close()
            err = "Sesión LinkedIn expirada — renueve la conexión en Integraciones"
            mark_session_expired("linkedin", err)
            return [], err

        pagina = 1
        await page.evaluate(
            "() => { document.querySelectorAll('[data-cinte-visto]').forEach(el => el.removeAttribute('data-cinte-visto')); }"
        )
        while contador < max_c:
            for _ in range(6):
                await page.evaluate("window.scrollBy(0,500)")
                await asyncio.sleep(0.3)
            await asyncio.sleep(1)

            cards = await page.query_selector_all(
                "li.reusable-search__result-container, div.entity-result, div[data-chameleon-result-urn]"
            )
            urls_vistas: set[str] = set()

            for card in cards:
                if contador >= max_c:
                    break
                try:
                    if await card.get_attribute("data-cinte-visto"):
                        continue
                    await card.evaluate("el => el.setAttribute('data-cinte-visto', '1')")

                    link = await card.query_selector("a[href*='/in/']")
                    if not link:
                        continue
                    href = await link.get_attribute("href")
                    if not href or "/in/" not in href:
                        continue
                    url_cand = href.split("?")[0]
                    if url_cand in urls_vistas:
                        continue
                    urls_vistas.add(url_cand)

                    nombre = (await link.inner_text()).strip()
                    if not nombre or len(nombre) < 2:
                        continue

                    cargo_el = await card.query_selector(
                        ".entity-result__primary-subtitle, .artdeco-entity-lockup__subtitle"
                    )
                    cargo = (await cargo_el.inner_text()).strip() if cargo_el else ""

                    raw = {
                        "nombre": nombre,
                        "cargo": cargo,
                        "ciudad": ciudad,
                        "url": url_cand,
                        "email": "",
                        "telefono": "",
                        "resumen_perfil": "",
                    }
                    candidatos.append(to_api_candidate(raw, "LinkedIn", skills))
                    contador += 1
                except Exception:
                    continue

            # Compatibilidad: enlaces sueltos si no hay tarjetas estándar
            if not cards:
                links = await page.query_selector_all("a[href*='linkedin.com/in/']")
                for link in links:
                    if contador >= max_c:
                        break
                    try:
                        href = await link.get_attribute("href")
                        if not href or "/in/" not in href:
                            continue
                        url_cand = href.split("?")[0]
                        if url_cand in urls_vistas:
                            continue
                        urls_vistas.add(url_cand)
                        nombre = (await link.inner_text()).strip()
                        if not nombre or len(nombre) < 2:
                            continue
                        raw = {
                            "nombre": nombre,
                            "cargo": "",
                            "ciudad": ciudad,
                            "url": url_cand,
                            "email": "",
                            "telefono": "",
                            "resumen_perfil": "",
                        }
                        candidatos.append(to_api_candidate(raw, "LinkedIn", skills))
                        contador += 1
                    except Exception:
                        continue

            next_btn = await page.query_selector("button[aria-label='Siguiente'], button.artdeco-pagination__button--next")
            if not next_btn or contador >= max_c:
                break
            try:
                await next_btn.click()
                await asyncio.sleep(3)
                pagina += 1
            except Exception:
                break

        await browser.close()

    return candidatos, None if candidatos else "LinkedIn no devolvió perfiles"
