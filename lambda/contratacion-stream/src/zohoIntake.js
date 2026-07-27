'use strict';

/**
 * POST payload Zoho al intake del portal.
 * @param {object} rawItem Dynamo item (plano)
 * @param {{ eventType?: string }} [meta]
 * @param {{ fetchImpl?: typeof fetch, portalBaseUrl?: string, ingestKey?: string }} [opts]
 */
async function postZohoIntake(rawItem, meta = {}, opts = {}) {
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

    const url = `${base}/api/onboarding/ficha-novedades/intake`;
    const body = {
        source: 'dynamo_stream_zoho',
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

    if (!res.ok) {
        const err = new Error(`Zoho intake HTTP ${res.status}`);
        err.status = res.status;
        err.body = json;
        throw err;
    }

    return json;
}

module.exports = { postZohoIntake };
