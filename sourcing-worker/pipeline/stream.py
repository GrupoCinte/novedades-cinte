"""Emisión incremental de candidatos hacia el backend."""
from __future__ import annotations

import asyncio
from typing import Any

from callback_client import CallbackClient
from scrapers.salary_filter import excede_aspiracion, salario_max_from_criterios


def tag_discover_item(item: dict) -> dict:
    perfil = dict(item.get("perfil") or {})
    perfil["pipeline_etapa"] = "descubrimiento"
    return {**item, "etapa": "descubrimiento", "enriquecido": False, "perfil": perfil}


class CandidateStream:
    """Buffer + callbacks por candidato (El Empleo es lento → flush por ítem)."""

    def __init__(
        self,
        cb: CallbackClient,
        job_id: str,
        fuente: str,
        discovered: list[dict],
        criterios: dict | None = None,
    ):
        self.cb = cb
        self.job_id = job_id
        self.fuente = fuente
        self.discovered = discovered
        self.count = 0
        self._lock = asyncio.Lock()
        self._sal_max = salario_max_from_criterios(criterios or {})

    async def push(self, item: dict) -> None:
        if self._sal_max:
            perfil = item.get("perfil") or item
            sal = perfil.get("salario") or item.get("salario") or ""
            if excede_aspiracion(sal, self._sal_max):
                return
        tagged = tag_discover_item(item)
        async with self._lock:
            self.discovered.append(tagged)
            self.count += 1
            n = self.count
        try:
            await self.cb.candidatos(self.job_id, [tagged])
            await self.cb.progress(self.job_id, self.fuente, estado="en_progreso", count=n)
            await self.cb.phase(
                self.job_id,
                "descubrimiento",
                estado="en_progreso",
                count=n,
                total=n,
            )
        except Exception as exc:
            print(f"[stream] callback ({self.fuente}): {exc}")
