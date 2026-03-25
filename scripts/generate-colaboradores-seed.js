/**
 * Uso opcional en desarrollo: lee un Excel local y genera src/data/colaboradores-seed.json.
 * El .xlsx NO se sube al repositorio ni se usa en producción; solo este JSON versionado.
 *
 * Ejemplo (PowerShell):
 *   node scripts/generate-colaboradores-seed.js "C:\Users\pc\Desktop\COLABORADORES (1).xlsx"
 */
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const excelPath = process.argv[2];
if (!excelPath) {
    console.error('Uso: node scripts/generate-colaboradores-seed.js <ruta-al.xlsx>');
    process.exit(1);
}
if (!fs.existsSync(excelPath)) {
    console.error('No existe el archivo:', excelPath);
    process.exit(1);
}

const normCed = (v) => String(v == null ? '' : v).replace(/\D/g, '');

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
    out.push({ cedula: c, nombre: n });
}

const outPath = path.join(__dirname, '..', 'src', 'data', 'colaboradores-seed.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out));
console.log('Escrito:', outPath, '| registros ACTIVOS únicos:', out.length);
