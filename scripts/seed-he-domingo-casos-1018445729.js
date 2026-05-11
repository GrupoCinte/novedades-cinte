/**
 * Inserta 9 novedades «Hora Extra» de prueba para la cédula 1018445729 (recargo dominical).
 *
 * Casos:
 * - A1, A2: domingo, solo recargo, bajo 7,33 h.
 * - B1, B2: domingo, se pasan de 7,33 h; el exceso cae en horas diurnas (civil Bogotá).
 * - C1, C2: domingo, se pasan de 7,33 h; el exceso cae en horas nocturnas (C1 mismo día tarde; C2 con madrugada).
 * - N1, N2, N3 (2025-04-13): tres casos adicionales — sin pasar 7,33 h; pasando con exceso diurno; pasando con exceso nocturno.
 *
 * Requisitos: .env con DB_*, catálogo clientes_lideres, colaborador 1018445729.
 * Para C1/C2 hace falta el CHECK relajado (ver migrations/fix_novedades_hora_extra_orden_allow_overnight.sql).
 *
 * Uso:
 *   psql ... -f migrations/fix_novedades_hora_extra_orden_allow_overnight.sql
 *   node scripts/seed-he-domingo-casos-1018445729.js
 */
'use strict';

require('dotenv').config({ override: true });
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { normalizeCedula } = require('../src/utils');
const { toUtcMsFromDateAndTime } = require('../src/novedadHeTime');
const { computeHoraExtraSplitBogota } = require('../src/heBogotaSplit');

const CEDULA = '1018445729';

function resolveHoraExtraLabel(heDiurnas, heNocturnas, recDomDiurnas, recDomNocturnas) {
    const d = Number(heDiurnas || 0) + Number(recDomDiurnas || 0);
    const n = Number(heNocturnas || 0) + Number(recDomNocturnas || 0);
    if (d > 0 && n > 0) return 'Mixta';
    if (d > 0) return 'Diurna';
    if (n > 0) return 'Nocturna';
    return null;
}

const CASOS = [
    {
        codigo: 'HE-DOM-A1',
        nota: 'Domingo: solo recargo, 1 h (< 7,33)',
        fecha: '2025-04-06',
        fechaInicio: '2025-04-06',
        fechaFin: '2025-04-06',
        horaInicio: '12:00:00',
        horaFin: '13:00:00'
    },
    {
        codigo: 'HE-DOM-A2',
        nota: 'Domingo: solo recargo, 3 h (< 7,33)',
        fecha: '2025-04-06',
        fechaInicio: '2025-04-06',
        fechaFin: '2025-04-06',
        horaInicio: '10:00:00',
        horaFin: '13:00:00'
    },
    {
        codigo: 'HE-DOM-B1',
        nota: 'Domingo: >7,33 h; exceso diurno (06:00–17:00 Bog)',
        fecha: '2025-04-06',
        fechaInicio: '2025-04-06',
        fechaFin: '2025-04-06',
        horaInicio: '06:00:00',
        horaFin: '17:00:00'
    },
    {
        codigo: 'HE-DOM-B2',
        nota: 'Domingo: >7,33 h; exceso diurno (07:00–16:00 Bog)',
        fecha: '2025-04-06',
        fechaInicio: '2025-04-06',
        fechaFin: '2025-04-06',
        horaInicio: '07:00:00',
        horaFin: '16:00:00'
    },
    {
        codigo: 'HE-DOM-C1',
        nota: 'Domingo: >7,33 h; exceso nocturno (11:00–22:00 Bog)',
        fecha: '2025-04-06',
        fechaInicio: '2025-04-06',
        fechaFin: '2025-04-06',
        horaInicio: '11:00:00',
        horaFin: '22:00:00'
    },
    {
        codigo: 'HE-DOM-C2',
        nota: 'Domingo: >7,33 h; exceso nocturno (15:00 dom → 02:00 lun Bog)',
        fecha: '2025-04-06',
        fechaInicio: '2025-04-06',
        fechaFin: '2025-04-07',
        horaInicio: '15:00:00',
        horaFin: '02:00:00'
    },
    {
        codigo: 'HE-DOM-N1',
        nota: 'Nuevo dom 13-abr: <7,33 h solo recargo (09:00–11:00 Bog)',
        fecha: '2025-04-13',
        fechaInicio: '2025-04-13',
        fechaFin: '2025-04-13',
        horaInicio: '09:00:00',
        horaFin: '11:00:00'
    },
    {
        codigo: 'HE-DOM-N2',
        nota: 'Nuevo dom 13-abr: >7,33 h; exceso diurno (07:00–18:00 Bog)',
        fecha: '2025-04-13',
        fechaInicio: '2025-04-13',
        fechaFin: '2025-04-13',
        horaInicio: '07:00:00',
        horaFin: '18:00:00'
    },
    {
        codigo: 'HE-DOM-N3',
        nota: 'Nuevo dom 13-abr: >7,33 h; exceso nocturno (12:00–22:00 Bog)',
        fecha: '2025-04-13',
        fechaInicio: '2025-04-13',
        fechaFin: '2025-04-13',
        horaInicio: '12:00:00',
        horaFin: '22:00:00'
    }
];

