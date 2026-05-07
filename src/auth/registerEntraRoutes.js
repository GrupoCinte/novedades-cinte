const crypto = require('node:crypto');
const {
    buildAuthorizeUrl,
    buildLogoutUrl,
    exchangeAuthorizationCode,
    verifyMicrosoftIdToken,
    extractEmailFromIdClaims,
    randomState
} = require('./entraOidc');

function readCookieValue(cookieHeader, cookieName) {
    const raw = String(cookieHeader || '');
    if (!raw) return '';
    const parts = raw.split(';');
    for (const part of parts) {
        const [k, ...rest] = part.trim().split('=');
        if (k === cookieName) return decodeURIComponent(rest.join('=') || '');
    }
    return '';
}

function entraConfigFromEnv() {
    const tenantId = String(process.env.ENTRA_TENANT_ID || '').trim();
    const clientId = String(process.env.ENTRA_CLIENT_ID || '').trim();
    const clientSecret = String(process.env.ENTRA_CLIENT_SECRET || '').trim();
    const redirectUri = String(process.env.ENTRA_REDIRECT_URI || '').trim();
    const authorityHost = String(process.env.ENTRA_AUTHORITY_HOST || 'login.microsoftonline.com').trim();
    const ok = Boolean(tenantId && clientId && clientSecret && redirectUri);
    return { tenantId, clientId, clientSecret, redirectUri, authorityHost, ok };
}

/**
 * @param {import('express').Application} app
 * @param {{
 *   getColaboradorByEmail: (email: string) => Promise<object|null>,
 *   issueAppTokenForEntraConsultor: (row: object, entraSub: string, email: string) => { token: string, expiresInSec: number },
 *   revokeAppSessionToken: (token: string) => void,
 *   verificarToken: import('express').RequestHandler,
 *   FRONTEND_URL: string,
 *   secureCookie: boolean,
 *   sameSite: 'strict'|'lax',
 *   logger?: { warn?: Function, error?: Function }
 * }} deps
 */
