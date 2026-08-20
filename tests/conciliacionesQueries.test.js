const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCedula } = require('../src/utils');
const { canRoleViewType } = require('../src/rbac');
const { 
    getConciliacionResumenPorClienteMes,
    getConciliacionResumenTodosClientesMes,
    upsertConciliacionFacturacion,
    deleteConciliacionFacturacion,
    listConciliacionesFacturacion,
    listServicios,
    createServicio,
    updateServicio,
    deleteServicio,
    listServicioConsultores,
    upsertServicioConsultores,
    assertClienteConciliacionPermitido,
    isWideConciliacionRole,
    mergeConciliacionClientesLists
} = require('../src/conciliaciones/conciliacionesQueries');

test('getConciliacionResumenPorClienteMes agrega solo novedades visibles y calcula factura', async () => {
    const pool = {
        query: async (sql) => {
            if (String(sql).includes('FROM novedades')) {
                return {
                    rows: [
                        {
                            id: '11111111-1111-1111-1111-111111111111',
                            cedula: '12.345.678',
                            tipo_novedad: 'Incapacidad',
                            monto_cop: '100',
                            cantidad_horas: 1,
                            unidad: null,
                            modalidad: null,
                            hora_inicio: null,
                            hora_fin: null,
                            fecha_inicio: '2026-05-06',
                            fecha_fin: '2026-05-06'
                        },
                        {
                            id: '22222222-2222-2222-2222-222222222222',
                            cedula: '12.345.678',
                            tipo_novedad: 'Incapacidad',
                            monto_cop: '50.25',
                            cantidad_horas: 1,
                            unidad: null,
                            modalidad: null,
                            hora_inicio: null,
                            hora_fin: null,
                            fecha_inicio: '2026-05-07',
                            fecha_fin: '2026-05-07'
                        }
                    ]
                };
            }
            if (String(sql).includes('FROM colaboradores')) {
                return {
                    rows: [
                        {
                            cedula: '12345678',
                            nombre: 'Test User',
                            cliente: 'Cliente X',
                            tarifa_cliente: '5000',
                            moneda: 'COP',
                            profesion: 'Dev'
                        }
                    ]
                };
            }
            return { rows: [] };
        }
    };
    const deps = { pool, normalizeCedula, canRoleViewType };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const { rows, totales } = await getConciliacionResumenPorClienteMes(deps, scope, 'Cliente X', 2026, 5);
    const diasMes = 31;
    const deduccionDia = Math.round(5000 / diasMes);
    const deduccionEsperada = deduccionDia * 2;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].novedadesCount, 2);
    assert.deepEqual(rows[0].novedadesTipos, ['Incapacidad']);
    assert.equal(rows[0].novedadesSumCop, deduccionEsperada);
    assert.equal(rows[0].facturaCop, 5000 - deduccionEsperada);
    assert.equal(totales.tarifaSum, 5000);
    assert.equal(totales.deduccionSum, deduccionEsperada);
    assert.equal(totales.colaboradores, 1);
    assert.equal(totales.conNovedad, 1);
});

test('getConciliacionResumenPorClienteMes EXPIRED_MONTH consulta novedades del mismo mes', async () => {
    let novRange = null;
    let factMes = null;
    const pool = {
        query: async (sql, params) => {
            if (String(sql).includes('FROM novedades')) {
                novRange = [params[1], params[2]];
                return {
                    rows: [{
                        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                        cedula: '12345678',
                        tipo_novedad: 'Bonos',
                        monto_cop: '100',
                        cantidad_horas: 0,
                        unidad: null,
                        modalidad: null,
                        hora_inicio: null,
                        hora_fin: null,
                        fecha_inicio: '2026-06-12',
                        fecha_fin: '2026-06-12'
                    }]
                };
            }
            if (String(sql).includes('FROM colaboradores')) {
                factMes = [params[1], params[2]];
                return {
                    rows: [
                        {
                            cedula: '12345678',
                            nombre: 'Test User',
                            cliente: 'Cliente X',
                            tarifa_cliente: '5000',
                            moneda: 'COP',
                            profesion: 'Dev'
                        }
                    ]
                };
            }
            return { rows: [] };
        }
    };
    const deps = { pool, normalizeCedula, canRoleViewType };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const { rows } = await getConciliacionResumenPorClienteMes(deps, scope, 'Cliente X', 2026, 6, {
        billingType: 'EXPIRED_MONTH'
    });
    assert.deepEqual(novRange, ['2026-06-01', '2026-06-30']);
    assert.deepEqual(factMes, [2026, 6]);
    assert.equal(rows[0].novedadesCount, 1);
    assert.equal(rows[0].novedadesSumaCop, 100);
    assert.equal(rows[0].facturaCop, 5100);
});

