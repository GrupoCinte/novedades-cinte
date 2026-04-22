'use strict';

/**
 * Formato de cantidad (horas / días / dinero) alineado con `react-frontend/src/novedadRules.js`
 * y con el dashboard. Usado por el backend en export Excel (CommonJS).
 */

function formatMontoCOPLocale(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '$ 0';
    if (v === 0) return '$ 0';
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(v);
}

const NOVEDAD_RULES = {
    Incapacidad: {
        requiredDocuments: ['Historia clinica', 'Incapacidad'],
        formatLinks: [],
        approvers: ['admin_ch', 'team_ch', 'cac'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'gp', 'nomina'],
        requiresDayCount: false,
        requiresTimeRange: false
    },
    'Calamidad domestica': {
        requiredDocuments: ['Soporte de calamidad', 'Formato de permiso'],
        formatLinks: [
            {
                label: 'F-002-GCH - Solicitud de Permisos',
                href: '/assets/formats/F-002-GCH%20-%20Solicitud%20de%20Permisos.xlsx'
            }
        ],
        approvers: ['admin_ch', 'team_ch', 'cac'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'gp', 'nomina'],
        requiresDayCount: true,
        requiresTimeRange: false
    },
    'Permiso remunerado': {
        requiredDocuments: ['Soporte adjunto', 'Formato permiso Excel'],
        formatLinks: [
            {
                label: 'F-002-GCH - Solicitud de Permisos',
                href: '/assets/formats/F-002-GCH%20-%20Solicitud%20de%20Permisos.xlsx'
            }
        ],
        approvers: ['admin_ch', 'team_ch', 'cac'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'gp', 'nomina'],
        requiresDayCount: false,
        requiresTimeRange: false
    },
    'Licencia de luto': {
        requiredDocuments: ['Registro civil consultor', 'Soporte parentesco', 'Acta de defuncion'],
        formatLinks: [],
        approvers: ['admin_ch', 'team_ch', 'cac'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'gp', 'nomina'],
        requiresDayCount: false,
        requiresTimeRange: false
    },
    'Licencia de paternidad': {
        requiredDocuments: ['Certificado nacido vivo', 'Registro civil bebe', 'Semanas de gestacion'],
        formatLinks: [],
        approvers: ['admin_ch', 'team_ch', 'cac'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'nomina', 'gp'],
        requiresDayCount: false,
        requiresTimeRange: false
    },
    'Licencia de maternidad': {
        requiredDocuments: ['Incapacidad', 'Registro civil nacido vivo', 'Semanas de gestacion'],
        formatLinks: [],
        approvers: ['admin_ch', 'team_ch', 'cac'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'nomina', 'gp'],
        requiresDayCount: false,
        requiresTimeRange: false
    },
    'Licencia remunerada': {
        requiredDocuments: ['Soporte de ausencia'],
        formatLinks: [
            {
                label: 'F-002-GCH - Solicitud de Permisos',
                href: '/assets/formats/F-002-GCH%20-%20Solicitud%20de%20Permisos.xlsx'
            }
        ],
        approvers: ['admin_ch', 'team_ch', 'cac'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'gp', 'nomina'],
        requiresDayCount: false,
        requiresTimeRange: false
    },
    'Licencia no remunerada': {
        requiredDocuments: [],
        formatLinks: [
            {
                label: 'F-002-GCH - Solicitud de Permisos',
                href: '/assets/formats/F-002-GCH%20-%20Solicitud%20de%20Permisos.xlsx'
            }
        ],
        approvers: ['gp', 'cac'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'cac', 'nomina'],
        requiresDayCount: true,
        requiresTimeRange: false
    },
    'Permiso no remunerado': {
        requiredDocuments: [],
        formatLinks: [],
        approvers: ['gp', 'cac'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'cac', 'nomina'],
        requiresDayCount: false,
        requiresTimeRange: true
    },
    'Vacaciones en tiempo': {
        requiredDocuments: [],
        formatLinks: [
            {
                label: 'F-001-GCH - Solicitud de Vacaciones',
                href: '/assets/formats/F-001-GCH%20-%20Solicitud%20de%20Vacaciones.xlsx'
            }
        ],
        approvers: ['gp', 'admin_ch', 'team_ch', 'cac'],
        viewers: ['super_admin', 'gp', 'nomina', 'admin_ch', 'team_ch', 'cac'],
        requiresDayCount: true,
        requiresTimeRange: false,
        autoBusinessDays: true
    },
    'Vacaciones en dinero': {
        requiredDocuments: [],
        formatLinks: [],
        approvers: ['admin_ch', 'team_ch', 'cac'],
        viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'nomina'],
        requiresDayCount: true,
        requiresTimeRange: false,
        autoBusinessDays: false
    },
    'Permiso compensatorio en tiempo': {
        requiredDocuments: ['Formato de permiso compensatorio'],
        formatLinks: [],
        approvers: ['gp', 'cac'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'cac', 'nomina'],
        requiresDayCount: false,
        requiresTimeRange: false
    },
    Disponibilidad: {
        requiredDocuments: [],
        formatLinks: [],
        approvers: ['gp', 'cac'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'cac', 'nomina'],
        requiresDayCount: false,
        requiresTimeRange: false,
        requiresMonetaryAmount: true
    },
    Bonos: {
        requiredDocuments: [],
        formatLinks: [],
        approvers: ['gp', 'cac'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'cac', 'nomina'],
        requiresDayCount: false,
        requiresTimeRange: false,
        requiresMonetaryAmount: true
    },
    'Hora Extra': {
        requiredDocuments: [],
        formatLinks: [],
        approvers: ['gp'],
        viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'cac', 'nomina'],
        requiresDayCount: false,
        requiresTimeRange: true
    }
};