function registerEntraRoutes(app, deps) {
    const {
        getColaboradorByEmail,
        issueAppTokenForEntraConsultor,
        revokeAppSessionToken,
        verificarToken,
        FRONTEND_URL,
        secureCookie,
        sameSite,
        logger
    } = deps;

    const STATE_COOKIE = 'entraOidcState';
    const STATE_MAX_AGE_MS = 12 * 60 * 1000;

    function setSessionCookie(res, token, maxAgeSec) {
        const ms = Number(maxAgeSec || 0) > 0 ? Number(maxAgeSec) * 1000 : 8 * 60 * 60 * 1000;
        res.cookie('cinteSession', token, {
            httpOnly: true,
            secure: secureCookie,
            sameSite,
            path: '/api',
            maxAge: ms
        });
    }

    function setXsrfCookie(res) {
        const value = crypto.randomUUID();
        res.cookie('cinteXsrf', value, {
            httpOnly: false,
            secure: secureCookie,
            sameSite,
            path: '/',
            maxAge: 8 * 60 * 60 * 1000
        });
    }

    app.get('/api/auth/entra/start', (req, res) => {
        const cfg = entraConfigFromEnv();
        const front = String(FRONTEND_URL || 'http://localhost:5175').replace(/\/+$/, '');
        if (!cfg.ok) {
            // Misma UX que el callback: volver al portal con código (evita JSON crudo en el navegador).
            return res.redirect(302, `${front}/?entra_error=${encodeURIComponent('not_configured')}`);
        }
        const state = randomState();
        res.cookie(STATE_COOKIE, state, {
            httpOnly: true,
            secure: secureCookie,
            sameSite,
            path: '/api',
            maxAge: STATE_MAX_AGE_MS
        });
        const url = buildAuthorizeUrl({
            tenantId: cfg.tenantId,
            clientId: cfg.clientId,
            redirectUri: cfg.redirectUri,
            state,
            authorityHost: cfg.authorityHost
        });
        return res.redirect(302, url);
    });

    app.get('/api/auth/entra/callback', async (req, res) => {
        const cfg = entraConfigFromEnv();
        const front = String(FRONTEND_URL || 'http://localhost:5175').replace(/\/+$/, '');
        const failRedirect = (code) => res.redirect(302, `${front}/?entra_error=${encodeURIComponent(code)}`);

        if (!cfg.ok) {
            return failRedirect('not_configured');
        }
        const qState = String(req.query?.state || '').trim();
        const cookieState = readCookieValue(req.headers.cookie, STATE_COOKIE).trim();
        res.clearCookie(STATE_COOKIE, { path: '/api', sameSite, secure: secureCookie });
        if (!qState || !cookieState || qState !== cookieState) {
            return failRedirect('state');
        }
        const code = String(req.query?.code || '').trim();
        if (!code) {
            const err = String(req.query?.error_description || req.query?.error || 'sin_code');
            logger?.warn?.(`[entra/callback] sin code: ${err}`);
            return failRedirect('login');
        }
        try {
            const tokenSet = await exchangeAuthorizationCode({
                tenantId: cfg.tenantId,
                clientId: cfg.clientId,
                clientSecret: cfg.clientSecret,
                redirectUri: cfg.redirectUri,
                code,
                authorityHost: cfg.authorityHost
            });
            const idToken = String(tokenSet.id_token || '').trim();
            if (!idToken) {
                return failRedirect('no_id_token');
            }
            const claims = await verifyMicrosoftIdToken(idToken, {
                tenantId: cfg.tenantId,
                clientId: cfg.clientId,
                authorityHost: cfg.authorityHost
            });
            const entraSub = String(claims.sub || '').trim();
            const email = extractEmailFromIdClaims(claims);
            if (!entraSub || !email) {
                return failRedirect('claims');
            }
            const row = await getColaboradorByEmail(email);
            if (!row) {
                return failRedirect('no_colaborador');
            }
            const { token, expiresInSec } = issueAppTokenForEntraConsultor(row, entraSub, email);
            setSessionCookie(res, token, expiresInSec);
            setXsrfCookie(res);
            return res.redirect(302, `${front}/`);
        } catch (e) {
            logger?.error?.(`[entra/callback] ${e?.message || e}`);
            return failRedirect('token');
        }
    });

    /**
     * GET /api/auth/entra/logout
     * Inicia el Single Sign-Out: revoca la sesión local y redirige a Microsoft
     * para que también cierre la sesión en todas las apps del tenant.
     * El consultor es redirigido aquí cuando hace clic en «Cerrar sesión».
     */
    app.get('/api/auth/entra/logout', (req, res) => {
        const front = String(FRONTEND_URL || 'http://localhost:5175').replace(/\/+$/, '');
        // Revocar el token de app si existe.
        const sessionToken = readCookieValue(req.headers.cookie, 'cinteSession').trim();
        if (sessionToken && typeof revokeAppSessionToken === 'function') {
            try { revokeAppSessionToken(sessionToken); } catch { /* ignorar */ }
        }
        // Limpiar cookies locales.
        res.clearCookie('cinteSession', { path: '/api', sameSite, secure: secureCookie });
        res.clearCookie('cinteXsrf', { path: '/', sameSite, secure: secureCookie });

        const cfg = entraConfigFromEnv();
        if (!cfg.ok) {
            // Si Entra no está configurado, redirigir al portal directamente.
            return res.redirect(302, `${front}/`);
        }
        // post_logout_redirect_uri: adónde vuelve el usuario tras el logout de Microsoft.
        // Debe estar registrado en Azure Portal → Autenticación → URIs de redirección.
        const postLogoutRedirectUri = `${front}/`;
        const logoutUrl = buildLogoutUrl({
            tenantId: cfg.tenantId,
            clientId: cfg.clientId,
            postLogoutRedirectUri,
            authorityHost: cfg.authorityHost
        });
        logger?.info?.('[entra/logout] Iniciando Single Sign-Out hacia Microsoft.');
        return res.redirect(302, logoutUrl);
    });

    /**
     * GET /api/auth/entra/front-channel-logout
     * Endpoint que Microsoft llama (front-channel) cuando el usuario cierra sesión
     * en OTRA app del mismo tenant (p. ej. Outlook, Teams).
     * Microsoft hace una petición GET a esta URL con el parámetro `sid` (session ID).
     * Nosotros respondemos 200 sin cuerpo para confirmar que recibimos la notificación.
     * La sesión local ya estará inactiva en la próxima petición a /api/me.
     *
     * Registrar esta URL en Azure Portal → Autenticación → Front-channel logout URL:
     *   https://novedades.grupocinte.com/api/auth/entra/front-channel-logout
     */
    app.get('/api/auth/entra/front-channel-logout', (req, res) => {
        // Microsoft envía `sid` y/o `iss`; no requerimos autenticación aquí
        // porque no tenemos acceso a las cookies de sesión del contexto de otra app.
        // Solo respondemos 200 para satisfacer el protocolo Front-Channel Logout.
        logger?.info?.('[entra/front-channel-logout] Notificación de logout recibida desde Microsoft.', {
            sid: req.query?.sid || null,
            iss: req.query?.iss || null
        });
        return res.status(200).end();
    });
}

module.exports = { registerEntraRoutes, entraConfigFromEnv };
