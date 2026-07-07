"""Orquestación del pipeline: descubrimiento → extracción → enriquecimiento → scoring."""
from __future__ import annotations

import asyncio
import traceback

from callback_client import CallbackClient
from pipeline.enrich import enrich_candidatos
from pipeline.extract import extract_candidatos
from pipeline.stream import CandidateStream, tag_discover_item
from scrapers.criterios_mapper import normalize_criterios, linkedin_keywords
from scrapers.elempleo import buscar_elempleo
from scrapers.linkedin import buscar_linkedin
from scrapers.xray import buscar_xray
from session.store import bind_job_session, clear_job_session


def _short_err(exc: BaseException | str) -> str:
    return str(exc).replace("\u2192", "->")[:480]


def _safe_traceback() -> str:
    return traceback.format_exc().encode("ascii", "replace").decode("ascii")


def _tag_discover(items: list[dict]) -> list[dict]:
    return [tag_discover_item(item) for item in items]


async def _run_fuente_xray(cb, job_id, criterios, max_c, discovered: list):
    fuente = "xray"
    norm = normalize_criterios(criterios)
    await cb.progress(job_id, fuente, estado="en_progreso", count=0)
    try:
        items = _tag_discover(
            await asyncio.to_thread(
                buscar_xray,
                norm,
                max_c,
            )
        )
        discovered.extend(items)
        if items:
            await cb.candidatos(job_id, items)
        await cb.progress(job_id, fuente, estado="completado", count=len(items))
        return len(items), None
    except Exception as exc:
        err = str(exc)
        await cb.progress(job_id, fuente, estado="fallido", count=0, error=err)
        return 0, err


async def _run_fuente_elempleo(cb, job_id, criterios, max_c, discovered: list):
    fuente = "elempleo"
    await cb.progress(job_id, fuente, estado="en_progreso", count=0)
    stream = CandidateStream(cb, job_id, fuente, discovered)
    try:
        items, err = await asyncio.wait_for(
            buscar_elempleo(
                criterios,
                max_c,
                on_candidato=stream.push,
            ),
            timeout=600,
        )
        count = len(items)
        if err and count == 0:
            await cb.progress(job_id, fuente, estado="fallido", count=0, error=err)
            return 0, err
        estado = "completado" if count > 0 else "fallido"
        await cb.progress(job_id, fuente, estado=estado, count=count, error=err if count == 0 else None)
        return count, err if count == 0 else None
    except asyncio.TimeoutError:
        err = "El Empleo excedió el tiempo máximo de búsqueda (10 min)"
        await cb.progress(job_id, fuente, estado="fallido", count=stream.count, error=err)
        return stream.count, err if stream.count == 0 else None
    except Exception as exc:
        err = _short_err(exc)
        await cb.progress(job_id, fuente, estado="fallido", count=stream.count, error=err)
        return stream.count, err if stream.count == 0 else None


async def _run_fuente_linkedin(cb, job_id, criterios, max_c, discovered: list):
    fuente = "linkedin"
    await cb.progress(job_id, fuente, estado="en_progreso", count=0)
    try:
        items, err = await buscar_linkedin(criterios, max_c)
        tagged = _tag_discover(items)
        discovered.extend(tagged)
        if tagged:
            await cb.candidatos(job_id, tagged)
        if err and not tagged:
            await cb.progress(job_id, fuente, estado="fallido", count=0, error=err)
            return 0, err
        estado = "completado" if not err else "fallido"
        await cb.progress(job_id, fuente, estado=estado, count=len(tagged), error=err)
        return len(tagged), err
    except Exception as exc:
        err = str(exc)
        await cb.progress(job_id, fuente, estado="fallido", count=0, error=err)
        return 0, err


