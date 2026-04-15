const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
    createEmailNotificationsPublisher,
    validateFormSubmittedPayload,
    validateFormStatusChangedPayload
} = require('./emailNotificationsPublisher');

function buildPayload() {
    return {
        eventType: 'form_submitted',
        eventId: 'evt-1',
        novedadId: 'nov-1',
        user: { email: 'user@example.com' }
    };
}

function buildStatusPayload() {
    return {
        eventType: 'form_status_changed',
        eventId: 'evt-2',
        novedadId: 'nov-2',
        user: { email: 'user@example.com' },
        statusChange: { newEstado: 'Aprobado' }
    };
}

describe('validateFormSubmittedPayload', () => {
    it('acepta payload mínimo válido', () => {
        assert.equal(validateFormSubmittedPayload(buildPayload()), true);
    });

    it('rechaza payload sin email válido', () => {
        const bad = buildPayload();
        bad.user.email = 'invalid';
        assert.equal(validateFormSubmittedPayload(bad), false);
    });

    it('acepta admin.notifyTo con correos válidos', () => {
        const p = buildPayload();
        p.admin = { notifyTo: ['a@x.com', 'b@y.org'] };
        assert.equal(validateFormSubmittedPayload(p), true);
    });

    it('rechaza admin.notifyTo que no es array', () => {
        const p = buildPayload();
        p.admin = { notifyTo: 'a@x.com' };
        assert.equal(validateFormSubmittedPayload(p), false);
    });

    it('rechaza admin.notifyTo con entrada inválida', () => {
        const p = buildPayload();
        p.admin = { notifyTo: ['a@x.com', 'not-an-email'] };
        assert.equal(validateFormSubmittedPayload(p), false);
    });

    it('acepta admin.notifyTo como array vacío', () => {
        const p = buildPayload();
        p.admin = { notifyTo: [] };
        assert.equal(validateFormSubmittedPayload(p), true);
    });
});

describe('validateFormStatusChangedPayload', () => {
    it('acepta payload mínimo válido', () => {
        assert.equal(validateFormStatusChangedPayload(buildStatusPayload()), true);
    });

    it('rechaza payload sin nuevo estado válido', () => {
        const bad = buildStatusPayload();
        bad.statusChange.newEstado = 'Pendiente';
        assert.equal(validateFormStatusChangedPayload(bad), false);
    });
});

describe('createEmailNotificationsPublisher', () => {
    it('omite publish cuando está deshabilitado', async () => {
        const publisher = createEmailNotificationsPublisher({
            lambdaClient: { send: async () => ({ StatusCode: 202 }) },
            functionName: 'mailer',
            enabled: false
        });
        const out = await publisher.publishFormSubmitted(buildPayload());
        assert.equal(out.skipped, true);
        assert.equal(out.reason, 'disabled');
    });

    it('invoca lambda async con payload válido', async () => {
        let called = false;
        const publisher = createEmailNotificationsPublisher({
            lambdaClient: {
                send: async () => {
                    called = true;
                    return { StatusCode: 202, ResponseMetadata: { RequestId: 'req-1' } };
                }
            },
            functionName: 'mailer',
            enabled: true
        });
        const out = await publisher.publishFormSubmitted(buildPayload());
        assert.equal(called, true);
        assert.equal(out.accepted, true);
        assert.equal(out.requestId, 'req-1');
    });

    it('invoca lambda async con payload de cambio de estado', async () => {
        let called = false;
        const publisher = createEmailNotificationsPublisher({
            lambdaClient: {
                send: async () => {
                    called = true;
                    return { StatusCode: 202, ResponseMetadata: { RequestId: 'req-2' } };
                }
            },
            functionName: 'mailer',
            enabled: true
        });
        const out = await publisher.publishFormStatusChanged(buildStatusPayload());
        assert.equal(called, true);
        assert.equal(out.accepted, true);
        assert.equal(out.requestId, 'req-2');
    });
});
