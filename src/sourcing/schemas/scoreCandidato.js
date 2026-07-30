const { z } = require('zod');

const scoredCandidatoSchema = z.object({
    score: z.number().int().min(0).max(100),
    resumen_score: z.string().trim().min(8).max(400),
    confianza: z.number().min(0).max(1).optional().default(0.8)
});

module.exports = {
    scoredCandidatoSchema
};
