const SAFE_FULLDATA_KEYS = new Set([
    'email',
    'puesto',
    'status',
    'statuses',
    'nombre',
    'apellido',
    'nombre y apellido',
    'nombre_y_apellido',
    'ts_documentos_recibidos',
    'ts_primer_contacto_candidato',
    'ts_analisis_ia_completado',
    'ts_validacion_completada',
    'ts_eliminado',
    'obs_eliminado',
    'documentos',
    'whatsapp_numerico',
    'whatsapp',
    'telefono',
    'celular',
    'canal',
    'workflow',
    'origen',
    'fuente',
    'empresa',
    'cargo'
]);

function isSensitiveKey(key) {
    const lk = String(key).toLowerCase();
    return (
        lk.includes('password') ||
        lk.includes('token') ||
        lk.includes('secret') ||
        lk.includes('apikey') ||
        lk.includes('api_key') ||
        lk.includes('cedula') ||
        lk.includes('cédula') ||
        lk.includes('documento_identidad') ||
        lk.includes('direccion') ||
        lk.includes('dirección') ||
        lk.includes('salario') ||
        lk.includes('salary')
    );
}

function redactNested(value) {
    if (Array.isArray(value)) {
        return value.map(redactNested);
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
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
        if (!SAFE_FULLDATA_KEYS.has(k)) continue;
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
    delete safeData.cedula;
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

    return {
        executionId: data.whatsapp_number,
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
    normalizeStatus,
    mapStatusToId,
    mapDynamoItemToExecution
};
