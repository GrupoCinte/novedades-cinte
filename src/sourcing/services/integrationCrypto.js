'use strict';

const crypto = require('crypto');

const PROVIDERS = new Set(['elempleo', 'linkedin']);

function getEncryptionKey() {
    const secret = String(
        process.env.SOURCING_INTEGRATION_SECRET
        || process.env.JWT_SECRET
        || process.env.SOURCING_WORKER_CALLBACK_SECRET
        || 'local-sourcing-dev'
    ).trim();
    return crypto.createHash('sha256').update(secret).digest();
}

function encryptJson(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
    const plain = Buffer.from(JSON.stringify(value), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function decryptJson(blob) {
    if (!blob) return null;
    try {
        const buf = Buffer.from(String(blob), 'base64');
        const iv = buf.subarray(0, 12);
        const tag = buf.subarray(12, 28);
        const enc = buf.subarray(28);
        const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
        decipher.setAuthTag(tag);
        const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
        return JSON.parse(plain.toString('utf8'));
    } catch {
        return null;
    }
}

function normalizeProvider(raw) {
    const provider = String(raw || '').trim().toLowerCase();
    if (!PROVIDERS.has(provider)) {
        throw new Error(`Proveedor inválido: ${raw}`);
    }
    return provider;
}

module.exports = {
    PROVIDERS,
    encryptJson,
    decryptJson,
    normalizeProvider
};
