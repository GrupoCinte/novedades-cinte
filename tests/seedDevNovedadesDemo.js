/**
 * Inserta ~50 novedades de demo en PostgreSQL local (variables DB_* del .env).
 * Mezcla: compensatorio (jurado 1 día y votación medio día con horas) + permiso remunerado (horas y días).
 *
 * Uso: node tests/seedDevNovedadesDemo.js
 */
require('dotenv').config();
const { Pool } = require('pg');
const { countBusinessDaysInclusive } = require('../src/novedadCantidadFormat');

const TIPO_COMP = 'Compensatorio por votación/jurado';
const TIPO_PERMISO = 'Permiso remunerado';

function poolFromEnv() {
    const password = (process.env.DB_PASSWORD || '').trim();
    if (!password) {
        throw new Error('DB_PASSWORD es obligatorio en .env para conectar a PostgreSQL.');
    }
    return new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'novedades_cinte',
        user: process.env.DB_USER || 'cinte_app',
        password
    });
}

async function columnExists(pool, name) {
    const r = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'novedades' AND column_name = $1`,
        [name]
    );
    return r.rows.length > 0;
}

function ymdAddDays(ymd, days) {
    const d = new Date(`${ymd}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

function padCedula(n) {
    return String(9100002000 + n);
}

async function main() {
    const pool = poolFromEnv();
    const hasHeDom = await columnExists(pool, 'he_domingo_observacion');

    const cols = [
        'nombre',
        'cedula',
        'correo_solicitante',
        'cliente',
        'lider',
        'gp_user_id',
        'tipo_novedad',
        'area',
        'fecha',
        'hora_inicio',
        'hora_fin',
        'fecha_inicio',
        'fecha_fin',
        'cantidad_horas',
        'horas_diurnas',
        'horas_nocturnas',
        'horas_recargo_domingo',
        'horas_recargo_domingo_diurnas',
        'horas_recargo_domingo_nocturnas',
        'tipo_hora_extra',
        'soporte_ruta',
        'monto_cop'
    ];
    if (hasHeDom) cols.push('he_domingo_observacion');
    cols.push('modalidad', 'fecha_votacion', 'unidad', 'estado');

    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO novedades (${cols.join(', ')}) VALUES (${placeholders})`;

    const base = {
        correo: 'seed-demo@local.dev',
        cliente: 'Cliente DEMO SEED',
        lider: 'Líder DEMO SEED',
        gp: null,
        area: 'Operaciones',
        zeros: [0, 0, 0, 0, 0],
        tipoHe: null,
        soporte: null,
        monto: null,
        heDom: null
    };

    const payloads = [];

    // 15 jurado (1 día, sin franja horaria)
    for (let i = 0; i < 15; i += 1) {
        const fv = ymdAddDays('2026-04-01', i);
        const fd = ymdAddDays(fv, 5);
        payloads.push({
            nombre: `Demo Jurado ${i + 1}`,
            cedula: padCedula(i),
            tipo: TIPO_COMP,
            fecha: null,
            hi: null,
            hf: null,
            fi: fd,
            ff: fd,
            ch: 1,
            modalidad: 'solo_jurado',
            fv,
            unidad: null
        });
    }
    // 15 votación (medio día con franja)
    for (let i = 0; i < 15; i += 1) {
        const fv = ymdAddDays('2026-04-16', i);
        const fd = ymdAddDays(fv, 4);
        const sh = 8 + (i % 4);
        const eh = sh + 2;
        const hi = `${String(sh).padStart(2, '0')}:00:00`;
        const hf = `${String(eh).padStart(2, '0')}:00:00`;
        payloads.push({
            nombre: `Demo Votación ${i + 1}`,
            cedula: padCedula(15 + i),
            tipo: TIPO_COMP,
            fecha: null,
            hi,
            hf,
            fi: fd,
            ff: fd,
            ch: 2,
            modalidad: 'solo_voto',
            fv,
            unidad: null
        });
    }

    // 10 permiso remunerado en días (lunes a miércoles de semanas distintas)
    const mondays = ['2026-05-04', '2026-05-11', '2026-05-18', '2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29', '2026-07-06', '2026-07-13'];
    for (let i = 0; i < 10; i += 1) {
        const fi = mondays[i];
        const ff = ymdAddDays(fi, 2);
        const ch = countBusinessDaysInclusive(fi, ff);
        if (ch <= 0) throw new Error(`Rango sin hábiles: ${fi}..${ff}`);
        payloads.push({
            nombre: `Demo Permiso días ${i + 1}`,
            cedula: padCedula(30 + i),
            tipo: TIPO_PERMISO,
            fecha: null,
            hi: null,
            hf: null,
            fi,
            ff,
            ch,
            modalidad: null,
            fv: null,
            unidad: 'dias'
        });
    }

    // 10 permiso remunerado en horas (mismo día, franja distinta por índice)
    for (let i = 0; i < 10; i += 1) {
        const day = ymdAddDays('2026-05-14', i);
        const startH = 8 + (i % 3);
        const hi = `${String(startH).padStart(2, '0')}:00:00`;
        const hf = `${String(startH + 4).padStart(2, '0')}:00:00`;
        payloads.push({
            nombre: `Demo Permiso horas ${i + 1}`,
            cedula: padCedula(40 + i),
            tipo: TIPO_PERMISO,
            fecha: day,
            hi,
            hf,
            fi: day,
            ff: day,
            ch: 4,
            modalidad: null,
            fv: null,
            unidad: 'horas'
        });
    }

    let inserted = 0;
    for (const p of payloads) {
        const params = [
            p.nombre,
            p.cedula,
            base.correo,
            base.cliente,
            base.lider,
            base.gp,
            p.tipo,
            base.area,
            p.fecha,
            p.hi,
            p.hf,
            p.fi,
            p.ff,
            p.ch,
            ...base.zeros,
            base.tipoHe,
            base.soporte,
            base.monto
        ];
        if (hasHeDom) params.push(base.heDom);
        params.push(p.modalidad, p.fv, p.unidad, 'Pendiente');
        await pool.query(sql, params);
        inserted += 1;
    }

    await pool.end();
    console.log(`OK: insertadas ${inserted} novedades de demo (he_domingo_observacion: ${hasHeDom ? 'sí' : 'no'}).`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
