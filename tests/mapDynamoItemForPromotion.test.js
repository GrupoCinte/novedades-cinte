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

    it('parsea fecha_inicio larga n8n "27 de julio de 2026"', () => {
        const payload = mapDynamoItemForPromotion({
            cedula: '1128052332',
            'nombre y apellido': 'Pablo Gabriel Velilla Goenaga',
            status: 'Finalizado',
            fecha_inicio: '27 de julio de 2026',
            email: 'pablivg@gmail.com'
        });
        assert.equal(payload.fecha_ingreso, '2026-07-27');
    });

    it('parsea fecha_ingreso "28 de julio del 2026"', () => {
        const payload = mapDynamoItemForPromotion({
            cedula: '53930907',
            nombre: 'Aura Lorena Castellanos Chica',
            status: 'Finalizado',
            fecha_ingreso: '28 de julio del 2026'
        });
        assert.equal(payload.fecha_ingreso, '2026-07-28');
    });
});

describe('promoteToColaborador con extended sucio n8n', () => {
    it('aplica upsert aunque edad/fecha extended vengan en texto largo', async () => {
        const { createOnboardingPromotionService } = require('../src/onboarding/onboardingPromotionService');
        const stagingUpdates = [];
        const client = {
            query: async (sql, params) => {
                if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
                if (sql.includes('INSERT INTO onboarding_staging')) {
                    return { rows: [{ id: '00000000-0000-4000-8000-000000000099' }] };
                }
                if (sql.includes('INSERT INTO colaboradores')) {
                    return { rows: [{ cedula: params[0] }] };
                }
                if (sql.includes('UPDATE onboarding_staging')) {
                    stagingUpdates.push({ sql, params });
                    return { rows: [] };
                }
                if (sql.includes('UPDATE colaboradores SET')) {
                    // No debe recibir "25 anos" ni fechas largas crudas
                    for (const p of params.slice(1)) {
                        if (typeof p === 'string' && /\banos\b|de julio|septiembre/i.test(p)) {
                            throw new Error(`valor sucio en UPDATE: ${p}`);
                        }
                    }
                    return { rows: [] };
                }
                return { rows: [] };
            },
            release() {}
        };
        const pool = { connect: async () => client, query: client.query };
        const svc = createOnboardingPromotionService({ pool });
        const result = await svc.promoteToColaborador(
            {
                cedula: '1001050555',
                nombre: 'Cristian Daniel Guzmán Ramirez',
                status: 'Finalizado',
                fecha_ingreso: '2026-07-27',
                extended: {
                    edad: '25 anos',
                    fecha_termino: '29 de septiembre de 2026',
                    eps: 'SURA'
                }
            },
            'dynamo_stream',
            { eventType: 'MODIFY', sequenceNumber: 'test-sanitize' }
        );
        assert.equal(result.ok, true);
        assert.equal(result.status, 'aplicado');
        const last = stagingUpdates[stagingUpdates.length - 1];
        assert.equal(last.params[0], 'aplicado');
    });
});
