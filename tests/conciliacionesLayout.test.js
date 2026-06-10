import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONCILIACIONES_PAGE_MAIN,
  CONCILIACIONES_SIDEBAR_BRAND
} from '../apps/mf-admin-conciliaciones/src/conciliaciones/conciliacionesLayout.js';

test('conciliacionesLayout sidebar brand coincide con rama testing', () => {
  assert.equal(CONCILIACIONES_SIDEBAR_BRAND.line1, 'Conciliaciones');
  assert.equal(CONCILIACIONES_SIDEBAR_BRAND.line2, 'Facturación vs novedades');
});

test('conciliacionesLayout contenedor principal usa padding de testing', () => {
  assert.equal(CONCILIACIONES_PAGE_MAIN, 'min-h-0 flex-1 space-y-5 p-4 sm:p-6');
});