test('getConciliacionResumenTodosClientesMes sin clientes en alcance devuelve vacío', async () => {
    const pool = { query: async () => ({ rows: [] }) };
    const deps = {
        pool,
        normalizeCedula,
        canRoleViewType,
        getClientesList: async () => [],
        listScopedDistinctClientes: async () => [],
        listAssignedClientesForGpUserId: async () => [],
        resolveGpInternalUserIdForScope: async () => null
    };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const { rows, totales, clientesCount } = await getConciliacionResumenTodosClientesMes(deps, scope, 2026, 5);
    assert.equal(clientesCount, 0);
    assert.equal(rows.length, 0);
    assert.equal(totales.colaboradores, 0);
});

test('upsertConciliacionFacturacion inserta correctamente y listConciliacionesFacturacion recupera', async () => {
    let queryArgs = [];
    const pool = {
        query: async (sql, params) => {
            queryArgs.push({ sql, params });
            if (String(sql).includes('SELECT cliente FROM colaboradores')) {
                return { rows: [{ cliente: 'Cliente X' }] };
            }
            if (String(sql).includes('FROM clientes_lideres')) {
                return { rows: [{ cliente: 'Cliente X' }] };
            }
            if (String(sql).includes('INSERT INTO conciliaciones_facturacion')) {
                return {
                    rows: [{
                        id: 'fact-id',
                        cedula: '12345678',
                        anio: 2026,
                        mes: 5,
                        proyecto: 'Swat',
                        observaciones: 'Ok',
                        horas_facturadas: 160,
                        estado: 'CONCILIADA',
                        factura_fv: 'FV-123',
                        fecha_radicacion: new Date('2026-05-20'),
                        motivo_devolucion: null
                    }]
                };
            }
            if (String(sql).includes('SELECT f.id, f.cedula')) {
                return {
                    rows: [{
                        id: 'fact-id',
                        cedula: '12345678',
                        nombre: 'Test User',
                        cliente: 'Cliente X',
                        anio: 2026,
                        mes: 5,
                        proyecto: 'Swat',
                        observaciones: 'Ok',
                        horas_facturadas: 160,
                        estado: 'CONCILIADA',
                        factura_fv: 'FV-123',
                        fecha_radicacion: new Date('2026-05-20'),
                        motivo_devolucion: null
                    }]
                };
            }
            return { rows: [] };
        }
    };
    const deps = { 
        pool, 
        normalizeCedula, 
        getClientesList: async () => ['Cliente X'],
        listScopedDistinctClientes: async () => ['Cliente X'],
        listAssignedClientesForGpUserId: async () => [],
        resolveGpInternalUserIdForScope: async () => null,
        normalizeCatalogValue: (v) => v
    };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const payload = {
        cedula: '12.345.678',
        anio: 2026,
        mes: 5,
        proyecto: 'Swat',
        observaciones: 'Ok',
        horasFacturadas: 160,
        estado: 'CONCILIADA',
        facturaFv: 'FV-123',
        fechaRadicacion: '2026-05-20'
    };

    const out = await upsertConciliacionFacturacion(deps, scope, payload);
    assert.equal(out.id, 'fact-id');
    assert.equal(out.cedula, '12345678');
    assert.equal(out.proyecto, 'Swat');
    assert.equal(out.estado, 'CONCILIADA');
    assert.equal(out.factura_fv, 'FV-123');

    const list = await listConciliacionesFacturacion(deps, scope, 2026, 5);
    assert.equal(list.length, 1);
    assert.equal(list[0].nombre, 'Test User');
    assert.equal(list[0].horasFacturadas, 160);
    assert.equal(list[0].estado, 'CONCILIADA');
});

test('upsertConciliacionFacturacionMasiva actualiza multiples registros', async () => {
    let queryArgs = [];
    const pool = {
        query: async (sql, params) => {
            queryArgs.push({ sql, params });
            if (String(sql).includes('FROM colaboradores') && String(sql).includes('cedula')) {
                return { rows: [{ cedula: '111' }, { cedula: '222' }] };
            }
            return { rows: [] };
        },
        connect: async () => ({
            query: async (sql, params) => {
                queryArgs.push({ sql, params });
                return { rows: [] };
            },
            release: () => {}
        })
    };
    const deps = { 
        pool, 
        normalizeCedula, 
        getClientesList: async () => ['Cliente X'],
        listScopedDistinctClientes: async () => ['Cliente X'],
        listAssignedClientesForGpUserId: async () => [],
        resolveGpInternalUserIdForScope: async () => null,
        normalizeCatalogValue: (v) => v
    };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const payload = {
        cliente: 'Cliente X',
        anio: 2026,
        mes: 5,
        estado: 'APROBADO_FINANZAS',
        facturaFv: 'FV-999',
        fechaRadicacion: '2026-05-21'
    };

    const { upsertConciliacionFacturacionMasiva } = require('../src/conciliaciones/conciliacionesQueries');
    const out = await upsertConciliacionFacturacionMasiva(deps, scope, payload);
    assert.equal(out.updated, 2);
    
    // Verificar que se hizo INSERT/UPDATE para cada cédula
    const upserts = queryArgs.filter(q => String(q.sql).includes('INSERT INTO conciliaciones_facturacion'));
    assert.equal(upserts.length, 2);
    assert.equal(upserts[0].params[0], '111');
    assert.equal(upserts[1].params[0], '222');
    assert.equal(upserts[0].params[3], 'APROBADO_FINANZAS');
    assert.equal(upserts[0].params[4], 'FV-999');
});

