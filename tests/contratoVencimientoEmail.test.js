const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { buildHtml, subjectForKind } = require('../lambda/contratos-vencimiento/email');

describe('correo digest AUT-319', () => {
    it('asunto agrupa la tanda y el conteo', () => {
        assert.equal(
            subjectForKind('T30', '2026-08-27', 12),
            'Contratos que vencen en 30 días — 12 contratos — 2026-08-27'
        );
        assert.equal(
            subjectForKind('T5', '2026-08-27', 1),
            'Contratos que vencen en 5 días — 1 contrato — 2026-08-27'
        );
    });

    it('el HTML lista consultores y escapa nombres', () => {
        const html = buildHtml({
            kind: 'T15',
            asOfDate: '2026-08-27',
            items: [{ nombre: 'Ana <b>X</b>', cedula: '1', cliente: 'EXPERIAN', tipo_contrato: 'Fijo', fecha_termino: '2026-09-11' }]
        });
        assert.match(html, /Ana &lt;b&gt;X&lt;\/b&gt;/);
        assert.match(html, /EXPERIAN/);
        assert.match(html, /15 días/);
    });
});
