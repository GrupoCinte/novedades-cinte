/**
 * Sincroniza directorio (clientes_lideres + colaboradores) desde la BD de DEV hacia PROD.
 *
 * - Origen: tablas en DEV (mismo contenido que ves en dev ahora).
 * - Destino: PROD; no borra colaboradores que solo existan en prod; por cédula hace upsert
 *   y actualiza cliente, líder, nombre, correo, activo, gp_user_id según dev.
 * - gp_user_id: se re-mapea por email (users en dev → users en prod, rol gp activo);
 *   si no hay match en prod, se conserva el gp_user_id actual en prod en el UPDATE (COALESCE).
 * - Normalización: normalizeCatalogValue en textos; correo en minúsculas; cédula con normalizeCedula.
 *
 * Requiere en .env (o entorno):
 *   DEV:  DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
 *   PROD: PROD_DB_HOST, PROD_DB_PORT?, PROD_DB_NAME?, PROD_DB_USER?, PROD_DB_PASSWORD
 *
 * Uso:
 *   node scripts/sync-directorio-dev-to-prod.js
 *   node scripts/sync-directorio-dev-to-prod.js --apply
 */
require('dotenv').config();
const { Pool } = require('pg');
const { normalizeCatalogValue, normalizeCedula } = require('../src/utils');

function parseArgs(argv) {
    const args = argv.slice(2);
    let apply = false;
    for (const a of args) {
        if (a === '--apply') apply = true;
    }
    return { apply };
}

function normEmail(v) {
    const s = normalizeCatalogValue(v);
    if (!s) return null;
    return s.toLowerCase();
}

function poolFromEnv(prefix) {
    const isProd = prefix === 'PROD_';
    const host = isProd ? process.env.PROD_DB_HOST : process.env.DB_HOST || 'localhost';
    const port = Number((isProd ? process.env.PROD_DB_PORT : process.env.DB_PORT) || 5432);
    const database = (isProd ? process.env.PROD_DB_NAME : process.env.DB_NAME) || 'novedades_cinte';
    const user = isProd ? process.env.PROD_DB_USER : process.env.DB_USER;
    const password = isProd ? process.env.PROD_DB_PASSWORD : process.env.DB_PASSWORD;
    return { host, port, database, user, password };
}

function assertProdConfigured() {
    if (!process.env.PROD_DB_HOST) {
        console.error('Falta PROD_DB_HOST (y credenciales PROD_DB_*). No se conectará a prod por seguridad.');
        process.exit(1);
    }
    if (!process.env.PROD_DB_PASSWORD || !process.env.PROD_DB_USER) {
        console.error('Faltan PROD_DB_USER o PROD_DB_PASSWORD.');
        process.exit(1);
    }
}

async function loadGpEmailById(pool, ids) {
    const u = [...new Set(ids.filter(Boolean))];
    if (!u.length) return new Map();
    const q = await pool.query(
        `SELECT id::text, lower(btrim(email)) AS email
         FROM users
         WHERE id = ANY($1::uuid[])`,
        [u]
    );
    const m = new Map();
    for (const r of q.rows) {
        if (r.email) m.set(r.id, r.email);
    }
    return m;
}

async function loadProdGpIdByEmail(pool, emails) {
    const list = [...new Set(emails.filter(Boolean))];
    if (!list.length) return new Map();
    const q = await pool.query(
        `SELECT id::text, lower(btrim(email)) AS email
         FROM users
         WHERE role = 'gp'::user_role AND is_active = TRUE
           AND lower(btrim(email)) = ANY($1::text[])`,
        [list]
    );
    const m = new Map();
    for (const r of q.rows) {
        m.set(r.email, r.id);
    }
    return m;
}

function buildGpDevToProd(devIds, devEmailById, prodIdByEmail) {
    const map = new Map();
    const unmapped = [];
    for (const id of devIds) {
        if (!id) continue;
        const em = devEmailById.get(id);
        if (!em) {
            unmapped.push({ dev_gp_user_id: id, reason: 'sin_email_en_dev' });
            map.set(id, null);
            continue;
        }
        const prodId = prodIdByEmail.get(em);
        if (!prodId) {
            unmapped.push({ dev_gp_user_id: id, email: em, reason: 'sin_gp_activo_en_prod' });
            map.set(id, null);
        } else {
            map.set(id, prodId);
        }
    }
    return { map, unmapped };
}

