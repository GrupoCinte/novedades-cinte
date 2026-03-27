const { z } = require('zod');

const eliminarCandidatoSchema = z.object({
    executionId: z.string().min(1, 'Identificador requerido'),
    obs_eliminado: z.string().trim().min(1, 'La observación es obligatoria').max(4000)
});

module.exports = { eliminarCandidatoSchema };
