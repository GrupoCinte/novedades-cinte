import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    FICHA_HIDDEN_KEYS,
    FICHA_SECCION_INDICADORES,
    FICHA_SELECT_OPTIONS,
    edadEnAniosHastaHoy,
    optionsWithCurrent
} from '../react-frontend/src/onboarding/fichaCatalogos.js';

describe('fichaCatalogos AUT-315', () => {
    it('edad en años hasta hoy, antes y después del cumpleaños', () => {
        const hoy = new Date(2026, 7, 26);
        assert.equal(edadEnAniosHastaHoy('1991-08-27', hoy), '34');
        assert.equal(edadEnAniosHastaHoy('1991-08-26', hoy), '35');
        assert.equal(edadEnAniosHastaHoy('1991-08-25', hoy), '35');
    });

    it('edad vacía si no hay fecha válida', () => {
        assert.equal(edadEnAniosHastaHoy(''), '');
        assert.equal(edadEnAniosHastaHoy('n/a'), '');
        assert.equal(edadEnAniosHastaHoy('2099-01-01', new Date(2026, 0, 1)), '');
    });

    it('campos que salen de la ficha', () => {
        assert.deepEqual(FICHA_HIDDEN_KEYS, [
            'estado_catalogo',
            'segundo_idioma',
            'modalidad_adicional',
            'controller_staff',
            'email_gerente_servicio',
            'ejecucion_horario_no_habil',
            'direccion_proyecto',
            'politica_viaticos',
            'seguimiento_pp',
            'desempeno_ed_servicio',
            'dia_familia',
            'ficha_extension_proyecto',
            'contacto_focal_1_nombre',
            'contacto_focal_1_cargo',
            'contacto_focal_1_movil',
            'contacto_focal_1_email',
            'contacto_focal_2_nombre',
            'contacto_focal_2_cargo',
            'contacto_focal_2_movil',
            'contacto_focal_2_email',
            'contacto_admin_nombre',
            'contacto_admin_cargo',
            'contacto_admin_movil',
            'contacto_admin_email',
            'primer_contacto_familiar',
            'segundo_contacto_familiar'
        ]);
        assert.equal(FICHA_SECCION_INDICADORES, 'Indicadores y costos');
    });

    it('listas cerradas del ticket', () => {
        assert.deepEqual(FICHA_SELECT_OPTIONS.sexo, ['Masculino', 'Femenino', 'No refiere']);
        assert.ok(FICHA_SELECT_OPTIONS.tipo_identificacion.includes('PPT'));
        assert.ok(FICHA_SELECT_OPTIONS.departamento.includes('Bogotá D.C.'));
        assert.ok(FICHA_SELECT_OPTIONS.esquema_contrato.includes('Nómina'));
    });

    it('conserva un valor legado fuera de catálogo', () => {
        assert.deepEqual(optionsWithCurrent(['Fijo'], 'Temporal'), ['Temporal', 'Fijo']);
        assert.deepEqual(optionsWithCurrent(['Fijo'], 'Fijo'), ['Fijo']);
    });
});
