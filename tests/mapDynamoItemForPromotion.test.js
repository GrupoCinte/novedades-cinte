const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mapDynamoItemForPromotion } = require('../src/onboarding/onboardingPromotionService');
const { flattenExtractorForDynamo } = require('../src/contratacion/extractorToFichaMap');

function loadSampleOutput() {
    const p = path.join(__dirname, 'fixtures/exec-11259-detail.json');
    const raw = fs.readFileSync(p, 'utf8');
    const doc = JSON.parse(raw);
    const run = doc?.data?.resultData?.runData?.['Agente Extractor Ficha']?.[0]?.data?.main?.[0]?.[0]?.json?.output;
    assert.ok(run, 'sample output from exec-11259');
    return run;
}

describe('mapDynamoItemForPromotion', () => {
    it('maps flat Dynamo item with extended keys', () => {
        const flat = flattenExtractorForDynamo(loadSampleOutput());
        const dynamoItem = {
            ...flat,
            whatsapp_number: 'diego@example.com',
            status: 'finalizado',
            correo_cinte: 'diego.contreras@cinte.com.co',
            email: flat.email_personal
        };
        const payload = mapDynamoItemForPromotion(dynamoItem);
        assert.equal(payload.cedula, '1010170944');
        assert.equal(payload.email_personal, flat.email_personal);
        assert.equal(payload.correo_cinte, 'diego.contreras@cinte.com.co');
        assert.equal(payload.fecha_ingreso, '2026-05-25');
        assert.ok(payload.sueldo_nomina > 0);
        assert.equal(payload.cliente, 'EXPERIAN COLOMBIA');
        assert.ok(payload.extended && typeof payload.extended === 'object');
        assert.ok(payload.extended.contacto_focal_1_nombre || payload.extended.gerente_servicio);
        assert.ok(payload.primer_contacto_familiar?.includes('Maria') || dynamoItem.primer_contacto_familiar);
    });

    it('does not treat personal email as correo_cinte', () => {
        const payload = mapDynamoItemForPromotion({
            cedula: '1234567890',
            email: 'personal@mail.com',
            status: 'contactado'
        });
        assert.equal(payload.correo_cinte, null);
        assert.equal(payload.email_personal, 'personal@mail.com');
    });
});
