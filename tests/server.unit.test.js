/**
 * @file server.unit.test.js
 * @description Pruebas unitarias de las funciones puras del backend (server.js).
 *              Se extraen/replican las funciones para testearlas sin levantar el servidor.
 *              Usa Vitest/Jest con mocks nativos de Node.js.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

function expect(received, message = '') {
  return {
    toBe(expected) {
      assert.strictEqual(received, expected, message);
    },
    toBeNull() {
      assert.strictEqual(received, null, message);
    },
    toBeUndefined() {
      assert.strictEqual(received, undefined, message);
    },
    toBeDefined() {
      assert.notStrictEqual(received, undefined, message);
    },
    toContain(expected) {
      assert.ok(received.includes(expected), message || `Expected ${JSON.stringify(received)} to contain ${expected}`);
    },
    toMatch(regex) {
      assert.match(received, regex, message);
    },
    toBeLessThanOrEqual(expected) {
      assert.ok(received <= expected, message || `Expected ${received} <= ${expected}`);
    },
    not: {
      toContain(expected) {
        assert.ok(!received.includes(expected), message || `Expected ${JSON.stringify(received)} not to contain ${expected}`);
      },
      toBeNull() {
        assert.notStrictEqual(received, null, message);
      }
    }
  };
}

expect.fail = (msg) => assert.fail(msg || 'Forced failure');

// ─── Funciones replicadas del servidor (funciones puras, sin I/O) ──────────────
// Se replican aquí para poder testearlas de forma aislada dado que server.js
// no exporta sus funciones. En un refactor futuro, estas deberían extraerse a utils/.

const ROLE_PRIORITY = ['super_admin', 'admin_ch', 'team_ch', 'admin_ops', 'gp', 'nomina', 'sst'];

const POLICY = {
  super_admin: { panels: ['dashboard', 'calendar', 'gestion', 'admin'], viewAllAreas: true },
  admin_ch: { panels: ['dashboard', 'calendar', 'gestion'] },
  team_ch: { panels: ['dashboard', 'calendar', 'gestion'] },
  admin_ops: { panels: ['dashboard', 'calendar'] },
  gp: { panels: ['gestion'] },
  nomina: { panels: ['dashboard', 'calendar', 'gestion'] },
  sst: { panels: ['dashboard', 'calendar', 'gestion'] },
};

function normalizeRoleOrNull(value) {
  const v = String(value || '').trim().toLowerCase();
  if (ROLE_PRIORITY.includes(v)) return v;
  return null;
}

function normalizeEstado(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'aprobado') return 'Aprobado';
  if (v === 'rechazado') return 'Rechazado';
  return 'Pendiente';
}

function parseDateOrNull(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.toUpperCase() === 'N/A') return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function parseTimeOrNull(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!match) return null;
  const hh = match[1];
  const mm = match[2];
  const ss = match[3] || '00';
  return `${hh}:${mm}:${ss}`;
}

function isStrongPassword(pw = '') {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/.test(pw);
}

function sanitizeSegment(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'anonimo';
}

function sanitizeFileName(value = '') {
  const safe = String(value || 'archivo.bin')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return safe || 'archivo.bin';
}

function getAreaFromRole(role) {
  if (role === 'super_admin') return 'Global';
  if (role === 'admin_ch' || role === 'team_ch') return 'Capital Humano';
  if (role === 'admin_ops' || role === 'gp') return 'Operaciones';
  if (role === 'nomina' || role === 'sst') return 'Capital Humano';
  return '';
}

function normalizeNovedadTypeKey(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  const compact = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const map = {
    incapacidad: 'incapacidad',
    'calamidad domestica': 'calamidad_domestica',
    'permiso remunerado': 'permiso_remunerado',
    'licencia de luto': 'licencia_luto',
    'licencia por luto': 'licencia_luto',
    'licencia paternidad': 'licencia_paternidad',
    'licencia de paternidad': 'licencia_paternidad',
    'licencia maternidad': 'licencia_maternidad',
    'licencia de maternidad': 'licencia_maternidad',
    'licencia remunerada': 'licencia_remunerada',
    'licencia no remunerada': 'licencia_no_remunerada',
    'permiso no remunerado': 'permiso_no_remunerado',
    'permisos no remunerados': 'permiso_no_remunerado',
    'vacaciones en tiempo': 'vacaciones_tiempo',
    'vacaciones en dinero': 'vacaciones_dinero',
    'permiso compensatorio en tiempo': 'permiso_compensatorio_tiempo',
  };
  return map[compact] || '';
}

function resolveRoleFromGroups(groups = []) {
  const normalized = new Set(
    (Array.isArray(groups) ? groups : []).map((g) => String(g || '').trim().toLowerCase())
  );
  return ROLE_PRIORITY.find((role) => normalized.has(role)) || '';
}

function resolveEffectiveRole(baseRole, requestedRoleRaw = '') {
  const base = normalizeRoleOrNull(baseRole);
  const requested = normalizeRoleOrNull(requestedRoleRaw);
  if (!base) {
    const err = new Error('Rol base no válido para autenticación');
    err.status = 403;
    throw err;
  }
  if (!requested) return base;
  if (base === 'super_admin') return requested;
  if (requested !== base) {
    const err = new Error('No autorizado para ingresar con ese rol');
    err.status = 403;
    throw err;
  }
  return base;
}

function inferAreaFromNovedad(payload = {}) {
  const explicitArea = String(payload.area || '').trim();
  if (explicitArea === 'Capital Humano' || explicitArea === 'Operaciones') return explicitArea;
  const tipo = String(payload.tipoNovedad || payload.tipo || '').toLowerCase();
  if (tipo.includes('incapacidad') || tipo.includes('licencia')) return 'Capital Humano';
  return 'Operaciones';
}

// ─── TESTS ───────────────────────────────────────────────────────────────────

describe('normalizeRoleOrNull()', () => {
  it('debe retornar el rol en minúsculas cuando es válido', () => {
    expect(normalizeRoleOrNull('super_admin')).toBe('super_admin');
    expect(normalizeRoleOrNull('ADMIN_CH')).toBe('admin_ch');
    expect(normalizeRoleOrNull(' gp ')).toBe('gp');
    expect(normalizeRoleOrNull('Nomina')).toBe('nomina');
    expect(normalizeRoleOrNull('SST')).toBe('sst');
  });

  it('debe retornar null para roles inválidos', () => {
    expect(normalizeRoleOrNull('hacker')).toBeNull();
    expect(normalizeRoleOrNull('')).toBeNull();
    expect(normalizeRoleOrNull(null)).toBeNull();
    expect(normalizeRoleOrNull(undefined)).toBeNull();
    expect(normalizeRoleOrNull('root')).toBeNull();
  });
});

describe('normalizeEstado()', () => {
  it('debe normalizar estados válidos correctamente', () => {
    expect(normalizeEstado('aprobado')).toBe('Aprobado');
    expect(normalizeEstado('APROBADO')).toBe('Aprobado');
    expect(normalizeEstado('Aprobado')).toBe('Aprobado');
    expect(normalizeEstado('rechazado')).toBe('Rechazado');
    expect(normalizeEstado('RECHAZADO')).toBe('Rechazado');
  });

  it('debe retornar Pendiente para cualquier valor inválido o vacío', () => {
    expect(normalizeEstado('')).toBe('Pendiente');
    expect(normalizeEstado(null)).toBe('Pendiente');
    expect(normalizeEstado(undefined)).toBe('Pendiente');
    expect(normalizeEstado('en proceso')).toBe('Pendiente');
    expect(normalizeEstado('pending')).toBe('Pendiente');
  });
});

describe('parseDateOrNull()', () => {
  it('debe parsear fechas ISO correctamente', () => {
    expect(parseDateOrNull('2025-03-15')).toBe('2025-03-15');
    expect(parseDateOrNull('2024-12-31')).toBe('2024-12-31');
  });

  it('debe parsear fechas en formato legible', () => {
    const result = parseDateOrNull('January 1, 2025');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('debe retornar null para valores no válidos', () => {
    expect(parseDateOrNull('')).toBeNull();
    expect(parseDateOrNull(null)).toBeNull();
    expect(parseDateOrNull(undefined)).toBeNull();
    expect(parseDateOrNull('N/A')).toBeNull();
    expect(parseDateOrNull('no-es-fecha')).toBeNull();
  });

  it('debe retornar null para N/A case-insensitive', () => {
    expect(parseDateOrNull('n/a')).toBeNull();
    expect(parseDateOrNull(' N/A ')).toBeNull();
  });
});

describe('parseTimeOrNull()', () => {
  it('debe parsear tiempos HH:MM correctamente', () => {
    expect(parseTimeOrNull('08:30')).toBe('08:30:00');
    expect(parseTimeOrNull('23:59')).toBe('23:59:00');
    expect(parseTimeOrNull('00:00')).toBe('00:00:00');
  });

  it('debe parsear tiempos HH:MM:SS', () => {
    expect(parseTimeOrNull('14:45:30')).toBe('14:45:30');
  });

  it('debe retornar null para formatos inválidos', () => {
    expect(parseTimeOrNull('')).toBeNull();
    expect(parseTimeOrNull(null)).toBeNull();
    expect(parseTimeOrNull('25:00')).toBeNull();   // hora inválida
    expect(parseTimeOrNull('08:60')).toBeNull();   // minutos inválidos
    expect(parseTimeOrNull('8:30')).toBeNull();    // sin zero-padding
    expect(parseTimeOrNull('8am')).toBeNull();
  });
});

describe('isStrongPassword()', () => {
  it('debe aceptar contraseñas fuertes', () => {
    expect(isStrongPassword('Cinte2026*')).toBe(true);
    expect(isStrongPassword('Abc123!@')).toBe(true);
    expect(isStrongPassword('MiPass9#extra')).toBe(true);
    expect(isStrongPassword('Pass_Word1')).toBe(true);
  });

  it('debe rechazar contraseñas débiles', () => {
    expect(isStrongPassword('password')).toBe(false);      // sin números ni símbolos
    expect(isStrongPassword('PASSWORD1')).toBe(false);     // sin minúscula
    expect(isStrongPassword('Password')).toBe(false);      // sin número ni símbolo
    expect(isStrongPassword('Pass1*')).toBe(false);        // menos de 8 chars
    expect(isStrongPassword('')).toBe(false);
    expect(isStrongPassword('12345678')).toBe(false);      // solo números
    expect(isStrongPassword('ABCDEFGH1!')).toBe(false);    // sin minúscula
  });
});

describe('sanitizeSegment()', () => {
  it('debe convertir emails a segmentos seguros para S3', () => {
    expect(sanitizeSegment('usuario@empresa.com')).toBe('usuario_empresa.com');
    expect(sanitizeSegment('Juan García')).toBe('juan_garc_a');
  });

  it('debe truncar a 80 caracteres máximo', () => {
    const longString = 'a'.repeat(100) + '@ejemplo.com';
    expect(sanitizeSegment(longString).length).toBeLessThanOrEqual(80);
  });

  it('debe retornar "anonimo" para valores vacíos', () => {
    expect(sanitizeSegment('')).toBe('anonimo');
    expect(sanitizeSegment(null)).toBe('anonimo');
    expect(sanitizeSegment(undefined)).toBe('anonimo');
  });

  it('debe eliminar caracteres especiales peligrosos', () => {
    const result = sanitizeSegment('../../../etc/passwd');
    expect(result).not.toContain('/');
  });
});

describe('sanitizeFileName()', () => {
  it('debe retornar nombres seguros para archivos', () => {
    expect(sanitizeFileName('mi archivo.pdf')).toBe('mi_archivo.pdf');
    expect(sanitizeFileName('document.pdf')).toBe('document.pdf');
  });

  it('debe eliminar caracteres especiales', () => {
    const result = sanitizeFileName('../etc/passwd.pdf');
    expect(result).not.toContain('/');
  });

  it('debe retornar "archivo.bin" para valores vacíos', () => {
    expect(sanitizeFileName('')).toBe('archivo.bin');
    expect(sanitizeFileName(null)).toBe('archivo.bin');
  });
});

describe('getAreaFromRole()', () => {
  it('debe mapear roles a áreas correctas', () => {
    expect(getAreaFromRole('super_admin')).toBe('Global');
    expect(getAreaFromRole('admin_ch')).toBe('Capital Humano');
    expect(getAreaFromRole('team_ch')).toBe('Capital Humano');
    expect(getAreaFromRole('admin_ops')).toBe('Operaciones');
    expect(getAreaFromRole('gp')).toBe('Operaciones');
    expect(getAreaFromRole('nomina')).toBe('Capital Humano');
    expect(getAreaFromRole('sst')).toBe('Capital Humano');
  });

  it('debe retornar string vacío para roles inválidos', () => {
    expect(getAreaFromRole('')).toBe('');
    expect(getAreaFromRole('unknown')).toBe('');
    expect(getAreaFromRole(null)).toBe('');
  });
});

describe('normalizeNovedadTypeKey()', () => {
  it('debe normalizar tipos con tildes y mayúsculas', () => {
    expect(normalizeNovedadTypeKey('Incapacidad')).toBe('incapacidad');
    expect(normalizeNovedadTypeKey('INCAPACIDAD')).toBe('incapacidad');
    expect(normalizeNovedadTypeKey('Calamidad Doméstica')).toBe('calamidad_domestica'); // con tilde
    expect(normalizeNovedadTypeKey('Licencia de Luto')).toBe('licencia_luto');
    expect(normalizeNovedadTypeKey('Licencia por Luto')).toBe('licencia_luto'); // alias
    expect(normalizeNovedadTypeKey('Vacaciones en Tiempo')).toBe('vacaciones_tiempo');
    expect(normalizeNovedadTypeKey('Vacaciones en Dinero')).toBe('vacaciones_dinero');
    expect(normalizeNovedadTypeKey('Permiso no Remunerado')).toBe('permiso_no_remunerado');
    expect(normalizeNovedadTypeKey('Permisos no Remunerados')).toBe('permiso_no_remunerado'); // plural alias
  });

  it('debe retornar string vacío para tipos no reconocidos', () => {
    expect(normalizeNovedadTypeKey('')).toBe('');
    expect(normalizeNovedadTypeKey('TipoInventado')).toBe('');
    expect(normalizeNovedadTypeKey(null)).toBe('');
  });
});

describe('resolveRoleFromGroups()', () => {
  it('debe seleccionar el rol de mayor prioridad', () => {
    expect(resolveRoleFromGroups(['nomina', 'super_admin'])).toBe('super_admin');
    expect(resolveRoleFromGroups(['gp', 'admin_ch'])).toBe('admin_ch');
    expect(resolveRoleFromGroups(['sst', 'nomina'])).toBe('nomina');
  });

  it('debe ser case-insensitive', () => {
    expect(resolveRoleFromGroups(['SUPER_ADMIN', 'admin_ch'])).toBe('super_admin');
    expect(resolveRoleFromGroups([' GP '])).toBe('gp');
  });

  it('debe retornar string vacío si no hay grupos válidos', () => {
    expect(resolveRoleFromGroups([])).toBe('');
    expect(resolveRoleFromGroups(['hacker', 'unknown'])).toBe('');
    expect(resolveRoleFromGroups(null)).toBe('');
  });
});

describe('resolveEffectiveRole()', () => {
  it('super_admin puede asumir cualquier rol solicitado', () => {
    expect(resolveEffectiveRole('super_admin', 'admin_ch')).toBe('admin_ch');
    expect(resolveEffectiveRole('super_admin', 'gp')).toBe('gp');
    expect(resolveEffectiveRole('super_admin', 'nomina')).toBe('nomina');
  });

  it('un rol no-super solo puede ingresar con su propio rol', () => {
    expect(resolveEffectiveRole('admin_ch', 'admin_ch')).toBe('admin_ch');
    expect(resolveEffectiveRole('gp', '')).toBe('gp');
    expect(resolveEffectiveRole('nomina')).toBe('nomina');
  });

  it('debe lanzar 403 si un rol intenta usar otro rol diferente', () => {
    try {
      resolveEffectiveRole('admin_ch', 'gp');
      expect.fail('Debería lanzar error');
    } catch (e) {
      expect(e.message).toContain('No autorizado');
      expect(e.status).toBe(403);
    }
  });

  it('debe lanzar 403 con rol base inválido', () => {
    try {
      resolveEffectiveRole('hacker', '');
      expect.fail('Debería lanzar error');
    } catch (e) {
      expect(e.status).toBe(403);
    }
  });
});

describe('inferAreaFromNovedad()', () => {
  it('debe retornar áreas explícitas cuando son válidas', () => {
    expect(inferAreaFromNovedad({ area: 'Capital Humano' })).toBe('Capital Humano');
    expect(inferAreaFromNovedad({ area: 'Operaciones' })).toBe('Operaciones');
  });

  it('debe inferir "Capital Humano" para incapacidades y licencias', () => {
    expect(inferAreaFromNovedad({ tipoNovedad: 'Incapacidad' })).toBe('Capital Humano');
    expect(inferAreaFromNovedad({ tipoNovedad: 'Licencia de luto' })).toBe('Capital Humano');
    expect(inferAreaFromNovedad({ tipo: 'licencia_maternidad' })).toBe('Capital Humano');
  });

  it('debe inferir "Operaciones" por defecto para otros tipos', () => {
    expect(inferAreaFromNovedad({ tipoNovedad: 'Disponibilidad' })).toBe('Operaciones');
    expect(inferAreaFromNovedad({})).toBe('Operaciones');
  });

  it('debe ignorar áreas explícitas inválidas y usar inferencia', () => {
    expect(inferAreaFromNovedad({ area: 'Global', tipoNovedad: 'Incapacidad' })).toBe('Capital Humano');
    expect(inferAreaFromNovedad({ area: 'Desconocida' })).toBe('Operaciones');
  });
});

describe('POLICY – configuración de paneles', () => {
  const ALL_ROLES = Object.keys(POLICY);

  it('paneles mínimos: dashboard salvo gp (solo gestión de novedades)', () => {
    ALL_ROLES.forEach((role) => {
      const p = POLICY[role].panels;
      if (role === 'gp') {
        expect(p, 'gp solo usa gestion para novedades').toEqual(['gestion']);
      } else {
        expect(p, `Sin dashboard para: ${role}`).toContain('dashboard');
      }
    });
  });

  it('solo super_admin debe tener viewAllAreas = true', () => {
    ALL_ROLES.forEach((role) => {
      if (role === 'super_admin') {
        expect(POLICY[role].viewAllAreas).toBe(true);
      } else {
        expect(POLICY[role].viewAllAreas).toBeUndefined();
      }
    });
  });

  it('solo super_admin debe tener el panel "admin"', () => {
    ALL_ROLES.forEach((role) => {
      if (role === 'super_admin') {
        expect(POLICY[role].panels).toContain('admin');
      } else {
        expect(POLICY[role].panels).not.toContain('admin');
      }
    });
  });

  it('admin_ops no debe tener panel gestion', () => {
    expect(POLICY['admin_ops'].panels).not.toContain('gestion');
  });
});
