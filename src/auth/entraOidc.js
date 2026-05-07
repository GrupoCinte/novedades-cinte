/**
 * Microsoft Entra ID — OIDC v2 (authorization code + id_token).
 * Valida `id_token` con JWKS público (sin secretos en repo).
 */

const crypto = require('node:crypto');

function entraAuthorityBase(tenantId, authorityHost) {
    const host = String(authorityHost || 'login.microsoftonline.com').replace(/\/+$/, '');
    const tid = String(tenantId || '').trim();
    /** Base HTTPS del tenant (authorize/token); sin `/v2.0` al final. */
    const oauthBase = tid ? `https://${host}/${tid}` : '';
    /** Issuer del id_token (validación JWT). */
    const issuer = tid ? `https://${host}/${tid}/v2.0` : '';
    return { host, tid, oauthBase, issuer };
}

function buildAuthorizeUrl({
    tenantId,
    clientId,
    redirectUri,
    state,
    scope = 'openid profile email',
    authorityHost
}) {
    const { oauthBase } = entraAuthorityBase(tenantId, authorityHost);
    const params = new URLSearchParams({
        client_id: String(clientId || '').trim(),
        response_type: 'code',
        redirect_uri: String(redirectUri || '').trim(),
        response_mode: 'query',
        scope: String(scope || '').trim(),
        state: String(state || '').trim()
    });
    return `${oauthBase}/oauth2/v2.0/authorize?${params.toString()}`;
}

async function exchangeAuthorizationCode({
    tenantId,
    clientId,
    clientSecret,
    redirectUri,
    code,
    authorityHost
}) {
    const { oauthBase } = entraAuthorityBase(tenantId, authorityHost);
    const tokenUrl = `${oauthBase}/oauth2/v2.0/token`;
    const body = new URLSearchParams({
        client_id: String(clientId || '').trim(),
        client_secret: String(clientSecret || '').trim(),
        grant_type: 'authorization_code',
        code: String(code || '').trim(),
        redirect_uri: String(redirectUri || '').trim()
    });
    const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });
    const text = await res.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { raw: text.slice(0, 200) };
    }
    if (!res.ok) {
        const err = new Error(data.error_description || data.error || `Token HTTP ${res.status}`);
        err.status = res.status;
        err.details = data;
        throw err;
    }
    return data;
}

/**
 * @param {string} idToken
 * @param {{ tenantId: string, clientId: string, authorityHost?: string }} opts
 * @returns {Promise<import('jose').JWTPayload>}
 */
async function verifyMicrosoftIdToken(idToken, opts) {
    const { createRemoteJWKSet, jwtVerify } = await import('jose');
    const { issuer, host, tid } = entraAuthorityBase(opts.tenantId, opts.authorityHost);
    const clientId = String(opts.clientId || '').trim();
    const jwksUri = `https://${host}/${tid}/discovery/v2.0/keys`;
    const JWKS = createRemoteJWKSet(new URL(jwksUri));
    const { payload } = await jwtVerify(idToken, JWKS, {
        issuer,
        audience: clientId
    });
    return payload;
}

function extractEmailFromIdClaims(payload = {}) {
    const email = String(payload.email || '').trim().toLowerCase();
    if (email) return email;
    const pref = String(payload.preferred_username || '').trim();
    if (pref.includes('@')) return pref.toLowerCase();
    const upn = String(payload.upn || '').trim();
    if (upn.includes('@')) return upn.toLowerCase();
    return '';
}

function randomState() {
    return crypto.randomBytes(24).toString('hex');
}

/**
 * Genera la URL de logout de Microsoft Entra ID (Single Sign-Out).
 * Tras revocar la sesión local, redirigir al usuario a esta URL para
 * que Microsoft también cierre la sesión en todas sus apps.
 *
 * @param {{ tenantId: string, clientId: string, postLogoutRedirectUri: string, authorityHost?: string }} opts
 * @returns {string} URL de logout de Microsoft
 */
function buildLogoutUrl({ tenantId, clientId, postLogoutRedirectUri, authorityHost }) {
    const { oauthBase } = entraAuthorityBase(tenantId, authorityHost);
    const params = new URLSearchParams({
        client_id: String(clientId || '').trim(),
        post_logout_redirect_uri: String(postLogoutRedirectUri || '').trim()
    });
    return `${oauthBase}/oauth2/v2.0/logout?${params.toString()}`;
}

module.exports = {
    buildAuthorizeUrl,
    buildLogoutUrl,
    exchangeAuthorizationCode,
    verifyMicrosoftIdToken,
    extractEmailFromIdClaims,
    randomState,
    entraAuthorityBase
};
