'use strict';

const { toUtcMsFromDateAndTime } = require('./novedadHeTime');
const {
    computeHoraExtraGroupSplitBogota,
    collectRecargoDayKeysInInterval,
    resolveHoraExtraLabel
} = require('./heBogotaSplit');
const { mapSplitToMallaPersistedFields } = require('./mallaRecargoSplit');

/**
 * @param {object} row fila PG novedades
 * @returns {{ rowKey: string, startMs: number|null, endMs: number|null, isMalla: boolean }|null}
 */
function rowToGroupInput(row) {
    const id = String(row?.id || '').trim();
    if (!id) return null;
    const startMs = toUtcMsFromDateAndTime(row?.fecha_inicio, row?.hora_inicio);
    const endMs = toUtcMsFromDateAndTime(row?.fecha_fin, row?.hora_fin);
    if (startMs == null || endMs == null || !Number.isFinite(endMs - startMs) || endMs <= startMs) return null;
    return {
        rowKey: id,
        startMs,
        endMs,
        isMalla: Boolean(String(row?.malla_origen_ref || '').trim())
    };
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} cedulaNorm
 * @returns {Promise<object[]>}
 */
async function listHoraExtraRowsForCedula(pool, cedulaNorm) {
    const ced = String(cedulaNorm || '').trim();
    if (!ced) return [];
    const q = await pool.query(
        `SELECT id, cedula, fecha_inicio, fecha_fin, hora_inicio, hora_fin, malla_origen_ref
         FROM novedades
         WHERE cedula = $1
           AND lower(regexp_replace(trim(coalesce(tipo_novedad, '')), '\\s+', ' ', 'g')) = 'hora extra'
         ORDER BY creado_en ASC
         LIMIT 800`,
        [ced]
    );
    return q.rows || [];
}

/**
 * @param {ReturnType<typeof computeHoraExtraGroupSplitBogota> extends Map<string, infer S> ? S : never} split
 * @param {boolean} isMalla
 */
function mapSplitToPersistedFields(split, isMalla) {
    if (isMalla) return mapSplitToMallaPersistedFields(split);
    return {
        cantidadHoras: split.total,
        horasDiurnas: split.diurnas,
        horasNocturnas: split.nocturnas,
        horasRecargoDomingo: split.horasRecargoDomingo,
        horasRecargoDomingoDiurnas: split.horasRecargoDomingoDiurnas,
        horasRecargoDomingoNocturnas: split.horasRecargoDomingoNocturnas,
        horasRecargoNocturno: 0,
        tipoHoraExtra: resolveHoraExtraLabel(
            split.diurnas,
            split.nocturnas,
            split.horasRecargoDomingoDiurnas,
            split.horasRecargoDomingoNocturnas
        )
    };
}

/**
 * Recalcula y persiste horas HE del grupo (misma cédula) en domingos/festivos afectados.
 * @param {import('pg').Pool} pool
 * @param {string} cedulaNorm
 * @param {string[]} affectedDayKeys YYYY-MM-DD Bogotá
 * @param {Set<string>} festivosSet
 * @returns {Promise<{ updated: number }>}
 */
async function recomputeAndPersistDomingoRecargoGroup(pool, cedulaNorm, affectedDayKeys, festivosSet) {
    const daySet = new Set((affectedDayKeys || []).filter(Boolean));
    if (!daySet.size) return { updated: 0 };

    const rows = await listHoraExtraRowsForCedula(pool, cedulaNorm);
    const candidates = [];
    for (const row of rows) {
        const input = rowToGroupInput(row);
        if (!input) continue;
        const keys = collectRecargoDayKeysInInterval(input.startMs, input.endMs, festivosSet);
        if (keys.some((k) => daySet.has(k))) candidates.push({ row, input });
    }
    if (!candidates.length) return { updated: 0 };

    const groupInputs = candidates.map((c) => c.input);
    const splits = computeHoraExtraGroupSplitBogota(groupInputs, festivosSet);
    let updated = 0;

    for (const { row, input } of candidates) {
        const split = splits.get(input.rowKey);
        if (!split) continue;
        const fields = mapSplitToPersistedFields(split, input.isMalla);
        await pool.query(
            `UPDATE novedades SET
                cantidad_horas = $2,
                horas_diurnas = $3,
                horas_nocturnas = $4,
                horas_recargo_domingo = $5,
                horas_recargo_domingo_diurnas = $6,
                horas_recargo_domingo_nocturnas = $7,
                horas_recargo_nocturno = $8,
                tipo_hora_extra = $9
             WHERE id = $1::uuid`,
            [
                row.id,
                fields.cantidadHoras,
                fields.horasDiurnas,
                fields.horasNocturnas,
                fields.horasRecargoDomingo,
                fields.horasRecargoDomingoDiurnas,
                fields.horasRecargoDomingoNocturnas,
                fields.horasRecargoNocturno,
                fields.tipoHoraExtra
            ]
        );
        updated += 1;
    }
    return { updated };
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} cedulaNorm
 * @param {number|null} startMs
 * @param {number|null} endMs
 * @param {Set<string>} festivosSet
 */
async function triggerDomingoRecargoRecomputeForInterval(pool, cedulaNorm, startMs, endMs, festivosSet) {
    const dayKeys = collectRecargoDayKeysInInterval(startMs, endMs, festivosSet);
    if (!dayKeys.length) return { updated: 0 };
    return recomputeAndPersistDomingoRecargoGroup(pool, cedulaNorm, dayKeys, festivosSet);
}

module.exports = {
    rowToGroupInput,
    listHoraExtraRowsForCedula,
    mapSplitToPersistedFields,
    recomputeAndPersistDomingoRecargoGroup,
    triggerDomingoRecargoRecomputeForInterval
};
