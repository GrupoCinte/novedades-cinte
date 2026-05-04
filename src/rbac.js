const POLICY = {
    super_admin: { panels: ['dashboard', 'calendar', 'gestion', 'admin', 'contratacion', 'comercial', 'directorio'], viewAllAreas: true },
    cac: { panels: ['dashboard', 'calendar', 'gestion', 'contratacion', 'comercial', 'directorio'] },
    admin_ch: { panels: ['dashboard', 'calendar', 'gestion', 'contratacion', 'comercial'] },
    team_ch: { panels: ['dashboard', 'calendar', 'gestion', 'contratacion', 'comercial'] },
    comercial: { panels: ['comercial'] },
    gp: { panels: ['dashboard', 'calendar', 'gestion', 'contratacion'] },
    nomina: { panels: ['dashboard', 'calendar', 'gestion'], viewAllAreas: true }
};

const NOVELTY_RULES = {
    incapacidad: {
        displayName: 'Incapacidad',
        requiredMinSupports: 1,
        approvers: ['admin_ch', 'team_ch', 'cac'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'gp', 'nomina']
    },
    calamidad_domestica: {
        displayName: 'Calamidad domestica',
        requiredMinSupports: 1,
        approvers: ['admin_ch', 'team_ch', 'cac'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'gp', 'nomina']
    },
    permiso_remunerado: {
        displayName: 'Permiso remunerado',
        requiredMinSupports: 1,
        approvers: ['admin_ch', 'team_ch', 'cac'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'gp', 'nomina']
    },
    licencia_luto: {
        displayName: 'Licencia de luto',
        requiredMinSupports: 1,
        approvers: ['admin_ch', 'team_ch', 'cac'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'gp', 'nomina']
    },
    licencia_paternidad: {
        displayName: 'Licencia de paternidad',
        requiredMinSupports: 1,
        approvers: ['admin_ch', 'team_ch', 'cac'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'nomina', 'gp']
    },
    licencia_maternidad: {
        displayName: 'Licencia de maternidad',
        requiredMinSupports: 1,
        approvers: ['admin_ch', 'team_ch', 'cac'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'nomina', 'gp']
    },
    licencia_remunerada: {
        displayName: 'Licencia remunerada',
        requiredMinSupports: 1,
        approvers: ['admin_ch', 'team_ch', 'cac'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'gp', 'nomina']
    },
    licencia_no_remunerada: {
        displayName: 'Licencia no remunerada',
        requiredMinSupports: 0,
        approvers: ['gp', 'cac'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'cac', 'nomina']
    },
    permiso_no_remunerado: {
        displayName: 'Permiso no remunerado',
        requiredMinSupports: 0,
        approvers: ['gp', 'cac'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'cac', 'nomina']
    },
    vacaciones_tiempo: {
        displayName: 'Vacaciones en tiempo',
        requiredMinSupports: 0,
        approvers: ['gp', 'admin_ch', 'team_ch', 'cac'],
        viewers: ['super_admin', 'gp', 'nomina', 'admin_ch', 'team_ch', 'cac']
    },
    vacaciones_dinero: {
        displayName: 'Vacaciones en dinero',
        requiredMinSupports: 1,
        approvers: ['admin_ch', 'team_ch', 'cac'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'nomina']
    },
    hora_extra: {
        displayName: 'Hora Extra',
        requiredMinSupports: 0,
        approvers: ['gp'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'cac', 'nomina']
    },
    apoyo: {
        displayName: 'Disponibilidad',
        requiredMinSupports: 0,
        approvers: ['gp', 'cac'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'cac', 'nomina']
    },
    bonos: {
        displayName: 'Bonos',
        requiredMinSupports: 0,
        approvers: ['gp', 'cac'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'cac', 'nomina']
    },
    permiso_compensatorio_tiempo: {
        displayName: 'Permiso compensatorio en tiempo',
        requiredMinSupports: 1,
        approvers: ['gp', 'cac'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'cac', 'nomina']
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
    if (role === 'admin_ch' || role === 'team_ch' || role === 'cac') return 'Capital Humano';
    if (role === 'gp') return 'Operaciones';
    if (role === 'comercial') return 'Comercial';
    if (role === 'nomina') return 'Financiero';
    return '';
}

function normalizeNovedadTypeKey(value = '') {
    const cleaned = String(value || '')
        .replace(/\u00A0/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim();
    const raw = cleaned.toLowerCase();
    const compact = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
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
        vacaciones: 'vacaciones_tiempo',
        permiso: 'permiso_no_remunerado',
        'hora extra': 'hora_extra',
        apoyo: 'apoyo',
        disponibilidad: 'apoyo',
        'disponibilidad standby': 'apoyo',
        'apoyo standby': 'apoyo',
        'apoyo stand by': 'apoyo',
        'apoyo standy': 'apoyo',
        bono: 'bonos',
        bonos: 'bonos',
        'permiso compensatorio en tiempo': 'permiso_compensatorio_tiempo'
    };
    if (map[compact]) return map[compact];
    const snake = compact.replace(/[\s-]+/g, '_').replace(/_+/g, '_');
    if (NOVELTY_RULES[snake]) return snake;
    const snakeAliases = {
        vacaciones_en_tiempo: 'vacaciones_tiempo',
        vacaciones_en_dinero: 'vacaciones_dinero',
        permisos_no_remunerados: 'permiso_no_remunerado',
        apoyo_standby: 'apoyo',
        disponibilidad_standby: 'apoyo'
    };
    const aliased = snakeAliases[snake];
    if (aliased && NOVELTY_RULES[aliased]) return aliased;
    for (const [ruleKey, rule] of Object.entries(NOVELTY_RULES)) {
        const dn = String(rule.displayName || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (dn && dn === compact) return ruleKey;
    }
    return '';
}

/** Ya no se ofrecen en el formulario público; siguen en NOVELTY_RULES para registros históricos y gestión. */
const NOVEDAD_TIPOS_RETIRADOS_FORMULARIO_KEYS = new Set(['vacaciones_tiempo', 'vacaciones_dinero', 'bonos']);

function isNovedadTipoRetiradoDelFormulario(typeName = '') {
    return NOVEDAD_TIPOS_RETIRADOS_FORMULARIO_KEYS.has(normalizeNovedadTypeKey(typeName));
}

function getNovedadRuleByType(typeName = '') {
    const key = normalizeNovedadTypeKey(typeName);
    if (!key) return null;
    const base = NOVELTY_RULES[key] || {};
    return { key, ...base, gestionPermiso: base.gestionPermiso || 'CRUD' };
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
    if (explicitArea === 'Capital Humano' || explicitArea === 'Operaciones' || explicitArea === 'Financiero') return explicitArea;
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
    isNovedadTipoRetiradoDelFormulario,
    getNovedadRuleByType,
    canRoleViewType,
    canRoleApproveType,
    inferAreaFromNovedad
};
