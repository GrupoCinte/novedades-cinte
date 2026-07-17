'use strict';

const { resolveNovedadesBucket, mergeConciliacionServicioRows, filterRowsByServicioLideres } = require('./facturacionAggregate');
const { assertServicioListoExport, markServicioEnviada } = require('./conciliacionServicioCierre');
const { markServicioNotificacionSent, notifyStakeholdersConciliacionEnviada } = require('./conciliacionServicioNotify');
const { buildConciliacionCorreoLiderEvent } = require('../notifications/conciliacionEmailEvents');
const {
    createEmailActionViewToken,
    attachActionUrlsToEvent,
    formatEmailActionTokenTtlLabel,
    resolveEmailActionTokenTtlMs
} = require('./conciliacionEmailAccion');
const {
    buildConciliacionEmailTableHtml,
    normalizeColumnKeys,
    applyTemplateVars,
    monthLabel,
    escapeHtml
} = require('./conciliacionEmailColumns');
const { canEnviarCorreoConciliacion } = require('./conciliacionRbac');

function normalizeCedulaLocal(value) {
    return String(value || '').replace(/\D/g, '');
}

function isValidEmail(email) {
    const e = String(email || '').trim().toLowerCase();
    return e.includes('@') && e.includes('.');
}

function introTextToHtml(text) {
    return escapeHtml(String(text || ''))
        .split(/\n/)
        .map((line) => (line.trim() ? `<p style="margin:0 0 12px;font-size:14px;color:#334155;line-height:1.5;">${line}</p>` : ''))
        .join('');
}

async function loadConsultoresRowsForServicio(deps, scope, { servicioId, year, month }) {
    const { listServicios } = deps;
    const servicios = typeof listServicios === 'function' ? await listServicios(scope) : [];
    let serv = (Array.isArray(servicios) ? servicios : []).find((s) => String(s.id) === String(servicioId));

    // Fallback: item Dynamo crudo (email action sin listado scoped)
    if (!serv) {
        const serviciosDynamo = require('./serviciosDynamoData');
        const raw = await serviciosDynamo._getServiceById(servicioId);
        if (raw) {
            const asociados = Array.isArray(raw.consultores_asociados) ? raw.consultores_asociados : [];
            serv = {
                id: raw.id,
                client: String(raw.client || '').trim(),
                serviceName: String(raw.serviceName || '').trim(),
                billingMode: String(raw.billingMode || '').trim(),
                billingType: raw.billingType ? String(raw.billingType).trim() : '',
                baseHours: raw.baseHours != null ? Number(raw.baseHours) : null,
                consultoresCedulas: asociados.map((a) => String(a.cedula || '').trim()).filter(Boolean),
                lideresAsociados: serviciosDynamo._normalizeLideresAsociados(raw.lideres_asociados)
            };
        }
    }

    if (!serv) {
        const error = new Error('Servicio no encontrado');
        error.status = 404;
        throw error;
    }

    const clienteCanon = String(serv.client || '').trim();
    const chk = await require('./conciliacionesQueries').assertClienteConciliacionPermitido(deps, scope, clienteCanon);
    if (!chk.ok) {
        const error = new Error(chk.error || 'No autorizado');
        error.status = chk.status || 403;
        throw error;
    }

    const novBucket = resolveNovedadesBucket(year, month, serv.billingType);
    const resumen = await require('./conciliacionesQueries').getConciliacionResumenPorClienteMes(
        deps,
        scope,
        chk.canon,
        year,
        month,
        {
            novedadesYear: novBucket.year,
            novedadesMonth: novBucket.month,
            billingType: serv.billingType,
            billingMode: serv.billingMode,
            baseHours: serv.baseHours
        }
    );

    let cedulas = (Array.isArray(serv.consultoresCedulas) ? serv.consultoresCedulas : [])
        .map(normalizeCedulaLocal)
        .filter(Boolean);
    if (!cedulas.length && Array.isArray(serv.consultores_asociados)) {
        cedulas = serv.consultores_asociados
            .map((a) => normalizeCedulaLocal(a?.cedula))
            .filter(Boolean);
    }
    const rows = filterRowsByServicioLideres(
        mergeConciliacionServicioRows(resumen.rows || [], cedulas),
        serv.lideresAsociados || serv.lideres_asociados,
        cedulas
    );

    return { serv, clienteCanon: chk.canon, rows, cedulas, resumen };
}