test('revertConciliacionFacturacion valida cliente, revierte a PENDIENTE e inserta historial REVERTIR', async () => {
    const queryArgs = [];
    const pool = {
        query: async (sql, params) => {
            queryArgs.push({ sql, params, client: false });
            if (String(sql).includes('SELECT cliente FROM colaboradores')) {
                return { rows: [{ cliente: 'Cliente X' }] };
            }
            return { rows: [] };
        },
        connect: async () => {
            const client = {
                query: async (sql, params) => {
                    queryArgs.push({ sql, params, client: true });
                    if (String(sql).includes('SELECT id, estado FROM conciliaciones_facturacion')) {
                        return { rows: [{ id: 'fact-id', estado: 'APROBADO_ANALISTA' }] };
                    }
                    if (String(sql).includes('UPDATE conciliaciones_facturacion')) {
                        return { rowCount: 1, rows: [{ id: 'fact-id', cedula: '12345678', anio: 2026, mes: 5, estado: 'PENDIENTE' }] };
                    }
                    if (String(sql).includes('INSERT INTO conciliaciones_facturacion_historial')) {
                        return { rowCount: 1, rows: [] };
                    }
                    return { rows: [] };
                },
                release: () => {}
            };
            return client;
        }
    };
    const deps = {
        pool,
        normalizeCedula,
        getClientesList: async () => ['Cliente X'],
        listScopedDistinctClientes: async () => ['Cliente X'],
        listAssignedClientesForGpUserId: async () => [],
        resolveGpInternalUserIdForScope: async () => null,
        normalizeCatalogValue: (v) => v
    };
    const scope = { role: 'analista_conciliaciones', canViewAllAreas: true, areas: [] };
    const actor = { id: 'u1', email: 'analista@test.com', full_name: 'Analista', role: 'analista_conciliaciones' };

    const out = await deleteConciliacionFacturacion(deps, scope, {
        cedula: '12.345.678',
        anio: 2026,
        mes: 5,
        observacion: 'Corrección solicitada'
    }, actor);
    assert.equal(out.reverted, 1);

    const update = queryArgs.find((q) => q.client && String(q.sql).includes('UPDATE conciliaciones_facturacion'));
    assert.ok(update);
    assert.ok(String(update.sql).includes("estado = 'PENDIENTE'"));

    const hist = queryArgs.find((q) => q.client && String(q.sql).includes('INSERT INTO conciliaciones_facturacion_historial'));
    assert.ok(hist);
    assert.ok(String(hist.sql).includes("'REVERTIR'"));
    assert.equal(hist.params[4], 'APROBADO_ANALISTA');
    assert.equal(hist.params[5], 'Corrección solicitada');
});

test('upsertConciliacionFacturacionMasiva respeta cedulas opcionales del payload', async () => {
    let queryArgs = [];
    const pool = {
        query: async (sql, params) => {
            queryArgs.push({ sql, params });
            if (String(sql).includes('FROM colaboradores') && String(sql).includes('cedula')) {
                return { rows: [{ cedula: '111' }, { cedula: '222' }, { cedula: '333' }] };
            }
            return { rows: [] };
        },
        connect: async () => ({
            query: async (sql, params) => {
                queryArgs.push({ sql, params });
                return { rows: [] };
            },
            release: () => {}
        })
    };
    const deps = {
        pool,
        normalizeCedula,
        getClientesList: async () => ['Cliente X'],
        listScopedDistinctClientes: async () => ['Cliente X'],
        listAssignedClientesForGpUserId: async () => [],
        resolveGpInternalUserIdForScope: async () => null,
        normalizeCatalogValue: (v) => v
    };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const { upsertConciliacionFacturacionMasiva } = require('../src/conciliaciones/conciliacionesQueries');

    const out = await upsertConciliacionFacturacionMasiva(deps, scope, {
        cliente: 'Cliente X',
        anio: 2026,
        mes: 5,
        estado: 'CONCILIADA',
        cedulas: ['222', '999']
    });

    assert.equal(out.updated, 1);
    const upserts = queryArgs.filter((q) => String(q.sql).includes('INSERT INTO conciliaciones_facturacion'));
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0].params[0], '222');
});

