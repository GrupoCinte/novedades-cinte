import { REGLA_DISPLAY, formatPeriodoEs } from './conciliacionesCiclos.js';

/** @typedef {'sinConfig' | 'completo' | 'verde' | 'amarillo' | 'rojo'} CierreVisualState */

/**
 * @param {object} cierre
 * @returns {CierreVisualState}
 */
export function cierreVisualState(cierre) {
    if (!cierre?.configured) return 'sinConfig';
    if (['CONCILIADA', 'RADICADA'].includes(cierre.estadoTarjeta)) return 'completo';
    const tier = String(cierre?.slaTier || '').trim();
    if (tier === 'verde' || tier === 'amarillo' || tier === 'rojo') return tier;
    return 'rojo';
}

/**
 * @param {object} cierre
 * @returns {number} 0–100
 */
export function cierreProgressPct(cierre) {
    const state = cierreVisualState(cierre);
    if (state === 'completo') return 100;
    const total = Number(cierre?.totalConsultores) || 0;
    const done = Number(cierre?.conciliadosCount) || 0;
    if (total <= 0) return 0;
    return Math.min(100, Math.round((done / total) * 100));
}

/**
 * @param {object} cierre
 * @returns {{ done: number, total: number }}
 */
export function cierreProgressFraction(cierre) {
    const total = Number(cierre?.totalConsultores) || 0;
    const done = Number(cierre?.conciliadosCount) || 0;
    if (cierreVisualState(cierre) === 'completo' && total > 0) {
        return { done: total, total };
    }
    return { done, total };
}

/**
 * @param {object} cierre
 * @returns {string}
 */
export function cierreReglaLabel(cierre) {
    const tipo = cierre?.regla?.tipo;
    if (!tipo) return REGLA_DISPLAY.MES_CALENDARIO || 'Mes calendario';
    if (tipo === 'HORAS_BASE') {
        const hb = cierre.regla?.horasBase;
        if (hb != null && hb !== '') return `Base / ${hb}`;
        return REGLA_DISPLAY.HORAS_BASE || 'Horas base';
    }
    return cierre.regla?.display || REGLA_DISPLAY[tipo] || tipo;
}

/**
 * @param {object} cierre
 * @returns {string}
 */
export function cierreFechaCorteLabel(cierre) {
    const end = cierre?.periodo?.end;
    if (!end) return 'Sin configurar';
    return formatPeriodoEs(end);
}

export const SLA_TIER_META = [
    { key: 'verde', label: 'A tiempo', order: 1 },
    { key: 'amarillo', label: 'Próximo', order: 2 },
    { key: 'rojo', label: 'Crítico', order: 3 },
    { key: 'completo', label: 'Completo', order: 4 },
    { key: 'sinConfig', label: 'Sin configurar', order: 5 }
];

const SLA_TIER_BADGE = {
    verde: {
        light: 'border-emerald-300 bg-emerald-50 text-emerald-800',
        dark: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
    },
    amarillo: {
        light: 'border-amber-300 bg-amber-50 text-amber-900',
        dark: 'border-amber-500/40 bg-amber-500/15 text-amber-200'
    },
    rojo: {
        light: 'border-rose-300 bg-rose-50 text-rose-800',
        dark: 'border-rose-500/40 bg-rose-500/15 text-rose-200'
    },
    completo: {
        light: 'border-emerald-400 bg-emerald-100 text-emerald-900',
        dark: 'border-emerald-500/50 bg-emerald-600/20 text-emerald-100'
    },
    sinConfig: {
        light: 'border-slate-300 bg-slate-100 text-slate-700',
        dark: 'border-slate-600 bg-slate-700/40 text-slate-300'
    }
};

const SLA_TIER_STEP_FILLED = {
    verde: {
        light: 'border-emerald-500 bg-emerald-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.4)]',
        dark: 'border-emerald-400 bg-emerald-500/85 text-white shadow-[0_0_10px_rgba(16,185,129,0.32)]'
    },
    amarillo: {
        light: 'border-amber-500 bg-amber-500 text-white shadow-[0_0_8px_rgba(245,158,11,0.4)]',
        dark: 'border-amber-400 bg-amber-500/85 text-white shadow-[0_0_10px_rgba(245,158,11,0.32)]'
    },
    rojo: {
        light: 'border-rose-500 bg-rose-500 text-white shadow-[0_0_8px_rgba(244,63,94,0.4)]',
        dark: 'border-rose-400 bg-rose-500/85 text-white shadow-[0_0_10px_rgba(244,63,94,0.32)]'
    },
    completo: {
        light: 'border-emerald-600 bg-emerald-600 text-white shadow-[0_0_8px_rgba(5,150,105,0.4)]',
        dark: 'border-emerald-500 bg-emerald-600/90 text-white shadow-[0_0_10px_rgba(16,185,129,0.35)]'
    },
    sinConfig: {
        light: 'border-slate-400 bg-slate-400 text-white shadow-[0_0_6px_rgba(100,116,139,0.35)]',
        dark: 'border-slate-500 bg-slate-600/90 text-white shadow-[0_0_8px_rgba(100,116,139,0.3)]'
    }
};

