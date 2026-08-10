import { SESClient } from '@aws-sdk/client-ses';
import { render } from '@react-email/render';
import * as React from 'react';
import { UserConfirmationEmail } from './templates/UserConfirmationEmail.js';
import { AdminNotificationEmail } from './templates/AdminNotificationEmail.js';
import { ConciliacionCorreoLiderEmail } from './templates/ConciliacionCorreoLiderEmail.js';
import { ConciliacionServicioFinalizadaEmail } from './templates/ConciliacionServicioFinalizadaEmail.js';
import { ConciliacionStakeholdersAvisoEmail } from './templates/ConciliacionStakeholdersAvisoEmail.js';
import { TimeEntryConfirmationEmail } from './templates/TimeEntryConfirmationEmail.js';
import { AdminTimeEntryNotificationEmail } from './templates/AdminTimeEntryNotificationEmail.js';
import { SeguimientoCierreEmail } from './templates/SeguimientoCierreEmail.js';
import { SeguimientoVencimientoEmail } from './templates/SeguimientoVencimientoEmail.js';
import { sendHtmlEmailWithInlineLogo } from './sesSend.js';
const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' });
const fromEmail = String(process.env.SES_FROM_EMAIL || '').trim();
const adminToCsv = String(process.env.EMAIL_ADMIN_TO_CSV || '').trim();
const adminToSingle = String(process.env.EMAIL_ADMIN_TO || '').trim();
function json(statusCode, data) {
    return {
        statusCode,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data)
    };
}
function parseRawPayload(rawEvent) {
    const maybeApiEvent = rawEvent;
    return typeof maybeApiEvent?.body === 'string' ? JSON.parse(maybeApiEvent.body) : rawEvent;
}
function parseConciliacionCorreoLider(data) {
    if (data?.eventType !== 'conciliacion_correo_lider') {
        throw new Error('eventType invalido');
    }
    if (!data?.eventId)
        throw new Error('eventId requerido');
    if (!String(data?.conciliacionServicioId || '').trim())
        throw new Error('conciliacionServicioId requerido');
    const email = String(data?.recipient?.email || '').trim();
    if (!email.includes('@'))
        throw new Error('recipient.email invalido');
    if (!String(data?.asunto || '').trim())
        throw new Error('asunto requerido');
    if (!String(data?.servicio?.cliente || '').trim())
        throw new Error('servicio.cliente requerido');
    return data;
}
function parseConciliacionServicioFinalizada(data) {
    if (data?.eventType !== 'conciliacion_servicio_finalizada') {
        throw new Error('eventType invalido');
    }
    if (!data?.eventId)
        throw new Error('eventId requerido');
    if (!String(data?.conciliacionServicioId || '').trim())
        throw new Error('conciliacionServicioId requerido');
    const recipients = data.recipients;
    if (!Array.isArray(recipients) || recipients.length === 0)
        throw new Error('recipients requerido');
    for (const r of recipients) {
        if (!String(r?.email || '').includes('@'))
            throw new Error('recipients.email invalido');
    }
    if (!String(data?.servicio?.cliente || '').trim())
        throw new Error('servicio.cliente requerido');
    if (!String(data?.admin?.actionUrl || '').trim())
        throw new Error('admin.actionUrl requerido');
    return data;
}
function parseConciliacionStakeholdersAviso(data) {
    if (data?.eventType !== 'conciliacion_stakeholders_aviso') {
        throw new Error('eventType invalido');
    }
    if (!data?.eventId)
        throw new Error('eventId requerido');
    if (!String(data?.conciliacionServicioId || '').trim())
        throw new Error('conciliacionServicioId requerido');
    const kind = String(data?.kind || '').trim();
    if (!['enviada', 'aprobada', 'rechazada', 'parcial'].includes(kind)) {
        throw new Error('kind invalido');
    }
    const recipients = data.recipients;
    if (!Array.isArray(recipients) || recipients.length === 0)
        throw new Error('recipients requerido');
    for (const r of recipients) {
        if (!String(r?.email || '').includes('@'))
            throw new Error('recipients.email invalido');
    }
    if (!String(data?.servicio?.cliente || '').trim())
        throw new Error('servicio.cliente requerido');
    return data;
}
function parseTimeEntryEvent(data) {
    if (data?.eventType !== 'time_entry_confirmation' && data?.eventType !== 'time_entry_admin_notification') {
        throw new Error('eventType invalido');
    }
    if (!data?.eventId)
        throw new Error('eventId requerido');
    if (!data?.entryId)
        throw new Error('entryId requerido');
    const email = String(data?.consultant?.email || '').trim();
    if (!email.includes('@'))
        throw new Error('consultant.email invalido');
    if (!['created', 'updated', 'deleted'].includes(String(data?.action || ''))) {
        throw new Error('action invalida');
    }
    if (!String(data?.entryData?.date || '').trim())
        throw new Error('entryData.date requerido');
    if (!String(data?.entryData?.description || '').trim())
        throw new Error('entryData.description requerido');
    if (!String(data?.entryData?.client || '').trim())
        throw new Error('entryData.client requerido');
    if (!String(data?.entryData?.schedule || '').trim())
        throw new Error('entryData.schedule requerido');
    return data;
}
function parseFormEvent(data) {
    if (!data?.eventId)
        throw new Error('eventId requerido');
    if (!data?.novedadId)
        throw new Error('novedadId requerido');
    if (!String(data?.user?.email || '').includes('@'))
        throw new Error('user.email invalido');
    if (data.eventType === 'form_submitted') {
        if (!String(data?.admin?.actionUrl || '').trim())
            throw new Error('admin.actionUrl requerido');
        return data;
    }
    const statusEvent = data;
    if (!statusEvent?.statusChange?.newEstado)
        throw new Error('statusChange.newEstado requerido');
    if (!statusEvent?.statusChange?.previousEstado)
        throw new Error('statusChange.previousEstado requerido');
    if (!['Aprobado', 'Rechazado'].includes(String(statusEvent.statusChange.newEstado))) {
        throw new Error('statusChange.newEstado invalido');
    }
    return statusEvent;
}
function parseEventPayload(rawEvent) {
    const payload = parseRawPayload(rawEvent);
    const data = payload;
    // Eventos de actividades (consultor y admin)
    if (data?.eventType === 'time_entry_admin_notification' || data?.eventType === 'time_entry_confirmation') {
        return parseTimeEntryEvent(data);
    }
    // Eventos de conciliaciones
    if (data?.eventType === 'conciliacion_correo_lider') {
        return parseConciliacionCorreoLider(data);
    }
    if (data?.eventType === 'conciliacion_servicio_finalizada') {
        return parseConciliacionServicioFinalizada(data);
    }
    if (data?.eventType === 'conciliacion_stakeholders_aviso') {
        return parseConciliacionStakeholdersAviso(data);
    }
    // Eventos de novedades (formularios)
    if (data?.eventType === 'form_submitted' || data?.eventType === 'form_status_changed') {
        return parseFormEvent(data);
    }
    if (data?.eventType === 'seguimiento_cierre') {
        return parseSeguimientoCierre(data);
    }
    if (data?.eventType === 'seguimiento_vencimiento') {
        return parseSeguimientoVencimiento(data);
    }
    throw new Error('eventType invalido');
}
function parseSeguimientoCierre(data) {
    if (data?.eventType !== 'seguimiento_cierre')
        throw new Error('eventType invalido');
    if (!data?.eventId)
        throw new Error('eventId requerido');
    if (!String(data?.seguimientoId || '').trim())
        throw new Error('seguimientoId requerido');
    if (!['consultor', 'cliente'].includes(String(data?.tipo || '')))
        throw new Error('tipo invalido');
    const recipients = data.recipients;
    if (!Array.isArray(recipients) || recipients.length === 0)
        throw new Error('recipients requerido');
    for (const r of recipients) {
        if (!String(r?.email || '').includes('@'))
            throw new Error('recipients.email invalido');
    }
    if (!String(data?.acta?.cliente || '').trim())
        throw new Error('acta.cliente requerido');
    return data;
}
function parseSeguimientoVencimiento(data) {
    if (data?.eventType !== 'seguimiento_vencimiento')
        throw new Error('eventType invalido');
    if (!data?.eventId)
        throw new Error('eventId requerido');
    if (!String(data?.seguimientoId || '').trim())
        throw new Error('seguimientoId requerido');
    if (!['T5', 'T1'].includes(String(data?.kind || '')))
        throw new Error('kind invalido');
    const recipients = data.recipients;
    if (!Array.isArray(recipients) || recipients.length === 0)
        throw new Error('recipients requerido');
    for (const r of recipients) {
        if (!String(r?.email || '').includes('@'))
            throw new Error('recipients.email invalido');
    }
    if (!String(data?.venceEl || '').trim())
        throw new Error('venceEl requerido');
    return data;
}
function resolveAdminRecipientsFromEnv() {
    const csv = adminToCsv
        .split(',')
        .map((email) => email.trim())
        .filter(Boolean);
    const combined = [...csv, adminToSingle].filter(Boolean);
    return Array.from(new Set(combined));
}
function resolveNotifyToFromPayload(payload) {
    const raw = payload.admin?.notifyTo;
    if (!Array.isArray(raw))
        return [];
    const seen = new Set();
    const out = [];
    for (const item of raw) {
        const e = String(item || '').trim().toLowerCase();
        if (!e.includes('@'))
            continue;
        if (seen.has(e))
            continue;
        seen.add(e);
        out.push(e);
    }
    return out;
}
/**
 * Si el payload incluye la clave `admin.notifyTo` (p. ej. [] desde el backend tras Cognito),
 * no se usa EMAIL_ADMIN_TO*: evita que un correo “de prueba” reciba avisos de tipos que no corresponden a su rol.
 * Si la clave no existe (eventos antiguos), se mantiene el fallback por ENV.
 */
