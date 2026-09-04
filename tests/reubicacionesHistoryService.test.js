const test = require('node:test');
const assert = require('node:assert/strict');
const { 
    registrarEventoHistorial, 
    sanitizarDatosHistorial, 
    generarHashPayload, 
    IdempotencyConflictError 
} = require('../src/reubicaciones/reubicacionesHistoryService');

test('HU-06 Historial Integral', async (t) => {
    
    await t.test('Sanitización elimina datos sensibles', () => {
        const dirtyData = {
            estado: 'Vencido',
            consultor: {
                nombre: 'Juan',
                password: 'supersecret',
                token: 'jwt.token.123'
            },
            history: [{ pwd: '123', safe: 'yes' }]
        };
        const clean = sanitizarDatosHistorial(dirtyData);
        assert.equal(clean.estado, 'Vencido');
        assert.equal(clean.consultor.nombre, 'Juan');
        assert.equal(clean.consultor.password, '[REDACTED]');
        assert.equal(clean.consultor.token, '[REDACTED]');
        assert.equal(clean.history[0].pwd, '[REDACTED]');
        assert.equal(clean.history[0].safe, 'yes');
    });

    await t.test('Generación de hash produce un valor estable', () => {
        const payload1 = { a: 1, b: 2 };
        const payload2 = { b: 2, a: 1 };
        assert.equal(generarHashPayload(payload1), generarHashPayload(payload2));
    });

    await t.test('Idempotencia A: Mismo evento + Mismos datos -> ignora', async () => {
        let rolledBack = false;
        let releaseCalled = false;
        const mockClient = {
            query: async (sql, params) => {
                if (sql.startsWith('SAVEPOINT')) return;
                if (sql.startsWith('RELEASE SAVEPOINT')) { releaseCalled = true; return; }
                if (sql.startsWith('INSERT')) {
                    const e = new Error('duplicate key value violates unique constraint');
                    e.code = '23505';
                    throw e;
                }
                if (sql.includes('ROLLBACK TO SAVEPOINT')) { rolledBack = true; return; }
                if (sql.includes('SELECT')) {
                    return {
                        rows: [{
                            tipo: 'test_tipo',
                            before_data: null,
                            after_data: { val: 1 }
                        }]
                    };
                }
                return { rows: [] };
            }
        };

        const result = await registrarEventoHistorial(mockClient, {
            caso_id: '11111111-1111-4111-8111-111111111111',
            tipo: 'test_tipo',
            before_data: null,
            after_data: { val: 1 },
            source_event_id: 'evt_1'
        });

        assert.equal(result.idempotent, true);
        assert.equal(result.action, 'ignored');
        assert.equal(rolledBack, true);
    });

    await t.test('Idempotencia B: Mismo evento + Diferentes datos -> conflicto', async () => {
        const mockClient = {
            query: async (sql, params) => {
                if (sql.startsWith('SAVEPOINT')) return;
                if (sql.startsWith('INSERT')) {
                    const e = new Error('duplicate key value violates unique constraint');
                    e.code = '23505';
                    throw e;
                }
                if (sql.includes('ROLLBACK TO SAVEPOINT')) return;
                if (sql.includes('SELECT')) {
                    return {
                        rows: [{
                            tipo: 'test_tipo',
                            before_data: null,
                            after_data: { val: 1 } // El existente tiene val: 1
                        }]
                    };
                }
                return { rows: [] };
            }
        };

        try {
            await registrarEventoHistorial(mockClient, {
                caso_id: '11111111-1111-4111-8111-111111111111',
                tipo: 'test_tipo',
                before_data: null,
                after_data: { val: 2 }, // Intento con val: 2
                source_event_id: 'evt_1'
            });
            assert.fail('Debió lanzar IdempotencyConflictError');
        } catch (e) {
            assert.equal(e instanceof IdempotencyConflictError, true);
            assert.match(e.message, /Conflicto de Idempotencia/);
        }
    });

});
