const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isOnboardingMonitorItem, mapDynamoItemToExecution } = require('../src/contratacion/utils/mappers');
const { buildZohoDynamoItem } = require('../src/onboarding/zohoLiteParse');

describe('contratacion mappers — monitor En ingreso', () => {
    it('isOnboardingMonitorItem excluye ítems zoho_novedad#', () => {
        const zoho = buildZohoDynamoItem({
            output: { ID_Registro: '20250322' },
            classify: { tipoNovedadZoho: 'salida', subject: 'Salida test' },
            msgId: 'msg-1',
            executionId: '99'
        });
        assert.equal(isOnboardingMonitorItem(zoho), false);
        assert.equal(isOnboardingMonitorItem({ record_type: 'zoho_novedad', email: 'x@test.com' }), false);
    });

    it('isOnboardingMonitorItem incluye candidato onboarding normal', () => {
        assert.equal(
            isOnboardingMonitorItem({
                whatsapp_number: 'candidato@example.com',
                email: 'candidato@example.com',
                status: 'contactado'
            }),
            true
        );
    });

    it('mapDynamoItemToExecution expone cédula normalizada', () => {
        const ex = mapDynamoItemToExecution({
            whatsapp_number: 'candidato@example.com',
            cedula: '1.017.890.123',
            status: 'Documentos Recibidos',
            nombre: 'Ana'
        });
        assert.equal(ex.cedula, '1017890123');
        assert.equal(ex.statusId, 4);
    });

    it('mapDynamoItemToExecution expone pendiente_revision en Zoho (filtrar antes del monitor)', () => {
        const zoho = buildZohoDynamoItem({
            output: { ID_Registro: '1' },
            classify: { tipoNovedadZoho: 'salida' },
            msgId: 'msg-2',
            executionId: '1'
        });
        const ex = mapDynamoItemToExecution({
            ...zoho,
            'nombre y apellido': 'Consultor Test',
            status: zoho.status
        });
        assert.equal(ex.realStatus, 'pendiente_revision');
        assert.ok(ex.executionId.startsWith('zoho_novedad#'));
        assert.equal(isOnboardingMonitorItem(zoho), false);
    });
});
