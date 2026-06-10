const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const rootDir = path.resolve(__dirname, '..');

const REMOTES = [
  { name: 'radicacion', dir: 'apps/mf-radicacion' },
  { name: 'consultor', dir: 'apps/mf-portal-consultor' },
  { name: 'novedades', dir: 'apps/mf-admin-novedades' },
  { name: 'conciliaciones', dir: 'apps/mf-admin-conciliaciones' },
  { name: 'comercial', dir: 'apps/mf-admin-comercial' },
  { name: 'capitalHumano', dir: 'apps/mf-admin-capital-humano' },
  { name: 'directorio', dir: 'apps/mf-admin-directorio' }
];

function ensureProductionBuild() {
  const shellDistHtml = path.join(rootDir, 'apps/shell/dist/index.html');
  if (!fs.existsSync(shellDistHtml)) {
    console.log('Compilación de producción no encontrada. Compilando monorepo...');
    execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });
  }
}

describe('MFE Production Build Verification', () => {
  it('should compile and generate non-empty shell output', () => {
    ensureProductionBuild();
    const shellHtmlPath = path.join(rootDir, 'apps/shell/dist/index.html');
    assert.ok(fs.existsSync(shellHtmlPath), 'apps/shell/dist/index.html debe existir');
    const stats = fs.statSync(shellHtmlPath);
    assert.ok(stats.size > 200, 'apps/shell/dist/index.html no debe estar vacío');
  });

  REMOTES.forEach((remote) => {
    it(`should compile and generate non-empty remoteEntry.js for ${remote.name}`, () => {
      ensureProductionBuild();
      const remoteEntryPath = path.join(rootDir, remote.dir, 'dist/remoteEntry.js');
      assert.ok(fs.existsSync(remoteEntryPath), `${remoteEntryPath} debe existir`);
      const stats = fs.statSync(remoteEntryPath);
      assert.ok(stats.size > 100, `${remoteEntryPath} no debe estar vacío`);
    });
  });
});
