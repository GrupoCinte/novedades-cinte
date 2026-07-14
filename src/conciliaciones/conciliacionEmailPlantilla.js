'use strict';

const {
    CONCILIACION_EMAIL_COLUMNS,
    getDefaultSelectedColumnKeys,
    DEFAULT_ASUNTO_TEMPLATE,
    DEFAULT_INTRO_TEMPLATE,
    DEFAULT_CIERRE_TEMPLATE
} = require('./conciliacionEmailColumns');

const TIPO_CORREO_LIDER = 'CORREO_LIDER';

function defaultPlantillaCorreoLider() {
    return {
        tipo: TIPO_CORREO_LIDER,
        asuntoTemplate: DEFAULT_ASUNTO_TEMPLATE,
        introTemplate: DEFAULT_INTRO_TEMPLATE,
        cierreTemplate: DEFAULT_CIERRE_TEMPLATE,
        columnasDefault: getDefaultSelectedColumnKeys(),
        columnasCatalogo: CONCILIACION_EMAIL_COLUMNS.map(({ key, label, defaultSelected }) => ({
            key,
            label,
            defaultSelected
        }))
    };
}

async function getCorreoLiderPlantilla(pool) {
    if (!pool) return defaultPlantillaCorreoLider();
    const q = await pool.query(
        `SELECT asunto_template, intro_template, cierre_template, columnas_default
         FROM conciliaciones_email_plantillas
         WHERE tipo = $1
         LIMIT 1`,
        [TIPO_CORREO_LIDER]
    );
    const row = q.rows[0];
    if (!row) return defaultPlantillaCorreoLider();
    const columnasDefault = Array.isArray(row.columnas_default)
        ? row.columnas_default
        : typeof row.columnas_default === 'string'
          ? JSON.parse(row.columnas_default)
          : getDefaultSelectedColumnKeys();
    return {
        tipo: TIPO_CORREO_LIDER,
        asuntoTemplate: row.asunto_template || DEFAULT_ASUNTO_TEMPLATE,
        introTemplate: row.intro_template || DEFAULT_INTRO_TEMPLATE,
        cierreTemplate: row.cierre_template || DEFAULT_CIERRE_TEMPLATE,
        columnasDefault,
        columnasCatalogo: CONCILIACION_EMAIL_COLUMNS.map(({ key, label, defaultSelected }) => ({
            key,
            label,
            defaultSelected
        }))
    };
}

async function upsertCorreoLiderPlantilla(pool, payload, actor) {
    if (!pool) {
        const error = new Error('Base de datos no disponible');
        error.status = 503;
        throw error;
    }
    const asuntoTemplate = String(payload?.asuntoTemplate || DEFAULT_ASUNTO_TEMPLATE).trim();
    const introTemplate = String(payload?.introTemplate || DEFAULT_INTRO_TEMPLATE).trim();
    const cierreTemplate = String(payload?.cierreTemplate || DEFAULT_CIERRE_TEMPLATE).trim();
    const columnasDefault = Array.isArray(payload?.columnasDefault)
        ? payload.columnasDefault
        : getDefaultSelectedColumnKeys();

    await pool.query(
        `INSERT INTO conciliaciones_email_plantillas
            (tipo, asunto_template, intro_template, cierre_template, columnas_default, updated_at, updated_by_email)
         VALUES ($1, $2, $3, $4, $5::jsonb, NOW(), $6)
         ON CONFLICT (tipo)
         DO UPDATE SET
            asunto_template = EXCLUDED.asunto_template,
            intro_template = EXCLUDED.intro_template,
            cierre_template = EXCLUDED.cierre_template,
            columnas_default = EXCLUDED.columnas_default,
            updated_at = NOW(),
            updated_by_email = EXCLUDED.updated_by_email`,
        [
            TIPO_CORREO_LIDER,
            asuntoTemplate,
            introTemplate,
            cierreTemplate,
            JSON.stringify(columnasDefault),
            String(actor?.email || '').trim() || null
        ]
    );

    return getCorreoLiderPlantilla(pool);
}

module.exports = {
    TIPO_CORREO_LIDER,
    defaultPlantillaCorreoLider,
    getCorreoLiderPlantilla,
    upsertCorreoLiderPlantilla
};