async function main() {
    const opts = parseArgs(process.argv);
    assertProdConfigured();

    const devCfg = poolFromEnv('');
    const prodCfg = poolFromEnv('PROD_');
    if (!devCfg.user || !devCfg.password) {
        console.error('Faltan DB_USER o DB_PASSWORD para DEV.');
        process.exit(1);
    }

    const devPool = new Pool(devCfg);
    const prodPool = new Pool(prodCfg);

    try {
        const [clRes, colRes] = await Promise.all([
            devPool.query(
                `SELECT cliente, lider, activo, gp_user_id::text AS gp_user_id
                 FROM clientes_lideres
                 ORDER BY cliente, lider`
            ),
            devPool.query(
                `SELECT cedula, nombre, activo, correo_cinte, cliente, lider_catalogo, gp_user_id::text AS gp_user_id
                 FROM colaboradores
                 ORDER BY cedula`
            )
        ]);

        const devGpIds = [];
        for (const r of clRes.rows) {
            if (r.gp_user_id) devGpIds.push(r.gp_user_id);
        }
        for (const r of colRes.rows) {
            if (r.gp_user_id) devGpIds.push(r.gp_user_id);
        }

        const devEmailById = await loadGpEmailById(devPool, devGpIds);
        const emailsFromDev = [...devEmailById.values()].filter(Boolean);
        const prodEmailMap = await loadProdGpIdByEmail(prodPool, emailsFromDev);

        const { map: gpDevToProd, unmapped } = buildGpDevToProd(devGpIds, devEmailById, prodEmailMap);

        const pairs = clRes.rows.map((r) => ({
            cliente: normalizeCatalogValue(r.cliente),
            lider: normalizeCatalogValue(r.lider),
            activo: r.activo !== false,
            gp_user_id: r.gp_user_id ? gpDevToProd.get(r.gp_user_id) || null : null,
            _dev_gp: r.gp_user_id
        }));

        const cols = colRes.rows.map((r) => {
            const ced = normalizeCedula(r.cedula);
            return {
                cedula: ced,
                nombre: normalizeCatalogValue(r.nombre),
                activo: r.activo !== false,
                correo_cinte: normEmail(r.correo_cinte),
                cliente: normalizeCatalogValue(r.cliente),
                lider_catalogo: normalizeCatalogValue(r.lider_catalogo),
                gp_user_id: r.gp_user_id ? gpDevToProd.get(r.gp_user_id) || null : null,
                _dev_gp: r.gp_user_id
            };
        }).filter((r) => r.cedula);

        const preview = {
            mode: opts.apply ? 'apply' : 'dry-run',
            clientes_lideres_rows: pairs.length,
            colaboradores_rows: cols.length,
            gp_dev_ids_distinct: new Set(devGpIds).size,
            gp_unmapped: unmapped.length,
            gp_unmapped_sample: unmapped.slice(0, 25)
        };
        console.log(JSON.stringify(preview, null, 2));

        if (!opts.apply) {
            console.log('Dry-run: no se escribió en PROD. Usa --apply para ejecutar en transacción.');
            return;
        }

        const client = await prodPool.connect();
        try {
            await client.query('BEGIN');

            for (const p of pairs) {
                await client.query(
                    `INSERT INTO clientes_lideres (cliente, lider, activo, gp_user_id)
                     VALUES ($1, $2, $3, $4::uuid)
                     ON CONFLICT (cliente, lider)
                     DO UPDATE SET
                       activo = EXCLUDED.activo,
                       gp_user_id = COALESCE(EXCLUDED.gp_user_id, clientes_lideres.gp_user_id),
                       updated_at = NOW()`,
                    [p.cliente, p.lider, p.activo, p.gp_user_id]
                );
            }

            let colUpsert = 0;
            for (const c of cols) {
                await client.query(
                    `INSERT INTO colaboradores (cedula, nombre, activo, correo_cinte, cliente, lider_catalogo, gp_user_id)
                     VALUES ($1, $2, $3, $4, $5, $6, $7::uuid)
                     ON CONFLICT (cedula) DO UPDATE SET
                       nombre = EXCLUDED.nombre,
                       activo = EXCLUDED.activo,
                       correo_cinte = COALESCE(EXCLUDED.correo_cinte, colaboradores.correo_cinte),
                       cliente = EXCLUDED.cliente,
                       lider_catalogo = EXCLUDED.lider_catalogo,
                       gp_user_id = COALESCE(EXCLUDED.gp_user_id, colaboradores.gp_user_id),
                       updated_at = NOW()`,
                    [
                        c.cedula,
                        c.nombre,
                        c.activo,
                        c.correo_cinte,
                        c.cliente,
                        c.lider_catalogo,
                        c.gp_user_id
                    ]
                );
                colUpsert += 1;
            }

            await client.query('COMMIT');
            console.log(
                JSON.stringify(
                    {
                        ok: true,
                        committed: true,
                        clientes_lideres: pairs.length,
                        colaboradores_upserted: colUpsert,
                        gp_unmapped: unmapped.length
                    },
                    null,
                    2
                )
            );
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } finally {
        await devPool.end();
        await prodPool.end();
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