async def _phase_discover(cb, job_id, payload, discovered: list) -> tuple[int, list[str], int, int]:
    criterios = normalize_criterios(payload.get("criterios") or {})
    fuentes = payload.get("fuentes") or {}
    max_c = int(payload.get("max_candidatos") or 30)

    await cb.phase(job_id, "descubrimiento", estado="en_progreso", count=0)
    errores: list[str] = []
    fuentes_ok = 0
    fuentes_fail = 0
    total = 0

    runners = []
    if fuentes.get("xray"):
        runners.append(("xray", _run_fuente_xray(cb, job_id, criterios, max_c, discovered)))
    if fuentes.get("elempleo"):
        runners.append(("elempleo", _run_fuente_elempleo(cb, job_id, criterios, max_c, discovered)))
    if fuentes.get("linkedin"):
        runners.append(("linkedin", _run_fuente_linkedin(cb, job_id, criterios, max_c, discovered)))

    if not runners:
        await cb.phase(job_id, "descubrimiento", estado="fallido", count=0, error="Ninguna fuente activa")
        return 0, ["Ninguna fuente activa"], 0, 0

    for name, coro in runners:
        try:
            count, err = await coro
            total += count
            if err:
                errores.append(f"{name}: {err}")
                if count == 0:
                    fuentes_fail += 1
                else:
                    fuentes_ok += 1
            else:
                fuentes_ok += 1
        except Exception as exc:
            errores.append(f"{name}: {exc}")
            fuentes_fail += 1
            print(f"[runner] {name} fatal:\n{_safe_traceback()}")

    fase_estado = "completado" if total > 0 else "fallido"
    await cb.phase(
        job_id,
        "descubrimiento",
        estado=fase_estado,
        count=len(discovered),
        total=len(discovered),
        error=errores[0] if total == 0 and errores else None,
    )
    return total, errores, fuentes_ok, fuentes_fail


async def _phase_extract(cb, job_id, discovered: list) -> list[dict]:
    await cb.phase(
        job_id,
        "extraccion",
        estado="en_progreso",
        count=0,
        total=len(discovered),
    )
    extracted = await extract_candidatos(discovered)
    if extracted:
        await cb.candidatos(job_id, extracted)
    await cb.phase(
        job_id,
        "extraccion",
        estado="completado",
        count=len(extracted),
        total=len(extracted),
    )
    return extracted


async def _phase_enrich(cb, job_id, items: list[dict]) -> list[dict]:
    await cb.phase(
        job_id,
        "enriquecimiento",
        estado="en_progreso",
        count=0,
        total=len(items),
    )
    enriched = await asyncio.to_thread(enrich_candidatos, items)
    if enriched:
        await cb.candidatos(job_id, enriched)
    await cb.phase(
        job_id,
        "enriquecimiento",
        estado="completado",
        count=len(enriched),
        total=len(enriched),
    )
    return enriched


async def _phase_scoring(cb, job_id: str) -> tuple[int, int]:
    await cb.phase(job_id, "scoring", estado="en_progreso", count=0)
    try:
        body = await cb.score(job_id)
        scored = int(body.get("scored") or 0)
        failed = int(body.get("failed") or 0)
        if body.get("skipped"):
            await cb.phase(
                job_id,
                "scoring",
                estado="omitido",
                count=0,
                error=body.get("reason") or "Scoring omitido",
            )
        elif failed and not scored:
            await cb.phase(
                job_id,
                "scoring",
                estado="fallido",
                count=0,
                error=f"{failed} error(es) de scoring",
            )
        else:
            await cb.phase(
                job_id,
                "scoring",
                estado="completado",
                count=scored,
            )
        return scored, failed
    except Exception as exc:
        err = str(exc)
        await cb.phase(job_id, "scoring", estado="fallido", count=0, error=err)
        return 0, 1


async def run_job(payload: dict):
    job_id = payload["job_id"]
    callback_base = payload["callback_base_url"]
    secret = payload.get("callback_secret")
    bind_job_session(callback_base, secret)
    cb = CallbackClient(callback_base, secret)

    discovered: list[dict] = []
    errores: list[str] = []

    try:
        total, discover_errors, fuentes_ok, fuentes_fail = await _phase_discover(cb, job_id, payload, discovered)
        errores.extend(discover_errors)

        if not discovered:
            await cb.phase(job_id, "extraccion", estado="omitido", count=0, error="Sin candidatos")
            await cb.phase(job_id, "enriquecimiento", estado="omitido", count=0)
            await cb.phase(job_id, "scoring", estado="omitido", count=0, error="Sin candidatos")
            await cb.complete(
                job_id,
                estado="fallido",
                error_mensaje=" · ".join(errores) if errores else "Sin candidatos en descubrimiento",
            )
            return

        extracted = await _phase_extract(cb, job_id, discovered)
        await _phase_enrich(cb, job_id, extracted)
        await _phase_scoring(cb, job_id)

        if total == 0 and fuentes_fail > 0:
            estado = "fallido"
        elif errores:
            estado = "parcial"
        else:
            estado = "completado"

        await cb.complete(
            job_id,
            estado=estado,
            error_mensaje=" · ".join(errores) if errores else None,
        )
    except Exception as exc:
        print(f"[runner] pipeline fatal:\n{_safe_traceback()}")
        await cb.complete(job_id, estado="fallido", error_mensaje=str(exc))
    finally:
        clear_job_session()
