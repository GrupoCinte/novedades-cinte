// Fases del agente de preentrevista (Contacto AT). El orden refleja el avance
// esperado de la conversación con el candidato por WhatsApp.
export const PREENTREVISTA_FASES = [
    { key: 'apertura', label: 'Apertura' },
    { key: 'interes', label: 'Interés' },
    { key: 'oferta', label: 'Oferta' },
    { key: 'ajuste', label: 'Ajuste' },
    { key: 'formulario', label: 'Formulario' },
    { key: 'hv', label: 'Hoja de vida' },
    { key: 'agenda', label: 'Agenda' },
    { key: 'cierre', label: 'Cierre' }
];

export const PREENTREVISTA_FASE_LABEL = PREENTREVISTA_FASES.reduce((acc, f) => {
    acc[f.key] = f.label;
    return acc;
}, {});

// Índice 1-based de una fase (0 si no se reconoce).
export function faseNumero(fase) {
    const idx = PREENTREVISTA_FASES.findIndex((f) => f.key === fase);
    return idx < 0 ? 0 : idx + 1;
}

export const PREENTREVISTA_FASE_TOTAL = PREENTREVISTA_FASES.length;

// Fases completadas para el stepper: al llegar a 'cierre' con estado terminal,
// todas cuentan como completas; si no, hasta la fase actual (exclusiva).
export function fasesCompletadas(fase, estado) {
    const n = faseNumero(fase);
    if (estado === 'completada') return PREENTREVISTA_FASE_TOTAL;
    if (estado === 'descartada' || estado === 'no_disponible') return Math.max(n - 1, 0);
    return Math.max(n - 1, 0);
}

export const PREENTREVISTA_ESTADO = {
    en_curso: { label: 'En curso', tone: 'blue' },
    interesado: { label: 'Interesado', tone: 'amber' },
    completada: { label: 'Apto', tone: 'emerald' },
    no_disponible: { label: 'No disponible', tone: 'slate' },
    descartada: { label: 'Descartada', tone: 'red' },
    error: { label: 'Error', tone: 'red' }
};

const TONE_CLASSES = {
    blue: {
        light: 'border-blue-200 bg-blue-50 text-blue-700',
        dark: 'border-blue-500/40 bg-blue-500/10 text-blue-300'
    },
    amber: {
        light: 'border-amber-200 bg-amber-50 text-amber-800',
        dark: 'border-amber-500/40 bg-amber-500/10 text-amber-300'
    },
    emerald: {
        light: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        dark: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
    },
    red: {
        light: 'border-red-200 bg-red-50 text-red-700',
        dark: 'border-red-500/40 bg-red-500/10 text-red-300'
    },
    slate: {
        light: 'border-slate-200 bg-slate-100 text-slate-600',
        dark: 'border-slate-600 bg-slate-700/40 text-slate-300'
    }
};

export function estadoBadgeClass(estado, isLight) {
    const info = PREENTREVISTA_ESTADO[estado] || PREENTREVISTA_ESTADO.en_curso;
    const cls = TONE_CLASSES[info.tone] || TONE_CLASSES.slate;
    return isLight ? cls.light : cls.dark;
}

export function estadoLabel(estado) {
    return (PREENTREVISTA_ESTADO[estado] || {}).label || estado || '—';
}
