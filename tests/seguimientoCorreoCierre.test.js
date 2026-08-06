const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
    validateSeguimientoCierrePayload,
    validateSeguimientoVencimientoPayload,
    createEmailNotificationsPublisher
} = require('../src/notifications/emailNotificationsPublisher');
const {
    buildSeguimientoCierreEvent,
    buildSeguimientoVencimientoEvent
} = require('../src/notifications/seguimientoEmailEvents');
const { addDaysBogotaDate, daysUntil } = require('../src/seguimiento/seguimientoService');

function cierrePayload(overrides = {}) {
    return {
        eventType: 'seguimiento_cierre',
        eventId: 'e1',
        seguimientoId: 's1',
        tipo: 'consultor',
        recipients: [{ email: 'a@cinte.com', name: 'A' }],
        acta: { cliente: 'Cliente X', fecha: '2026-08-01' },
        ...overrides
    };
}

describe('seguimiento correo cierre validators', () => {
    it('acepta payload cierre válido', () => {
        assert.equal(validateSeguimientoCierrePayload(cierrePayload()), true);
    });

    it('rechaza cierre sin recipients', () => {
        assert.equal(validateSeguimientoCierrePayload(cierrePayload({ recipients: [] })), false);
    });

    it('acepta vencimiento T5', () => {
        assert.equal(
            validateSeguimientoVencimientoPayload({
                eventType: 'seguimiento_vencimiento',
                eventId: 'e2',
                seguimientoId: 's1',
                kind: 'T5',
                recipients: [{ email: 'gp@cinte.com', role: 'gp' }],
                venceEl: '2026-09-01',
                tipo: 'cliente',
                sujetoLabel: 'Cliente X'
            }),
            true
        );
    });
});

describe('seguimiento email builders', () => {
    it('buildSeguimientoCierreEvent normaliza emails', () => {
        const evt = buildSeguimientoCierreEvent({
            seguimientoId: 's1',
            tipo: 'cliente',
            recipients: [{ email: ' Lider@Cinte.COM ', name: 'L' }],
            acta: { fecha: '2026-08-01', cliente: 'Acme', temasTratados: 't' }
        });
        assert.equal(evt.eventType, 'seguimiento_cierre');
        assert.equal(evt.recipients[0].email, 'lider@cinte.com');
        assert.equal(evt.acta.cliente, 'Acme');
    });

    it('buildSeguimientoVencimientoEvent setea kind', () => {
        const evt = buildSeguimientoVencimientoEvent({
            seguimientoId: 's1',
            kind: 'T1',
            recipients: [{ email: 'a@b.com', role: 'gp' }],
            venceEl: '2026-09-01',
            tipo: 'consultor',
            sujetoLabel: 'Acme'
        });
        assert.equal(evt.kind, 'T1');
        assert.equal(evt.eventType, 'seguimiento_vencimiento');
    });
});

describe('publisher skipped vs accepted (seguimiento)', () => {
    it('skipped cuando disabled no es accepted', async () => {
        const pub = createEmailNotificationsPublisher({ enabled: false });
        const r = await pub.publishSeguimientoCierre(cierrePayload());
        assert.equal(r.accepted, false);
        assert.equal(r.skipped, true);
        assert.equal(r.reason, 'disabled');
    });
});

describe('ciclo helpers', () => {
    it('addDaysBogotaDate suma 30 días calendario', () => {
        const d = addDaysBogotaDate(new Date('2026-08-01T15:00:00Z'), 30);
        assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
        assert.equal(daysUntil(d, '2026-08-01'), 30);
    });
});
