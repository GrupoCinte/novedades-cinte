'use strict';

const { countBusinessDaysInMonth } = require('./conciliacionDiasBaseMes');

/**
 * Transición Ley 2101: jornada semanal al último día del mes de facturación.
 * 2023-07-15 → 47; 2024-07-15 → 46; 2025-07-15 → 44; 2026-07-15 → 42.
 */
const JORNADA_SEMANAL_TRANSICIONES = [
    { desde: '2026-07-15', horas: 42 },
    { desde: '2025-07-15', horas: 44 },
    { desde: '2024-07-15', horas: 46 },
    { desde: '2023-07-15', horas: 47 }
];
const JORNADA_SEMANAL_DEFAULT = 48;
const DIAS_HABILES_SEMANA = 5;

function lastDayOfMonthYmd(year, month) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return '';
    const dim = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(dim).padStart(2, '0')}`;
}

function resolveJornadaSemanalHoras(ymd) {
    const key = String(ymd || '').trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return JORNADA_SEMANAL_DEFAULT;
    for (const t of JORNADA_SEMANAL_TRANSICIONES) {
        if (key >= t.desde) return t.horas;
    }
    return JORNADA_SEMANAL_DEFAULT;
}

function horasPorDiaJornadaReforma(jornadaSemanal) {
    const j = Number(jornadaSemanal);
    if (!Number.isFinite(j) || j <= 0) return 0;
    return j / DIAS_HABILES_SEMANA;
}

/**
 * Horas laborables del mes = días hábiles (lun–vie menos festivos) × (jornada semanal / 5).
 */
function resolveHorasLaborablesMes({ year, month, festivosSet = null } = {}) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return 0;
    const jornada = resolveJornadaSemanalHoras(lastDayOfMonthYmd(y, m));
    const horasDia = horasPorDiaJornadaReforma(jornada);
    const diasHabiles = countBusinessDaysInMonth(y, m, festivosSet);
    return Math.round(diasHabiles * horasDia * 100) / 100;
}

function factYearMonthFromOptions(options = {}) {
    const y = Number(options.factAnio ?? options.factYear ?? options.anio ?? options.year);
    const m = Number(options.factMes ?? options.factMonth ?? options.mes ?? options.month);
    return { year: y, month: m };
}

module.exports = {
    JORNADA_SEMANAL_TRANSICIONES,
    JORNADA_SEMANAL_DEFAULT,
    DIAS_HABILES_SEMANA,
    lastDayOfMonthYmd,
    resolveJornadaSemanalHoras,
    horasPorDiaJornadaReforma,
    resolveHorasLaborablesMes,
    factYearMonthFromOptions
};
