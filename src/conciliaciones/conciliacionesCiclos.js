'use strict';

const REGLA_TIPOS = ['HORAS_BASE', 'CALENDARIO_30', 'DIAS_HABILES', 'MES_CALENDARIO'];

const REGLA_DISPLAY = {
    HORAS_BASE: 'Horas base',
    CALENDARIO_30: 'Calendario 30',
    DIAS_HABILES: 'Días hábiles',
    MES_CALENDARIO: 'Mes calendario'
};

function pad2(n) {
    return String(n).padStart(2, '0');
}

function isoFromUtcDate(d) {
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function parseIsoDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
    if (!m) return null;
    return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

function lastDayOfMonth(year, month) {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function clampDayToMonth(year, month, day) {
    const last = lastDayOfMonth(year, month);
    return Math.min(Math.max(1, Number(day) || 1), last);
}

function addDaysIso(iso, days) {
    const p = parseIsoDate(iso);
    if (!p) return iso;
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
    d.setUTCDate(d.getUTCDate() + days);
    return isoFromUtcDate(d);
}

function diffDaysIso(fromIso, toIso) {
    const a = parseIsoDate(fromIso);
    const b = parseIsoDate(toIso);
    if (!a || !b) return 0;
    const da = Date.UTC(a.year, a.month - 1, a.day);
    const db = Date.UTC(b.year, b.month - 1, b.day);
    return Math.round((db - da) / 86400000);
}

/**
 * Ciclo por corte: del día (corte+1) del mes anterior al día corte del mes de referencia.
 * @param {{ year: number, month: number, diaCorte: number }} params
 * @returns {{ start: string, end: string, cycleLabel: string }}
 */
function cutoffCycleDates({ year, month, diaCorte }) {
    const y = Number(year);
    const m = Number(month);
    const cut = Number(diaCorte);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
        return null;
    }

    const endDay = clampDayToMonth(y, m, cut);
    const end = `${y}-${pad2(m)}-${pad2(endDay)}`;

    let py = y;
    let pm = m - 1;
    if (pm < 1) {
        pm = 12;
        py = y - 1;
    }
    const prevEndDay = clampDayToMonth(py, pm, cut);
    const prevEnd = `${py}-${pad2(pm)}-${pad2(prevEndDay)}`;
    const start = addDaysIso(prevEnd, 1);

    return {
        start,
        end,
        cycleLabel: `${start} – ${end}`
    };
}

/**
 * @param {number} year
 * @param {number} month 1-12
 */
function monthRangeDates(year, month) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0));
    return { start: isoFromUtcDate(start), end: isoFromUtcDate(end), cycleLabel: `${isoFromUtcDate(start)} – ${isoFromUtcDate(end)}` };
}

/**
 * @param {{ year: number, month: number, diaCorte?: number|null, reglaTipo?: string|null }} params
 */
function resolvePeriodoForCliente({ year, month, diaCorte, reglaTipo }) {
    const tipo = String(reglaTipo || 'MES_CALENDARIO').trim();
    if (tipo === 'MES_CALENDARIO' || !diaCorte) {
        return monthRangeDates(year, month);
    }
    return cutoffCycleDates({ year, month, diaCorte: Number(diaCorte) });
}

/**
 * @param {{ today?: string, year: number, month: number, diaCorte: number }} params
 */
function daysUntilCutoff({ today, year, month, diaCorte }) {
    const cycle = cutoffCycleDates({ year, month, diaCorte });
    if (!cycle) return null;
    const ref = String(today || '').trim() || isoFromUtcDate(new Date());
    return diffDaysIso(ref, cycle.end);
}

function cutoffLabelFromDays(daysUntil) {
    const d = Number(daysUntil);
    if (!Number.isFinite(d)) return '';
    if (d === 0) return 'Hoy';
    if (d === 1) return 'En 1 día';
    if (d > 1) return `En ${d} días`;
    if (d === -1) return 'Ayer';
    return `Hace ${Math.abs(d)} días`;
}

/**
 * Mes de referencia del ciclo activo según la fecha de hoy.
 * @param {{ today?: string, diaCorte: number }} params
 */
function resolveBillingMonthForToday({ today, diaCorte }) {
    const ref = String(today || '').trim() || isoFromUtcDate(new Date());
    const p = parseIsoDate(ref);
    if (!p) return null;
    const effectiveCut = clampDayToMonth(p.year, p.month, diaCorte);
    if (p.day <= effectiveCut) {
        return { year: p.year, month: p.month };
    }
    let ny = p.year;
    let nm = p.month + 1;
    if (nm > 12) {
        nm = 1;
        ny += 1;
    }
    return { year: ny, month: nm };
}

function mapConfigRow(row) {
    if (!row) return null;
    const tipo = String(row.regla_tipo || row.reglaTipo || 'MES_CALENDARIO').trim();
    return {
        cliente: String(row.cliente || '').trim(),
        diaCorte: Number(row.dia_corte ?? row.diaCorte) || null,
        reglaTipo: tipo,
        reglaDetalle: row.regla_detalle != null ? String(row.regla_detalle) : row.reglaDetalle != null ? String(row.reglaDetalle) : '',
        horasBase: row.horas_base != null ? Number(row.horas_base) : row.horasBase != null ? Number(row.horasBase) : null,
        slaDiasVerde: Number(row.sla_dias_verde ?? row.slaDiasVerde ?? 10),
        slaDiasAmarillo: Number(row.sla_dias_amarillo ?? row.slaDiasAmarillo ?? 5),
        activo: row.activo !== false,
        display: REGLA_DISPLAY[tipo] || tipo
    };
}

function todayIsoBogota() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
}

module.exports = {
    REGLA_TIPOS,
    REGLA_DISPLAY,
    cutoffCycleDates,
    monthRangeDates,
    resolvePeriodoForCliente,
    daysUntilCutoff,
    cutoffLabelFromDays,
    resolveBillingMonthForToday,
    mapConfigRow,
    todayIsoBogota
};
