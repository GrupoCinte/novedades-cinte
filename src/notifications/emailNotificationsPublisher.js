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

    return { publishFormSubmitted, publishFormStatusChanged };
}

module.exports = {
    createEmailNotificationsPublisher,
    validateFormSubmittedPayload,
    validateFormStatusChangedPayload
};
