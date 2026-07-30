/** Fases del pipeline de sourcing (Opción B). */
const PIPELINE_FASES = [
    'descubrimiento',
    'extraccion',
    'enriquecimiento',
    'scoring'
];

const FASE_LABELS = {
    descubrimiento: 'Descubrimiento',
    extraccion: 'Extracción',
    enriquecimiento: 'Enriquecimiento',
    scoring: 'Scoring IA'
};

const CANDIDATO_ETAPAS = [
    'descubrimiento',
    'extraccion',
    'enriquecimiento',
    'scoring',
    'completo'
];

function isValidFase(fase) {
    return PIPELINE_FASES.includes(String(fase || ''));
}

module.exports = {
    PIPELINE_FASES,
    FASE_LABELS,
    CANDIDATO_ETAPAS,
    isValidFase
};
