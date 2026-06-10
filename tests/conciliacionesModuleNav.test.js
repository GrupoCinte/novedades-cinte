import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readModule(relativePath) {
  return readFileSync(join(root, relativePath), 'utf8');
}

test('ConciliacionesModule MFE no referencia variables de nav eliminadas', () => {
  const src = readModule('apps/mf-admin-conciliaciones/src/conciliaciones/ConciliacionesModule.jsx');
  assert.doesNotMatch(src, /\bnavInactive\b/);
  assert.doesNotMatch(src, /\bnavIconClass\b/);
});
