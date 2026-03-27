/**
 * Estados terminales: no cuentan como "activos" en trazabilidad.
 * Una sola fuente para useMonitorData, ActiveCandidates, etc.
 */
export const TERMINAL_STATUSES = [
    'finalizado',
    'contrato recibido',
    'rechazado',
    'completado',
    'eliminado',
    'contrato pendiente confirmacion',
    'contrato pendiente confirmaci?n',
];

export const TERMINAL_STATUSES_SET = new Set(TERMINAL_STATUSES);
