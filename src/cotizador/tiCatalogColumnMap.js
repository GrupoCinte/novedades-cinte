/**
 * Mapeo de columnas del Excel (Taxonomía Depurada FIN) → campos que usa el cotizador.
 * Override: variable de entorno COTIZADOR_TI_COLUMNA_MAP JSON
 * { "cargoKeys": ["Rol original (Cinte)", ...], "salarioKeys": [...], "equipoKeys": [...] }
 */

const DEFAULT = {
    cargoKeys: ['Rol original (Cinte)', 'Nombre de mercado (EN)'],
    /** Orden: primero columnas con el valor «cerrado»; luego bandas como respaldo si base viene vacía en el Excel. */
    salarioKeys: [
        'Salario asignado',
        'Base Salarial',
        'Banda Salarial Superior (COP)',
        'Banda Salarial Inferior (COP)'
    ],
    equipoKeys: ['Dotación', 'Tipo de salario']
};

function loadMap() {
    const raw = String(process.env.COTIZADOR_TI_COLUMNA_MAP || '').trim();
    if (!raw) return { ...DEFAULT, cargoKeys: [...DEFAULT.cargoKeys], salarioKeys: [...DEFAULT.salarioKeys], equipoKeys: [...DEFAULT.equipoKeys] };
    try {
        const j = JSON.parse(raw);
        return {
            cargoKeys: Array.isArray(j.cargoKeys) && j.cargoKeys.length ? j.cargoKeys.map(String) : [...DEFAULT.cargoKeys],
            salarioKeys: Array.isArray(j.salarioKeys) && j.salarioKeys.length ? j.salarioKeys.map(String) : [...DEFAULT.salarioKeys],
            equipoKeys: Array.isArray(j.equipoKeys) && j.equipoKeys.length ? j.equipoKeys.map(String) : [...DEFAULT.equipoKeys]
        };
    } catch {
        return { ...DEFAULT, cargoKeys: [...DEFAULT.cargoKeys], salarioKeys: [...DEFAULT.salarioKeys], equipoKeys: [...DEFAULT.equipoKeys] };
    }
}

function pickFirstString(cells, keys) {
    const c = cells && typeof cells === 'object' ? cells : {};
    for (const k of keys) {
        const raw = cellRawForKey(c, k);
        if (raw === undefined) continue;
        const v = String(raw ?? '').trim();
        if (v) return v;
    }
    return '';
}

/**
 * Interpreta montos desde celdas Excel (string) o desde JSON/API (number).
 * Soporta miles COP con punto (4.031.603), decimal con coma, y valores numéricos nativos sin romper el punto decimal.
 */
function parseMoneyCop(raw) {
    if (raw == null || raw === '') return 0;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        return raw > 0 ? raw : 0;
    }
    let s = String(raw).trim();
    if (!s) return 0;
    s = s.replace(/[^\d.,\-]/g, '');
    if (!s) return 0;

    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    let t = s;
    if (lastComma >= 0 && lastDot >= 0) {
        if (lastComma > lastDot) {
            t = s.replace(/\./g, '').replace(',', '.');
        } else {
            t = s.replace(/,/g, '');
        }
    } else if (lastComma >= 0) {
        const parts = s.split(',');
        if (parts.length === 2 && parts[1].length <= 2 && /^\d+$/.test(parts[1])) {
            t = parts[0].replace(/\./g, '') + '.' + parts[1];
        } else {
            t = s.replace(/,/g, '');
        }
    } else {
        const dotCount = (s.match(/\./g) || []).length;
        if (dotCount > 1) {
            t = s.replace(/\./g, '');
        } else if (dotCount === 1) {
            const [a, b] = s.split('.');
            if (b && /^\d+$/.test(a) && /^\d+$/.test(b) && b.length <= 2) {
                t = `${a}.${b}`;
            } else {
                t = s.replace(/\./g, '');
            }
        } else {
            t = s;
        }
    }
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

function cellRawForKey(cells, key) {
    const c = cells && typeof cells === 'object' ? cells : {};
    if (Object.prototype.hasOwnProperty.call(c, key)) return c[key];
    const kl = String(key).trim().toLowerCase();
    const found = Object.keys(c).find((ck) => String(ck).trim().toLowerCase() === kl);
    return found ? c[found] : undefined;
}

function pickSalario(cells, keys) {
    const c = cells && typeof cells === 'object' ? cells : {};
    for (const k of keys) {
        const raw = cellRawForKey(c, k);
        if (raw === undefined) continue;
        const n = parseMoneyCop(raw);
        if (n > 0) return n;
    }
    return 0;
}

function pickEquipoTipo(cells, keys) {
    const t = pickFirstString(cells, keys);
    return t || '1';
}

function cargoLabelFromCells(cells) {
    const map = loadMap();
    return pickFirstString(cells, map.cargoKeys);
}

function salarioFromCells(cells) {
    const map = loadMap();
    return pickSalario(cells, map.salarioKeys);
}

function equipoFromCells(cells) {
    const map = loadMap();
    return pickEquipoTipo(cells, map.equipoKeys);
}

module.exports = {
    DEFAULT,
    loadMap,
    cargoLabelFromCells,
    salarioFromCells,
    equipoFromCells,
    parseMoneyCop,
    cellRawForKey
};
