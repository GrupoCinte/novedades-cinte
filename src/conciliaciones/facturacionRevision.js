const ESTADOS = ['PENDIENTE', 'APROBADO_ANALISTA', 'APROBADO_FINANZAS', 'DEVUELTA', 'CONCILIADA'];

const {
    ELEVATED_ROLES,
    normalizeRole,
    isElevatedConciliacionRole,
    resolveConciliacionRevisionEtapa
} = require('./conciliacionRbac');

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
    return isElevatedConciliacionRole(role);
}

/** Etapa de revisión según rol (sin privilegio elevado). Analista y GP. */
function resolveRevisionEtapa(role) {
    return resolveConciliacionRevisionEtapa(role);
}

function resolveEffectiveEtapa(role, estadoActual) {
    if (isElevatedRole(role)) {
        const est = normalizeEstado(estadoActual);
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
    if (!etapa || etapa !== 'ANALISTA') return false;

    if (act === 'rechazar') return false;
    return est === 'PENDIENTE' || est === 'DEVUELTA';
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

    return { ok: false, error: 'Etapa de revisión no reconocida' };
}

function normalizeEtapaObjetivo(etapaObjetivo) {
    const etapa = String(etapaObjetivo || '').trim().toUpperCase();
    return etapa === 'ANALISTA' ? etapa : null;
}

/** Rol autorizado para actuar en la etapa fija (masiva). */
function canRoleActAtEtapa(role, etapaObjetivo) {
    const etapa = normalizeEtapaObjetivo(etapaObjetivo);
    if (!etapa) return false;
    const r = normalizeRole(role);
    if (ELEVATED_ROLES.has(r)) return true;
    return etapa === 'ANALISTA' && (r === 'analista_conciliaciones' || r === 'gp');
}

/** Elegibilidad por etapa fija (masiva), sin adaptar etapa por fila en roles elevados. */
function canActOnEstadoForEtapa(role, estadoActual, accion, etapaObjetivo) {
    const act = normalizeAccion(accion);
    if (!act) return false;
    const etapa = normalizeEtapaObjetivo(etapaObjetivo);
    if (!etapa || !canRoleActAtEtapa(role, etapa)) return false;

    const est = normalizeEstado(estadoActual);
    if (etapa === 'ANALISTA') {
        if (act === 'rechazar') return false;
        return est === 'PENDIENTE' || est === 'DEVUELTA';
    }
    return false;
}

function validateRevisionRequest({ role, estadoActual, accion, observacion, etapaObjetivo }) {
    const obs = String(observacion || '').trim();
    if (!obs) {
        return { ok: false, error: 'La observación es obligatoria', status: 400 };
    }
    const act = normalizeAccion(accion);
    if (!act) {
        return { ok: false, error: 'Acción inválida', status: 400 };
    }

    const etapaFija = normalizeEtapaObjetivo(etapaObjetivo);
    if (etapaFija) {
        if (!canActOnEstadoForEtapa(role, estadoActual, act, etapaFija)) {
            return {
                ok: false,
                error: 'No autorizado para esta acción en el estado actual',
                status: 403,
                skip: true
            };
        }
        const next = resolveNextEstado(estadoActual, act, etapaFija);
        if (!next.ok) {
            return { ok: false, error: next.error, status: 400, skip: true };
        }
        return { ok: true, ...next, observacion: obs };
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

/** Alias explícito para revisión masiva con etapa fija. */
function validateRevisionRequestMasiva(params) {
    return validateRevisionRequest(params);
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
    canActOnEstadoForEtapa,
    canRoleActAtEtapa,
    normalizeEtapaObjetivo,
    resolveNextEstado,
    validateRevisionRequest,
    validateRevisionRequestMasiva,
    canBypassEstadoChange
};
