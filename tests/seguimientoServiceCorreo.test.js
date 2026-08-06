const assert = require('node:assert/strict');
const { describe, it, mock } = require('node:test');
const { createSeguimientoService } = require('../src/seguimiento/seguimientoService');

function mockPool(handlers) {
    return {
        async query(sql, params) {
            const fn = handlers.find((h) => h.match(sql));
            if (!fn) throw new Error(`Unexpected SQL: ${sql.slice(0, 120)}`);
            return fn.run(sql, params);
        },
        async connect() {
            return {
                query: (...args) => this.query(...args),
                release() {}
            };
        }
    };
}

describe('seguimientoService correo cierre', () => {
    it('publishCierre marca enviado solo si accepted y setea ciclo', async () => {
        const updates = [];
        const pool = {
            async query(sql, params) {
                if (/FROM seguimiento_acta/.test(sql) && /WHERE id/.test(sql)) {
                    return {
                        rows: [
                            {
                                id: '11111111-1111-1111-1111-111111111111',
                                tipo: 'consultor',
                                estado: 'finalizado',
                                cliente_nombre: 'Acme',
                                fecha_seguimiento: '2026-08-01',
                                payload_json: { modalidad: 'v', temasTratados: 't', feedback: 'f', compromisos: [{ descripcion: 'c' }] },
                                correo_cierre_estado: 'pendiente',
                                gp_user_id: '22222222-2222-2222-2222-222222222222'
                            }
                        ]
                    };
                }
                if (/FROM seguimiento_participante/.test(sql)) {
                    return {
                        rows: [{ rol: 'consultor', email: 'c1@cinte.com', nombre: 'C1', cedula: '1' }]
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
            userId: '22222222-2222-2222-2222-222222222222',
            role: 'gp',
            email: 'gp@cinte.com'
        });
        assert.equal(result.correo.correoCierreEstado, 'enviado');
        assert.ok(result.correo.cicloVenceAt);
        assert.equal(updates.length >= 1, true);
    });

    it('skipped disabled deja pendiente sin ciclo', async () => {
        const pool = {
            async query(sql) {
                if (/FROM seguimiento_acta/.test(sql) && /WHERE id/.test(sql)) {
                    return {
                        rows: [
                            {
                                id: '11111111-1111-1111-1111-111111111111',
                                tipo: 'cliente',
                                estado: 'finalizado',
                                cliente_nombre: 'Acme',
                                fecha_seguimiento: '2026-08-01',
                                payload_json: {},
                                correo_cierre_estado: 'fallido',
                                gp_user_id: '22222222-2222-2222-2222-222222222222'
                            }
                        ]
                    };
                }
                if (/FROM seguimiento_participante/.test(sql)) {
                    return { rows: [{ rol: 'lider', email: 'l@cinte.com', nombre: 'L' }] };
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
        assert.equal(result.correo.correoCierreEstado, 'pendiente');
        assert.equal(result.correo.cicloVenceAt, null);
    });
});
