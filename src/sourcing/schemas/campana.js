const { z } = require('zod');

// Set de plantillas por fase (todas opcionales; se guardan como JSONB).
const plantillasSchema = z.record(z.string().trim().max(4000)).optional();

const createCampanaSchema = z.object({
    nombre: z.string().trim().min(2, 'El nombre de la campaña es obligatorio').max(160),
    mensaje_plantilla: z.string().trim().max(4000).optional().nullable(),
    canal_default: z.enum(['auto', 'whatsapp', 'inmail']).optional().default('auto'),
    plantillas: plantillasSchema,
    vacante_id: z.string().uuid().optional().nullable(),
    candidato_ids: z.array(z.string().uuid()).min(1, 'Seleccione al menos un candidato').max(500)
});

const updateCampanaSchema = z.object({
    nombre: z.string().trim().min(2).max(160).optional(),
    mensaje_plantilla: z.string().trim().max(4000).optional().nullable(),
    plantillas: plantillasSchema
}).refine((v) => v.nombre !== undefined || v.mensaje_plantilla !== undefined || v.plantillas !== undefined, {
    message: 'Nada que actualizar'
});

const manualDestinatarioSchema = z.object({
    nombre: z.string().trim().min(1, 'El nombre es obligatorio').max(200),
    telefono: z.string().trim().max(40).optional().nullable(),
    correo: z.string().trim().email('Correo inválido').max(200).optional().nullable()
}).refine((v) => (v.telefono && v.telefono.trim()) || (v.correo && v.correo.trim()), {
    message: 'Debe indicar al menos teléfono o correo'
});

const addDestinatariosSchema = z.object({
    candidato_ids: z.array(z.string().uuid()).max(500).optional().default([]),
    manuales: z.array(manualDestinatarioSchema).max(200).optional().default([])
}).refine((v) => (v.candidato_ids && v.candidato_ids.length) || (v.manuales && v.manuales.length), {
    message: 'Agregue al menos un candidato aprobado o un contacto manual'
});

const updateDestinatarioSchema = z.object({
    estado: z.enum(['pendiente', 'enviado', 'fallido']),
    error_mensaje: z.string().trim().max(500).optional().nullable()
});

const updateDecisionSchema = z.object({
    decision: z.enum(['pendiente', 'aprobado', 'rechazado'])
});

// Ingest desde n8n: avance de la preentrevista del agente.
const contactoIntakeSchema = z.object({
    // Identificación de la preentrevista (uno de estos debe venir).
    preentrevista_id: z.string().uuid().optional(),
    destinatario_id: z.string().uuid().optional(),
    telefono: z.string().trim().max(40).optional(),

    fase: z.enum(['apertura', 'interes', 'oferta', 'ajuste', 'formulario', 'hv', 'agenda', 'cierre']).optional(),
    estado: z.enum(['en_curso', 'interesado', 'no_disponible', 'completada', 'descartada', 'error']).optional(),
    interes: z.string().trim().max(60).optional().nullable(),
    datos: z.record(z.unknown()).optional(),
    cv_url: z.string().trim().max(1000).optional().nullable(),
    entrevista: z.record(z.unknown()).optional().nullable(),

    // Resultado del match del agente contra los requisitos de la vacante.
    score: z.coerce.number().int().min(0).max(100).optional().nullable(),
    resumen_match: z.string().trim().max(2000).optional().nullable(),

    // Mensaje del turno (para transcripción).
    mensaje: z.object({
        rol: z.enum(['agente', 'candidato', 'sistema']),
        texto: z.string().trim().max(8000)
    }).optional(),

    // Varios mensajes del turno (p. ej. candidato + agente), en orden.
    mensajes: z.array(z.object({
        rol: z.enum(['agente', 'candidato', 'sistema']),
        texto: z.string().trim().max(8000)
    })).max(10).optional(),

    // Estado del destinatario de la campaña (opcional).
    destinatario_estado: z.enum(['pendiente', 'enviado', 'fallido']).optional()
}).refine((v) => v.preentrevista_id || v.destinatario_id || v.telefono, {
    message: 'Debe indicar preentrevista_id, destinatario_id o telefono'
});

module.exports = {
    createCampanaSchema,
    updateCampanaSchema,
    addDestinatariosSchema,
    updateDestinatarioSchema,
    updateDecisionSchema,
    contactoIntakeSchema
};
