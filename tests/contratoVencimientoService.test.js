const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { createContratoVencimientoService } = require('../src/onboarding/contratoVencimientoService');

describe('contratoVencimientoService AUT-319', () => {
    it('rechaza kind inválido en elegibles y marcar', async () => {
        const svc = createContratoVencimientoService({ pool: { query: async () => ({ rows: [] }) } });
        await assert.rejects(() => svc.listElegiblesExactos({ kind: 'T1' }), /kind debe ser/);
        await assert.rejects(() => svc.marcarEnviados({ kind: 'T7', contratoIds: [] }), /kind debe ser/);
    });

    it('no marca si no hay UUID válidos', async () => {
        let called = 0;
        const svc = createContratoVencimientoService({
            pool: {
                query: async () => {
                    called += 1;
                    return { rowCount: 0 };
                }
            }
        });
        const r = await svc.marcarEnviados({ kind: 'T30', contratoIds: ['no-uuid'] });
        assert.equal(r.updated, 0);
        assert.equal(called, 0);
    });

    it('destinatarios solo Admin CH y Team CH, sin duplicar', async () => {
        const svc = createContratoVencimientoService({
            pool: {},
            listEmailsInGroups: async (groups) => {
                assert.deepEqual(groups, ['admin_ch', 'team_ch']);
                return { emails: ['a@cinte.co', 'A@cinte.co', 'b@cinte.co'] };
            }
        });
        const rec = await svc.resolveChRecipients();
        assert.equal(rec.length, 2);
        assert.equal(rec[0].email, 'a@cinte.co');
    });
});
