const { randomInt } = require('node:crypto');
const { normalizeCatalogValue } = require('./utils');

/**
 * Nombre para match Excel ↔ colaboradores (minúsculas, espacios colapsados).
 * @param {unknown} raw
 * @returns {string}
 */
function normalizeConsultorNombre(raw) {
    return String(raw == null ? '' : raw)
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * Clave estable para comparar nombres (Excel vs `colaboradores.nombre`): espacios, minúsculas, sin tildes.
 * Alineado con la idea de `foldForMatch` en cotizador/clienteNombreMatch.
 * @param {unknown} raw
 * @returns {string}
 */
function foldNombreForMatch(raw) {
    const t = normalizeCatalogValue(raw).toLowerCase();
    if (!t) return '';
    return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Resuelve correo, cliente y líder para POST /api/enviar-novedad: prioriza directorio si viene informado.
 * @param {Record<string, unknown>} body
 * @param {{ correo_cinte?: string|null, cliente?: string|null, lider_catalogo?: string|null }|null|undefined} colaborador
 * @param {(s: string) => string} normalizeCatalogValue
 * @returns {{ correo: string|null, cliente: string, lider: string, lockCorreo: boolean, lockCliente: boolean, lockLider: boolean }}
 */
function resolvePostedContactFromColaborador(body, colaborador, normalizeCatalogValue) {
    const emailFromDb = String(colaborador?.correo_cinte || '')
        .trim()
        .toLowerCase();
    const clienteFromDb = normalizeCatalogValue(String(colaborador?.cliente || ''));
    const liderFromDb = normalizeCatalogValue(String(colaborador?.lider_catalogo || ''));

    const bodyCorreo = String(body?.correoSolicitante || body?.correo || '')
        .trim()
        .toLowerCase();
    const bodyCliente = normalizeCatalogValue(String(body?.cliente || ''));
    const bodyLider = normalizeCatalogValue(String(body?.lider || ''));

    const lockCorreo = Boolean(emailFromDb);
    const lockCliente = Boolean(clienteFromDb);
    const lockLider = Boolean(liderFromDb);

    const correo = emailFromDb || (bodyCorreo ? bodyCorreo : null);
    const cliente = clienteFromDb || bodyCliente;
    const lider = liderFromDb || bodyLider;

    return { correo, cliente, lider, lockCorreo, lockCliente, lockLider };
}

/**
 * Genera una cadena de 8 dígitos para cédula sintética (ver docs/colaboradores-cedulas-sinteticas.md).
 * @returns {string}
 */
function randomSyntheticCedulaDigits() {
    return String(randomInt(10000000, 100000000));
}

/**
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }} pool
 * @param {number} [maxAttempts]
 * @returns {Promise<string>}
 */
async function allocateUniqueSyntheticCedula(pool, maxAttempts = 80) {
    for (let i = 0; i < maxAttempts; i += 1) {
        const c = randomSyntheticCedulaDigits();
        const q = await pool.query('SELECT 1 FROM colaboradores WHERE cedula = $1 LIMIT 1', [c]);
        if (!q.rows?.length) return c;
    }
    throw new Error('No se pudo asignar cédula sintética única tras varios intentos');
}

module.exports = {
    normalizeConsultorNombre,
    foldNombreForMatch,
    resolvePostedContactFromColaborador,
    randomSyntheticCedulaDigits,
    allocateUniqueSyntheticCedula
};
