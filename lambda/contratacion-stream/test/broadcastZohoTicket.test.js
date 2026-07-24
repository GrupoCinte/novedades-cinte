'use strict';

const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { broadcastToConnections } = require('../src/broadcast');
const { postZohoIntake } = require('../src/zohoIntake');
const { signContratacionWsTicket, verifyContratacionWsTicket } = require('../src/wsTicket');

describe('broadcast stale 410', () => {
    it('borra connectionId ante GoneException', async () => {
        const sendCalls = [];
        const deleted = [];
        const doc = {
            send: async (cmd) => {
                const name = cmd.constructor.name;
                if (name === 'ScanCommand') {
                    return { Items: [{ connectionId: 'c1' }, { connectionId: 'c2' }] };
                }
                if (name === 'DeleteCommand') {
                    deleted.push(cmd.input.Key.connectionId);
                    return {};
                }
                throw new Error(`unexpected ${name}`);
            }
        };
        const mgmt = {
            send: async (cmd) => {
                sendCalls.push(cmd.input.ConnectionId);
                if (cmd.input.ConnectionId === 'c1') {
                    const err = new Error('Gone');
                    err.name = 'GoneException';
                    err.$metadata = { httpStatusCode: 410 };
                    throw err;
                }
                return {};
            }
        };

        const out = await broadcastToConnections(
            { type: 'MODIFY', data: { executionId: '1' } },
            { doc, mgmt, table: 't' }
        );
        assert.equal(out.sent, 1);
        assert.equal(out.stale, 1);
        assert.deepEqual(deleted, ['c1']);
        assert.deepEqual(sendCalls, ['c1', 'c2']);
    });
});

describe('zohoIntake', () => {
    it('POST con x-onboarding-key', async () => {
        const fetchImpl = mock.fn(async (url, opts) => {
            assert.match(url, /\/api\/onboarding\/ficha-novedades\/intake$/);
            assert.equal(opts.headers['x-onboarding-key'], 'secret-key');
            const body = JSON.parse(opts.body);
            assert.equal(body.source, 'dynamo_stream_zoho');
            assert.equal(body.payload.pk, 'zoho_novedad#1');
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ ok: true })
            };
        });
        const json = await postZohoIntake(
            { pk: 'zoho_novedad#1' },
            {},
            {
                fetchImpl,
                portalBaseUrl: 'https://portal.example',
                ingestKey: 'secret-key'
            }
        );
        assert.equal(json.ok, true);
        assert.equal(fetchImpl.mock.callCount(), 1);
    });
});

describe('wsTicket parity', () => {
    it('sign/verify con mismo secret', () => {
        const secret = 'test-ws-secret';
        const ticket = signContratacionWsTicket({ wsSecret: secret, ttlSec: 60 }, { sub: 'user@cinte.com' });
        const payload = verifyContratacionWsTicket(secret, ticket);
        assert.equal(payload.sub, 'user@cinte.com');
        assert.equal(payload.typ, 'contratacion_ws');
    });
});
