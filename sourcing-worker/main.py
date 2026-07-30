"""Worker HTTP de scraping — FastAPI."""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, HTTPException
from pydantic import BaseModel, Field

from config import PORT
from runner import run_job

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

app = FastAPI(title="CINTE Sourcing Worker", version="0.1.0")


class RunJobRequest(BaseModel):
    job_id: str
    vacante_id: str
    callback_base_url: str
    callback_secret: str | None = None
    criterios: dict[str, Any] = Field(default_factory=dict)
    fuentes: dict[str, bool] = Field(default_factory=dict)
    max_candidatos: int = 30
    tipo: str = "busqueda"
    meta: dict[str, Any] = Field(default_factory=dict)


class PublishRequest(BaseModel):
    publicacion_id: str
    vacante_id: str
    texto_oferta: str = ""
    callback_base_url: str
    callback_secret: str | None = None
    criterios: dict[str, Any] = Field(default_factory=dict)


class InMailRequest(BaseModel):
    candidato_url: str
    nombre: str
    mensaje: str
    destinatario_id: str | None = None
    campana_id: str | None = None


class ConnectRequest(BaseModel):
    callback_base_url: str
    callback_secret: str | None = None


@app.get("/health")
def health():
    from pipeline.enrichlayer_client import enrichlayer_configured
    from session.connect import PROVIDERS, get_connect_status
    from session.store import fetch_session_cookies

    ee = fetch_session_cookies("elempleo", ".elempleo.com")
    return {
        "ok": True,
        "service": "sourcing-worker",
        "version": "0.7.0-scoring-bedrock",
        "enrichlayer": enrichlayer_configured(),
        "connect": {p: get_connect_status(p) for p in PROVIDERS},
        "integraciones": {
            "elempleo": bool(ee),
            "linkedin": bool(fetch_session_cookies("linkedin", ".linkedin.com")),
        },
    }


@app.get("/connect/{provider}/status")
def connect_status(provider: str):
    from session.connect import PROVIDERS, get_connect_status

    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail="Proveedor desconocido")
    return {"ok": True, "provider": provider, **get_connect_status(provider)}


@app.post("/connect/{provider}")
async def connect_provider(provider: str, payload: ConnectRequest, background: BackgroundTasks):
    from session.connect import PROVIDERS, get_connect_status, _run_connect_flow

    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail="Proveedor desconocido")
    if get_connect_status(provider).get("estado") == "conectando":
        return {"ok": True, "estado": "conectando", "mensaje": "Conexión en curso"}

    secret = payload.callback_secret or __import__("os").getenv("SOURCING_WORKER_CALLBACK_SECRET", "local-sourcing-dev")
    background.add_task(_run_connect_flow, provider, payload.callback_base_url, secret)
    return {
        "ok": True,
        "estado": "conectando",
        "mensaje": "Se abrirá una ventana del navegador en el equipo donde corre el worker.",
    }


@app.post("/run")
async def run(payload: RunJobRequest, background: BackgroundTasks):
    background.add_task(run_job, payload.model_dump())
    return {"ok": True, "accepted": True, "job_id": payload.job_id}


@app.post("/inmail/send")
async def inmail_send(payload: InMailRequest):
    from inmail.send import enviar_inmail

    result = await enviar_inmail(payload.candidato_url, payload.nombre, payload.mensaje)
    return {"ok": result.get("status") == "ok", **result}


@app.post("/publish/{canal}")
async def publish_vacante(canal: str, payload: PublishRequest, background: BackgroundTasks):
    if canal not in ("elempleo", "linkedin"):
        raise HTTPException(status_code=404, detail="Canal desconocido")

    async def _run():
        import httpx
        from config import CALLBACK_SECRET

        if canal == "elempleo":
            from publish.elempleo import publicar_elempleo

            c = payload.criterios or {}
            result = await publicar_elempleo(
                c.get("cargo", ""),
                c.get("ciudad", ""),
                c.get("skills_requeridas") or c.get("skills") or [],
                payload.texto_oferta,
                c.get("tipo_contrato", "Indefinido"),
                c.get("modalidad", "Híbrido"),
            )
        else:
            from publish.linkedin import publicar_linkedin

            result = await publicar_linkedin(payload.texto_oferta)

        estado = "publicada" if result.get("status") == "ok" else "fallida"
        body = {
            "estado": estado,
            "url_publicada": result.get("url_publicada"),
            "url_empresas": result.get("url_empresas"),
            "offer_id": result.get("offer_id"),
            "error_mensaje": result.get("mensaje") if estado == "fallida" else None,
        }
        base = payload.callback_base_url.rstrip("/")
        secret = payload.callback_secret or CALLBACK_SECRET
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                await client.post(
                    f"{base}/api/atraccion/internal/publicaciones/{payload.publicacion_id}/complete",
                    headers={"x-sourcing-worker-key": secret, "Content-Type": "application/json"},
                    json=body,
                )
        except Exception as exc:
            print(f"[publish] callback error: {exc}")

    background.add_task(_run)
    return {"ok": True, "accepted": True, "canal": canal}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
