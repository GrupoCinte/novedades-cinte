'use strict';

const { computeHoraExtraSplitBogota, resolveHoraExtraLabel } = require('./heBogotaSplit');

function round2(n) {
    return Number(Number(n || 0).toFixed(2));
}

/**
 * @param {{ mallaOrigenRef?: string|null }} it
 * @returns {boolean}
 */
function isMallaOrigenNovedad(it) {
    return Boolean(String(it?.mallaOrigenRef || '').trim());
}

/**
 * Etiqueta tipo_hora_extra para novedades generadas desde malla (solo recargos).
 * @param {{ horasRecargoNocturno?: number, horasRecargoDomingoDiurnas?: number, horasRecargoDomingoNocturnas?: number }} payload
 * @returns {string|null}
 */
function resolveMallaRecargoLabel(payload) {
    const n = Number(payload?.horasRecargoNocturno || 0);
    const d = Number(payload?.horasRecargoDomingoDiurnas || 0);
    const dn = Number(payload?.horasRecargoDomingoNocturnas || 0);
    const kinds = [d > 0, dn > 0, n > 0].filter(Boolean).length;
    if (kinds === 0) return null;
    if (kinds > 1) return 'Recargos mixtos';
    if (n > 0) return 'Recargo nocturno';
    if (d > 0) return 'Recargo dominical diurno';
    return 'Recargo dominical nocturno';
}

/**
 * Convierte segmentación temporal HE en payload de recargos para mallas/turnos.
 * Omite horas diurnas planificadas en día hábil; mapea tramo 19:00–06:00 a recargo nocturno.
 *
 * @param {number} startMs
 * @param {number} endMs
 * @param {Set<string>} festivosSet
 * @returns {{
 *   skip: boolean,
 *   cantidadHoras: number,
 *   horasDiurnas: number,
 *   horasNocturnas: number,
 *   horasRecargoDomingo: number,
 *   horasRecargoDomingoDiurnas: number,
 *   horasRecargoDomingoNocturnas: number,
 *   horasRecargoNocturno: number,
 *   tipoHoraExtra: string|null
 * }}
 */
function computeMallaRecargoPayload(startMs, endMs, festivosSet) {
    const split = computeHoraExtraSplitBogota(startMs, endMs, festivosSet);
    const hasRecargoDom =
        split.horasRecargoDomingo > 0 ||
        split.horasRecargoDomingoDiurnas > 0 ||
        split.horasRecargoDomingoNocturnas > 0;

    let horasRecargoDomingoDiurnas = 0;
    let horasRecargoDomingoNocturnas = 0;
    let horasRecargoNocturno = 0;
    let horasDiurnas = 0;
    let horasNocturnas = 0;
    let tipoHoraExtra = null;

    if (hasRecargoDom) {
        // Domingo/festivo: primeras 7,33 h = recargo dominical; el resto = hora extra tipificada estándar.
        horasRecargoDomingoDiurnas = round2(split.horasRecargoDomingoDiurnas);
        horasRecargoDomingoNocturnas = round2(split.horasRecargoDomingoNocturnas);
        horasDiurnas = round2(split.diurnas);
        horasNocturnas = round2(split.nocturnas);
        tipoHoraExtra = resolveHoraExtraLabel(
            horasDiurnas,
            horasNocturnas,
            horasRecargoDomingoDiurnas,
            horasRecargoDomingoNocturnas
        );
    } else {
        // Día hábil: solo recargo nocturno (las diurnas planificadas no se pagan).
        horasRecargoNocturno = round2(split.nocturnas);
        tipoHoraExtra = resolveMallaRecargoLabel({
            horasRecargoNocturno,
            horasRecargoDomingoDiurnas,
            horasRecargoDomingoNocturnas
        });
    }

    const horasRecargoDomingo = round2(horasRecargoDomingoDiurnas + horasRecargoDomingoNocturnas);
    const cantidadHoras = round2(horasDiurnas + horasNocturnas + horasRecargoDomingo + horasRecargoNocturno);
    const skip = cantidadHoras <= 0;

    return {
        skip,
        cantidadHoras,
        horasDiurnas,
        horasNocturnas,
        horasRecargoDomingo,
        horasRecargoDomingoDiurnas,
        horasRecargoDomingoNocturnas,
        horasRecargoNocturno,
        tipoHoraExtra: skip ? null : tipoHoraExtra
    };
}

module.exports = {
    computeMallaRecargoPayload,
    resolveMallaRecargoLabel,
    isMallaOrigenNovedad
};
