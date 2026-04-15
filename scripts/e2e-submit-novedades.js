/**
 * Prueba E2E: 3 radicaciones — 2× Hora Extra (solo gp) + 1× Incapacidad (incluye team_ch).
 * Colaborador y correo por defecto: cédula 1018445729, lmcorrea91@gmail.com.
 *
 * Uso: node scripts/e2e-submit-novedades.js
 *      E2E_API_URL=http://127.0.0.1:3005 node scripts/e2e-submit-novedades.js
 */
require('dotenv').config({ override: true });
const { Pool } = require('pg');
const { normalizeCedula } = require('../src/utils');

const CEDULA = '1018445729';
const CORREO = 'lmcorrea91@gmail.com';
const BASE = String(process.env.E2E_API_URL || `http://127.0.0.1:${process.env.PORT || 3005}`).replace(/\/$/, '');

const MINIMAL_PDF = Buffer.from(
    [
        '%PDF-1.4',
        '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj',
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj',
        '3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R>>endobj',
        'xref',
        '0 4',
        '0000000000 65535 f ',
        'trailer<</Size 4/Root 1 0 R>>',
        'startxref',
        '190',
        '%%EOF',
        ''
    ].join('\n'),
    'utf8'
);

async function loadContext() {
    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'novedades_cinte',
        user: process.env.DB_USER || 'cinte_app',
        password: process.env.DB_PASSWORD || ''
    });
    const pair = await pool.query(
        `SELECT cliente, lider FROM clientes_lideres WHERE activo = TRUE LIMIT 1`
    );
    const col = await pool.query(
        `SELECT cedula, nombre FROM colaboradores
         WHERE activo = TRUE AND regexp_replace(cedula, '[^0-9]', '', 'g') = $1 LIMIT 1`,
        [CEDULA]
    );
    await pool.end();
    if (!pair.rows[0]) {
        throw new Error('No hay fila en clientes_lideres (activo). Importa catálogo cliente/líder.');
    }
    if (!col.rows[0]) {
        throw new Error(`No existe colaborador con cédula numérica ${CEDULA} en colaboradores.`);
    }
    return {
        cliente: String(pair.rows[0].cliente || '').trim(),
        lider: String(pair.rows[0].lider || '').trim(),
        nombre: String(col.rows[0].nombre || '').trim(),
        cedulaNorm: normalizeCedula(col.rows[0].cedula || CEDULA)
    };
}

async function postNovedad(fields, files = []) {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => {
        if (v != null && v !== '') fd.append(k, String(v));
    });
    for (const f of files) {
        fd.append(f.fieldname || 'soportes', new Blob([f.buffer], { type: f.mime }), f.filename);
    }
    const res = await fetch(`${BASE}/api/enviar-novedad`, {
        method: 'POST',
        body: fd
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
}

async function main() {
    const ctx = await loadContext();
    console.log('Contexto BD:', { cliente: ctx.cliente, lider: ctx.lider, nombre: ctx.nombre });
    console.log('API:', `${BASE}/api/enviar-novedad\n`);

    const common = {
        nombre: ctx.nombre,
        cedula: ctx.cedulaNorm,
        correoSolicitante: CORREO,
        cliente: ctx.cliente,
        lider: ctx.lider
    };

    // 1) Hora Extra — approvers solo: gp
    const r1 = await postNovedad({
        ...common,
        tipoNovedad: 'Hora Extra',
        fecha: '2026-04-14',
        fechaInicio: '2026-04-14',
        fechaFin: '2026-04-14',
        horaInicio: '08:00',
        horaFin: '10:30',
        cantidadHoras: '2.5',
        horasDiurnas: '2.5',
        horasNocturnas: '0',
        tipoHoraExtra: 'Diurna'
    });
    console.log('[1] Hora Extra (approvers: gp) ->', r1.status, r1.data);

    // 2) Incapacidad — approvers: admin_ch, team_ch, cac (incluye team_ch)
    const r2 = await postNovedad(
        {
            ...common,
            tipoNovedad: 'Incapacidad',
            fechaInicio: '2026-04-01',
            fechaFin: 'N/A',
            cantidadHoras: '0'
        },
        [{ fieldname: 'soportes', buffer: MINIMAL_PDF, mime: 'application/pdf', filename: 'soporte-incapacidad-e2e.pdf' }]
    );
    console.log('[2] Incapacidad (approvers: admin_ch, team_ch, cac) ->', r2.status, r2.data);

    // 3) Otra Hora Extra — otra vez solo gp (lapso distinto)
    const r3 = await postNovedad({
        ...common,
        tipoNovedad: 'Hora Extra',
        fecha: '2026-04-15',
        fechaInicio: '2026-04-15',
        fechaFin: '2026-04-15',
        horaInicio: '14:00',
        horaFin: '18:00',
        cantidadHoras: '4',
        horasDiurnas: '4',
        horasNocturnas: '0',
        tipoHoraExtra: 'Diurna'
    });
    console.log('[3] Hora Extra (approvers: gp) ->', r3.status, r3.data);

    const allOk = r1.ok && r2.ok && r3.ok;
    if (!allOk) {
        process.exitCode = 1;
        console.error('\nAl menos una radicación falló. Revisa catálogo, fechas (Incapacidad no futura) y soporte.');
    } else {
        console.log('\nLas 3 radicaciones respondieron OK. Revisa correos SES (sandbox) y CloudWatch de la Lambda.');
    }
}

main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
