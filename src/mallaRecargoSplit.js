'use strict';

const { computeHoraExtraSplitBogota, resolveHoraExtraLabel } = require('./heBogotaSplit');

function round2(n) {
    return Number(Number(n || 0).toFixed(2));
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
    if (d > 0 || dn > 0) {
        if (n > 0) return 'Mixta';
        return resolveHoraExtraLabel(0, 0, d, dn) || 'Diurna';
    }
    if (n > 0) return 'Nocturna';
    return null;
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

    if (hasRecargoDom) {
        horasRecargoDomingoDiurnas = round2(split.horasRecargoDomingoDiurnas + split.diurnas);
        horasRecargoDomingoNocturnas = round2(split.horasRecargoDomingoNocturnas);
        horasRecargoNocturno = round2(split.nocturnas);
    } else {
        horasRecargoNocturno = round2(split.nocturnas);
    }

    const horasRecargoDomingo = round2(horasRecargoDomingoDiurnas + horasRecargoDomingoNocturnas);
    const cantidadHoras = round2(horasRecargoNocturno + horasRecargoDomingo);
    const skip = cantidadHoras <= 0;

    const tipoHoraExtra = skip
        ? null
        : resolveMallaRecargoLabel({
              horasRecargoNocturno,
              horasRecargoDomingoDiurnas,
              horasRecargoDomingoNocturnas
          });

    return {
        skip,
        cantidadHoras,
        horasDiurnas: 0,
        horasNocturnas: 0,
        horasRecargoDomingo,
        horasRecargoDomingoDiurnas,
        horasRecargoDomingoNocturnas,
        horasRecargoNocturno,
        tipoHoraExtra
    };
}

module.exports = {
    computeMallaRecargoPayload,
    resolveMallaRecargoLabel
};