function resolveAdminRecipientsForSubmitted(payload) {
    const admin = payload.admin;
    if (admin != null && Object.prototype.hasOwnProperty.call(admin, 'notifyTo')) {
        return resolveNotifyToFromPayload(payload);
    }
    return resolveAdminRecipientsFromEnv();
}
/**
 * Destinatarios admin para actividades:
 * 1) `admin.notifyTo` si el backend lo envió (Cognito/BD)
 * 2) SUPER_ADMIN_EMAILS / CAC_EMAILS / GP_EMAILS
 * 3) EMAIL_ADMIN_TO / EMAIL_ADMIN_TO_CSV (mismo fallback que novedades)
 */
async function resolveAdminRecipientsForActivity(payload) {
    const admin = payload.admin;
    if (admin != null && Object.prototype.hasOwnProperty.call(admin, 'notifyTo')) {
        const fromPayload = resolveNotifyToFromPayload({ admin });
        if (fromPayload.length > 0)
            return fromPayload;
        // notifyTo explícito vacío: no caer a ENV (misma regla que form_submitted)
        return [];
    }
    const fromRoleEnv = [
        ...(process.env.SUPER_ADMIN_EMAILS || '').split(','),
        ...(process.env.CAC_EMAILS || '').split(','),
        ...(process.env.GP_EMAILS || '').split(',')
    ]
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes('@'));
    if (fromRoleEnv.length > 0) {
        return Array.from(new Set(fromRoleEnv));
    }
    return resolveAdminRecipientsFromEnv();
}
function monthLabel(anio, mes) {
    const names = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const m = Math.max(1, Math.min(12, Number(mes) || 1));
    return `${names[m - 1]} ${anio}`;
}
export const handler = async (event) => {
    try {
        if (!fromEmail)
            throw new Error('SES_FROM_EMAIL no configurado');
        const payload = parseEventPayload(event);
        if (payload.eventType === 'seguimiento_cierre') {
            const html = await render(React.createElement(SeguimientoCierreEmail, { payload }));
            const subject = `Seguimiento finalizado — ${payload.acta.cliente}`;
            const settled = await Promise.allSettled(payload.recipients.map((r) => sendHtmlEmailWithInlineLogo(sesClient, {
                from: fromEmail,
                to: String(r.email).trim(),
                subject,
                html
            })));
            const messageIds = {};
            const failures = [];
            for (let i = 0; i < settled.length; i += 1) {
                const to = String(payload.recipients[i]?.email || '').trim();
                const entry = settled[i];
                if (entry.status === 'rejected') {
                    const err = entry.reason;
                    failures.push({ to, message: err?.message || String(entry.reason) });
                    continue;
                }
                messageIds[to] = entry.value.MessageId || null;
            }
            if (failures.length > 0) {
                return json(500, {
                    ok: false,
                    eventId: payload.eventId,
                    errorType: 'PartialOrFullEmailFailure',
                    message: 'Uno o más correos de cierre de seguimiento no se pudieron enviar.',
                    messageIds,
                    failures
                });
            }
            return json(200, { ok: true, eventId: payload.eventId, messageIds });
        }
        if (payload.eventType === 'seguimiento_vencimiento') {
            const html = await render(React.createElement(SeguimientoVencimientoEmail, { payload }));
            const dias = payload.kind === 'T5' ? '5' : '1';
            const subject = `Seguimiento vence en ${dias} día${dias === '1' ? '' : 's'} — ${payload.sujetoLabel}`;
            const settled = await Promise.allSettled(payload.recipients.map((r) => sendHtmlEmailWithInlineLogo(sesClient, {
                from: fromEmail,
                to: String(r.email).trim(),
                subject,
                html
            })));
            const messageIds = {};
            const failures = [];
            for (let i = 0; i < settled.length; i += 1) {
                const to = String(payload.recipients[i]?.email || '').trim();
                const entry = settled[i];
                if (entry.status === 'rejected') {
                    const err = entry.reason;
                    failures.push({ to, message: err?.message || String(entry.reason) });
                    continue;
                }
                messageIds[to] = entry.value.MessageId || null;
            }
            if (failures.length > 0) {
                return json(500, {
                    ok: false,
                    eventId: payload.eventId,
                    errorType: 'PartialOrFullEmailFailure',
                    message: 'Uno o más correos de vencimiento de seguimiento no se pudieron enviar.',
                    messageIds,
                    failures
                });
            }
            return json(200, { ok: true, eventId: payload.eventId, messageIds });
        }
        if (payload.eventType === 'conciliacion_correo_lider') {
            const html = await render(React.createElement(ConciliacionCorreoLiderEmail, { payload }));
            const subject = String(payload.asunto || '').trim();
            const result = await sendHtmlEmailWithInlineLogo(sesClient, {
                from: fromEmail,
                to: String(payload.recipient.email).trim(),
                subject,
                html
            });
            return json(200, {
                ok: true,
                eventId: payload.eventId,
                messageIds: { to: result.MessageId || null }
            });
        }
        if (payload.eventType === 'conciliacion_stakeholders_aviso') {
            const html = await render(React.createElement(ConciliacionStakeholdersAvisoEmail, { payload }));
            const ml = monthLabel(payload.servicio.anio, payload.servicio.mes);
            const KIND_LABEL_MAP = {
                enviada: 'enviada al líder',
                aprobada: 'aprobada',
                rechazada: 'rechazada',
                parcial: 'cerrada parcial'
            };
            const kindLabel = KIND_LABEL_MAP[payload.kind] || 'cerrada parcial';
            const subject = `Conciliación ${kindLabel} — ${payload.servicio.cliente} / ${payload.servicio.serviceName} (${ml})`;
            const settled = await Promise.allSettled(payload.recipients.map((r) => sendHtmlEmailWithInlineLogo(sesClient, {
                from: fromEmail,
                to: String(r.email).trim(),
                subject,
                html
            })));
            const messageIds = {};
            const failures = [];
            for (let i = 0; i < settled.length; i += 1) {
                const to = String(payload.recipients[i]?.email || '').trim();
                const entry = settled[i];
                if (entry.status === 'rejected') {
                    const err = entry.reason;
                    failures.push({ to, message: err?.message || String(entry.reason) });
                    continue;
                }
                messageIds[to] = entry.value.MessageId || null;
            }
            if (failures.length > 0) {
                return json(500, {
                    ok: false,
                    eventId: payload.eventId,
                    errorType: 'PartialOrFullEmailFailure',
                    message: 'Uno o más correos de aviso de conciliación no se pudieron enviar.',
                    messageIds,
                    failures
                });
            }
            return json(200, { ok: true, eventId: payload.eventId, messageIds });
        }
        if (payload.eventType === 'conciliacion_servicio_finalizada') {
            const html = await render(React.createElement(ConciliacionServicioFinalizadaEmail, { payload }));
            const ml = monthLabel(payload.servicio.anio, payload.servicio.mes);
            const subject = `Conciliación finalizada — ${payload.servicio.cliente} / ${payload.servicio.serviceName} (${ml})`;
            const settled = await Promise.allSettled(payload.recipients.map((r) => sendHtmlEmailWithInlineLogo(sesClient, {
                from: fromEmail,
                to: String(r.email).trim(),
                subject,
                html
            })));
            const messageIds = {};
            const failures = [];
            for (let i = 0; i < settled.length; i += 1) {
                const to = String(payload.recipients[i]?.email || '').trim();
                const entry = settled[i];
                if (entry.status === 'rejected') {
                    const err = entry.reason;
                    failures.push({ to, message: err?.message || String(entry.reason) });
                    continue;
                }
                messageIds[to] = entry.value.MessageId || null;
            }
            if (failures.length > 0) {
                return json(500, {
                    ok: false,
                    eventId: payload.eventId,
                    errorType: 'PartialOrFullEmailFailure',
                    message: 'Uno o más correos de conciliación no se pudieron enviar.',
                    messageIds,
                    failures
                });
            }
            return json(200, { ok: true, eventId: payload.eventId, messageIds });
        }
        if (payload.eventType === 'time_entry_confirmation') {
            const html = await render(React.createElement(TimeEntryConfirmationEmail, { payload }));
            const ACTION_LABEL_MAP = {
                created: 'creada',
                updated: 'actualizada',
                deleted: 'eliminada'
            };
            const actionLabel = ACTION_LABEL_MAP[payload.action] || 'eliminada';
            const subject = `Confirmación: entrada ${actionLabel}`;
            const result = await sendHtmlEmailWithInlineLogo(sesClient, {
                from: fromEmail,
                to: payload.consultant.email,
                subject,
                html
            });
            return json(200, {
                ok: true,
                eventId: payload.eventId,
                messageIds: { to: result.MessageId || null }
            });
        }
        // ===== ADMINISTRADORES =====
        if (payload.eventType === 'time_entry_admin_notification') {
            const typedPayload = payload;
            const html = await render(React.createElement(AdminTimeEntryNotificationEmail, { payload: typedPayload }));
            const ADMIN_ACTION_TEXT_MAP = {
                created: 'registrada',
                updated: 'actualizada',
                deleted: 'eliminada'
            };
            const adminActionText = ADMIN_ACTION_TEXT_MAP[typedPayload.action] || 'actualizada';
            const subject = `Nueva actividad ${adminActionText} por ${typedPayload.consultant.name}`;
            const adminEmails = await resolveAdminRecipientsForActivity(typedPayload);
            // Si no hay destinatarios, registrar y terminar
            if (adminEmails.length === 0) {
                console.warn('[email-transactions] Sin destinatarios admin para actividad', {
                    entryId: payload.entryId,
                    client: payload.entryData.client
                });
                return json(200, {
                    ok: true,
                    eventId: payload.eventId,
                    messageIds: { admin: null },
                    warn: 'no_admin_recipients'
                });
            }
            const settled = await Promise.allSettled(adminEmails.map((email) => sendHtmlEmailWithInlineLogo(sesClient, {
                from: fromEmail,
                to: email,
                subject,
                html
            })));
            // Manejo de resultados
            const failures = [];
            const messageIds = {};
            for (let i = 0; i < settled.length; i += 1) {
                const to = adminEmails[i];
                const entry = settled[i];
                if (entry.status === 'rejected') {
                    const err = entry.reason;
                    failures.push({ to, message: err?.message || String(entry.reason) });
                    continue;
                }
                messageIds[to] = entry.value.MessageId || null;
            }
            if (failures.length > 0) {
                console.error('[email-transactions] Algunos correos admin fallaron', {
                    eventId: payload.eventId,
                    failures
                });
                return json(500, {
                    ok: false,
                    eventId: payload.eventId,
                    errorType: 'PartialOrFullEmailFailure',
                    message: 'Uno o más correos admin no se pudieron enviar.',
                    messageIds,
                    failures
                });
            }
            return json(200, {
                ok: true,
                eventId: payload.eventId,
                messageIds
            });
        }
        const userHtml = await render(React.createElement(UserConfirmationEmail, { payload: payload }));
        const userSubject = `Solicitud Radicada - ${payload.formData.tipoNovedad}`;
        const adminRecipients = resolveAdminRecipientsForSubmitted(payload);
        if (adminRecipients.length === 0) {
            const userOnly = await sendHtmlEmailWithInlineLogo(sesClient, {
                from: fromEmail,
                to: payload.user.email,
                subject: userSubject,
                html: userHtml
            });
            console.warn('[email-transactions] Sin destinatarios admin (notifyTo vacío y sin EMAIL_ADMIN_TO*)', {
                eventId: payload.eventId
            });
            return json(200, {
                ok: true,
                warn: 'no_admin_recipients',
                eventId: payload.eventId,
                messageIds: {
                    user: userOnly.MessageId || null,
                    admin: null
                }
            });
        }
        const adminHtml = await render(React.createElement(AdminNotificationEmail, { payload: payload }));
        const adminSubject = `Nueva solicitud ${payload.formData.tipoNovedad} - ${payload.novedadId}`;
        const taskSpecs = [
            {
                role: 'user',
                to: payload.user.email,
                promise: sendHtmlEmailWithInlineLogo(sesClient, {
                    from: fromEmail,
                    to: payload.user.email,
                    subject: userSubject,
                    html: userHtml
                })
            }
        ];
        for (const to of adminRecipients) {
            taskSpecs.push({
                role: 'admin',
                to,
                promise: sendHtmlEmailWithInlineLogo(sesClient, {
                    from: fromEmail,
                    to,
                    subject: adminSubject,
                    html: adminHtml
                })
            });
        }
        const settled = await Promise.allSettled(taskSpecs.map((t) => t.promise));
        const failures = [];
        let userMessageId = null;
        const adminMessageIds = {};
        for (let i = 0; i < settled.length; i += 1) {
            const spec = taskSpecs[i];
            const entry = settled[i];
            if (entry.status === 'rejected') {
                const err = entry.reason;
                failures.push({
                    role: spec.role,
                    to: spec.role === 'admin' ? spec.to : undefined,
                    message: err?.message || String(entry.reason)
                });
                console.error('[email-transactions] Envío rechazado', {
                    role: spec.role,
                    to: spec.role === 'admin' ? spec.to : undefined,
                    message: err?.message,
                    name: err?.name
                });
                continue;
            }
            const result = entry.value;
            if (spec.role === 'user') {
                userMessageId = result.MessageId || null;
            }
            else {
                adminMessageIds[spec.to] = result.MessageId || null;
            }
        }
        if (failures.length > 0) {
            console.error('[email-transactions] Algunos envíos fallaron', {
                eventId: payload.eventId,
                failures,
                adminRecipientsTried: adminRecipients
            });
            return json(500, {
                ok: false,
                eventId: payload.eventId,
                errorType: 'PartialOrFullEmailFailure',
                message: 'Uno o más correos no se pudieron enviar (revisa destinatarios verificados en SES, admin.notifyTo y variables EMAIL_ADMIN_TO*).',
                messageIds: { user: userMessageId, admin: adminMessageIds },
                failures
            });
        }
        return json(200, {
            ok: true,
            eventId: payload.eventId,
            messageIds: {
                user: userMessageId,
                admin: adminRecipients.length === 1
                    ? adminMessageIds[adminRecipients[0]] || null
                    : adminMessageIds
            }
        });
    }
    catch (error) {
        const e = error;
        return json(500, {
            ok: false,
            errorType: e.name || 'EmailDispatchError',
            message: e.message || 'Error enviando correos transaccionales'
        });
    }
};
