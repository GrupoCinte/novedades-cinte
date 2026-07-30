'use strict';

const { isBedrockConfigured } = require('./bedrockClient');
const { scoreCandidatoFromBedrock } = require('./scoreCandidato');

function getScoreMin() {
    const n = parseInt(process.env.SOURCING_SCORE_MIN || '70', 10);
    return Math.min(Math.max(Number.isFinite(n) ? n : 70, 0), 100);
}

/**
 * Evalúa un candidato entrante y decide si persistir según umbral.
 * @returns {{ persist: boolean, score?: number, resumen?: string, reason?: string }}
 */
async function evaluateCandidatoForPersist({ vacante, candidatoPayload, store, scoreFn }) {
    if (!isBedrockConfigured()) {
        return { persist: true, reason: 'bedrock_off' };
    }
    const evaluate = scoreFn || scoreCandidatoFromBedrock;
    const pseudoCandidato = {
        nombre: candidatoPayload.nombre,
        perfil: candidatoPayload.perfil || {},
        fuente: candidatoPayload.fuente
    };
    try {
        const result = await evaluate(vacante, pseudoCandidato, { store });
        const min = getScoreMin();
        if (result.score < min) {
            return {
                persist: false,
                score: result.score,
                resumen: result.resumen_score,
                reason: `score_below_min_${min}`
            };
        }
        return {
            persist: true,
            score: result.score,
            resumen: result.resumen_score
        };
    } catch (error) {
        console.error('[Sourcing] inline score:', error.message || error);
        return { persist: true, reason: 'score_error' };
    }
}

module.exports = {
    getScoreMin,
    evaluateCandidatoForPersist
};
