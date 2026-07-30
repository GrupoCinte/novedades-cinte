"""El Empleo — Playwright (requiere cookies de sesión empresarial)."""
from __future__ import annotations

import asyncio
import re
from collections.abc import Awaitable, Callable
from urllib.parse import urlparse

from config import EE_COOKIES, PLAYWRIGHT_HEADLESS
from session.store import mark_session_expired, mark_session_restored, resolve_cookies
from scrapers.relevance import passes_relevance
from scrapers.criterios_mapper import normalize_criterios
from scrapers.ee_filters import (
    EE_HV_ACTUALIZADA,
    EE_SEARCH_SCOPE,
    SELECT_NAMES,
)
from scrapers.utils import to_api_candidate

CIUDADES = {
    "bogota": "Bogotá",
    "medellin": "Medellín",
    "cali": "Cali",
    "barranquilla": "Barranquilla",
}

EE_BASE = "https://www.elempleo.com"
OnCandidatoCb = Callable[[dict], Awaitable[None]]

_EE_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"
)
_EE_SEARCH_MARKERS = (
    'select[name="SortByList.SelectedIds"]',
    ".resumeecontainer",
    ".ee-col-user-data-mobile",
    'input[placeholder*="Diseñador"]',
    'input[placeholder*="Administrador"]',
)


async def _ee_new_browser_context(playwright):
    browser = await playwright.chromium.launch(
        headless=PLAYWRIGHT_HEADLESS,
        args=[
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
        ],
    )
    context = await browser.new_context(
        user_agent=_EE_USER_AGENT,
        viewport={"width": 1366, "height": 768},
        locale="es-CO",
    )
    await context.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
    )
    return browser, context


async def _ee_has_search_ui(page) -> bool:
    for sel in _EE_SEARCH_MARKERS:
        if await page.query_selector(sel):
            return True
    return False


async def _ee_session_rejected(page) -> bool:
    """True solo si El Empleo muestra login real, no un falso positivo por URL parcial."""
    if await _ee_has_search_ui(page):
        return False
    path = urlparse(page.url or "").path.lower()
    if "/empresas/buscar" in path:
        return False
    if path.rstrip("/").endswith("/iniciar-sesion"):
        return True
    pwd = await page.query_selector(
        'form[action*="iniciar-sesion"] input[type="password"], '
        'input[type="password"][name*="password" i], '
        'input[type="password"][id*="password" i]'
    )
    return pwd is not None

FECHA_ACT_RE = re.compile(r"\[Actualizada el:\s*([^\]]+)\]", re.I)
FECHA_DDMMYYYY = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})")
RESUMEN_MAX = 5000

EE_SORT_BY_UPDATE = "50"  # SortByList.SelectedIds → "Por Fecha de actualización"

_NAV_LABELS = frozenset({
    "comentarios",
    "cuestionario",
    "contacto",
    "contacto 1",
    "contacto 2",
    "perfil",
    "resumen",
    "volver al listado",
})

