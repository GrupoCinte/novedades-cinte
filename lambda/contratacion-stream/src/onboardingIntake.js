'use strict';

const { normalizeStatus } = require('./mapExecution');

/**
 * Estados terminales n8n que deben promoverse a Postgres (Próximos / Personal).
 * Alineado con `TERMINAL_STATUSES` del portal.
 */
function isTerminalOnboardingStatus(status) {
    const s = normalizeStatus(status);
    if (!s) return false;
    if (
        s === 'contratado' ||
        s === 'finalizado' ||
        s === 'completado' ||
        s === 'contrato recibido' ||
        s === 'contrato_recibido' ||
        s === 'contract_received' ||
        s === 'hired'
    ) {
        return true;
    }
    if (s.includes('contrato') && (s.includes('recib') || s.includes('firmad'))) return true;
    return false;
}

/**
 * POST item Dynamo onboarding al intake del portal (`promoteToColaborador`).
 * @param {object} rawItem Dynamo item (plano)
 * @param {{ eventType?: string, sequenceNumber?: string, shardId?: string }} [meta]
 * @param {{ fetchImpl?: typeof fetch, portalBaseUrl?: string, ingestKey?: string }} [opts]
 */
async function postOnboardingIntake(rawItem, meta = {}, opts = {}) {
    const base = String(opts.portalBaseUrl || process.env.PORTAL_BASE_URL || '')
        .trim()
        .replace(/\/$/, '');
    const key = String(opts.ingestKey || process.env.ONBOARDING_INGEST_KEY || '').trim();
    if (!base) throw new Error('PORTAL_BASE_URL requerida');
    if (!key) throw new Error('ONBOARDING_INGEST_KEY requerida');

    const fetchImpl = opts.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
        throw new Error('fetch no disponible en runtime');
    }

    const url = `${base}/api/onboarding/intake`;
    const body = {
        source: 'dynamo_stream',
        from_dynamo_raw: true,
        event_type: meta.eventType || 'MODIFY',
        sequence_number: meta.sequenceNumber || null,
        shard_id: meta.shardId || null,
        payload: rawItem
    };

    const res = await fetchImpl(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-onboarding-key': key
        },
        body: JSON.stringify(body)
    });

    const text = await res.text();
    let json = null;
    try {
        json = text ? JSON.parse(text) : null;
    } catch {
        json = { raw: text };
    }

    // 422 = portal procesó pero requiere_revision (no reintentar stream).
    if (!res.ok && res.status !== 422) {
        const err = new Error(`Onboarding intake HTTP ${res.status}`);
        err.status = res.status;
        err.body = json;
        throw err;
    }

    return json;
}

module.exports = {
    isTerminalOnboardingStatus,
    postOnboardingIntake
};
