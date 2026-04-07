export const NOVEDAD_RULES = {
  Incapacidad: {
    requiredDocuments: ['Historia clinica', 'Incapacidad'],
    formatLinks: [],
    approvers: [],
    viewers: ['super_admin', 'admin_ch', 'team_ch', 'gp', 'nomina', 'sst'],
    requiresDayCount: false,
    requiresTimeRange: false
  },
  'Calamidad domestica': {
    requiredDocuments: ['Soporte de calamidad', 'Formato de permiso'],
    formatLinks: [],
    approvers: ['admin_ch', 'team_ch'],
    viewers: ['super_admin', 'admin_ch', 'team_ch', 'gp'],
    requiresDayCount: true,
    requiresTimeRange: false
  },
  'Permiso remunerado': {
    requiredDocuments: ['Soporte adjunto', 'Formato permiso Excel'],
    formatLinks: [{ label: 'F-002-GCH - Solicitud de Permisos', href: '/assets/formats/F-002-GCH%20-%20Solicitud%20de%20Permisos.xlsx' }],
    approvers: ['admin_ch', 'team_ch'],
    viewers: ['super_admin', 'admin_ch', 'team_ch', 'gp'],
    requiresDayCount: false,
    requiresTimeRange: false
  },
  'Licencia de luto': {
    requiredDocuments: ['Registro civil consultor', 'Soporte parentesco', 'Acta de defuncion'],
    formatLinks: [],
    approvers: ['admin_ch', 'team_ch'],
    viewers: ['super_admin', 'admin_ch', 'team_ch', 'gp', 'nomina'],
    requiresDayCount: false,
    requiresTimeRange: false
  },
  'Licencia de paternidad': {
    requiredDocuments: ['Certificado nacido vivo', 'Registro civil bebe', 'Semanas de gestacion'],
    formatLinks: [],
    approvers: ['admin_ch', 'team_ch', 'nomina', 'gp'],
    viewers: ['super_admin', 'admin_ch', 'team_ch', 'nomina', 'gp'],
    requiresDayCount: false,
    requiresTimeRange: false
  },
  'Licencia de maternidad': {
    requiredDocuments: ['Incapacidad', 'Registro civil nacido vivo', 'Semanas de gestacion'],
    formatLinks: [],
    approvers: ['admin_ch', 'team_ch', 'nomina'],
    viewers: ['super_admin', 'admin_ch', 'team_ch', 'nomina', 'gp'],
    requiresDayCount: false,
    requiresTimeRange: false
  },
  'Licencia remunerada': {
    requiredDocuments: ['Soporte de ausencia'],
    formatLinks: [],
    approvers: ['admin_ch', 'team_ch', 'gp'],
    viewers: ['super_admin', 'admin_ch', 'team_ch', 'gp'],
    requiresDayCount: false,
    requiresTimeRange: false
  },
  'Licencia no remunerada': {
    requiredDocuments: [],
    formatLinks: [],
    approvers: ['gp'],
    viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'nomina'],
    requiresDayCount: true,
    requiresTimeRange: false
  },
  'Permiso no remunerado': {
    requiredDocuments: [],
    formatLinks: [],
    approvers: ['gp'],
    viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'nomina'],
    requiresDayCount: false,
    requiresTimeRange: true
  },
  'Vacaciones en tiempo': {
    requiredDocuments: [],
    formatLinks: [{ label: 'F-002-GCH - Solicitud de Permisos', href: '/assets/formats/F-002-GCH%20-%20Solicitud%20de%20Permisos.xlsx' }],
    approvers: ['gp'],
    viewers: ['super_admin', 'gp', 'nomina'],
    requiresDayCount: true,
    requiresTimeRange: false,
    autoBusinessDays: true
  },
  'Vacaciones en dinero': {
    requiredDocuments: ['Solicitud firmada manuscrita'],
    formatLinks: [{ label: 'F-002-GCH - Solicitud de Permisos', href: '/assets/formats/F-002-GCH%20-%20Solicitud%20de%20Permisos.xlsx' }],
    approvers: ['admin_ch', 'team_ch'],
    viewers: ['super_admin', 'admin_ch', 'team_ch', 'nomina'],
    requiresDayCount: false,
    requiresTimeRange: false
  },
  'Permiso compensatorio en tiempo': {
    requiredDocuments: ['Formato de permiso compensatorio'],
    formatLinks: [],
    approvers: ['gp'],
    viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'nomina'],
    requiresDayCount: false,
    requiresTimeRange: false
  },
  Apoyo: {
    requiredDocuments: [],
    formatLinks: [],
    approvers: ['gp'],
    viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'nomina'],
    requiresDayCount: false,
    requiresTimeRange: false
  },
  'Apoyo Standby': {
    requiredDocuments: [],
    formatLinks: [],
    approvers: ['gp'],
    viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'nomina'],
    requiresDayCount: false,
    requiresTimeRange: false
  },
  Bonos: {
    requiredDocuments: [],
    formatLinks: [],
    approvers: ['gp'],
    viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'nomina'],
    requiresDayCount: false,
    requiresTimeRange: false
  },
  'Hora Extra': {
    requiredDocuments: [],
    formatLinks: [],
    approvers: ['gp'],
    viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'nomina', 'sst'],
    requiresDayCount: false,
    requiresTimeRange: true
  }
};

export const NOVEDAD_TYPES = Object.keys(NOVEDAD_RULES);

export function getNovedadRule(tipo) {
  return NOVEDAD_RULES[tipo] || {
    requiredDocuments: [],
    formatLinks: [],
    approvers: [],
    viewers: ['super_admin'],
    requiresDayCount: false,
    requiresTimeRange: false,
    autoBusinessDays: false
  };
}