const NOVEDAD_TYPES = Object.keys(NOVEDAD_RULES);

const TIPO_ALIAS_SNAKE = {
    vacaciones_tiempo: 'Vacaciones en tiempo',
    vacaciones_en_tiempo: 'Vacaciones en tiempo',
    vacaciones_dinero: 'Vacaciones en dinero',
    vacaciones_en_dinero: 'Vacaciones en dinero',
    calamidad_domestica: 'Calamidad domestica',
    permiso_remunerado: 'Permiso remunerado',
    licencia_luto: 'Licencia de luto',
    licencia_paternidad: 'Licencia de paternidad',
    licencia_maternidad: 'Licencia de maternidad',
    licencia_remunerada: 'Licencia remunerada',
    licencia_no_remunerada: 'Licencia no remunerada',
    permiso_no_remunerado: 'Permiso no remunerado',
    permiso_compensatorio_tiempo: 'Permiso compensatorio en tiempo',
    incapacidad: 'Incapacidad',
    hora_extra: 'Hora Extra',
    apoyo: 'Disponibilidad',
    apoyo_standby: 'Disponibilidad',
    disponibilidad_standby: 'Disponibilidad',
    bonos: 'Bonos',
    bono: 'Bonos'
};

function foldTipo(value) {
    return String(value || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function countBusinessDaysInclusive(startDateRaw, endDateRaw) {
    if (!startDateRaw || !endDateRaw || endDateRaw < startDateRaw) return 0;
    const start = new Date(`${startDateRaw}T00:00:00`);
    const end = new Date(`${endDateRaw}T00:00:00`);
    let count = 0;
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const day = cursor.getDay();
        if (day !== 0 && day !== 6) count += 1;
    }
    return count;
}

function resolveCanonicalNovedadTipo(tipoRaw) {
    const raw = String(tipoRaw || '').trim();
    if (!raw) return raw;
    if (NOVEDAD_RULES[raw]) return raw;
    const snakeKey = raw.replace(/[\s-]+/g, '_').replace(/_+/g, '_').toLowerCase();
    if (TIPO_ALIAS_SNAKE[snakeKey]) return TIPO_ALIAS_SNAKE[snakeKey];
    const f = foldTipo(raw);
    const byFold = NOVEDAD_TYPES.find((k) => foldTipo(k) === f);
    if (byFold) return byFold;
    if (f === 'vacaciones') return 'Vacaciones en tiempo';
    if (f === 'vacaciones en tiempo') return 'Vacaciones en tiempo';
    if (f === 'vacaciones en dinero') return 'Vacaciones en dinero';
    if (f === 'permiso') return 'Permiso no remunerado';
    if (f === 'apoyo') return 'Disponibilidad';
    if (
        f === 'apoyo standby'
        || f === 'apoyo stand by'
        || f === 'apoyo standy'
        || f === 'disponibilidad standby'
    ) {
        return 'Disponibilidad';
    }
    return raw;
}

function getNovedadRule(tipo) {
    const canon = resolveCanonicalNovedadTipo(tipo);
    const raw = NOVEDAD_RULES[canon];
    const fallback = {
        requiredDocuments: [],
        formatLinks: [],
        approvers: [],
        viewers: ['super_admin'],
        requiresDayCount: false,
        requiresTimeRange: false,
        autoBusinessDays: false,
        requiresMonetaryAmount: false,
        gestionPermiso: 'CRUD'
    };
    if (!raw) return fallback;
    return {
        ...raw,
        gestionPermiso: raw.gestionPermiso || 'CRUD'
    };
}

function getCantidadMedidaKind(tipoNovedad) {
    const rule = getNovedadRule(tipoNovedad);
    if (rule.requiresTimeRange) return 'hours';
    if (rule.requiresMonetaryAmount) return 'money';
    if (rule.requiresDayCount || rule.autoBusinessDays) return 'days';
    return 'neutral';
}

function getDiasEfectivosNovedad(tipoNovedad, cantidadRaw, fechaInicio, fechaFin) {
    const kind = getCantidadMedidaKind(tipoNovedad);
    if (kind !== 'days') return 0;
    const n = Number(cantidadRaw) || 0;
    if (n > 0) return n;
    if (fechaInicio && fechaFin) return countBusinessDaysInclusive(fechaInicio, fechaFin);
    return 0;
}

function formatDiasCount(n) {
    const v = Number(n);
    if (!Number.isFinite(v) || v === 0) return '—';
    if (v === 1) return '1 día';
    return `${v} días`;
}

function formatCantidadNovedad(tipoNovedad, cantidadRaw, context = null) {
    const n = Number(cantidadRaw);
    const kind = getCantidadMedidaKind(tipoNovedad);
    const fechaInicio = context?.fechaInicio || context?.fecha_inicio || '';
    const fechaFin = context?.fechaFin || context?.fecha_fin || '';
    if (kind === 'hours') {
        if (!Number.isFinite(n) || n === 0) return '—';
        return `${n}h`;
    }
    if (kind === 'days') {
        const dias = getDiasEfectivosNovedad(tipoNovedad, cantidadRaw, fechaInicio, fechaFin);
        return formatDiasCount(dias);
    }
    if (kind === 'money') {
        let m = context?.montoCop != null && context.montoCop !== '' ? Number(context.montoCop) : NaN;
        if ((!Number.isFinite(m) || m <= 0) && Number(cantidadRaw) > 0) {
            m = Number(cantidadRaw);
        }
        if (!Number.isFinite(m) || m <= 0) return '—';
        return formatMontoCOPLocale(m);
    }
    if (!Number.isFinite(n) || n === 0) return '—';
    return String(n);
}

function getCantidadDetalleEtiqueta(tipoNovedad) {
    const kind = getCantidadMedidaKind(tipoNovedad);
    if (kind === 'hours') return 'Total horas';
    if (kind === 'days') return 'Días solicitados';
    if (kind === 'money') return 'Valor (COP)';
    return 'Cantidad';
}

module.exports = {
    NOVEDAD_RULES,
    NOVEDAD_TYPES,
    countBusinessDaysInclusive,
    getDiasEfectivosNovedad,
    resolveCanonicalNovedadTipo,
    getNovedadRule,
    getCantidadMedidaKind,
    formatDiasCount,
    formatCantidadNovedad,
    getCantidadDetalleEtiqueta
};
