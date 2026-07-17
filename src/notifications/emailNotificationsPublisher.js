const { InvokeCommand } = require('@aws-sdk/client-lambda');

function validateFormSubmittedPayload(payload) {
    if (!payload || typeof payload !== 'object') return false;
    if (payload.eventType !== 'form_submitted') return false;
    if (!payload.eventId || !payload.novedadId) return false;
    const userEmail = String(payload?.user?.email || '').trim();
    if (!userEmail.includes('@')) return false;
    const notifyTo = payload?.admin?.notifyTo;
    if (notifyTo !== undefined && notifyTo !== null) {
        if (!Array.isArray(notifyTo)) return false;
        for (const item of notifyTo) {
            const s = String(item ?? '').trim();
            if (s === '') continue;
            if (!s.includes('@')) return false;
        }
    }
    return true;
}

function validateFormStatusChangedPayload(payload) {
    if (!payload || typeof payload !== 'object') return false;
    if (payload.eventType !== 'form_status_changed') return false;
    if (!payload.eventId || !payload.novedadId) return false;
    const userEmail = String(payload?.user?.email || '').trim();
    const newEstado = String(payload?.statusChange?.newEstado || '').trim();
    return userEmail.includes('@') && (newEstado === 'Aprobado' || newEstado === 'Rechazado');
}

function validateConciliacionServicioFinalizadaPayload(payload) {
    if (!payload || typeof payload !== 'object') return false;
    if (payload.eventType !== 'conciliacion_servicio_finalizada') return false;
    if (!payload.eventId || !payload.conciliacionServicioId) return false;
    const recipients = payload.recipients;
    if (!Array.isArray(recipients) || recipients.length === 0) return false;
    for (const r of recipients) {
        const email = String(r?.email || '').trim();
        if (!email.includes('@')) return false;
    }
    return Boolean(String(payload?.servicio?.cliente || '').trim());
}

function validateConciliacionCorreoLiderPayload(payload) {
    if (!payload || typeof payload !== 'object') return false;
    if (payload.eventType !== 'conciliacion_correo_lider') return false;
    if (!payload.eventId || !payload.conciliacionServicioId) return false;
    const email = String(payload?.recipient?.email || '').trim();
    if (!email.includes('@')) return false;
    if (!String(payload?.asunto || '').trim()) return false;
    return Boolean(String(payload?.servicio?.cliente || '').trim());
}

function validateConciliacionStakeholdersAvisoPayload(payload) {
    if (!payload || typeof payload !== 'object') return false;
    if (payload.eventType !== 'conciliacion_stakeholders_aviso') return false;
    if (!payload.eventId || !payload.conciliacionServicioId) return false;
    const kind = String(payload.kind || '').trim();
    if (!['enviada', 'aprobada', 'rechazada', 'parcial'].includes(kind)) return false;
    const recipients = payload.recipients;
    if (!Array.isArray(recipients) || recipients.length === 0) return false;
    for (const r of recipients) {
        const email = String(r?.email || '').trim();
        if (!email.includes('@')) return false;
    }
    return Boolean(String(payload?.servicio?.cliente || '').trim());
}

