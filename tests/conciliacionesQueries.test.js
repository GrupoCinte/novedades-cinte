const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCedula } = require('../src/utils');
const { canRoleViewType } = require('../src/rbac');
const { 
    getConciliacionResumenPorClienteMes,
    getConciliacionResumenTodosClientesMes,
    upsertConciliacionFacturacion,
    listConciliacionesFacturacion,
    listServicios,
    createServicio,
    updateServicio,
    deleteServicio,
    listServicioConsultores,
    upsertServicioConsultores
} = require('../src/conciliaciones/conciliacionesQueries');

test('getConciliacionResumenPorClienteMes agrega solo novedades visibles y calcula factura', async () => {
    const pool = {
        query: async (sql) => {
            if (String(sql).includes('FROM novedades')) {
                return {
                    rows: [
                        { cedula: '12.345.678', tipo_novedad: 'Incapacidad', monto_cop: '100' },
                        { cedula: '12.345.678', tipo_novedad: 'Incapacidad', monto_cop: '50.25' }
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
    assert.equal(rows.length, 1);
    assert.equal(rows[0].novedadesCount, 2);
    assert.equal(rows[0].novedadesSumCop, 150.25);
    assert.equal(rows[0].facturaCop, 5000 - 150.25);
    assert.equal(totales.tarifaSum, 5000);
    assert.equal(totales.deduccionSum, 150.25);
    assert.equal(totales.colaboradores, 1);
    assert.equal(totales.conNovedad, 1);
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
            if (String(sql).includes('SELECT cedula FROM colaboradores')) {
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
        estado: 'RADICADA',
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
    assert.equal(upserts[0].params[3], 'RADICADA');
    assert.equal(upserts[0].params[4], 'FV-999');
});

test('upsertConciliacionFacturacionMasiva respeta cedulas opcionales del payload', async () => {
    let queryArgs = [];
    const pool = {
        query: async (sql, params) => {
            queryArgs.push({ sql, params });
            if (String(sql).includes('SELECT cedula FROM colaboradores')) {
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
