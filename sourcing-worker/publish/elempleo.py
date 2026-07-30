"""Publicar oferta NUEVA en El Empleo (independiente de búsqueda/postulaciones)."""
from __future__ import annotations

import asyncio
import re
import unicodedata

from config import EE_COOKIES, PLAYWRIGHT_HEADLESS

EE_BASE = "https://www.elempleo.com"
_OFFER_ID_RE = re.compile(
    r"(?:/empresas/(?:ofertas/editar|ofertas/duplicar|buscar/oferta)/|/ofertas-trabajo-)(\d{6,})",
    re.I,
)
_LIST_URL_RE = re.compile(
    r"/empresas(?:/ofertas)?(?:/(?:por-ver|seleccionar-producto|crear|publicadas|activas))?/?$",
    re.I,
)


def _normalize_title(value: str) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"\s+", " ", text.lower()).strip()
    return text


def _extract_offer_id(url: str) -> str:
    match = _OFFER_ID_RE.search(str(url or ""))
    return match.group(1) if match else ""


def _is_concrete_offer_url(url: str) -> bool:
    raw = str(url or "").strip()
    if not raw or "elempleo.com" not in raw:
        return False
    if _LIST_URL_RE.search(raw.split("?", 1)[0]):
        return False
    return bool(_extract_offer_id(raw))


def _urls_for_offer_id(offer_id: str) -> dict:
    oid = str(offer_id or "").strip()
    if not oid.isdigit():
        return {}
    return {
        "offer_id": oid,
        "url_publicada": f"{EE_BASE}/co/ofertas-trabajo-{oid}",
        "url_empresas": f"{EE_BASE}/co/empresas/buscar/oferta/{oid}",
    }


def _title_matches(cargo: str, offer_title: str) -> bool:
    want = _normalize_title(cargo)
    got = _normalize_title(offer_title)
    if not want or not got:
        return False
    if want == got or want in got or got in want:
        return True
    want_tokens = [t for t in want.split(" ") if len(t) > 2]
    return bool(want_tokens) and all(t in got for t in want_tokens)


def _is_new_offer_id(offer_id: str | int | None, max_id_before: int) -> bool:
    try:
        oid = int(str(offer_id or "").strip())
    except (TypeError, ValueError):
        return False
    return oid > int(max_id_before or 0)


async def _fetch_job_offer_items(page, *, length: int = 20) -> list[dict]:
    result = await page.evaluate(
        """async (length) => {
            const res = await fetch('/co/empresas/JobOffer/GetJobOfferItems', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: `Draw=1&Length=${length}&Start=0&IsServerSide=true&SortColumn=Id&SortOrder=desc`,
                credentials: 'same-origin',
            });
            if (!res.ok) return { error: `http_${res.status}`, data: [] };
            const json = await res.json();
            return { data: Array.isArray(json.data) ? json.data : [] };
        }""",
        max(1, min(int(length), 50)),
    )
    if not result or result.get("error"):
        return []
    return result.get("data") or []


async def _snapshot_max_offer_id(page) -> int:
    """Máximo Id actual en Mis Ofertas (antes de crear)."""
    try:
        await page.goto(f"{EE_BASE}/co/empresas/ofertas", wait_until="domcontentloaded")
        await asyncio.sleep(1.5)
    except Exception:
        pass
    if "iniciar-sesion" in page.url:
        return -1
    rows = await _fetch_job_offer_items(page, length=5)
    max_id = 0
    for row in rows:
        try:
            max_id = max(max_id, int(row.get("Id") or 0))
        except (TypeError, ValueError):
            continue
    return max_id


async def _extract_offer_id_from_page(page) -> str:
    oid = _extract_offer_id(page.url)
    if oid:
        return oid
    hrefs = await page.eval_on_selector_all(
        "a[href*='/empresas/ofertas/editar'], a[href*='/empresas/buscar/oferta'], a[href*='ofertas-trabajo']",
        "els => els.map(a => a.href || '').filter(Boolean).slice(0, 20)",
    )
    for href in hrefs or []:
        oid = _extract_offer_id(href)
        if oid:
            return oid
    return ""


def _row_to_offer(row: dict, cargo: str) -> dict:
    return {
        "id": str(row.get("Id") or "").strip(),
        "title": row.get("CompleteTitle") or row.get("Title") or cargo,
        "state": row.get("State") or "",
        "isPublished": bool(row.get("IsPublished")),
        "publicUrl": (row.get("ShareSocialNetwork") or {}).get("OfferUrl") or "",
    }


