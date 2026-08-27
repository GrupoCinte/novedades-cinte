'use strict';

const {
    BANDA_DIAS,
    FLAG_COL,
    bandaVentana,
    daysUntil,
    isoDay,
    parseKind,
    resolveAsOfDate,
    ventanaRango
} = require('./contratoVencimiento');

const TIPO_SQL = `
    NOT (translate(lower(coalesce(cc.tipo_contrato, '')), 'áéíóúüñ', 'aeiouun') LIKE '%indefinido%')
    AND (
        translate(lower(coalesce(cc.tipo_contrato, '')), 'áéíóúüñ', 'aeiouun')
            ~ '(ops|fijo|obra|labor|prestacion|honorario)'
        OR translate(lower(coalesce(cc.esquema_contrato, '')), 'áéíóúüñ', 'aeiouun')
            ~ '(ops|prestacion|honorario|cuenta propia)'
    )
`;

const SORT_MAP = {
    dias_restantes: 'dias_restantes',
    fecha_termino: 'cc.fecha_termino',
    nombre: 'c.nombre',
    cedula: 'c.cedula',
    cliente: 'cc.cliente',
    tipo_contrato: 'cc.tipo_contrato'
};

function isAllowedPorVencerSort(sort) {
    if (sort == null || sort === '') return true;
    return Boolean(SORT_MAP[String(sort)]);
}

async function ensureContratoVencimientoColumns(pool, logger) {
    try {
        await pool.query(`
            ALTER TABLE colaborador_contratos
            ADD COLUMN IF NOT EXISTS reminder_t30_sent_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS reminder_t15_sent_at TIMESTAMPTZ NULL,
            ADD COLUMN IF NOT EXISTS reminder_t5_sent_at TIMESTAMPTZ NULL
        `);
    } catch (error) {
        if (String(error?.code || '') === '42501') {
            if (logger && typeof logger.warn === 'function') {
                logger.warn('[Onboarding] Sin permiso para columnas de alerta de vencimiento.');
            }
            return;
        }
        throw error;
    }
}

