import { formatMontoCOPLocale } from './copMoneyFormat';

export const NOVEDAD_RULES = {
  Incapacidad: {
    requiredDocuments: ['Incapacidad'],
    formatLinks: [],
    approvers: ['admin_ch'],
    viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'gp', 'nomina'],
    requiresDayCount: true,
    requiresTimeRange: false,
    /** Días corridos (calendario), no solo lun–vie. */
    autoCalendarDays: true
  },
  'Calamidad domestica': {
    requiredDocuments: ['Soporte de calamidad', 'Formato de permiso'],
    formatLinks: [{ label: 'F-002-GCH - Solicitud de Permisos', href: '/assets/formats/F-002-GCH%20-%20Solicitud%20de%20Permisos.xlsx' }],
    approvers: ['admin_ch'],
    viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'gp', 'nomina'],
    requiresDayCount: true,
    requiresTimeRange: false,
    autoBusinessDays: true
  },
  'Permiso remunerado': {
    requiredDocuments: ['Soporte adjunto', 'Formato permiso Excel'],
    formatLinks: [{ label: 'F-002-GCH - Solicitud de Permisos', href: '/assets/formats/F-002-GCH%20-%20Solicitud%20de%20Permisos.xlsx' }],
    approvers: ['admin_ch'],
    viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'gp', 'nomina'],
    requiresDayCount: true,
    requiresTimeRange: false,
    autoBusinessDays: true,
    /** Modo horas: `unidad` en el registro o payload; días = comportamiento actual. */
    permisoRemuneradoHoras: true
  },
  'Licencia de luto': {
    requiredDocuments: ['Registro civil consultor', 'Soporte parentesco', 'Acta de defuncion'],
    formatLinks: [],
    approvers: ['admin_ch'],
    viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'gp', 'nomina'],
    requiresDayCount: true,
    requiresTimeRange: false,
    autoBusinessDays: true
  },
  'Licencia de paternidad': {
    requiredDocuments: ['Certificado nacido vivo', 'Registro civil bebe', 'Semanas de gestacion'],
    formatLinks: [],
    approvers: ['admin_ch'],
    viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'nomina', 'gp'],
    requiresDayCount: true,
    requiresTimeRange: false,
    autoBusinessDays: true
  },
  'Licencia de maternidad': {
    requiredDocuments: ['Incapacidad', 'Registro civil nacido vivo', 'Semanas de gestacion'],
    formatLinks: [],
    approvers: ['admin_ch'],
    viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'nomina', 'gp'],
    requiresDayCount: true,
    requiresTimeRange: false,
    autoBusinessDays: true
  },
  'Licencia remunerada': {
    requiredDocuments: ['Soporte de ausencia'],
    formatLinks: [{ label: 'F-002-GCH - Solicitud de Permisos', href: '/assets/formats/F-002-GCH%20-%20Solicitud%20de%20Permisos.xlsx' }],
    approvers: ['admin_ch'],
    viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'gp', 'nomina'],
    requiresDayCount: true,
    requiresTimeRange: false,
    autoBusinessDays: true
  },
  'Licencia no remunerada': {
    requiredDocuments: [],
    formatLinks: [{ label: 'F-002-GCH - Solicitud de Permisos', href: '/assets/formats/F-002-GCH%20-%20Solicitud%20de%20Permisos.xlsx' }],
    approvers: ['admin_ch'],
    viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'cac', 'nomina'],
    requiresDayCount: true,
    requiresTimeRange: false,
    autoBusinessDays: true
  },
  'Permiso no remunerado': {
    requiredDocuments: [],
    formatLinks: [],
    approvers: ['admin_ch'],
    viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'cac', 'nomina'],
    requiresDayCount: false,
    requiresTimeRange: true
  },
  'Permiso compensatorio en tiempo': {
    requiredDocuments: ['Formato de permiso compensatorio'],
    formatLinks: [],
    approvers: ['gp'],
    viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'cac', 'nomina'],
    requiresDayCount: true,
    requiresTimeRange: false,
    autoBusinessDays: true
  },
  'Compensatorio por votación/jurado': {
    requiredDocuments: ['Certificado de jurado o electoral (según la modalidad elegida)'],
    formatLinks: [],
    approvers: ['admin_ch'],
    viewers: ['super_admin', 'cac', 'admin_ch', 'team_ch', 'nomina'],
    requiresDayCount: false,
    requiresTimeRange: false,
    autoCalendarDays: true
  },
  /**
   * Disponibilidad: el backend guarda cantidad_horas = 0 y el valor en monto_cop.
   * El formulario puede mostrar días hábiles del rango solo como referencia (UI), no persistidos en cantidad_horas.
   */
  Disponibilidad: {
    requiredDocuments: [],
    formatLinks: [],
    approvers: ['gp'],
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

/** Histórico / lectura: ya no están en NOVEDAD_TYPES ni en el selector del formulario. */
export const NOVEDAD_RULES_LEGACY = {
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
    requiredDocuments: ['Carta con firma manuscrita (solicitud formal en PDF)'],
    formatLinks: [],
    approvers: ['admin_ch'],
    viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'nomina'],
    requiresDayCount: true,
    requiresTimeRange: false,
    autoBusinessDays: false
  },
  Bonos: {
    requiredDocuments: [],
    formatLinks: [],
    approvers: ['gp'],
    viewers: ['super_admin', 'gp', 'admin_ch', 'team_ch', 'cac', 'nomina'],
    requiresDayCount: false,
    requiresTimeRange: false,
    requiresMonetaryAmount: true
  }
};

