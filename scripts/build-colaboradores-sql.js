/**
 * Genera migrations/seed_colaboradores.sql desde un Excel local (solo desarrollo).
 * No ejecuta nada en runtime: el listado vive en PostgreSQL tras aplicar el SQL.
 *
 * Uso:
 *   node scripts/build-colaboradores-sql.js "C:\\ruta\\COLABORADORES (1).xlsx"
 */
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const excelPath = process.argv[2];
if (!excelPath) {
    console.error('Uso: node scripts/build-colaboradores-sql.js <ruta-al.xlsx>');
    process.exit(1);
}
if (!fs.existsSync(excelPath)) {
    console.error('No existe:', excelPath);
    process.exit(1);
}

const normCed = (v) => String(v == null ? '' : v).replace(/\D/g, '');
const sqlEsc = (s) => `'${String(s).replace(/'/g, "''")}'`;

const wb = xlsx.readFile(excelPath);
const sheetName = wb.SheetNames.includes('MAESTRO COLABORADORES')
    ? 'MAESTRO COLABORADORES'
    : wb.SheetNames[0];
const rows = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '' });

const out = [];
const seen = new Set();
for (const row of rows) {
    const est = String(row.ESTADO || '').trim().toUpperCase();
    if (est !== 'ACTIVO') continue;
    const c = normCed(row.DOCUMENTO);
    if (!c) continue;
    const n = String(row.COLABORADOR || '').replace(/\s+/g, ' ').trim();
    if (!n) continue;
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(`(${sqlEsc(c)}, ${sqlEsc(n)}, TRUE)`);
}

const header = `-- Maestro de colaboradores (cédula solo dígitos). Fuente: exportación única desde Excel.
-- Aplicar UNA VEZ por base de datos cuando apruebes el despliegue, no en el arranque de Node.
-- Ejemplo: docker exec -i postgres psql -U cinte_app -d novedades_cinte -f /tmp/seed_colaboradores.sql
-- O desde tu máquina: psql "$DATABASE_URL" -f migrations/seed_colaboradores.sql

`;

const body = `INSERT INTO colaboradores (cedula, nombre, activo) VALUES
${out.join(',\n')}
ON CONFLICT (cedula) DO UPDATE SET nombre = EXCLUDED.nombre, activo = TRUE, updated_at = NOW();
`;

const outPath = path.join(__dirname, '..', 'migrations', 'seed_colaboradores.sql');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, header + body, 'utf8');
console.log('Escrito:', outPath, '| filas:', out.length);
