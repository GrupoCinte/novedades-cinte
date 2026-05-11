/**
 * Lee consultores-activos-import-report.csv y escribe docs/consultores-activos-sin-match.md
 * con filas donde accion != actualizado (insertado, ambiguo, omitido).
 *
 * Uso: node scripts/sin-match-from-report-to-md.js [ruta-al-informe.csv]
 */
const fs = require('fs');
const path = require('path');

function parseCsvLine(line) {
    const out = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"') {
            if (inQ && line[i + 1] === '"') {
                cur += '"';
                i += 1;
            } else {
                inQ = !inQ;
            }
        } else if (ch === ',' && !inQ) {
            out.push(cur);
            cur = '';
        } else {
            cur += ch;
        }
    }
    out.push(cur);
    return out.map((s) => s.trim());
}

const reportPath = path.resolve(process.argv[2] || path.join(__dirname, '..', 'consultores-activos-import-report.csv'));
const outMd = path.join(__dirname, '..', 'docs', 'consultores-activos-sin-match.md');

if (!fs.existsSync(reportPath)) {
    console.error('No existe el informe:', reportPath);
    process.exit(1);
}

const lines = fs.readFileSync(reportPath, 'utf8').split(/\r?\n/).filter((l) => l.length > 0);
const header = parseCsvLine(lines[0]);
const idxAccion = header.indexOf('accion');
if (idxAccion < 0) {
    console.error('CSV sin columna accion');
    process.exit(1);
}

const sinMatch = [];
for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const accion = cols[idxAccion] || '';
    if (accion !== 'actualizado') {
        const row = {};
        header.forEach((h, j) => {
            row[h] = cols[j] ?? '';
        });
        sinMatch.push(row);
    }
}

const byAccion = { insertado: 0, ambiguo: 0, omitido: 0, otro: 0 };
for (const r of sinMatch) {
    const a = r.accion || 'otro';
    if (byAccion[a] != null) byAccion[a] += 1;
    else byAccion.otro += 1;
}

let md = `# Consultores activos — filas que no hicieron match por nombre

Fuente del informe: \`${path.basename(reportPath)}\`  
Generado: ${new Date().toISOString()}

## Qué significa cada acción

| Acción | Significado |
|--------|-------------|
| **insertado** | No había ningún colaborador en BD con el mismo nombre normalizado; se creó fila nueva (cédula sintética de 8 dígitos si aplica). |
| **ambiguo** | Había más de una cédula con el mismo nombre en BD; no se actualizó ninguna (revisión manual). |
| **omitido** | Fila del Excel sin nombre utilizable. |

## Resumen

- **Total filas sin match (≠ actualizado):** ${sinMatch.length}
- insertado: ${byAccion.insertado}
- ambiguo: ${byAccion.ambiguo}
- omitido: ${byAccion.omitido}
${byAccion.otro ? `- otro: ${byAccion.otro}` : ''}

## Detalle

| Fila Excel | Nombre (Excel) | Acción | Cédula | Cédula sintética | Correo | Cliente | Líder | Notas |
|------------|----------------|--------|--------|------------------|--------|---------|-------|-------|
`;

for (const r of sinMatch) {
    const esc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    md += `| ${esc(r.fila)} | ${esc(r.nombre_excel)} | ${esc(r.accion)} | ${esc(r.cedula)} | ${esc(r.cedula_sintetica)} | ${esc(r.correo)} | ${esc(r.cliente)} | ${esc(r.lider)} | ${esc(r.notas)} |\n`;
}

fs.mkdirSync(path.dirname(outMd), { recursive: true });
fs.writeFileSync(outMd, md, 'utf8');
console.log('Escrito:', outMd, '| filas:', sinMatch.length);
