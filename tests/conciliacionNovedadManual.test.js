'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    createConciliacionNovedadManual,
    countBusinessDaysInclusive,
    TIPO_VACACIONES
} = require('../src/conciliaciones/conciliacionNovedadManual');
const { computeNovedadImpactoMonto } = require('../src/conciliaciones/conciliacionNovedadImpacto');

const normalizeCedula = (v) => String(v || '').replace(/\D/g, '');
const normalizeCatalogValue = (v) => String(v || '').trim();

function basePayload(overrides = {}) {
    return {
        cliente: 'Cliente X',
        cedula: '12345678',
        anio: 2026,
        mes: 5,
        servicioId: 'svc-1',
        tipoNovedad: TIPO_VACACIONES,
        fechaInicio: '2026-05-04',
        fechaFin: '2026-05-08',
        ...overrides
    };
}

function buildDeps(poolOverrides = {}) {
    const insertCalls = [];
    const pool = {
        query: async (sql, params) => {
            const s = String(sql);
            if (poolOverrides.query) return poolOverrides.query(sql, params, insertCalls);
            if (s.includes('FROM conciliaciones_facturacion') && s.includes('estado')) {
                return { rows: [{ estado: poolOverrides.estadoFacturacion ?? 'PENDIENTE' }] };
            }
            if (s.includes('INSERT INTO novedades')) {
                insertCalls.push({ sql: s, params });
                return {
                    rows: [
                        {
                            id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                            nombre: 'Consultor Test',
                            cedula: '12345678',
                            tipo_novedad: TIPO_VACACIONES,
                            cantidad_horas: params[11],
                            estado: 'Aprobado',
                            fecha: new Date('2026-05-04T00:00:00Z'),
                            fecha_inicio: new Date('2026-05-04T00:00:00Z'),
                            fecha_fin: new Date('2026-05-08T00:00:00Z'),
                            creado_en: new Date('2026-05-24T12:00:00Z'),
                            monto_cop: null
                        }
                    ]
                };
            }
            if (s.includes('tarifa_override')) {
                return { rows: [] };
            }
            return { rows: [] };
        }
    };

    return {
        deps: {
            pool,
            normalizeCedula,
            normalizeCatalogValue,
            getColaboradorByCedula: async () => ({
                cedula: '12345678',
                nombre: 'Consultor Test',
                correo_cinte: 'test@cinte.com',
                cliente: 'Cliente X',
                lider_catalogo: 'Lider Uno',
                gp_user_id: null
            }),
            getLideresByCliente: async () => ['Lider Uno'],
            getFestivosSet: async () => new Set(),
            getClientesList: async () => ['Cliente X'],
            listScopedDistinctClientes: async () => [],
            listAssignedClientesForGpUserId: async () => [],
            resolveGpInternalUserIdForScope: async () => null,
            canRoleViewType: () => true,
            listServicios: async () => []
        },
        insertCalls
    };
}

const analistaScope = { role: 'analista_conciliaciones', canViewAllAreas: true, areas: [] };
const analistaActor = { role: 'analista_conciliaciones', email: 'analista@cinte.com', id: '11111111-1111-1111-1111-111111111111' };

test('countBusinessDaysInclusive excluye fines de semana', () => {
    assert.equal(countBusinessDaysInclusive('2026-05-04', '2026-05-08'), 5);
    assert.equal(countBusinessDaysInclusive('2026-05-09', '2026-05-10'), 0);
});

test('rol nómina recibe 403', async () => {
    const { deps } = buildDeps();
    await assert.rejects(
        () =>
            createConciliacionNovedadManual(deps, { role: 'nomina', canViewAllAreas: false, areas: [] }, basePayload(), {
                role: 'nomina',
                email: 'nomina@cinte.com'
            }),
        (err) => err.status === 403
    );
});

test('cierre APROBADO_ANALISTA recibe 409', async () => {
    const { deps } = buildDeps({ estadoFacturacion: 'APROBADO_ANALISTA' });
    await assert.rejects(
        () => createConciliacionNovedadManual(deps, analistaScope, basePayload(), analistaActor),
        (err) => err.status === 409
    );
});

test('sin fechaFin recibe 400', async () => {
    const { deps } = buildDeps();
    await assert.rejects(
        () =>
            createConciliacionNovedadManual(
                deps,
                analistaScope,
                basePayload({ fechaFin: '' }),
                analistaActor
            ),
        (err) => err.status === 400 && /Fecha Fin/i.test(err.message)
    );
});

test('rango sin días hábiles recibe 400', async () => {
    const { deps } = buildDeps();
    await assert.rejects(
        () =>
            createConciliacionNovedadManual(
                deps,
                analistaScope,
                basePayload({ fechaInicio: '2026-05-09', fechaFin: '2026-05-10' }),
                analistaActor
            ),
        (err) => err.status === 400 && /días hábiles/i.test(err.message)
    );
});

test('insert OK deja novedad Aprobada con cantidad_horas = días hábiles', async () => {
    const { deps, insertCalls } = buildDeps();
    const out = await createConciliacionNovedadManual(deps, analistaScope, basePayload(), analistaActor);
    assert.equal(String(out.novedadId), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    assert.equal(out.cantidadHoras, 5);
    assert.equal(insertCalls.length, 1);
    assert.ok(String(insertCalls[0].sql).includes("'Aprobado'::novedad_estado"));
    assert.equal(insertCalls[0].params[11], 5);
    assert.equal(insertCalls[0].params[6], TIPO_VACACIONES);
    assert.match(String(insertCalls[0].params[12]), /\[CONCILIACION_MANUAL\]/);
    assert.equal(out.item.tipoNovedad, TIPO_VACACIONES);
    assert.equal(out.item.estado, 'Aprobado');
    assert.equal(out.item.cantidad, 5);
});

test('impacto conciliación: medida days, impacto resta, monto coherente', () => {
    const tarifa = 3_000_000;
    const dias = 3;
    const impacto = computeNovedadImpactoMonto(tarifa, {
        tipo_novedad: TIPO_VACACIONES,
        cantidad_horas: dias,
        fecha_inicio: '2026-05-01',
        fecha_fin: '2026-05-05'
    });
    assert.equal(impacto.medida, 'days');
    assert.equal(impacto.impacto, 'resta');
    assert.equal(impacto.cantidad, dias);
    assert.equal(impacto.montoCop, Math.round((tarifa / 30) * dias));
});
