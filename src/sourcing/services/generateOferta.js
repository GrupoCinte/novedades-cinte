'use strict';

const { bedrockConverse, isBedrockConfigured } = require('./bedrockClient');

const SYSTEM = `Eres un redactor de ofertas laborales IT en Colombia (Grupo CINTE).
Escribe descripciones profesionales, claras y atractivas en español.
Responde solo con el texto de la oferta, sin markdown ni encabezados extra.`;

function buildOfertaPrompt(vacante) {
    const c = vacante?.criterios && typeof vacante.criterios === 'object' ? vacante.criterios : {};
    const skills = (c.skills_requeridas || c.skills || []).join(', ') || 'según perfil';
    return `Redacta una oferta laboral para publicar en portales de empleo.

Cargo: ${c.cargo || vacante.titulo || 'Profesional IT'}
Ciudad: ${c.ciudad || 'Colombia'}
Modalidad: ${c.modalidad || 'a definir'}
Experiencia mínima: ${c.experiencia_min ?? 0} años
Skills: ${skills}
Tipo contrato: ${c.tipo_contrato || 'término indefinido'}

Máximo 400 palabras. Incluye responsabilidades, requisitos y beneficios genéricos CINTE.`;
}

async function generateOfertaText(vacante) {
    if (!isBedrockConfigured()) {
        const c = vacante?.criterios || {};
        return `Buscamos ${c.cargo || vacante.titulo || 'profesional'} con experiencia en ${(c.skills_requeridas || []).join(', ') || 'tecnología'}.`;
    }
    const text = await bedrockConverse({
        system: SYSTEM,
        user: buildOfertaPrompt(vacante),
        maxTokens: 800,
        temperature: 0.5
    });
    return String(text || '').trim();
}

module.exports = { generateOfertaText, buildOfertaPrompt };
