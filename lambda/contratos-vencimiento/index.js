/**
 * AUT-319: digest diario de contratos por vencer (T30 → T15 → T5).
 * Independiente de seguimiento-reminders y de email-transactions.
 *
 * Env: API_BASE_URL, CONTRATOS_VENCIMIENTO_TOKEN | INTERNAL_TOKEN,
 *      SES_FROM_EMAIL, AWS_REGION, AS_OF_DATE (opcional YYYY-MM-DD)
 */
'use strict';

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');
const { buildHtml, subjectForKind } = require('./email');

const KINDS = ['T30', 'T15', 'T5'];

function todayBogota() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

async function fetchJson(url, token, init = {}) {
    const res = await fetch(url, {
        ...init,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(init.headers || {})
        }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status} ${url}`);
    return data;
}

async function processKind({ base, token, ses, from, kind, asOfDate }) {
    const q = new URLSearchParams({ kind, asOfDate });
    const data = await fetchJson(`${base}/api/onboarding/internal/elegibles-vencimiento?${q}`, token);
    const items = Array.isArray(data.items) ? data.items : [];
    const recipients = (Array.isArray(data.recipients) ? data.recipients : [])
        .map((r) => String(r?.email || r || '').trim().toLowerCase())
        .filter((e) => e.includes('@'));
    if (items.length === 0) return { kind, skipped: true, reason: 'empty' };
    if (recipients.length === 0) return { kind, skipped: true, reason: 'no_recipients', count: items.length };

    await ses.send(
        new SendEmailCommand({
            Source: from,
            Destination: { ToAddresses: recipients },
            Message: {
                Subject: { Data: subjectForKind(kind, asOfDate, items.length), Charset: 'UTF-8' },
                Body: {
                    Html: { Data: buildHtml({ kind, asOfDate, items }), Charset: 'UTF-8' }
                }
            }
        })
    );

    const marked = await fetchJson(`${base}/api/onboarding/internal/marcar-vencimiento`, token, {
        method: 'POST',
        body: JSON.stringify({
            kind,
            asOfDate,
            contratoIds: items.map((it) => it.contrato_id)
        })
    });
    return { kind, sent: recipients.length, count: items.length, marked: marked.updated || 0 };
}

exports.handler = async () => {
    const base = String(process.env.API_BASE_URL || '').replace(/\/$/, '');
    const token = String(
        process.env.CONTRATOS_VENCIMIENTO_TOKEN || process.env.INTERNAL_TOKEN || ''
    ).trim();
    const from = String(process.env.SES_FROM_EMAIL || '').trim();
    if (!base || !token) throw new Error('API_BASE_URL y token interno requeridos');
    if (!from) throw new Error('SES_FROM_EMAIL requerido');

    const asOfDate = String(process.env.AS_OF_DATE || todayBogota()).slice(0, 10);
    const ses = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });
    const results = [];
    for (const kind of KINDS) {
        try {
            results.push(await processKind({ base, token, ses, from, kind, asOfDate }));
        } catch (e) {
            console.error('[contratos-vencimiento]', kind, e);
            results.push({ kind, ok: false, error: e.message || String(e) });
        }
    }
    return { ok: true, asOfDate, results };
};

exports.processKind = processKind;
