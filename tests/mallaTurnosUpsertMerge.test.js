const test = require('node:test');
const assert = require('node:assert/strict');
const { createDataLayer } = require('../src/dataLayer');

function buildConnectPool(responder) {
    const calls = [];
    const client = {
        async query(text, params) {
            calls.push({ text: String(text), params: params || [] });
            const out = await responder(String(text), params || [], calls.length - 1);
            return { rows: out?.rows || [], rowCount: (out?.rows || []).length };
        },
        release() {}
    };
    return {
        calls,
        async connect() {
            return client;
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

function colaboradorActivoResponder() {
    return async (text) => {
        if (/FROM colaboradores/i.test(text)) {
            return { rows: [{ activo: true }] };
        }
        if (/FROM malla_turno_asignacion/i.test(text) && /SELECT cedula/i.test(text)) {
            return { rows: [{ cedula: '111' }] };
        }
        return { rows: [] };
    };
}

test('upsertMallaTurnosCeldas merge no ejecuta DELETE y agrega cédulas nuevas', async () => {
    const pool = buildConnectPool(colaboradorActivoResponder());
    const layer = buildLayer(pool);

    await layer.upsertMallaTurnosCeldas({
        cliente: 'Cliente Demo',
        patches: [
            {
                fecha: '2026-06-10',
                franja: '14_22',
                cedulas: ['2222222222'],
                mode: 'merge'
            }
        ]
    });

    const deletes = pool.calls.filter((c) => /DELETE FROM malla_turno_asignacion/i.test(c.text));
    assert.equal(deletes.length, 0);
    const inserts = pool.calls.filter((c) => /INSERT INTO malla_turno_asignacion/i.test(c.text));
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].params[3], '2222222222');
});

test('upsertMallaTurnosCeldas merge con cedulas vacías no borra la celda', async () => {
    const pool = buildConnectPool(async () => ({ rows: [] }));
    const layer = buildLayer(pool);

    await layer.upsertMallaTurnosCeldas({
        cliente: 'Cliente Demo',
        patches: [
            {
                fecha: '2026-06-10',
                franja: '06_14',
                cedulas: [],
                mode: 'merge'
            }
        ]
    });

    const deletes = pool.calls.filter((c) => /DELETE FROM malla_turno_asignacion/i.test(c.text));
    assert.equal(deletes.length, 0);
    const inserts = pool.calls.filter((c) => /INSERT INTO malla_turno_asignacion/i.test(c.text));
    assert.equal(inserts.length, 0);
});

test('upsertMallaTurnosCeldas replace sigue borrando la celda completa', async () => {
    const pool = buildConnectPool(colaboradorActivoResponder());
    const layer = buildLayer(pool);

    await layer.upsertMallaTurnosCeldas({
        cliente: 'Cliente Demo',
        patches: [
            {
                fecha: '2026-06-10',
                franja: '06_14',
                cedulas: ['3333333333']
            }
        ]
    });

    const deletes = pool.calls.filter((c) => /DELETE FROM malla_turno_asignacion/i.test(c.text));
    assert.equal(deletes.length, 1);
});

test('upsertMallaTurnosCeldas merge nocturno actualiza horario solo de cédula existente', async () => {
    const pool = buildConnectPool(colaboradorActivoResponder());
    const layer = buildLayer(pool);

    await layer.upsertMallaTurnosCeldas({
        cliente: 'Cliente Demo',
        patches: [
            {
                fecha: '2026-06-10',
                franja: '22_06',
                cedulas: ['111'],
                horaInicio: '20:00',
                horaFin: '04:00',
                origen: 'nocturnos',
                mode: 'merge'
            }
        ]
    });

    const updates = pool.calls.filter((c) => /UPDATE malla_turno_asignacion/i.test(c.text));
    assert.equal(updates.length, 1);
    assert.equal(updates[0].params[4], '111');
    assert.equal(updates[0].params[5], '20:00');
    assert.equal(updates[0].params[6], '04:00');
    const inserts = pool.calls.filter((c) => /INSERT INTO malla_turno_asignacion/i.test(c.text));
    assert.equal(inserts.length, 0);
});

test('upsertMallaTurnosCeldas merge rechaza más de 10 personas por franja', async () => {
    const pool = buildConnectPool(async (text) => {
        if (/FROM malla_turno_asignacion/i.test(text) && /SELECT cedula/i.test(text)) {
            return {
                rows: Array.from({ length: 10 }, (_, i) => ({ cedula: String(1000 + i) }))
            };
        }
        if (/FROM colaboradores/i.test(text)) {
            return { rows: [{ activo: true }] };
        }
        return { rows: [] };
    });
    const layer = buildLayer(pool);

    await assert.rejects(
        () =>
            layer.upsertMallaTurnosCeldas({
                cliente: 'Cliente Demo',
                patches: [
                    {
                        fecha: '2026-06-10',
                        franja: '14_22',
                        cedulas: ['9999999999'],
                        mode: 'merge'
                    }
                ]
            }),
        (err) => err.status === 400 && /10 personas/i.test(err.message)
    );
});

test('upsertMallaTurnosCeldas replace nocturno borra solo la banda horaria indicada', async () => {
    const pool = buildConnectPool(colaboradorActivoResponder());
    const layer = buildLayer(pool);

    await layer.upsertMallaTurnosCeldas({
        cliente: 'Cliente Demo',
        patches: [
            {
                fecha: '2026-06-10',
                franja: '22_06',
                cedulas: ['3333333333'],
                horaInicio: '20:00',
                horaFin: '04:00',
                origen: 'nocturnos'
            }
        ]
    });

    const deletes = pool.calls.filter((c) => /DELETE FROM malla_turno_asignacion/i.test(c.text));
    assert.equal(deletes.length, 1);
    assert.match(deletes[0].text, /hora_inicio IS NOT DISTINCT/i);
    assert.match(deletes[0].text, /origen = \$4/i);
    assert.equal(deletes[0].params[3], 'nocturnos');
    assert.equal(deletes[0].params[4], '20:00');
    assert.equal(deletes[0].params[5], '04:00');
});

test('upsertMallaTurnosCeldas merge nocturno inserta en banda distinta sin borrar otras', async () => {
    const pool = buildConnectPool(async (text) => {
        if (/FROM colaboradores/i.test(text)) {
            return { rows: [{ activo: true }] };
        }
        if (/FROM malla_turno_asignacion/i.test(text) && /SELECT cedula/i.test(text)) {
            if (/hora_inicio IS NOT DISTINCT/i.test(text)) {
                return { rows: [] };
            }
            return { rows: [{ cedula: '111' }] };
        }
        return { rows: [] };
    });
    const layer = buildLayer(pool);

    await layer.upsertMallaTurnosCeldas({
        cliente: 'Cliente Demo',
        patches: [
            {
                fecha: '2026-06-10',
                franja: '22_06',
                cedulas: ['2222222222'],
                horaInicio: '20:00',
                horaFin: '04:00',
                origen: 'nocturnos',
                mode: 'merge'
            }
        ]
    });

    const deletes = pool.calls.filter((c) => /DELETE FROM malla_turno_asignacion/i.test(c.text));
    assert.equal(deletes.length, 0);
    const inserts = pool.calls.filter((c) => /INSERT INTO malla_turno_asignacion/i.test(c.text));
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].params[5], '20:00');
    assert.equal(inserts[0].params[6], '04:00');
    assert.equal(inserts[0].params[7], 'nocturnos');
});

