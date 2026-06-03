const { z } = require('zod');

const ESTADOS_CONCILIACION = ['PENDIENTE', 'ENVIADA', 'DEVUELTA', 'CONCILIADA', 'RADICADA'];

const upsertFacturacionSchema = z.object({
    cedula: z.string({ required_error: 'La cédula es requerida' }).min(1, 'La cédula no puede estar vacía'),
    anio: z.coerce.number({ required_error: 'El año es requerido' }).int().min(2000, 'El año debe ser mayor o igual a 2000').max(2100, 'El año debe ser menor o igual a 2100'),
    mes: z.coerce.number({ required_error: 'El mes es requerido' }).int().min(1, 'El mes debe estar entre 1 y 12').max(12, 'El mes debe estar entre 1 y 12'),
    proyecto: z.string().nullable().optional(),
    observaciones: z.string().nullable().optional(),
    horasFacturadas: z.coerce.number().optional().default(0),
    estado: z.enum(ESTADOS_CONCILIACION).optional().default('PENDIENTE'),
    facturaFv: z.string().nullable().optional(),
    fechaRadicacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').nullable().optional(),
    motivoDevolucion: z.string().nullable().optional()
});

const upsertFacturacionMasivaSchema = z.object({
    cliente: z.string({ required_error: 'El cliente es requerido' }).min(1, 'El cliente no puede estar vacío'),
    anio: z.coerce.number({ required_error: 'El año es requerido' }).int().min(2000, 'El año debe ser mayor o igual a 2000').max(2100, 'El año debe ser menor o igual a 2100'),
    mes: z.coerce.number({ required_error: 'El mes es requerido' }).int().min(1, 'El mes debe estar entre 1 y 12').max(12, 'El mes debe estar entre 1 y 12'),
    estado: z.enum(ESTADOS_CONCILIACION).optional().default('PENDIENTE'),
    facturaFv: z.string().nullable().optional(),
    fechaRadicacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)').nullable().optional(),
    motivoDevolucion: z.string().nullable().optional(),
    observaciones: z.string().nullable().optional(),
    cedulas: z.array(z.string().min(1, 'Cédula vacía')).optional()
});

module.exports = { upsertFacturacionSchema, upsertFacturacionMasivaSchema };
