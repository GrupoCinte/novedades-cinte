const test = require('node:test');
const assert = require('node:assert/strict');
const {
    validateConciliacionServicioFinalizadaPayload,
    validateConciliacionCorreoLiderPayload,
    validateConciliacionStakeholdersAvisoPayload,
    createEmailNotificationsPublisher
} = require('../src/notifications/emailNotificationsPublisher');

const validPayload = {
    eventType: 'conciliacion_servicio_finalizada',
    eventId: 'evt-1',
    occurredAt: new Date().toISOString(),
    conciliacionServicioId: 'svc-1',
    recipients: [{ name: 'Analista', email: 'analista@example.com' }],
    servicio: {
        id: 'svc-1',
        serviceName: 'DevOps',
        cliente: 'Cliente X',
        anio: 2026,
        mes: 5,
        billingType: 'EXPIRED_MONTH',
        billingMode: 'CALENDAR_DAYS'
    },
    totales: { tarifaSum: 100, incrementoSum: 0, deduccionSum: 0, facturaSum: 100 },
    consultores: [{ nombre: 'Juan', cedula: '123', estado: 'APROBADO_FINANZAS', facturaCop: 100 }],
    approvedBy: { email: 'fin@test.com', nombre: 'Finanzas' },
    admin: { actionUrl: 'http://localhost:5175/admin/conciliaciones/facturacion' },
    meta: { source: 'test', env: 'test' }
};

test('validateConciliacionServicioFinalizadaPayload acepta payload válido', () => {
    assert.equal(validateConciliacionServicioFinalizadaPayload(validPayload), true);
});

test('validateConciliacionServicioFinalizadaPayload rechaza sin recipients', () => {
    assert.equal(
        validateConciliacionServicioFinalizadaPayload({ ...validPayload, recipients: [] }),
        false
    );
});

test('publishConciliacionServicioFinalizada invoca Lambda cuando está habilitado', async () => {
    let invokedPayload = null;
    const publisher = createEmailNotificationsPublisher({
        lambdaClient: {
            send: async (cmd) => {
                invokedPayload = cmd.input?.Payload || cmd.Payload;
                return { StatusCode: 202 };
            }
        },
        functionName: 'email-transactions',
        enabled: true
    });
    const out = await publisher.publishConciliacionServicioFinalizada(validPayload);
    assert.equal(out.accepted, true);
    assert.ok(invokedPayload);
    const parsed = JSON.parse(Buffer.from(invokedPayload).toString('utf8'));
    assert.equal(parsed.eventType, 'conciliacion_servicio_finalizada');
});

const validCorreoLiderPayload = {
    eventType: 'conciliacion_correo_lider',
    eventId: 'evt-correo-1',
    occurredAt: new Date().toISOString(),
    conciliacionServicioId: 'svc-1',
    recipient: { name: 'Líder Cliente', email: 'lider@cliente.com' },
    asunto: 'Conciliación junio',
    introHtml: '<p>Hola</p>',
    tableHtml: '<table><tr><td>1</td></tr></table>',
    servicio: { id: 'svc-1', serviceName: 'DevOps', cliente: 'Cliente X', anio: 2026, mes: 6 },
    meta: { source: 'test', env: 'test' }
};

test('validateConciliacionCorreoLiderPayload acepta payload válido', () => {
    assert.equal(validateConciliacionCorreoLiderPayload(validCorreoLiderPayload), true);
});

test('publishConciliacionCorreoLider invoca Lambda cuando está habilitado', async () => {
    let invokedPayload = null;
    const publisher = createEmailNotificationsPublisher({
        lambdaClient: {
            send: async (cmd) => {
                invokedPayload = cmd.input?.Payload || cmd.Payload;
                return { StatusCode: 202 };
            }
        },
        functionName: 'email-transactions',
        enabled: true
    });
    const out = await publisher.publishConciliacionCorreoLider(validCorreoLiderPayload);
    assert.equal(out.accepted, true);
    const parsed = JSON.parse(Buffer.from(invokedPayload).toString('utf8'));
    assert.equal(parsed.eventType, 'conciliacion_correo_lider');
});

const validStakeholdersPayload = {
    eventType: 'conciliacion_stakeholders_aviso',
    eventId: 'evt-aviso-1',
    kind: 'enviada',
    occurredAt: new Date().toISOString(),
    conciliacionServicioId: 'svc-1',
    recipients: [{ name: 'GP', email: 'gp@example.com' }],
    servicio: { id: 'svc-1', serviceName: 'DevOps', cliente: 'Cliente X', anio: 2026, mes: 6 },
    meta: { source: 'test', env: 'test' }
};

test('validateConciliacionStakeholdersAvisoPayload acepta payload válido', () => {
    assert.equal(validateConciliacionStakeholdersAvisoPayload(validStakeholdersPayload), true);
});

test('publishConciliacionStakeholdersAviso invoca Lambda', async () => {
    let invokedPayload = null;
    const publisher = createEmailNotificationsPublisher({
        lambdaClient: {
            send: async (cmd) => {
                invokedPayload = cmd.input?.Payload || cmd.Payload;
                return { StatusCode: 202 };
            }
        },
        functionName: 'email-transactions',
        enabled: true
    });
    const out = await publisher.publishConciliacionStakeholdersAviso(validStakeholdersPayload);
    assert.equal(out.accepted, true);
    const parsed = JSON.parse(Buffer.from(invokedPayload).toString('utf8'));
    assert.equal(parsed.eventType, 'conciliacion_stakeholders_aviso');
});
