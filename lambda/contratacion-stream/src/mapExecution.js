'use strict';

const crypto = require('node:crypto');

const ZOHO_RECORD_TYPE = 'zoho_novedad';

function isSensitiveKey(key) {
    const lk = String(key).toLowerCase();
    return (
        lk.includes('password') ||
        lk.includes('token') ||
        lk.includes('secret') ||
        lk.includes('apikey') ||
        lk.includes('api_key')
    );
}

function redactNested(value) {
    if (Array.isArray(value)) return value.map(redactNested);
    if (!value || typeof value !== 'object') return value;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
        if (isSensitiveKey(k)) continue;
        out[k] = redactNested(v);
    }
    return out;
}

function buildSafeFullData(data) {
    const out = {};
    for (const [k, v] of Object.entries(data || {})) {
        if (isSensitiveKey(k)) continue;
        out[k] = redactNested(v);
    }
    return out;
}

function normalizeStatus(status) {
    return String(status || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function isZohoNovedadItem(rawItem) {
    if (!rawItem || typeof rawItem !== 'object') return false;
    const rt = String(rawItem.record_type || rawItem.recordType || '')
        .trim()
        .toLowerCase();
    if (rt === ZOHO_RECORD_TYPE) return true;
    const pk = String(rawItem.pk || rawItem.PK || rawItem.whatsapp_number || '')
        .trim()
        .toLowerCase();
    return pk.startsWith('zoho_novedad#');
}

/** Ítems Zoho no pertenecen al monitor En ingreso. */
function isOnboardingMonitorItem(data) {
    if (!data || typeof data !== 'object') return false;
    return !isZohoNovedadItem(data);
}

function mapStatusToId(status) {
    const s = normalizeStatus(status);
    if (s.includes('cargando')) return 1;
    if (s.includes('contactad') || s.includes('comunicacion')) return 2;
    if (s.includes('whatsapp') && s.includes('enviado')) return 3;
    if (s.includes('documentos') && s.includes('recib')) return 4;
    if (s.includes('sagrilaft')) return 5;
    if (
        s.includes('finalizado') ||
        s.includes('completado') ||
        s.includes('contrato recibido') ||
        (s.includes('contrato') && s.includes('pendiente') && s.includes('confirm')) ||
        s.includes('rechazado') ||
        s.includes('eliminad')
    ) {
        return 6;
    }
    return 0;
}

function mapDynamoItemToExecution(data) {
    let displayName = 'Sin Nombre';

    if (data['nombre y apellido']) {
        displayName = data['nombre y apellido'];
    } else if (data.nombre_y_apellido) {
        displayName = data.nombre_y_apellido;
    } else if (data.nombre && data.apellido) {
        displayName = `${data.nombre} ${data.apellido}`;
    } else if (data.nombre) {
        displayName = data.nombre + (data.apellido ? ` ${data.apellido}` : '');
    }

    const currentStatus = data.status || data.statuses || 'Desconocido';
    const safeData = { ...data };
    delete safeData.password;
    const redacted = buildSafeFullData(safeData);

    const tsCandidates = [
        data.ts_eliminado,
        data.ts_validacion_completada,
        data.ts_analisis_ia_completado,
        data.ts_primer_contacto_candidato,
        data.ts_documentos_recibidos
    ]
        .map((v) => new Date(v).getTime())
        .filter((v) => Number.isFinite(v) && v > 0);

    const effectiveTimestamp = tsCandidates.length > 0 ? Math.max(...tsCandidates) : Date.now();

    const executionId =
        data.whatsapp_number != null && String(data.whatsapp_number).trim() !== ''
            ? data.whatsapp_number
            : data.whatsappNumber != null && String(data.whatsappNumber).trim() !== ''
              ? data.whatsappNumber
              : data.id != null && String(data.id).trim() !== ''
                ? data.id
                : data.email
                  ? `email:${String(data.email).trim()}`
                  : `sin-clave:${crypto
                        .createHash('sha1')
                        .update(JSON.stringify({ n: displayName, s: currentStatus, t: effectiveTimestamp }))
                        .digest('hex')
                        .slice(0, 24)}`;

    return {
        executionId,
        workflowName: displayName,
        currentNodeName: currentStatus,
        status: 'running',
        timestamp: effectiveTimestamp,
        email: data.email,
        puesto: data.puesto,
        realStatus: currentStatus,
        statusId: mapStatusToId(currentStatus),
        fullData: redacted
    };
}

module.exports = {
    ZOHO_RECORD_TYPE,
    isZohoNovedadItem,
    isOnboardingMonitorItem,
    mapStatusToId,
    mapDynamoItemToExecution,
    normalizeStatus
};
