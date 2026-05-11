const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { z } = require('zod');

/** Misma forma que `clienteLiderCreateSchema` en registerDirectorioRoutes (validación de payload). */
const clienteLiderCreateSchema = z.object({
    cliente: z.string().min(1).max(500),
    lider: z.string().min(1).max(500),
    gp_user_id: z.string().uuid().optional().nullable()
});

describe('directorio clientes-lideres create schema (gp_user_id)', () => {
    it('acepta UUID válido', () => {
        const r = clienteLiderCreateSchema.safeParse({
            cliente: 'ACME',
            lider: 'Ana López',
            gp_user_id: '550e8400-e29b-41d4-a716-446655440000'
        });
        assert.equal(r.success, true);
        if (r.success) assert.equal(r.data.gp_user_id, '550e8400-e29b-41d4-a716-446655440000');
    });

    it('acepta gp_user_id ausente o null', () => {
        assert.equal(clienteLiderCreateSchema.safeParse({ cliente: 'ACME', lider: 'Ana' }).success, true);
        const r = clienteLiderCreateSchema.safeParse({ cliente: 'ACME', lider: 'Ana', gp_user_id: null });
        assert.equal(r.success, true);
    });

    it('rechaza gp_user_id no UUID', () => {
        const r = clienteLiderCreateSchema.safeParse({
            cliente: 'ACME',
            lider: 'Ana',
            gp_user_id: 'no-es-uuid'
        });
        assert.equal(r.success, false);
    });
});
