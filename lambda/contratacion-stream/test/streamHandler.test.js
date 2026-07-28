'use strict';

const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { processStreamRecord } = require('../src/streamHandler');

describe('streamHandler routing', () => {
    it('Zoho INSERT llama intake y no broadcast', async () => {
        const postZohoIntake = mock.fn(async () => ({ ok: true, duplicate: false }));
        const broadcastToConnections = mock.fn(async () => ({ sent: 0 }));
        const result = await processStreamRecord(
            {
                eventName: 'INSERT',
                dynamodb: {
                    NewImage: {
                        pk: 'zoho_novedad#msg1',
                        record_type: 'zoho_novedad',
                        tipo_novedad: 'cambio_datos'
                    }
                }
            },
            { postZohoIntake, broadcastToConnections }
        );
        assert.equal(result.action, 'zoho_intake');
        assert.equal(postZohoIntake.mock.callCount(), 1);
        assert.equal(broadcastToConnections.mock.callCount(), 0);
    });

    it('Zoho REMOVE se ignora', async () => {
        const postZohoIntake = mock.fn(async () => ({}));
        const result = await processStreamRecord(
            {
                eventName: 'REMOVE',
                dynamodb: {
                    OldImage: { pk: 'zoho_novedad#x', record_type: 'zoho_novedad' }
                }
            },
            { postZohoIntake }
        );
        assert.equal(result.action, 'zoho_remove_ignored');
        assert.equal(postZohoIntake.mock.callCount(), 0);
    });

    it('candidato onboarding Finalizado hace broadcast + promote intake', async () => {
        const postZohoIntake = mock.fn(async () => ({}));
        const postOnboardingIntake = mock.fn(async () => ({ ok: true, status: 'aplicado' }));
        const broadcastToConnections = mock.fn(async () => ({ sent: 1, stale: 0, total: 1 }));
        const result = await processStreamRecord(
            {
                eventName: 'MODIFY',
                dynamodb: {
                    SequenceNumber: 'seq-1',
                    NewImage: {
                        whatsapp_number: '573009998877',
                        nombre: 'Pedro',
                        status: 'Finalizado',
                        cedula: '1234567890'
                    }
                }
            },
            { postZohoIntake, postOnboardingIntake, broadcastToConnections }
        );
        assert.equal(result.action, 'ws_broadcast_and_promote');
        assert.equal(result.type, 'MODIFY');
        assert.equal(postZohoIntake.mock.callCount(), 0);
        assert.equal(postOnboardingIntake.mock.callCount(), 1);
        assert.equal(broadcastToConnections.mock.callCount(), 1);
        const msg = broadcastToConnections.mock.calls[0].arguments[0];
        assert.equal(msg.type, 'MODIFY');
        assert.equal(msg.data.executionId, '573009998877');
        assert.equal(msg.data.statusId, 6);
        const promoteArgs = postOnboardingIntake.mock.calls[0].arguments;
        assert.equal(promoteArgs[0].status, 'Finalizado');
        assert.equal(promoteArgs[1].sequenceNumber, 'seq-1');
    });

    it('candidato onboarding intermedio solo broadcast', async () => {
        const postOnboardingIntake = mock.fn(async () => ({}));
        const broadcastToConnections = mock.fn(async () => ({ sent: 1, stale: 0, total: 1 }));
        const result = await processStreamRecord(
            {
                eventName: 'MODIFY',
                dynamodb: {
                    NewImage: {
                        whatsapp_number: '573009998877',
                        nombre: 'Pedro',
                        status: 'Documentos Recibidos'
                    }
                }
            },
            { postOnboardingIntake, broadcastToConnections }
        );
        assert.equal(result.action, 'ws_broadcast');
        assert.equal(postOnboardingIntake.mock.callCount(), 0);
        assert.equal(broadcastToConnections.mock.callCount(), 1);
    });

    it('REMOVE onboarding emite REMOVE', async () => {
        const broadcastToConnections = mock.fn(async () => ({ sent: 0 }));
        const result = await processStreamRecord(
            {
                eventName: 'REMOVE',
                dynamodb: {
                    OldImage: { whatsapp_number: '57300111', status: 'Eliminado' }
                }
            },
            { broadcastToConnections }
        );
        assert.equal(result.action, 'ws_broadcast');
        assert.equal(result.type, 'REMOVE');
    });

    it('unmarshall AttributeValue Dynamo', async () => {
        const broadcastToConnections = mock.fn(async () => ({ sent: 0 }));
        const result = await processStreamRecord(
            {
                eventName: 'INSERT',
                dynamodb: {
                    NewImage: {
                        whatsapp_number: { S: '573001234567' },
                        status: { S: 'Contactado' },
                        nombre: { S: 'Luisa' }
                    }
                }
            },
            { broadcastToConnections }
        );
        assert.equal(result.action, 'ws_broadcast');
        assert.equal(broadcastToConnections.mock.calls[0].arguments[0].data.executionId, '573001234567');
    });
});