test('createServicio inserta correctamente', async () => {
    let queryArgs = [];
    const pool = {
        query: async (sql, params) => {
            queryArgs.push({ sql, params });
            if (String(sql).includes('INSERT INTO servicios')) {
                return {
                    rows: [{
                        id: 'srv-123',
                        cliente: params[0],
                        nombre_servicio: params[1],
                        inicio_contrato: new Date('2026-06-08'),
                        dia_cierre: params[3],
                        modo_facturacion: params[4],
                        tipo_facturacion: params[5],
                        horas_base: params[6]
                    }]
                };
            }
            return { rows: [] };
        }
    };
    const deps = {
        pool,
        normalizeCedula,
        getClientesList: async () => ['Cliente X'],
        listScopedDistinctClientes: async () => ['Cliente X'],
        listAssignedClientesForGpUserId: async () => [],
        resolveGpInternalUserIdForScope: async () => null,
        normalizeCatalogValue: (v) => v
    };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const payload = {
        client: 'Cliente X',
        serviceName: 'Soporte',
        inicio_contrato: '2026-06-08',
        dia_cierre: 31,
        modo_facturacion: 'HORAS',
        tipo_facturacion: 'MES_VENCIDO',
        horas_base: 160
    };

    const out = await createServicio(deps, scope, payload);
    assert.equal(out.id, 'srv-123');
    assert.equal(out.client, 'Cliente X');
    assert.equal(out.serviceName, 'Soporte');
    assert.equal(out.diaCierre, 31);
    assert.equal(out.tipoFacturacion, 'MES_VENCIDO');
    assert.equal(out.horasBase, 160);
});

test('listServicios devuelve lista formateada', async () => {
    const pool = {
        query: async () => ({
            rows: [{
                id: 'srv-123',
                cliente: 'Cliente X',
                nombre_servicio: 'Soporte',
                inicio_contrato: new Date('2026-06-08'),
                dia_cierre: 31,
                modo_facturacion: 'HORAS',
                tipo_facturacion: 'MES_VENCIDO',
                horas_base: 160,
                created_at: new Date('2026-06-17')
            }]
        })
    };
    const deps = {
        pool,
        getClientesList: async () => ['Cliente X'],
        listScopedDistinctClientes: async () => ['Cliente X'],
        listAssignedClientesForGpUserId: async () => [],
        resolveGpInternalUserIdForScope: async () => null,
        normalizeCatalogValue: (v) => v
    };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };

    const items = await listServicios(deps, scope);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, 'srv-123');
    assert.equal(items[0].serviceName, 'Soporte');
    assert.equal(items[0].diaCierre, 31);
    assert.equal(items[0].modoFacturacion, 'HORAS');
    assert.equal(items[0].tipoFacturacion, 'MES_VENCIDO');
    assert.equal(items[0].horasBase, 160);
});

test('updateServicio actualiza correctamente', async () => {
    let queryArgs = [];
    const pool = {
        query: async (sql, params) => {
            queryArgs.push({ sql, params });
            if (String(sql).includes('SELECT cliente FROM servicios')) {
                return { rows: [{ cliente: 'Cliente X' }] };
            }
            if (String(sql).includes('UPDATE servicios')) {
                return {
                    rows: [{
                        id: 'srv-123',
                        cliente: params[0],
                        nombre_servicio: params[1],
                        inicio_contrato: new Date('2026-06-09'),
                        dia_cierre: params[3],
                        modo_facturacion: params[4],
                        tipo_facturacion: params[5],
                        horas_base: params[6]
                    }]
                };
            }
            return { rows: [] };
        }
    };
    const deps = {
        pool,
        normalizeCedula,
        getClientesList: async () => ['Cliente X'],
        listScopedDistinctClientes: async () => ['Cliente X'],
        listAssignedClientesForGpUserId: async () => [],
        resolveGpInternalUserIdForScope: async () => null,
        normalizeCatalogValue: (v) => v
    };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const payload = {
        client: 'Cliente X',
        serviceName: 'Soporte Modificado',
        inicio_contrato: '2026-06-09',
        dia_cierre: 15,
        modo_facturacion: 'HORAS',
        tipo_facturacion: 'MES_VENCIDO',
        horas_base: 160
    };

    const out = await updateServicio(deps, scope, 'srv-123', payload);
    assert.equal(out.id, 'srv-123');
    assert.equal(out.serviceName, 'Soporte Modificado');
    assert.equal(out.diaCierre, 15);
    assert.equal(out.tipoFacturacion, 'MES_VENCIDO');
    assert.equal(out.horasBase, 160);
});