async def _find_newly_created_offer(page, cargo: str, max_id_before: int) -> dict | None:
    """Solo acepta ofertas con Id > max_id_before (creación real)."""
    rows = await _fetch_job_offer_items(page, length=15)
    title_hit = None
    newest_new = None
    for row in rows:
        oid = str(row.get("Id") or "").strip()
        if not _is_new_offer_id(oid, max_id_before):
            continue
        offer = _row_to_offer(row, cargo)
        if newest_new is None:
            newest_new = offer
        if _title_matches(cargo, offer["title"]) and title_hit is None:
            title_hit = offer
    return title_hit or newest_new


async def _confirm_new_offer(page, cargo: str, max_id_before: int) -> dict | None:
    for attempt in range(6):
        # 1) URL post-submit (editar/{id}) — mejor señal de creación
        oid = await _extract_offer_id_from_page(page)
        if _is_new_offer_id(oid, max_id_before):
            urls = _urls_for_offer_id(oid)
            urls["title"] = cargo
            urls["state"] = ""
            urls["is_published"] = False
            # Refinar con API si ya indexó
            found = await _find_newly_created_offer(page, cargo, max_id_before)
            if found and found["id"] == oid:
                if found.get("publicUrl") and _is_concrete_offer_url(found["publicUrl"]):
                    urls["url_publicada"] = found["publicUrl"]
                urls["title"] = found.get("title") or cargo
                urls["state"] = found.get("state") or ""
                urls["is_published"] = bool(found.get("isPublished"))
            return urls

        # 2) Mis Ofertas: solo Ids nuevos
        if attempt >= 1:
            try:
                await page.goto(f"{EE_BASE}/co/empresas/ofertas", wait_until="domcontentloaded")
                await asyncio.sleep(1.5)
            except Exception:
                pass
            found = await _find_newly_created_offer(page, cargo, max_id_before)
            if found:
                urls = _urls_for_offer_id(found["id"])
                if found.get("publicUrl") and _is_concrete_offer_url(found["publicUrl"]):
                    urls["url_publicada"] = found["publicUrl"]
                urls["title"] = found.get("title") or cargo
                urls["state"] = found.get("state") or ""
                urls["is_published"] = bool(found.get("isPublished"))
                return urls

        await asyncio.sleep(2)
    return None


async def _select_product_if_needed(page) -> str | None:
    """En seleccionar-producto intenta elegir un producto disponible."""
    if "seleccionar-producto" not in page.url and "crear" in page.url:
        return None

    # Botones / enlaces típicos para usar un producto
    selectors = (
        "a:has-text('Crear oferta')",
        "a:has-text('Usar')",
        "button:has-text('Usar')",
        "a:has-text('Seleccionar')",
        "button:has-text('Seleccionar')",
        "a:has-text('Continuar')",
        "button:has-text('Continuar')",
        ".product a[href*='crear']",
        "a[href*='/empresas/ofertas/crear']",
    )
    for sel in selectors:
        el = await page.query_selector(sel)
        if not el:
            continue
        try:
            await el.click()
            await page.wait_for_load_state("networkidle")
            await asyncio.sleep(2)
            return page.url
        except Exception:
            continue
    return None


async def _fill_create_form(page, cargo: str, texto_oferta: str, skills: list) -> str | None:
    filled_title = False
    for ph in ("título", "titulo", "oferta", "Escribe el título"):
        el = await page.query_selector(f"input[placeholder*='{ph}' i]")
        if el:
            await el.fill(cargo)
            filled_title = True
            break
    if not filled_title:
        title_input = await page.query_selector(
            "input[name*='Title' i], input[id*='Title' i], form input[type='text']"
        )
        if title_input:
            await title_input.fill(cargo)
            filled_title = True
    if not filled_title:
        return "No se encontró el campo título de la oferta"

    desc = await page.query_selector("textarea")
    if desc:
        await desc.fill(str(texto_oferta or "")[:4900])

    for skill in (skills or [])[:5]:
        inp = await page.query_selector(
            "input[placeholder*='habilidad' i], input[placeholder*='Habilidad' i]"
        )
        if inp:
            await inp.fill(str(skill))
            await page.keyboard.press("Enter")
            await asyncio.sleep(0.4)
    return None


