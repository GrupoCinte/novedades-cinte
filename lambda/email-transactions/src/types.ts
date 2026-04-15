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
  };
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

export type TransactionalEmailEvent =
  | FormSubmittedNotificationEvent
  | FormStatusChangedNotificationEvent;
