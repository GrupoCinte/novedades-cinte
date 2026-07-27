/**
 * @file novedadRules.test.js
 * @description Pruebas unitarias para el módulo de reglas de negocio de novedades.
 *              Valida reglas RBAC, documentos requeridos y comportamiento de getNovedadRule.
 */

import { describe, it, expect } from 'vitest';
import {
  NOVEDAD_RULES,
  NOVEDAD_RULES_LEGACY,
  NOVEDAD_TYPES,
  getNovedadRule,
  getDiasEfectivosNovedad,
  countBusinessDaysInclusive,
  countCalendarDaysInclusive,
  getCantidadMedidaKind,
  formatCantidadNovedad,
  getCantidadDetalleEtiqueta,
} from '../novedadRules.js';

// ─── Constantes de dominio ────────────────────────────────────────────────────
// Roles actuales según src/rbac.js → ROLE_PRIORITY (cac reemplaza admin_ops/sst; comercial añadido)
const ALL_ROLES = ['super_admin', 'cac', 'admin_ch', 'team_ch', 'gp', 'nomina', 'comercial'];

// Catálogo vigente en formulario: 15 tipos (Vacaciones en tiempo y Bonos siguen como histórico en NOVEDAD_RULES_LEGACY).
const ALL_NOVEDAD_TYPES = [
  'Incapacidad',
  'Calamidad domestica',
  'Permiso remunerado',
  'Licencia de luto',
  'Licencia de paternidad',
  'Licencia de maternidad',
  'Licencia remunerada',
  'Licencia no remunerada',
  'Permiso no remunerado',
  'Permiso compensatorio en tiempo',
  'Compensatorio por votación/jurado',
  'Disponibilidad',
  'Hora Extra',
  'Suspensión',
  'Vacaciones en dinero',
];

// ─── Estructura del catálogo ──────────────────────────────────────────────────
describe('NOVEDAD_RULES – estructura del catálogo', () => {
  it('debe exportar exactamente los 15 tipos de novedad activos en el catálogo', () => {
    expect(NOVEDAD_TYPES).toHaveLength(15);
    ALL_NOVEDAD_TYPES.forEach((tipo) => {
      expect(NOVEDAD_TYPES).toContain(tipo);
    });
  });

  it('cada regla debe tener las propiedades obligatorias con tipos correctos', () => {
    ALL_NOVEDAD_TYPES.forEach((tipo) => {
      const rule = NOVEDAD_RULES[tipo];
      expect(rule, `Falta regla para: ${tipo}`).toBeDefined();
      expect(Array.isArray(rule.requiredDocuments)).toBe(true);
      expect(Array.isArray(rule.formatLinks)).toBe(true);
      expect(Array.isArray(rule.approvers)).toBe(true);
      expect(Array.isArray(rule.viewers)).toBe(true);
      expect(typeof rule.requiresDayCount).toBe('boolean');
      expect(typeof rule.requiresTimeRange).toBe('boolean');
    });
  });

  it('super_admin debe estar en viewers de todos los tipos', () => {
    ALL_NOVEDAD_TYPES.forEach((tipo) => {
      const rule = NOVEDAD_RULES[tipo];
      expect(rule.viewers, `super_admin no visible en: ${tipo}`).toContain('super_admin');
    });
  });

  it('los approvers deben ser un subconjunto de roles válidos', () => {
    ALL_NOVEDAD_TYPES.forEach((tipo) => {
      const rule = NOVEDAD_RULES[tipo];
      rule.approvers.forEach((approver) => {
        expect(ALL_ROLES, `Rol inválido '${approver}' en approvers de '${tipo}'`).toContain(approver);
      });
    });
  });

  it('los viewers deben ser un subconjunto de roles válidos', () => {
    ALL_NOVEDAD_TYPES.forEach((tipo) => {
      const rule = NOVEDAD_RULES[tipo];
      rule.viewers.forEach((viewer) => {
        expect(ALL_ROLES, `Rol inválido '${viewer}' en viewers de '${tipo}'`).toContain(viewer);
      });
    });
  });
});