async def publicar_elempleo(
    cargo: str,
    ciudad: str,
    skills: list,
    texto_oferta: str,
    contrato: str = "Indefinido",
    modalidad: str = "Híbrido",
) -> dict:
    cargo = str(cargo or "").strip()
    if not cargo:
        return {"status": "error", "mensaje": "Cargo/título de oferta requerido"}

    from session.store import resolve_cookies
    from playwright.async_api import async_playwright

    cookies = resolve_cookies("elempleo", EE_COOKIES, ".elempleo.com")
    if not cookies:
        return {"status": "error", "mensaje": "Sesión El Empleo no conectada"}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=PLAYWRIGHT_HEADLESS)
        context = await browser.new_context()
        await context.add_cookies(cookies)
        page = await context.new_page()
        try:
            max_id_before = await _snapshot_max_offer_id(page)
            if max_id_before < 0:
                await browser.close()
                return {"status": "error", "mensaje": "Sesión El Empleo expirada"}

            await page.goto(
                f"{EE_BASE}/co/empresas/ofertas/seleccionar-producto",
                wait_until="domcontentloaded",
            )
            await page.wait_for_load_state("networkidle")
            await asyncio.sleep(2)
            if "iniciar-sesion" in page.url:
                await browser.close()
                return {"status": "error", "mensaje": "Sesión El Empleo expirada"}

            await _select_product_if_needed(page)

            if "crear" not in page.url:
                await page.goto(
                    f"{EE_BASE}/co/empresas/ofertas/crear",
                    referer=f"{EE_BASE}/co/empresas/ofertas/seleccionar-producto",
                    wait_until="domcontentloaded",
                )
                await page.wait_for_load_state("networkidle")
                await asyncio.sleep(2)

            fill_err = await _fill_create_form(page, cargo, texto_oferta, skills)
            if fill_err:
                await browser.close()
                return {"status": "error", "mensaje": fill_err}

            btn = await page.query_selector(
                "button:has-text('Crear Oferta'), button:has-text('Publicar oferta'), "
                "button:has-text('Publicar'), button:has-text('Crear')"
            )
            if not btn:
                await browser.close()
                return {"status": "error", "mensaje": "No se encontró el botón para crear la oferta"}

            await btn.click()
            await page.wait_for_load_state("networkidle")
            await asyncio.sleep(3)

            # Si seguimos en crear/seleccionar sin id, el submit probablemente falló
            still_on_form = (
                "crear" in page.url
                or "seleccionar-producto" in page.url
            ) and _extract_offer_id(page.url) == ""

            confirmed = await _confirm_new_offer(page, cargo, max_id_before)
            await browser.close()

            if not confirmed or not confirmed.get("offer_id"):
                hint = (
                    " El formulario no avanzó tras Crear (posible falta de producto o campos obligatorios)."
                    if still_on_form
                    else ""
                )
                return {
                    "status": "error",
                    "mensaje": (
                        "No se creó una oferta nueva en El Empleo"
                        f" (max Id previo={max_id_before})."
                        " No se reutilizan ofertas antiguas por título."
                        f"{hint}"
                    ),
                }

            if not _is_new_offer_id(confirmed["offer_id"], max_id_before):
                return {
                    "status": "error",
                    "mensaje": (
                        f"Se rechazó Id {confirmed['offer_id']}: no es posterior al snapshot "
                        f"({max_id_before}). Evita falsos positivos por título."
                    ),
                }

            url_publica = confirmed["url_publicada"]
            url_empresas = confirmed["url_empresas"]
            if not _is_concrete_offer_url(url_empresas) and not _is_concrete_offer_url(url_publica):
                return {"status": "error", "mensaje": "La URL capturada no corresponde a una oferta concreta"}

            estado_txt = confirmed.get("state") or ("Publicada" if confirmed.get("is_published") else "")
            return {
                "status": "ok",
                "offer_id": confirmed["offer_id"],
                "url_publicada": url_empresas or url_publica,
                "url_empresas": url_empresas,
                "url_publica": url_publica,
                "max_id_before": max_id_before,
                "mensaje": (
                    f"Oferta '{cargo}' creada en El Empleo"
                    + (f" ({estado_txt})" if estado_txt else "")
                    + f". ID nuevo {confirmed['offer_id']} (prev max {max_id_before})"
                ),
            }
        except Exception as exc:
            try:
                await browser.close()
            except Exception:
                pass
            return {"status": "error", "mensaje": str(exc)[:400]}