_SECTION_EXTRACT_JS = """
() => {
    const modal = document.querySelector('.ee-resume-modals-container')
        || document.querySelector('.ee-resume-detail-container')
        || document.querySelector('.modal-content');
    const result = {
        experiencias: [],
        formacion: [],
        habilidades: [],
        nivel_estudio: '',
        idiomas: ''
    };
    if (!modal) return result;

    const monthRe = /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i;
    const dateLineRe = /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\\s+\\d{4}\\s*-\\s*/i;
    const noise = /^(comentarios|cuestionario|contacto|volver al listado|idiomas)$/i;

    function pushUnique(arr, txt, maxLen = 1200) {
        const t = String(txt || '').replace(/\\s+/g, ' ').trim();
        if (t.length < 20) return;
        if (noise.test(t.split(' ')[0])) return;
        if (arr.some((x) => x === t || x.includes(t) || t.includes(x))) return;
        arr.push(t.slice(0, maxLen));
    }

    function sliceSection(full, startPattern, stopPatterns) {
        const startMatch = full.match(startPattern);
        if (!startMatch || startMatch.index == null) return '';
        const start = startMatch.index + startMatch[0].length;
        let end = full.length;
        for (const stop of stopPatterns) {
            const slice = full.slice(start);
            const m = slice.match(stop);
            if (m && m.index != null) end = Math.min(end, start + m.index);
        }
        return full.slice(start, end).trim();
    }

    function extractExperienciaFromDom(modal) {
        const jobs = [];
        const heads = [...modal.querySelectorAll('h1,h2,h3,h4,h5,strong,b,legend,span,div')].filter((el) => {
            const t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
            return /^Experiencia\\s+laboral$/i.test(t);
        });
        for (const head of heads) {
            let box = head.parentElement;
            for (let depth = 0; depth < 6 && box; depth++) {
                const txt = (box.innerText || '').replace(/\\r/g, '').trim();
                if (txt.length > 80 && dateLineRe.test(txt.split('\\n').find((l) => dateLineRe.test(l)) || '')) {
                    const chunk = sliceSection(
                        txt,
                        /Experiencia\\s+laboral/i,
                        [/^\\s*Estudios\\b/im, /^\\s*Habilidades/im, /^\\s*Comentarios/im]
                    );
                    if (chunk) {
                        const lines = chunk.split('\\n').map((l) => l.trim()).filter(Boolean);
                        for (let i = 0; i < lines.length; i++) {
                            if (!dateLineRe.test(lines[i])) continue;
                            const from = Math.max(0, i - 2);
                            let to = i + 1;
                            while (to < lines.length) {
                                if (to > i + 2 && dateLineRe.test(lines[to])) break;
                                if (/^estudios$/i.test(lines[to]) || /^habilidades/i.test(lines[to])) break;
                                if (to - i > 35) break;
                                to += 1;
                            }
                            pushUnique(jobs, lines.slice(from, to).join(' · '));
                        }
                    }
                    break;
                }
                box = box.parentElement;
            }
        }
        return jobs;
    }

    const fullText = (modal.innerText || '').replace(/\\r/g, '').replace(
        /Experiencia\\s*\\n\\s*laboral/gi,
        'Experiencia laboral'
    );

    // --- Experiencia laboral (texto entre secciones) ---
    const expChunk = sliceSection(
        fullText,
        /Experiencia\\s+laboral/i,
        [/^\\s*Estudios\\b/im, /^\\s*Habilidades y competencias/im, /^\\s*Habilidades\\b/im, /^\\s*Comentarios/im]
    );
    if (expChunk) {
        const lines = expChunk.split('\\n').map((l) => l.trim()).filter(Boolean);
        for (let i = 0; i < lines.length; i++) {
            if (!dateLineRe.test(lines[i])) continue;
            const from = Math.max(0, i - 2);
            let to = i + 1;
            while (to < lines.length) {
                if (to > i + 2 && dateLineRe.test(lines[to])) break;
                if (/^estudios$/i.test(lines[to]) || /^habilidades/i.test(lines[to])) break;
                if (to - i > 35) break;
                to += 1;
            }
            const block = lines.slice(from, to).join(' · ');
            pushUnique(result.experiencias, block);
        }
        if (result.experiencias.length === 0) {
            const blocks = expChunk.split(/\\n{2,}|\\n(?=Área de trabajo:)/);
            blocks.forEach((b) => {
                const t = b.replace(/\\s+/g, ' ').trim();
                if (t.length > 45 && (dateLineRe.test(t) || monthRe.test(t))) {
                    pushUnique(result.experiencias, t);
                }
            });
        }
    }
    if (result.experiencias.length === 0) {
        extractExperienciaFromDom(modal).forEach((j) => pushUnique(result.experiencias, j));
    }

    // --- Estudios ---
    const estChunk = sliceSection(
        fullText,
        /^\\s*Estudios\\b/im,
        [/^\\s*Habilidades y competencias/im, /^\\s*Habilidades\\b/im, /^\\s*Comentarios/im]
    );
    if (estChunk) {
        const estLines = estChunk.split('\\n').map((l) => l.trim()).filter(Boolean);
        let buf = [];
        for (const line of estLines) {
            if (/^estudios$/i.test(line)) continue;
            if (/\\d{4}|universidad|colegio|bachiller|tecnolog|media|formal|doctorado|maestr/i.test(line)) {
                buf.push(line);
                if (buf.length >= 2) {
                    pushUnique(result.formacion, buf.join(' · '), 600);
                    buf = [line];
                }
            }
        }
        if (buf.length) pushUnique(result.formacion, buf.join(' · '), 600);
    }

    // --- Habilidades (tags) ---
    const habChunk = sliceSection(
        fullText,
        /Habilidades(?:\\s+y\\s+competencias)?/i,
        [/^\\s*Comentarios/im, /^\\s*Cuestionario/im, /^\\s*Contacto/im]
    );
    if (habChunk) {
        habChunk.split(/[,\\n·|]/).forEach((part) => {
            const txt = part.replace(/\\s+/g, ' ').trim();
            if (txt.length >= 3 && txt.length <= 45 && !/habilidades|competencias/i.test(txt)) {
                if (!result.habilidades.includes(txt)) result.habilidades.push(txt);
            }
        });
    }

    const heads = [...modal.querySelectorAll('h1,h2,h3,h4,h5,strong,b,legend')];
    for (const head of heads) {
        const title = (head.textContent || '').replace(/\\s+/g, ' ').trim();
        if (/habilidades/i.test(title) && result.habilidades.length < 3) {
            const box = head.parentElement?.parentElement || head.parentElement;
            if (box) {
                [...box.querySelectorAll('span, .badge, .tag, .chip, li, a, button')].forEach((el) => {
                    const txt = (el.textContent || '').replace(/\\s+/g, ' ').trim();
                    if (txt.length >= 3 && txt.length <= 45 && !/habilidades|competencias/i.test(txt)) {
                        if (!result.habilidades.includes(txt)) result.habilidades.push(txt);
                    }
                });
            }
        }
    }

    const nivel = [...modal.querySelectorAll('span, div, p, strong')].find((el) => {
        const t = (el.textContent || '').trim();
        return /^(Universitaria|Tecnológica|Tecnologica|Media|Técnica|Tecnica|Postgrado|Maestría|Maestria)$/i.test(t);
    });
    if (nivel) result.nivel_estudio = nivel.textContent.trim();

    const idiomasEl = [...modal.querySelectorAll('*')].find((el) => {
        const t = (el.textContent || '').trim();
        return /^Idiomas:/i.test(t) && t.length < 120;
    });
    if (idiomasEl) result.idiomas = idiomasEl.textContent.replace(/^Idiomas:\\s*/i, '').trim();

    return result;
}
"""

