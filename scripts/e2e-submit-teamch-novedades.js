/**
 * Tres radicaciones: 1 tipo Capital Humano (admin_ch + team_ch + cac) + 2× Hora Extra (solo gp).
 *
 * Uso: node scripts/e2e-submit-teamch-novedades.js
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
    if (!pair.rows[0]) throw new Error('No hay clientes_lideres activos.');
    if (!col.rows[0]) throw new Error(`No colaborador ${CEDULA}`);
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
    const res = await fetch(`${BASE}/api/enviar-novedad`, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
}

async function main() {
    const ctx = await loadContext();
    console.log('API:', `${BASE}/api/enviar-novedad`);
    console.log('Colaborador:', ctx.nombre, '/', ctx.cedulaNorm, '\n');

    const common = {
        nombre: ctx.nombre,
        cedula: ctx.cedulaNorm,
        correoSolicitante: CORREO,
        cliente: ctx.cliente,
        lider: ctx.lider
    };

    const r1 = await postNovedad(
        {
            ...common,
            tipoNovedad: 'Incapacidad',
            fechaInicio: '2026-04-01',
            fechaFin: 'N/A',
            cantidadHoras: '0'
        },
        [{ fieldname: 'soportes', buffer: MINIMAL_PDF, mime: 'application/pdf', filename: 'soporte-incapacidad.pdf' }]
    );
    console.log('[1] Incapacidad (admin_ch, team_ch, cac) ->', r1.status, r1.data);

    const r2 = await postNovedad({
        ...common,
        tipoNovedad: 'Hora Extra',
        fecha: '2026-04-14',
        fechaInicio: '2026-04-14',
        fechaFin: '2026-04-14',
        horaInicio: '09:00',
        horaFin: '12:00',
        cantidadHoras: '3',
        horasDiurnas: '3',
        horasNocturnas: '0',
        tipoHoraExtra: 'Diurna'
    });
    console.log('[2] Hora Extra (solo gp) ->', r2.status, r2.data);

    const r3 = await postNovedad({
        ...common,
        tipoNovedad: 'Hora Extra',
        fecha: '2026-04-15',
        fechaInicio: '2026-04-15',
        fechaFin: '2026-04-15',
        horaInicio: '15:00',
        horaFin: '17:00',
        cantidadHoras: '2',
        horasDiurnas: '2',
        horasNocturnas: '0',
        tipoHoraExtra: 'Diurna'
    });
    console.log('[3] Hora Extra (solo gp) ->', r3.status, r3.data);

    if (!r1.ok || !r2.ok || !r3.ok) {
        process.exitCode = 1;
        console.error('\nAlguna radicación falló.');
    } else {
        console.log('\nOK: 1× equipo CH (incl. team_ch) + 2× gp (Hora Extra).');
    }
}

main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