function createContratoVencimientoService({ pool, listEmailsInGroups } = {}) {
    async function listPorVencer({
        asOfDate,
        kind,
        q,
        cliente,
        limit = 50,
        offset = 0,
        sort,
        dir,
        scopeSql,
        scopeParams = []
    } = {}) {
        const asOf = resolveAsOfDate(asOfDate);
        const rango = ventanaRango(kind);
        const where = [
            'cc.vigente IS TRUE',
            'cc.fecha_termino IS NOT NULL',
            `(cc.fecha_termino - $1::date) BETWEEN $2 AND $3`,
            `(${TIPO_SQL})`
        ];
        const params = [asOf, rango.min, rango.max];
        let p = 4;

        if (scopeSql === 'FALSE') {
            return { items: [], total: 0, limit, offset, asOfDate: asOf };
        }
        if (scopeSql && scopeSql !== 'TRUE') {
            where.push(scopeSql);
            params.push(...scopeParams);
            p += scopeParams.length;
        }
        if (cliente) {
            params.push(String(cliente).trim().toLowerCase());
            where.push(`LOWER(TRIM(cc.cliente)) = $${p++}`);
        }
        if (q) {
            params.push(`%${String(q).toLowerCase()}%`);
            where.push(
                `(LOWER(c.cedula) LIKE $${p} OR LOWER(c.nombre) LIKE $${p} OR LOWER(COALESCE(cc.cliente, '')) LIKE $${p})`
            );
            p += 1;
        }

        const whereSql = `WHERE ${where.join(' AND ')}`;
        const countQ = await pool.query(
            `SELECT COUNT(*)::int AS total
             FROM colaborador_contratos cc
             JOIN colaboradores c ON c.cedula = cc.cedula
             ${whereSql}`,
            params
        );
        const total = Number(countQ.rows[0]?.total || 0);

        const sortCol = SORT_MAP[sort] || 'dias_restantes';
        const direction = dir === 'desc' ? 'DESC' : 'ASC';
        params.push(limit, offset);
        const listQ = await pool.query(
            `SELECT
                cc.id AS contrato_id,
                c.cedula,
                c.nombre,
                cc.cliente,
                cc.tipo_contrato,
                cc.esquema_contrato,
                cc.fecha_termino,
                (cc.fecha_termino - $1::date) AS dias_restantes
             FROM colaborador_contratos cc
             JOIN colaboradores c ON c.cedula = cc.cedula
             ${whereSql}
             ORDER BY ${sortCol} ${direction} NULLS LAST, c.nombre ASC, cc.id ASC
             LIMIT $${p++} OFFSET $${p++}`,
            params
        );

        const items = (listQ.rows || []).map((row) => {
            const dias = Number(row.dias_restantes);
            return {
                contrato_id: String(row.contrato_id),
                cedula: row.cedula,
                nombre: row.nombre,
                cliente: row.cliente,
                tipo_contrato: row.tipo_contrato,
                esquema_contrato: row.esquema_contrato,
                fecha_termino: isoDay(row.fecha_termino),
                dias_restantes: dias,
                banda: parseKind(kind) || bandaVentana(dias)
            };
        });

        return { items, total, limit, offset, asOfDate: asOf };
    }

    async function listElegiblesExactos({ kind, asOfDate } = {}) {
        const k = parseKind(kind);
        if (!k) {
            const err = new Error('kind debe ser T30, T15 o T5');
            err.statusCode = 400;
            throw err;
        }
        const asOf = resolveAsOfDate(asOfDate);
        const dias = BANDA_DIAS[k];
        const flagCol = FLAG_COL[k];
        const { rows } = await pool.query(
            `SELECT
                cc.id AS contrato_id,
                c.cedula,
                c.nombre,
                cc.cliente,
                cc.tipo_contrato,
                cc.fecha_termino
             FROM colaborador_contratos cc
             JOIN colaboradores c ON c.cedula = cc.cedula
             WHERE cc.vigente IS TRUE
               AND cc.fecha_termino IS NOT NULL
               AND cc.${flagCol} IS NULL
               AND (cc.fecha_termino - $1::date) = $2
               AND (${TIPO_SQL})
             ORDER BY c.nombre ASC, cc.cliente ASC`,
            [asOf, dias]
        );
        return (rows || []).map((row) => ({
            contrato_id: String(row.contrato_id),
            cedula: row.cedula,
            nombre: row.nombre,
            cliente: row.cliente,
            tipo_contrato: row.tipo_contrato,
            fecha_termino: isoDay(row.fecha_termino),
            dias_restantes: daysUntil(row.fecha_termino, asOf),
            kind: k
        }));
    }

    async function resolveChRecipients() {
        const seen = new Set();
        const recipients = [];
        if (typeof listEmailsInGroups !== 'function') return recipients;
        try {
            const res = await listEmailsInGroups(['admin_ch', 'team_ch']);
            const emails = Array.isArray(res?.emails) ? res.emails : Array.isArray(res) ? res : [];
            for (const e of emails) {
                const email = String(e || '').trim().toLowerCase();
                if (!email.includes('@') || seen.has(email)) continue;
                seen.add(email);
                recipients.push({ email });
            }
        } catch (e) {
            console.warn('[ContratoVencimiento] listEmailsInGroups falló:', e?.message || e);
        }
        return recipients;
    }

    async function marcarEnviados({ kind, contratoIds, asOfDate } = {}) {
        const k = parseKind(kind);
        if (!k) {
            const err = new Error('kind debe ser T30, T15 o T5');
            err.statusCode = 400;
            throw err;
        }
        const ids = (Array.isArray(contratoIds) ? contratoIds : [])
            .map((id) => String(id || '').trim())
            .filter((id) => /^[0-9a-f-]{36}$/i.test(id));
        if (ids.length === 0) return { updated: 0 };
        const asOf = resolveAsOfDate(asOfDate);
        const flagCol = FLAG_COL[k];
        const dias = BANDA_DIAS[k];
        const q = await pool.query(
            `UPDATE colaborador_contratos cc
             SET ${flagCol} = NOW(), updated_at = NOW()
             WHERE cc.id = ANY($1::uuid[])
               AND cc.${flagCol} IS NULL
               AND cc.vigente IS TRUE
               AND (cc.fecha_termino - $2::date) = $3`,
            [ids, asOf, dias]
        );
        return { updated: q.rowCount || 0 };
    }

    return {
        listPorVencer,
        listElegiblesExactos,
        resolveChRecipients,
        marcarEnviados
    };
}

module.exports = {
    TIPO_SQL,
    createContratoVencimientoService,
    ensureContratoVencimientoColumns,
    isAllowedPorVencerSort
};
