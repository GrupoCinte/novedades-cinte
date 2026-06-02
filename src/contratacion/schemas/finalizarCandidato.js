const { z } = require('zod');

const finalizarCandidatoSchema = z.object({
    executionId: z.string().min(1, 'Identificador requerido'),
    obs_finalizado_manual: z.string().trim().min(1, 'La observación es obligatoria').max(4000)
});

module.exports = { finalizarCandidatoSchema };