_ACTIVE_PANEL_SELECTORS = [
    ".ee-resume-modals-container .tab-pane.active",
    ".ee-resume-detail-container .tab-pane.active",
    ".ee-resume-modals-container [role='tabpanel']:not([hidden])",
    "[role='tabpanel'][aria-hidden='false']",
    ".ee-resume-modals-container .panel.active",
]


def _normalizar_ciudad(ciudad: str) -> str:
    if not ciudad:
        return ciudad
    return CIUDADES.get(ciudad.lower().strip(), ciudad)


def _abs_url(href: str) -> str:
    href = (href or "").strip()
    if not href or href.startswith("#") or href.lower().startswith("javascript:"):
        return ""
    if href.startswith("http"):
        return href
    if href.startswith("/"):
        return EE_BASE + href
    return ""


def _profile_url_from_parts(href: str, resumee_id: str, card_id: str) -> str:
    url = _abs_url(href)
    if url and "buscar?" not in url.lower():
        return url
    if resumee_id:
        return f"{EE_BASE}/co/empresas/hoja-de-vida/{resumee_id}"
    if card_id:
        return f"{EE_BASE}/co/empresas/postulacion/{card_id}"
    return ""


def _is_navigable_profile_url(url: str) -> bool:
    if not url:
        return False
    u = url.lower()
    if "buscar?" in u and "#" in u:
        return False
    return any(x in u for x in ("hoja-de-vida", "postulacion/", "resumee", "/cv/"))


def _is_nav_noise(text: str) -> bool:
    t = (text or "").strip().lower()
    if not t or len(t) < 4:
        return True
    if t in _NAV_LABELS:
        return True
    if re.match(r"^contacto\s*\d*$", t):
        return True
    return False


def _parse_fecha_actualizacion(texto: str) -> str:
    m = FECHA_ACT_RE.search(texto or "")
    return m.group(1).strip() if m else ""


def _fecha_sort_key(fecha: str) -> int:
    m = FECHA_DDMMYYYY.search(fecha or "")
    if not m:
        return 0
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return y * 10000 + mo * 100 + d


async def _dedupe_tarjetas(tarjetas: list) -> list:
    seen: set[str] = set()
    out: list = []
    for t in tarjetas:
        link = await t.query_selector("a[data-resumee-id], a.ee-view-resumee")
        rid = ""
        if link:
            rid = ((await link.get_attribute("data-resumee-id")) or "").strip()
        key = rid or str(id(t))
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
    return out


async def _sort_tarjetas_by_fecha(tarjetas: list) -> list:
    if len(tarjetas) <= 1:
        return tarjetas
    keyed: list[tuple[int, object]] = []
    for t in tarjetas:
        try:
            txt = await t.inner_text()
            keyed.append((_fecha_sort_key(_parse_fecha_actualizacion(txt)), t))
        except Exception:
            keyed.append((0, t))
    keyed.sort(key=lambda x: x[0], reverse=True)
    return [t for _, t in keyed]


async def _wait_spinner(page, timeout_ms: int = 8000) -> None:
    try:
        spinner = await page.query_selector(".js-spinner, .ee-global-spinner-wrapper")
        if spinner and await spinner.is_visible():
            await page.wait_for_selector(
                ".js-spinner, .ee-global-spinner-wrapper",
                state="hidden",
                timeout=timeout_ms,
            )
    except Exception:
        await asyncio.sleep(0.5)


async def _set_ee_select2(page, field_name: str, value: str) -> bool:
    """El Empleo usa Select2: hay que disparar change/jQuery además de asignar value."""
    ok = await page.evaluate(
        """([name, val]) => {
            const sel = document.querySelector(`select[name="${name}"]`);
            if (!sel) return false;
            const opt = [...sel.options].find((o) => o.value === val);
            if (!opt) return false;
            sel.value = val;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            if (window.jQuery) {
                const $el = window.jQuery(sel);
                $el.val(val);
                $el.trigger('change');
                $el.trigger('change.select2');
            }
            return true;
        }""",
        [field_name, value],
    )
    if not ok:
        return False
    await _wait_spinner(page, 15000)
    await page.wait_for_load_state("networkidle")
    await asyncio.sleep(2.5)
    return True


