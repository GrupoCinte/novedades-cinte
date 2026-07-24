'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
    isZohoNovedadItem,
    isOnboardingMonitorItem,
    mapDynamoItemToExecution,
    mapStatusToId
} = require('../src/mapExecution');

describe('mapExecution classification', () => {
    it('detecta Zoho por record_type y pk', () => {
        assert.equal(isZohoNovedadItem({ record_type: 'zoho_novedad', pk: 'x' }), true);
        assert.equal(isZohoNovedadItem({ pk: 'zoho_novedad#abc' }), true);
        assert.equal(isZohoNovedadItem({ whatsapp_number: '57300', status: 'Finalizado' }), false);
        assert.equal(isOnboardingMonitorItem({ whatsapp_number: '57300' }), true);
        assert.equal(isOnboardingMonitorItem({ pk: 'zoho_novedad#1' }), false);
    });

    it('mapea status a statusId como el portal', () => {
        assert.equal(mapStatusToId('Documentos Recibidos'), 4);
        assert.equal(mapStatusToId('Sagrilaft Enviado'), 5);
        assert.equal(mapStatusToId('Finalizado'), 6);
        assert.equal(mapStatusToId('Cargando'), 1);
    });

    it('mapDynamoItemToExecution usa whatsapp_number como executionId', () => {
        const ex = mapDynamoItemToExecution({
            whatsapp_number: '573001112233',
            'nombre y apellido': 'Ana Test',
            status: 'Documentos Recibidos',
            email: 'ana@test.com'
        });
        assert.equal(ex.executionId, '573001112233');
        assert.equal(ex.workflowName, 'Ana Test');
        assert.equal(ex.statusId, 4);
        assert.equal(ex.realStatus, 'Documentos Recibidos');
        assert.ok(ex.fullData);
        assert.equal(ex.fullData.password, undefined);
    });
});
