const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { z } = require('zod');

/** Misma forma que `clienteLiderCreateSchema` en registerDirectorioRoutes (validación de payload). */
const clienteLiderCreateSchema = z
    .object({
        cliente: z.string().min(1).max(500),
        lider: z.string().min(1).max(500),
        nit: z.string().min(1).max(40),
        gp_user_id: z.string().uuid().optional().nullable(),
        gp_colaborador_cedula: z.string().min(5).max(20).optional().nullable()
    })
    .superRefine((data, ctx) => {
        if (data.gp_user_id && data.gp_colaborador_cedula) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Usa gp_user_id o gp_colaborador_cedula, no ambos.' });
        }
        const nd = String(data.nit || '').replace(/\D/g, '');
        if (!nd) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'NIT obligatorio (al menos un dígito)',
                path: ['nit']
            });
        }
    });

describe('directorio clientes-lideres create schema (gp_user_id + nit)', () => {
    it('acepta UUID válido y NIT', () => {
        const r = clienteLiderCreateSchema.safeParse({
            cliente: 'ACME',
            lider: 'Ana López',
            nit: '900123456',
            gp_user_id: '550e8400-e29b-41d4-a716-446655440000'
        });
        assert.equal(r.success, true);
        if (r.success) assert.equal(r.data.gp_user_id, '550e8400-e29b-41d4-a716-446655440000');
    });

    it('acepta gp_user_id ausente o null con NIT', () => {
        assert.equal(
            clienteLiderCreateSchema.safeParse({ cliente: 'ACME', lider: 'Ana', nit: '800' }).success,
            true
        );
        const r = clienteLiderCreateSchema.safeParse({
            cliente: 'ACME',
            lider: 'Ana',
            nit: '123',
            gp_user_id: null
        });
        assert.equal(r.success, true);
    });

    it('rechaza sin NIT dígitos', () => {
        const r = clienteLiderCreateSchema.safeParse({
            cliente: 'ACME',
            lider: 'Ana',
            nit: 'abc',
            gp_user_id: null
        });
        assert.equal(r.success, false);
    });

    it('rechaza gp_user_id no UUID', () => {
        const r = clienteLiderCreateSchema.safeParse({
            cliente: 'ACME',
            lider: 'Ana',
            nit: '1',
            gp_user_id: 'no-es-uuid'
        });
        assert.equal(r.success, false);
    });
});
