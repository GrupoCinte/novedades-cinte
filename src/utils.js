const crypto = require('crypto');

function parseDateOrNull(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.toUpperCase() === 'N/A') return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

function parseTimeOrNull(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
    if (!match) return null;
    const hh = match[1];
    const mm = match[2];
    const ss = match[3] || '00';
    return `${hh}:${mm}:${ss}`;
}

function parseIsoOrNull(value) {
    const raw = String(value || '').trim();
    if (!raw || raw.toUpperCase() === 'N/A') return null;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

function normalizeCatalogValue(value = '') {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Solo dígitos; vacío si no hay números (cédulas sin puntos ni comas). */
function normalizeCedula(value = '') {
    return String(value || '').replace(/\D/g, '');
}

function normalizeEstado(value) {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'aprobado') return 'Aprobado';
    if (v === 'rechazado') return 'Rechazado';
    return 'Pendiente';
}

function isStrongPassword(pw = '') {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(pw);
}

function sanitizeSegment(value = '') {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80) || 'anonimo';
}

function sanitizeFileName(value = '') {
    const safe = String(value || 'archivo.bin')
        .trim()
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return safe || 'archivo.bin';
}

function buildS3SupportKey(payload = {}, originalName = '') {
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const uploader = sanitizeSegment(payload.correoSolicitante || payload.nombre || 'anonimo');
    const originalSafe = sanitizeFileName(originalName);
    const stamp = now.toISOString().replace(/[-:.TZ]/g, '');
    const rnd = crypto.randomBytes(4).toString('hex');
    return `soportes/${yyyy}/${mm}/${uploader}/${stamp}_${rnd}_${originalSafe}`;
}

function decodeJwtPayload(token) {
    try {
        const parts = String(token || '').split('.');
        if (parts.length < 2) return null;
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
        const json = Buffer.from(padded, 'base64').toString('utf8');
        return JSON.parse(json);
    } catch {
        return null;
    }
}

module.exports = {
    parseDateOrNull,
    parseTimeOrNull,
    normalizeCatalogValue,
    normalizeCedula,
    normalizeEstado,
    isStrongPassword,
    sanitizeSegment,
    sanitizeFileName,
    buildS3SupportKey,
    decodeJwtPayload
};
