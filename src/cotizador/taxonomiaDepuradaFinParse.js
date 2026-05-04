/**
 * Parsea la hoja «Taxonomía Depurada FIN» del libro de taxonomía TI.
 * La fila 1 del Excel es título; la fila 2 son encabezados de columnas; desde la fila 3 son datos.
 * @module cotizador/taxonomiaDepuradaFinParse
 */

const SHEET_NAME = 'Taxonomía Depurada FIN';
/** Texto que identifica la fila de encabezados (columna «Rol original»). */
const HEADER_MARKER = 'Rol original (Cinte)';

function normHeaderCell(v) {
    return String(v ?? '')
        .replace(/\r\n/g, '\n')
        .trim();
}

function uniqueHeaderName(base, used, idx) {
    let name = base || `Columna_${idx + 1}`;
    if (!used.has(name)) return name;
    let n = 2;
    let candidate = `${name} (${n})`;
    while (used.has(candidate)) {
        n += 1;
        candidate = `${name} (${n})`;
    }
    return candidate;
}

/**
 * @param {import('xlsx').WorkBook} wb
 * @returns {{ sheetName: string, headers: string[], rows: Record<string, string>[] }}
 */
function findHeaderRowIndex(aoa) {
    for (let r = 0; r < Math.min(15, aoa.length); r += 1) {
        const row = aoa[r] || [];
        for (let c = 0; c < row.length; c += 1) {
            if (String(row[c] || '').trim() === HEADER_MARKER) return r;
        }
    }
    throw new Error(`No se encontró la fila de encabezados (buscando «${HEADER_MARKER}» en las primeras 15 filas).`);
}

function parseTaxonomiaDepuradaFinWorkbook(wb) {
    const sheet = wb.Sheets[SHEET_NAME];
    if (!sheet) {
        const names = wb.SheetNames || [];
        throw new Error(`Hoja no encontrada: «${SHEET_NAME}». Hojas disponibles: ${names.join(' | ')}`);
    }
    const aoa = require('xlsx').utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    if (!aoa || aoa.length < 3) {
        throw new Error('La hoja no tiene suficientes filas.');
    }
    const headerRowIndex = findHeaderRowIndex(aoa);
    const headerCells = aoa[headerRowIndex] || [];
    const used = new Set();
    const headers = headerCells.map((cell, i) => {
        const base = normHeaderCell(cell);
        const name = uniqueHeaderName(base, used, i);
        used.add(name);
        return name;
    });
    const DATA_START_ROW = headerRowIndex + 1;
    const rows = [];
    for (let r = DATA_START_ROW; r < aoa.length; r += 1) {
        const line = aoa[r] || [];
        const obj = {};
        let any = false;
        for (let c = 0; c < headers.length; c += 1) {
            const key = headers[c];
            const val = line[c] != null && line[c] !== undefined ? String(line[c]).trim() : '';
            obj[key] = val;
            if (val) any = true;
        }
        if (any) rows.push(obj);
    }
    return { sheetName: SHEET_NAME, headers, rows };
}

/**
 * @param {string} filePath
 * @returns {{ sheetName: string, headers: string[], rows: Record<string, string>[] }}
 */
function parseTaxonomiaDepuradaFinFromPath(filePath) {
    const xlsx = require('xlsx');
    const wb = xlsx.readFile(filePath);
    return parseTaxonomiaDepuradaFinWorkbook(wb);
}

module.exports = {
    SHEET_NAME,
    HEADER_MARKER,
    parseTaxonomiaDepuradaFinWorkbook,
    parseTaxonomiaDepuradaFinFromPath
};
