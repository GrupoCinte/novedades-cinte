import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  NOVEDAD_TYPES,
  countBusinessDaysInclusive,
  getNovedadRule,
  resolveCanonicalNovedadTipo,
} from './novedadRules.js';

describe('novedadRules (shared)', () => {
  it('expone tipos canónicos de novedad', () => {
    assert.ok(NOVEDAD_TYPES.includes('Incapacidad'));
    assert.ok(NOVEDAD_TYPES.includes('Hora Extra'));
  });

  it('normaliza alias legacy de tipo', () => {
    assert.equal(resolveCanonicalNovedadTipo('hora_extra'), 'Hora Extra');
  });

  it('calcula días hábiles excluyendo fines de semana', () => {
    const dias = countBusinessDaysInclusive('2026-05-04', '2026-05-08');
    assert.equal(dias, 5);
  });

  it('getNovedadRule devuelve regla para tipo válido', () => {
    const rule = getNovedadRule('Incapacidad');
    assert.equal(rule.requiresDayCount, true);
    assert.equal(rule.autoCalendarDays, true);
  });

  it('getNovedadRule devuelve fallback para tipo desconocido', () => {
    const rule = getNovedadRule('Tipo inventado');
    assert.equal(rule.requiresDayCount, false);
    assert.deepEqual(rule.approvers, []);
  });
});
