const ESTADOS = ['PENDIENTE', 'APROBADO_ANALISTA', 'APROBADO_FINANZAS', 'DEVUELTA', 'CONCILIADA'];

const ELEVATED_ROLES = new Set(['super_admin', 'cac']);

function normalizeRole(role) {
    return String(role || '').trim().toLowerCase();
}

function normalizeAccion(accion) {
    const a = String(accion || '').trim().toLowerCase();
    if (a === 'aprobar' || a === 'rechazar') return a;
    return '';
}

function normalizeEstado(estado) {
    const e = String(estado || 'PENDIENTE').trim();
    return ESTADOS.includes(e) ? e : 'PENDIENTE';
}

function isElevatedRole(role) {
    return ELEVATED_ROLES.has(normalizeRole(role));
}

/** Etapa de revisión según rol (sin privilegio elevado). */
function resolveRevisionEtapa(role) {
    const r = normalizeRole(role);
    if (r === 'analista_conciliaciones') return 'ANALISTA';
    if (r === 'nomina') return 'NOMINA';
    return null;
}

function resolveEffectiveEtapa(role, estadoActual) {
    if (isElevatedRole(role)) {
        const est = normalizeEstado(estadoActual);
        if (est === 'APROBADO_ANALISTA') return 'NOMINA';
        if (est === 'PENDIENTE' || est === 'DEVUELTA') return 'ANALISTA';
        return null;
    }
    return resolveRevisionEtapa(role);
}

function canActOnEstado(role, estadoActual, accion) {
    const act = normalizeAccion(accion);
    if (!act) return false;
    const est = normalizeEstado(estadoActual);
    const etapa = resolveEffectiveEtapa(role, est);
    if (!etapa) return false;

    if (etapa === 'ANALISTA') {
        if (act === 'rechazar') return false;
        return est === 'PENDIENTE' || est === 'DEVUELTA';
    }

    if (etapa === 'NOMINA') {
        return est === 'APROBADO_ANALISTA';
    }

    return false;
}

function resolveNextEstado(estadoActual, accion, etapa) {
    const act = normalizeAccion(accion);
    const est = normalizeEstado(estadoActual);
    if (!act || !etapa) {
        return { ok: false, error: 'Acción o etapa inválida' };
    }

    if (etapa === 'ANALISTA') {
        if (act === 'rechazar') {
            return { ok: false, error: 'El analista no puede rechazar en esta etapa' };
        }
        if (est !== 'PENDIENTE' && est !== 'DEVUELTA') {
            return { ok: false, error: 'El cierre no está pendiente de revisión del analista' };
        }
        return { ok: true, estado: 'APROBADO_ANALISTA', etapa: 'ANALISTA', accion: 'APROBAR' };
    }

    if (etapa === 'NOMINA') {
        if (est !== 'APROBADO_ANALISTA') {
            return { ok: false, error: 'El cierre no está pendiente de revisión de nómina' };
        }
        if (act === 'aprobar') {
            return { ok: true, estado: 'APROBADO_FINANZAS', etapa: 'NOMINA', accion: 'APROBAR' };
        }
        return { ok: true, estado: 'DEVUELTA', etapa: 'NOMINA', accion: 'RECHAZAR' };
    }

    return { ok: false, error: 'Etapa de revisión no reconocida' };
}

function validateRevisionRequest({ role, estadoActual, accion, observacion }) {
    const obs = String(observacion || '').trim();
    if (!obs) {
        return { ok: false, error: 'La observación es obligatoria', status: 400 };
    }
    const act = normalizeAccion(accion);
    if (!act) {
        return { ok: false, error: 'Acción inválida', status: 400 };
    }
    if (!canActOnEstado(role, estadoActual, act)) {
        return { ok: false, error: 'No autorizado para esta acción en el estado actual', status: 403 };
    }
    const etapa = resolveEffectiveEtapa(role, estadoActual);
    const next = resolveNextEstado(estadoActual, act, etapa);
    if (!next.ok) {
        return { ok: false, error: next.error, status: 400 };
    }
    return { ok: true, ...next, observacion: obs };
}

function canBypassEstadoChange(role) {
    return isElevatedRole(role);
}

module.exports = {
    ESTADOS,
    ELEVATED_ROLES,
    normalizeRole,
    normalizeAccion,
    normalizeEstado,
    isElevatedRole,
    resolveRevisionEtapa,
    resolveEffectiveEtapa,
    canActOnEstado,
    resolveNextEstado,
    validateRevisionRequest,
    canBypassEstadoChange
};
