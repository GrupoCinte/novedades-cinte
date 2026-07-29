const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseActividadesConsultorQuery,
    buildActividadesConsultorQuery,
    validateObservacionesRechazo,
    updateActividadEstado
} = require('../src/monitoreo/actividadesConsultorService');

const GP_ID = '11111111-1111-4111-8111-111111111111';

test('consulta de actividades aplica filtros parametrizados y alcance GP por colaboradores.gp_user_id', () => {
    const filters = parseActividadesConsultorQuery({
        fechaDesde: '2026-07-01',
        fechaHasta: '2026-07-31',
        cedula: '10101010',
        cliente: 'Cliente A'
    });
    const { sql, params } = buildActividadesConsultorQuery({ filters, role: 'gp', gpUserId: GP_ID });

    assert.match(sql, /INNER JOIN colaboradores c ON c\.cedula = a\.cedula/);
    assert.match(sql, /c\.gp_user_id = \$5::uuid/);
    assert.match(sql, /a\.cliente = \$4/);
    assert.match(sql, /a\.fin IS NOT NULL/); // Verifica exclusión de temporizadores abiertos
    assert.deepEqual(params, ['2026-07-01', '2026-07-31', '10101010', 'Cliente A', GP_ID]);
});

test('consulta global asigna mes actual por defecto si no hay fechas', () => {
    const filters = parseActividadesConsultorQuery({});
    assert.ok(filters.fechaDesde);
    assert.ok(filters.fechaHasta);

    const { sql, params } = buildActividadesConsultorQuery({ filters, role: 'cac' });
    assert.doesNotMatch(sql, /gp_user_id/);
    assert.equal(params.length, 2); // Sólo las dos fechas del mes actual
});

test('rechaza rango de fechas invertido y cedula inválida', () => {
    assert.throws(
        () => parseActividadesConsultorQuery({ fechaDesde: '2026-07-10', fechaHasta: '2026-07-01' }),
        { status: 400 }
    );
    assert.throws(() => parseActividadesConsultorQuery({ cedula: '10A' }), { status: 400 });
});

test('no permite consultar como GP sin identificador UUID de alcance', () => {
    assert.throws(
        () => buildActividadesConsultorQuery({ filters: {}, role: 'gp', gpUserId: 'no-es-uuid' }),
        { status: 403 }
    );
});

// Tests para updateActividadEstado
test('validación de observaciones de rechazo', () => {
    assert.equal(validateObservacionesRechazo('').ok, false);
    assert.equal(validateObservacionesRechazo('   ').ok, false);
    assert.equal(validateObservacionesRechazo('Motivo válido').ok, true);
    const longStr = 'a'.repeat(1001);
    assert.equal(validateObservacionesRechazo(longStr).ok, false);
});

function createFakePoolForEstado() {
    const queries = [];
    async function query(sql, params) {
        queries.push({ sql, params });
        if (sql.includes('SELECT a.id')) {
            return { rows: [{ id: '22222222-2222-4222-8222-222222222222', estado: 'pendiente', gp_user_id: GP_ID }] };
        }
        // resolveActorUserIdForSession → SELECT id FROM users
        if (sql.includes('FROM users') || sql.includes('from users')) {
            return { rows: [{ id: GP_ID }] };
        }
        return { rowCount: 1, rows: [] };
    }
    return {
        queries,
        query,
        async connect() {
            return {
                query,
                release() {}
            };
        }
    };
}

test('updateActividadEstado aprueba actividad correctamente', async () => {
    const fakePool = createFakePoolForEstado();

    const result = await updateActividadEstado(fakePool, {
        id: '22222222-2222-4222-8222-222222222222',
        nuevoEstado: 'aprobado',
        actor: { userId: GP_ID, role: 'gp', email: 'gp@cinte.com' },
        role: 'gp',
        gpUserId: GP_ID
    });

    assert.equal(result.ok, true);
    assert.equal(result.estado, 'aprobado');
    // SELECT + BEGIN + UPDATE + INSERT audit + COMMIT
    assert.ok(fakePool.queries.length >= 4);
    
    const updateQuery = fakePool.queries.find(q => q.sql.includes('UPDATE actividades_consultor'));
    assert.ok(updateQuery);
    assert.equal(updateQuery.params[0], '22222222-2222-4222-8222-222222222222');
    assert.equal(updateQuery.params[1], GP_ID); // actor userId
});

test('updateActividadEstado rechaza actividad con observaciones', async () => {
    const fakePool = createFakePoolForEstado();

    const result = await updateActividadEstado(fakePool, {
        id: '22222222-2222-4222-8222-222222222222',
        nuevoEstado: 'rechazado',
        observaciones: 'Falta justificar las horas',
        actor: { userId: GP_ID, role: 'gp', email: 'gp@cinte.com' },
        role: 'gp',
        gpUserId: GP_ID
    });

    assert.equal(result.ok, true);
    assert.equal(result.estado, 'rechazado');
    
    const updateQuery = fakePool.queries.find(q => q.sql.includes('UPDATE actividades_consultor'));
    assert.ok(updateQuery);
    assert.equal(updateQuery.params[5], 'Falta justificar las horas'); // obs
});

test('updateActividadEstado falla si el GP no tiene alcance', async () => {
    const fakePool = {
        async query(sql) {
            if (sql.includes('SELECT a.id')) {
                return { rows: [{ id: '22222222-2222-4222-8222-222222222222', estado: 'pendiente', gp_user_id: 'otro-uuid' }] };
            }
            return { rowCount: 1 };
        },
        async connect() {
            return { query: this.query.bind(this), release() {} };
        }
    };

    await assert.rejects(
        () => updateActividadEstado(fakePool, {
            id: '22222222-2222-4222-8222-222222222222',
            nuevoEstado: 'aprobado',
            actor: { userId: GP_ID, role: 'gp', email: 'gp@cinte.com' },
            role: 'gp',
            gpUserId: GP_ID
        }),
        { status: 403 }
    );
});
