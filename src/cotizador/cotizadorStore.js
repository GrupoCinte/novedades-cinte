const path = require('path');

function createCotizadorStore(deps) {
    const { pool, fs } = deps;
    const seedPath = path.join(process.cwd(), 'data', 'cotizador', 'catalogos.json');

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
    }

    async function seedCatalogosIfEmpty() {
        const q = await pool.query('SELECT COUNT(*)::int AS c FROM cotizador_catalogos');
        if ((q.rows[0]?.c || 0) > 0) return;
        if (!fs.existsSync(seedPath)) return;
        const raw = await fs.promises.readFile(seedPath, 'utf8');
        const seed = JSON.parse(raw);
        const keys = ['clientes', 'cargos', 'comerciales', 'parametros', 'equipos', 'gto_vinculacion', 'staff_cinte', 'factores_he'];
        for (const key of keys) {
            await pool.query(
                `INSERT INTO cotizador_catalogos (key, payload, updated_at)
                 VALUES ($1, $2::jsonb, NOW())
                 ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
                [key, JSON.stringify(seed?.[key] ?? null)]
            );
        }
    }

    async function ensureReady() {
        await ensureSchema();
        await seedCatalogosIfEmpty();
    }

    async function getCatalogos() {
        await ensureReady();
        const q = await pool.query('SELECT key, payload FROM cotizador_catalogos');
        const out = {};
        for (const row of q.rows) out[row.key] = row.payload;
        return out;
    }

    async function getHistorial() {
        await ensureReady();
        const q = await pool.query(`
            SELECT c.id, c.cliente, c.nit, c.comercial, c.plazo, c.margen, c.meses, c.moneda,
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
        return q.rows.map((r) => ({
            id: Number(r.id),
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
            ...((r.resumen && typeof r.resumen === 'object') ? r.resumen : {}),
            resultados: Array.isArray(r.resultados) ? r.resultados : [],
            fecha: new Date(r.created_at).toISOString().slice(0, 19).replace('T', ' ')
        }));
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
            const inserted = await client.query(
                `INSERT INTO cotizador_cotizaciones
                (cliente, nit, comercial, plazo, margen, meses, moneda, tasa_conversion, nombre_moneda, factores_he, resumen)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)
                RETURNING id, created_at`,
                [
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
            const rows = Array.isArray(cotizacion?.resultados) ? cotizacion.resultados : [];
            for (let idx = 0; idx < rows.length; idx += 1) {
                await client.query(
                    `INSERT INTO cotizador_cotizacion_items (cotizacion_id, idx, payload)
                     VALUES ($1, $2, $3::jsonb)`,
                    [id, idx, JSON.stringify(rows[idx])]
                );
            }
            await client.query('COMMIT');
            return {
                id,
                fecha: new Date(inserted.rows[0].created_at).toISOString().slice(0, 19).replace('T', ' ')
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
        ensureSchema,
        getCatalogos,
        getHistorial,
        saveCotizacion,
        deleteCotizacion
    };
}

module.exports = { createCotizadorStore };