test('deleteServicio elimina servicio y consultores asociados', async () => {
    let queryArgs = [];
    const client = {
        query: async (sql, params) => {
            queryArgs.push({ sql, params });
            return { rows: [] };
        },
        release: () => {}
    };
    const pool = {
        query: async (sql, params) => {
            queryArgs.push({ sql, params });
            if (String(sql).includes('SELECT cliente FROM servicios')) {
                return { rows: [{ cliente: 'Cliente X' }] };
            }
            return { rows: [] };
        },
        connect: async () => client
    };
    const deps = {
        pool,
        getClientesList: async () => ['Cliente X'],
        listScopedDistinctClientes: async () => ['Cliente X'],
        listAssignedClientesForGpUserId: async () => [],
        resolveGpInternalUserIdForScope: async () => null,
        normalizeCatalogValue: (v) => v
    };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };

    const out = await deleteServicio(deps, scope, 'srv-123');
    assert.deepEqual(out, { success: true });

    // Verificar que se eliminaron consultores asociados y luego el servicio
    const deletes = queryArgs.filter(q => String(q.sql).includes('DELETE FROM'));
    assert.equal(deletes.length, 2);
    assert.ok(deletes[0].sql.includes('servicio_consultores'));
    assert.ok(deletes[1].sql.includes('servicios'));
});

test('getColaCierresPorMes agrega por servicio con consultores asociados', async () => {
    const pool = {
        query: async (sql) => {
            if (String(sql).includes('FROM novedades')) {
                return { rows: [{ cedula: '12345678', tipo_novedad: 'Incapacidad', monto_cop: '50' }] };
            }
            if (String(sql).includes('FROM colaboradores')) {
                return {
                    rows: [
                        {
                            cedula: '12345678',
                            nombre: 'Ana',
                            cliente: 'Cliente X',
                            tarifa_cliente: '1000',
                            moneda: 'COP',
                            profesion: 'Dev',
                            estado: 'PENDIENTE',
                            cerrado: false
                        },
                        {
                            cedula: '87654321',
                            nombre: 'Bob',
                            cliente: 'Cliente X',
                            tarifa_cliente: '2000',
                            moneda: 'COP',
                            profesion: 'Dev',
                            estado: 'PENDIENTE',
                            cerrado: false
                        }
                    ]
                };
            }
            return { rows: [] };
        }
    };
    const deps = { pool, normalizeCedula, canRoleViewType, getClientesList: async () => ['Cliente X'], normalizeCatalogValue: (v) => String(v || '').trim() };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const { getColaCierresPorMes } = require('../src/conciliaciones/conciliacionesQueries');

    const servicios = [
        {
            id: 'srv-1',
            client: 'Cliente X',
            serviceName: 'ORBIT',
            closingDay: 25,
            billingMode: 'HOURS',
            billingType: 'ADVANCE_MONTH',
            baseHours: 160,
            consultoresCedulas: ['12345678']
        }
    ];

    const { items, count } = await getColaCierresPorMes(deps, scope, 2026, 5, '', servicios);
    assert.equal(count, 1);
    assert.equal(items[0].serviceName, 'ORBIT');
    assert.equal(items[0].billingMode, 'HOURS');
    assert.equal(items[0].baseHours, 160);
    assert.equal(items[0].consultoresTotal, 1);
    assert.equal(items[0].totales.tarifaSum, 1000);
    assert.equal(items[0].estadoCola, 'PENDIENTE');
});

test('getConciliacionesDashboardResumen usa cola de servicios (no todos los colaboradores)', async () => {
    const pool = {
        query: async (sql) => {
            if (String(sql).includes('FROM novedades')) {
                return { rows: [] };
            }
            if (String(sql).includes('FROM colaboradores')) {
                return {
                    rows: [
                        {
                            cedula: '111',
                            nombre: 'En servicio',
                            cliente: 'Cliente X',
                            tarifa_cliente: '1000',
                            moneda: 'COP',
                            cerrado: false
                        },
                        {
                            cedula: '222',
                            nombre: 'Sin servicio',
                            cliente: 'Cliente X',
                            tarifa_cliente: '9000',
                            moneda: 'COP',
                            cerrado: false
                        }
                    ]
                };
            }
            return { rows: [] };
        }
    };
    const deps = { pool, normalizeCedula, canRoleViewType, getClientesList: async () => ['Cliente X'], normalizeCatalogValue: (v) => String(v || '').trim() };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const { getConciliacionesDashboardResumen } = require('../src/conciliaciones/conciliacionesQueries');
    const servicios = [
        {
            id: 'srv-1',
            client: 'Cliente X',
            serviceName: 'ORBIT',
            billingType: 'ADVANCE_MONTH',
            consultoresCedulas: ['111']
        }
    ];
    const out = await getConciliacionesDashboardResumen(deps, scope, 2026, 5, servicios);
    assert.equal(out.clientesCount, 1);
    assert.equal(out.serviciosCount, 1);
    assert.equal(out.rows[0].totales.tarifaSum, 1000);
    assert.equal(out.globalTotales.facturaSum, 1000);
});