async function enviarCorreoConciliacionServicio(deps, scope, payload, actor) {
    const { pool, emailNotificationsPublisher, frontendUrl } = deps;
    const servicioId = String(payload?.servicioId || '').trim();
    const year = Number(payload?.anio ?? payload?.year);
    const month = Number(payload?.mes ?? payload?.month);
    const destinatario = payload?.destinatario || {};
    const destEmail = String(destinatario?.email || '').trim().toLowerCase();
    const destNombre = String(destinatario?.nombre || '').trim();

    if (!servicioId || !Number.isFinite(year) || !Number.isFinite(month)) {
        const error = new Error('servicioId, anio y mes son requeridos');
        error.status = 400;
        throw error;
    }
    if (!isValidEmail(destEmail)) {
        const error = new Error('Email del destinatario inválido');
        error.status = 400;
        throw error;
    }

    const role = String(scope?.role || '').trim().toLowerCase();
    if (!canEnviarCorreoConciliacion(role)) {
        const error = new Error('No autorizado para enviar correo de conciliación');
        error.status = 403;
        throw error;
    }

    const { serv, clienteCanon, rows, cedulas, resumen } = await loadConsultoresRowsForServicio(deps, scope, {
        servicioId,
        year,
        month
    });

    await assertServicioListoExport(deps, scope, {
        servicioId,
        year,
        month,
        rows: resumen.rows || [],
        cedulas
    });

    const columnas = normalizeColumnKeys(payload?.columnas);
    if (!columnas.length) {
        const error = new Error('Debe seleccionar al menos una columna');
        error.status = 400;
        throw error;
    }

    const mesLabel = monthLabel(year, month);
    const templateVars = {
        nombreLider: destNombre || 'Líder',
        servicio: serv.serviceName || servicioId,
        cliente: clienteCanon,
        mes: mesLabel
    };

    const asunto =
        String(payload?.asunto || '').trim() ||
        applyTemplateVars('Conciliación {servicio} — {mes}', templateVars);
    const introText =
        String(payload?.introText || payload?.introHtml || '').trim() ||
        applyTemplateVars(
            'Estimado/a {nombreLider},\n\nA continuación adjuntamos la conciliación para el mes de {mes}.',
            templateVars
        );
    const cierreText = String(payload?.cierreText || payload?.cierreHtml || '').trim();

    const tableHtml = buildConciliacionEmailTableHtml(rows, columnas);
    const introHtml = introTextToHtml(introText);
    const cierreHtml = cierreText ? introTextToHtml(cierreText) : '';

    const ttlMs = resolveEmailActionTokenTtlMs();
    const plazoLabel = formatEmailActionTokenTtlLabel(ttlMs);
    const ttlHours = Math.round(ttlMs / (60 * 60 * 1000));

    const eventPayloadBase = buildConciliacionCorreoLiderEvent({
        servicioId,
        servicioName: serv.serviceName,
        cliente: clienteCanon,
        anio: year,
        mes: month,
        destinatario: { email: destEmail, nombre: destNombre },
        asunto,
        introHtml,
        tableHtml,
        cierreHtml,
        columnas,
        sentBy: {
            email: actor?.email,
            nombre: actor?.full_name || actor?.name || actor?.nombre
        },
        frontendUrl,
        plazoLabel,
        ttlHours
    });

    const tokenInfo = await createEmailActionViewToken(pool, {
        servicioId,
        anio: year,
        mes: month,
        recipientEmail: destEmail,
        eventId: eventPayloadBase.eventId,
        columnas
    });
    const eventPayload = attachActionUrlsToEvent(
        {
            ...eventPayloadBase,
            plazoLabel: tokenInfo.plazoLabel,
            ttlHours: tokenInfo.ttlHours,
            expiraAt: tokenInfo.expiraAt.toISOString()
        },
        tokenInfo,
        frontendUrl
    );

    let accepted = false;
    try {
        const pub = await emailNotificationsPublisher?.publishConciliacionCorreoLider?.(eventPayload);
        accepted = Boolean(pub?.accepted);
    } catch (e) {
        console.error('[conciliaciones/email] Error publicando conciliacion_correo_lider', e);
        const error = new Error('No se pudo enviar el correo');
        error.status = 502;
        throw error;
    }

    if (!accepted) {
        const error = new Error('El servicio de correo no aceptó el envío');
        error.status = 502;
        throw error;
    }

    await markServicioNotificacionSent(pool, servicioId, year, month, eventPayload.eventId, 'CORREO_LIDER');

    try {
        await notifyStakeholdersConciliacionEnviada(deps, {
            servicioId,
            servicioName: serv.serviceName,
            cliente: clienteCanon,
            anio: year,
            mes: month,
            liderEmail: destEmail,
            liderNombre: destNombre,
            sentBy: {
                email: actor?.email,
                nombre: actor?.full_name || actor?.name || actor?.nombre
            }
        });
    } catch (e) {
        console.error('[conciliaciones/email] Error notificando stakeholders tras envío líder', e);
    }

    const revActor = {
        userId: actor?.id || actor?.sub || null,
        email: actor?.email || '',
        actor_email: actor?.email || ''
    };
    const cierreApi = await markServicioEnviada(pool, {
        servicioId,
        year,
        month,
        actor: revActor
    });

    return {
        ok: true,
        eventId: eventPayload.eventId,
        destinatario: { email: destEmail, nombre: destNombre },
        asunto,
        columnas,
        plazoLabel: tokenInfo.plazoLabel,
        ...cierreApi
    };
}

module.exports = {
    enviarCorreoConciliacionServicio,
    loadConsultoresRowsForServicio
};
