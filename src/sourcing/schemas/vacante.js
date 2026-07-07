const { z } = require('zod');

const fuentesBusquedaSchema = z.object({
    elempleo: z.boolean().optional().default(false),
    linkedin: z.boolean().optional().default(false),
    xray: z.boolean().optional().default(true)
});

const infoFaltanteSchema = z.object({
    campo: z.string().trim().max(80),
    impacto: z.enum(['alto', 'medio', 'bajo']).optional().default('medio'),
    mensaje: z.string().trim().max(500)
});

const idiomaSchema = z.object({
    idioma: z.string().trim().min(1).max(40),
    nivel: z.string().trim().max(20).optional().nullable()
});

const criteriosVacanteSchema = z.object({
    cargo: z.string().trim().max(200).optional().nullable(),
    cargos_equivalentes: z.array(z.string().trim().min(1).max(120)).max(4).optional().default([]),
    ciudad: z.string().trim().max(120).optional().nullable(),
    ubicacion_tipo: z.enum(['ciudad', 'departamento', 'todo']).optional().default('todo'),
    skills: z.array(z.string().trim().min(1).max(80)).max(30).optional().default([]),
    skills_requeridas: z.array(z.string().trim().min(1).max(80)).max(30).optional().default([]),
    skills_deseables: z.array(z.string().trim().min(1).max(80)).max(15).optional().default([]),
    palabras_clave_hv: z.array(z.string().trim().min(1).max(40)).max(3).optional().default([]),
    experiencia_min: z.number().int().min(0).max(50).optional().default(0),
    experiencia_max: z.number().int().min(0).max(50).optional().nullable(),
    formacion: z.string().trim().max(200).optional().nullable(),
    nivel_estudios_min: z.string().trim().max(80).optional().nullable(),
    profesion: z.string().trim().max(120).optional().nullable(),
    area_trabajo: z.string().trim().max(120).optional().nullable(),
    sector: z.string().trim().max(120).optional().nullable(),
    idiomas: z.array(idiomaSchema).max(3).optional().default([]),
    salario_rangos_cop: z.array(z.string().trim().max(40)).max(10).optional().default([]),
    modalidad: z.string().trim().max(40).optional().nullable(),
    hv_actualizada: z.string().trim().max(40).optional().nullable(),
    search_in_scope: z.enum(['toda_hv', 'ultima_experiencia', 'estudios']).optional().default('toda_hv'),
    keywords_busqueda: z.array(z.string().trim().min(1).max(80)).max(15).optional().default([]),
    filtros_ee: z.record(z.unknown()).optional(),
    info_faltante: z.array(infoFaltanteSchema).max(20).optional().default([]),
    confianza: z.record(z.number().min(0).max(1)).optional(),
    filtros_confirmados: z.boolean().optional().default(false),
    filtros_confirmados_at: z.string().optional().nullable(),
    parse_error: z.string().max(500).optional(),
    _parse: z
        .object({
            at: z.string().optional(),
            model: z.string().optional()
        })
        .optional(),
    _meta: z.record(z.unknown()).optional()
});

/** Salida estructurada esperada del prompt Bedrock (parse de vacante). */
const parsedVacanteSchema = z.object({
    titulo: z.string().trim().max(200).optional().nullable(),
    cargo: z.string().trim().max(200).optional().nullable(),
    cargos_equivalentes: z.array(z.string().trim().min(1).max(120)).max(4).optional().default([]),
    ciudad: z.string().trim().max(120).optional().nullable(),
    ubicacion_tipo: z.enum(['ciudad', 'departamento', 'todo']).optional().default('todo'),
    skills_requeridas: z.array(z.string().trim().min(1).max(80)).max(30).optional().default([]),
    skills_deseables: z.array(z.string().trim().min(1).max(80)).max(15).optional().default([]),
    palabras_clave_hv: z.array(z.string().trim().min(1).max(40)).max(3).optional().default([]),
    experiencia_min: z.number().int().min(0).max(50).optional().default(0),
    experiencia_max: z.number().int().min(0).max(50).optional().nullable(),
    formacion: z.string().trim().max(200).optional().nullable(),
    nivel_estudios_min: z.string().trim().max(80).optional().nullable(),
    profesion: z.string().trim().max(120).optional().nullable(),
    area_trabajo: z.string().trim().max(120).optional().nullable(),
    sector: z.string().trim().max(120).optional().nullable(),
    idiomas: z.array(idiomaSchema).max(3).optional().default([]),
    salario_rangos_cop: z.array(z.string().trim().max(40)).max(10).optional().default([]),
    modalidad: z.string().trim().max(40).optional().nullable(),
    hv_actualizada: z.string().trim().max(40).optional().nullable(),
    search_in_scope: z.enum(['toda_hv', 'ultima_experiencia', 'estudios']).optional().default('toda_hv'),
    keywords_busqueda: z.array(z.string().trim().min(1).max(80)).max(15).optional().default([]),
    info_faltante: z.array(infoFaltanteSchema).max(20).optional().default([]),
    confianza: z.record(z.number().min(0).max(1)).optional()
});

const createVacanteSchema = z.object({
    titulo: z.string().trim().max(200).optional(),
    descripcion: z.string().trim().min(20, 'La descripción debe tener al menos 20 caracteres').max(20000),
    criterios: criteriosVacanteSchema.partial().optional().default({})
});

const updateVacanteCriteriosSchema = z.object({
    criterios: criteriosVacanteSchema.partial(),
    confirmar: z.boolean().optional().default(false)
});

const createJobSchema = z.object({
    vacante_id: z.string().uuid(),
    fuentes: fuentesBusquedaSchema.optional().default({})
});

module.exports = {
    createVacanteSchema,
    createJobSchema,
    updateVacanteCriteriosSchema,
    fuentesBusquedaSchema,
    criteriosVacanteSchema,
    parsedVacanteSchema,
    infoFaltanteSchema
};
