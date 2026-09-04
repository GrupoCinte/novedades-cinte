const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
    bandaExacta,
    bandaVentana,
    daysUntil,
    gpScopePorVencer,
    resolveAsOfDate,
    tipoAplicaAlerta,
    todayBogota,
    tokenEquals,
    ventanaRango
} = require('../src/onboarding/contratoVencimiento');

describe('contratoVencimiento AUT-319', () => {
    it('cuenta días calendario Bogotá sin hora', () => {
        assert.equal(daysUntil('2026-09-26', '2026-08-27'), 30);
        assert.equal(daysUntil('2026-09-11', '2026-08-27'), 15);
        assert.equal(daysUntil('2026-09-01', '2026-08-27'), 5);
        assert.equal(daysUntil('2026-08-27', '2026-08-27'), 0);
        assert.equal(daysUntil(null, '2026-08-27'), null);
    });

    it('ventana pinta 30/15/5 y deja fuera vencidos y más de 30 días', () => {
        assert.equal(bandaVentana(30), 'T30');
        assert.equal(bandaVentana(16), 'T30');
        assert.equal(bandaVentana(15), 'T15');
        assert.equal(bandaVentana(6), 'T15');
        assert.equal(bandaVentana(5), 'T5');
        assert.equal(bandaVentana(0), 'T5');
        assert.equal(bandaVentana(31), null);
        assert.equal(bandaVentana(-1), null);
    });

    it('correo solo dispara el día exacto', () => {
        assert.equal(bandaExacta(30), 'T30');
        assert.equal(bandaExacta(29), null);
        assert.equal(bandaExacta(15), 'T15');
        assert.equal(bandaExacta(5), 'T5');
        assert.equal(bandaExacta(4), null);
    });

    it('aplica a OPS, fijo, obra o labor e indefinido', () => {
        assert.equal(tipoAplicaAlerta('Término fijo'), true);
        assert.equal(tipoAplicaAlerta('Obra o labor'), true);
        assert.equal(tipoAplicaAlerta('OPS'), true);
        assert.equal(tipoAplicaAlerta('Prestación de servicios'), true);
        assert.equal(tipoAplicaAlerta('Indefinido'), true);
        assert.equal(tipoAplicaAlerta('Término indefinido', 'OPS'), true);
        assert.equal(tipoAplicaAlerta('Contrato Indefinido'), true);
        assert.equal(tipoAplicaAlerta('', 'Cuenta propia'), true);
        assert.equal(tipoAplicaAlerta('', 'Contrato Indefinido'), true);
        assert.equal(tipoAplicaAlerta('Consultoría'), false);
    });

    it('filtro de lista parte la ventana en tandas', () => {
        assert.deepEqual(ventanaRango('T5'), { min: 0, max: 5 });
        assert.deepEqual(ventanaRango('T15'), { min: 6, max: 15 });
        assert.deepEqual(ventanaRango('T30'), { min: 16, max: 30 });
        assert.deepEqual(ventanaRango(null), { min: 0, max: 30 });
    });

    it('GP en Por vencer solo ve contratos de sus clientes', () => {
        const scoped = gpScopePorVencer({
            where: '(c.gp_user_id = $G_USER OR LOWER(TRIM(c.cliente)) = ANY($G_CLIENTES))',
            clientes: ['EXPERIAN']
        });
        assert.equal(scoped.sql.includes('gp_user_id'), false);
        assert.equal(scoped.sql.includes('cc.cliente'), true);
        assert.deepEqual(scoped.params[0], ['experian']);
        assert.deepEqual(gpScopePorVencer({ where: 'FALSE' }), { sql: 'FALSE', params: [] });
    });

    it('token interno compara en tiempo constante y no acepta vacío', () => {
        assert.equal(tokenEquals('abc', 'abc'), true);
        assert.equal(tokenEquals('abc', 'abd'), false);
        assert.equal(tokenEquals('abc', 'ab'), false);
        assert.equal(tokenEquals('', 'abc'), false);
    });

    it('asOfDate forzado no aplica en production', () => {
        const prev = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';
        assert.equal(resolveAsOfDate('2026-01-01'), todayBogota());
        process.env.NODE_ENV = prev;
        if (process.env.NODE_ENV !== 'production') {
            assert.equal(resolveAsOfDate('2026-01-01'), '2026-01-01');
        }
    });
});
