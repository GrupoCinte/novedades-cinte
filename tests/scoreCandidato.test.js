const test = require('node:test');
const assert = require('node:assert/strict');
const {
    scoreCandidatoFromBedrock,
    buildScorePrompt,
    isPartialProfile
} = require('../src/sourcing/services/scoreCandidato');
const { runJobScoring } = require('../src/sourcing/services/runJobScoring');
const { scoreColor, lerpColor } = require('../src/sourcing/utils/scoreRingColor');

test('buildScorePrompt incluye vacante y candidato', async () => {
    const prompt = await buildScorePrompt(
        {
            titulo: 'Arquitecto',
            descripcion: 'Buscamos arquitecto con AWS y Java.',
            criterios: {
                cargo: 'Arquitecto de Soluciones',
                skills_requeridas: ['AWS', 'Java'],
                experiencia_min: 5
            }
        },
        {
            nombre: 'Juan Pérez',
            fuente: 'El Empleo',
            perfil: { cargo: 'Arquitecto', resumen_perfil: 'Experiencia en AWS y microservicios Java.' }
        }
    );
    assert.match(prompt, /Arquitecto de Soluciones/);
    assert.match(prompt, /AWS/);
    assert.match(prompt, /Juan Pérez/);
});

test('isPartialProfile detecta perfil limitado', () => {
    assert.equal(isPartialProfile({ snippet: 'x' }), true);
    assert.equal(isPartialProfile({ resumen_perfil: 'a'.repeat(100) }), false);
});

test('scoreCandidatoFromBedrock parsea respuesta Bedrock mock', async () => {
    const prev = process.env.SOURCING_BEDROCK_ENABLED;
    process.env.SOURCING_BEDROCK_ENABLED = 'true';
    try {
        const result = await scoreCandidatoFromBedrock(
        {
            titulo: 'Dev Java',
            descripcion: 'Java senior',
            criterios: { cargo: 'Dev Java', skills_requeridas: ['Java'] }
        },
        {
            nombre: 'Ana',
            perfil: {
                cargo: 'Dev Java',
                resumen_perfil:
                    'Desarrolladora Java con ocho años de experiencia en Spring Boot, microservicios y AWS en entornos enterprise.'
            }
        },
        {
            converseFn: async () =>
                '{"score":82,"resumen_score":"Coincide cargo y Java. AWS mencionado.","confianza":0.9}'
        }
    );
    assert.equal(result.score, 82);
    assert.match(result.resumen_score, /Java/);
    } finally {
        if (prev === undefined) delete process.env.SOURCING_BEDROCK_ENABLED;
        else process.env.SOURCING_BEDROCK_ENABLED = prev;
    }
});

test('scoreCandidatoFromBedrock limita score en perfil parcial', async () => {
    const prev = process.env.SOURCING_BEDROCK_ENABLED;
    process.env.SOURCING_BEDROCK_ENABLED = 'true';
    try {
        const result = await scoreCandidatoFromBedrock(
        {
            titulo: 'Dev',
            descripcion: 'Dev',
            criterios: { cargo: 'Dev' }
        },
        { nombre: 'X', perfil: { snippet: 'solo snippet' } },
        {
            converseFn: async () =>
                '{"score":90,"resumen_score":"Perfil muy limitado para evaluar encaje completo.","confianza":0.9}'
        }
    );
    assert.ok(result.score <= 65);
    assert.ok(result.confianza <= 0.55);
    } finally {
        if (prev === undefined) delete process.env.SOURCING_BEDROCK_ENABLED;
        else process.env.SOURCING_BEDROCK_ENABLED = prev;
    }
});

test('runJobScoring omite si Bedrock no configurado', async () => {
    const prev = process.env.SOURCING_BEDROCK_ENABLED;
    process.env.SOURCING_BEDROCK_ENABLED = 'false';
    try {
        const result = await runJobScoring({
            jobId: 'job-1',
            store: {
                getJobByIdRaw: async () => ({ id: 'job-1', vacante_id: 'v-1' }),
                getVacanteById: async () => ({ id: 'v-1' }),
                listCandidatosByJobPendingScore: async () => [{ id: 'c-1' }]
            }
        });
        assert.equal(result.skipped, true);
        assert.equal(result.reason, 'bedrock_not_configured');
    } finally {
        if (prev === undefined) delete process.env.SOURCING_BEDROCK_ENABLED;
        else process.env.SOURCING_BEDROCK_ENABLED = prev;
    }
});

test('scoreColor interpola rojo a verde', () => {
    assert.equal(scoreColor(0), lerpColor('#ef4444', '#eab308', 0));
    assert.equal(scoreColor(100), lerpColor('#eab308', '#22c55e', 1));
});
