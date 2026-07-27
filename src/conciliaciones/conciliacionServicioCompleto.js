'use strict';

const { normalizeEstado } = require('./facturacionRevision');

/** Consultor considerado aprobado para cierre de servicio (analista o legacy finanzas). */
function isEstadoConsultorAprobadoRevision(estado) {
    const e = normalizeEstado(estado);
    return e === 'APROBADO_ANALISTA' || e === 'APROBADO_FINANZAS' || e === 'CONCILIADA';
}

/** Todos los consultores del servicio aprobados por analista (o estados legacy equivalentes). */
function isServicioCompletoRevision(agg) {
    const { consultoresTotal, estados } = agg || {};
    if (!consultoresTotal) return false;
    const aprobados =
        (Number(estados?.APROBADO_ANALISTA) || 0) +
        (Number(estados?.APROBADO_FINANZAS) || 0) +
        (Number(estados?.CONCILIADA) || 0);
    return aprobados === consultoresTotal;
}

function countConsultoresAprobadosRevision(estados) {
    return (
        (Number(estados?.APROBADO_ANALISTA) || 0) +
        (Number(estados?.APROBADO_FINANZAS) || 0) +
        (Number(estados?.CONCILIADA) || 0)
    );
}

module.exports = {
    isEstadoConsultorAprobadoRevision,
    isServicioCompletoRevision,
    countConsultoresAprobadosRevision
};
