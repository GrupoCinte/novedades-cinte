'use strict';

function getWorkerUrl() {
    return String(process.env.SOURCING_WORKER_URL || '').trim().replace(/\/$/, '');
}

function isWorkerConfigured() {
    return Boolean(getWorkerUrl());
}

function getCallbackBaseUrl() {
    const explicit = String(process.env.SOURCING_CALLBACK_BASE_URL || '').trim().replace(/\/$/, '');
    if (explicit) return explicit;
    const port = process.env.PORT || 3005;
    return `http://127.0.0.1:${port}`;
}

function getWorkerSecret() {
    return String(process.env.SOURCING_WORKER_CALLBACK_SECRET || 'local-sourcing-dev').trim();
}

/**
 * @param {{ job: object, vacante: object, maxCandidatos?: number, fetchImpl?: typeof fetch }} opts
 */
async function dispatchSourcingJob({ job, vacante, maxCandidatos, fetchImpl = fetch }) {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
        return { dispatched: false, reason: 'worker_not_configured' };
    }

    const criterios = vacante.criterios && typeof vacante.criterios === 'object' ? vacante.criterios : {};
    const payload = {
        job_id: job.id,
        vacante_id: vacante.id,
        callback_base_url: getCallbackBaseUrl(),
        callback_secret: getWorkerSecret(),
        criterios,
        fuentes: job.fuentes || {},
        max_candidatos: Math.min(Math.max(Number(maxCandidatos) || Number(process.env.SOURCING_MAX_CANDIDATOS) || 30, 1), 100)
    };

    const res = await fetchImpl(`${workerUrl}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data.error || data.detail || `Worker HTTP ${res.status}`);
        err.status = res.status;
        throw err;
    }

    return { dispatched: true, workerResponse: data };
}

async function getIntegrationConnectStatus({ provider, fetchImpl = fetch }) {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) return null;
    const p = String(provider || '').trim().toLowerCase();
    const res = await fetchImpl(`${workerUrl}/connect/${p}/status`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return null;
    return data;
}

async function startIntegrationConnect({ provider, fetchImpl = fetch }) {
    const workerUrl = getWorkerUrl();
    if (!workerUrl) {
        throw new Error('Worker no configurado');
    }
    const p = String(provider || '').trim().toLowerCase();
    const res = await fetchImpl(`${workerUrl}/connect/${p}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            callback_base_url: getCallbackBaseUrl(),
            callback_secret: getWorkerSecret()
        })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const detail = data.detail || data.error || `Worker HTTP ${res.status}`;
        throw new Error(
            res.status === 404
                ? `Worker sin ruta /connect/${p} en ${workerUrl}. Reinicie sourcing-worker (python main.py).`
                : detail
        );
    }
    return data;
}

module.exports = {
    dispatchSourcingJob,
    getWorkerUrl,
    isWorkerConfigured,
    getCallbackBaseUrl,
    getWorkerSecret,
    startIntegrationConnect,
    getIntegrationConnectStatus
};
