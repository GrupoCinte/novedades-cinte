import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    canonicalizeChView,
    maestroBajasExcludedColumnKeys,
    maestroBajasExtraColumnKeys,
    maestroGridColumnKeys,
    maestroTipoPersonal,
    resolveChMaestroNav,
    resolveMaestroTab
} from '../react-frontend/src/onboarding/chMaestroNav.js';

describe('chMaestroNav AUT-314', () => {
    it('alias personal y bajas van a Consultores', () => {
        assert.equal(canonicalizeChView('personal'), 'consultores');
        assert.equal(canonicalizeChView('bajas'), 'consultores');
        assert.equal(canonicalizeChView('staff'), 'staff');
    });

    it('?v=bajas abre pestaña Bajas; ?v=personal abre Activos', () => {
        assert.deepEqual(resolveChMaestroNav('bajas', null), {
            view: 'consultores',
            tab: 'bajas',
            isMaestro: true
        });
        assert.deepEqual(resolveChMaestroNav('personal', ''), {
            view: 'consultores',
            tab: 'activos',
            isMaestro: true
        });
        assert.equal(resolveMaestroTab('sena', 'bajas'), 'bajas');
    });

    it('mapea tipo_personal por menú', () => {
        assert.equal(maestroTipoPersonal('consultores'), 'consultor');
        assert.equal(maestroTipoPersonal('staff'), 'staff');
        assert.equal(maestroTipoPersonal('sena'), 'sena');
    });

    it('Bajas suma Permanencia y Motivo; no vuelve Tipo ni fecha de baja', () => {
        const cols = maestroGridColumnKeys();
        const extras = maestroBajasExtraColumnKeys();
        const hidden = maestroBajasExcludedColumnKeys();
        assert.ok(cols.includes('puesto'));
        assert.ok(cols.includes('fecha_ingreso'));
        assert.ok(cols.includes('fecha_termino'));
        assert.ok(cols.includes('tipo_contrato'));
        assert.ok(extras.includes('tiempo_permanencia_meses'));
        assert.ok(extras.includes('motivo_baja'));
        for (const key of hidden) {
            assert.equal(cols.includes(key), false);
            assert.equal(extras.includes(key), false);
        }
    });
});
