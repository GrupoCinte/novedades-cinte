/**
 * Datos estáticos de navegación del mock Ecosistema Cinte (solo planeación visual).
 */

export const NAV_COLABORADOR = [
  { id: 'perfil', label: 'Mi perfil y documentos' },
  { id: 'nomina', label: 'Nómina y liquidaciones' },
  { id: 'solicitudes', label: 'Solicitudes y permisos' },
  { id: 'capacitacion', label: 'Capacitación y desarrollo' },
  { id: 'evaluaciones', label: 'Evaluaciones de desempeño' },
  { id: 'comunicaciones', label: 'Comunicaciones internas' }
];

export const NAV_CLIENTE = [
  { id: 'dashboard', label: 'Dashboard del servicio' },
  { id: 'evaluacion', label: 'Evaluación de colaboradores' },
  { id: 'sla', label: 'Calidad del servicio (SLA)' },
  { id: 'conciliaciones', label: 'Aprobación de conciliaciones' },
  { id: 'historico', label: 'Histórico y reportes' },
  { id: 'comunicacion', label: 'Comunicación con cuenta' }
];

/** Módulos ya existentes en la app (rutas reales bajo /admin). */
export const ADMIN_MODULOS_VIVOS = [
  {
    id: 'novedades',
    label: 'Gestión de novedades laborales',
    description: 'Radicación, calendario y gestión operativa.',
    href: '/admin',
    accent: 'bg-blue-600/30 border-blue-500/50 text-blue-200'
  },
  {
    id: 'comercial',
    label: 'Módulo comercial (cotizador)',
    description: 'Cotizaciones y catálogos comerciales.',
    href: '/admin/comercial',
    accent: 'bg-emerald-600/30 border-emerald-500/50 text-emerald-200'
  },
  {
    id: 'contratacion',
    label: 'Capital Humano — onboarding',
    description: 'Contratación IA y monitor de candidatos.',
    href: '/admin/contratacion',
    accent: 'bg-violet-600/30 border-violet-500/50 text-violet-200'
  }
];

export const ADMIN_PLACEHOLDERS = [
  { id: 'crm', label: 'CRM y gestión comercial' },
  { id: 'contratos', label: 'Contratos y onboarding (visión extendida)' },
  { id: 'staffing', label: 'Asignación de staffing' },
  { id: 'tiempos', label: 'Control de tiempos y KPIs' },
  { id: 'conciliacion', label: 'Conciliaciones y facturación' },
  { id: 'cobranza', label: 'Cobranza y cartera' }
];

export const NUCLEO_ITEMS = [
  { title: 'Maestro colaboradores', desc: 'Datos maestros de personas y roles.' },
  { title: 'Maestro clientes', desc: 'Cuentas, contratos y jerarquía comercial.' },
  { title: 'Motor de conciliación', desc: 'Reglas y estados de conciliación operativa/financiera.' },
  { title: 'Motor de calidad', desc: 'SLA, encuestas y seguimiento de servicio.' },
  { title: 'Integraciones', desc: 'APIs, ETL y conectores con sistemas externos.' }
];

export const AUTO_ITEMS = [
  { title: 'Workflows', desc: 'Orquestación de procesos entre portales.' },
  { title: 'Alertas', desc: 'Notificaciones y escalamiento.' },
  { title: 'IA embebida', desc: 'Asistencia contextual en flujos críticos.' },
  { title: 'Nuevas soluciones por sprint', desc: 'Entrega iterativa de valor.' }
];