async def _sort_by_update_date(page) -> bool:
    """Ordena por «Por Fecha de actualización» (SortByList.SelectedIds = 50)."""
    try:
        # UI Select2: abrir dropdown visible y elegir opción (más fiable que solo .val())
        container = page.locator(
            'select[name="SortByList.SelectedIds"] + span.select2, '
            'span.select2:has(+ select[name="SortByList.SelectedIds"])'
        ).first
        if await container.count() > 0:
            await container.click()
            await asyncio.sleep(0.5)
            option = page.locator(
                '.select2-results__option',
                has_text=re.compile(r"fecha de actualiz", re.I),
            ).first
            if await option.count() > 0:
                await option.click()
                await _wait_spinner(page, 15000)
                await page.wait_for_load_state("networkidle")
                await asyncio.sleep(2.5)
                print("[elempleo] orden: Select2 UI - Por Fecha de actualizacion")
                return True

        if await _set_ee_select2(page, "SortByList.SelectedIds", EE_SORT_BY_UPDATE):
            print("[elempleo] orden: Por Fecha de actualización (SortByList=50)")
            return True

        sel = await page.query_selector('select[name="SortByList.SelectedIds"]')
        if sel:
            await sel.select_option(value=EE_SORT_BY_UPDATE)
            await _wait_spinner(page, 15000)
            await page.wait_for_load_state("networkidle")
            print("[elempleo] orden: select_option SortByList=50")
            return True
    except Exception as exc:
        print(f"[elempleo] sort fecha: {exc}")
    print("[elempleo] orden: no se pudo aplicar SortByList SelectedIds=50")
    return False


async def _input_by_placeholder(page, fragment: str):
    for sel in (
        f"input[placeholder*='{fragment}']",
        f"textarea[placeholder*='{fragment}']",
    ):
        inp = await page.query_selector(sel)
        if inp and await inp.is_visible():
            return inp
    return None


async def _input_palabra(page):
    return await _input_by_placeholder(page, "Diseñador, Administrador")


async def _input_cargo_equivalente(page):
    return await _input_by_placeholder(page, "Administrador, Asesor")


async def _autocomplete_tag_input(page, inp, term: str) -> bool:
    if not inp or not term:
        return False
    try:
        await inp.click()
        await inp.fill(term)
        await asyncio.sleep(1.2)
        option = page.locator(".select2-results__option, .ui-menu-item, [role='option']").first
        if await option.count() > 0:
            await option.click()
        else:
            await page.keyboard.press("Enter")
        await asyncio.sleep(0.8)
        return True
    except Exception as exc:
        print(f"[elempleo] tag {term}: {exc}")
        return False


async def _autocomplete_tag(page, fragment: str, term: str) -> bool:
    inp = await _input_by_placeholder(page, fragment)
    if inp and await _autocomplete_tag_input(page, inp, term):
        print(f"[elempleo] tag ({fragment}): {term}")
        return True
    return False


async def _click_aplicar_filtros(page) -> None:
    try:
        btn = await page.query_selector("button:has-text('Aplicar filtros')")
        if btn and await btn.is_visible():
            await btn.click()
            await page.wait_for_load_state("networkidle")
            await asyncio.sleep(3)
            print("[elempleo] filtros aplicados")
    except Exception as exc:
        print(f"[elempleo] aplicar filtros: {exc}")


async def _set_search_scope(page, scope: str) -> None:
    val = EE_SEARCH_SCOPE.get(scope or "toda_hv")
    if val and await _set_ee_select2(page, SELECT_NAMES["search_scope"], val):
        print(f"[elempleo] alcance búsqueda: {scope}")


async def _set_hv_actualizada(page, hv_key: str | None) -> None:
    if not hv_key:
        return
    val = EE_HV_ACTUALIZADA.get(hv_key)
    if val and await _set_ee_select2(page, SELECT_NAMES["hv_updated"], val):
        print(f"[elempleo] HV actualizada: {hv_key}")


async def _set_experiencia_slider(page, exp_min: int, exp_max: int | None) -> None:
    if exp_min <= 0 and not exp_max:
        return
    try:
        ok = await page.evaluate(
            """([minY, maxY]) => {
                const inputs = [...document.querySelectorAll('input[type=range], .noUi-handle')];
                if (inputs.length < 2) return false;
                const min = Math.max(0, minY || 0);
                const max = maxY && maxY > 0 ? maxY : 15;
                const sliders = document.querySelectorAll('.noUi-target, [class*=slider]');
                return sliders.length > 0 || inputs.length >= 2;
            }""",
            [exp_min, exp_max or 15],
        )
        if ok:
            print(f"[elempleo] experiencia slider: {exp_min}-{exp_max or '15+'}")
    except Exception as exc:
        print(f"[elempleo] experiencia slider: {exc}")


async def _set_ubicacion(page, ciudad: str, ubicacion_tipo: str) -> None:
    if not ciudad:
        return
    ciudad_norm = _normalizar_ciudad(ciudad)
    if ubicacion_tipo == "departamento":
        await _autocomplete_tag(page, "departamento", ciudad_norm)
    elif ubicacion_tipo == "ciudad":
        await _autocomplete_tag(page, "ciudad", ciudad_norm)
    else:
        loc_sel = await page.query_selector(f'select[name="{SELECT_NAMES["location_type"]}"]')
        if loc_sel:
            try:
                await loc_sel.select_option(label=re.compile(r"ciudad", re.I))
            except Exception:
                pass
        await _autocomplete_tag(page, "Colombia", ciudad_norm)


