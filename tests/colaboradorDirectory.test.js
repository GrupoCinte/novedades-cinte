const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeConsultorNombre,
    foldNombreForMatch,
    resolvePostedContactFromColaborador,
    allocateUniqueSyntheticCedula
} = require('../src/colaboradorDirectory');

function normCat(s) {
    return String(s || '')
        .replace(/\s+/g, ' ')
        .trim();
}

test('normalizeConsultorNombre colapsa espacios y minúsculas', () => {
    assert.equal(normalizeConsultorNombre('  Ana   María  '), 'ana maría');
});

test('foldNombreForMatch iguala tildes y mayúsculas', () => {
    assert.equal(
        foldNombreForMatch('SUSANA VALENTINA VALENCIA GÓMEZ'),
        foldNombreForMatch('susana valentina valencia gomez')
    );
});

test('resolvePostedContactFromColaborador prioriza directorio', () => {
    const col = {
        correo_cinte: 'Dir@Cinte.com',
        cliente: '  ACME  ',
        lider_catalogo: 'Líder Uno'
    };
    const body = {
        correoSolicitante: 'hacker@evil.com',
        cliente: 'Otro',
        lider: 'Otro Lider'
    };
    const r = resolvePostedContactFromColaborador(body, col, normCat);
    assert.equal(r.correo, 'dir@cinte.com');
    assert.equal(r.cliente, 'ACME');
    assert.equal(r.lider, 'Líder Uno');
    assert.equal(r.lockCorreo, true);
    assert.equal(r.lockCliente, true);
    assert.equal(r.lockLider, true);
});

test('resolvePostedContactFromColaborador usa body si directorio vacío', () => {
    const col = { correo_cinte: '', cliente: '', lider_catalogo: null };
    const body = { correoSolicitante: 'a@b.co', cliente: 'X', lider: 'Y' };
    const r = resolvePostedContactFromColaborador(body, col, normCat);
    assert.equal(r.correo, 'a@b.co');
    assert.equal(r.cliente, 'X');
    assert.equal(r.lider, 'Y');
    assert.equal(r.lockCorreo, false);
});

test('allocateUniqueSyntheticCedula devuelve 8 dígitos únicos', async () => {
    const used = new Set();
    const pool = {
        async query(_sql, params) {
            const c = params[0];
            if (used.has(c)) return { rows: [{ x: 1 }] };
            used.add(c);
            return { rows: [] };
        }
    };
    const c = await allocateUniqueSyntheticCedula(pool, 20);
    assert.match(c, /^\d{8}$/);
});
