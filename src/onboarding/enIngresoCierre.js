'use strict';

const { extractCedulaFromRecord } = require('./tipoPersonalInfer');

const ACTIVOS_TIPOS = ['consultor', 'staff', 'sena'];

/**
 * Cédulas que ya figuran en Consultores / Staff / SENA activos
 * (misma regla de fecha que esas listas: ingreso hoy o pasado, o sin fecha).
 */
async function loadCedulasActivasEnMaestro(pool, cedulas) {
    const uniq = [...new Set((cedulas || []).map((c) => String(c || '').replace(/\D+/g, '')).filter(Boolean))];
    if (!uniq.length || !pool || typeof pool.query !== 'function') return new Set();
    const q = await pool.query(
        `SELECT cedula
         FROM colaboradores
         WHERE activo IS TRUE
           AND tipo_personal = ANY($2::text[])
           AND (fecha_ingreso IS NULL OR fecha_ingreso <= CURRENT_DATE)
           AND cedula = ANY($1::text[])`,
        [uniq, ACTIVOS_TIPOS]
    );
    return new Set((q.rows || []).map((r) => String(r.cedula)));
}

function annotateExecutionAlreadyActivo(execution, activoSet) {
    const cedula = extractCedulaFromRecord(execution);
    if (!cedula || !activoSet || !activoSet.has(cedula)) {
        return { ...execution, cedula: execution.cedula || cedula || undefined };
    }
    return {
        ...execution,
        cedula,
        alreadyActivo: true,
        statusId: 6
    };
}

async function annotateEnIngresoCerrado(pool, executions) {
    const list = Array.isArray(executions) ? executions : [];
    const cedulas = list.map((ex) => extractCedulaFromRecord(ex)).filter(Boolean);
    let activoSet = new Set();
    try {
        activoSet = await loadCedulasActivasEnMaestro(pool, cedulas);
    } catch (e) {
        console.warn('[En ingreso] no se pudo cruzar con el maestro:', e && e.message);
        return list.map((ex) => annotateExecutionAlreadyActivo(ex, new Set()));
    }
    return list.map((ex) => annotateExecutionAlreadyActivo(ex, activoSet));
}

module.exports = {
    loadCedulasActivasEnMaestro,
    annotateExecutionAlreadyActivo,
    annotateEnIngresoCerrado
};