async def _apply_ee_filters_v2(page, criterios: dict, *, level: int = 0) -> bool:
    """Aplica filtros EE según criterios confirmados. level controla fallback."""
    norm = normalize_criterios(criterios)
    cargos = norm["cargos_equivalentes"][:4]
    palabras = norm["palabras_clave_hv"][:3] if level < 1 else []
    ciudad = norm["ciudad"] if level < 2 else ""
    exp_min = norm["experiencia_min"] if level < 2 else 0
    exp_max = norm.get("experiencia_max") if level < 2 else None

    has_any = bool(cargos or palabras or ciudad or exp_min or norm.get("hv_actualizada"))
    if not has_any:
        return False

    await page.evaluate("window.scrollTo(0, 400)")
    await asyncio.sleep(0.5)

    scope = norm.get("search_in_scope") or "toda_hv"
    if scope != "toda_hv":
        await _set_search_scope(page, scope)

    for cargo in cargos:
        inp = await _input_cargo_equivalente(page)
        if inp:
            await _autocomplete_tag_input(page, inp, cargo)
            print(f"[elempleo] cargo equivalente: {cargo}")

    for term in palabras:
        inp = await _input_palabra(page)
        if inp:
            await _autocomplete_tag_input(page, inp, term)
            print(f"[elempleo] palabra clave: {term}")

    if norm.get("profesion"):
        inp = await _input_by_placeholder(page, "Diseñador Gráfico")
        if inp:
            await _autocomplete_tag_input(page, inp, norm["profesion"])
            print(f"[elempleo] profesión: {norm['profesion']}")

    await _set_hv_actualizada(page, norm.get("hv_actualizada"))
    await _set_experiencia_slider(page, exp_min, exp_max)
    if ciudad:
        await _set_ubicacion(page, ciudad, norm.get("ubicacion_tipo") or "ciudad")

    await _click_aplicar_filtros(page)
    return True


async def _keyword_input(page):
    return await _input_palabra(page)


async def _apply_ee_filters(page, ciudad: str, filter_terms: list[str]) -> None:
    """Legacy: redirige a criterios mínimos."""
    crit = {
        "ciudad": ciudad,
        "palabras_clave_hv": filter_terms,
    }
    await _apply_ee_filters_v2(page, crit, level=0)


async def _active_panel(page):
    for sel in _ACTIVE_PANEL_SELECTORS:
        panel = await page.query_selector(sel)
        if panel and await panel.is_visible():
            return panel
    return await page.query_selector(".ee-resume-modals-container, .ee-resume-detail-container")


async def _scroll_modal(page) -> None:
    selectors = (
        ".ee-resume-modals-container",
        ".ee-resume-detail-container",
        ".modal-body",
        ".modal-content",
    )
    for sel in selectors:
        modal = await page.query_selector(sel)
        if not modal:
            continue
        for _ in range(12):
            await page.evaluate("(el) => { el.scrollTop += 280; }", modal)
            await asyncio.sleep(0.2)
        await page.evaluate("(el) => { el.scrollTop = 0; }", modal)
        await asyncio.sleep(0.3)
        for _ in range(12):
            await page.evaluate("(el) => { el.scrollTop += 280; }", modal)
            await asyncio.sleep(0.2)


async def _extract_cv_sections(page) -> dict:
    try:
        try:
            await page.wait_for_function(
                """() => {
                    const m = document.querySelector('.ee-resume-modals-container')
                        || document.querySelector('.ee-resume-detail-container')
                        || document.querySelector('.modal-content');
                    return m && /Experiencia\\s+laboral/i.test(m.innerText || '');
                }""",
                timeout=10000,
            )
        except Exception:
            pass
        await _scroll_modal(page)
        await asyncio.sleep(0.5)
        data = await page.evaluate(_SECTION_EXTRACT_JS)
        if not data:
            return {}
        out = {}
        for key in ("experiencias", "formacion", "habilidades"):
            items = [x for x in (data.get(key) or []) if not _is_nav_noise(x)]
            if items:
                out[key] = items[:12]
        if data.get("nivel_estudio"):
            out["nivel_estudio"] = data["nivel_estudio"]
        if data.get("idiomas"):
            out["idiomas"] = data["idiomas"]
        if not out.get("experiencias") and not out.get("formacion"):
            print("[elempleo] secciones CV vacías tras scroll")
        elif out.get("experiencias"):
            print(f"[elempleo] experiencias: {len(out['experiencias'])} bloques")
        return out
    except Exception as exc:
        print(f"[elempleo] secciones CV: {exc}")
        return {}


async def _click_modal_tab(page, label: str) -> bool:
    patterns = [label, label.rstrip("s"), f"{label}s"]
    for pat in patterns:
        tab = await page.query_selector(
            f".ee-resume-modals-container a:has-text('{pat}'), "
            f".ee-resume-modals-container button:has-text('{pat}'), "
            f"[role='tab']:has-text('{pat}')"
        )
        if tab and await tab.is_visible():
            await page.evaluate("el => el.click()", tab)
            await asyncio.sleep(1)
            await _wait_spinner(page, 6000)
            return True
    return False


