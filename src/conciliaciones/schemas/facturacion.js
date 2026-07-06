const { z } = require('zod');

const ESTADOS_CONCILIACION = ['PENDIENTE', 'APROBADO_ANALISTA', 'APROBADO_FINANZAS', 'DEVUELTA', 'CONCILIADA'];

const upsertFacturacionSchema = z.object({
    cedula: z.string({ required_error: 'La cédula es requerida' }).min(1, 'La cédula no puede estar vacía'),
    anio: z.coerce.number({ required_error: 'El año es requerido' }).int().min(2000, 'El año debe ser mayor o igual a 2000').max(2100, 'El año debe ser menor o igual a 2100'),
    mes: z.coerce.number({ required_error: 'El mes es requerido' }).int().min(1, 'El mes debe estar entre 1 y 12').max(12, 'El mes debe estar entre 1 y 12'),
    proyecto: z.string().nullable().optional(),
    observaciones: z.string().max(1000, 'Las observaciones no pueden exceder los 1000 caracteres').nullable().optional(),
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
    observaciones: z.string().max(1000, 'Las observaciones no pueden exceder los 1000 caracteres').nullable().optional(),
    cedulas: z.array(z.string().min(1, 'Cédula vacía')).optional()
});

const deleteFacturacionSchema = z.object({
    cedula: z.string({ required_error: 'La cédula es requerida' }).min(1, 'La cédula no puede estar vacía'),
    anio: z.coerce.number({ required_error: 'El año es requerido' }).int().min(2000, 'El año debe ser mayor o igual a 2000').max(2100, 'El año debe ser menor o igual a 2100'),
    mes: z.coerce.number({ required_error: 'El mes es requerido' }).int().min(1, 'El mes debe estar entre 1 y 12').max(12, 'El mes debe estar entre 1 y 12'),
    observacion: z.string({ required_error: 'La observación es obligatoria' }).min(1, 'La observación es obligatoria').max(1000)
});

const facturacionRevisionSchema = z.object({
    cedula: z.string({ required_error: 'La cédula es requerida' }).min(1, 'La cédula no puede estar vacía'),
    anio: z.coerce.number({ required_error: 'El año es requerido' }).int().min(2000).max(2100),
    mes: z.coerce.number({ required_error: 'El mes es requerido' }).int().min(1).max(12),
    accion: z.enum(['aprobar', 'rechazar'], { required_error: 'La acción es requerida' }),
    observacion: z.string({ required_error: 'La observación es obligatoria' }).min(1, 'La observación es obligatoria').max(1000)
});

const facturacionRevisionMasivaSchema = z.object({
    cliente: z.string({ required_error: 'El cliente es requerido' }).min(1, 'El cliente no puede estar vacío'),
    anio: z.coerce.number({ required_error: 'El año es requerido' }).int().min(2000).max(2100),
    mes: z.coerce.number({ required_error: 'El mes es requerido' }).int().min(1).max(12),
    accion: z.enum(['aprobar', 'rechazar'], { required_error: 'La acción es requerida' }),
    observacion: z.string({ required_error: 'La observación es obligatoria' }).min(1, 'La observación es obligatoria').max(1000),
    etapaObjetivo: z.enum(['ANALISTA', 'NOMINA'], { required_error: 'La etapa objetivo es requerida' }),
    cedulas: z.array(z.string().min(1, 'Cédula vacía')).min(1, 'Debe indicar al menos una cédula'),
    servicioId: z.string().trim().optional()
});

const facturacionHistorialQuerySchema = z.object({
    cedula: z.string({ required_error: 'La cédula es requerida' }).min(1),
    anio: z.coerce.number().int().min(2000).max(2100),
    mes: z.coerce.number().int().min(1).max(12)
});

const montoNovedadAjusteSchema = z.object({
    novedadId: z.string({ required_error: 'novedadId requerido' }).uuid('novedadId debe ser UUID'),
    montoCop: z.coerce.number().int().min(0).nullable()
});

const conciliacionNovedadManualSchema = z.object({
    cliente: z.string({ required_error: 'El cliente es requerido' }).min(1),
    cedula: z.string({ required_error: 'La cédula es requerida' }).min(1),
    anio: z.coerce.number({ required_error: 'El año es requerido' }).int().min(2000).max(2100),
    mes: z.coerce.number({ required_error: 'El mes es requerido' }).int().min(1).max(12),
    servicioId: z.string().trim().optional(),
    tipoNovedad: z.literal('Vacaciones en tiempo'),
    fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
    fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
    billingType: z.string().trim().optional(),
    billingMode: z.string().trim().optional(),
    baseHours: z.coerce.number().positive().optional()
});

const facturacionAjustesSchema = z.object({
    cedula: z.string({ required_error: 'La cédula es requerida' }).min(1),
    anio: z.coerce.number({ required_error: 'El año es requerido' }).int().min(2000).max(2100),
    mes: z.coerce.number({ required_error: 'El mes es requerido' }).int().min(1).max(12),
    observacion: z.string({ required_error: 'La observación es obligatoria' }).min(1).max(1000),
    tarifaOverride: z.coerce.number().int().min(0).nullable().optional(),
    montosNovedad: z.array(montoNovedadAjusteSchema).optional(),
    billingType: z.string().trim().optional(),
    billingMode: z.string().trim().optional(),
    baseHours: z.coerce.number().positive().optional()
});

module.exports = {
    upsertFacturacionSchema,
    upsertFacturacionMasivaSchema,
    deleteFacturacionSchema,
    facturacionRevisionSchema,
    facturacionRevisionMasivaSchema,
    facturacionHistorialQuerySchema,
    facturacionAjustesSchema,
    conciliacionNovedadManualSchema
};
