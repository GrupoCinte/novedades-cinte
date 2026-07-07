'use strict';

const { encryptJson, decryptJson, normalizeProvider } = require('./services/integrationCrypto');

const PROVIDER_META = {
    elempleo: {
        label: 'El Empleo',
        descripcion: 'Base de candidatos empresarial de El Empleo Colombia.'
    },
    linkedin: {
        label: 'LinkedIn Recruiter',
        descripcion: 'Búsqueda directa y extracción de perfiles en LinkedIn.'
    }
};

const PUBLIC_SELECT = 'provider, estado, mensaje, connected_at, updated_at';

function parseUuidActor(sub) {
    const s = String(sub || '').trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) return s;
    return null;
}

function toPublicRow(row) {
    if (!row) return null;
    const meta = PROVIDER_META[row.provider] || {};
    return {
        provider: row.provider,
        label: meta.label || row.provider,
        descripcion: meta.descripcion || '',
        estado: row.estado,
        mensaje: row.mensaje || null,
        connected_at: row.connected_at,
        updated_at: row.updated_at,
        conectado: row.estado === 'conectado',
        /** Hay cookies guardadas aunque el último intento del worker haya fallado */
        sesion_disponible: row.estado === 'conectado' || row.estado === 'expirado'
    };
}

function createSourcingIntegrationsStore({ pool }) {
    if (!pool) throw new Error('createSourcingIntegrationsStore: falta pool');

    async function ensureProviderRow(provider) {
        const p = normalizeProvider(provider);
        await pool.query(
            `INSERT INTO sourcing_integraciones (provider, estado)
             VALUES ($1, 'desconectado')
             ON CONFLICT (provider) DO NOTHING`,
            [p]
        );
    }

    async function listIntegraciones() {
        for (const provider of Object.keys(PROVIDER_META)) {
            await ensureProviderRow(provider);
        }
        await pool.query(
            `UPDATE sourcing_integraciones
             SET estado = 'desconectado',
                 mensaje = 'Conexión no completada. Pulse «Conectar cuenta» de nuevo.',
                 updated_at = NOW()
             WHERE estado = 'conectando'
               AND updated_at < NOW() - INTERVAL '10 minutes'`
        );
        const q = await pool.query(
            `SELECT ${PUBLIC_SELECT}
             FROM sourcing_integraciones
             ORDER BY provider ASC`
        );
        return (q.rows || []).map(toPublicRow);
    }

    async function getIntegracion(provider) {
        await ensureProviderRow(provider);
        const p = normalizeProvider(provider);
        const q = await pool.query(
            `SELECT ${PUBLIC_SELECT}
             FROM sourcing_integraciones
             WHERE provider = $1`,
            [p]
        );
        return toPublicRow(q.rows[0] || null);
    }

    async function setIntegracionEstado(provider, { estado, mensaje = null, actorUserId = null } = {}) {
        const p = normalizeProvider(provider);
        await ensureProviderRow(p);
        const q = await pool.query(
            `UPDATE sourcing_integraciones
             SET estado = $2,
                 mensaje = $3,
                 connected_by = CASE WHEN $2 = 'conectado' THEN COALESCE($4::uuid, connected_by) ELSE connected_by END,
                 connected_at = CASE WHEN $2 = 'conectado' THEN NOW() ELSE connected_at END,
                 updated_at = NOW()
             WHERE provider = $1
             RETURNING ${PUBLIC_SELECT}`,
            [p, estado, mensaje, parseUuidActor(actorUserId)]
        );
        return toPublicRow(q.rows[0] || null);
    }

    async function saveIntegracionCookies(provider, cookies, { actorUserId = null, mensaje = null } = {}) {
        const p = normalizeProvider(provider);
        await ensureProviderRow(p);
        const enc = encryptJson(Array.isArray(cookies) ? cookies : []);
        const q = await pool.query(
            `UPDATE sourcing_integraciones
             SET estado = 'conectado',
                 cookies_enc = $2,
                 mensaje = COALESCE($3, 'Sesión conectada correctamente'),
                 connected_by = COALESCE($4::uuid, connected_by),
                 connected_at = NOW(),
                 updated_at = NOW()
             WHERE provider = $1
             RETURNING ${PUBLIC_SELECT}`,
            [p, enc, mensaje, parseUuidActor(actorUserId)]
        );
        return toPublicRow(q.rows[0] || null);
    }

    async function getIntegracionCookies(provider) {
        const p = normalizeProvider(provider);
        const q = await pool.query(
            `SELECT cookies_enc, estado FROM sourcing_integraciones WHERE provider = $1`,
            [p]
        );
        const row = q.rows[0];
        if (!row || !row.cookies_enc) return null;
        if (row.estado !== 'conectado' && row.estado !== 'expirado') return null;
        const cookies = decryptJson(row.cookies_enc);
        return Array.isArray(cookies) && cookies.length ? cookies : null;
    }

    async function disconnectIntegracion(provider) {
        const p = normalizeProvider(provider);
        await ensureProviderRow(p);
        const q = await pool.query(
            `UPDATE sourcing_integraciones
             SET estado = 'desconectado',
                 cookies_enc = NULL,
                 mensaje = 'Desconectado manualmente',
                 updated_at = NOW()
             WHERE provider = $1
             RETURNING ${PUBLIC_SELECT}`,
            [p]
        );
        return toPublicRow(q.rows[0] || null);
    }

    async function isProviderConnected(provider) {
        const cookies = await getIntegracionCookies(provider);
        return Boolean(cookies && cookies.length);
    }

    return {
        listIntegraciones,
        getIntegracion,
        setIntegracionEstado,
        saveIntegracionCookies,
        getIntegracionCookies,
        disconnectIntegracion,
        isProviderConnected,
        PROVIDER_META
    };
}

module.exports = { createSourcingIntegrationsStore, PROVIDER_META };
