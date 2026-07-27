import { normalizeStatus } from '../contratacion/hooks/useMonitorData.js';

/** Candidato monitor n8n rechazado o eliminado (no incluye finalizados exitosos). */
export function isMonitorCancellation(ex) {
    const fd = ex?.fullData || {};
    if (fd.ts_eliminado || fd.obs_eliminado) return true;
    const s = normalizeStatus(ex?.realStatus);
    if (s.includes('eliminad')) return true;
    if (s.includes('rechaz')) return true;
    return false;
}

export function resolveProcessStartIso(ex) {
    const fd = ex?.fullData || {};
    const raw =
        fd.fecha_inicio ||
        fd.fecha_ingreso ||
        fd.ts_documentos_recibidos ||
        fd.ts_primer_contacto_candidato ||
        null;
    if (!raw) return '';
    return String(raw).slice(0, 10);
}

export function resolveCancellationEventIso(ex) {
    const fd = ex?.fullData || {};
    const raw = fd.ts_eliminado || fd.ts_rechazado || fd.ts_validacion_completada || null;
    if (!raw) return '';
    return String(raw).slice(0, 10);
}

export function resolveCancellationEventMs(ex) {
    const fd = ex?.fullData || {};
    const candidates = [fd.ts_eliminado, fd.ts_rechazado, fd.ts_validacion_completada]
        .map((v) => new Date(v).getTime())
        .filter((v) => Number.isFinite(v) && v > 0);
    if (candidates.length) return Math.min(...candidates);
    const start = resolveProcessStartIso(ex);
    if (start) {
        const ms = new Date(start).getTime();
        if (Number.isFinite(ms)) return ms;
    }
    return Number(ex?.timestamp) || 0;
}

export function mapCancellationRow(ex) {
    const fd = ex?.fullData || {};
    const cedula =
        fd.cedula ||
        fd.numero_documento ||
        (/^\d{5,}$/.test(String(ex?.executionId || '').replace(/\D+/g, ''))
            ? String(ex.executionId).replace(/\D+/g, '')
            : '');
    return {
        executionId: ex.executionId,
        cedula,
        nombre: ex.workflowName || fd['nombre y apellido'] || fd.nombre || '',
        cliente: fd.cliente || fd.cliente_proyecto || '',
        puesto: ex.puesto || fd.puesto || '',
        status: ex.realStatus || '',
        fecha_inicio: resolveProcessStartIso(ex),
        fecha_evento: resolveCancellationEventIso(ex),
        obs_eliminacion: fd.obs_eliminado || fd.obs_rechazo || '',
        _eventMs: resolveCancellationEventMs(ex)
    };
}
