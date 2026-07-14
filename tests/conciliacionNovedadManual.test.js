'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    createConciliacionNovedadManual,
    countBusinessDaysInclusive,
    buildNovedadManualHistorialObservacion,
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
    const historialCalls = [];
    const pool = {
        query: async (sql, params) => {
            const s = String(sql);
            if (poolOverrides.query) return poolOverrides.query(sql, params, insertCalls, historialCalls);
            if (s.includes('FROM conciliaciones_facturacion') && s.includes('estado')) {
                return {
                    rows: poolOverrides.facturacionRow
                        ? [poolOverrides.facturacionRow]
                        : [{ id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', estado: poolOverrides.estadoFacturacion ?? 'PENDIENTE' }]
                };
            }
            if (s.includes('FROM colaboradores c') && s.includes('activo IS NOT FALSE')) {
                if (poolOverrides.colaboradorSalida) {
                    return { rows: [poolOverrides.colaboradorSalida] };
                }
                return { rows: [] };
            }
            if (s.includes('INSERT INTO conciliaciones_facturacion_historial')) {
                historialCalls.push({ sql: s, params });
                return { rows: [] };
            }
            if (s.includes('INSERT INTO conciliaciones_facturacion')) {
                return {
                    rows: [{ id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', estado: 'PENDIENTE' }]
                };
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
            if (s.includes('FROM users')) {
                const id = poolOverrides.resolvedUserId;
                return id ? { rows: [{ id: String(id) }] } : { rows: [] };
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
        insertCalls,
        historialCalls
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
    const { deps, insertCalls, historialCalls } = buildDeps();
    const out = await createConciliacionNovedadManual(deps, analistaScope, basePayload(), analistaActor);
    assert.equal(String(out.novedadId), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    assert.equal(out.cantidadHoras, 5);
    assert.equal(insertCalls.length, 1);
    assert.equal(historialCalls.length, 1);
    assert.ok(String(historialCalls[0].sql).includes("'NOVEDAD_MANUAL'"));
    assert.match(String(historialCalls[0].params[5]), /Vacaciones en tiempo manual/);
    assert.ok(String(insertCalls[0].sql).includes("'Aprobado'::novedad_estado"));
    assert.ok(String(insertCalls[0].sql).includes("AT TIME ZONE 'America/Bogota'"));
    assert.ok(!String(insertCalls[0].sql).includes('NOW(), $14'));
    assert.equal(insertCalls[0].params[11], 5);
    assert.equal(insertCalls[0].params[6], TIPO_VACACIONES);
    assert.match(String(insertCalls[0].params[12]), /\[CONCILIACION_MANUAL\]/);
    assert.equal(out.item.tipoNovedad, TIPO_VACACIONES);
    assert.equal(out.item.estado, 'Aprobado');
    assert.equal(out.item.cantidad, 5);
});

test('salida del mes (inactivo): getColaboradorByCedula falla pero conciliación encuentra colaborador', async () => {
    const salidaRow = {
        cedula: '12345678',
        nombre: 'Consultor Salida',
        correo_cinte: 'salida@cinte.com',
        cliente: 'Cliente X',
        lider_catalogo: 'Lider Uno',
        gp_user_id: null
    };
    const { deps, insertCalls } = buildDeps({ colaboradorSalida: salidaRow });
    deps.getColaboradorByCedula = async () => null;

    const out = await createConciliacionNovedadManual(deps, analistaScope, basePayload(), analistaActor);
    assert.equal(String(out.novedadId), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    assert.equal(insertCalls.length, 1);
    assert.equal(insertCalls[0].params[0], 'Consultor Salida');
});

test('insert no envía cognito sub si no existe en users (FK segura)', async () => {
    const cognitoSub = 'e4e89408-e001-70ec-9da2-e19163431819';
    const { deps, insertCalls } = buildDeps();
    await createConciliacionNovedadManual(deps, analistaScope, basePayload(), {
        role: 'analista_conciliaciones',
        email: 'analista@cinte.com',
        sub: cognitoSub
    });
    assert.equal(insertCalls[0].params[14], null);
});

test('insert usa users.id cuando el actor se resuelve por email', async () => {
    const dbUserId = '22222222-2222-2222-2222-222222222222';
    const { deps, insertCalls } = buildDeps({ resolvedUserId: dbUserId });
    await createConciliacionNovedadManual(deps, analistaScope, basePayload(), {
        role: 'analista_conciliaciones',
        email: 'analista@cinte.com',
        sub: 'e4e89408-e001-70ec-9da2-e19163431819'
    });
    assert.equal(insertCalls[0].params[14], dbUserId);
});

test('buildNovedadManualHistorialObservacion describe rango y días', () => {
    assert.match(
        buildNovedadManualHistorialObservacion('2026-07-06', '2026-07-10', 5),
        /2026-07-06 a 2026-07-10 \(5 días hábiles\)/
    );
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
