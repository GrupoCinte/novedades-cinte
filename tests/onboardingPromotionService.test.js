const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createOnboardingPromotionService } = require('../src/onboarding/onboardingPromotionService');

function createMockPool() {
    const stagingUpdates = [];
    const client = {
        query: async (sql, params) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return { rows: [] };
            }
            if (sql.includes('INSERT INTO onboarding_staging')) {
                return { rows: [{ id: '00000000-0000-4000-8000-000000000001' }] };
            }
            if (sql.includes('INSERT INTO colaboradores')) {
                return { rows: [{ cedula: params[0] }] };
            }
            if (sql.includes('UPDATE onboarding_staging')) {
                stagingUpdates.push({ sql, params });
                return { rows: [] };
            }
            if (sql.includes('UPDATE colaboradores SET')) {
                return { rows: [] };
            }
            return { rows: [] };
        },
        release() {}
    };
    return {
        stagingUpdates,
        connect: async () => client,
        query: client.query
    };
}

describe('createOnboardingPromotionService.promoteToColaborador', () => {
    it('aplica upsert terminal sin correo_cinte (flujo n8n/Dynamo)', async () => {
        const pool = createMockPool();
        const svc = createOnboardingPromotionService({ pool });
        const result = await svc.promoteToColaborador(
            {
                cedula: '1097400317',
                nombre: 'Andrés Felipe Buitrago Feria',
                status: 'Finalizado',
                email_personal: 'felipebuitrago75@gmail.com'
            },
            'dynamo_stream',
            { eventType: 'MODIFY' }
        );
        assert.equal(result.ok, true);
        assert.equal(result.status, 'aplicado');
        assert.equal(result.cedula, '1097400317');
        const lastStaging = pool.stagingUpdates[pool.stagingUpdates.length - 1];
        assert.equal(lastStaging.params[0], 'aplicado');
    });

    it('sigue exigiendo cedula y nombre en estado terminal', async () => {
        const pool = createMockPool();
        const svc = createOnboardingPromotionService({ pool });
        const result = await svc.promoteToColaborador(
            { status: 'finalizado', correo_cinte: 'x@cinte.com.co' },
            'dynamo_stream',
            { eventType: 'MODIFY' }
        );
        assert.equal(result.ok, false);
        assert.equal(result.status, 'requiere_revision');
        assert.match(result.error, /cedula/);
        assert.match(result.error, /nombre/);
    });
});
