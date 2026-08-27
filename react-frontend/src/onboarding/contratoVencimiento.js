/** Espejo de `src/onboarding/contratoVencimiento.js` para pastilla y lista. */

export function todayBogota(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(date);
}

export function isoDay(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return null;
}

export function daysUntil(fechaTermino, asOfDate) {
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

export function tipoAplicaAlerta(tipo, esquema) {
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

export function bandaVentana(dias) {
    if (dias == null || !Number.isFinite(Number(dias))) return null;
    const n = Number(dias);
    if (n < 0) return null;
    if (n <= 5) return 'T5';
    if (n <= 15) return 'T15';
    if (n <= 30) return 'T30';
    return null;
}

export function labelBanda(kind) {
    if (kind === 'T5') return '5 días';
    if (kind === 'T15') return '15 días';
    if (kind === 'T30') return '30 días';
    return '';
}

export function alertaPastilla(contrato, asOfDate) {
    if (!contrato || contrato.vigente === false) return { kind: null, dias: null };
    const tipo = contrato.tipo || contrato.tipo_contrato;
    if (!tipoAplicaAlerta(tipo, contrato.esquema_contrato)) {
        return { kind: null, dias: daysUntil(contrato.fechaTermino || contrato.fecha_termino, asOfDate) };
    }
    const dias = daysUntil(contrato.fechaTermino || contrato.fecha_termino, asOfDate);
    return { kind: bandaVentana(dias), dias };
}
