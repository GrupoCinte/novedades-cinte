const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
  POLICY,
  ROLE_PRIORITY,
  resolveRoleFromGroups,
  canRoleViewType,
  canRoleApproveType,
  getNovedadRuleByType,
  NOVELTY_RULES,
  getAreaFromRole,
  isNovedadTipoRetiradoDelFormulario
} = require('../src/rbac');

const EXPECTED_ROLE_PRIORITY = ['super_admin', 'cac', 'admin_ch', 'team_ch', 'gp', 'nomina', 'comercial', 'consultor'];
const allRoles = Object.keys(POLICY).sort();

describe('RBAC - prioridad de roles', () => {
  it('resuelve por prioridad correctamente', () => {
    assert.equal(resolveRoleFromGroups(['gp', 'super_admin']), 'super_admin');
    assert.equal(resolveRoleFromGroups(['comercial', 'nomina']), 'nomina');
    assert.equal(resolveRoleFromGroups(['gp', 'team_ch']), 'team_ch');
    assert.equal(resolveRoleFromGroups(['consultor']), 'consultor');
  });

  it('ROLE_PRIORITY coincide con política actual (CAC, sin admin_ops/sst)', () => {
    assert.deepEqual(ROLE_PRIORITY, EXPECTED_ROLE_PRIORITY);
  });
});

describe('RBAC - tipos retirados del formulario público', () => {
  it('marca vacaciones en tiempo/dinero y bonos como no admitidos en solicitud pública', () => {
    assert.equal(isNovedadTipoRetiradoDelFormulario('Vacaciones en tiempo'), true);
    assert.equal(isNovedadTipoRetiradoDelFormulario('Vacaciones en dinero'), true);
    assert.equal(isNovedadTipoRetiradoDelFormulario('Bonos'), true);
    assert.equal(isNovedadTipoRetiradoDelFormulario('Incapacidad'), false);
    assert.equal(isNovedadTipoRetiradoDelFormulario('Disponibilidad'), false);
  });
});

describe('RBAC - permisos por tipo', () => {
  it('super_admin puede ver/aprobar cualquier tipo', () => {
    const tipos = ['Incapacidad', 'Permiso remunerado', 'Licencia remunerada', 'Permiso compensatorio en tiempo'];
    for (const tipo of tipos) {
      assert.equal(canRoleViewType('super_admin', tipo), true);
      assert.equal(canRoleApproveType('super_admin', tipo), true);
    }
  });

  it('comercial solo tiene panel comercial (sin gestión de novedades por defecto)', () => {
    assert.deepEqual(POLICY.comercial?.panels, ['comercial']);
  });

  it('gp aprueba tipos asignados y no otros', () => {
    assert.equal(canRoleApproveType('gp', 'Permiso no remunerado'), true);
    assert.equal(canRoleApproveType('gp', 'Permiso compensatorio en tiempo'), true);
    assert.equal(canRoleApproveType('gp', 'Incapacidad'), false);
  });

  it('reglas de novedad existen para tipos críticos', () => {
    assert.ok(getNovedadRuleByType('Incapacidad'));
    assert.ok(getNovedadRuleByType('Licencia de paternidad'));
    assert.ok(getNovedadRuleByType('Vacaciones en dinero'));
  });
});

describe('RBAC - matriz roles en POLICY x tipos', () => {
  const allTypeNames = Object.values(NOVELTY_RULES).map((rule) => rule.displayName);

  it('todos los roles de ROLE_PRIORITY existen en POLICY', () => {
    for (const r of ROLE_PRIORITY) {
      assert.ok(POLICY[r], `POLICY carece de rol ${r}`);
    }
  });

  it('POLICY solo define roles conocidos en ROLE_PRIORITY', () => {
    assert.deepEqual(Object.keys(POLICY).sort(), allRoles);
    for (const r of Object.keys(POLICY)) {
      assert.ok(ROLE_PRIORITY.includes(r), `rol ${r} no está en ROLE_PRIORITY`);
    }
  });

  it('cada rol tiene su área esperada', () => {
    const expectedAreaByRole = {
      super_admin: 'Global',
      cac: 'Capital Humano',
      admin_ch: 'Capital Humano',
      team_ch: 'Capital Humano',
      gp: 'Operaciones',
      nomina: 'Financiero',
      comercial: 'Comercial',
      consultor: 'Operaciones'
    };
    for (const role of Object.keys(expectedAreaByRole)) {
      assert.equal(getAreaFromRole(role), expectedAreaByRole[role], `area inválida para ${role}`);
    }
  });

  it('panel directorio (cliente/colaborador) solo en super_admin y cac', () => {
    assert.ok(POLICY.super_admin.panels.includes('directorio'));
    assert.ok(POLICY.cac.panels.includes('directorio'));
    for (const r of ROLE_PRIORITY) {
      if (r === 'super_admin' || r === 'cac') continue;
      assert.equal(
        Boolean(POLICY[r].panels?.includes('directorio')),
        false,
        `rol ${r} no debe exponer panel directorio`
      );
    }
  });

  it('super_admin puede ver y aprobar todos los tipos', () => {
    for (const typeName of allTypeNames) {
      assert.equal(canRoleViewType('super_admin', typeName), true, `super_admin no puede ver ${typeName}`);
      assert.equal(canRoleApproveType('super_admin', typeName), true, `super_admin no puede aprobar ${typeName}`);
    }
  });

  it('matchea viewers/approvers contra cada regla de novedad', () => {
    for (const [ruleKey, rule] of Object.entries(NOVELTY_RULES)) {
      const typeName = rule.displayName;
      for (const role of ROLE_PRIORITY) {
        const expectedView = role === 'super_admin' || (rule.viewers || []).includes(role);
        const expectedApprove = role === 'super_admin' || (rule.approvers || []).includes(role);
        assert.equal(
          canRoleViewType(role, typeName),
          expectedView,
          `view mismatch -> role=${role} type=${ruleKey}`
        );
        assert.equal(
          canRoleApproveType(role, typeName),
          expectedApprove,
          `approve mismatch -> role=${role} type=${ruleKey}`
        );
      }
    }
  });

  it('tipos desconocidos usan fallback de panel gestion para aprobación', () => {
    const unknownType = 'Tipo inexistente QA';
    for (const role of ROLE_PRIORITY) {
      const expectedApprove = role === 'super_admin' || Boolean(POLICY[role]?.panels?.includes('gestion'));
      assert.equal(
        canRoleApproveType(role, unknownType),
        expectedApprove,
        `fallback aprobación inválido para ${role}`
      );
      assert.equal(canRoleViewType(role, unknownType), true);
    }
  });
});
