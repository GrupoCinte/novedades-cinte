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
                mode: 'merge'
            }
        ]
    });

    const updates = pool.calls.filter((c) => /UPDATE malla_turno_asignacion/i.test(c.text));
    assert.equal(updates.length, 1);
    assert.equal(updates[0].params[3], '111');
    assert.equal(updates[0].params[4], '20:00');
    assert.equal(updates[0].params[5], '04:00');
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
