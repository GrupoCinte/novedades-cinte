'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    listNovedadesElegiblesParaCierre,
    consumirNovedadesParaCierreAnalista,
    liberarNovedadesConsumidas
} = require('../src/conciliaciones/conciliacionNovedadElegibilidad');

const normalizeCedula = (v) => String(v || '').replace(/\D/g, '');
const canRoleViewType = () => true;

test('novedad mayo aprobada en junio entra en cierre junio (mes aprobación)', async () => {
    const pool = {
        query: async (sql) => {
            if (String(sql).includes('FROM novedades')) {
                return {
                    rows: [
                        {
                            id: '11111111-1111-1111-1111-111111111111',
                            cedula: '12345678',
                            tipo_novedad: 'Incapacidad',
                            monto_cop: '100',
                            cantidad_horas: 1,
                            unidad: null,
                            modalidad: null,
                            hora_inicio: null,
                            hora_fin: null,
                            fecha_inicio: '2026-05-10',
                            fecha_fin: '2026-05-10',
                            aprobado_en: new Date('2026-06-05T15:00:00Z')
                        }
                    ]
                };
            }
            return { rows: [] };
        }
    };
    const deps = { pool, normalizeCedula, canRoleViewType };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };

    const may = await listNovedadesElegiblesParaCierre(deps, scope, {
        clienteCanon: 'Cliente X',
        cedulaRaw: '12345678',
        factAnio: 2026,
        factMes: 5
    });
    assert.equal(may.length, 0, 'mayo sin aprobación en mayo no debe incluir novedad tardía');

    const jun = await listNovedadesElegiblesParaCierre(deps, scope, {
        clienteCanon: 'Cliente X',
        cedulaRaw: '12345678',
        factAnio: 2026,
        factMes: 6
    });
    assert.equal(jun.length, 1);
    assert.equal(String(jun[0].id), '11111111-1111-1111-1111-111111111111');
});

test('novedad consumida no aparece en otro cierre', async () => {
    let sqlText = '';
    const pool = {
        query: async (sql) => {
            sqlText = String(sql);
            if (sql.includes('FROM novedades')) {
                return {
                    rows: [
                        {
                            id: '22222222-2222-2222-2222-222222222222',
                            cedula: '12345678',
                            tipo_novedad: 'Bonos',
                            monto_cop: '50',
                            cantidad_horas: 0,
                            unidad: null,
                            modalidad: null,
                            hora_inicio: null,
                            hora_fin: null,
                            fecha_inicio: '2026-06-01',
                            fecha_fin: '2026-06-01',
                            aprobado_en: new Date('2026-06-02T12:00:00Z')
                        }
                    ]
                };
            }
            return { rows: [] };
        }
    };
    const deps = { pool, normalizeCedula, canRoleViewType };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };

    const rows = await listNovedadesElegiblesParaCierre(deps, scope, {
        clienteCanon: 'Cliente X',
        factAnio: 2026,
        factMes: 6
    });
    assert.equal(rows.length, 1);
    assert.ok(sqlText.includes('conciliaciones_novedad_consumo'));
});

test('novedad consumida sigue visible en resumen del mismo cierre', async () => {
    const {
        listNovedadesConsumidasParaCierre,
        listNovedadesParaFacturacionResumen
    } = require('../src/conciliaciones/conciliacionNovedadElegibilidad');

    const consumedRow = {
        id: '55555555-5555-5555-5555-555555555555',
        cedula: '12345678',
        tipo_novedad: 'Bonos',
        monto_cop: '50',
        cantidad_horas: 0,
        unidad: null,
        modalidad: null,
        hora_inicio: null,
        hora_fin: null,
        fecha_inicio: '2026-06-01',
        fecha_fin: '2026-06-01',
        aprobado_en: new Date('2026-06-02T12:00:00Z')
    };

    const pool = {
        query: async (sql) => {
            const s = String(sql);
            if (s.includes('conciliaciones_novedad_consumo')) {
                return { rows: [consumedRow] };
            }
            if (s.includes('FROM novedades')) {
                return { rows: [] };
            }
            return { rows: [] };
        }
    };
    const deps = { pool, normalizeCedula, canRoleViewType };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const opts = { clienteCanon: 'Cliente X', factAnio: 2026, factMes: 6 };

    const consumidas = await listNovedadesConsumidasParaCierre(deps, scope, opts);
    assert.equal(consumidas.length, 1);
    assert.equal(String(consumidas[0].id), consumedRow.id);

    const merged = await listNovedadesParaFacturacionResumen(deps, scope, opts);
    assert.equal(merged.length, 1);
    assert.equal(String(merged[0].id), consumedRow.id);
});