// ─── Reglas específicas por tipo ─────────────────────────────────────────────
describe('NOVEDAD_RULES – reglas de negocio por tipo', () => {
  // Incapacidad
  describe('Incapacidad', () => {
    const rule = NOVEDAD_RULES['Incapacidad'];
    it('debe requerir solo el documento de Incapacidad', () => {
      expect(rule.requiredDocuments).toEqual(['Incapacidad']);
    });
    it('solo admin_ch aprueba tras flujo nómina (alineado con src/rbac.js)', () => {
      expect(rule.approvers).toEqual(['admin_ch']);
    });
    it('debe calcular días de calendario automáticamente con rango de fechas (sin rango de horas)', () => {
      expect(rule.requiresDayCount).toBe(true);
      expect(rule.autoCalendarDays).toBe(true);
      expect(rule.autoBusinessDays).toBeFalsy();
      expect(rule.requiresTimeRange).toBe(false);
    });
    it('cac debe poder visualizar Incapacidad (reemplaza a sst)', () => {
      expect(rule.viewers).toContain('cac');
    });
    it('debe contar sábado–domingo como 2 días calendario (no 0 hábiles)', () => {
      const fi = '2026-01-10';
      const ff = '2026-01-11';
      expect(countBusinessDaysInclusive(fi, ff)).toBe(0);
      expect(countCalendarDaysInclusive(fi, ff)).toBe(2);
      expect(getDiasEfectivosNovedad('Incapacidad', '', fi, ff)).toBe(2);
    });
  });

  // Calamidad doméstica
  describe('Calamidad domestica', () => {
    const rule = NOVEDAD_RULES['Calamidad domestica'];
    it('debe requerir Soporte de calamidad y Formato de permiso', () => {
      expect(rule.requiredDocuments).toContain('Soporte de calamidad');
      expect(rule.requiredDocuments).toContain('Formato de permiso');
    });
    it('debe requerir conteo de días con cálculo automático hábil', () => {
      expect(rule.requiresDayCount).toBe(true);
      expect(rule.autoBusinessDays).toBe(true);
    });
    it('solo admin_ch es aprobador (alineado con src/rbac.js)', () => {
      expect(rule.approvers).toEqual(['admin_ch']);
    });
    it('debe tener link de formato de permiso', () => {
      expect(rule.formatLinks).toHaveLength(1);
      expect(rule.formatLinks[0].href).toMatch(/\.xlsx$/);
    });
  });

  // Licencia de luto
  describe('Licencia de luto', () => {
    const rule = NOVEDAD_RULES['Licencia de luto'];
    it('debe requerir 3 documentos específicos', () => {
      expect(rule.requiredDocuments).toHaveLength(3);
      expect(rule.requiredDocuments).toContain('Registro civil consultor');
      expect(rule.requiredDocuments).toContain('Soporte parentesco');
      expect(rule.requiredDocuments).toContain('Acta de defuncion');
    });
    it('nomina debe poder visualizar Licencia de luto', () => {
      expect(rule.viewers).toContain('nomina');
    });
  });

  // Licencia de paternidad
  describe('Licencia de paternidad', () => {
    const rule = NOVEDAD_RULES['Licencia de paternidad'];
    it('debe requerir documentos de nacimiento', () => {
      expect(rule.requiredDocuments).toContain('Certificado nacido vivo');
      expect(rule.requiredDocuments).toContain('Registro civil bebe');
    });
    it('solo admin_ch es aprobador (alineado con src/rbac.js)', () => {
      expect(rule.approvers).toEqual(['admin_ch']);
    });
  });

  // Permiso no remunerado
  describe('Permiso no remunerado', () => {
    const rule = NOVEDAD_RULES['Permiso no remunerado'];
    it('debe usar el modo dual Días/Horas (sin rango horario obligatorio)', () => {
      expect(rule.requiresTimeRange).toBe(false);
      expect(rule.requiresDayCount).toBe(true);
      expect(rule.autoBusinessDays).toBe(true);
      expect(rule.permisoRemuneradoHoras).toBe(true);
    });
    it('no debe requerir documentos físicos', () => {
      expect(rule.requiredDocuments).toHaveLength(0);
    });
  });

  // Vacaciones en tiempo (solo histórico; no en selector del formulario)
  describe('Vacaciones en tiempo', () => {
    const rule = NOVEDAD_RULES_LEGACY['Vacaciones en tiempo'];
    it('debe requerir conteo de días', () => {
      expect(rule.requiresDayCount).toBe(true);
    });
    it('gp debe ser aprobador (junto con admin_ch, team_ch y cac)', () => {
      expect(rule.approvers).toContain('gp');
      expect(rule.approvers).toContain('admin_ch');
      expect(rule.approvers).toContain('cac');
    });
  });

  // Vacaciones en dinero (activa: el GP ahora la registra y la visualiza)
  describe('Vacaciones en dinero', () => {
    const rule = NOVEDAD_RULES['Vacaciones en dinero'];
    it('está en el catálogo activo, no en NOVEDAD_RULES_LEGACY', () => {
      expect(rule).toBeDefined();
      expect(NOVEDAD_RULES_LEGACY['Vacaciones en dinero']).toBeUndefined();
    });
    it('requiere carta con firma manuscrita (PDF)', () => {
      expect(rule.requiredDocuments).toEqual(['Carta con firma manuscrita (solicitud formal en PDF)']);
    });
    it('debe requerir conteo de días sin cálculo automático ni rango horario', () => {
      expect(rule.requiresDayCount).toBe(true);
      expect(rule.requiresTimeRange).toBe(false);
      expect(rule.autoBusinessDays).toBe(false);
    });
    it('solo admin_ch aprueba (CH); el visor incluye GP además de CH y nómina', () => {
      expect(rule.approvers).toEqual(['admin_ch']);
      expect(rule.viewers).toEqual(
        expect.arrayContaining(['super_admin', 'admin_ch', 'team_ch', 'cac', 'gp', 'nomina'])
      );
    });
  });

  // Licencia no remunerada
  describe('Licencia no remunerada', () => {
    const rule = NOVEDAD_RULES['Licencia no remunerada'];
    it('no debe requerir documentos', () => {
      expect(rule.requiredDocuments).toHaveLength(0);
    });
    it('debe requerir conteo de días con cálculo automático hábil', () => {
      expect(rule.requiresDayCount).toBe(true);
      expect(rule.autoBusinessDays).toBe(true);
    });
    it('solo admin_ch es aprobador (alineado con src/rbac.js)', () => {
      expect(rule.approvers).toEqual(['admin_ch']);
    });
  });

  // Suspensión (HU crear-novedad-de-suspension)
  describe('Suspensión', () => {
    const rule = NOVEDAD_RULES['Suspensión'];
    it('no debe requerir documentos físicos', () => {
      expect(rule.requiredDocuments).toHaveLength(0);
    });
    it('no usa rango de horas ni conteo de días (solo fechas + observaciones)', () => {
      expect(rule.requiresTimeRange).toBe(false);
      expect(rule.requiresDayCount).toBe(false);
      expect(rule.autoBusinessDays).toBeFalsy();
      expect(rule.autoCalendarDays).toBeFalsy();
    });
    it('exige fecha fin y muestra textarea de observaciones', () => {
      expect(rule.requiresFechaFin).toBe(true);
      expect(rule.requiresObservaciones).toBe(true);
    });
    it('aprueba solo gp (operativa, clientes asignados)', () => {
      expect(rule.approvers).toEqual(['gp']);
    });
    it('viewers estándar operativo (incluye nomina y CH)', () => {
      expect(rule.viewers).toEqual(
        expect.arrayContaining(['super_admin', 'gp', 'admin_ch', 'team_ch', 'cac', 'nomina'])
      );
    });
    it('alias snake "suspension" resuelve al canónico con tilde', () => {
      const r = getNovedadRule('suspension');
      expect(r.approvers).toEqual(['gp']);
      expect(r.requiresFechaFin).toBe(true);
    });
  });

  it('tipos operación: solo gp aprueba (alineado con src/rbac.js)', () => {
    expect(NOVEDAD_RULES['Permiso compensatorio en tiempo'].approvers).toEqual(['gp']);
    expect(NOVEDAD_RULES.Disponibilidad.approvers).toEqual(['gp']);
    expect(NOVEDAD_RULES['Hora Extra'].approvers).toEqual(['gp']);
    expect(NOVEDAD_RULES_LEGACY.Bonos.approvers).toEqual(['gp']);
  });

  describe('HU disponibilidad-monto-diligenciado-por-gp', () => {
    it('Disponibilidad mantiene requiresMonetaryAmount=true (etiqueta "Valor (COP)" en gestión)', () => {
      expect(NOVEDAD_RULES.Disponibilidad.requiresMonetaryAmount).toBe(true);
    });
    it('Disponibilidad declara montoDiligenciadoPorAprobador=true (consultor no diligencia el monto)', () => {
      expect(NOVEDAD_RULES.Disponibilidad.montoDiligenciadoPorAprobador).toBe(true);
    });
    it('Bonos NO debe tener montoDiligenciadoPorAprobador (sigue siendo diligenciado por el solicitante)', () => {
      expect(NOVEDAD_RULES_LEGACY.Bonos.montoDiligenciadoPorAprobador).toBeFalsy();
    });
  });

  describe('Compensatorio por votación/jurado', () => {
    const rule = NOVEDAD_RULES['Compensatorio por votación/jurado'];
    it('incluye gp en viewers y como aprobador (alineado con src/rbac.js)', () => {
      expect(rule.viewers).toContain('gp');
      expect(rule.viewers).toContain('nomina');
      expect(rule.approvers).toContain('gp');
      expect(rule.approvers).toContain('admin_ch');
    });
    it('sin modalidad en contexto: medida días por defecto (p. ej. jurado legacy)', () => {
      expect(getCantidadMedidaKind('Compensatorio por votación/jurado')).toBe('days');
    });
    it('modalidad solo_voto: cantidad_horas son horas de franja', () => {
      expect(getCantidadMedidaKind('Compensatorio por votación/jurado', { modalidad: 'solo_voto' })).toBe('hours');
      expect(formatCantidadNovedad('Compensatorio por votación/jurado', 4, { modalidad: 'solo_voto' })).toBe('4h');
    });
    it('modalidad solo_jurado: un día', () => {
      expect(getCantidadMedidaKind('Compensatorio por votación/jurado', { modalidad: 'solo_jurado' })).toBe('days');
      expect(formatCantidadNovedad('Compensatorio por votación/jurado', 1, { modalidad: 'solo_jurado' })).toBe('1 día');
    });
    it('inferencia medio día sin modalidad: misma fecha + horas', () => {
      const ctx = {
        fechaInicio: '2026-06-08',
        fechaFin: '2026-06-08',
        horaInicio: '08:00',
        horaFin: '12:00'
      };
      expect(getCantidadMedidaKind('Compensatorio por votación/jurado', ctx)).toBe('hours');
    });
  });

  describe('Permiso remunerado — unidad horas', () => {
    const ctx = { unidad: 'horas' };
    it('getCantidadMedidaKind usa contexto unidad=horas', () => {
      expect(getCantidadMedidaKind('Permiso remunerado', ctx)).toBe('hours');
    });
    it('formatCantidadNovedad muestra horas con sufijo h', () => {
      expect(formatCantidadNovedad('Permiso remunerado', 2.5, ctx)).toMatch(/2[,.]5/);
      expect(formatCantidadNovedad('Permiso remunerado', 2.5, ctx)).toMatch(/h\b/i);
    });
    it('etiqueta de detalle distingue horas', () => {
      expect(getCantidadDetalleEtiqueta('Permiso remunerado', ctx)).toMatch(/hora/i);
    });
  });

  describe('Toggle Días/Horas — Permiso no remunerado y compensatorio en tiempo', () => {
    const ctxHoras = { unidad: 'horas' };
    it('Permiso no remunerado en horas: medida=hours y sufijo h', () => {
      expect(getCantidadMedidaKind('Permiso no remunerado', ctxHoras)).toBe('hours');
      expect(formatCantidadNovedad('Permiso no remunerado', 3, ctxHoras)).toBe('3h');
    });
    it('Permiso no remunerado sin unidad: medida por defecto en días', () => {
      expect(getCantidadMedidaKind('Permiso no remunerado')).toBe('days');
    });
    it('Permiso compensatorio en tiempo en horas: medida=hours y sufijo h', () => {
      expect(getCantidadMedidaKind('Permiso compensatorio en tiempo', ctxHoras)).toBe('hours');
      expect(formatCantidadNovedad('Permiso compensatorio en tiempo', 1.5, ctxHoras)).toMatch(/1[,.]5h/);
    });
    it('Permiso compensatorio en tiempo sin unidad: medida en días', () => {
      expect(getCantidadMedidaKind('Permiso compensatorio en tiempo')).toBe('days');
    });
  });
});

