const crypto = require('crypto');
const { decodeJwtPayload } = require('./utils');

/** jti -> expira en ms (revocación de sesión app JWT, LOW-005). */
const revokedAppJtis = new Map();

function sweepRevokedJtis() {
    const now = Date.now();
    for (const [jti, until] of revokedAppJtis) {
        if (until <= now) revokedAppJtis.delete(jti);
    }
}
setInterval(sweepRevokedJtis, 60_000).unref?.();

function createAuthHelpers(deps) {
    const {
        jwt,
        SECRET_KEY,
        COGNITO_ENABLED,
        COGNITO_REGION,
        COGNITO_APP_CLIENT_ID,
        COGNITO_APP_CLIENT_SECRET,
        cognitoIdVerifier,
        cognitoAccessVerifier,
        POLICY,
        normalizeRoleOrNull,
        resolveRoleFromGroups,
        getAreaFromRole
    } = deps;

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

    function resolveEffectiveRole(baseRole, requestedRoleRaw = '') {
        const requested = normalizeRoleOrNull(requestedRoleRaw);
        const base = normalizeRoleOrNull(baseRole);
        if (!base) {
            const err = new Error('Rol base no válido para autenticación');
            err.status = 403;
            throw err;
        }
        if (!requested) return base;
        if (base === 'super_admin') return requested;
        if (requested !== base) {
            const err = new Error('No autorizado para ingresar con ese rol');
            err.status = 403;
            throw err;
        }
        return base;
    }

    function buildAuthUserByRole(baseUser = {}, effectiveRole = '', loginIdentity = '') {
        const role = normalizeRoleOrNull(effectiveRole || baseUser.role) || '';
        const area = getAreaFromRole(role);
        const login = String(loginIdentity || '').trim();
        const emailRaw = String(baseUser.email || '').trim();
        const usernameRaw = String(baseUser.username || '').trim();
        const email =
            emailRaw
            || (usernameRaw.includes('@') ? usernameRaw : '')
            || (login.includes('@') ? login : '');
        return {
            id: baseUser.sub || baseUser.id || '',
            email,
            username: usernameRaw || login || emailRaw,
            name: baseUser.name || baseUser.full_name || email || usernameRaw,
            role,
            area,
            panels: POLICY[role]?.panels || []
        };
    }

    function issueAppTokenFromCognito(baseUser = {}, authResult = {}, effectiveRole = '', loginIdentity = '') {
        const user = buildAuthUserByRole(baseUser, effectiveRole, loginIdentity);
        let expiresInSec = Number(authResult.ExpiresIn);
        if (!Number.isFinite(expiresInSec) || expiresInSec <= 0) {
            expiresInSec = 3600;
        }
        const jti = crypto.randomUUID();
        const token = jwt.sign(
            {
                sub: user.id,
                email: user.email,
                username: user.username,
                name: user.name,
                role: user.role,
                area: user.area,
                panels: user.panels,
                baseRole: baseUser.role || user.role,
                authProvider: 'cognito_app',
                jti
            },
            SECRET_KEY,
            { expiresIn: `${expiresInSec}s` }
        );
        return { token, user, expiresInSec };
    }

    function issueAppTokenForEntraConsultor(colaboradorRow = {}, entraSub = '', emailNorm = '') {
        const role = 'consultor';
        const area = getAreaFromRole(role);
        const panels = POLICY[role]?.panels || [];
        const cedula = String(colaboradorRow.cedula || '').trim();
        const nombre = String(colaboradorRow.nombre || '').trim();
        const email = String(emailNorm || '').trim().toLowerCase();
        const sub = String(entraSub || '').trim();
        let expiresInSec = Number(process.env.CONSULTOR_SESSION_TTL_SEC || 28800);
        if (!Number.isFinite(expiresInSec) || expiresInSec <= 0) expiresInSec = 28800;
        const jti = crypto.randomUUID();
        const token = jwt.sign(
            {
                sub,
                email,
                username: email,
                name: nombre || email,
                role,
                area,
                panels,
                cedula,
                authProvider: 'entra_consultor',
                jti
            },
            SECRET_KEY,
            { expiresIn: `${expiresInSec}s` }
        );
        const user = {
            sub,
            email,
            username: email,
            name: nombre || email,
            role,
            area,
            panels,
            cedula,
            authProvider: 'entra_consultor'
        };
        return { token, user, expiresInSec };
    }

    function requireEntraConsultor(req, res, next) {
        if (req.user?.authProvider === 'entra_consultor' && normalizeRoleOrNull(req.user?.role) === 'consultor') {
            return next();
        }
        return res.status(403).json({
            ok: false,
            error: 'Debes iniciar sesión con Microsoft como consultor para esta acción.'
        });
    }

    function requireCatalogConsultorOrStaff(req, res, next) {
        const ap = String(req.user?.authProvider || '');
        const role = normalizeRoleOrNull(req.user?.role);
        if (ap === 'entra_consultor' && role === 'consultor') return next();
        if ((ap === 'cognito_app' || ap === 'cognito') && role && POLICY[role]) return next();
        /** Tests y mocks sin `authProvider` explícito pero con rol en POLICY. */
        if (!ap && role && POLICY[role]) return next();
        return res.status(403).json({ ok: false, error: 'Autenticación requerida para catálogos.' });
    }

    function buildUserFromCognitoClaims(claims = {}) {
        const groups = claims['cognito:groups'];
        const roleFromGroups = resolveRoleFromGroups(groups);
        const roleFromClaims = normalizeRoleOrNull(claims['custom:role'] || claims.role);
        const role = roleFromGroups || roleFromClaims || '';
        if (!role) {
            const err = new Error('Usuario Cognito sin rol asignado. Agrega el usuario a un grupo (super_admin/cac/admin_ch/team_ch/gp/comercial/nomina).');
            err.status = 403;
            throw err;
        }
        const area = getAreaFromRole(role);
        const cognitoUsername = String(claims['cognito:username'] || '').trim();
        const emailClaim = String(claims.email || claims['email'] || '').trim();
        const emailResolved = emailClaim || (cognitoUsername.includes('@') ? cognitoUsername : '');
        return {
            sub: claims.sub,
            email: emailResolved,
            username: cognitoUsername || emailClaim || '',
            name: claims.name || emailResolved || cognitoUsername || '',
            role,
            area,
            panels: POLICY[role]?.panels || [],
            pwdv: 0,
            authProvider: 'cognito'
        };
    }

    async function verifyCognitoToken(token) {
        if (!COGNITO_ENABLED || !cognitoIdVerifier || !cognitoAccessVerifier) return null;
        try {
            const idClaims = await cognitoIdVerifier.verify(token);
            return buildUserFromCognitoClaims(idClaims);
        } catch {
            // continue to access-token verification
        }
        try {
            const accessClaims = await cognitoAccessVerifier.verify(token);
            return buildUserFromCognitoClaims(accessClaims);
        } catch {
            return null;
        }
    }

    function buildCognitoSecretHash(username) {
        if (!COGNITO_APP_CLIENT_SECRET) return '';
        return crypto
            .createHmac('sha256', COGNITO_APP_CLIENT_SECRET)
            .update(`${username}${COGNITO_APP_CLIENT_ID}`)
            .digest('base64');
    }

    async function cognitoPublicApi(target, body) {
        if (!COGNITO_REGION || !COGNITO_APP_CLIENT_ID) {
            throw new Error('Falta configuración de Cognito en servidor');
        }
        const endpoint = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`
            },
            body: JSON.stringify(body)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const message = data?.message || data?.Message || data?.__type || `Error Cognito ${res.status}`;
            const err = new Error(String(message));
            err.status = res.status;
            throw err;
        }
        // Algunos proxies / respuestas anómalas devuelven 200 con cuerpo de excepción AWS.
        if (data && data.__type && /Exception$/i.test(String(data.__type))) {
            const message = data?.message || data?.Message || data.__type;
            const err = new Error(String(message));
            err.status = 400;
            throw err;
        }
        return data;
    }

    async function verificarToken(req, res, next) {
        const authHeader = req.headers.authorization || '';
        const [, bearerToken] = authHeader.split(' ');
        const cookieToken = readCookieValue(req.headers.cookie, 'cinteSession');
        const token = String(bearerToken || cookieToken || '').trim();
        if (!token) return res.status(401).json({ ok: false, error: 'Acceso denegado. Token no proporcionado.' });
        try {
            req.authToken = token;
            let userClaims = await verifyCognitoToken(token);
            if (!userClaims) {
                userClaims = jwt.verify(token, SECRET_KEY);
                const ap = String(userClaims?.authProvider || '');
                if (ap !== 'cognito_app' && ap !== 'entra_consultor') {
                    throw new Error('Token de aplicación inválido');
                }
                const jti = String(userClaims.jti || '').trim();
                if (jti && revokedAppJtis.has(jti)) {
                    throw new Error('Token revocado');
                }
            }
            const payloadFromToken = decodeJwtPayload(token) || {};
            const emailNorm =
                String(userClaims.email || '').trim()
                || (String(userClaims.username || '').includes('@') ? String(userClaims.username).trim() : '')
                || String(payloadFromToken.email || '').trim()
                || (String(payloadFromToken.preferred_username || '').includes('@')
                    ? String(payloadFromToken.preferred_username).trim()
                    : '')
                || (String(payloadFromToken.username || '').includes('@') ? String(payloadFromToken.username).trim() : '')
                || (String(payloadFromToken['cognito:username'] || '').includes('@')
                    ? String(payloadFromToken['cognito:username']).trim()
                    : '');
            req.user = { ...userClaims, email: emailNorm };
            return next();
        } catch {
            return res.status(403).json({ ok: false, error: 'Token invalido o expirado.' });
        }
    }

    function allowPanel(panel) {
        return (req, res, next) => {
            const role = req.user?.role;
            const conf = POLICY[role];
            if (!conf) return res.status(403).json({ ok: false, error: 'Rol no autorizado' });
            if (!conf.panels.includes(panel)) return res.status(403).json({ ok: false, error: `Sin permiso para el panel: ${panel}` });
            return next();
        };
    }

    function allowAnyPanel(panels) {
        return (req, res, next) => {
            const role = req.user?.role;
            const conf = POLICY[role];
            if (!conf) return res.status(403).json({ ok: false, error: 'Rol no autorizado' });
            const ok = panels.some((p) => conf.panels.includes(p));
            if (!ok) return res.status(403).json({ ok: false, error: 'Sin permisos para esta operación' });
            return next();
        };
    }

    function allowRoles(roles) {
        const allowed = new Set(
            (Array.isArray(roles) ? roles : [])
                .map((r) => normalizeRoleOrNull(r))
                .filter(Boolean)
        );
        return (req, res, next) => {
            const role = normalizeRoleOrNull(req.user?.role);
            if (!role || !allowed.has(role)) {
                return res.status(403).json({ ok: false, error: 'Sin permisos para esta operación' });
            }
            return next();
        };
    }

    /**
     * Invalida el JWT de aplicación actual (cookie o Bearer) hasta su expiración natural.
     */
    function revokeAppSessionToken(token) {
        if (!token || typeof token !== 'string') return;
        try {
            const payload = jwt.decode(token);
            const ap = String(payload?.authProvider || '');
            if (ap !== 'cognito_app' && ap !== 'entra_consultor') return;
            const jti = String(payload.jti || '').trim();
            if (!jti) return;
            const expMs = typeof payload.exp === 'number' ? payload.exp * 1000 : Date.now() + 8 * 3600 * 1000;
            revokedAppJtis.set(jti, Math.max(expMs, Date.now() + 60_000));
        } catch {
            // token inválido: nada que revocar
        }
    }

    function applyScope(req, res, next) {
        const role = req.user?.role || '';
        const conf = POLICY[role] || {};
        const userArea = (req.user?.area && String(req.user.area).trim()) || '';
        const subRaw = String(req.user?.sub || '').trim();
        const emailRaw = String(req.user?.email || '')
            .trim()
            .toLowerCase();
        const isUuidSub = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(subRaw);
        req.scope = {
            role,
            canViewAllAreas: Boolean(conf.viewAllAreas),
            areas: userArea ? [userArea] : [],
            gpUserId: role === 'gp' && isUuidSub ? subRaw : null,
            gpEmail: role === 'gp' && emailRaw ? emailRaw : null
        };
        return next();
    }

    return {
        resolveEffectiveRole,
        issueAppTokenFromCognito,
        issueAppTokenForEntraConsultor,
        requireEntraConsultor,
        requireCatalogConsultorOrStaff,
        buildUserFromCognitoClaims,
        buildCognitoSecretHash,
        cognitoPublicApi,
        verificarToken,
        allowPanel,
        allowAnyPanel,
        allowRoles,
        applyScope,
        revokeAppSessionToken
    };
}

module.exports = { createAuthHelpers };
