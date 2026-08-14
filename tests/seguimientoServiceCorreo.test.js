const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { createSeguimientoService } = require('../src/seguimiento/seguimientoService');

describe('seguimientoService correo cierre', () => {
    it('publishCierre marca enviado solo si accepted y setea ciclo', async () => {
        const updates = [];
        const pool = {
            async query(sql, params) {
                if (/FROM seguimiento_acta/.test(sql) && /WHERE a\.id/.test(sql)) {
                    return {
                        rows: [
                            {
                                id: '11111111-1111-1111-1111-111111111111',
                                tipo: 'consultor',
                                estado: 'FINALIZADO',
                                cliente: 'Acme',
                                fecha_acta: '2026-08-01',
                                payload_json: {
                                    modalidad: 'v',
                                    agenda: 't',
                                    objetivo: 'f',
                                    planes_accion: [{ descripcion: 'c' }]
                                },
                                correo_cierre_estado: 'pendiente',
                                gp_id: '22222222-2222-2222-2222-222222222222',
                                participantes: [
                                    { rol: 'Desarrollador', email: 'c1@cinte.com', nombre: 'C1', cedula: '1' }
                                ]
                            }
                        ]
                    };
                }
                if (/UPDATE seguimiento_acta/.test(sql) && /correo_cierre_estado = 'enviado'/.test(sql)) {
                    updates.push({ sql, params });
                    return { rowCount: 1 };
                }
                if (/INSERT INTO seguimiento_historial/.test(sql)) {
                    return { rowCount: 1 };
                }
                throw new Error(sql.slice(0, 100));
            },
            connect: async () => ({
                query: (...a) => pool.query(...a),
                release() {}
            })
        };

        const publisher = {
            async publishSeguimientoCierre() {
                return { accepted: true, statusCode: 202 };
            }
        };

        const service = createSeguimientoService({ pool, emailNotificationsPublisher: publisher });
        const result = await service.reintentarCorreo('11111111-1111-1111-1111-111111111111', {
            id: '22222222-2222-2222-2222-222222222222',
            role: 'gp',
            email: 'gp@cinte.com'
        });
        assert.equal(result.correoCierreEstado, 'enviado');
        assert.ok(result.cicloVenceAt);
        assert.equal(updates.length >= 1, true);
    });

    it('skipped disabled deja pendiente sin ciclo', async () => {
        const pool = {
            async query(sql) {
                if (/FROM seguimiento_acta/.test(sql) && /WHERE a\.id/.test(sql)) {
                    return {
                        rows: [
                            {
                                id: '11111111-1111-1111-1111-111111111111',
                                tipo: 'cliente',
                                estado: 'FINALIZADO',
                                cliente: 'Acme',
                                fecha_acta: '2026-08-01',
                                payload_json: {},
                                correo_cierre_estado: 'fallido',
                                gp_id: '22222222-2222-2222-2222-222222222222',
                                participantes: [{ rol: 'Líder', email: 'l@cinte.com', nombre: 'L' }]
                            }
                        ]
                    };
                }
                if (/UPDATE seguimiento_acta/.test(sql)) {
                    return { rowCount: 1 };
                }
                if (/INSERT INTO seguimiento_historial/.test(sql)) {
                    return { rowCount: 1 };
                }
                throw new Error(sql.slice(0, 80));
            },
            connect: async () => ({
                query: (...a) => pool.query(...a),
                release() {}
            })
        };
        const publisher = {
            async publishSeguimientoCierre() {
                return { accepted: false, skipped: true, reason: 'disabled' };
            }
        };
        const service = createSeguimientoService({ pool, emailNotificationsPublisher: publisher });
        const result = await service.reintentarCorreo('11111111-1111-1111-1111-111111111111', {
            role: 'cac',
            email: 'cac@cinte.com'
        });
        assert.equal(result.correoCierreEstado, 'pendiente');
        assert.equal(result.cicloVenceAt, null);
    });
});