async function ensureRelaxedCheck(pool) {
    const sqlPath = path.join(__dirname, '..', 'migrations', 'fix_novedades_hora_extra_orden_allow_overnight.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
}

async function main() {
    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'novedades_cinte',
        user: process.env.DB_USER || 'cinte_app',
        password: process.env.DB_PASSWORD || ''
    });

    const cedulaNorm = normalizeCedula(CEDULA);
    const pair = await pool.query(
        `SELECT cliente, lider FROM clientes_lideres WHERE activo = TRUE LIMIT 1`
    );
    const col = await pool.query(
        `SELECT cedula, nombre, correo_cinte, gp_user_id
         FROM colaboradores
         WHERE activo = TRUE AND regexp_replace(cedula, '[^0-9]', '', 'g') = $1
         LIMIT 1`,
        [cedulaNorm]
    );

    if (!pair.rows[0]) {
        throw new Error('No hay fila activa en clientes_lideres.');
    }
    if (!col.rows[0]) {
        throw new Error(`No hay colaborador activo con cédula ${CEDULA}.`);
    }

    const cliente = String(pair.rows[0].cliente || '').trim();
    const lider = String(pair.rows[0].lider || '').trim();
    const nombre = String(col.rows[0].nombre || '').trim();
    const cedulaRow = String(col.rows[0].cedula || cedulaNorm).trim();
    const correo = String(col.rows[0].correo_cinte || 'lmcorrea91@gmail.com').trim();
    const gpUserId = col.rows[0].gp_user_id || null;

    const obsCol = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'novedades' AND column_name = 'he_domingo_observacion'`
    );
    const hasObs = obsCol.rows.length > 0;

    await ensureRelaxedCheck(pool);

    for (const c of CASOS) {
        const startMs = toUtcMsFromDateAndTime(c.fechaInicio, c.horaInicio);
        const endMs = toUtcMsFromDateAndTime(c.fechaFin, c.horaFin);
        const split = computeHoraExtraSplitBogota(startMs, endMs);
        const tipoHx = resolveHoraExtraLabel(
            split.diurnas,
            split.nocturnas,
            split.horasRecargoDomingoDiurnas,
            split.horasRecargoDomingoNocturnas
        );
        const obs = `[SEED ${c.codigo}] ${c.nota}`;

        const baseVals = [
            nombre,
            cedulaRow,
            correo,
            cliente,
            lider,
            gpUserId,
            'Hora Extra',
            'Capital Humano',
            c.fecha,
            c.horaInicio,
            c.horaFin,
            c.fechaInicio,
            c.fechaFin,
            split.total,
            split.diurnas,
            split.nocturnas,
            split.horasRecargoDomingo,
            split.horasRecargoDomingoDiurnas,
            split.horasRecargoDomingoNocturnas,
            tipoHx,
            null,
            null
        ];

        let r;
        if (hasObs) {
            r = await pool.query(
                `INSERT INTO novedades (
                    nombre, cedula, correo_solicitante, cliente, lider, gp_user_id, tipo_novedad, area,
                    fecha, hora_inicio, hora_fin, fecha_inicio, fecha_fin,
                    cantidad_horas, horas_diurnas, horas_nocturnas, horas_recargo_domingo, horas_recargo_domingo_diurnas, horas_recargo_domingo_nocturnas, tipo_hora_extra,
                    soporte_ruta, monto_cop, estado, he_domingo_observacion
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8::user_area,
                    $9::date, $10::time, $11::time, $12::date, $13::date,
                    $14, $15, $16, $17, $18, $19, $20, $21, $22, 'Pendiente'::novedad_estado, $23
                )
                RETURNING id`,
                [...baseVals, obs]
            );
        } else {
            r = await pool.query(
                `INSERT INTO novedades (
                    nombre, cedula, correo_solicitante, cliente, lider, gp_user_id, tipo_novedad, area,
                    fecha, hora_inicio, hora_fin, fecha_inicio, fecha_fin,
                    cantidad_horas, horas_diurnas, horas_nocturnas, horas_recargo_domingo, horas_recargo_domingo_diurnas, horas_recargo_domingo_nocturnas, tipo_hora_extra,
                    soporte_ruta, monto_cop, estado
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8::user_area,
                    $9::date, $10::time, $11::time, $12::date, $13::date,
                    $14, $15, $16, $17, $18, $19, $20, $21, $22, 'Pendiente'::novedad_estado
                )
                RETURNING id`,
                baseVals
            );
        }
        console.log(`OK ${c.codigo} id=${r.rows[0].id}`, split, hasObs ? obs : '');
    }

    await pool.end();
    console.log('\nListo: 9 novedades HE insertadas. Filtro en Gestión por cédula o por texto [SEED HE-DOM-');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