function createEmailNotificationsPublisher({
    lambdaClient,
    functionName,
    enabled = false
}) {
    const isEnabled = Boolean(enabled && lambdaClient && String(functionName || '').trim());

    async function publishFormSubmitted(payload) {
        if (!isEnabled) {
            return { accepted: false, skipped: true, reason: 'disabled' };
        }
        if (!validateFormSubmittedPayload(payload)) {
            return { accepted: false, skipped: true, reason: 'invalid_payload' };
        }
        const command = new InvokeCommand({
            FunctionName: functionName,
            InvocationType: 'Event',
            Payload: Buffer.from(JSON.stringify(payload), 'utf8')
        });
        const response = await lambdaClient.send(command);
        return {
            accepted: Number(response?.StatusCode || 0) >= 200 && Number(response?.StatusCode || 0) < 300,
            statusCode: response?.StatusCode || 0,
            requestId: response?.$metadata?.requestId || response?.ResponseMetadata?.RequestId || null
        };
    }

    async function publishFormStatusChanged(payload) {
        if (!isEnabled) {
            return { accepted: false, skipped: true, reason: 'disabled' };
        }
        if (!validateFormStatusChangedPayload(payload)) {
            return { accepted: false, skipped: true, reason: 'invalid_payload' };
        }
        const command = new InvokeCommand({
            FunctionName: functionName,
            InvocationType: 'Event',
            Payload: Buffer.from(JSON.stringify(payload), 'utf8')
        });
        const response = await lambdaClient.send(command);
        return {
            accepted: Number(response?.StatusCode || 0) >= 200 && Number(response?.StatusCode || 0) < 300,
            statusCode: response?.StatusCode || 0,
            requestId: response?.$metadata?.requestId || response?.ResponseMetadata?.RequestId || null
        };
    }

    async function publishConciliacionServicioFinalizada(payload) {
        if (!isEnabled) {
            return { accepted: false, skipped: true, reason: 'disabled' };
        }
        if (!validateConciliacionServicioFinalizadaPayload(payload)) {
            return { accepted: false, skipped: true, reason: 'invalid_payload' };
        }
        const command = new InvokeCommand({
            FunctionName: functionName,
            InvocationType: 'Event',
            Payload: Buffer.from(JSON.stringify(payload), 'utf8')
        });
        const response = await lambdaClient.send(command);
        return {
            accepted: Number(response?.StatusCode || 0) >= 200 && Number(response?.StatusCode || 0) < 300,
            statusCode: response?.StatusCode || 0,
            requestId: response?.$metadata?.requestId || response?.ResponseMetadata?.RequestId || null
        };
    }

    async function publishConciliacionCorreoLider(payload) {
        if (!isEnabled) {
            return { accepted: false, skipped: true, reason: 'disabled' };
        }
        if (!validateConciliacionCorreoLiderPayload(payload)) {
            return { accepted: false, skipped: true, reason: 'invalid_payload' };
        }
        const command = new InvokeCommand({
            FunctionName: functionName,
            InvocationType: 'Event',
            Payload: Buffer.from(JSON.stringify(payload), 'utf8')
        });
        const response = await lambdaClient.send(command);
        return {
            accepted: Number(response?.StatusCode || 0) >= 200 && Number(response?.StatusCode || 0) < 300,
            statusCode: response?.StatusCode || 0,
            requestId: response?.$metadata?.requestId || response?.ResponseMetadata?.RequestId || null
        };
    }

    async function publishConciliacionStakeholdersAviso(payload) {
        if (!isEnabled) {
            return { accepted: false, skipped: true, reason: 'disabled' };
        }
        if (!validateConciliacionStakeholdersAvisoPayload(payload)) {
            return { accepted: false, skipped: true, reason: 'invalid_payload' };
        }
        const command = new InvokeCommand({
            FunctionName: functionName,
            InvocationType: 'Event',
            Payload: Buffer.from(JSON.stringify(payload), 'utf8')
        });
        const response = await lambdaClient.send(command);
        return {
            accepted: Number(response?.StatusCode || 0) >= 200 && Number(response?.StatusCode || 0) < 300,
            statusCode: response?.StatusCode || 0,
            requestId: response?.$metadata?.requestId || response?.ResponseMetadata?.RequestId || null
        };
    }

    return {
        publishFormSubmitted,
        publishFormStatusChanged,
        publishConciliacionServicioFinalizada,
        publishConciliacionCorreoLider,
        publishConciliacionStakeholdersAviso
    };
}

module.exports = {
    createEmailNotificationsPublisher,
    validateFormSubmittedPayload,
    validateFormStatusChangedPayload,
    validateConciliacionServicioFinalizadaPayload,
    validateConciliacionCorreoLiderPayload,
    validateConciliacionStakeholdersAvisoPayload
};
