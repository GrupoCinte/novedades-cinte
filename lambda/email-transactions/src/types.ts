export interface FormSubmittedNotificationEvent {
  eventType: 'form_submitted';
  eventId: string;
  occurredAt: string;
  novedadId: string;
  user: {
    name: string;
    email: string;
  };
  admin: {
    actionUrl: string;
    /** Si viene del backend, sustituye a EMAIL_ADMIN_TO* para el correo admin. */
    notifyTo?: string[];
  };
  formData: {
    tipoNovedad: string;
    cliente: string;
    lider: string;
    fechaInicio: string | null;
    fechaFin: string | null;
    cantidadHoras: number;
    montoCop?: number | null;
    estado: string;
  };
  meta: {
    source: string;
    env: string;
  };
}

export interface FormStatusChangedNotificationEvent {
  eventType: 'form_status_changed';
  eventId: string;
  occurredAt: string;
  novedadId: string;
  user: {
    name: string;
    email: string;
  };
  admin: {
    actionUrl: string;
    consultorNovedadesUrl?: string;
  };
  /** Motivo de rechazo (solo cuando newEstado es Rechazado). */
  rejectionFeedback?: string;
  formData: {
    tipoNovedad: string;
    cliente: string;
    lider: string;
    fechaInicio: string | null;
    fechaFin: string | null;
    cantidadHoras: number;
    montoCop?: number | null;
    estado: 'Aprobado' | 'Rechazado';
  };
  statusChange: {
    previousEstado: string;
    newEstado: 'Aprobado' | 'Rechazado';
    changedByEmail?: string | null;
    changedAt?: string | null;
  };
  meta: {
    source: string;
    env: string;
  };
}

export interface TimeEntryConfirmationEvent {
  eventType: 'time_entry_confirmation';
  eventId: string;
  occurredAt: string;
  entryId: string;
  consultant: {
    name: string;
    email: string;
  };
  action: 'created' | 'updated' | 'deleted';
  entryData: {
    date: string;
    description: string;
    client: string;
    schedule: string;
  };
  previousData?: {
    date?: string;
    description?: string;
    client?: string;
    schedule?: string;
  };
  /** Destinatarios admin (si viene, sustituye ENV de la Lambda). */
  admin?: {
    notifyTo?: string[];
  };
  meta: {
    source: string;
    env: string;
  };
}

export interface TimeEntryAdminNotificationEvent {
  eventType: 'time_entry_admin_notification';
  eventId: string;
  occurredAt: string;
  entryId: string;
  consultant: {
    name: string;
    email: string;
  };
  action: 'created' | 'updated' | 'deleted';
  entryData: {
    date: string;
    description: string;
    client: string;
    schedule: string;
  };
  previousData?: {
    date?: string;
    description?: string;
    client?: string;
    schedule?: string;
  };
  /** Destinatarios admin (si viene, sustituye ENV de la Lambda). */
  admin?: {
    notifyTo?: string[];
  };
  meta: {
    source: string;
    env: string;
  };
}

// nuevo
export interface ReubicacionAlertaEvent {
  eventType: 'reubicacion_alerta';
  eventId: string;
  occurredAt: string;
  casoId: string;
  consultor: {
    nombre: string;
    cedula: string;
  };
  hito: 'dia_0' | 'dia_3' | 'dia_5' | 'extension' | 'novedad';
  fechaFin: string;
  diasRestantes?: number;
  estado?: string;
  clienteActual?: string;
  clienteDestino?: string;
  gp?: {
    nombre?: string;
    email?: string;
  };
  observacion?: string;
  destinatarios: string[];
  meta: {
    source: string;
    env: string;
  };
}
//nuevo

export type TransactionalEmailEvent =
  | FormSubmittedNotificationEvent
  | FormStatusChangedNotificationEvent
  | ConciliacionServicioFinalizadaEvent
  | ConciliacionCorreoLiderEvent
  | ConciliacionStakeholdersAvisoEvent
  | TimeEntryConfirmationEvent
  | TimeEntryAdminNotificationEvent
  | ReubicacionAlertaEvent; // ← NUEVO
 

export interface ConciliacionCorreoLiderEvent {
  eventType: 'conciliacion_correo_lider';
  eventId: string;
  occurredAt: string;
  conciliacionServicioId: string;
  recipient: { name?: string; email: string };
  asunto: string;
  introHtml: string;
  tableHtml: string;
  cierreHtml?: string;
  columnas?: string[];
  plazoLabel?: string | null;
  ttlHours?: number | null;
  expiraAt?: string | null;
  servicio: {
    id: string;
    serviceName: string;
    cliente: string;
    anio: number;
    mes: number;
  };
  sentBy?: {
    email?: string | null;
    nombre?: string | null;
  };
  meta: {
    source: string;
    env: string;
  };
  actions?: {
    viewUrl?: string;
    approveUrl?: string;
    rejectUrl?: string;
  };
}

export interface ConciliacionStakeholdersAvisoEvent {
  eventType: 'conciliacion_stakeholders_aviso';
  eventId: string;
  occurredAt: string;
  kind: 'enviada' | 'aprobada' | 'rechazada' | 'parcial';
  conciliacionServicioId: string;
  recipients: Array<{ name?: string; email: string }>;
  servicio: {
    id: string;
    serviceName: string;
    cliente: string;
    anio: number;
    mes: number;
  };
  lider?: {
    email?: string | null;
    nombre?: string | null;
  };
  sentBy?: {
    email?: string | null;
    nombre?: string | null;
  };
  resumen?: {
    aprobados?: number;
    rechazados?: number;
  };
  admin?: {
    actionUrl?: string;
  };
  meta: {
    source: string;
    env: string;
  };
}

export interface ConciliacionServicioFinalizadaEvent {
  eventType: 'conciliacion_servicio_finalizada';
  eventId: string;
  occurredAt: string;
  conciliacionServicioId: string;
  recipients: Array<{ name?: string; email: string }>;
  servicio: {
    id: string;
    serviceName: string;
    cliente: string;
    anio: number;
    mes: number;
    billingType?: string;
    billingMode?: string;
  };
  totales: {
    tarifaSum: number;
    incrementoSum: number;
    deduccionSum: number;
    facturaSum: number;
  };
  consultores: Array<{
    nombre: string;
    cedula: string;
    estado: string;
    facturaCop: number;
  }>;
  approvedBy?: {
    email?: string | null;
    nombre?: string | null;
  };
  admin: {
    actionUrl: string;
  };
  meta: {
    source: string;
    env: string;
  };
}
