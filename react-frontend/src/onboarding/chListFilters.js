/** Claves de filtro de listado CH que admiten varios valores. */
export const LIST_FILTER_KEYS = [
    'cliente',
    'pais',
    'empleador',
    'puesto',
    'sexo',
    'tipo_contrato',
    'profesion',
    'tipo_identificacion',
    'departamento',
    'ciudad',
    'modalidad_trabajo',
    'motivo_baja',
    'tipo_personal',
    'tipo_personal_extra'
];

export function asFilterList(value) {
    if (Array.isArray(value)) {
        return value.map((v) => String(v || '').trim()).filter(Boolean);
    }
    if (value == null || value === '') return [];
    return [String(value).trim()].filter(Boolean);
}

export function serializeFilterParam(value) {
    const list = asFilterList(value);
    if (!list.length) return undefined;
    return list.join(',');
}

/** Texto del disparador del desplegable: Todos / un valor / primero +N. */
export function summarizeMultiSelect(value, items = [], emptyLabel = 'Todos') {
    const selected = asFilterList(value);
    if (!selected.length) return emptyLabel;
    const labelOf = (v) => {
        const hit = items.find((i) => String(i?.value ?? i) === v);
        return String(hit?.label ?? hit?.value ?? v);
    };
    if (selected.length === 1) return labelOf(selected[0]);
    return `${labelOf(selected[0])} +${selected.length - 1}`;
}

export function removeChipFromFilters(filters, chip) {
    const next = { ...(filters || {}) };
    if (Array.isArray(chip?.keys)) {
        for (const k of chip.keys) delete next[k];
        return next;
    }
    const key = chip?.key;
    if (!key) return next;
    const list = asFilterList(next[key]).filter((v) => v !== chip.value);
    if (list.length) next[key] = list;
    else delete next[key];
    return next;
}

function addListChips(chips, filters, key, prefix, hidden) {
    if (hidden) return;
    for (const value of asFilterList(filters[key])) {
        const short = value.length > 28 ? `${value.slice(0, 26)}…` : value;
        chips.push({
            id: `${key}:${value}`,
            key,
            value,
            label: `${prefix}: ${short}`
        });
    }
}

/**
 * Chips quitables de filtros aplicados (sin la búsqueda: ya vive en el input).
 */
export function buildPersonalFilterChips(filters, flags = {}) {
    const f = filters || {};
    const chips = [];
    addListChips(chips, f, 'cliente', 'Cliente');
    addListChips(chips, f, 'pais', 'País', flags.hidePais);
    addListChips(chips, f, 'empleador', 'Empleador', flags.hideEmpleador);
    addListChips(chips, f, 'puesto', 'Puesto', flags.hidePuesto);
    addListChips(chips, f, 'sexo', 'Sexo');
    addListChips(chips, f, 'tipo_contrato', 'Contrato');
    addListChips(chips, f, 'profesion', 'Profesión');
    addListChips(chips, f, 'tipo_identificacion', 'ID');
    addListChips(chips, f, 'departamento', 'Depto');
    addListChips(chips, f, 'ciudad', 'Ciudad');
    addListChips(chips, f, 'modalidad_trabajo', 'Modalidad', flags.hideModalidad);
    addListChips(chips, f, 'motivo_baja', 'Motivo');
    addListChips(chips, f, 'tipo_personal', 'Tipo');
    addListChips(chips, f, 'tipo_personal_extra', 'Tipo');
    if (f.fecha_ingreso_desde || f.fecha_ingreso_hasta) {
        chips.push({
            id: 'rango-ingreso',
            keys: ['fecha_ingreso_desde', 'fecha_ingreso_hasta'],
            label: `Ingreso: ${f.fecha_ingreso_desde || '…'} – ${f.fecha_ingreso_hasta || '…'}`
        });
    }
    if (f.fecha_baja_desde || f.fecha_baja_hasta) {
        chips.push({
            id: 'rango-termino',
            keys: ['fecha_baja_desde', 'fecha_baja_hasta'],
            label: `Término: ${f.fecha_baja_desde || '…'} – ${f.fecha_baja_hasta || '…'}`
        });
    }
    return chips;
}
