// Data lives entirely in PostgreSQL — no JSON seed files

const { formatDateTimeBogota } = require('../utils/formatDateTimeBogota');
const { ensureTiRolesSchema, mergeTiCargosIntoCatalogos, getInternoTiClienteKey } = require('./tiRolesStore');

function createCotizadorStore(deps) {
    const { pool } = deps;
    /** DDL + seed solo al arrancar el proceso; no repetir en cada GET (evita locks y sensación de “reinicios”). */
    let initDone = false;

    function mapCotizacionRow(r) {
        const fromResumen = (r.resumen && typeof r.resumen === 'object') ? r.resumen : {};
        return {
            ...fromResumen,
            id: Number(r.id),
            codigo: r.codigo || null,
            cliente: r.cliente,
            nit: r.nit,
            comercial: r.comercial,
            plazo: r.plazo,
            margen: Number(r.margen),
            meses: Number(r.meses),
            moneda: r.moneda,
            tasa_conversion: r.tasa_conversion === null ? null : Number(r.tasa_conversion),
            nombre_moneda: r.nombre_moneda,
            factores_he: r.factores_he || {},
            resultados: Array.isArray(r.resultados) ? r.resultados : [],
            fecha_generacion_iso: new Date(r.created_at).toISOString(),
            fecha: formatDateTimeBogota(r.created_at)
        };
    }

    async function ensureCodigoYSecuencia() {
        await pool.query(`
            ALTER TABLE cotizador_cotizaciones
            ADD COLUMN IF NOT EXISTS codigo TEXT
        `);
        await pool.query(`
            CREATE SEQUENCE IF NOT EXISTS cotizador_public_code_seq
        `);
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_cotizador_cotizaciones_codigo_unique
            ON cotizador_cotizaciones (codigo)
            WHERE codigo IS NOT NULL AND TRIM(codigo) <> ''
        `);

        const maxRes = await pool.query(`
            SELECT COALESCE(MAX(CAST(SUBSTRING(codigo FROM 5) AS INT)), 0)::int AS m
            FROM cotizador_cotizaciones
            WHERE codigo ~ '^COT-[0-9]+$'
        `);
        let nextNum = Number(maxRes.rows[0]?.m || 0);

        const missing = await pool.query(`
            SELECT id FROM cotizador_cotizaciones
            WHERE codigo IS NULL OR TRIM(codigo) = ''
            ORDER BY id ASC
        `);
        for (const row of missing.rows) {
            nextNum += 1;
            const codigo = `COT-${String(nextNum).padStart(3, '0')}`;
            await pool.query(`UPDATE cotizador_cotizaciones SET codigo = $1 WHERE id = $2`, [codigo, row.id]);
        }

        if (nextNum <= 0) {
            await pool.query(`SELECT setval('cotizador_public_code_seq', 1, false)`);
        } else {
            await pool.query(`SELECT setval('cotizador_public_code_seq', $1::bigint, true)`, [nextNum]);
        }
    }

    async function ensureSchema() {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cotizador_catalogos (
                key TEXT PRIMARY KEY,
                payload JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cotizador_cotizaciones (
                id BIGSERIAL PRIMARY KEY,
                cliente TEXT NOT NULL DEFAULT '',
                nit TEXT NOT NULL DEFAULT '',
                comercial TEXT NOT NULL DEFAULT '',
                plazo TEXT NOT NULL DEFAULT '45',
                margen NUMERIC(10,6) NOT NULL DEFAULT 0,
                meses INT NOT NULL DEFAULT 1,
                moneda TEXT NOT NULL DEFAULT 'COP',
                tasa_conversion NUMERIC(18,6) NULL,
                nombre_moneda TEXT NOT NULL DEFAULT '',
                factores_he JSONB NOT NULL DEFAULT '{}'::jsonb,
                resumen JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cotizador_cotizacion_items (
                id BIGSERIAL PRIMARY KEY,
                cotizacion_id BIGINT NOT NULL REFERENCES cotizador_cotizaciones(id) ON DELETE CASCADE,
                idx INT NOT NULL,
                payload JSONB NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await pool.query('CREATE INDEX IF NOT EXISTS idx_cotizador_cotizaciones_created_at ON cotizador_cotizaciones(created_at DESC)');
        await pool.query('CREATE INDEX IF NOT EXISTS idx_cotizador_items_cotizacion ON cotizador_cotizacion_items(cotizacion_id)');
        await ensureTiRolesSchema(pool);
        await ensureCodigoYSecuencia();
        await pool.query(`
            CREATE TABLE IF NOT EXISTS cotizador_import_alias (
                hoja_excel TEXT PRIMARY KEY,
                tipo TEXT NOT NULL CHECK (tipo IN ('MAPEO', 'DIRECTV', 'CREAR')),
                cliente TEXT NOT NULL,
                pais_directv TEXT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
    }

    /** Valores por defecto del import Excel (editar en BD: UPDATE/INSERT en cotizador_import_alias). */
    async function seedCotizadorImportAliasDefaults() {
        const filas = [
            ['AVC - Gou Payments', 'MAPEO', 'AVC', null],
            ['Banco Falabella', 'MAPEO', 'FALABELLA BANCO', null],
            ['Banco Occidente', 'MAPEO', 'BANCO DE OCCIDENTE', null],
            ['Consorcio EPS', 'MAPEO', 'CONSORCIO', null],
            ['Dichter', 'CREAR', 'DICHTER', null],
            ['Directv Chile', 'DIRECTV', 'DIRECTV', 'Chile'],
            ['Directv Peru', 'DIRECTV', 'DIRECTV', 'Perú'],
            ['Directv Colombia', 'DIRECTV', 'DIRECTV', 'Colombia'],
            ['Experian Colombia', 'MAPEO', 'EXPERIAN', null],
            ['IBM Peru', 'CREAR', 'IBM PERU', null],
            ['Inchcape', 'CREAR', 'INCHCAPE', null],
            ['Plurall', 'CREAR', 'PLURALL', null],
            ['Seguros Alfa', 'MAPEO', 'ALFA', null],
            ['Seguros Falabella', 'MAPEO', 'AGENCIA DE SEGUROS FALABELLA', null],
            ['TransUnión Chile', 'CREAR', 'TRANSUNIÓN CHILE', null]
        ];
        for (const [hoja, tipo, cliente, pais] of filas) {
            await pool.query(
                `INSERT INTO cotizador_import_alias (hoja_excel, tipo, cliente, pais_directv)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (hoja_excel) DO NOTHING`,
                [hoja, tipo, cliente, pais]
            );
        }
    }

    async function ensureReady() {
        if (initDone) return;
        await ensureSchema();
        await seedCotizadorImportAliasDefaults();
        initDone = true;
    }

    async function getImportAliases() {
        await ensureReady();
        const q = await pool.query(
            `SELECT hoja_excel, tipo, cliente, pais_directv FROM cotizador_import_alias ORDER BY hoja_excel ASC`
        );
        return q.rows;
    }

    async function getCatalogos() {
        await ensureReady();
        const q = await pool.query('SELECT key, payload FROM cotizador_catalogos');
        const out = {};
        for (const row of q.rows) {
            let val = row.payload;
            /** Algunos drivers/legacy devuelven JSONB como string; el cotizador espera objeto. */
            if (typeof val === 'string') {
                const t = val.trim();
                if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
                    try {
                        val = JSON.parse(t);
                    } catch {
                        /* dejar string */
                    }
                }
            }
            out[row.key] = val;
        }
        /** NIT y lista de clientes viven en `clientes_lideres`; no usar JSON legacy `clientes`. */
        if (Object.prototype.hasOwnProperty.call(out, 'clientes')) delete out.clientes;
        await mergeTiCargosIntoCatalogos(pool, out);
        out.ti_interno_cliente_key = getInternoTiClienteKey();
        return out;
    }

    async function getHistorial() {
        await ensureReady();
        const q = await pool.query(`
            SELECT c.id, c.codigo, c.cliente, c.nit, c.comercial, c.plazo, c.margen, c.meses, c.moneda,
                   c.tasa_conversion, c.nombre_moneda, c.factores_he, c.resumen, c.created_at,
                   COALESCE(
                     json_agg(i.payload ORDER BY i.idx) FILTER (WHERE i.id IS NOT NULL),
                     '[]'::json
                   ) AS resultados
            FROM cotizador_cotizaciones c
            LEFT JOIN cotizador_cotizacion_items i ON i.cotizacion_id = c.id
            GROUP BY c.id
            ORDER BY c.created_at DESC
        `);
        return q.rows.map(mapCotizacionRow);
    }

    async function getCotizacionById(rawId) {
        await ensureReady();
        const id = Number(rawId);
        if (!Number.isFinite(id)) return null;
        const q = await pool.query(
            `
            SELECT c.id, c.codigo, c.cliente, c.nit, c.comercial, c.plazo, c.margen, c.meses, c.moneda,
                   c.tasa_conversion, c.nombre_moneda, c.factores_he, c.resumen, c.created_at,
                   COALESCE(
                     json_agg(i.payload ORDER BY i.idx) FILTER (WHERE i.id IS NOT NULL),
                     '[]'::json
                   ) AS resultados
            FROM cotizador_cotizaciones c
            LEFT JOIN cotizador_cotizacion_items i ON i.cotizacion_id = c.id
            WHERE c.id = $1
            GROUP BY c.id
            `,
            [id]
        );
        if (!q.rows[0]) return null;
        return mapCotizacionRow(q.rows[0]);
    }

    async function saveCotizacion(cotizacion) {
        await ensureReady();
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const summary = {
                cliente: cotizacion?.cliente || '',
                nit: cotizacion?.nit || '',
                comercial: cotizacion?.comercial || '',
                plazo: cotizacion?.plazo || '45',
                margen: cotizacion?.margen ?? 0,
                meses: cotizacion?.meses ?? 1,
                moneda: cotizacion?.moneda || 'COP',
                tasa_conversion: cotizacion?.tasa_conversion ?? null,
                nombre_moneda: cotizacion?.nombre_moneda || ''
            };
            const codeRow = await client.query(
                `SELECT ('COT-' || LPAD(nextval('cotizador_public_code_seq')::text, 3, '0')) AS codigo`
            );
            const codigo = codeRow.rows[0].codigo;
            const inserted = await client.query(
                `INSERT INTO cotizador_cotizaciones
                (codigo, cliente, nit, comercial, plazo, margen, meses, moneda, tasa_conversion, nombre_moneda, factores_he, resumen)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb)
                RETURNING id, created_at, codigo`,
                [
                    codigo,
                    summary.cliente,
                    summary.nit,
                    summary.comercial,
                    String(summary.plazo),
                    Number(summary.margen || 0),
                    Number(summary.meses || 1),
                    summary.moneda,
                    summary.tasa_conversion === null ? null : Number(summary.tasa_conversion),
                    summary.nombre_moneda,
                    JSON.stringify(cotizacion?.factores_he || {}),
                    JSON.stringify(summary)
                ]
            );
            const id = Number(inserted.rows[0].id);
            const codGuardado = inserted.rows[0].codigo || codigo;
            const rows = Array.isArray(cotizacion?.resultados) ? cotizacion.resultados : [];
            for (let idx = 0; idx < rows.length; idx += 1) {
                await client.query(
                    `INSERT INTO cotizador_cotizacion_items (cotizacion_id, idx, payload)
                     VALUES ($1, $2, $3::jsonb)`,
                    [id, idx, JSON.stringify(rows[idx])]
                );
            }
            await client.query('COMMIT');
            const createdAt = inserted.rows[0].created_at;
            return {
                id,
                codigo: codGuardado,
                fecha_generacion_iso: new Date(createdAt).toISOString(),
                fecha: formatDateTimeBogota(createdAt)
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async function deleteCotizacion(id) {
        await ensureReady();
        const targetId = Number(id);
        if (!Number.isFinite(targetId)) return { ok: false, deleted: false };
        const q = await pool.query('DELETE FROM cotizador_cotizaciones WHERE id = $1 RETURNING id', [targetId]);
        return { ok: q.rowCount > 0, deleted: q.rowCount > 0 };
    }

    return {
        ensureReady,
        getCatalogos,
        getImportAliases,
        getHistorial,
        getCotizacionById,
        saveCotizacion,
        deleteCotizacion
    };
}

module.exports = { createCotizadorStore };

