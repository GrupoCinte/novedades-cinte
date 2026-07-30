"""Extracción profunda de perfiles LinkedIn (Epic 3)."""
from __future__ import annotations

import asyncio

from config import LI_COOKIES, PLAYWRIGHT_HEADLESS
from session.store import resolve_cookies


def _is_linkedin_profile(url: str) -> bool:
    return "linkedin.com/in/" in (url or "").lower()


async def _extract_one_profile(page, url: str) -> dict:
    perfil_extra: dict = {}
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=25000)
        await asyncio.sleep(2)
        if any(x in page.url for x in ["login", "authwall", "checkpoint"]):
            return {"extraccion": {"estado": "fallido", "error": "Sesión LinkedIn requerida"}}

        headline = await page.query_selector("div.text-body-medium, h2.top-card-layout__headline")
        if headline:
            perfil_extra["cargo"] = (await headline.inner_text()).strip()[:200]

        location_el = await page.query_selector("span.text-body-small.inline.t-black--light, .top-card__subline-item")
        if location_el:
            perfil_extra["ciudad"] = (await location_el.inner_text()).strip()[:120]

        about_el = await page.query_selector(
            "section.pv-about-section div.inline-show-more-text, "
            "div#about ~ div.display-flex div.inline-show-more-text, "
            "[data-generated-suggestion-target] .inline-show-more-text"
        )
        if about_el:
            perfil_extra["resumen_perfil"] = (await about_el.inner_text()).strip()[:500]

        exp_items = await page.query_selector_all("section.experience-section li, li.artdeco-list__item")
        experiencias = []
        for el in exp_items[:4]:
            txt = (await el.inner_text()).strip()
            if txt and len(txt) > 10:
                experiencias.append(txt.split("\n")[0][:120])
        if experiencias:
            perfil_extra["experiencias"] = experiencias

        return {
            "extraccion": {"estado": "completado", "fuente": "linkedin_playwright"},
            **perfil_extra,
        }
    except Exception as exc:
        return {"extraccion": {"estado": "fallido", "error": str(exc)[:200]}}


async def enrich_linkedin_profiles(items: list[dict], *, max_profiles: int = 15) -> list[dict]:
    li_targets = [
        c for c in items
        if _is_linkedin_profile(c.get("url_perfil") or "")
        and "x-ray" in (c.get("fuente") or "").lower()
    ][:max_profiles]

    if not li_targets:
        return [_wrap_extract(c) for c in items]

    cookies = resolve_cookies("linkedin", LI_COOKIES, ".linkedin.com")
    if not cookies:
        return [_wrap_extract(c, li_skip=True) for c in items]

    from playwright.async_api import async_playwright

    extracted_map: dict[str, dict] = {}
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

        for cand in li_targets:
            url = cand.get("url_perfil") or ""
            extracted_map[url] = await _extract_one_profile(page, url)
            await asyncio.sleep(1.5)

        await browser.close()

    out = []
    for raw in items:
        url = raw.get("url_perfil") or ""
        extra = extracted_map.get(url)
        out.append(_wrap_extract(raw, extra=extra))
    return out


def _wrap_extract(raw: dict, extra: dict | None = None, li_skip: bool = False) -> dict:
    perfil = dict(raw.get("perfil") or {})
    fuente = (raw.get("fuente") or "").lower()
    url = raw.get("url_perfil") or ""

    if extra:
        ext = extra.pop("extraccion", {"estado": "completado", "fuente": "linkedin_playwright"})
        perfil.update({k: v for k, v in extra.items() if v})
        perfil["extraccion"] = ext
    elif fuente.startswith("el empleo"):
        completo = bool(
            perfil.get("datos_completos")
            or perfil.get("resumen_perfil")
            or perfil.get("email")
            or perfil.get("telefono")
            or (isinstance(perfil.get("contactos"), list) and len(perfil["contactos"]) > 0)
            or (isinstance(perfil.get("experiencias"), list) and len(perfil["experiencias"]) > 0)
            or (isinstance(perfil.get("formacion"), list) and len(perfil["formacion"]) > 0)
        )
        perfil["extraccion"] = {
            "estado": "completado" if completo else "parcial",
            "fuente": "elempleo_playwright",
            "nota": "Ficha extraída en descubrimiento" if completo else "Solo datos de listado (ficha no completada)",
        }
    elif _is_linkedin_profile(url):
        perfil["extraccion"] = {
            "estado": "pendiente" if li_skip else "omitido",
            "nota": "Conecte LinkedIn en Integraciones para extraer perfiles" if li_skip else "Perfil LI sin extracción",
        }
    else:
        perfil["extraccion"] = {"estado": "omitido", "nota": "Fuente sin extracción adicional"}

    perfil["pipeline_etapa"] = "extraccion"
    return {
        **raw,
        "etapa": "extraccion",
        "enriquecido": bool(raw.get("enriquecido")),
        "perfil": perfil,
    }
