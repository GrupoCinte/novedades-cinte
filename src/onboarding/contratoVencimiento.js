'use strict';

const KINDS = ['T30', 'T15', 'T5'];
const BANDA_DIAS = { T30: 30, T15: 15, T5: 5 };
const FLAG_COL = {
    T30: 'reminder_t30_sent_at',
    T15: 'reminder_t15_sent_at',
    T5: 'reminder_t5_sent_at'
};

function todayBogota(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

function isoDay(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return null;
}

function daysUntil(fechaTermino, asOfDate) {
    const end = isoDay(fechaTermino);
    const asOf = isoDay(asOfDate) || todayBogota();
    if (!end) return null;
    const [y1, m1, d1] = end.split('-').map(Number);
    const [y2, m2, d2] = asOf.split('-').map(Number);
    if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return null;
    return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86400000);
}

function foldTipo(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/** OPS, fijo u obra/labor. Indefinido no aplica aunque el esquema diga otra cosa. */
function tipoAplicaAlerta(tipo, esquema) {
    const t = foldTipo(tipo);
    const e = foldTipo(esquema);
    if (t.includes('indefinido')) return false;
    if (t.includes('fijo') || t.includes('obra') || t.includes('labor')) return true;
    if (t.includes('ops') || t.includes('prestacion') || t.includes('honorario')) return true;
    if (e.includes('ops') || e.includes('prestacion') || e.includes('honorario') || e === 'cuenta propia') {
        return true;
    }
    return false;
}

/** Ventana UI / lista: 0-5 rojo, 6-15 naranja, 16-30 amarillo. */
function bandaVentana(dias) {
    if (dias == null || !Number.isFinite(Number(dias))) return null;
    const n = Number(dias);
    if (n < 0) return null;
    if (n <= 5) return 'T5';
    if (n <= 15) return 'T15';
    if (n <= 30) return 'T30';
    return null;
}

function bandaExacta(dias) {
    if (dias === 30) return 'T30';
    if (dias === 15) return 'T15';
    if (dias === 5) return 'T5';
    return null;
}

function parseKind(kind) {
    const k = String(kind || '').toUpperCase();
    return KINDS.includes(k) ? k : null;
}

function labelBanda(kind) {
    if (kind === 'T5') return '5 días';
    if (kind === 'T15') return '15 días';
    if (kind === 'T30') return '30 días';
    return '';
}

function ventanaRango(kind) {
    const k = parseKind(kind);
    if (k === 'T5') return { min: 0, max: 5 };
    if (k === 'T15') return { min: 6, max: 15 };
    if (k === 'T30') return { min: 16, max: 30 };
    return { min: 0, max: 30 };
}

module.exports = {
    BANDA_DIAS,
    FLAG_COL,
    KINDS,
    bandaExacta,
    bandaVentana,
    daysUntil,
    foldTipo,
    isoDay,
    labelBanda,
    parseKind,
    tipoAplicaAlerta,
    todayBogota,
    ventanaRango
};