test('revert libera novedades consumidas', async () => {
    const calls = [];
    const client = {
        query: async (sql, params) => {
            calls.push(String(sql));
            return { rows: [] };
        }
    };
    await liberarNovedadesConsumidas(client, 'fact-uuid-1');
    assert.equal(calls.length, 1);
    assert.ok(calls[0].includes('DELETE FROM conciliaciones_novedad_consumo'));
    assert.ok(calls[0].includes('facturacion_id'));
});

test('consumir al aprobar analista inserta filas de consumo', async () => {
    const inserts = [];
    const pool = {
        query: async (sql) => {
            if (String(sql).includes('FROM novedades')) {
                return {
                    rows: [
                        {
                            id: '33333333-3333-3333-3333-333333333333',
                            cedula: '12345678',
                            tipo_novedad: 'Bonos',
                            monto_cop: '10',
                            cantidad_horas: 0,
                            unidad: null,
                            modalidad: null,
                            hora_inicio: null,
                            hora_fin: null,
                            fecha_inicio: '2026-06-01',
                            fecha_fin: '2026-06-01',
                            aprobado_en: new Date('2026-06-02T12:00:00Z')
                        }
                    ]
                };
            }
            return { rows: [] };
        }
    };
    const client = {
        query: async (sql, params) => {
            if (String(sql).includes('INSERT INTO conciliaciones_novedad_consumo')) {
                inserts.push(params);
            }
            return { rows: [] };
        }
    };
    const deps = { pool, normalizeCedula, canRoleViewType };
    const scope = { role: 'analista_conciliaciones', canViewAllAreas: true, areas: [] };

    const ids = await consumirNovedadesParaCierreAnalista(client, deps, scope, {
        facturacionId: '44444444-4444-4444-4444-444444444444',
        cedula: '12345678',
        anio: 2026,
        mes: 6,
        clienteCanon: 'Cliente X',
        billingType: null,
        actorUserId: null
    });
    assert.equal(ids.length, 1);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0][0], '33333333-3333-3333-3333-333333333333');
});