// ─── getNovedadRule ───────────────────────────────────────────────────────────
describe('getNovedadRule()', () => {
  it('debe retornar la regla correcta para un tipo válido', () => {
    const rule = getNovedadRule('Incapacidad');
    expect(rule).toBeDefined();
    expect(rule.requiredDocuments).toContain('Incapacidad');
  });

  it('debe retornar una regla por defecto para un tipo desconocido', () => {
    const rule = getNovedadRule('TipoInexistente');
    expect(rule).toBeDefined();
    expect(rule.requiredDocuments).toHaveLength(0);
    expect(rule.approvers).toHaveLength(0);
    expect(rule.viewers).toContain('super_admin');
    expect(rule.requiresDayCount).toBe(false);
    expect(rule.requiresTimeRange).toBe(false);
  });

  it('debe retornar regla por defecto para string vacío', () => {
    const rule = getNovedadRule('');
    expect(rule).toBeDefined();
    expect(rule.viewers).toContain('super_admin');
  });

  it('debe retornar regla por defecto para undefined/null', () => {
    expect(() => getNovedadRule(undefined)).not.toThrow();
    expect(() => getNovedadRule(null)).not.toThrow();
    const rule = getNovedadRule(null);
    expect(rule.viewers).toContain('super_admin');
  });

  it('resuelve tipos retirados del selector (legacy) con las mismas reglas de negocio', () => {
    const bonos = getNovedadRule('Bonos');
    expect(bonos.requiresMonetaryAmount).toBe(true);
    expect(getNovedadRule('vacaciones_tiempo').requiresDayCount).toBe(true);
  });

  it('resuelve correctamente variantes de mayúsculas via alias (resolveCanonicalNovedadTipo)', () => {
    // resolveCanonicalNovedadTipo normaliza via TIPO_ALIAS_SNAKE: 'incapacidad' → 'Incapacidad'
    const ruleExact = getNovedadRule('Incapacidad');
    const ruleLower = getNovedadRule('incapacidad');
    expect(ruleExact.requiredDocuments).toHaveLength(1);
    // Desde la introd. de resolveCanonicalNovedadTipo, lowercase también resuelve correctamente
    expect(ruleLower.requiredDocuments).toHaveLength(1);
    expect(ruleLower.requiredDocuments).toContain('Incapacidad');
  });
});