export const NOVEDAD_TYPES = Object.keys(NOVEDAD_RULES);

/** Claves internas (rbac / posibles filas legacy) → nombre canónico (activo o NOVEDAD_RULES_LEGACY). */
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
  compensatorio_votacion_jurado: 'Compensatorio por votación/jurado',
  incapacidad: 'Incapacidad',
  hora_extra: 'Hora Extra',
  apoyo: 'Disponibilidad',
  apoyo_standby: 'Disponibilidad',
  disponibilidad_standby: 'Disponibilidad',
  bonos: 'Bonos',
  bono: 'Bonos'
};

/** Días hábiles entre fechas YYYY-MM-DD (lun–vie), alineado con Formulario y registerRoutes. */
export function countBusinessDaysInclusive(startDateRaw, endDateRaw, festivosSet = new Set()) {
  if (!startDateRaw || !endDateRaw || endDateRaw < startDateRaw) return 0;
  const start = new Date(`${startDateRaw}T00:00:00`);
  const end = new Date(`${endDateRaw}T00:00:00`);
  let count = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      const ymd = cursor.toISOString().slice(0, 10);
      if (!festivosSet.has(ymd)) {
        count += 1;
      }
    }
  }
  return count;
}

/** Días calendario entre fechas YYYY-MM-DD (inicio y fin inclusive; incluye sábados y domingos). */
export function countCalendarDaysInclusive(startDateRaw, endDateRaw) {
  if (!startDateRaw || !endDateRaw || endDateRaw < startDateRaw) return 0;
  const start = new Date(`${startDateRaw}T00:00:00`);
  const end = new Date(`${endDateRaw}T00:00:00`);
  let count = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    count += 1;
  }
  return count;
}

/** Prioriza cantidad guardada; si es 0 y hay rango, infiere días (hábiles o calendario según regla del tipo). */
export function getDiasEfectivosNovedad(
  tipoNovedad,
  cantidadRaw,
  fechaInicio,
  fechaFin,
  festivosSet = new Set(),
  measureContext = null
) {
  const kind = getCantidadMedidaKind(tipoNovedad, measureContext);
  if (kind !== 'days') return 0;
  const n = Number(cantidadRaw) || 0;
  if (n > 0) return n;
  if (fechaInicio && fechaFin) {
    const rule = getNovedadRule(tipoNovedad);
    if (rule.autoCalendarDays) return countCalendarDaysInclusive(fechaInicio, fechaFin);
    return countBusinessDaysInclusive(fechaInicio, fechaFin, festivosSet);
  }
  return 0;
}