test('isWideConciliacionRole reconoce roles operativos amplios', () => {
    assert.equal(isWideConciliacionRole('nomina'), true);
    assert.equal(isWideConciliacionRole('analista_conciliaciones'), true);
    assert.equal(isWideConciliacionRole('gp'), false);
});

test('mergeConciliacionClientesLists deduplica por fold', () => {
    const merged = mergeConciliacionClientesLists(['Cliente A'], ['cliente a', 'Cliente B']);
    assert.deepEqual(merged, ['Cliente A', 'Cliente B']);
});

test('mergeConciliacionClientesLists deduplica alias Zoho contra canónico', () => {
    const merged = mergeConciliacionClientesLists(['DIRECTV CHILE'], ['DIRECT TV CHILE', 'EXPERIAN CHILE']);
    assert.deepEqual(merged, ['DIRECTV CHILE', 'EXPERIAN CHILE']);
});

test('assertClienteConciliacionPermitido: nomina accede a cliente fuera de lista PG', async () => {
    const deps = {
        pool: { query: async () => ({ rows: [] }) },
        getClientesList: async () => ['Cliente PG'],
        normalizeCatalogValue: (v) => String(v || '').trim(),
        listScopedDistinctClientes: async () => [],
        listAssignedClientesForGpUserId: async () => [],
        resolveGpInternalUserIdForScope: async () => null
    };
    const scope = { role: 'nomina', canViewAllAreas: false, areas: [] };
    const out = await assertClienteConciliacionPermitido(deps, scope, 'Solo Dynamo');
    assert.equal(out.ok, true);
    assert.equal(out.canon, 'Solo Dynamo');
});

test('assertClienteConciliacionPermitido: gp bloqueado fuera de su lista', async () => {
    const deps = {
        pool: { query: async () => ({ rows: [] }) },
        getClientesList: async () => ['Cliente PG'],
        normalizeCatalogValue: (v) => String(v || '').trim(),
        listScopedDistinctClientes: async () => [],
        listAssignedClientesForGpUserId: async () => ['Cliente PG'],
        resolveGpInternalUserIdForScope: async () => 'gp-1'
    };
    const scope = { role: 'gp', canViewAllAreas: false, areas: [] };
    const out = await assertClienteConciliacionPermitido(deps, scope, 'Otro Cliente');
    assert.equal(out.ok, false);
    assert.equal(out.status, 403);
});

test('getConciliacionResumenPorClienteMes ADVANCE junio: factura = tarifa plena con novedades informativas', async () => {
    const pool = {
        query: async (sql) => {
            if (String(sql).includes('FROM novedades')) {
                return {
                    rows: [
                        {
                            id: 'nov-jun-1',
                            cedula: '12345678',
                            tipo_novedad: 'Incapacidad',
                            monto_cop: '800000',
                            cantidad_horas: 2,
                            unidad: 'dias',
                            fecha_inicio: '2026-06-10',
                            fecha_fin: '2026-06-11',
                            aprobado_en: new Date('2026-06-12T12:00:00Z')
                        }
                    ]
                };
            }
            if (String(sql).includes('FROM colaboradores')) {
                return {
                    rows: [
                        {
                            cedula: '12345678',
                            nombre: 'Test User',
                            cliente: 'Cliente X',
                            tarifa_cliente: '10000000',
                            moneda: 'COP',
                            profesion: 'Dev'
                        }
                    ]
                };
            }
            return { rows: [] };
        }
    };
    const deps = { pool, normalizeCedula, canRoleViewType };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const { rows } = await getConciliacionResumenPorClienteMes(deps, scope, 'Cliente X', 2026, 6, {
        billingType: 'ADVANCE_MONTH'
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].facturaCop, 10_000_000);
    assert.equal(rows[0].novedadesCount, 1);
    assert.equal(rows[0].novedadesSumCop, 0);
    assert.equal(rows[0].billingAdvanceMode, true);
    assert.equal(rows[0].pendingAdjustmentCount, 1);
});

