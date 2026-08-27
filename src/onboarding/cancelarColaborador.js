'use strict';

/**
 * Cancelado manual desde ficha (Consultores / Staff / SENA).
 * Sale de Activos y no entra a Bajas: cancelado=true, motivo_baja intacto (null).
 */

function digitsOnly(value) {
    return String(value || '').replace(/\D+/g, '');
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} cedulaRaw
 * @param {{ observaciones?: string|null }} [opts]
 */
async function applyCancelarColaborador(pool, cedulaRaw, opts = {}) {
    const cedula = digitsOnly(cedulaRaw);
    if (!cedula) throw Object.assign(new Error('Cédula inválida'), { status: 400 });

    const found = await pool.query(
        `SELECT cedula, activo, motivo_baja, cancelado
         FROM colaboradores WHERE cedula = $1 LIMIT 1`,
        [cedula]
    );
    const row = found.rows[0];
    if (!row) throw Object.assign(new Error('Colaborador no encontrado'), { status: 404 });
    if (row.cancelado === true) {
        throw Object.assign(new Error('Ya está en Cancelaciones'), { status: 409 });
    }
    if (row.motivo_baja) {
        throw Object.assign(new Error('Está en Bajas; no se cancela'), { status: 400 });
    }

    const obs = String(opts.observaciones || '').trim().slice(0, 2000) || null;

    await pool.query(
        `UPDATE colaborador_contratos
         SET vigente = FALSE,
             es_cabecera = FALSE,
             fecha_termino = COALESCE(fecha_termino, CURRENT_DATE),
             updated_at = NOW()
         WHERE cedula = $1 AND vigente IS TRUE`,
        [cedula]
    );

    const upd = await pool.query(
        `UPDATE colaboradores
         SET activo = FALSE,
             cancelado = TRUE,
             fecha_cancelacion = NOW(),
             obs_cancelacion = $2,
             updated_at = NOW()
         WHERE cedula = $1
         RETURNING cedula, nombre, cliente, tipo_personal, activo, cancelado,
                   fecha_cancelacion, obs_cancelacion, motivo_baja, fecha_ingreso, puesto`,
        [cedula, obs]
    );
    const person = upd.rows[0];
    if (!person) throw Object.assign(new Error('Colaborador no encontrado'), { status: 404 });

    return {
        cedula,
        activo: false,
        cancelado: true,
        motivo_baja: person.motivo_baja || null,
        fecha_cancelacion: person.fecha_cancelacion,
        obs_cancelacion: person.obs_cancelacion,
        item: person
    };
}

module.exports = { applyCancelarColaborador };
