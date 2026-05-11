#!/usr/bin/env node
/**
 * Recalcula cantidad_horas, horas_diurnas/nocturnas, recargo domingo y tipo_hora_extra
 * para filas existentes de tipo Hora Extra, usando la misma lógica que el alta en registerRoutes
 * (toUtcMsFromDateAndTime + computeHoraExtraSplitBogota + resolveHoraExtraLabel).
 *
 * Uso (requiere .env con DB_* igual que el servidor):
 *   node scripts/backfill-he-bogota-split.js           # simulación: solo lista cambios
 *   node scripts/backfill-he-bogota-split.js --apply  # ejecuta UPDATE
 *
 * Opcional: --id=<uuid>  solo esa fila (debe ser HE).
 */
'use strict';

require('dotenv').config();
const { Pool } = require('pg');
const { normalizeNovedadTypeKey } = require('../src/rbac');
const { toUtcMsFromDateAndTime } = require('../src/novedadHeTime');
const { computeHoraExtraSplitBogota, resolveHoraExtraLabel } = require('../src/heBogotaSplit');

const MAX_HORA_EXTRA_MS = 168 * 60 * 60 * 1000;

function argId() {
    const a = process.argv.find((x) => x.startsWith('--id='));
    return a ? String(a.slice(5)).trim() : '';
}

function ymdFromPg(value) {
    if (value == null) return '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value.trim())) return value.trim().slice(0, 10);
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    return '';
}

function timeHmFromPg(value) {
    if (value == null) return '';
    if (typeof value === 'string') {
        const s = value.trim();
        if (!s) return '';
        const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(s);
        if (!m) return '';
        const h = String(Number(m[1])).padStart(2, '0');
        const min = m[2];
        const sec = m[3] != null ? `:${m[3]}` : '';
        return `${h}:${min}${sec}`;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(11, 19);
    }
    return String(value).trim();
}