const SLA_TIER_STEP_LABEL = {
    verde: { light: 'text-emerald-700', dark: 'text-emerald-300' },
    amarillo: { light: 'text-amber-700', dark: 'text-amber-300' },
    rojo: { light: 'text-rose-700', dark: 'text-rose-300' },
    completo: { light: 'text-emerald-800', dark: 'text-emerald-200' },
    sinConfig: { light: 'text-slate-600', dark: 'text-slate-400' }
};

const SLA_TIER_STEP_CONNECTOR = {
    verde: { light: 'bg-emerald-400', dark: 'bg-emerald-500/55' },
    amarillo: { light: 'bg-amber-400', dark: 'bg-amber-500/55' },
    rojo: { light: 'bg-rose-400', dark: 'bg-rose-500/55' },
    completo: { light: 'bg-emerald-500', dark: 'bg-emerald-500/55' },
    sinConfig: { light: 'bg-slate-300', dark: 'bg-slate-600/55' }
};

/**
 * @param {string} tierKey
 * @param {boolean} isLight
 * @returns {string}
 */
export function slaTierBadgeClass(tierKey, isLight) {
    const mode = isLight ? 'light' : 'dark';
    return SLA_TIER_BADGE[tierKey]?.[mode] || SLA_TIER_BADGE.sinConfig[mode];
}

export function slaTierStepCircleClass(tierKey, isLight, { activeFilter = false, hasCount = false } = {}) {
    const mode = isLight ? 'light' : 'dark';
    const base =
        'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold tabular-nums transition-all duration-300 sm:h-10 sm:w-10 sm:text-xs';
    if (activeFilter) {
        return `${base} ${
            isLight
                ? 'border-[#2F7BB8] bg-cyan-50 text-[#2F7BB8] shadow-[0_0_14px_rgba(47,123,184,0.4)] animate-pulse'
                : 'border-[#65BCF7] bg-[#2F7BB8]/25 text-[#65BCF7] shadow-[0_0_16px_rgba(101,188,247,0.5)] animate-pulse'
        }`;
    }
    if (hasCount) {
        return `${base} ${SLA_TIER_STEP_FILLED[tierKey]?.[mode] || SLA_TIER_STEP_FILLED.sinConfig[mode]}`;
    }
    return `${base} ${
        isLight ? 'border-slate-300 bg-white text-slate-400' : 'border-slate-700 bg-transparent text-slate-600'
    }`;
}

export function slaTierStepLabelClass(tierKey, isLight, { activeFilter = false, hasCount = false } = {}) {
    const mode = isLight ? 'light' : 'dark';
    const base = 'mt-2 max-w-[5.5rem] text-center text-[10px] font-semibold leading-tight sm:text-[11px]';
    if (activeFilter) {
        return `${base} ${isLight ? 'text-[#2F7BB8]' : 'text-[#65BCF7]'}`;
    }
    if (hasCount) {
        return `${base} ${SLA_TIER_STEP_LABEL[tierKey]?.[mode] || (isLight ? 'text-slate-700' : 'text-slate-300')}`;
    }
    return `${base} ${isLight ? 'text-slate-400' : 'text-slate-500'}`;
}

export function slaTierStepConnectorClass(tierKey, isLight, filled = false) {
    const mode = isLight ? 'light' : 'dark';
    const base = 'mx-0.5 mt-[1.125rem] h-0.5 w-4 shrink-0 rounded-full sm:mt-[1.25rem] sm:w-5';
    if (filled) {
        return `${base} ${SLA_TIER_STEP_CONNECTOR[tierKey]?.[mode] || SLA_TIER_STEP_CONNECTOR.sinConfig[mode]}`;
    }
    return `${base} ${isLight ? 'bg-slate-200' : 'bg-slate-700/50'}`;
}

/** @param {string} tierKey */
export function slaTierOrder(tierKey) {
    const hit = SLA_TIER_META.find((m) => m.key === tierKey);
    return hit?.order ?? 99;
}

/**
 * @param {object[]} cierres
 * @returns {Record<string, number>}
 */
export function aggregateSlaTierCounts(cierres) {
    const counts = { verde: 0, amarillo: 0, rojo: 0, completo: 0, sinConfig: 0 };
    for (const c of cierres || []) {
        const key = cierreVisualState(c);
        if (counts[key] !== undefined) counts[key] += 1;
    }
    return counts;
}

export function slaTierLabel(tierKey) {
    return SLA_TIER_META.find((m) => m.key === tierKey)?.label || tierKey;
}
