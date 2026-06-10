'use strict';

const colaboradorDemo = {
    nombre: 'Colaborador Uno',
    cedula: '1234567890',
    cliente: 'Cliente Demo',
    lider_catalogo: 'Lider Demo',
    correo_cinte: 'col@test.com',
    gp_user_id: null
};

/**
 * Cliente de transacción para aprobar/re-aprobar malla (INSERT novedades, FOR UPDATE, etc.).
 * @param {{ observaciones?: string[], refs?: string[], existingNovedad?: boolean }} [opts]
 */
function createMallaAprobacionTxClient(opts = {}) {
    const captured = { observaciones: [] };
    if (Array.isArray(opts.refs)) captured.refs = opts.refs;
    let insertCount = 0;
    const client = {
        query: async (sql, params) => {
            if (/BEGIN/i.test(sql)) return { rows: [] };
            if (/INSERT INTO malla_turno_aprobacion/i.test(sql)) return { rows: [] };
            if (/FROM malla_turno_aprobacion[\s\S]*FOR UPDATE/i.test(sql)) {
                return {
                    rows: [{ id: 'a1111111-1111-4111-8111-111111111111', aprobado_en: new Date('2026-06-01T10:00:00Z') }]
                };
            }
            if (/SELECT id FROM novedades/i.test(sql)) {
                return opts.existingNovedad ? { rows: [{ id: 'existing-nv' }] } : { rows: [] };
            }
            if (/INSERT INTO novedades/i.test(sql)) {
                insertCount += 1;
                if (params) {
                    captured.observaciones.push(params[20]);
                    if (Array.isArray(captured.refs)) captured.refs.push(params[21]);
                }
                return { rows: [{ id: 'nv-1' }] };
            }
            if (/UPDATE malla_turno_aprobacion/i.test(sql)) {
                return { rows: [{ aprobado_en: new Date('2026-06-09T15:00:00Z') }] };
            }
            if (/COMMIT/i.test(sql)) return { rows: [] };
            if (/ROLLBACK/i.test(sql)) return { rows: [] };
            return { rows: [] };
        },
        release: () => {}
    };
    return { client, captured, getInsertCount: () => insertCount };
}

function buildPoolReaprobacionRouteMock() {
    const { client: txClient, captured } = createMallaAprobacionTxClient();
    const pool = {
        query: async (sql) => {
            if (/INSERT INTO audit_log/i.test(sql)) return { rows: [] };
            if (/SELECT id::text AS id FROM users/i.test(sql)) return { rows: [] };
            return { rows: [] };
        },
        connect: async () => txClient
    };
    return { pool, captured };
}

module.exports = {
    colaboradorDemo,
    createMallaAprobacionTxClient,
    buildPoolReaprobacionRouteMock
};