async def _panel_text_items(panel, *, min_len: int = 8, limit: int = 12) -> list[str]:
    if not panel:
        return []
    items: list[str] = []
    for sel in (
        "li",
        ".ee-experience-item",
        ".ee-education-item",
        "[class*='experience-item']",
        "[class*='education-item']",
        "[class*='skill-item']",
        "p.description",
        ".media-body",
        "tr",
    ):
        els = await panel.query_selector_all(sel)
        for el in els[:limit * 2]:
            txt = (await el.inner_text()).strip()
            txt = re.sub(r"\s+", " ", txt)
            if _is_nav_noise(txt):
                continue
            if len(txt) < min_len:
                continue
            if txt not in items:
                items.append(txt[:400])
            if len(items) >= limit:
                return items
    return items


async def _extract_contactos(page) -> list[dict]:
    if not await _click_modal_tab(page, "Contacto"):
        return []

    panel = await _active_panel(page)
    if not panel:
        return []

    raw_blocks = await page.evaluate(
        """() => {
            const root = document.querySelector('.tab-pane.active')
                || document.querySelector('[role="tabpanel"]:not([hidden])')
                || document.querySelector('.ee-resume-modals-container');
            if (!root) return [];

            const out = [];
            const headings = [...root.querySelectorAll('h3, h4, h5, strong, label, span, div')];
            for (const h of headings) {
                const t = (h.textContent || '').trim();
                if (!/^contacto\\s*\\d+$/i.test(t)) continue;
                let block = h.closest('.row, .panel, .card, section, div') || h.parentElement;
                if (!block) continue;
                const text = (block.innerText || '').trim();
                const telLink = block.querySelector("a[href*='tel:'], a.ee-link-contact");
                const mailLink = block.querySelector("a[href^='mailto:'], a.ee-link-contact-link");
                const tel = telLink ? (telLink.innerText || telLink.getAttribute('href') || '').replace('tel:', '').trim() : '';
                const mail = mailLink ? (mailLink.innerText || mailLink.getAttribute('href') || '').replace('mailto:', '').trim() : '';
                if (tel || mail) {
                    out.push({ label: t, telefono: tel, email: mail, texto: text.slice(0, 500) });
                }
            }

            if (out.length === 0) {
                const tels = [...root.querySelectorAll("a[href*='tel:'], a.ee-link-contact")];
                const mails = [...root.querySelectorAll("a[href^='mailto:'], a.ee-link-contact-link")];
                tels.forEach((a, i) => {
                    const tel = (a.innerText || a.getAttribute('href') || '').replace('tel:', '').trim();
                    const mailEl = mails[i];
                    const mail = mailEl ? (mailEl.innerText || mailEl.getAttribute('href') || '').replace('mailto:', '').trim() : '';
                    if (tel || mail) out.push({ label: `Contacto ${i + 1}`, telefono: tel, email: mail, texto: '' });
                });
            }
            return out;
        }"""
    )

    contactos: list[dict] = []
    seen: set[str] = set()
    for block in raw_blocks or []:
        tel = (block.get("telefono") or "").strip()
        mail = (block.get("email") or "").strip()
        key = f"{tel}|{mail}"
        if not tel and not mail:
            continue
        if key in seen:
            continue
        seen.add(key)
        contactos.append(
            {
                "label": block.get("label") or f"Contacto {len(contactos) + 1}",
                "telefono": tel,
                "email": mail,
            }
        )
    return contactos[:4]


async def _extract_modal_detail(page, raw: dict) -> dict:
    """Abre ficha modal: secciones CV en cuerpo + contacto en pestaña."""
    try:
        await _wait_spinner(page)

        resumen_el = await page.query_selector(
            ".ee-user-profile-description, [class*='profile-description'], .ee-resume-detail-container p.description"
        )
        if resumen_el:
            txt = (await resumen_el.inner_text()).strip()
            if txt and len(txt) > 20:
                raw["resumen_perfil"] = txt[:RESUMEN_MAX]

        sections = await _extract_cv_sections(page)
        for key in ("experiencias", "formacion", "habilidades", "nivel_estudio", "idiomas"):
            if sections.get(key):
                raw[key] = sections[key]

        contactos = await _extract_contactos(page)
        if contactos:
            raw["contactos"] = contactos
            raw["telefono"] = contactos[0].get("telefono") or raw.get("telefono") or ""
            raw["email"] = contactos[0].get("email") or raw.get("email") or ""

        volver = await page.query_selector("a:has-text('Volver al listado'), button:has-text('Volver')")
        if volver:
            await page.evaluate("el => el.click()", volver)
            await asyncio.sleep(1.5)
            await _wait_spinner(page)
    except Exception as exc:
        print(f"[elempleo] modal {raw.get('nombre', '?')}: {exc}")
        try:
            volver = await page.query_selector("a:has-text('Volver al listado')")
            if volver:
                await page.evaluate("el => el.click()", volver)
                await asyncio.sleep(1)
        except Exception:
            pass
    return raw


