// Espejo (frontend) de src/sourcing/services/plantillaVars.js — solo para preview
// en el modal de campaña. La sustitución real la hace el backend al disparar.

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
    return fuente || 'tu perfil profesional';
}

export function buildVars({ candidato = {}, criterios = {}, analista = '' } = {}) {
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

export function renderPlantilla(texto, ctx = {}) {
    if (typeof texto !== 'string' || !texto) return '';
    const vars = buildVars(ctx);
    return texto.replace(/\[([A-ZÑ_ÁÉÍÓÚ]+)\]/g, (match, key) => {
        const val = vars[key];
        return (val === undefined || val === null || val === '') ? match : String(val);
    });
}

export const VARIABLES_DISPONIBLES = [
    'NOMBRE_CANDIDATO', 'NOMBRE_ANALISTA', 'NOMBRE_CARGO', 'FUENTE',
    'FORMACION_REQUERIDA', 'AÑOS_EXPERIENCIA', 'AREA_EXPERIENCIA',
    'HABILIDADES_TECNICAS', 'HABILIDADES_DESEABLES', 'TIPO_CONTRATO',
    'NOMBRE_CLIENTE', 'HORARIO', 'MODALIDAD', 'CIUDAD', 'SENIORITY', 'SALARIO'
];

export const PLANTILLA_FASES = [
    { key: 'apertura', label: 'Mensaje de apertura' },
    { key: 'oferta', label: 'Plantilla de oferta' },
    { key: 'cierre_presentacion', label: 'Cierre de presentación' },
    { key: 'formulario_datos', label: 'Solicitud de datos' },
    { key: 'solicitud_hv', label: 'Solicitud de hoja de vida' },
    { key: 'reenganche', label: 'Reenganche (abierto a propuestas)' },
    { key: 'cierre_amable', label: 'Cierre amable (no disponible)' }
];
