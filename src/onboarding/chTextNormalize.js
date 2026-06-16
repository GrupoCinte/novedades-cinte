/** Campos de listados CH que se persisten en MAYÚSCULAS. */
const CH_UPPERCASE_FIELDS = [
    'nombre',
    'cliente',
    'puesto',
    'descriptivo_puesto_sig',
    'nombres',
    'primer_apellido',
    'segundo_apellido'
];

function normalizeChListText(value) {
    return String(value || '').trim().toUpperCase();
}

function normalizeColabTextPatch(patch) {
    if (!patch || typeof patch !== 'object') return patch;
    const out = { ...patch };
    for (const key of CH_UPPERCASE_FIELDS) {
        if (out[key] != null && typeof out[key] === 'string') {
            out[key] = normalizeChListText(out[key]);
        }
    }
    return out;
}

module.exports = {
    CH_UPPERCASE_FIELDS,
    normalizeChListText,
    normalizeColabTextPatch
};
