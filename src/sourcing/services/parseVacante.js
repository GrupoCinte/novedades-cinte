'use strict';

const { bedrockConverse, isBedrockConfigured, getBedrockModelId } = require('./bedrockClient');
const { parsedVacanteSchema } = require('../schemas/vacante');

const SYSTEM_PROMPT = `Eres un analista de reclutamiento IT en Colombia (Grupo CINTE).
Extraes criterios estructurados de descriptivos de vacante en español para buscar candidatos en El Empleo, LinkedIn y X-Ray.
Responde ÚNICAMENTE con JSON válido, sin markdown ni texto adicional.`;

function buildUserPrompt(descripcion) {
    return `Analiza este descriptivo de vacante y devuelve JSON con esta forma exacta:
{
  "titulo": "título corto de la vacante (máx 120 chars)",
  "cargo": "cargo principal buscado (título de la vacante)",
  "cargos_equivalentes": ["1-4 títulos como aparecerían en El Empleo autocomplete «Cargo equivalente»"],
  "ciudad": "ciudad concreta o null si remoto/nacional",
  "ubicacion_tipo": "ciudad|departamento|todo",
  "skills_requeridas": ["requisitos técnicos explícitos"],
  "skills_deseables": ["nice-to-have"],
  "palabras_clave_hv": ["máx 3 términos cortos para filtro «La palabra» en EE: tecnologías concretas, NO el cargo"],
  "experiencia_min": 0,
  "experiencia_max": null,
  "formacion": "carrera o nivel si se menciona, o null",
  "nivel_estudios_min": "Profesional|Tecnólogo|Maestría|etc o null",
  "profesion": "carrera para filtro Profesión EE o null",
  "area_trabajo": "área inferida (Tecnología, Finanzas...) o null",
  "sector": null,
  "idiomas": [{"idioma": "Inglés", "nivel": "B2"}],
  "salario_rangos_cop": [],
  "modalidad": "presencial|remoto|híbrido|null",
  "hv_actualizada": null,
  "search_in_scope": "toda_hv|ultima_experiencia|estudios",
  "keywords_busqueda": ["3-8 términos para LinkedIn/X-Ray"],
  "info_faltante": [{"campo": "ciudad", "impacto": "alto|medio|bajo", "mensaje": "..."}],
  "confianza": {"cargo": 0.9, "cargos_equivalentes": 0.7}
}

Reglas:
- cargos_equivalentes: variantes reales del cargo en Colombia (ej. «Arquitecto de software», «Arquitecto de soluciones»). Incluir el cargo principal si aplica.
- palabras_clave_hv: solo tech concretas (AWS, Java, Docker). Nunca frases largas ni el nombre del cargo.
- skills_requeridas vs skills_deseables: separar estrictamente.
- hv_actualizada: null salvo que el descriptivo pida perfiles recientes (último_mes, ultimos_3_meses, ultimos_6_meses, ultimo_ano).
- info_faltante: avisos cuando falte info que degrade el filtrado (ciudad, experiencia, salario, idioma, cargo ambiguo).
- confianza: 0-1 por cargo, cargos_equivalentes, ciudad, experiencia_min.
- No extraer género ni edad salvo requisito legal explícito.
- Si falta un campo opcional, usa null, [] o 0 según el tipo.

Descriptivo:
"""
${String(descripcion || '').trim()}
"""`;
}

function extractJsonObject(text) {
    const raw = String(text || '').trim();
    if (!raw) throw new Error('Bedrock devolvió respuesta vacía');

    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : raw;

    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
        throw new Error('No se encontró JSON en la respuesta de Bedrock');
    }
    return JSON.parse(candidate.slice(start, end + 1));
}

function mergeCriterios(existing, parsed) {
    const base = existing && typeof existing === 'object' ? { ...existing } : {};
    const skillsReq = base.skills_requeridas?.length
        ? base.skills_requeridas
        : base.skills?.length
          ? base.skills
          : parsed.skills_requeridas?.length
            ? parsed.skills_requeridas
            : parsed.skills || [];
    const skillsDes = base.skills_deseables?.length
        ? base.skills_deseables
        : parsed.skills_deseables || [];
    const cargosEq = base.cargos_equivalentes?.length
        ? base.cargos_equivalentes
        : parsed.cargos_equivalentes?.length
          ? parsed.cargos_equivalentes
          : parsed.cargo
            ? [parsed.cargo]
            : [];

    const out = {
        ...base,
        cargo: base.cargo || parsed.cargo || null,
        cargos_equivalentes: cargosEq,
        ciudad: base.ciudad || parsed.ciudad || null,
        ubicacion_tipo: base.ubicacion_tipo || parsed.ubicacion_tipo || 'todo',
        skills: skillsReq,
        skills_requeridas: skillsReq,
        skills_deseables: skillsDes,
        palabras_clave_hv: base.palabras_clave_hv?.length
            ? base.palabras_clave_hv
            : parsed.palabras_clave_hv || [],
        experiencia_min:
            base.experiencia_min != null && base.experiencia_min > 0
                ? base.experiencia_min
                : parsed.experiencia_min ?? 0,
        experiencia_max: base.experiencia_max ?? parsed.experiencia_max ?? null,
        formacion: base.formacion || parsed.formacion || null,
        nivel_estudios_min: base.nivel_estudios_min || parsed.nivel_estudios_min || null,
        profesion: base.profesion || parsed.profesion || null,
        area_trabajo: base.area_trabajo || parsed.area_trabajo || null,
        sector: base.sector || parsed.sector || null,
        idiomas: base.idiomas?.length ? base.idiomas : parsed.idiomas || [],
        salario_rangos_cop: base.salario_rangos_cop?.length
            ? base.salario_rangos_cop
            : parsed.salario_rangos_cop || [],
        modalidad: base.modalidad || parsed.modalidad || null,
        hv_actualizada: base.hv_actualizada ?? parsed.hv_actualizada ?? null,
        search_in_scope: base.search_in_scope || parsed.search_in_scope || 'toda_hv',
        keywords_busqueda: parsed.keywords_busqueda?.length
            ? parsed.keywords_busqueda
            : base.keywords_busqueda || [],
        info_faltante: parsed.info_faltante?.length ? parsed.info_faltante : base.info_faltante || [],
        confianza: { ...(parsed.confianza || {}), ...(base.confianza || {}) },
        filtros_confirmados: base.filtros_confirmados === true,
        filtros_confirmados_at: base.filtros_confirmados_at || null,
        _parse: {
            at: new Date().toISOString(),
            model: getBedrockModelId()
        }
    };
    delete out.parse_error;
    return out;
}

/**
 * @param {string} descripcion
 * @returns {Promise<{ titulo: string|null, criterios: object }>}
 */
async function parseVacanteFromDescripcion(descripcion) {
    if (!isBedrockConfigured()) {
        const err = new Error('Bedrock no configurado para parse de vacante');
        err.code = 'BEDROCK_NOT_CONFIGURED';
        throw err;
    }

    const text = await bedrockConverse({
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(descripcion),
        maxTokens: 2000,
        temperature: 0.1
    });

    const json = extractJsonObject(text);
    const parsed = parsedVacanteSchema.parse(json);

    return {
        titulo: parsed.titulo || parsed.cargo || null,
        parsed,
        criterios: mergeCriterios({}, parsed)
    };
}

module.exports = {
    parseVacanteFromDescripcion,
    buildUserPrompt,
    extractJsonObject,
    mergeCriterios,
    SYSTEM_PROMPT
};
