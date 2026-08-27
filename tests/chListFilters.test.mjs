import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    asFilterList,
    serializeFilterParam,
    removeChipFromFilters,
    buildPersonalFilterChips,
    summarizeMultiSelect
} from '../react-frontend/src/onboarding/chListFilters.js';

describe('chListFilters AUT-316', () => {
    it('serializa listas a coma para el query', () => {
        assert.equal(serializeFilterParam(['Falabella', 'Bancolombia']), 'Falabella,Bancolombia');
        assert.equal(serializeFilterParam('Fijo'), 'Fijo');
        assert.equal(serializeFilterParam([]), undefined);
    });

    it('arma un chip por valor y se puede quitar uno solo', () => {
        const filters = { cliente: ['Falabella', 'Bancolombia'], tipo_contrato: ['Fijo'] };
        const chips = buildPersonalFilterChips(filters);
        assert.equal(chips.length, 3);
        assert.ok(chips.some((c) => c.label === 'Cliente: Falabella'));
        const next = removeChipFromFilters(filters, { key: 'cliente', value: 'Falabella' });
        assert.deepEqual(next.cliente, ['Bancolombia']);
        assert.deepEqual(next.tipo_contrato, ['Fijo']);
    });

    it('el chip de rango borra desde y hasta', () => {
        const filters = { fecha_ingreso_desde: '2026-01-01', fecha_ingreso_hasta: '2026-01-31' };
        const chips = buildPersonalFilterChips(filters);
        assert.equal(chips[0].id, 'rango-ingreso');
        const next = removeChipFromFilters(filters, chips[0]);
        assert.equal(next.fecha_ingreso_desde, undefined);
        assert.equal(next.fecha_ingreso_hasta, undefined);
    });

    it('asFilterList tolera string suelto', () => {
        assert.deepEqual(asFilterList('OPS'), ['OPS']);
        assert.deepEqual(asFilterList(null), []);
    });

    it('el disparador resume Todos, un valor o primero +N', () => {
        const items = [
            { value: 'Falabella', label: 'Falabella' },
            { value: 'Bancolombia', label: 'Bancolombia' }
        ];
        assert.equal(summarizeMultiSelect([], items), 'Todos');
        assert.equal(summarizeMultiSelect(['Falabella'], items), 'Falabella');
        assert.equal(summarizeMultiSelect(['Falabella', 'Bancolombia'], items), 'Falabella +1');
    });
});
