/**
 * @file novedadRules.test.js
 * @description Pruebas unitarias para el módulo de reglas de negocio de novedades.
 *              Valida reglas RBAC, documentos requeridos y comportamiento de getNovedadRule.
 */

import { describe, it, expect } from 'vitest';
import {
  NOVEDAD_RULES,
  NOVEDAD_TYPES,
  getNovedadRule,
} from '../novedadRules.js';

// ─── Constantes de dominio ────────────────────────────────────────────────────
// Roles actuales según src/rbac.js → ROLE_PRIORITY (cac reemplaza admin_ops/sst; comercial añadido)
const ALL_ROLES = ['super_admin', 'cac', 'admin_ch', 'team_ch', 'gp', 'nomina', 'comercial'];

// Catálogo vigente: 15 tipos (Disponibilidad reemplaza Apoyo/Apoyo Standby).
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
  'Vacaciones en tiempo',
  'Vacaciones en dinero',
  'Permiso compensatorio en tiempo',
  'Disponibilidad',
  'Bonos',
  'Hora Extra',
];

// ─── Estructura del catálogo ──────────────────────────────────────────────────
describe('NOVEDAD_RULES – estructura del catálogo', () => {
  it('debe exportar exactamente los 15 tipos de novedad definidos', () => {
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
    it('cac, admin_ch y team_ch deben ser aprobadores (flujo de aprobación CAC)', () => {
      expect(rule.approvers).toContain('cac');
      expect(rule.approvers).toContain('admin_ch');
      expect(rule.approvers).toContain('team_ch');
    });
    it('no debe requerir conteo de días ni rango de horas', () => {
      expect(rule.requiresDayCount).toBe(false);
      expect(rule.requiresTimeRange).toBe(false);
    });
    it('cac debe poder visualizar Incapacidad (reemplaza a sst)', () => {
      expect(rule.viewers).toContain('cac');
    });
  });

  // Calamidad doméstica
  describe('Calamidad domestica', () => {
    const rule = NOVEDAD_RULES['Calamidad domestica'];
    it('debe requerir Soporte de calamidad y Formato de permiso', () => {
      expect(rule.requiredDocuments).toContain('Soporte de calamidad');
      expect(rule.requiredDocuments).toContain('Formato de permiso');
    });
    it('debe requerir conteo de días', () => {
      expect(rule.requiresDayCount).toBe(true);
    });
    it('admin_ch y team_ch deben ser aprobadores', () => {
      expect(rule.approvers).toContain('admin_ch');
      expect(rule.approvers).toContain('team_ch');
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
    it('cac, admin_ch y team_ch deben ser aprobadores', () => {
      expect(rule.approvers).toContain('cac');
      expect(rule.approvers).toContain('admin_ch');
      expect(rule.approvers).toContain('team_ch');
    });
  });

  // Permiso no remunerado
  describe('Permiso no remunerado', () => {
    const rule = NOVEDAD_RULES['Permiso no remunerado'];
    it('debe requerir rango de tiempo (no días)', () => {
      expect(rule.requiresTimeRange).toBe(true);
      expect(rule.requiresDayCount).toBe(false);
    });
    it('no debe requerir documentos físicos', () => {
      expect(rule.requiredDocuments).toHaveLength(0);
    });
  });

  // Vacaciones en tiempo
  describe('Vacaciones en tiempo', () => {
    const rule = NOVEDAD_RULES['Vacaciones en tiempo'];
    it('debe requerir conteo de días', () => {
      expect(rule.requiresDayCount).toBe(true);
    });
    it('gp debe ser aprobador (junto con admin_ch, team_ch y cac)', () => {
      expect(rule.approvers).toContain('gp');
      expect(rule.approvers).toContain('admin_ch');
      expect(rule.approvers).toContain('cac');
    });
  });

  // Vacaciones en dinero
  describe('Vacaciones en dinero', () => {
    const rule = NOVEDAD_RULES['Vacaciones en dinero'];
    it('requiere carta y solicitud formal en PDF', () => {
      expect(rule.requiredDocuments).toEqual(['Carta con firma manuscrita (solicitud formal en PDF)']);
    });
    it('debe requerir conteo de días', () => {
      expect(rule.requiresDayCount).toBe(true);
    });
  });

  // Licencia no remunerada
  describe('Licencia no remunerada', () => {
    const rule = NOVEDAD_RULES['Licencia no remunerada'];
    it('no debe requerir documentos', () => {
      expect(rule.requiredDocuments).toHaveLength(0);
    });
    it('debe requerir conteo de días', () => {
      expect(rule.requiresDayCount).toBe(true);
    });
    it('gp y cac deben ser aprobadores', () => {
      expect(rule.approvers).toContain('gp');
      expect(rule.approvers).toContain('cac');
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
