import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    canonicalizeChView,
    maestroBajasExcludedColumnKeys,
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

    it('Bajas se lee como Activos: puesto y fechas; sin tipo, fecha de baja ni permanencia', () => {
        const cols = maestroGridColumnKeys();
        const hidden = maestroBajasExcludedColumnKeys();
        assert.ok(cols.includes('puesto'));
        assert.ok(cols.includes('fecha_ingreso'));
        assert.ok(cols.includes('fecha_termino'));
        assert.ok(cols.includes('tipo_contrato'));
        for (const key of hidden) {
            assert.equal(cols.includes(key), false);
        }
    });
});
