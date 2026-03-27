const POLICY = {
    super_admin: { panels: ['dashboard', 'calendar', 'gestion', 'admin', 'contratacion'], viewAllAreas: true },
    admin_ch: { panels: ['dashboard', 'calendar', 'gestion', 'contratacion'] },
    team_ch: { panels: ['dashboard', 'calendar', 'gestion', 'contratacion'] },
    admin_ops: { panels: ['dashboard', 'calendar'] },
    gp: { panels: ['dashboard', 'calendar', 'gestion', 'contratacion'] },
    nomina: { panels: ['dashboard', 'calendar', 'gestion', 'contratacion'] },
    sst: { panels: ['dashboard', 'calendar', 'gestion'] }
};

const NOVELTY_RULES = {
    incapacidad: {
        displayName: 'Incapacidad',
        requiredMinSupports: 1,
        approvers: [],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'gp', 'nomina', 'sst']
    },
    calamidad_domestica: {
        displayName: 'Calamidad domestica',
        requiredMinSupports: 1,
        approvers: ['admin_ch', 'team_ch'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'gp']
    },
    permiso_remunerado: {
        displayName: 'Permiso remunerado',
        requiredMinSupports: 1,
        approvers: ['admin_ch', 'team_ch'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'gp']
    },
    licencia_luto: {
        displayName: 'Licencia de luto',
        requiredMinSupports: 1,
        approvers: ['admin_ch', 'team_ch'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'gp', 'nomina']
    },
    licencia_paternidad: {
        displayName: 'Licencia de paternidad',
        requiredMinSupports: 1,
        approvers: ['admin_ch', 'team_ch', 'nomina', 'gp'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'nomina', 'gp']
    },
    licencia_maternidad: {
        displayName: 'Licencia de maternidad',
        requiredMinSupports: 1,
        approvers: ['admin_ch', 'team_ch', 'nomina'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'nomina', 'gp']
    },
    licencia_remunerada: {
        displayName: 'Licencia remunerada',
        requiredMinSupports: 1,
        approvers: ['admin_ch', 'team_ch', 'gp'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'gp']
    },
    licencia_no_remunerada: {
        displayName: 'Licencia no remunerada',
        requiredMinSupports: 0,
        approvers: ['gp'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'nomina']
    },
    permiso_no_remunerado: {
        displayName: 'Permiso no remunerado',
        requiredMinSupports: 0,
        approvers: ['gp'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'nomina']
    },
    vacaciones_tiempo: {
        displayName: 'Vacaciones en tiempo',
        requiredMinSupports: 0,
        approvers: ['gp'],
        viewers: ['super_admin', 'gp', 'nomina']
    },
    vacaciones_dinero: {
        displayName: 'Vacaciones en dinero',
        requiredMinSupports: 1,
        approvers: ['admin_ch', 'team_ch'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'nomina']
    },
    hora_extra: {
        displayName: 'Hora Extra',
        requiredMinSupports: 0,
        approvers: ['gp'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'nomina', 'sst']
    },
    apoyo: {
        displayName: 'Apoyo',
        requiredMinSupports: 0,
        approvers: ['gp'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'nomina']
    },
    apoyo_standby: {
        displayName: 'Apoyo Standby',
        requiredMinSupports: 0,
        approvers: ['gp'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'nomina']
    },
    bonos: {
        displayName: 'Bonos',
        requiredMinSupports: 0,
        approvers: ['gp'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'nomina']
    },
    permiso_compensatorio_tiempo: {
        displayName: 'Permiso compensatorio en tiempo',
        requiredMinSupports: 1,
        approvers: ['gp'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'nomina']
    }
};

const ROLE_PRIORITY = require('../react-frontend/src/constants/rolePriority.json');

function normalizeRoleOrNull(value) {
    const v = String(value || '').trim().toLowerCase();
    if (ROLE_PRIORITY.includes(v)) return v;
    return null;
}

function resolveRoleFromGroups(groups = []) {
    const normalized = new Set(
        (Array.isArray(groups) ? groups : [])
            .map((g) => String(g || '').trim().toLowerCase())
    );
    return ROLE_PRIORITY.find((role) => normalized.has(role)) || '';
}

function getAreaFromRole(role) {
    if (role === 'super_admin') return 'Global';
    if (role === 'admin_ch' || role === 'team_ch') return 'Capital Humano';
    if (role === 'admin_ops' || role === 'gp') return 'Operaciones';
    if (role === 'nomina' || role === 'sst') return 'Capital Humano';
    return '';
}

function normalizeNovedadTypeKey(value = '') {
    const raw = String(value || '').trim().toLowerCase();
    const compact = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const map = {
        incapacidad: 'incapacidad',
        'calamidad domestica': 'calamidad_domestica',
        'permiso remunerado': 'permiso_remunerado',
        'licencia de luto': 'licencia_luto',
        'licencia por luto': 'licencia_luto',
        'licencia paternidad': 'licencia_paternidad',
        'licencia de paternidad': 'licencia_paternidad',
        'licencia maternidad': 'licencia_maternidad',
        'licencia de maternidad': 'licencia_maternidad',
        'licencia remunerada': 'licencia_remunerada',
        'licencia no remunerada': 'licencia_no_remunerada',
        'permiso no remunerado': 'permiso_no_remunerado',
        'permisos no remunerados': 'permiso_no_remunerado',
        'vacaciones en tiempo': 'vacaciones_tiempo',
        'vacaciones en dinero': 'vacaciones_dinero',
        'hora extra': 'hora_extra',
        apoyo: 'apoyo',
        'apoyo standby': 'apoyo_standby',
        'apoyo stand by': 'apoyo_standby',
        bono: 'bonos',
        bonos: 'bonos',
        'permiso compensatorio en tiempo': 'permiso_compensatorio_tiempo'
    };
    return map[compact] || '';
}

function getNovedadRuleByType(typeName = '') {
    const key = normalizeNovedadTypeKey(typeName);
    if (!key) return null;
    return { key, ...(NOVELTY_RULES[key] || {}) };
}

function canRoleViewType(role = '', typeName = '') {
    if (role === 'super_admin') return true;
    const rule = getNovedadRuleByType(typeName);
    if (!rule) return true;
    return Array.isArray(rule.viewers) && rule.viewers.includes(role);
}

function canRoleApproveType(role = '', typeName = '') {
    if (role === 'super_admin') return true;
    const rule = getNovedadRuleByType(typeName);
    if (!rule) return POLICY[role]?.panels?.includes('gestion') || false;
    return Array.isArray(rule.approvers) && rule.approvers.includes(role);
}

function inferAreaFromNovedad(payload = {}) {
    const explicitArea = String(payload.area || '').trim();
    if (explicitArea === 'Capital Humano' || explicitArea === 'Operaciones') return explicitArea;
    const tipo = String(payload.tipoNovedad || payload.tipo || '').toLowerCase();
    if (tipo.includes('incapacidad') || tipo.includes('licencia')) return 'Capital Humano';
    return 'Operaciones';
}

module.exports = {
    POLICY,
    NOVELTY_RULES,
    ROLE_PRIORITY,
    normalizeRoleOrNull,
    resolveRoleFromGroups,
    getAreaFromRole,
    normalizeNovedadTypeKey,
    getNovedadRuleByType,
    canRoleViewType,
    canRoleApproveType,
    inferAreaFromNovedad
};
