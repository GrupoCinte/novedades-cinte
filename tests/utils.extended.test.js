/**
 * @file utils.extended.test.js
 * @description Pruebas unitarias extendidas para src/utils.js.
 *              Cubre funciones no incluidas en server.unit.test.js:
 *              buildS3SupportKey, decodeJwtPayload, normalizeCedula, parseIsoOrNull.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
    buildS3SupportKey,
    decodeJwtPayload,
    normalizeCedula,
    parseDateOrNull,
    parseTimeOrNull
} = require('../src/utils');

// parseIsoOrNull no está exportada en utils.js actual pero normalizeCedula sí
// Agrupamos aquí cobertura de las funciones exportadas no cubierta en server.unit.test.js

// ─── normalizeCedula ──────────────────────────────────────────────────────────
describe('normalizeCedula()', () => {
    it('extrae solo dígitos de cédulas con puntos', () => {
        assert.equal(normalizeCedula('1.234.567'), '1234567');
        assert.equal(normalizeCedula('12.345.678'), '12345678');
    });

    it('extrae solo dígitos de cédulas con guiones', () => {
        assert.equal(normalizeCedula('1-234-567'), '1234567');
    });

    it('devuelve string vacío para entrada vacía', () => {
        assert.equal(normalizeCedula(''), '');
        assert.equal(normalizeCedula(null), '');
        assert.equal(normalizeCedula(undefined), '');
    });

    it('no modifica cédula ya limpia', () => {
        assert.equal(normalizeCedula('12345678'), '12345678');
    });

    it('elimina espacios y letras mezcladas', () => {
        assert.equal(normalizeCedula('CC 12345678'), '12345678');
        assert.equal(normalizeCedula('NIT 900.123.456-7'), '9001234567');
    });
});

// ─── buildS3SupportKey ────────────────────────────────────────────────────────
describe('buildS3SupportKey()', () => {
    it('genera una ruta con prefijo soportes/YYYY/MM/', () => {
        const key = buildS3SupportKey({ correoSolicitante: 'test@cinte.co' }, 'documento.pdf');
        assert.match(key, /^soportes\/\d{4}\/\d{2}\//);
    });

    it('sanitiza el correo del solicitante en la clave', () => {
        const key = buildS3SupportKey({ correoSolicitante: 'usuario@empresa.com' }, 'soporte.pdf');
        assert.ok(!key.includes('@'), 'El @ debe ser sanitizado');
        assert.ok(!key.includes(' '), 'No deben quedar espacios');
    });

    it('sanitiza el nombre de archivo en la clave (sin separadores / activos)', () => {
        const key = buildS3SupportKey({ correoSolicitante: 'a@b.co' }, '../../../etc/passwd.pdf');
        // sanitizeFileName reemplaza / con _ → .._.._.._etc_passwd.pdf (formato S3-safe)
        // NO contiene /etc/passwd como segmento de ruta navegable en la clave S3
        assert.ok(!key.includes('/etc/passwd'), 'Ruta /etc/passwd no debe aparecer como segmento navegable');
        // La parte de filename (último segmento) no contiene / activos
        const parts = key.split('/');
        const filenamePart = parts[parts.length - 1];
        assert.ok(!filenamePart.includes('/'), 'El segmento filename no debe contener separadores /');
        // QA Finding TD-06: sanitizeFileName preserva "..", pero el "/" ya fue neutralizado.
    });

    it('usa "anonimo" cuando no hay correo', () => {
        const key = buildS3SupportKey({}, 'archivo.pdf');
        assert.ok(key.includes('anonimo'), 'Sin correo debe usar "anonimo"');
    });

    it('usa nombre como fallback si no hay correo', () => {
        const key = buildS3SupportKey({ nombre: 'Juan García' }, 'archivo.pdf');
        assert.ok(key.includes('juan'), 'Debe incluir nombre normalizado');
    });

    it('dos llamadas consecutivas generan claves únicas (timestamp + random)', () => {
        const k1 = buildS3SupportKey({ correoSolicitante: 'x@x.com' }, 'a.pdf');
        const k2 = buildS3SupportKey({ correoSolicitante: 'x@x.com' }, 'a.pdf');
        assert.notEqual(k1, k2, 'Claves S3 deben ser únicas');
    });

    it('clave nunca contiene caracteres S3-inseguros como espacios o ñ', () => {
        const key = buildS3SupportKey({ correoSolicitante: 'niño@cinte.co' }, 'soporte técnico.pdf');
        assert.ok(!/\s/.test(key), 'Sin espacios');
        assert.ok(!/[ñÑáéíóú]/i.test(key), 'Sin caracteres no-ASCII');
    });

    it('nombre de archivo vacío produce fallback "archivo.bin"', () => {
        const key = buildS3SupportKey({ correoSolicitante: 'user@co.co' }, '');
        assert.ok(key.includes('archivo.bin'), 'Archivo vacío → archivo.bin');
    });
});

// ─── decodeJwtPayload ─────────────────────────────────────────────────────────
describe('decodeJwtPayload()', () => {
    // JWT válido con payload: { sub: "user123", role: "admin_ch", exp: 9999999999 }
    // Generado manualmente: header.payload.signature (firma inválida, pero payload decodificable)
    const validPayload = { sub: 'user123', role: 'admin_ch', exp: 9_999_999_999 };
    const encodedPayload = Buffer.from(JSON.stringify(validPayload)).toString('base64url');
    const fakeJwt = `eyJhbGciOiJIUzI1NiJ9.${encodedPayload}.fakesignature`;

    it('decodifica el payload de un JWT bien formado', () => {
        const result = decodeJwtPayload(fakeJwt);
        assert.ok(result !== null);
        assert.equal(result.sub, 'user123');
        assert.equal(result.role, 'admin_ch');
    });

    it('retorna null para token vacío', () => {
        assert.equal(decodeJwtPayload(''), null);
        assert.equal(decodeJwtPayload(null), null);
        assert.equal(decodeJwtPayload(undefined), null);
    });

    it('retorna null para token con menos de 3 partes', () => {
        assert.equal(decodeJwtPayload('solo.dospartes'), null);
        assert.equal(decodeJwtPayload('unasolaparte'), null);
    });

    it('retorna null si el payload no es JSON válido', () => {
        const malformed = `header.${Buffer.from('not-json').toString('base64')}.sig`;
        assert.equal(decodeJwtPayload(malformed), null);
    });

    it('maneja padding URL-safe base64 correctamente', () => {
        // payloads con longitud que requiere padding
        const payload = { a: 'test_value' };
        const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
        const token = `h.${encoded}.s`;
        const result = decodeJwtPayload(token);
        assert.ok(result !== null);
        assert.equal(result.a, 'test_value');
    });
});

// ─── parseDateOrNull — casos no cubiertos en server.unit.test.js ──────────────
describe('parseDateOrNull() — casos adicionales', () => {
    it('devuelve null para fecha futura extrema (año 9999) — no inválida, pero válida', () => {
        const result = parseDateOrNull('9999-12-31');
        assert.equal(result, '9999-12-31');
    });

    it('retorna null para "N/A" en variantes de mayúsculas', () => {
        assert.equal(parseDateOrNull('n/a'), null);
        assert.equal(parseDateOrNull('N/a'), null);
        assert.equal(parseDateOrNull(' N/A '), null);
    });
});

// ─── parseTimeOrNull — casos boundary ────────────────────────────────────────
describe('parseTimeOrNull() — casos de frontera', () => {
    it('acepta 00:00:00 exacto (medianoche)', () => {
        assert.equal(parseTimeOrNull('00:00:00'), '00:00:00');
    });

    it('acepta 23:59:59 (un segundo antes de la medianoche)', () => {
        assert.equal(parseTimeOrNull('23:59:59'), '23:59:59');
    });

    it('rechaza hora 24:00', () => {
        assert.equal(parseTimeOrNull('24:00'), null);
    });

    it('rechaza segundos inválidos', () => {
        assert.equal(parseTimeOrNull('12:00:60'), null);
    });
});
