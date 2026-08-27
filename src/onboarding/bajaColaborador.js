'use strict';

const { closeContrato } = require('./colaboradorContratos');

/** Motivo por defecto al registrar baja vía ficha Zoho salida (catálogo onboarding). */
const DEFAULT_MOTIVO_BAJA_SALIDA_ZOHO = 'Termino de Servicio';

function isoDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const s = String(value).trim();
    return s.length >= 10 ? s.slice(0, 10) : s || null;
}

/**
 * Resuelve motivo_baja desde texto Zoho (termino) o catálogo; fallback estándar salida.
 * @param {import('pg').Pool} pool
 * @param {string|null|undefined} terminoRaw
 */
async function resolveMotivoBajaSalida(pool, terminoRaw) {
    const hint = String(terminoRaw || '').trim();
    if (hint) {
        const q = await pool.query(
            `SELECT motivo FROM cat_motivo_baja
             WHERE activo = TRUE
               AND LOWER(TRIM(motivo)) = LOWER(TRIM($1))
             LIMIT 1`,
            [hint]
        );
        if (q.rows[0]?.motivo) return String(q.rows[0].motivo);
    }
    const fallback = await pool.query(
        `SELECT motivo FROM cat_motivo_baja
         WHERE activo = TRUE AND motivo = $1
         LIMIT 1`,
        [DEFAULT_MOTIVO_BAJA_SALIDA_ZOHO]
    );
    if (fallback.rows[0]?.motivo) return String(fallback.rows[0].motivo);
    return DEFAULT_MOTIVO_BAJA_SALIDA_ZOHO;
}

/**
 * Cierra el contrato del cliente (manual o salida Zoho). La persona solo
 * queda inactiva si no le queda otro vigente.
 * @param {import('pg').Pool} pool
 * @param {string} cedulaRaw
 * @param {{ motivo_baja?: string, fecha_termino?: string|null, termino?: string|null, cliente?: string|null, contrato_id?: string|null }} opts
 */
async function applyRegistroBajaColaborador(pool, cedulaRaw, opts = {}) {
    const cedula = String(cedulaRaw || '').replace(/\D/g, '');
    if (!cedula) throw Object.assign(new Error('Cédula inválida'), { status: 400 });

    const motivo =
        opts.motivo_baja && String(opts.motivo_baja).trim()
            ? String(opts.motivo_baja).trim()
            : await resolveMotivoBajaSalida(pool, opts.termino);

    const catQ = await pool.query(
        `SELECT 1 FROM cat_motivo_baja WHERE motivo = $1 AND activo = TRUE LIMIT 1`,
        [motivo]
    );
    if (!catQ.rows.length) {
        throw Object.assign(new Error(`motivo_baja no está en el catálogo activo: ${motivo}`), {
            status: 400
        });
    }

    const fechaTermino = isoDate(opts.fecha_termino);
    if (!fechaTermino) {
        throw Object.assign(new Error('fecha_termino es obligatoria'), { status: 400 });
    }

    const closed = await closeContrato(pool, {
        cedula,
        cliente: opts.cliente,
        contratoId: opts.contrato_id || opts.contratoId,
        fechaTermino,
        motivo,
        termino: opts.termino || null,
        actor: opts.actor || null,
        origen: opts.origen || 'baja'
    });
    const person = closed.person || {};
    return {
        cedula,
        activo: closed.personActivo === true,
        motivo_baja: closed.personActivo ? null : person.motivo_baja || motivo,
        fecha_termino: person.fecha_termino || fechaTermino,
        contrato: closed.contrato,
        vigentes_restantes: closed.vigentesRestantes,
        action: closed.action
    };
}

module.exports = {
    DEFAULT_MOTIVO_BAJA_SALIDA_ZOHO,
    resolveMotivoBajaSalida,
    applyRegistroBajaColaborador,
    isoDate
};
