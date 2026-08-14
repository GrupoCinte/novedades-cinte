/**
 * Lambda worker AUT-286: procesa mensaje SQS { seguimientoId, kind } vía API interna del portal.
 * Env: API_BASE_URL, INTERNAL_TOKEN
 */
async function processOne(msg) {
    const base = String(process.env.API_BASE_URL || '').replace(/\/$/, '');
    const token = String(process.env.INTERNAL_TOKEN || '').trim();
    if (!base || !token) throw new Error('API_BASE_URL e INTERNAL_TOKEN requeridos');
    const body = typeof msg === 'string' ? JSON.parse(msg) : msg;
    const res = await fetch(`${base}/api/seguimiento/internal/process-reminder`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            seguimientoId: body.seguimientoId,
            kind: body.kind
        })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data?.error || `process-reminder HTTP ${res.status}`);
    }
    return data;
}

exports.handler = async (event) => {
    const records = Array.isArray(event?.Records) ? event.Records : [];
    const failures = [];
    for (const rec of records) {
        try {
            await processOne(rec.body);
        } catch (e) {
            console.error('[seguimiento-worker]', e);
            failures.push({ itemIdentifier: rec.messageId });
        }
    }
    return { batchItemFailures: failures };
};