test('getConciliacionResumenPorClienteMes ADVANCE julio: incluye ajuste de junio', async () => {
    const pool = {
        query: async (sql, params) => {
            const s = String(sql);
            if (s.includes('FROM novedades') && params?.[1] === '2026-06-01') {
                return {
                    rows: [
                        {
                            id: 'nov-jun-adj',
                            cedula: '12345678',
                            tipo_novedad: 'Incapacidad',
                            monto_cop: '800000',
                            cantidad_horas: 2,
                            unidad: 'dias',
                            fecha_inicio: '2026-06-10',
                            fecha_fin: '2026-06-11',
                            aprobado_en: new Date('2026-06-12T12:00:00Z')
                        }
                    ]
                };
            }
            if (s.includes('FROM novedades')) {
                return { rows: [] };
            }
            if (s.includes('FROM colaboradores')) {
                return {
                    rows: [
                        {
                            cedula: '12345678',
                            nombre: 'Test User',
                            cliente: 'Cliente X',
                            tarifa_cliente: '10000000',
                            moneda: 'COP',
                            profesion: 'Dev'
                        }
                    ]
                };
            }
            return { rows: [] };
        }
    };
    const deps = { pool, normalizeCedula, canRoleViewType };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const { rows } = await getConciliacionResumenPorClienteMes(deps, scope, 'Cliente X', 2026, 7, {
        billingType: 'ADVANCE_MONTH'
    });
    assert.equal(rows.length, 1);
    assert.ok(rows[0].ajusteAnticipoSumCop > 0);
    assert.equal(rows[0].saldoAnticipoTipo, 'favor');
    assert.equal(rows[0].facturaCop, 10_000_000 - rows[0].ajusteAnticipoSumCop);
    assert.equal(rows[0].ajusteAnticipoMesLabel, 'Jun 2026');
});

test('getConciliacionResumenPorClienteMes APROBADO_ANALISTA solo cuenta consumidas', async () => {
    const consumed = {
        id: 'aaaa1111-1111-1111-1111-111111111111',
        cedula: '12345678',
        tipo_novedad: 'Bonos',
        monto_cop: '100',
        cantidad_horas: 0,
        unidad: null,
        modalidad: null,
        hora_inicio: null,
        hora_fin: null,
        fecha_inicio: '2026-06-01',
        fecha_fin: '2026-06-01'
    };
    const lateElegible = {
        id: 'bbbb2222-2222-2222-2222-222222222222',
        cedula: '12345678',
        tipo_novedad: 'Incapacidad',
        monto_cop: '50',
        cantidad_horas: 1,
        unidad: null,
        modalidad: null,
        hora_inicio: null,
        hora_fin: null,
        fecha_inicio: '2026-06-20',
        fecha_fin: '2026-06-20'
    };
    const pool = {
        query: async (sql) => {
            const s = String(sql);
            if (s.includes('INNER JOIN novedades nov ON nov.id = cnc.novedad_id')) {
                return { rows: [consumed] };
            }
            if (s.includes('FROM novedades nov')) {
                return { rows: [consumed, lateElegible] };
            }
            if (s.includes('FROM colaboradores')) {
                return {
                    rows: [
                        {
                            cedula: '12345678',
                            nombre: 'Test User',
                            cliente: 'Cliente X',
                            tarifa_cliente: '3000',
                            moneda: 'COP',
                            estado: 'APROBADO_ANALISTA',
                            facturacion_id: 'fact-id'
                        }
                    ]
                };
            }
            return { rows: [] };
        }
    };
    const deps = { pool, normalizeCedula, canRoleViewType };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const { rows } = await getConciliacionResumenPorClienteMes(deps, scope, 'Cliente X', 2026, 6);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].novedadesCount, 1);
    assert.equal(rows[0].estado, 'APROBADO_ANALISTA');
});

test('getConciliacionResumenPorClienteMes julio PENDIENTE no incluye novedad junio aprobada en junio', async () => {
    const backlogJun = {
        id: 'cccc3333-3333-3333-3333-333333333333',
        cedula: '12345678',
        tipo_novedad: 'Permiso remunerado',
        monto_cop: null,
        cantidad_horas: 1,
        unidad: 'dias',
        modalidad: null,
        hora_inicio: null,
        hora_fin: null,
        fecha_inicio: '2026-06-25',
        fecha_fin: '2026-06-25',
        aprobado_en: new Date('2026-06-28T12:00:00Z')
    };
    const pool = {
        query: async (sql) => {
            const s = String(sql);
            if (s.includes('INNER JOIN novedades nov ON nov.id = cnc.novedad_id')) {
                return { rows: [] };
            }
            if (s.includes('FROM novedades nov')) {
                return { rows: [backlogJun] };
            }
            if (s.includes('FROM colaboradores')) {
                return {
                    rows: [
                        {
                            cedula: '12345678',
                            nombre: 'Test User',
                            cliente: 'Cliente X',
                            tarifa_cliente: '3000',
                            moneda: 'COP',
                            estado: 'PENDIENTE'
                        }
                    ]
                };
            }
            return { rows: [] };
        }
    };
    const deps = { pool, normalizeCedula, canRoleViewType };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const { rows } = await getConciliacionResumenPorClienteMes(deps, scope, 'Cliente X', 2026, 7, {
        billingType: 'EXPIRED_MONTH'
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].novedadesCount, 0);
    assert.equal(rows[0].estado, 'PENDIENTE');
});

