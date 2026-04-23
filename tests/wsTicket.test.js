/**
 * @file wsTicket.test.js
 * @description Pruebas unitarias para el módulo de tickets WebSocket de contratación.
 *              Valida firma, verificación, TTL, manipulación y edge cases.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
    signContratacionWsTicket,
    verifyContratacionWsTicket
} = require('../src/contratacion/wsTicket');

const SECRET = 'super-secret-key-for-tests-min-32-chars!!';
const DEPS_OK = { wsSecret: SECRET, ttlSec: 300 };
const USER_CLAIMS = { sub: 'user-uuid-abc-123', email: 'user@cinte.co' };

// ─── signContratacionWsTicket ────────────────────────────────────────────────
describe('signContratacionWsTicket()', () => {
    it('devuelve un string JWT no vacío para claims válidos', () => {
        const ticket = signContratacionWsTicket(DEPS_OK, USER_CLAIMS);
        assert.ok(typeof ticket === 'string' && ticket.length > 20);
        // JWT tiene 3 partes separadas por puntos
        assert.equal(ticket.split('.').length, 3);
    });

    it('retorna null cuando no hay sub ni id en claims', () => {
        const ticket = signContratacionWsTicket(DEPS_OK, {});
        assert.equal(ticket, null);
    });

    it('retorna null para claims null', () => {
        const ticket = signContratacionWsTicket(DEPS_OK, null);
        assert.equal(ticket, null);
    });

    it('utiliza el campo `id` como fallback de sub', () => {
        const claimsConId = { id: 'fallback-id-xyz' };
        const ticket = signContratacionWsTicket(DEPS_OK, claimsConId);
        assert.ok(ticket !== null, 'Debe generar ticket con campo id');
        const payload = verifyContratacionWsTicket(SECRET, ticket);
        assert.equal(payload.sub, 'fallback-id-xyz');
    });

    it('usa TTL por defecto de 300 si ttlSec no se provee', () => {
        const ticket = signContratacionWsTicket({ wsSecret: SECRET }, USER_CLAIMS);
        assert.ok(ticket !== null);
        const payload = verifyContratacionWsTicket(SECRET, ticket);
        // exp ≈ iat + 300
        assert.ok(payload.exp - payload.iat <= 301);
        assert.ok(payload.exp - payload.iat >= 299);
    });
});

// ─── verifyContratacionWsTicket ───────────────────────────────────────────────
describe('verifyContratacionWsTicket()', () => {
    it('verifica exitosamente un ticket recién emitido', () => {
        const ticket = signContratacionWsTicket(DEPS_OK, USER_CLAIMS);
        const payload = verifyContratacionWsTicket(SECRET, ticket);
        assert.equal(payload.sub, USER_CLAIMS.sub);
        assert.equal(payload.typ, 'contratacion_ws');
    });

    it('lanza error para token firmado con secreto diferente (manipulado)', () => {
        const ticket = signContratacionWsTicket(DEPS_OK, USER_CLAIMS);
        assert.throws(
            () => verifyContratacionWsTicket('wrong-secret-key-completely-different!', ticket),
            { name: 'JsonWebTokenError' }
        );
    });

    it('lanza error para token vacío', () => {
        assert.throws(() => verifyContratacionWsTicket(SECRET, ''), /JsonWebTokenError|SyntaxError/);
    });

    it('lanza error para token malformado', () => {
        assert.throws(
            () => verifyContratacionWsTicket(SECRET, 'esto.no.es.un.jwt.valido'),
            /JsonWebTokenError|SyntaxError/
        );
    });

    it('lanza error para ticket expirado', async () => {
        // Emitir ticket con TTL de 1 segundo
        const ticket = signContratacionWsTicket({ wsSecret: SECRET, ttlSec: 1 }, USER_CLAIMS);
        // Esperar a que expire
        await new Promise(resolve => setTimeout(resolve, 1500));
        assert.throws(
            () => verifyContratacionWsTicket(SECRET, ticket),
            (err) => {
                return err.name === 'TokenExpiredError';
            }
        );
    });

    it('lanza error si el payload tiene typ incorrecto', () => {
        const jwt = require('jsonwebtoken');
        // Ticket con typ diferente, firmado con el secreto correcto
        const maliciousToken = jwt.sign(
            { typ: 'otro_modulo', sub: 'hacker' },
            SECRET,
            { expiresIn: 300 }
        );
        assert.throws(
            () => verifyContratacionWsTicket(SECRET, maliciousToken),
            { name: 'JsonWebTokenError' },
            'typ incorrecto debe lanzar error'
        );
    });

    it('lanza error si sub está vacío en payload (posible token forjado)', () => {
        const jwt = require('jsonwebtoken');
        const tokenSinSub = jwt.sign(
            { typ: 'contratacion_ws', sub: '' },
            SECRET,
            { expiresIn: 300 }
        );
        assert.throws(
            () => verifyContratacionWsTicket(SECRET, tokenSinSub),
            { name: 'JsonWebTokenError' }
        );
    });
});

// ─── Ciclo completo: issue → verify ──────────────────────────────────────────
describe('Ciclo issue → verify', () => {
    it('múltiples tickets para el mismo usuario son todos válidos', () => {
        const tickets = Array.from({ length: 5 }, () =>
            signContratacionWsTicket(DEPS_OK, USER_CLAIMS)
        );
        tickets.forEach((t, i) => {
            const payload = verifyContratacionWsTicket(SECRET, t);
            assert.equal(payload.sub, USER_CLAIMS.sub, `Ticket ${i} sub inválido`);
        });
    });

    it('tickets distintos para usuarios diferentes tienen sub correcto', () => {
        const users = [
            { sub: 'user-A' },
            { sub: 'user-B' },
            { sub: 'user-C' }
        ];
        const tickets = users.map(u => signContratacionWsTicket(DEPS_OK, u));
        tickets.forEach((t, i) => {
            const payload = verifyContratacionWsTicket(SECRET, t);
            assert.equal(payload.sub, users[i].sub);
        });
    });
});
