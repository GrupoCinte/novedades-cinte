const { z } = require('zod');
const { COLABORADORES_EXTENDED_COLUMNS } = require('./colaboradoresExtendedColumns');

/** Shape Zod para PATCH/POST de campos extendidos de colaboradores. */
function buildColaboradorExtendedZodShape() {
    const shape = {};
    for (const col of COLABORADORES_EXTENDED_COLUMNS) {
        const t = col.sqlType;
        if (t === 'BOOLEAN') {
            shape[col.key] = z.boolean().optional().nullable();
        } else if (t.startsWith('NUMERIC')) {
            shape[col.key] = z.preprocess((v) => {
                if (v === '' || v === undefined) return null;
                if (v === null) return null;
                const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
                return Number.isFinite(n) ? n : null;
            }, z.union([z.number(), z.null()]).optional().nullable());
        } else if (t === 'INTEGER') {
            shape[col.key] = z.preprocess((v) => {
                if (v === '' || v === undefined) return null;
                if (v === null) return null;
                const n = parseInt(String(v), 10);
                return Number.isFinite(n) ? n : null;
            }, z.union([z.number().int(), z.null()]).optional().nullable());
        } else if (t === 'DATE') {
            shape[col.key] = z.preprocess(
                (v) => (v === '' || v === undefined ? null : v),
                z.union([z.string().max(32), z.null()]).optional().nullable()
            );
        } else if (t === 'JSONB') {
            shape[col.key] = z.preprocess((v) => {
                if (v === '' || v === undefined || v === null) return null;
                if (typeof v === 'object' && v !== null && !Array.isArray(v)) return v;
                return null;
            }, z.record(z.string(), z.enum(['COP', 'CLP', 'USD'])).optional().nullable());
        } else {
            shape[col.key] = z.preprocess(
                (v) => (v === '' || v === undefined ? null : v),
                z.union([z.string().max(12000), z.null()]).optional().nullable()
            );
        }
    }
    return shape;
}

module.exports = { buildColaboradorExtendedZodShape };