/** Normaliza para comparar tipos guardados en BD con claves de NOVEDAD_RULES (mayúsculas, acentos). */
function foldTipo(value) {
  return String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Resuelve el texto de tipo_novedad al nombre canónico de NOVEDAD_RULES.
 * Cubre variantes de mayúsculas, acentos y etiquetas cortas usadas en datos legacy/demo.
 */
export function resolveCanonicalNovedadTipo(tipoRaw) {
  const raw = String(tipoRaw || '').trim();
  if (!raw) return raw;
  if (NOVEDAD_RULES[raw] || NOVEDAD_RULES_LEGACY[raw]) return raw;
  const snakeKey = raw.replace(/[\s-]+/g, '_').replace(/_+/g, '_').toLowerCase();
  if (TIPO_ALIAS_SNAKE[snakeKey]) return TIPO_ALIAS_SNAKE[snakeKey];
  const f = foldTipo(raw);
  const byFold = NOVEDAD_TYPES.find((k) => foldTipo(k) === f);
  if (byFold) return byFold;
  if (f === 'vacaciones') return 'Vacaciones en tiempo';
  if (f === 'vacaciones en tiempo') return 'Vacaciones en tiempo';
  if (f === 'vacaciones en dinero') return 'Vacaciones en dinero';
  if (f === 'compensatorio por votacion jurado' || f === 'compensatorio por votacion/jurado') {
    return 'Compensatorio por votación/jurado';
  }
  /* Etiqueta corta en datos demo/legacy; el flujo de horas coincide con Permiso no remunerado. */
  if (f === 'permiso') return 'Permiso no remunerado';
  /* Renombre de producto: antes "Apoyo"; standby y variantes pasan a Disponibilidad única. */
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

/** Tipos que exigen verificación nómina antes de aprobar/rechazar. Alineado con `src/rbac.js` → `isNominaGateNovedadType`. */
const NOMINA_GATE_CANONICAL_TIPOS = new Set([
  'Incapacidad',
  'Calamidad domestica',
  'Permiso remunerado',
  'Licencia de luto',
  'Licencia de paternidad',
  'Licencia de maternidad',
  'Licencia remunerada',
  'Licencia no remunerada',
  'Permiso no remunerado',
  'Vacaciones en dinero'
]);

export function isNominaGateTipoDisplay(tipoRaw) {
  const canon = resolveCanonicalNovedadTipo(tipoRaw);
  return NOMINA_GATE_CANONICAL_TIPOS.has(canon);
}

export function getNovedadRule(tipo) {
  const canon = resolveCanonicalNovedadTipo(tipo);
  const raw = NOVEDAD_RULES[canon] || NOVEDAD_RULES_LEGACY[canon];
  const fallback = {
    requiredDocuments: [],
    formatLinks: [],
    approvers: [],
    /** Tipos no catalogados: misma ampliación visual que backend `canRoleViewType` para CH. */
    viewers: ['super_admin', 'admin_ch', 'team_ch', 'cac', 'gp', 'nomina'],
    requiresDayCount: false,
    requiresTimeRange: false,
    autoBusinessDays: false,
    autoCalendarDays: false,
    requiresMonetaryAmount: false,
    gestionPermiso: 'CRUD',
  };
  if (!raw) return fallback;
  return {
    ...raw,
    gestionPermiso: raw.gestionPermiso || 'CRUD',
  };
}

/** Etiquetas para UI de gestión (asignación por rol). */
export const ETIQUETA_ROL_APROBADOR = {
  super_admin: 'Super Admin',
  cac: 'CAC (Capital Humano)',
  admin_ch: 'Admin Capital Humano',
  team_ch: 'Equipo Capital Humano',
  gp: 'Gestión de proyectos',
  nomina: 'Nómina',
  comercial: 'Comercial',
};

/** Roles aprobadores + permiso en módulo gestión (p. ej. CRUD), según reglas del tipo. */
export function getAsignacionGestionNovedad(tipoNovedad) {
  const rule = getNovedadRule(tipoNovedad);
  const approvers = Array.isArray(rule.approvers) ? rule.approvers : [];
  const seen = new Set();
  const labels = [];
  for (const r of approvers) {
    if (seen.has(r)) continue;
    seen.add(r);
    labels.push(
      ETIQUETA_ROL_APROBADOR[r] || String(r).replace(/_/g, ' '),
    );
  }
  return {
    rolesEtiqueta:
      labels.length > 0 ? labels.join(' · ') : '—',
    permisoGestion: rule.gestionPermiso || 'CRUD',
  };
}

/** Alineado con FormularioNovedad: cantidad_horas almacena horas o días según el tipo. `context` incluye `unidad` para Permiso remunerado en horas. */
export function getCantidadMedidaKind(tipoNovedad, context = null) {
  const canon = resolveCanonicalNovedadTipo(tipoNovedad);
  const unidad = String(context?.unidad || '').trim().toLowerCase();
  if (canon === 'Permiso remunerado' && unidad === 'horas') return 'hours';
  /** Votación/medio día: `cantidad_horas` = horas de franja; jurado: `cantidad_horas` = 1 (día). */
  if (canon === 'Compensatorio por votación/jurado') {
    const mod = String(context?.modalidad || '').trim().toLowerCase();
    if (mod === 'solo_voto') return 'hours';
    if (mod === 'solo_jurado') return 'days';
    const fi = String(context?.fechaInicio || context?.fecha_inicio || '').trim();
    const ff = String(context?.fechaFin || context?.fecha_fin || '').trim();
    const hi = String(context?.horaInicio || context?.hora_inicio || '').trim();
    const hf = String(context?.horaFin || context?.hora_fin || '').trim();
    if (hi && hf && fi && ff && fi === ff) return 'hours';
    return 'days';
  }
  const rule = getNovedadRule(tipoNovedad);
  if (rule.requiresTimeRange) return 'hours';
  if (rule.requiresMonetaryAmount) return 'money';
  if (rule.requiresDayCount || rule.autoBusinessDays || rule.autoCalendarDays) return 'days';
  return 'neutral';
}

/** Texto compacto para cantidades en días (UI en español). */
export function formatDiasCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v === 0) return '—';
  if (v === 1) return '1 día';
  return `${v} días`;
}

/**
 * @param {object} [context] registro de novedad o { fechaInicio, fechaFin, festivosSet } para inferir días cuando cantidad_horas es 0
 */
export function formatCantidadNovedad(tipoNovedad, cantidadRaw, context = null) {
  const n = Number(cantidadRaw);
  const kind = getCantidadMedidaKind(tipoNovedad, context);
  const fechaInicio = context?.fechaInicio || context?.fecha_inicio || '';
  const fechaFin = context?.fechaFin || context?.fecha_fin || '';
  const festivosSet = context?.festivosSet || new Set();
  
  if (kind === 'hours') {
    if (!Number.isFinite(n) || n === 0) return '—';
    const rounded = Math.round(n * 100) / 100;
    return `${rounded}h`;
  }
  if (kind === 'days') {
    const dias = getDiasEfectivosNovedad(tipoNovedad, cantidadRaw, fechaInicio, fechaFin, festivosSet, context);
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

export function getCantidadDetalleEtiqueta(tipoNovedad, context = null) {
  const kind = getCantidadMedidaKind(tipoNovedad, context);
  if (kind === 'hours') return 'Total horas';
  if (kind === 'days') return 'Días solicitados';
  if (kind === 'money') return 'Valor (COP)';
  return 'Cantidad';
}

