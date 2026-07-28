import test from 'node:test';
import assert from 'node:assert';
import { createEmailNotificationsPublisher } from '../src/notifications/emailNotificationsPublisher.js';

test('publishTimeEntryConfirmation publica evento created', async () => {
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

test('publishTimeEntryConfirmation no rompe respuesta si falla', async () => {
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