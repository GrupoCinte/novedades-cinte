'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildScorePrompt } = require('../src/sourcing/services/scoreCandidato');

describe('scoreLearning', () => {
    it('buildScorePrompt incluye ejemplos de decisiones previas', async () => {
        const vacante = {
            titulo: 'Dev Java',
            criterios: { cargo: 'Dev Java', skills_requeridas: ['Java'] }
        };
        const candidato = { nombre: 'Ana', fuente: 'Zoho', perfil: { cargo: 'Backend' } };
        const ejemplos = 'Decisiones anteriores de CINTE:\n- Pedro (Bogotá, Dev): APLICA';
        const prompt = await buildScorePrompt(vacante, candidato, ejemplos);
        assert.match(prompt, /Decisiones anteriores de CINTE/);
        assert.match(prompt, /Pedro/);
        assert.match(prompt, /Dev Java/);
    });

    it('buildScorePrompt funciona sin ejemplos', async () => {
        const prompt = await buildScorePrompt(
            { criterios: { cargo: 'QA' } },
            { nombre: 'Luis', perfil: {} },
            ''
        );
        assert.match(prompt, /QA/);
        assert.doesNotMatch(prompt, /Decisiones anteriores/);
    });
});