test('ADVANCE julio incluye novedades eff-junio vía bloque ajuste anticipo', async () => {
    const pool = {
        query: async (sql, params) => {
            const s = String(sql);
            if (s.includes('FROM novedades') && params?.[1] === '2026-06-01') {
                return {
                    rows: [
                        {
                            id: 'aaaa1111-1111-1111-1111-111111111111',
                            cedula: '12345678',
                            tipo_novedad: 'Incapacidad',
                            monto_cop: '100',
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
            return { rows: [] };
        }
    };
    const deps = { pool, normalizeCedula, canRoleViewType };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const jul = await listNovedadesElegiblesParaCierre(deps, scope, {
        clienteCanon: 'Cliente X',
        cedulaRaw: '12345678',
        factAnio: 2026,
        factMes: 7,
        billingType: 'ADVANCE_MONTH'
    });
    assert.equal(jul.length, 1);
    assert.equal(String(jul[0].id), 'aaaa1111-1111-1111-1111-111111111111');
});

test('ADVANCE junio no consume novedades del mes actual al aprobar analista', async () => {
    const inserts = [];
    const pool = {
        query: async (sql) => {
            if (String(sql).includes('FROM novedades')) {
                return {
                    rows: [
                        {
                            id: 'bbbb2222-2222-2222-2222-222222222222',
                            cedula: '12345678',
                            tipo_novedad: 'Incapacidad',
                            monto_cop: '100',
                            cantidad_horas: 1,
                            unidad: null,
                            fecha_inicio: '2026-06-15',
                            fecha_fin: '2026-06-15',
                            aprobado_en: new Date('2026-06-16T12:00:00Z')
                        }
                    ]
                };
            }
            return { rows: [] };
        }
    };
    const client = {
        query: async (sql, params) => {
            if (String(sql).includes('INSERT INTO conciliaciones_novedad_consumo')) {
                inserts.push(params);
            }
            return { rows: [] };
        }
    };
    const deps = { pool, normalizeCedula, canRoleViewType };
    const scope = { role: 'analista_conciliaciones', canViewAllAreas: true, areas: [] };
    const ids = await consumirNovedadesParaCierreAnalista(client, deps, scope, {
        facturacionId: '44444444-4444-4444-4444-444444444444',
        cedula: '12345678',
        anio: 2026,
        mes: 6,
        clienteCanon: 'Cliente X',
        billingType: 'ADVANCE_MONTH',
        actorUserId: null
    });
    assert.equal(ids.length, 0);
    assert.equal(inserts.length, 0);
});

test('ADVANCE julio consume solo novedades de ajuste (mes anterior)', async () => {
    const inserts = [];
    const pool = {
        query: async (sql, params) => {
            const s = String(sql);
            if (s.includes('FROM novedades') && params?.[1] === '2026-06-01') {
                return {
                    rows: [
                        {
                            id: 'cccc3333-3333-3333-3333-333333333333',
                            cedula: '12345678',
                            tipo_novedad: 'Incapacidad',
                            monto_cop: '100',
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
                return {
                    rows: [
                        {
                            id: 'dddd4444-4444-4444-4444-444444444444',
                            cedula: '12345678',
                            tipo_novedad: 'Vacaciones en tiempo',
                            monto_cop: null,
                            cantidad_horas: 2,
                            unidad: 'dias',
                            fecha_inicio: '2026-07-05',
                            fecha_fin: '2026-07-06',
                            aprobado_en: new Date('2026-07-06T12:00:00Z')
                        }
                    ]
                };
            }
            return { rows: [] };
        }
    };
    const client = {
        query: async (sql, params) => {
            if (String(sql).includes('INSERT INTO conciliaciones_novedad_consumo')) {
                inserts.push(params);
            }
            return { rows: [] };
        }
    };
    const deps = { pool, normalizeCedula, canRoleViewType };
    const scope = { role: 'analista_conciliaciones', canViewAllAreas: true, areas: [] };
    const ids = await consumirNovedadesParaCierreAnalista(client, deps, scope, {
        facturacionId: '44444444-4444-4444-4444-444444444444',
        cedula: '12345678',
        anio: 2026,
        mes: 7,
        clienteCanon: 'Cliente X',
        billingType: 'ADVANCE_MONTH',
        actorUserId: null
    });
    assert.equal(ids.length, 1);
    assert.equal(inserts[0][0], 'cccc3333-3333-3333-3333-333333333333');
});

test('ADVANCE agosto no repite novedades de junio (sin regla C)', async () => {
    const pool = {
        query: async (sql, params) => {
            const s = String(sql);
            if (s.includes('FROM novedades') && params?.[1] === '2026-06-01') {
                return { rows: [] };
            }
            if (s.includes('FROM novedades') && params?.[1] === '2026-07-01') {
                return { rows: [] };
            }
            if (s.includes('FROM novedades')) {
                return {
                    rows: [
                        {
                            id: 'eeee5555-5555-5555-5555-555555555555',
                            cedula: '12345678',
                            tipo_novedad: 'Incapacidad',
                            monto_cop: '100',
                            cantidad_horas: 2,
                            unidad: 'dias',
                            fecha_inicio: '2026-06-10',
                            fecha_fin: '2026-06-11',
                            aprobado_en: new Date('2026-06-12T12:00:00Z')
                        }
                    ]
                };
            }
            return { rows: [] };
        }
    };
    const deps = { pool, normalizeCedula, canRoleViewType };
    const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };
    const ago = await listNovedadesElegiblesParaCierre(deps, scope, {
        clienteCanon: 'Cliente X',
        cedulaRaw: '12345678',
        factAnio: 2026,
        factMes: 8,
        billingType: 'ADVANCE_MONTH'
    });
    assert.equal(ago.length, 0, 'junio no debe repetirse en agosto para ADVANCE');
});