test('upsertMallaTurnosCeldas merge nocturno rechaza cédula ya asignada en otra banda', async () => {
    const pool = buildConnectPool(async (text) => {
        if (/FROM colaboradores/i.test(text)) {
            return { rows: [{ activo: true }] };
        }
        if (/FROM malla_turno_asignacion/i.test(text) && /SELECT cedula/i.test(text)) {
            if (/hora_inicio IS NOT DISTINCT/i.test(text)) {
                return { rows: [] };
            }
            return { rows: [{ cedula: '111' }] };
        }
        return { rows: [] };
    });
    const layer = buildLayer(pool);

    await assert.rejects(
        () =>
            layer.upsertMallaTurnosCeldas({
                cliente: 'Cliente Demo',
                patches: [
                    {
                        fecha: '2026-06-10',
                        franja: '22_06',
                        cedulas: ['111'],
                        horaInicio: '20:00',
                        horaFin: '04:00',
                        origen: 'nocturnos',
                        mode: 'merge'
                    }
                ]
            }),
        (err) => err.status === 400 && /otro horario/i.test(err.message)
    );
});

test('AUT-550 replace en Mallas franja 22_06 borra solo origen mallas (no toca nocturnos)', async () => {
    const pool = buildConnectPool(colaboradorActivoResponder());
    const layer = buildLayer(pool);

    await layer.upsertMallaTurnosCeldas({
        cliente: 'Cliente Demo',
        patches: [
            {
                fecha: '2026-06-10',
                franja: '22_06',
                cedulas: ['3333333333'],
                origen: 'mallas'
            }
        ]
    });

    const deletes = pool.calls.filter((c) => /DELETE FROM malla_turno_asignacion/i.test(c.text));
    assert.equal(deletes.length, 1);
    // Mallas no usa banda horaria; el DELETE se acota por origen para no borrar nocturnos.
    assert.doesNotMatch(deletes[0].text, /hora_inicio IS NOT DISTINCT/i);
    assert.match(deletes[0].text, /origen = \$4/i);
    assert.equal(deletes[0].params[3], 'mallas');
    const inserts = pool.calls.filter((c) => /INSERT INTO malla_turno_asignacion/i.test(c.text));
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].params[7], 'mallas');
});

test('AUT-550 origen por defecto es mallas cuando no se envía', async () => {
    const pool = buildConnectPool(colaboradorActivoResponder());
    const layer = buildLayer(pool);

    await layer.upsertMallaTurnosCeldas({
        cliente: 'Cliente Demo',
        patches: [{ fecha: '2026-06-10', franja: '06_14', cedulas: ['3333333333'] }]
    });

    const inserts = pool.calls.filter((c) => /INSERT INTO malla_turno_asignacion/i.test(c.text));
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].params[7], 'mallas');
});

test('AUT-550 turnos nocturnos rechaza franja distinta de 22_06', async () => {
    const pool = buildConnectPool(colaboradorActivoResponder());
    const layer = buildLayer(pool);

    await assert.rejects(
        () =>
            layer.upsertMallaTurnosCeldas({
                cliente: 'Cliente Demo',
                patches: [
                    {
                        fecha: '2026-06-10',
                        franja: '06_14',
                        cedulas: ['111'],
                        origen: 'nocturnos'
                    }
                ]
            }),
        (err) => err.status === 400 && /22:00/i.test(err.message)
    );
});
