/**
 * Filtros de listado CH: un valor o varios (coma / array de query).
 */

const { z } = require('zod');

function normalizeListFilter(value) {
    if (value == null || value === '') return [];
    const raw = Array.isArray(value) ? value : String(value).split(',');
    const seen = new Set();
    const out = [];
    for (const item of raw) {
        const v = String(item || '').trim();
        if (!v) continue;
        const key = v.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
    }
    return out;
}

function optionalStringList(maxLen, maxItems = 80) {
    return z.preprocess((raw) => {
        const vals = normalizeListFilter(raw);
        return vals.length ? vals : undefined;
    }, z.array(z.string().max(maxLen)).max(maxItems).optional());
}

function optionalEnumList(values, maxItems = 8) {
    return z.preprocess((raw) => {
        const vals = normalizeListFilter(raw);
        return vals.length ? vals : undefined;
    }, z.array(z.enum(values)).max(maxItems).optional());
}

function applyLowerInFilter(columnExpr, values, params, where, p) {
    const vals = normalizeListFilter(values);
    if (!vals.length) return p;
    if (vals.length === 1) {
        params.push(vals[0]);
        where.push(`LOWER(TRIM(COALESCE(${columnExpr}, ''))) = LOWER($${p})`);
        return p + 1;
    }
    params.push(vals.map((v) => v.toLowerCase()));
    where.push(`LOWER(TRIM(COALESCE(${columnExpr}, ''))) = ANY($${p}::text[])`);
    return p + 1;
}

function applyExactInFilter(columnExpr, values, params, where, p) {
    const vals = normalizeListFilter(values);
    if (!vals.length) return p;
    if (vals.length === 1) {
        params.push(vals[0]);
        where.push(`${columnExpr} = $${p}`);
        return p + 1;
    }
    params.push(vals);
    where.push(`${columnExpr} = ANY($${p}::text[])`);
    return p + 1;
}

module.exports = {
    normalizeListFilter,
    optionalStringList,
    optionalEnumList,
    applyLowerInFilter,
    applyExactInFilter
};
