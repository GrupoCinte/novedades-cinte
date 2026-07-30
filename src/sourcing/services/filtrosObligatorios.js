'use strict';

/**
 * Campos obligatorios que deben quedar diligenciados en los criterios de una
 * vacante antes de poder iniciar una búsqueda. Cada entrada define cómo se
 * evalúa si el campo está presente en `criterios`.
 */
const CAMPOS_OBLIGATORIOS = [
    {
        campo: 'formacion',
        label: 'Formación académica',
        presente: (c) => hasText(c.formacion) || hasText(c.nivel_estudios_min) || hasText(c.profesion)
    },
    {
        campo: 'experiencia',
        label: 'Experiencia requerida',
        presente: (c) => Number(c.experiencia_min) > 0 || Number(c.experiencia_max) > 0
    },
    {
        campo: 'seniority',
        label: 'Seniority',
        presente: (c) => hasText(c.seniority)
    },
    {
        campo: 'modalidad',
        label: 'Modalidad',
        presente: (c) => hasText(c.modalidad)
    },
    {
        campo: 'ciudad',
        label: 'Ciudad',
        presente: (c) => hasText(c.ciudad) || c.ubicacion_tipo === 'todo'
    },
    {
        campo: 'tipo_contrato',
        label: 'Tipo de contrato',
        presente: (c) => hasText(c.tipo_contrato)
    },
    {
        campo: 'salario',
        label: 'Salario',
        presente: (c) => Array.isArray(c.salario_rangos_cop) && c.salario_rangos_cop.length > 0
    }
];

function hasText(v) {
    return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Devuelve la lista de campos obligatorios faltantes en los criterios.
 * @param {object} criterios
 * @returns {Array<{campo: string, label: string}>}
 */
function computeFiltrosFaltantes(criterios) {
    const c = criterios && typeof criterios === 'object' ? criterios : {};
    return CAMPOS_OBLIGATORIOS
        .filter((f) => {
            try {
                return !f.presente(c);
            } catch {
                return true;
            }
        })
        .map((f) => ({ campo: f.campo, label: f.label }));
}

module.exports = {
    CAMPOS_OBLIGATORIOS,
    computeFiltrosFaltantes
};
