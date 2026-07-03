'use strict';

const { randomUUID } = require('crypto');
const { buildConciliacionServicioFinalizadaEvent } = require('../notifications/conciliacionEmailEvents');
const {
    aggregateServicioCierre,
    deriveEstadoCola,
    resolveNovedadesBucket
} = require('./facturacionAggregate');
const { normalizeEstado } = require('./facturacionRevision');

function normalizeCedulaLocal(value) {
    return String(value || '').replace(/\D/g, '');
}

function servicioMatchesCliente(serv, clienteCanon) {
    const a = String(serv?.client || '')
        .trim()
        .toLowerCase();
    const b = String(clienteCanon || '')
        .trim()
        .toLowerCase();
    return a && b && a === b;
}

function isServicioCompletoFinanzas(agg) {
    const { consultoresTotal, estados } = agg || {};
    if (!consultoresTotal) return false;
    const fin =
        (Number(estados?.APROBADO_FINANZAS) || 0) + (Number(estados?.CONCILIADA) || 0);
    return fin === consultoresTotal;
}

async function wasServicioNotificacionSent(pool, servicioId, anio, mes, tipo = 'SERVICIO_FINALIZADO') {
    const q = await pool.query(
        `SELECT 1 FROM conciliaciones_servicio_notificaciones
         WHERE servicio_id = $1 AND anio = $2::integer AND mes = $3::integer AND tipo = $4
         LIMIT 1`,
        [String(servicioId), Number(anio), Number(mes), tipo]
    );
    return (q.rowCount || 0) > 0;
}

async function markServicioNotificacionSent(pool, servicioId, anio, mes, eventId, tipo = 'SERVICIO_FINALIZADO') {
    await pool.query(
        `INSERT INTO conciliaciones_servicio_notificaciones (servicio_id, anio, mes, tipo, event_id)
         VALUES ($1, $2::integer, $3::integer, $4, $5)
         ON CONFLICT (servicio_id, anio, mes, tipo) DO NOTHING`,
        [String(servicioId), Number(anio), Number(mes), tipo, String(eventId)]
    );
}

async function collectAnalistaRecipients(pool, cedulas, anio, mes) {
    if (!cedulas.length) return [];
    const q = await pool.query(
        `SELECT DISTINCT actor_email, actor_nombre
         FROM conciliaciones_facturacion_historial
         WHERE regexp_replace(COALESCE(cedula, ''), '\\D', '', 'g') = ANY($1::text[])
           AND anio = $2::integer AND mes = $3::integer
           AND etapa = 'ANALISTA' AND accion = 'APROBAR'
           AND actor_email IS NOT NULL`,
        [cedulas, Number(anio), Number(mes)]
    );
    const seen = new Set();
    const out = [];
    for (const r of q.rows || []) {
        const email = String(r.actor_email || '')
            .trim()
            .toLowerCase();
        if (!email.includes('@') || seen.has(email)) continue;
        seen.add(email);
        out.push({ email, name: String(r.actor_nombre || '').trim() || email });
    }
    return out;
}

/**
 * Tras APROBADO_FINANZAS, evalúa servicios del cliente y envía correo resumen idempotente.
 */
async function tryNotifyServiciosCompletos(deps, scope, { clienteCanon, anio, mes, actor }) {
    const { pool, listServicios, getConciliacionResumenPorClienteMes, emailNotificationsPublisher, frontendUrl } =
        deps;
    if (!pool || typeof listServicios !== 'function' || typeof getConciliacionResumenPorClienteMes !== 'function') {
        return { notified: 0 };
    }

    const servicios = await listServicios(scope);
    const matching = (Array.isArray(servicios) ? servicios : []).filter((s) =>
        servicioMatchesCliente(s, clienteCanon)
    );
    if (!matching.length) return { notified: 0 };

    let notified = 0;
    for (const serv of matching) {
        const cedulas = (Array.isArray(serv.consultoresCedulas) ? serv.consultoresCedulas : [])
            .map(normalizeCedulaLocal)
            .filter(Boolean);
        if (!cedulas.length) continue;

        const novBucket = resolveNovedadesBucket(anio, mes, serv.billingType);
        const resumen = await getConciliacionResumenPorClienteMes(deps, scope, clienteCanon, anio, mes, {
            novedadesYear: novBucket.year,
            novedadesMonth: novBucket.month,
            billingType: serv.billingType,
            billingMode: serv.billingMode,
            baseHours: serv.baseHours
        });
        const agg = aggregateServicioCierre(resumen.rows || [], cedulas);
        if (!isServicioCompletoFinanzas(agg)) continue;

        try {
            const { ensureListoExportIfCompleto } = require('./conciliacionServicioCierre');
            await ensureListoExportIfCompleto(pool, serv.id, anio, mes, agg);
        } catch (e) {
            console.error('[conciliaciones] ensureListoExportIfCompleto', { servicioId: serv.id, anio, mes, error: e.message });
        }

        const already = await wasServicioNotificacionSent(pool, serv.id, anio, mes);
        if (already) continue;

        const consultores = (resumen.rows || [])
            .filter((r) => cedulas.includes(normalizeCedulaLocal(r.cedula)))
            .map((r) => ({
                nombre: r.nombre,
                cedula: r.cedula,
                estado: r.estado,
                facturaCop: r.facturaCop
            }));

        const recipients = await collectAnalistaRecipients(pool, cedulas, anio, mes);
        if (!recipients.length) {
            console.warn('[conciliaciones/email] Sin destinatarios analista para servicio completo', {
                servicioId: serv.id,
                anio,
                mes
            });
            continue;
        }

        const eventPayload = buildConciliacionServicioFinalizadaEvent({
            servicioId: serv.id,
            servicioName: serv.serviceName,
            cliente: clienteCanon,
            anio,
            mes,
            billingType: serv.billingType,
            billingMode: serv.billingMode,
            totales: agg.totales,
            consultores,
            recipients,
            approvedBy: {
                email: actor?.email,
                nombre: actor?.full_name || actor?.name || actor?.nombre
            },
            frontendUrl
        });

        let accepted = false;
        try {
            const pub = await emailNotificationsPublisher?.publishConciliacionServicioFinalizada?.(eventPayload);
            accepted = Boolean(pub?.accepted);
        } catch (e) {
            console.error('[conciliaciones/email] Error publicando conciliacion_servicio_finalizada', e);
        }

        if (accepted) {
            await markServicioNotificacionSent(pool, serv.id, anio, mes, eventPayload.eventId);
            notified += 1;
        }
    }

    return { notified };
}

module.exports = {
    tryNotifyServiciosCompletos,
    isServicioCompletoFinanzas,
    aggregateServicioCierre,
    deriveEstadoCola,
    normalizeCedulaLocal
};
