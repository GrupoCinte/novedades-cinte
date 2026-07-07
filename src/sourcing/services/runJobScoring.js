'use strict';

const { isBedrockConfigured } = require('./bedrockClient');
const { scoreCandidatoFromBedrock } = require('./scoreCandidato');

function getScoreConcurrency() {
    const n = parseInt(process.env.SOURCING_SCORE_CONCURRENCY || '5', 10);
    return Math.min(Math.max(Number.isFinite(n) ? n : 5, 1), 10);
}

async function runWithConcurrency(items, limit, fn) {
    const results = [];
    let idx = 0;

    async function worker() {
        while (idx < items.length) {
            const i = idx;
            idx += 1;
            results[i] = await fn(items[i], i);
        }
    }

    const workers = Array.from({ length: Math.min(limit, items.length || 1) }, () => worker());
    await Promise.all(workers);
    return results;
}

/**
 * @param {{ jobId: string, store: object, scoreFn?: Function }} opts
 */
async function runJobScoring({ jobId, store, scoreFn }) {
    if (!isBedrockConfigured()) {
        return { skipped: true, reason: 'bedrock_not_configured', scored: 0, failed: 0 };
    }

    const job = await store.getJobByIdRaw(jobId);
    if (!job) {
        const err = new Error('Job no encontrado');
        err.code = 'JOB_NOT_FOUND';
        throw err;
    }

    const vacante = await store.getVacanteById(job.vacante_id);
    if (!vacante) {
        const err = new Error('Vacante no encontrada');
        err.code = 'VACANTE_NOT_FOUND';
        throw err;
    }

    const pending = await store.listCandidatosByJobPendingScore(jobId);
    if (!pending.length) {
        return { skipped: false, scored: 0, failed: 0 };
    }

    const evaluate = scoreFn || scoreCandidatoFromBedrock;
    let scored = 0;
    let failed = 0;

    await runWithConcurrency(pending, getScoreConcurrency(), async (candidato) => {
        try {
            const result = await evaluate(vacante, candidato);
            await store.updateCandidatoScore({
                candidatoId: candidato.id,
                score: result.score,
                resumenScore: result.resumen_score
            });
            scored += 1;
        } catch (error) {
            failed += 1;
            console.error(`[Sourcing] score candidato ${candidato.id}:`, error.message || error);
        }
    });

    return { skipped: false, scored, failed };
}

module.exports = {
    runJobScoring,
    getScoreConcurrency,
    runWithConcurrency
};
