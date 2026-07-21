/**
 * Motor de sustitución de placeholders [VARIABLE] para las plantillas del
 * agente de contacto. Toma datos del candidato (perfil), criterios de la
 * vacante y del analista, y devuelve el texto renderizado.
 *
 * Compartido conceptualmente con react-frontend/src/sourcing/plantillaVars.js
 * (espejo para preview en el modal de campaña).
 */

function firstNonEmpty(...vals) {
    for (const v of vals) {
        if (Array.isArray(v)) {
            const joined = v.filter((x) => typeof x === 'string' && x.trim()).join(', ');
            if (joined) return joined;
        } else if (typeof v === 'number' && Number.isFinite(v)) {
            return String(v);
        } else if (typeof v === 'string' && v.trim()) {
            return v.trim();
        }
    }
    return '';
}

function fuenteLabel(fuente) {
    const f = String(fuente || '').toLowerCase();
    if (f.includes('linkedin')) return 'LinkedIn';
    if (f.includes('empleo')) return 'elempleo';
    if (f.includes('x-ray') || f.includes('xray')) return 'una búsqueda web';
    if (f.includes('github')) return 'GitHub';
    if (f.includes('manual') || f.includes('contacto manual')) return 'contacto directo';
    return fuente || 'tu perfil profesional';
}

/**
 * Construye el diccionario de variables disponibles.
 * @param {{ candidato?: object, criterios?: object, analista?: string }} ctx
 */
function buildVars({ candidato = {}, criterios = {}, analista = '' } = {}) {
    const perfil = candidato && typeof candidato.perfil === 'object' && candidato.perfil ? candidato.perfil : {};
    const expMin = criterios.experiencia_min;
    const expMax = criterios.experiencia_max;
    let aniosExp = '';
    if (expMin != null && expMax != null && expMin !== expMax) aniosExp = `${expMin}-${expMax}`;
    else if (expMin != null && expMin > 0) aniosExp = String(expMin);
    else if (expMax != null) aniosExp = String(expMax);

    return {
        NOMBRE_CANDIDATO: firstNonEmpty(candidato.nombre, perfil.nombre, 'candidato/a'),
        NOMBRE_ANALISTA: firstNonEmpty(analista, 'un analista'),
        NOMBRE_CARGO: firstNonEmpty(criterios.cargo, candidato.vacante_titulo, perfil.cargo, 'la vacante'),
        FUENTE: fuenteLabel(candidato.fuente),
        FORMACION_REQUERIDA: firstNonEmpty(criterios.formacion, criterios.nivel_estudios_min, criterios.profesion, 'formación afín al cargo'),
        AÑOS_EXPERIENCIA: firstNonEmpty(aniosExp, 'la experiencia requerida'),
        AREA_EXPERIENCIA: firstNonEmpty(criterios.area_trabajo, criterios.sector, criterios.cargo, 'el área'),
        HABILIDADES_TECNICAS: firstNonEmpty(criterios.skills_requeridas, criterios.skills, 'las herramientas del rol'),
        HABILIDADES_DESEABLES: firstNonEmpty(criterios.skills_deseables, 'conocimientos complementarios'),
        TIPO_CONTRATO: firstNonEmpty(criterios.tipo_contrato, 'a convenir'),
        NOMBRE_CLIENTE: firstNonEmpty(criterios.cliente, 'nuestro cliente'),
        HORARIO: firstNonEmpty(criterios.horario, 'a convenir'),
        MODALIDAD: firstNonEmpty(criterios.modalidad, 'a convenir'),
        CIUDAD: firstNonEmpty(criterios.ciudad, perfil.ciudad, 'la ciudad de la vacante'),
        SENIORITY: firstNonEmpty(criterios.seniority, ''),
        SALARIO: firstNonEmpty(criterios.salario_rangos_cop, 'a convenir')
    };
}

/**
 * Renderiza una plantilla sustituyendo [VARIABLE] por su valor.
 * Deja el placeholder tal cual si la variable no existe.
 */
function renderPlantilla(texto, ctx) {
    if (typeof texto !== 'string' || !texto) return '';
    const vars = buildVars(ctx);
    return texto.replace(/\[([A-ZÑ_ÁÉÍÓÚ]+)\]/g, (match, key) => {
        const val = vars[key];
        return (val === undefined || val === null || val === '') ? match : String(val);
    });
}

/**
 * Meta rechaza parámetros de plantilla con saltos de línea o muchos espacios.
 */
function sanitizeWhatsAppTemplate(text) {
    return String(text || '')
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/ {2,}/g, ' ')
        .trim()
        .slice(0, 900);
}

/**
 * Renderiza un mapa de plantillas (por fase) con el mismo contexto.
 */
function renderPlantillas(plantillas, ctx) {
    const out = {};
    if (plantillas && typeof plantillas === 'object') {
        for (const [k, v] of Object.entries(plantillas)) {
            const rendered = renderPlantilla(v, ctx);
            out[k] = k === 'apertura' ? sanitizeWhatsAppTemplate(rendered) : rendered;
        }
    }
    return out;
}

const VARIABLES_DISPONIBLES = [
    'NOMBRE_CANDIDATO', 'NOMBRE_ANALISTA', 'NOMBRE_CARGO', 'FUENTE',
    'FORMACION_REQUERIDA', 'AÑOS_EXPERIENCIA', 'AREA_EXPERIENCIA',
    'HABILIDADES_TECNICAS', 'HABILIDADES_DESEABLES', 'TIPO_CONTRATO',
    'NOMBRE_CLIENTE', 'HORARIO', 'MODALIDAD', 'CIUDAD', 'SENIORITY', 'SALARIO'
];

module.exports = {
    buildVars,
    renderPlantilla,
    renderPlantillas,
    sanitizeWhatsAppTemplate,
    VARIABLES_DISPONIBLES
};
