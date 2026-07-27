const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseActividadesConsultorQuery,
    buildActividadesConsultorQuery
} = require('../src/monitoreo/actividadesConsultorService');

const GP_ID = '11111111-1111-4111-8111-111111111111';

test('consulta de actividades aplica filtros parametrizados y alcance GP por colaboradores.gp_user_id', () => {
    const filters = parseActividadesConsultorQuery({
        fechaDesde: '2026-07-01',
        fechaHasta: '2026-07-31',
        cedula: '10101010'
    });
    const { sql, params } = buildActividadesConsultorQuery({ filters, role: 'gp', gpUserId: GP_ID });

    assert.match(sql, /INNER JOIN colaboradores c ON c\.cedula = a\.cedula/);
    assert.match(sql, /c\.gp_user_id = \$4::uuid/);
    assert.deepEqual(params, ['2026-07-01', '2026-07-31', '10101010', GP_ID]);
});

test('consulta global no agrega alcance GP', () => {
    const { sql, params } = buildActividadesConsultorQuery({ filters: {}, role: 'cac' });
    assert.doesNotMatch(sql, /gp_user_id/);
    assert.deepEqual(params, []);
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
