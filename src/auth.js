const crypto = require('crypto');

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

    function buildAuthUserByRole(baseUser = {}, effectiveRole = '') {
        const role = normalizeRoleOrNull(effectiveRole || baseUser.role) || '';
        const area = getAreaFromRole(role);
        return {
            id: baseUser.sub || baseUser.id || '',
            email: baseUser.email || '',
            username: baseUser.username || '',
            name: baseUser.name || baseUser.full_name || '',
            role,
            area,
            panels: POLICY[role]?.panels || []
        };
    }

    function issueAppTokenFromCognito(baseUser = {}, authResult = {}, effectiveRole = '') {
        const user = buildAuthUserByRole(baseUser, effectiveRole);
        const expiresInSec = Number(authResult.ExpiresIn || 3600);
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
                authProvider: 'cognito_app'
            },
            SECRET_KEY,
            { expiresIn: `${expiresInSec}s` }
        );
        return { token, user, expiresInSec };
    }

    function buildUserFromCognitoClaims(claims = {}) {
        const groups = claims['cognito:groups'];
        const roleFromGroups = resolveRoleFromGroups(groups);
        const roleFromClaims = normalizeRoleOrNull(claims['custom:role'] || claims.role);
        const role = roleFromGroups || roleFromClaims || '';
        if (!role) {
            const err = new Error('Usuario Cognito sin rol asignado. Agrega el usuario a un grupo (super_admin/admin_ch/team_ch/admin_ops/gp/comercial/nomina/sst).');
            err.status = 403;
            throw err;
        }
        const area = getAreaFromRole(role);
        return {
            sub: claims.sub,
            email: claims.email || '',
            username: claims['cognito:username'] || claims.email || '',
            name: claims.name || claims.email || '',
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
        return data;
    }

    async function verificarToken(req, res, next) {
        const authHeader = req.headers.authorization || '';
        const [, token] = authHeader.split(' ');
        if (!token) return res.status(401).json({ ok: false, error: 'Acceso denegado. Token no proporcionado.' });
        try {
            req.authToken = token;
            let userClaims = await verifyCognitoToken(token);
            if (!userClaims) {
                userClaims = jwt.verify(token, SECRET_KEY);
                if (userClaims?.authProvider !== 'cognito_app') {
                    throw new Error('Token de aplicación inválido');
                }
            }
            req.user = userClaims;
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

    function applyScope(req, res, next) {
        const role = req.user?.role || '';
        const conf = POLICY[role] || {};
        const userArea = (req.user?.area && String(req.user.area).trim()) || '';
        req.scope = {
            role,
            canViewAllAreas: Boolean(conf.viewAllAreas),
            areas: userArea ? [userArea] : []
        };
        return next();
    }

    return {
        resolveEffectiveRole,
        issueAppTokenFromCognito,
        buildUserFromCognitoClaims,
        buildCognitoSecretHash,
        cognitoPublicApi,
        verificarToken,
        allowPanel,
        allowAnyPanel,
        allowRoles,
        applyScope
    };
}

module.exports = { createAuthHelpers };
