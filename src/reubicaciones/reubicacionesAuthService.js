const { normalizeRoleOrNull } = require('../../src/rbac');

function getReubicacionesRole(req) {
    const r = req.user?.role || req.claims?.role;
    return normalizeRoleOrNull(r);
}

function userHasReubicacionesAccess(req) {
    const role = getReubicacionesRole(req);
    return ['super_admin', 'cac', 'admin_ch', 'team_ch', 'gp', 'atraccion_talento'].includes(role);
}

function reubicacionesGuard(req, res, next) {
    if (!userHasReubicacionesAccess(req)) {
        return res.status(403).json({ ok: false, error: 'No tienes permiso para acceder al módulo de Reubicaciones.' });
    }
    next();
}

module.exports = {
    getReubicacionesRole,
    userHasReubicacionesAccess,
    reubicacionesGuard
};
