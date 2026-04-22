/**
 * Carga 20 radicaciones distintas contra POST /api/enviar-novedad (mismos campos que el formulario).
 * Usa 20 filas (cedula, cliente, líder) válidas desde BD tras migración de catálogo.
 *
 * Uso:
 *   node scripts/load-test-formulario-20.js
 *   E2E_API_URL=http://127.0.0.1:3005 node scripts/load-test-formulario-20.js
 */
require('dotenv').config({ override: true });
const { Pool } = require('pg');
const { normalizeCedula } = require('../src/utils');

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

const CASOS = [
    (i) => ({
        tipoNovedad: 'Hora Extra',
        fecha: '2026-03-10',
        fechaInicio: '2026-03-10',
        fechaFin: '2026-03-10',
        horaInicio: '08:00',
        horaFin: `${10 + (i % 5)}:30`,
        cantidadHoras: '1',
        horasDiurnas: '1',
        horasNocturnas: '0',
        tipoHoraExtra: 'Diurna',
        files: []
    }),
    (i) => ({
        tipoNovedad: 'Hora Extra',
        fecha: '2026-03-11',
        fechaInicio: '2026-03-11',
        fechaFin: '2026-03-11',
        horaInicio: '14:00',
        horaFin: '17:00',
        cantidadHoras: '3',
        horasDiurnas: '3',
        horasNocturnas: '0',
        tipoHoraExtra: 'Diurna',
        files: []
    }),
    () => ({
        tipoNovedad: 'Permiso no remunerado',
        fechaInicio: '2026-03-12',
        fechaFin: '2026-03-12',
        horaInicio: '09:00',
        horaFin: '13:00',
        cantidadHoras: '4',
        files: []
    }),
    () => ({
        tipoNovedad: 'Licencia no remunerada',
        fechaInicio: '2026-03-03',
        fechaFin: '2026-03-05',
        cantidadHoras: '3',
        files: []
    }),
    () => ({
        tipoNovedad: 'Vacaciones en dinero',
        fechaInicio: '2026-03-01',
        diasSolicitados: '5',
        cantidadHoras: '5',
        files: []
    }),
    () => ({
        tipoNovedad: 'Bonos',
        fechaInicio: '2026-03-15',
        montoCop: '250000',
        cantidadHoras: '0',
        files: []
    }),
    () => ({
        tipoNovedad: 'Disponibilidad',
        fechaInicio: '2026-03-16',
        montoCop: '180000',
        cantidadHoras: '0',
        files: []
    }),
    () => ({
        tipoNovedad: 'Incapacidad',
        fechaInicio: '2026-02-10',
        fechaFin: 'N/A',
        cantidadHoras: '0',
        files: [{ fieldname: 'soportes', buffer: MINIMAL_PDF, mime: 'application/pdf', filename: 'soporte-inc.pdf' }]
    }),
    () => ({
        tipoNovedad: 'Calamidad domestica',
        fechaInicio: '2026-02-15',
        fechaFin: '2026-02-17',
        cantidadHoras: '3',
        files: [{ fieldname: 'soportes', buffer: MINIMAL_PDF, mime: 'application/pdf', filename: 'calamidad.pdf' }]
    }),
    () => ({
        tipoNovedad: 'Permiso remunerado',
        fechaInicio: '2026-02-20',
        fechaFin: '2026-02-20',
        cantidadHoras: '1',
        files: [{ fieldname: 'soportes', buffer: MINIMAL_PDF, mime: 'application/pdf', filename: 'perm-rem.pdf' }]
    })
];

async function loadVeinteContextos() {
    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'novedades_cinte',
        user: process.env.DB_USER || 'cinte_app',
        password: process.env.DB_PASSWORD || ''
    });
    const q = await pool.query(
        `SELECT c.cedula, c.nombre, cl.cliente, cl.lider, c.correo_cinte
         FROM colaboradores c
         INNER JOIN clientes_lideres cl
           ON cl.activo = TRUE
          AND c.activo = TRUE
          AND c.cliente IS NOT NULL AND btrim(c.cliente) <> ''
          AND c.lider_catalogo IS NOT NULL AND btrim(c.lider_catalogo) <> ''
          AND c.cliente = cl.cliente
          AND c.lider_catalogo = cl.lider
         ORDER BY c.cedula
         LIMIT 20`
    );
    await pool.end();
    if (q.rows.length < 20) {
        throw new Error(`Se necesitan 20 filas colaborador+catálogo; hay ${q.rows.length}. Revisa migración y directorio.`);
    }
    return q.rows.map((r) => ({
        cedula: normalizeCedula(r.cedula),
        nombre: String(r.nombre || '').trim(),
        cliente: String(r.cliente || '').trim(),
        lider: String(r.lider || '').trim(),
        correo: String(r.correo_cinte || '').trim() || `loadtest.${normalizeCedula(r.cedula)}@example.com`
    }));
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
    const ctxs = await loadVeinteContextos();
    console.log('API:', `${BASE}/api/enviar-novedad`);
    console.log('Casos:', ctxs.length);

    const resultados = [];
    for (let i = 0; i < 20; i += 1) {
        const ctx = ctxs[i];
        const plantilla = CASOS[i % CASOS.length](i);
        const fields = {
            nombre: ctx.nombre,
            cedula: ctx.cedula,
            correoSolicitante: ctx.correo,
            cliente: ctx.cliente,
            lider: ctx.lider,
            tipoNovedad: plantilla.tipoNovedad,
            fecha: plantilla.fecha,
            fechaInicio: plantilla.fechaInicio,
            fechaFin: plantilla.fechaFin,
            horaInicio: plantilla.horaInicio,
            horaFin: plantilla.horaFin,
            cantidadHoras: plantilla.cantidadHoras,
            horasDiurnas: plantilla.horasDiurnas,
            horasNocturnas: plantilla.horasNocturnas,
            tipoHoraExtra: plantilla.tipoHoraExtra,
            diasSolicitados: plantilla.diasSolicitados,
            montoCop: plantilla.montoCop
        };
        const r = await postNovedad(fields, plantilla.files || []);
        resultados.push({
            i: i + 1,
            cedula: ctx.cedula,
            cliente: ctx.cliente,
            tipo: plantilla.tipoNovedad,
            status: r.status,
            ok: r.ok,
            error: r.data?.error || ''
        });
        console.log(`[${i + 1}] ${plantilla.tipoNovedad} ${ctx.cedula} ${ctx.cliente.slice(0, 24)}… ->`, r.status, r.ok ? 'OK' : r.data);
    }

    const fallos = resultados.filter((x) => !x.ok);
    if (fallos.length) {
        console.error('\nFallidos:', fallos.length);
        console.error(JSON.stringify(fallos, null, 2));
        process.exitCode = 1;
    } else {
        console.log('\n20/20 radicaciones respondieron OK.');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
