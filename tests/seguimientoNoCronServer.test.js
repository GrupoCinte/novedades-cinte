const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

describe('AUT-286 anti-cron en server.js', () => {
    it('server.js no registra cron/setInterval de recordatorios T-5/T-1', () => {
        const serverPath = path.join(__dirname, '..', 'server.js');
        const src = fs.readFileSync(serverPath, 'utf8');
        assert.ok(src.includes('registerSeguimientoRoutes'), 'debe montar rutas seguimiento');
        assert.equal(/node-cron|cron\.schedule/i.test(src), false);
        assert.equal(/reminder_t5|T-5|T5.*setInterval|setInterval.*seguimiento/i.test(src), false);
        assert.equal(/seguimiento.*setInterval|setInterval.*vencimiento/i.test(src), false);
        assert.equal(/contratos-vencimiento|por-vencer.*setInterval|setInterval.*por-vencer/i.test(src), false);
    });
});
