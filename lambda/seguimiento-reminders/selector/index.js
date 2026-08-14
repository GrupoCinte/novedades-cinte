/**
 * Lambda selector AUT-286: consulta elegibles T-5/T-1 y encola mensajes SQS.
 * Env:
 *   DATABASE_URL | PG* — conexión PG (o API_BASE_URL + INTERNAL_TOKEN)
 *   QUEUE_URL — SQS destino
 *   AS_OF_DATE — opcional YYYY-MM-DD (America/Bogota)
 */
const { SQSClient, SendMessageBatchCommand } = require('@aws-sdk/client-sqs');

function todayBogota() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

async function fetchElegiblesViaApi(kind, asOfDate) {
    const base = String(process.env.API_BASE_URL || '').replace(/\/$/, '');
    const token = String(process.env.INTERNAL_TOKEN || '').trim();
    if (!base || !token) return null;
    const url = `${base}/api/seguimiento/internal/elegibles-recordatorio?kind=${kind}&asOfDate=${asOfDate}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`API elegibles ${res.status}`);
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
}

async function fetchElegiblesViaPg(kind, asOfDate) {
    const { Client } = require('pg');
    const client = new Client({
        connectionString: process.env.DATABASE_URL || undefined,
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGDATABASE,
        ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined
    });
    await client.connect();
    try {
        const dias = kind === 'T5' ? 5 : 1;
        const flagCol = kind === 'T5' ? 'reminder_t5_sent_at' : 'reminder_t1_sent_at';
        const { rows } = await client.query(
            `SELECT id AS "seguimientoId",
                    $2::text AS kind,
                    ciclo_vence_at::text AS "cicloVenceAt"
             FROM seguimiento_acta
             WHERE deleted_at IS NULL
               AND UPPER(estado) = 'FINALIZADO'
               AND correo_cierre_estado = 'enviado'
               AND ciclo_vence_at IS NOT NULL
               AND ${flagCol} IS NULL
               AND ciclo_vence_at::date = ($1::date + $3::int)`,
            [asOfDate, kind, dias]
        );
        return rows.map((r) => ({
            seguimientoId: r.seguimientoId,
            kind: r.kind,
            cicloVenceAt: String(r.cicloVenceAt || '').slice(0, 10)
        }));
    } finally {
        await client.end();
    }
}

async function enqueueAll(sqs, queueUrl, messages) {
    for (let i = 0; i < messages.length; i += 10) {
        const chunk = messages.slice(i, i + 10);
        await sqs.send(
            new SendMessageBatchCommand({
                QueueUrl: queueUrl,
                Entries: chunk.map((m, idx) => ({
                    Id: String(idx),
                    MessageBody: JSON.stringify(m)
                }))
            })
        );
    }
}

exports.handler = async () => {
    const queueUrl = String(process.env.QUEUE_URL || '').trim();
    if (!queueUrl) throw new Error('QUEUE_URL requerido');
    const asOfDate = String(process.env.AS_OF_DATE || todayBogota()).slice(0, 10);
    const sqs = new SQSClient({ region: process.env.AWS_REGION || 'us-east-1' });

    const all = [];
    for (const kind of ['T5', 'T1']) {
        let items = await fetchElegiblesViaApi(kind, asOfDate);
        if (items == null) items = await fetchElegiblesViaPg(kind, asOfDate);
        for (const it of items) {
            all.push({
                seguimientoId: it.seguimientoId,
                kind,
                cicloVenceAt: it.cicloVenceAt
            });
        }
    }

    if (all.length > 0) await enqueueAll(sqs, queueUrl, all);
    return { ok: true, asOfDate, enqueued: all.length };
};