function num2(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function sameSplit(row, split, tipoLabel) {
    const eps = 0.02;
    const close = (a, b) => Math.abs(num2(a) - num2(b)) <= eps;
    return (
        close(row.cantidad_horas, split.total) &&
        close(row.horas_diurnas, split.diurnas) &&
        close(row.horas_nocturnas, split.nocturnas) &&
        close(row.horas_recargo_domingo, split.horasRecargoDomingo) &&
        close(row.horas_recargo_domingo_diurnas, split.horasRecargoDomingoDiurnas) &&
        close(row.horas_recargo_domingo_nocturnas, split.horasRecargoDomingoNocturnas) &&
        String(row.tipo_hora_extra || '').trim() === String(tipoLabel || '').trim()
    );
}

async function main() {
    const apply = process.argv.includes('--apply');
    const onlyId = argId();
    const pwd = String(process.env.DB_PASSWORD || '').trim();
    if (!pwd) {
        console.error('Falta DB_PASSWORD en el entorno (.env).');
        process.exit(1);
    }

    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'novedades_cinte',
        user: process.env.DB_USER || 'cinte_app',
        password: pwd
    });

    let sql = `
        SELECT id, tipo_novedad, fecha_inicio, fecha_fin, hora_inicio, hora_fin,
               cantidad_horas, horas_diurnas, horas_nocturnas,
               horas_recargo_domingo, horas_recargo_domingo_diurnas, horas_recargo_domingo_nocturnas,
               tipo_hora_extra
        FROM novedades
    `;
    const params = [];
    if (onlyId) {
        sql += ` WHERE id = $1::uuid`;
        params.push(onlyId);
    }
    sql += ` ORDER BY creado_en NULLS LAST, id`;

    const { rows } = await pool.query(sql, params);

    const planned = [];
    const skipped = [];

    for (const row of rows) {
        const tipoKey = normalizeNovedadTypeKey(row.tipo_novedad);
        if (tipoKey !== 'hora_extra') {
            skipped.push({ id: row.id, reason: 'not_hora_extra', tipo: row.tipo_novedad });
            continue;
        }

        const fi = ymdFromPg(row.fecha_inicio);
        const ff = ymdFromPg(row.fecha_fin);
        const hi = timeHmFromPg(row.hora_inicio);
        const hf = timeHmFromPg(row.hora_fin);
        if (!fi || !ff || !hi || !hf) {
            skipped.push({ id: row.id, reason: 'missing_date_or_time', fi, ff, hi, hf });
            continue;
        }

        let startMs;
        let endMs;
        try {
            startMs = toUtcMsFromDateAndTime(fi, hi);
            endMs = toUtcMsFromDateAndTime(ff, hf);
        } catch (e) {
            skipped.push({ id: row.id, reason: 'time_parse_error', message: e?.message || String(e) });
            continue;
        }

        if (startMs == null || endMs == null || !Number.isFinite(endMs - startMs) || endMs <= startMs) {
            skipped.push({ id: row.id, reason: 'invalid_range', startMs, endMs });
            continue;
        }
        if (endMs - startMs > MAX_HORA_EXTRA_MS) {
            skipped.push({ id: row.id, reason: 'span_over_168h' });
            continue;
        }

        const split = computeHoraExtraSplitBogota(startMs, endMs);
        if (!split || split.total <= 0) {
            skipped.push({ id: row.id, reason: 'zero_split' });
            continue;
        }

        const tipoLabel = resolveHoraExtraLabel(
            split.diurnas,
            split.nocturnas,
            split.horasRecargoDomingoDiurnas,
            split.horasRecargoDomingoNocturnas
        );

        if (sameSplit(row, split, tipoLabel)) {
            skipped.push({ id: row.id, reason: 'unchanged' });
            continue;
        }

        planned.push({
            id: row.id,
            before: {
                cantidad_horas: num2(row.cantidad_horas),
                horas_diurnas: num2(row.horas_diurnas),
                horas_nocturnas: num2(row.horas_nocturnas),
                horas_recargo_domingo: num2(row.horas_recargo_domingo),
                horas_recargo_domingo_diurnas: num2(row.horas_recargo_domingo_diurnas),
                horas_recargo_domingo_nocturnas: num2(row.horas_recargo_domingo_nocturnas),
                tipo_hora_extra: row.tipo_hora_extra || null
            },
            after: {
                cantidad_horas: split.total,
                horas_diurnas: split.diurnas,
                horas_nocturnas: split.nocturnas,
                horas_recargo_domingo: split.horasRecargoDomingo,
                horas_recargo_domingo_diurnas: split.horasRecargoDomingoDiurnas,
                horas_recargo_domingo_nocturnas: split.horasRecargoDomingoNocturnas,
                tipo_hora_extra: tipoLabel
            }
        });
    }

    console.log(`Modo: ${apply ? 'APLICAR (--apply)' : 'SIMULACIÓN (sin --apply)'}`);
    console.log(`Filas HE candidatas (tras filtros): ${rows.filter((r) => normalizeNovedadTypeKey(r.tipo_novedad) === 'hora_extra').length}`);
    console.log(`A actualizar: ${planned.length}`);
    console.log(`Sin cambio u omitidas: ${skipped.length}`);

    for (const p of planned) {
        console.log(JSON.stringify({ id: p.id, before: p.before, after: p.after }));
    }

    const skipReasons = skipped.reduce((acc, s) => {
        acc[s.reason] = (acc[s.reason] || 0) + 1;
        return acc;
    }, {});
    if (Object.keys(skipReasons).length) {
        console.log('Omitidas por motivo:', skipReasons);
    }

    if (!apply) {
        console.log('\nPara ejecutar los UPDATE, vuelve a correr con --apply.');
        await pool.end();
        return;
    }

    if (planned.length === 0) {
        await pool.end();
        return;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const p of planned) {
            await client.query(
                `UPDATE novedades SET
                    cantidad_horas = $1::numeric,
                    horas_diurnas = $2::numeric,
                    horas_nocturnas = $3::numeric,
                    horas_recargo_domingo = $4::numeric,
                    horas_recargo_domingo_diurnas = $5::numeric,
                    horas_recargo_domingo_nocturnas = $6::numeric,
                    tipo_hora_extra = $7
                 WHERE id = $8::uuid`,
                [
                    p.after.cantidad_horas,
                    p.after.horas_diurnas,
                    p.after.horas_nocturnas,
                    p.after.horas_recargo_domingo,
                    p.after.horas_recargo_domingo_diurnas,
                    p.after.horas_recargo_domingo_nocturnas,
                    p.after.tipo_hora_extra,
                    p.id
                ]
            );
        }
        await client.query('COMMIT');
        console.log(`\nOK: ${planned.length} fila(s) actualizada(s).`);
    } catch (e) {
        await client.query('ROLLBACK');
        console.error('ROLLBACK por error:', e?.message || e);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
