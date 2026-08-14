import test from 'node:test';
import assert from 'node:assert';
import { createEmailNotificationsPublisher } from '../src/notifications/emailNotificationsPublisher.js';

function withActividadesEmail(enabled, fn) {
    const prev = process.env.EMAIL_ACTIVIDADES_ENABLED;
    process.env.EMAIL_ACTIVIDADES_ENABLED = enabled ? 'true' : 'false';
    return Promise.resolve()
        .then(fn)
        .finally(() => {
            if (prev === undefined) delete process.env.EMAIL_ACTIVIDADES_ENABLED;
            else process.env.EMAIL_ACTIVIDADES_ENABLED = prev;
        });
}

test('publishTimeEntryConfirmation publica evento created', async () => {
    await withActividadesEmail(true, async () => {
    const mockLambdaClient = {
        send: async () => ({ StatusCode: 200 })
    };
    const publisher = createEmailNotificationsPublisher({
        lambdaClient: mockLambdaClient,
        functionName: 'test-function',
        enabled: true
    });
    
    const result = await publisher.publishTimeEntryConfirmation({
        eventType: 'time_entry_confirmation',
        eventId: 'test-123',
        entryId: 'entry-456',
        consultant: { name: 'Juan', email: 'juan@test.com' },
        action: 'created',
        entryData: { date: '2026-07-28', description: 'Test', client: 'Cliente', schedule: '9-17' },
        meta: { source: 'test', env: 'test' }
    });
    
    assert.strictEqual(result.accepted, true);
    });
});

test('publishTimeEntryConfirmation no publica si EMAIL_ACTIVIDADES_ENABLED no es true', async () => {
    await withActividadesEmail(false, async () => {
        let invoked = 0;
        const mockLambdaClient = {
            send: async () => {
                invoked += 1;
                return { StatusCode: 202 };
            }
        };
        const publisher = createEmailNotificationsPublisher({
            lambdaClient: mockLambdaClient,
            functionName: 'test-function',
            enabled: true
        });

        const result = await publisher.publishTimeEntryConfirmation({
            eventType: 'time_entry_confirmation',
            eventId: 'test-123',
            entryId: 'entry-456',
            consultant: { name: 'Juan', email: 'juan@test.com' },
            action: 'created',
            entryData: { date: '2026-07-28', description: 'Test', client: 'Cliente', schedule: '9-17' },
            meta: { source: 'test', env: 'test' }
        });

        assert.strictEqual(result.accepted, false);
        assert.strictEqual(result.skipped, true);
        assert.strictEqual(result.reason, 'actividades_disabled');
        assert.strictEqual(invoked, 0);
    });
});

test('publishTimeEntryConfirmation no rompe respuesta si falla', async () => {
    await withActividadesEmail(true, async () => {
    const mockLambdaClient = {
        send: async () => { throw new Error('SES falló'); }
    };
    const publisher = createEmailNotificationsPublisher({
        lambdaClient: mockLambdaClient,
        functionName: 'test-function',
        enabled: true
    });
    
    const result = await publisher.publishTimeEntryConfirmation({
        eventType: 'time_entry_confirmation',
        eventId: 'test-123',
        entryId: 'entry-456',
        consultant: { name: 'Juan', email: 'juan@test.com' },
        action: 'created',
        entryData: { date: '2026-07-28', description: 'Test', client: 'Cliente', schedule: '9-17' },
        meta: { source: 'test', env: 'test' }
    });
    
    assert.strictEqual(result.accepted, false);
    });
});

test('publishTimeEntryAdminNotification tampoco publica si actividades está apagado', async () => {
    await withActividadesEmail(false, async () => {
        let invoked = 0;
        const publisher = createEmailNotificationsPublisher({
            lambdaClient: { send: async () => { invoked += 1; return { StatusCode: 202 }; } },
            functionName: 'test-function',
            enabled: true
        });
        const result = await publisher.publishTimeEntryAdminNotification({
            eventType: 'time_entry_confirmation',
            eventId: 'test-admin',
            entryId: 'entry-456',
            consultant: { name: 'Juan', email: 'juan@test.com' },
            action: 'created',
            entryData: { date: '2026-07-28', description: 'Test', client: 'Cliente', schedule: '9-17' },
            admin: { notifyTo: ['admin@test.com'] },
            meta: { source: 'test', env: 'test' }
        });
        assert.strictEqual(result.reason, 'actividades_disabled');
        assert.strictEqual(invoked, 0);
    });
});

test('conciliación sigue publicando con actividades apagadas', async () => {
    await withActividadesEmail(false, async () => {
        let invoked = 0;
        const publisher = createEmailNotificationsPublisher({
            lambdaClient: { send: async () => { invoked += 1; return { StatusCode: 202 }; } },
            functionName: 'test-function',
            enabled: true
        });
        const result = await publisher.publishConciliacionCorreoLider({
            eventType: 'conciliacion_correo_lider',
            eventId: 'evt-conc',
            conciliacionServicioId: 'svc-1',
            recipient: { email: 'lider@test.com' },
            asunto: 'Conciliación',
            servicio: { cliente: 'Cliente X' }
        });
        assert.strictEqual(result.accepted, true);
        assert.strictEqual(invoked, 1);
    });
});