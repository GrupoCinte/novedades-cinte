'use strict';

const { bedrockConverse, isBedrockConfigured } = require('./bedrockClient');
const { extractJsonObject } = require('./parseVacante');
const { scoredCandidatoSchema } = require('../schemas/scoreCandidato');

const SYSTEM_PROMPT = `Eres un analista de reclutamiento IT en Colombia (Grupo CINTE).
Evalúas el encaje de un candidato frente a una vacante de forma NEUTRAL y factual.
Responde ÚNICAMENTE con JSON válido, sin markdown ni texto adicional.
No recomiendes acciones ("contactar", "descartar"). Solo describe encaje y brechas.
No infieras datos que no estén en el perfil. Ignora nombre, edad, género y foto para la evaluación.`;

function isPartialProfile(perfil) {
    if (!perfil || typeof perfil !== 'object') return true;
    if (perfil.datos_completos === true) return false;
    if (perfil.extraccion?.estado === 'parcial') return true;
    return !(
        (perfil.resumen_perfil && String(perfil.resumen_perfil).length > 80)
        || perfil.email
        || perfil.telefono
        || (Array.isArray(perfil.contactos) && perfil.contactos.length > 0)
        || (Array.isArray(perfil.experiencias) && perfil.experiencias.length > 0)
    );
}

function formatList(arr) {
    if (!Array.isArray(arr) || !arr.length) return 'ninguna';
    return arr.map(String).join(', ');
}

function formatIdiomas(idiomas) {
    if (!Array.isArray(idiomas) || !idiomas.length) return 'ninguno';
    return idiomas.map((i) => `${i.idioma || i}${i.nivel ? ` (${i.nivel})` : ''}`).join(', ');
}

function summarizePerfil(perfil) {
    const p = perfil && typeof perfil === 'object' ? perfil : {};
    const lines = [];
    if (p.cargo) lines.push(`Cargo actual: ${p.cargo}`);
    if (p.ciudad) lines.push(`Ciudad: ${p.ciudad}`);
    if (p.experiencia) lines.push(`Experiencia: ${p.experiencia}`);
    if (p.fecha_actualizacion) lines.push(`CV actualizado: ${p.fecha_actualizacion}`);
    if (p.resumen_perfil) lines.push(`Resumen: ${String(p.resumen_perfil).slice(0, 600)}`);
    if (Array.isArray(p.experiencias) && p.experiencias.length) {
        lines.push(`Experiencias: ${p.experiencias.slice(0, 5).join(' | ')}`);
    }
    if (Array.isArray(p.formacion) && p.formacion.length) {
        lines.push(`Formación: ${p.formacion.slice(0, 3).join(' | ')}`);
    }
    if (Array.isArray(p.habilidades) && p.habilidades.length) {
        lines.push(`Habilidades: ${p.habilidades.slice(0, 12).join(', ')}`);
    }
    if (Array.isArray(p.skills_enriquecidos) && p.skills_enriquecidos.length) {
        lines.push(`Skills enriquecidos: ${p.skills_enriquecidos.slice(0, 12).join(', ')}`);
    }
    return lines.join('\n') || '(perfil muy limitado)';
}

async function buildScorePrompt(vacante, candidato, ejemplosText = '') {
    const criterios = vacante?.criterios && typeof vacante.criterios === 'object' ? vacante.criterios : {};
    const perfil = candidato?.perfil && typeof candidato.perfil === 'object' ? candidato.perfil : {};
    const partial = isPartialProfile(perfil);

    return `Evalúa el encaje del candidato con la vacante y devuelve JSON:
{
  "score": 0-100,
  "resumen_score": "2-3 frases neutrales en español: qué cumple y qué falta",
  "confianza": 0.0-1.0
}

Criterios de puntuación (orientación, no fórmula rígida):
- 40% skills requeridas explícitas en el perfil del candidato
- 25% alineación de cargo / cargos equivalentes
- 15% experiencia vs mínimo requerido
- 10% ubicación y modalidad
- 10% formación, idiomas y skills deseables

Reglas:
- Solo cuenta skills mencionadas explícitamente en el perfil; no asumas tecnologías no listadas.
- Si el cargo del candidato no guarda relación con el buscado, score ≤ 35 salvo skills muy fuertes.
- Perfil parcial (${partial ? 'SÍ' : 'NO'}): confianza ≤ 0.55 y score máximo 65.
- resumen_score: factual, sin imperativos ni recomendaciones de contacto.
${ejemplosText ? `\n${ejemplosText}\n` : ''}
VACANTE
Título: ${vacante?.titulo || criterios.cargo || 'sin título'}
Descripción original:
"""
${String(vacante?.descripcion || '').trim().slice(0, 4000)}
"""
Criterios confirmados:
- Cargo: ${criterios.cargo || 'no especificado'}
- Cargos equivalentes: ${formatList(criterios.cargos_equivalentes)}
- Skills requeridas: ${formatList(criterios.skills_requeridas || criterios.skills)}
- Skills deseables: ${formatList(criterios.skills_deseables)}
- Experiencia mínima (años): ${criterios.experiencia_min ?? 0}
- Ciudad: ${criterios.ciudad || 'no especificada'}
- Modalidad: ${criterios.modalidad || 'no especificada'}
- Formación: ${criterios.formacion || criterios.nivel_estudios_min || 'no especificada'}
- Idiomas: ${formatIdiomas(criterios.idiomas)}

CANDIDATO
Nombre: ${candidato?.nombre || 'sin nombre'}
Fuente: ${candidato?.fuente || 'desconocida'}
${summarizePerfil(perfil)}`;
}

/**
 * @param {{ titulo?: string, descripcion?: string, criterios?: object }} vacante
 * @param {{ nombre?: string, fuente?: string, perfil?: object }} candidato
 * @param {{ converseFn?: Function }} [opts]
 */
async function scoreCandidatoFromBedrock(vacante, candidato, opts = {}) {
    if (!isBedrockConfigured()) {
        const err = new Error('Bedrock no configurado para scoring');
        err.code = 'BEDROCK_NOT_CONFIGURED';
        throw err;
    }

    let ejemplosText = '';
    if (opts.store && typeof opts.store.listDecisionesEntrenamiento === 'function') {
        const criterios = vacante?.criterios || {};
        const cargo = criterios.cargo || vacante?.titulo || '';
        const rows = await opts.store.listDecisionesEntrenamiento({ cargo, limit: 5 });
        if (rows.length) {
            ejemplosText = 'Decisiones anteriores de CINTE:\n'
                + rows.map((r) => {
                    const dec = r.decision === 'aprobado' ? 'APLICA' : 'NO APLICA';
                    return `- ${r.nombre} (${r.ciudad || ''}, ${r.cargo_candidato || ''}): ${dec}`;
                }).join('\n');
        }
    }

    const converseFn = opts.converseFn || bedrockConverse;
    const text = await converseFn({
        system: SYSTEM_PROMPT,
        user: await buildScorePrompt(vacante, candidato, ejemplosText),
        maxTokens: 512,
        temperature: 0.2
    });

    const json = extractJsonObject(text);
    const parsed = scoredCandidatoSchema.parse(json);

    const partial = isPartialProfile(candidato?.perfil);
    let score = parsed.score;
    let confianza = parsed.confianza ?? 0.8;
    if (partial) {
        score = Math.min(score, 65);
        confianza = Math.min(confianza, 0.55);
    }

    return {
        score,
        resumen_score: parsed.resumen_score,
        confianza
    };
}

module.exports = {
    scoreCandidatoFromBedrock,
    buildScorePrompt,
    isPartialProfile,
    SYSTEM_PROMPT
};
