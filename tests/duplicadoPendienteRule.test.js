const test = require('node:test');
const assert = require('node:assert/strict');
const { createDataLayer } = require('../src/dataLayer');

/**
 * Pool mock: cada test inyecta `responder(query, params)` para devolver `{ rows, rowCount }`.
 * Acumula `calls` para inspección de la query/params usados.
 */
function buildMockPool(responder) {
    const calls = [];
    return {
        calls,
        async query(text, params) {
            calls.push({ text: String(text), params: params || [] });
            const out = await responder(String(text), params || [], calls.length - 1);
            return { rows: out?.rows || [], rowCount: (out?.rows || []).length };
        }
    };
}

function buildLayer(pool) {
    return createDataLayer({
        pool,
        fs: {},
        xlsx: {},
        CLIENTES_LIDERES_XLSX_PATH: '',
        normalizeCatalogValue: (v) => String(v || '').trim(),
        normalizeCedula: (v) => String(v || '').replace(/\D/g, ''),
        canRoleViewType: () => true,
        getAreaFromRole: () => 'Capital Humano'
    });
}

test('findPendingNovedadDuplicate: devuelve duplicado=false cuando faltan datos clave', async () => {
    const pool = buildMockPool(async () => ({ rows: [{ id: 'no-debe-usarse' }] }));
    const layer = buildLayer(pool);

    const sinCedula = await layer.findPendingNovedadDuplicate({
        cedula: '',
        tipoNovedad: 'Incapacidad',
        fechaInicio: '2026-06-01'
    });
    assert.deepEqual(sinCedula, { duplicado: false, id: null });

    const sinTipo = await layer.findPendingNovedadDuplicate({
        cedula: '1015123456',
        tipoNovedad: '',
        fechaInicio: '2026-06-01'
    });
    assert.deepEqual(sinTipo, { duplicado: false, id: null });

    const sinFechaInicio = await layer.findPendingNovedadDuplicate({
        cedula: '1015123456',
        tipoNovedad: 'Incapacidad',
        fechaInicio: null
    });
    assert.deepEqual(sinFechaInicio, { duplicado: false, id: null });

    assert.equal(pool.calls.length, 0, 'no debe consultar BD si faltan datos clave');
});

test('findPendingNovedadDuplicate: devuelve duplicado=true cuando la BD encuentra una fila Pendiente', async () => {
    const pool = buildMockPool(async (text) => {
        if (/FROM\s+novedades/i.test(text) && /estado\s*=\s*'Pendiente'/i.test(text)) {
            return { rows: [{ id: 'nov-uuid-1' }] };
        }
        return { rows: [] };
    });
    const layer = buildLayer(pool);

    const out = await layer.findPendingNovedadDuplicate({
        cedula: '1015123456',
        tipoNovedad: 'Incapacidad',
        fechaInicio: '2026-06-01',
        fechaFin: '2026-06-05'
    });
    assert.deepEqual(out, { duplicado: true, id: 'nov-uuid-1' });

    const lastCall = pool.calls.at(-1);
    assert.deepEqual(lastCall.params, [
        '1015123456',
        'Incapacidad',
        '2026-06-01',
        '2026-06-05',
        null,
        null
    ]);
    assert.match(lastCall.text, /lower\(regexp_replace\(trim\(coalesce\(tipo_novedad/i);
    assert.match(lastCall.text, /COALESCE\(fecha_fin, fecha_inicio\)/);
    assert.match(lastCall.text, /COALESCE\(hora_inicio, TIME '00:00:00'\)/);
    assert.match(lastCall.text, /COALESCE\(hora_fin, +TIME '00:00:00'\)/);
});

test('findPendingNovedadDuplicate: Hora Extra incluye hora_inicio y hora_fin en la llave', async () => {
    const pool = buildMockPool(async () => ({ rows: [{ id: 'he-1' }] }));
    const layer = buildLayer(pool);

    await layer.findPendingNovedadDuplicate({
        cedula: '1015123456',
        tipoNovedad: 'Hora Extra',
        fechaInicio: '2026-07-01',
        fechaFin: '2026-07-01',
        horaInicio: '18:00',
        horaFin: '20:00'
    });
    const lastCall = pool.calls.at(-1);
    assert.deepEqual(lastCall.params, [
        '1015123456',
        'Hora Extra',
        '2026-07-01',
        '2026-07-01',
        '18:00',
        '20:00'
    ]);
});

test('findPendingNovedadDuplicate: devuelve duplicado=false cuando la BD no encuentra fila', async () => {
    const pool = buildMockPool(async () => ({ rows: [] }));
    const layer = buildLayer(pool);

    const out = await layer.findPendingNovedadDuplicate({
        cedula: '1015123456',
        tipoNovedad: 'Calamidad domestica',
        fechaInicio: '2026-08-01',
        fechaFin: '2026-08-03'
    });
    assert.deepEqual(out, { duplicado: false, id: null });
});

test('ensureNovedadesDuplicadoPendienteIndex: NO crea el índice si hay duplicados Pendientes pre-existentes', async () => {
    const pool = buildMockPool(async (text) => {
        if (/HAVING\s+COUNT\(\*\)\s*>\s*1/i.test(text)) {
            return {
                rows: [
                    {
                        cedula: '1015123456',
                        tipo_norm: 'incapacidad',
                        fecha_inicio: '2026-06-01',
                        fecha_fin_norm: '2026-06-05',
                        hora_inicio_norm: '00:00:00',
                        hora_fin_norm: '00:00:00',
                        cnt: 2
                    }
                ]
            };
        }
        return { rows: [] };
    });
    const layer = buildLayer(pool);

    const originalWarn = console.warn;
    let warned = false;
    console.warn = () => { warned = true; };
    try {
        await layer.ensureNovedadesDuplicadoPendienteIndex();
    } finally {
        console.warn = originalWarn;
    }

    assert.equal(warned, true, 'debe emitir WARN cuando hay duplicados pre-existentes');
    const createCalls = pool.calls.filter((c) => /CREATE\s+UNIQUE\s+INDEX/i.test(c.text));
    assert.equal(createCalls.length, 0, 'no debe ejecutar CREATE UNIQUE INDEX si hay duplicados');
});

test('ensureNovedadesDuplicadoPendienteIndex: crea el índice cuando no hay duplicados', async () => {
    const pool = buildMockPool(async () => ({ rows: [] }));
    const layer = buildLayer(pool);

    await layer.ensureNovedadesDuplicadoPendienteIndex();

    const createCalls = pool.calls.filter((c) => /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_novedades_pendiente_dedup/i.test(c.text));
    assert.equal(createCalls.length, 1, 'debe ejecutar el CREATE UNIQUE INDEX una vez');
    assert.match(createCalls[0].text, /WHERE\s+estado\s*=\s*'Pendiente'/i);
    assert.match(createCalls[0].text, /<>\s*'compensatorio por votación\/jurado'/i);
});

test('ensureNovedadesDuplicadoPendienteIndex: WARN sin throw cuando faltan permisos (42501)', async () => {
    const pool = buildMockPool(async (text) => {
        if (/HAVING\s+COUNT\(\*\)\s*>\s*1/i.test(text)) return { rows: [] };
        const err = new Error('permiso insuficiente');
        err.code = '42501';
        throw err;
    });
    const layer = buildLayer(pool);

    const originalWarn = console.warn;
    let warned = false;
    console.warn = () => { warned = true; };
    try {
        await assert.doesNotReject(() => layer.ensureNovedadesDuplicadoPendienteIndex());
    } finally {
        console.warn = originalWarn;
    }
    assert.equal(warned, true, 'debe loguear WARN sin propagar');
});
