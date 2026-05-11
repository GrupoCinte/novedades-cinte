/**
 * Inventario read-only del Excel consolidado (Fase 0 del plan de migración directorio).
 *
 * Uso:
 *   node scripts/inventory-capacidad-ser-administrados-xlsx.js "C:/ruta/archivo.xlsx"
 *   node scripts/inventory-capacidad-ser-administrados-xlsx.js "C:/ruta/archivo.xlsx" --out scripts/out/dev_excel_v2_inventory.json
 */
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

function parseArgs(argv) {
    const args = argv.slice(2);
    const out = { xlsxPath: '', outPath: path.resolve('scripts', 'out', 'dev_excel_v2_inventory.json') };
    for (let i = 0; i < args.length; i += 1) {
        const a = args[i];
        if (a === '--out') {
            out.outPath = path.resolve(String(args[i + 1] || out.outPath));
            i += 1;
        } else if (!a.startsWith('-') && !out.xlsxPath) {
            out.xlsxPath = path.resolve(a);
        }
    }
    return out;
}

function topValues(rows, key, n = 15) {
    const counts = new Map();
    for (const r of rows) {
        const v = r[key];
        const s = v == null ? '' : String(v).trim();
        if (!s) continue;
        counts.set(s, (counts.get(s) || 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([value, count]) => ({ value, count }));
}

function inferHeaderRow(matrix) {
    if (!matrix || !matrix.length) return 0;
    for (let i = 0; i < Math.min(15, matrix.length); i += 1) {
        const row = matrix[i] || [];
        const nonEmpty = row.filter((c) => String(c || '').trim()).length;
        if (nonEmpty >= 3) return i;
    }
    return 0;
}

function sheetInventory(wb, sheetName) {
    const ws = wb.Sheets[sheetName];
    const matrix = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    const headerRowIdx = inferHeaderRow(matrix);
    const headers = (matrix[headerRowIdx] || []).map((c) => String(c || '').trim());
    const dataRows = matrix.slice(headerRowIdx + 1).filter((row) => row.some((c) => String(c || '').trim()));
    const objects = xlsx.utils.sheet_to_json(ws, {
        defval: '',
        raw: false,
        range: headerRowIdx
    });
    const keys = [...new Set(objects.flatMap((o) => Object.keys(o)))].filter(Boolean);
    const columnStats = {};
    for (const k of keys) {
        columnStats[k] = {
            nonEmptyCount: objects.filter((o) => String(o[k] || '').trim()).length,
            sampleValues: topValues(objects, k, 12)
        };
    }
    return {
        sheetName,
        inferredHeaderRowIndex: headerRowIdx,
        headers,
        dataRowCount: dataRows.length,
        objectRowCount: objects.length,
        columnKeys: keys,
        columnStats
    };
}

function main() {
    const opts = parseArgs(process.argv);
    if (!opts.xlsxPath || !fs.existsSync(opts.xlsxPath)) {
        console.error('Uso: node scripts/inventory-capacidad-ser-administrados-xlsx.js <archivo.xlsx> [--out ruta.json]');
        process.exit(1);
    }

    const wb = xlsx.readFile(opts.xlsxPath, { cellDates: true });
    const generatedAt = new Date().toISOString();
    const payload = {
        generatedAt,
        sourceFile: opts.xlsxPath,
        sheetNames: wb.SheetNames,
        sheets: wb.SheetNames.map((name) => sheetInventory(wb, name))
    };

    fs.mkdirSync(path.dirname(opts.outPath), { recursive: true });
    fs.writeFileSync(opts.outPath, JSON.stringify(payload, null, 2), 'utf8');

    const mdPath = opts.outPath.replace(/\.json$/i, '_summary.md');
    const lines = [
        `# Inventario Excel (generado ${generatedAt})`,
        '',
        `- Archivo: \`${opts.xlsxPath}\``,
        `- Hojas: ${payload.sheetNames.length}`,
        ''
    ];
    for (const s of payload.sheets) {
        lines.push(`## Hoja: ${s.sheetName}`);
        lines.push('');
        lines.push(`- Filas de datos (aprox.): ${s.dataRowCount}`);
        lines.push(`- Fila de encabezado inferida (0-based): ${s.inferredHeaderRowIndex}`);
        lines.push(`- Columnas: ${s.columnKeys.join(' | ')}`);
        lines.push('');
    }
    fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');

    console.log(JSON.stringify({ ok: true, json: opts.outPath, md: mdPath, sheets: payload.sheetNames }, null, 2));
}

main();