async def _parse_tarjeta(page, tarjeta, ciudad_busqueda: str) -> dict | None:
    link = await tarjeta.query_selector("a.ee-view-resumee, a[data-resumee-id]")
    if not link:
        return None

    nombre = (await link.inner_text()).strip()
    if not nombre or len(nombre) < 2:
        return None

    resumee_id = await link.get_attribute("data-resumee-id") or ""
    href = await link.get_attribute("href") or ""
    card_el = await tarjeta.query_selector("[data-card-id]")
    card_id = await card_el.get_attribute("data-card-id") if card_el else ""

    cargo_el = await tarjeta.query_selector("span.professionName, .ee-profession, [class*='profession']")
    cargo_txt = (await cargo_el.inner_text()).strip() if cargo_el else ""

    foto_el = await tarjeta.query_selector("img.ee-foto-candidato, img[class*='foto'], img[class*='photo']")
    foto_url = ""
    if foto_el:
        foto_url = (await foto_el.get_attribute("src") or "").strip()
        if foto_url and not foto_url.startswith("http"):
            foto_url = _abs_url(foto_url)

    email_hidden = await tarjeta.query_selector("input.data-email")
    email = (await email_hidden.get_attribute("value") or "").strip() if email_hidden else ""

    texto = (await tarjeta.inner_text()).strip()
    fecha_actualizacion = _parse_fecha_actualizacion(texto)

    ciudad_txt = ""
    exp_txt = ""
    resumen_txt = ""
    salario_txt = ""
    edad_txt = ""
    for linea in [l.strip() for l in texto.split("\n") if l.strip()]:
        if FECHA_ACT_RE.search(linea):
            continue
        if "|" in linea and "Edad" in linea:
            parts = linea.split("|")
            edad_txt = parts[0].replace("Edad", "").strip()
            ciudad_txt = parts[-1].strip()
        if "año" in linea.lower() and any(c.isdigit() for c in linea):
            exp_txt = linea.strip()
        if len(linea) > 40 and "Edad" not in linea and "$" not in linea and "Actualizada" not in linea:
            if not resumen_txt or len(linea) > len(resumen_txt):
                resumen_txt = linea
        if "$" in linea and ("M" in linea or "COP" in linea.upper()):
            salario_txt = linea.strip()

    url = _profile_url_from_parts(href, resumee_id, card_id)
    if url and not _is_navigable_profile_url(url):
        url = ""

    return {
        "nombre": nombre,
        "cargo": cargo_txt,
        "ciudad": ciudad_txt or _normalizar_ciudad(ciudad_busqueda),
        "experiencia": exp_txt,
        "resumen_perfil": resumen_txt[:RESUMEN_MAX] if resumen_txt else "",
        "salario": salario_txt,
        "foto_url": foto_url,
        "email": email,
        "telefono": "",
        "url": url,
        "resumee_id": resumee_id,
        "card_id": card_id,
        "edad": edad_txt,
        "fecha_actualizacion": fecha_actualizacion,
        "experiencias": [],
        "formacion": [],
        "habilidades": [],
        "contactos": [],
    }


