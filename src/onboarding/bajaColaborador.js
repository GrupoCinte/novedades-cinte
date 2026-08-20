'use strict';

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
 * Registra baja en maestro (misma semántica que PATCH /api/onboarding/personal/:cedula/baja).
 * @param {import('pg').Pool} pool
 * @param {string} cedulaRaw
 * @param {{ motivo_baja?: string, fecha_termino?: string|null, termino?: string|null }} opts
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
    const q = await pool.query(
        `UPDATE colaboradores SET
            activo = FALSE,
            motivo_baja = $1,
            termino = COALESCE($2, termino),
            fecha_termino = $3::date,
            tiempo_permanencia_meses = CASE
                WHEN fecha_ingreso IS NOT NULL
                THEN ROUND(
                    EXTRACT(EPOCH FROM (
                        $3::date::timestamp - fecha_ingreso::timestamp
                    )) / (60*60*24*30.4375), 2)
                ELSE tiempo_permanencia_meses
            END,
            updated_at = NOW()
         WHERE cedula = $4
         RETURNING cedula, activo, motivo_baja, fecha_termino`,
        [motivo, opts.termino || null, fechaTermino, cedula]
    );
    if (!q.rows[0]) throw Object.assign(new Error('Colaborador no encontrado'), { status: 404 });
    return q.rows[0];
}

module.exports = {
    DEFAULT_MOTIVO_BAJA_SALIDA_ZOHO,
    resolveMotivoBajaSalida,
    applyRegistroBajaColaborador,
    isoDate
};
