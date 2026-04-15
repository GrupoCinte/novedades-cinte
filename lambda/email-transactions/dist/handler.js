import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { render } from '@react-email/render';
import * as React from 'react';
import { UserConfirmationEmail } from './templates/UserConfirmationEmail.js';
import { AdminNotificationEmail } from './templates/AdminNotificationEmail.js';
import { UserStatusUpdateEmail } from './templates/UserStatusUpdateEmail.js';
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
function parseEventPayload(rawEvent) {
    const maybeApiEvent = rawEvent;
    const payload = typeof maybeApiEvent?.body === 'string'
        ? JSON.parse(maybeApiEvent.body)
        : rawEvent;
    const data = payload;
    if (data?.eventType !== 'form_submitted' && data?.eventType !== 'form_status_changed') {
        throw new Error('eventType invalido');
    }
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
export const handler = async (event) => {
    try {
        if (!fromEmail)
            throw new Error('SES_FROM_EMAIL no configurado');
        const payload = parseEventPayload(event);
        if (payload.eventType === 'form_status_changed') {
            const userHtml = await render(React.createElement(UserStatusUpdateEmail, { payload }));
            const subject = `Actualizacion de solicitud ${payload.novedadId}: ${payload.formData.estado}`;
            const userCommand = new SendEmailCommand({
                Source: fromEmail,
                Destination: { ToAddresses: [payload.user.email] },
                Message: {
                    Subject: { Data: subject, Charset: 'UTF-8' },
                    Body: { Html: { Data: userHtml, Charset: 'UTF-8' } }
                }
            });
            const userResult = await sesClient.send(userCommand);
            return json(200, {
                ok: true,
                eventId: payload.eventId,
                messageIds: {
                    user: userResult.MessageId || null
                }
            });
        }
        const userHtml = await render(React.createElement(UserConfirmationEmail, { payload }));
        const userCommand = new SendEmailCommand({
            Source: fromEmail,
            Destination: { ToAddresses: [payload.user.email] },
            Message: {
                Subject: { Data: `Solicitud Radicada - ${payload.formData.tipoNovedad}`, Charset: 'UTF-8' },
                Body: { Html: { Data: userHtml, Charset: 'UTF-8' } }
            }
        });
        const adminRecipients = resolveAdminRecipientsForSubmitted(payload);
        if (adminRecipients.length === 0) {
            const userOnly = await sesClient.send(userCommand);
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
        const adminHtml = await render(React.createElement(AdminNotificationEmail, { payload }));
        const adminSubject = `Nueva solicitud ${payload.formData.tipoNovedad} - ${payload.novedadId}`;
        const adminMessage = {
            Subject: { Data: adminSubject, Charset: 'UTF-8' },
            Body: { Html: { Data: adminHtml, Charset: 'UTF-8' } }
        };
        const adminCommands = adminRecipients.map((to) => new SendEmailCommand({
            Source: fromEmail,
            Destination: { ToAddresses: [to] },
            Message: adminMessage
        }));
        const taskSpecs = [
            { role: 'user', to: payload.user.email, promise: sesClient.send(userCommand) }
        ];
        for (let i = 0; i < adminCommands.length; i += 1) {
            taskSpecs.push({
                role: 'admin',
                to: adminRecipients[i],
                promise: sesClient.send(adminCommands[i])
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
