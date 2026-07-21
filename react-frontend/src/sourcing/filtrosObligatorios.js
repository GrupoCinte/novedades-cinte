// Espejo en frontend de src/sourcing/services/filtrosObligatorios.js
// Determina qué filtros obligatorios faltan para poder iniciar una búsqueda.

function hasText(v) {
    return typeof v === 'string' && v.trim().length > 0;
}

export const CAMPOS_OBLIGATORIOS = [
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
    { campo: 'seniority', label: 'Seniority', presente: (c) => hasText(c.seniority) },
    { campo: 'modalidad', label: 'Modalidad', presente: (c) => hasText(c.modalidad) },
    {
        campo: 'ciudad',
        label: 'Ciudad',
        presente: (c) => hasText(c.ciudad) || c.ubicacion_tipo === 'todo'
    },
    { campo: 'tipo_contrato', label: 'Tipo de contrato', presente: (c) => hasText(c.tipo_contrato) },
    {
        campo: 'salario',
        label: 'Salario',
        presente: (c) => Array.isArray(c.salario_rangos_cop) && c.salario_rangos_cop.length > 0
    }
];

export function computeFiltrosFaltantes(criterios) {
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
