const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { describe, it } = require('node:test');

const fieldsPath = path.join(__dirname, '../react-frontend/src/constants/colaboradoresConsultorFields.js');

describe('layout ficha Consultores AUT-337', () => {
    const src = fs.readFileSync(fieldsPath, 'utf8');

    it('las pestañas quedan General, Datos del puesto, Financiera y Complementario', () => {
        assert.match(src, /id: 'general'/);
        assert.match(src, /id: 'puesto'/);
        assert.match(src, /shortTitle: 'Datos del puesto'/);
        assert.match(src, /id: 'financiera'/);
        assert.match(src, /id: 'complementaria'/);
        assert.match(src, /shortTitle: 'Complementario'/);
        assert.doesNotMatch(src, /id: 'candidato'/);
    });

    it('emergencia no está en General y sí en Complementario', () => {
        const generalBlock = src.slice(src.indexOf("id: 'general'"), src.indexOf("id: 'puesto'"));
        const compBlock = src.slice(src.indexOf("id: 'complementaria'"));
        assert.ok(!generalBlock.includes('Contactos de emergencia'));
        assert.ok(compBlock.includes('Contactos de emergencia'));
        assert.ok(compBlock.includes('Formación'));
    });

    it('el puesto no trae viáticos ni ejecución no hábil', () => {
        const start = src.indexOf("title: 'Puesto y ejecución del servicio'");
        const end = src.indexOf("title: 'Stakeholders del cliente'");
        const puesto = src.slice(start, end);
        assert.ok(puesto.includes('horario_laboral'));
        assert.ok(!puesto.includes('politica_viaticos'));
        assert.ok(!puesto.includes('ejecucion_horario_no_habil'));
        assert.ok(!puesto.includes('direccion_proyecto'));
    });

    it('formación tiene inducción, reinducción e ISO', () => {
        const start = src.indexOf("title: 'Formación'");
        const end = src.indexOf("title: 'Teletrabajo'");
        const formacion = src.slice(start, end);
        assert.ok(formacion.includes('induccion'));
        assert.ok(formacion.includes('reinduccion'));
        assert.ok(formacion.includes('iso_9001_contextualizacion'));
        assert.match(src, /\['induccion', 'Inducción', 'select'\]/);
        assert.match(src, /\['periodicidad_pago', 'Forma de pago', 'select'\]/);
    });

    it('oculta Controller, día familia y ficha de extensión', async () => {
        const { FICHA_HIDDEN_KEYS } = await import('../react-frontend/src/onboarding/fichaCatalogos.js');
        assert.ok(FICHA_HIDDEN_KEYS.includes('controller_staff'));
        assert.ok(FICHA_HIDDEN_KEYS.includes('dia_familia'));
        assert.ok(FICHA_HIDDEN_KEYS.includes('ficha_extension_proyecto'));
        assert.ok(FICHA_HIDDEN_KEYS.includes('email_gerente_servicio'));
    });
});