test('applyConciliacionFacturacionRevision: rol nomina ya no puede rechazar', async () => {
    const pool = {
        query: async (sql) => {
            if (String(sql).includes('SELECT cliente FROM colaboradores')) {
                return { rows: [{ cliente: 'Cliente X' }] };
            }
            return { rows: [] };
        },
        connect: async () => ({
            query: async () => ({ rows: [] }),
            release: () => {}
        })
    };
    const deps = {
        pool,
        normalizeCedula,
        getClientesList: async () => ['Cliente X'],
        listScopedDistinctClientes: async () => ['Cliente X'],
        listAssignedClientesForGpUserId: async () => [],
        resolveGpInternalUserIdForScope: async () => null,
        normalizeCatalogValue: (v) => v
    };
    const { applyConciliacionFacturacionRevision } = require('../src/conciliaciones/conciliacionesQueries');
    await assert.rejects(
        () =>
            applyConciliacionFacturacionRevision(
                deps,
                { role: 'nomina', canViewAllAreas: true, areas: [] },
                {
                    cedula: '12345678',
                    anio: 2026,
                    mes: 6,
                    accion: 'rechazar',
                    observacion: 'Corregir montos',
                    etapaObjetivo: 'NOMINA'
                },
                { role: 'nomina', email: 'nom@t.com' }
            ),
        (err) => /No autorizado|Etapa objetivo inválida/i.test(err.message)
    );
});

function matchesColaboradorVisibleEnMes(col, year, month) {
    if (col.activo !== false) return true;
    const salida = col.fecha_baja_efectiva || col.fecha_termino;
    if (!salida) return false;
    const d = new Date(String(salida).slice(0, 10));
    return d.getFullYear() === year && d.getMonth() + 1 === month;
}

function buildVisibleMesPool(colaboradores) {
    return {
        query: async (sql, params) => {
            const s = String(sql);
            if (s.includes('FROM novedades')) return { rows: [] };
            if (s.includes('colaborador_asignaciones') || s.includes('colaborador_tarifa_historial')) {
                return { rows: [] };
            }
            if (s.includes('FROM colaboradores')) {
                const year = Number(params[1]);
                const month = Number(params[2]);
                return {
                    rows: colaboradores.filter((c) => matchesColaboradorVisibleEnMes(c, year, month))
                };
            }
            return { rows: [] };
        }
    };
}

test('getConciliacionResumenPorClienteMes: inactivo salida junio visible junio no julio', async () => {
    const colaboradores = [
        {
            cedula: '111',
            nombre: 'Activo',
            activo: true,
            cliente: 'Cliente X',
            tarifa_cliente: '1000',
            moneda: 'COP'
        },
        {
            cedula: '222',
            nombre: 'Salida Jun',
            activo: false,
            fecha_baja_efectiva: '2026-06-15',
            cliente: 'Cliente X',
            tarifa_cliente: '2000',
            moneda: 'COP'
        },
        {
            cedula: '333',
            nombre: 'Baja Mar',
            activo: false,
            fecha_baja_efectiva: '2026-03-01',
            cliente: 'Cliente X',
            tarifa_cliente: '3000',
            moneda: 'COP'
        },
        {
            cedula: '444',
            nombre: 'Inactivo sin fecha',
            activo: false,
            cliente: 'Cliente X',
            tarifa_cliente: '4000',
            moneda: 'COP'
        }
    ];
    const deps = {
        pool: buildVisibleMesPool(colaboradores),
        normalizeCedula,
        canRoleViewType
    };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };

    const jun = await getConciliacionResumenPorClienteMes(deps, scope, 'Cliente X', 2026, 6);
    assert.deepEqual(
        jun.rows.map((r) => r.cedula).sort(),
        ['111', '222']
    );

    const jul = await getConciliacionResumenPorClienteMes(deps, scope, 'Cliente X', 2026, 7);
    assert.deepEqual(jul.rows.map((r) => r.cedula), ['111']);
});

test('getConciliacionResumenPorClienteMes: activo sin servicio visible en cualquier mes', async () => {
    const colaboradores = [
        {
            cedula: '999',
            nombre: 'Sin servicio activo',
            activo: true,
            cliente: 'Cliente X',
            tarifa_cliente: '5000',
            moneda: 'COP'
        }
    ];
    const deps = {
        pool: buildVisibleMesPool(colaboradores),
        normalizeCedula,
        canRoleViewType
    };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };

    const may = await getConciliacionResumenPorClienteMes(deps, scope, 'Cliente X', 2026, 5);
    const jul = await getConciliacionResumenPorClienteMes(deps, scope, 'Cliente X', 2026, 7);
    assert.equal(may.rows.length, 1);
    assert.equal(jul.rows.length, 1);
    assert.equal(may.rows[0].cedula, '999');
});
