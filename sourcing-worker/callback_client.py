"""Cliente HTTP hacia el backend Node (callbacks internos)."""
from __future__ import annotations

import httpx

from config import CALLBACK_SECRET


def _clip(text: str | None, limit: int = 480) -> str | None:
    if text is None:
        return None
    return str(text).replace("\u2192", "->")[:limit]


class CallbackClient:
    def __init__(self, base_url: str, secret: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.secret = secret or CALLBACK_SECRET
        self.headers = {
            "Content-Type": "application/json",
            "x-sourcing-worker-key": self.secret,
        }

    async def _post(self, path: str, payload: dict, timeout: float = 30.0):
        url = f"{self.base_url}{path}"
        async with httpx.AsyncClient(timeout=timeout) as client:
            res = await client.post(url, headers=self.headers, json=payload)
            if res.status_code >= 400:
                body = res.text[:500]
                raise RuntimeError(f"Callback {url} -> HTTP {res.status_code}: {body}")
            return res

    async def score(self, job_id: str) -> dict:
        res = await self._post(
            f"/api/atraccion/internal/jobs/{job_id}/score",
            {},
            timeout=300.0,
        )
        try:
            data = res.json()
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    async def phase(
        self,
        job_id: str,
        fase: str,
        *,
        estado: str,
        count: int = 0,
        total: int | None = None,
        error: str | None = None,
    ):
        payload: dict = {"fase": fase, "estado": estado, "count": count, "error": _clip(error)}
        if total is not None:
            payload["total"] = total
        await self._post(f"/api/atraccion/internal/jobs/{job_id}/phase", payload)

    async def progress(self, job_id: str, fuente: str, *, estado: str, count: int = 0, error: str | None = None):
        await self._post(
            f"/api/atraccion/internal/jobs/{job_id}/progress",
            {"fuente": fuente, "estado": estado, "count": count, "error": _clip(error)},
        )

    async def candidatos(self, job_id: str, items: list[dict]):
        if not items:
            return
        await self._post(
            f"/api/atraccion/internal/jobs/{job_id}/candidatos",
            {"candidatos": items},
            timeout=60.0,
        )

    async def complete(self, job_id: str, *, estado: str = "completado", error_mensaje: str | None = None):
        await self._post(
            f"/api/atraccion/internal/jobs/{job_id}/complete",
            {"estado": estado, "error_mensaje": _clip(error_mensaje, 950)},
        )
