const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { z } = require('zod');
const { buildFacturacionPayload } = require('../src/directorio/directorioFacturacionConfig.js');

/** Misma forma que `facturacionConfigUpsertSchema` en registerDirectorioRoutes. */
const facturacionReglaTipoEnum = z.enum(['HORAS_BASE', 'CALENDARIO_30', 'DIAS_HABILES', 'MES_CALENDARIO']);

const facturacionConfigUpsertSchema = z
    .object({
        diaCorte: z.coerce.number().int().min(1).max(31),
        reglaTipo: facturacionReglaTipoEnum,
        reglaDetalle: z.string().max(2000).optional().nullable(),
        horasBase: z.coerce.number().positive().optional().nullable(),
        slaDiasVerde: z.coerce.number().int().min(0).max(60).default(10),
        slaDiasAmarillo: z.coerce.number().int().min(0).max(60).default(5),
        activo: z.boolean().optional()
    })
    .superRefine((data, ctx) => {
        if (data.reglaTipo === 'HORAS_BASE' && (data.horasBase == null || !Number.isFinite(Number(data.horasBase)))) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Horas base obligatorias para regla HORAS_BASE',
                path: ['horasBase']
            });
        }
        if (data.slaDiasVerde <= data.slaDiasAmarillo) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'slaDiasVerde debe ser mayor que slaDiasAmarillo',
                path: ['slaDiasVerde']
            });
        }
    });

describe('directorio facturacion config payload (form → PUT body)', () => {
    it('acepta defaults CALENDARIO_30 día 30 y SLA 10/5', () => {
        const payload = buildFacturacionPayload({
            diaCorte: '30',
            reglaTipo: 'CALENDARIO_30',
            reglaDetalle: '',
            horasBase: '',
            slaDiasVerde: '10',
            slaDiasAmarillo: '5'
        });
        const r = facturacionConfigUpsertSchema.safeParse(payload);
        assert.equal(r.success, true);
        if (r.success) {
            assert.equal(r.data.diaCorte, 30);
            assert.equal(r.data.reglaTipo, 'CALENDARIO_30');
            assert.equal(r.data.horasBase, null);
            assert.equal(r.data.slaDiasVerde, 10);
            assert.equal(r.data.slaDiasAmarillo, 5);
        }
    });

    it('acepta MES_CALENDARIO con detalle opcional', () => {
        const payload = buildFacturacionPayload({
            diaCorte: '13',
            reglaTipo: 'MES_CALENDARIO',
            reglaDetalle: '  OCCIDENTE mixto  ',
            horasBase: '',
            slaDiasVerde: '10',
            slaDiasAmarillo: '5'
        });
        const r = facturacionConfigUpsertSchema.safeParse(payload);
        assert.equal(r.success, true);
        if (r.success) {
            assert.equal(r.data.diaCorte, 13);
            assert.equal(r.data.reglaDetalle, 'OCCIDENTE mixto');
        }
    });

    it('acepta HORAS_BASE con horasBase positivas', () => {
        const payload = buildFacturacionPayload({
            diaCorte: '20',
            reglaTipo: 'HORAS_BASE',
            reglaDetalle: '',
            horasBase: '180',
            slaDiasVerde: '10',
            slaDiasAmarillo: '5'
        });
        const r = facturacionConfigUpsertSchema.safeParse(payload);
        assert.equal(r.success, true);
        if (r.success) assert.equal(r.data.horasBase, 180);
    });

    it('rechaza HORAS_BASE sin horasBase en payload', () => {
        const payload = buildFacturacionPayload({
            diaCorte: '20',
            reglaTipo: 'HORAS_BASE',
            reglaDetalle: '',
            horasBase: '',
            slaDiasVerde: '10',
            slaDiasAmarillo: '5'
        });
        const r = facturacionConfigUpsertSchema.safeParse(payload);
        assert.equal(r.success, false);
    });

    it('rechaza día de corte fuera de rango', () => {
        const payload = buildFacturacionPayload({
            diaCorte: '32',
            reglaTipo: 'CALENDARIO_30',
            reglaDetalle: '',
            horasBase: '',
            slaDiasVerde: '10',
            slaDiasAmarillo: '5'
        });
        const r = facturacionConfigUpsertSchema.safeParse(payload);
        assert.equal(r.success, false);
    });

    it('rechaza slaDiasVerde menor o igual que slaDiasAmarillo', () => {
        const payload = buildFacturacionPayload({
            diaCorte: '20',
            reglaTipo: 'CALENDARIO_30',
            reglaDetalle: '',
            horasBase: '',
            slaDiasVerde: '5',
            slaDiasAmarillo: '5'
        });
        const r = facturacionConfigUpsertSchema.safeParse(payload);
        assert.equal(r.success, false);
    });
});