// ─── Invariantes de negocio globales ─────────────────────────────────────────
describe('Invariantes de negocio globales', () => {
  it('requiresDayCount y requiresTimeRange no deben ser ambos true', () => {
    ALL_NOVEDAD_TYPES.forEach((tipo) => {
      const rule = NOVEDAD_RULES[tipo];
      expect(
        rule.requiresDayCount && rule.requiresTimeRange,
        `Conflicto de flags en: ${tipo}`
      ).toBe(false);
    });
  });

  it('todos los formatLinks deben tener label y href no vacíos', () => {
    ALL_NOVEDAD_TYPES.forEach((tipo) => {
      const rule = NOVEDAD_RULES[tipo];
      rule.formatLinks.forEach((link) => {
        expect(link.label, `Label vacío en formatLink de: ${tipo}`).toBeTruthy();
        expect(link.href, `Href vacío en formatLink de: ${tipo}`).toBeTruthy();
      });
    });
  });

  it('los formatLinks que existen deben apuntar a archivos .xlsx', () => {
    ALL_NOVEDAD_TYPES.forEach((tipo) => {
      const rule = NOVEDAD_RULES[tipo];
      rule.formatLinks.forEach((link) => {
        expect(link.href, `Link no es .xlsx en: ${tipo}`).toMatch(/\.xlsx/i);
      });
    });
  });
});
