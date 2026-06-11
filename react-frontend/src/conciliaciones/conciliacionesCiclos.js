/** Espejo frontend de src/conciliaciones/conciliacionesCiclos.js */

export const REGLA_TIPOS = ['HORAS_BASE', 'CALENDARIO_30', 'DIAS_HABILES', 'MES_CALENDARIO'];

export const REGLA_DISPLAY = {
    HORAS_BASE: 'Horas base',
    CALENDARIO_30: 'Calendario 30',
    DIAS_HABILES: 'Días hábiles',
    MES_CALENDARIO: 'Mes calendario'
};

function pad2(n) {
    return String(n).padStart(2, '0');
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
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function cutoffCycleDates({ year, month, diaCorte }) {
    const y = Number(year);
    const m = Number(month);
    const cut = Number(diaCorte);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;

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

    return { start, end, cycleLabel: `${start} – ${end}` };
}

export function formatPeriodoEs(iso) {
    const p = parseIsoDate(iso);
    if (!p) return iso;
    return `${pad2(p.day)}/${pad2(p.month)}/${p.year}`;
}

export function formatPeriodoRangeEs(periodo) {
    if (!periodo?.start || !periodo?.end) return '';
    return `${formatPeriodoEs(periodo.start)} – ${formatPeriodoEs(periodo.end)}`;
}
