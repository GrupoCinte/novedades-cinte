'use strict';

/**
 * RBAC del módulo Conciliaciones.
 *
 * - analista_conciliaciones: CRUD completo (alcance wide).
 * - gp: CRUD completo (alcance clientes asignados).
 * - nomina: solo lectura (alcance wide / todo el módulo).
 * - super_admin / cac: elevated (bypass / CRUD).
 */

function normalizeRole(role) {
    return String(role || '').trim().toLowerCase();
}

const ELEVATED_ROLES = new Set(['super_admin', 'cac']);

/** Roles con mutaciones de cierre / servicio / correo / ajustes. */
const CONCILIACION_WRITE_ROLES = new Set([
    'analista_conciliaciones',
    'gp',
    'super_admin',
    'cac'
]);

/** Roles que ven todos los clientes en Conciliaciones. GP queda fuera (asignados). */
const WIDE_CONCILIACION_ROLES = new Set([
    'super_admin',
    'admin_ch',
    'admin_ops',
    'cac',
    'nomina',
    'analista_conciliaciones'
]);

function isElevatedConciliacionRole(role) {
    return ELEVATED_ROLES.has(normalizeRole(role));
}

function canWriteConciliacion(role) {
    return CONCILIACION_WRITE_ROLES.has(normalizeRole(role));
}

function isWideConciliacionRole(role) {
    return WIDE_CONCILIACION_ROLES.has(normalizeRole(role));
}

/** Solo lectura del módulo (nótese: no implica denegar entrada). */
function isConciliacionReadOnlyRole(role) {
    return normalizeRole(role) === 'nomina';
}

function canExportConciliacionServicio(role) {
    return canWriteConciliacion(role);
}

function canEnviarCorreoConciliacion(role) {
    const r = normalizeRole(role);
    return r === 'analista_conciliaciones' || r === 'gp' || r === 'super_admin' || r === 'cac';
}

function canMarcarConciliacionServicio(role) {
    return canWriteConciliacion(role);
}

function canRevertConciliacionCierre(role) {
    return canWriteConciliacion(role);
}

function canEditConciliacionAjustesRole(role) {
    return canWriteConciliacion(role);
}

/**
 * Etapa de revisión de consultor (aprobar filas).
 * Analista y GP actúan como ANALISTA; elevated solo en PENDIENTE/DEVUELTA.
 */
function resolveConciliacionRevisionEtapa(role) {
    const r = normalizeRole(role);
    if (r === 'analista_conciliaciones' || r === 'gp') return 'ANALISTA';
    return null;
}

module.exports = {
    normalizeRole,
    ELEVATED_ROLES,
    CONCILIACION_WRITE_ROLES,
    WIDE_CONCILIACION_ROLES,
    isElevatedConciliacionRole,
    canWriteConciliacion,
    isWideConciliacionRole,
    isConciliacionReadOnlyRole,
    canExportConciliacionServicio,
    canEnviarCorreoConciliacion,
    canMarcarConciliacionServicio,
    canRevertConciliacionCierre,
    canEditConciliacionAjustesRole,
    resolveConciliacionRevisionEtapa
};