async def buscar_elempleo(
    criterios: dict,
    max_c: int,
    *,
    on_candidato: OnCandidatoCb | None = None,
) -> tuple[list[dict], str | None]:
    norm = normalize_criterios(criterios)
    cargo = norm["cargo"]
    ciudad = norm["ciudad"]
    skills = norm["skills_requeridas"] or norm["skills"]
    keywords = norm["keywords_busqueda"]
    cargos_eq = norm["cargos_equivalentes"]
    from playwright.async_api import async_playwright

    candidatos: list[dict] = []
    error: str | None = None
    contador = 0
    omitidos = 0
    revisados = 0
    vistos: set[str] = set()
    fallback_level = 0
    relax_relevance = False
    max_fallback = 3

    async def _emit(raw: dict) -> None:
        nonlocal omitidos
        if not passes_relevance(
            raw,
            cargo,
            skills,
            keywords,
            cargos_eq,
            relax=relax_relevance,
        ):
            omitidos += 1
            print(
                f"[elempleo] omitido relevancia: {raw.get('nombre', '?')} "
                f"({raw.get('cargo', 'sin cargo')})"
            )
            return
        item = to_api_candidate(raw, "El Empleo", skills)
        perfil = item.get("perfil") or {}
        for key in (
            "resumee_id",
            "card_id",
            "edad",
            "fecha_actualizacion",
            "experiencias",
            "formacion",
            "habilidades",
            "contactos",
            "nivel_estudio",
            "idiomas",
        ):
            if raw.get(key):
                perfil[key] = raw[key]
        perfil["datos_completos"] = bool(
            (perfil.get("resumen_perfil") and len(str(perfil.get("resumen_perfil"))) > 80)
            or perfil.get("email")
            or perfil.get("telefono")
            or (perfil.get("contactos") and len(perfil["contactos"]) > 0)
            or (perfil.get("experiencias") and len(perfil["experiencias"]) > 0)
            or (perfil.get("formacion") and len(perfil["formacion"]) > 0)
        )
        item["perfil"] = perfil
        if not _is_navigable_profile_url(item.get("url_perfil") or ""):
            item["url_perfil"] = None
        candidatos.append(item)
        if on_candidato:
            try:
                await on_candidato(item)
            except Exception as exc:
                print(f"[elempleo] stream callback: {exc}")

    async with async_playwright() as p:
        browser, context = await _ee_new_browser_context(p)
        cookies = resolve_cookies("elempleo", EE_COOKIES, ".elempleo.com")
        if cookies:
            await context.add_cookies(cookies)
        else:
            await browser.close()
            return [], (
                "El Empleo no está conectado o el worker no pudo leer la sesión. "
                "Verifique Integraciones → Conectado y reinicie el worker."
            )

        page = await context.new_page()
        search_url = f"{EE_BASE}/co/empresas/buscar"

        async def _open_search(level: int) -> bool:
            await page.goto(search_url, wait_until="domcontentloaded")
            try:
                await page.wait_for_load_state("networkidle", timeout=45000)
            except Exception:
                pass
            await asyncio.sleep(2)
            if await _ee_session_rejected(page):
                print(f"[elempleo] login detectado en {page.url}")
                return False
            applied = await _apply_ee_filters_v2(page, norm, level=level)
            if not applied and cargos_eq:
                inp = await _input_cargo_equivalente(page)
                for c in cargos_eq[:2]:
                    if inp:
                        await _autocomplete_tag_input(page, inp, c)
                await _click_aplicar_filtros(page)
            await _sort_by_update_date(page)
            return True

        if not await _open_search(fallback_level):
            await browser.close()
            err = (
                "El Empleo rechazó la sesión guardada en el worker. "
                "Renueve en Integraciones → Renovar sesión → Guardar conexión."
            )
            mark_session_expired("elempleo", err)
            return [], err

        mark_session_restored("elempleo", "Sesión El Empleo verificada en búsqueda")

        page_num = 0
        while contador < max_c:
            page_num += 1
            await asyncio.sleep(0.8)
            for _ in range(8):
                await page.evaluate("window.scrollBy(0,500)")
                await asyncio.sleep(0.25)

            tarjetas = await page.query_selector_all(".col-lg-8.ee-col-user-data-mobile, .resumeecontainer")
            tarjetas = await _dedupe_tarjetas(tarjetas)
            tarjetas = await _sort_tarjetas_by_fecha(tarjetas)

            if page_num == 1 and len(tarjetas) < 3 and fallback_level < max_fallback:
                fallback_level += 1
                relax_relevance = fallback_level >= max_fallback
                print(
                    f"[elempleo] pocos resultados ({len(tarjetas)}); "
                    f"fallback nivel {fallback_level}, relax={relax_relevance}"
                )
                vistos.clear()
                omitidos = 0
                revisados = 0
                if not await _open_search(fallback_level):
                    break
                continue

            for t in tarjetas:
                if contador >= max_c:
                    break
                try:
                    raw = await _parse_tarjeta(page, t, ciudad)
                    if not raw:
                        continue
                    dedupe_key = raw.get("resumee_id") or raw.get("nombre", "").lower()
                    if dedupe_key in vistos:
                        continue
                    vistos.add(dedupe_key)
                    revisados += 1

                    if not passes_relevance(
                        raw, cargo, skills, keywords, cargos_eq, relax=relax_relevance
                    ):
                        omitidos += 1
                        print(
                            f"[elempleo] omitido (tarjeta): {raw.get('nombre', '?')} "
                            f"({raw.get('cargo', 'sin cargo')})"
                        )
                        continue

                    cand_link = await t.query_selector(
                        "a.ee-view-resumee, a[data-resumee-id], h3 a, .ee-name a, a[href*='hoja-de-vida']"
                    )
                    if cand_link:
                        try:
                            await _wait_spinner(page)
                            await cand_link.click(timeout=12000)
                            await asyncio.sleep(1)
                            raw = await _extract_modal_detail(page, raw)
                        except Exception as ep:
                            print(f"[elempleo] ficha {raw.get('nombre')}: {ep}")

                    await _emit(raw)
                    contador += 1
                except Exception as exc:
                    print(f"[elempleo] tarjeta: {exc}")

            sig = await page.query_selector("a.next,[aria-label='Siguiente'],a[rel='next']")
            if not sig or contador >= max_c:
                break
            try:
                await _wait_spinner(page, 20000)
                next_btn = page.locator(
                    "a.next, [aria-label='Siguiente'], a[rel='next'], .pagination a:has-text('Siguiente')"
                ).first
                if not await next_btn.count():
                    break
                await next_btn.click(timeout=25000)
                await page.wait_for_load_state("domcontentloaded", timeout=45000)
                await _wait_spinner(page, 20000)
                await asyncio.sleep(1.5)
            except Exception as pag_exc:
                print(f"[elempleo] paginacion: {pag_exc}")
                break

        await browser.close()

    if contador == 0 and omitidos > 0:
        error = (
            f"0 candidatos pasaron el filtro de relevancia "
            f"({omitidos} de {revisados} perfiles revisados)"
        )
    elif contador == 0 and revisados == 0:
        error = "El Empleo no devolvió resultados para esta búsqueda"

    if omitidos:
        print(f"[elempleo] relevancia: {contador} guardados, {omitidos} omitidos de {revisados}")

    return candidatos, error
