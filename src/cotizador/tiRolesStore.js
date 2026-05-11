const crypto = require('crypto');
const { perfilFinancieroToCargoRow } = require('./tiPerfilToCargoRow');
const { cargoLabelFromCells, salarioFromCells, equipoFromCells } = require('./tiCatalogColumnMap');

/** Nombre de cliente en `cargos_por_cliente` donde se fusionan filas del catálogo TI (alineado a BD `clientes_lideres`, p. ej. CINTE). */
function getInternoTiClienteKey() {
    return String(process.env.COTIZADOR_CLIENTE_INTERNO_TI || 'CINTE').trim() || 'CINTE';
}

let tiSchemaDone = false;

async function ensureTiRolesSchema(pool) {
    if (tiSchemaDone) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS cotizador_ti_version (
            id BIGSERIAL PRIMARY KEY,
            label TEXT NOT NULL DEFAULT '',
            activo BOOLEAN NOT NULL DEFAULT FALSE,
            notas TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS cotizador_ti_nodo (
            id BIGSERIAL PRIMARY KEY,
            version_id BIGINT NOT NULL REFERENCES cotizador_ti_version(id) ON DELETE CASCADE,
            parent_id BIGINT NULL REFERENCES cotizador_ti_nodo(id) ON DELETE CASCADE,
            nivel SMALLINT NOT NULL CHECK (nivel >= 1 AND nivel <= 4),
            codigo TEXT NOT NULL DEFAULT '',
            nombre TEXT NOT NULL DEFAULT '',
            orden INT NOT NULL DEFAULT 0,
            es_hoja BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cotizador_ti_nodo_version_parent_codigo
        ON cotizador_ti_nodo (version_id, COALESCE(parent_id, 0), codigo)
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS cotizador_ti_perfil (
            id BIGSERIAL PRIMARY KEY,
            version_id BIGINT NOT NULL REFERENCES cotizador_ti_version(id) ON DELETE CASCADE,
            nodo_id BIGINT NOT NULL REFERENCES cotizador_ti_nodo(id) ON DELETE CASCADE,
            cargo_etiqueta TEXT NOT NULL DEFAULT '',
            salario_base NUMERIC(18,2) NOT NULL DEFAULT 0,
            equipo_tipo TEXT NOT NULL DEFAULT '1',
            extra JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (version_id, nodo_id)
        )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cotizador_ti_nodo_version ON cotizador_ti_nodo(version_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_cotizador_ti_perfil_version ON cotizador_ti_perfil(version_id)');
    await pool.query(`ALTER TABLE cotizador_ti_version ADD COLUMN IF NOT EXISTS sheet_headers JSONB NOT NULL DEFAULT '[]'::jsonb`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS cotizador_ti_hoja_fila (
            id BIGSERIAL PRIMARY KEY,
            version_id BIGINT NOT NULL REFERENCES cotizador_ti_version(id) ON DELETE CASCADE,
            orden INT NOT NULL DEFAULT 0,
            cells JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
    await pool.query(
        'CREATE INDEX IF NOT EXISTS idx_cotizador_ti_hoja_fila_version_orden ON cotizador_ti_hoja_fila(version_id, orden)'
    );
    tiSchemaDone = true;
}

async function getActiveVersionId(pool) {
    const q = await pool.query(`SELECT id FROM cotizador_ti_version WHERE activo = TRUE ORDER BY id DESC LIMIT 1`);
    return q.rows[0] ? Number(q.rows[0].id) : null;
}

/** Fila de cotizador_ti_version marcada activa (encabezados del libro + id para escrituras). */
async function getActiveCatalogRow(pool) {
    const q = await pool.query(
        `SELECT id, label, activo, notas, created_at, sheet_headers
         FROM cotizador_ti_version WHERE activo = TRUE ORDER BY id DESC LIMIT 1`
    );
    return q.rows[0] || null;
}

async function listVersions(pool) {
    const q = await pool.query(
        `SELECT id, label, activo, notas, created_at, sheet_headers FROM cotizador_ti_version ORDER BY id DESC`
    );
    return q.rows;
}

async function createVersion(pool, body = {}) {
    const label = String(body.label ?? '').trim();
    const notas = String(body.notas ?? '').trim();
    const sheetHeaders = body.sheetHeaders ?? body.sheet_headers ?? null;
    const sh = Array.isArray(sheetHeaders) ? JSON.stringify(sheetHeaders) : '[]';
    const q = await pool.query(
        `INSERT INTO cotizador_ti_version (label, activo, notas, sheet_headers) VALUES ($1, FALSE, $2, $3::jsonb)
         RETURNING id, label, activo, notas, created_at, sheet_headers`,
        [String(label || '').trim(), String(notas || '').trim(), sh]
    );
    return q.rows[0];
}

async function setVersionActive(pool, versionId) {
    const id = Number(versionId);
    if (!Number.isFinite(id)) return null;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`UPDATE cotizador_ti_version SET activo = FALSE`);
        const u = await client.query(
            `UPDATE cotizador_ti_version SET activo = TRUE WHERE id = $1 RETURNING id, label, activo, notas, created_at, sheet_headers`,
            [id]
        );
        await client.query('COMMIT');
        return u.rows[0] || null;
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function getNodosByVersion(pool, versionId) {
    const vid = Number(versionId);
    if (!Number.isFinite(vid)) return [];
    const q = await pool.query(
        `SELECT id, version_id, parent_id, nivel, codigo, nombre, orden, es_hoja
         FROM cotizador_ti_nodo WHERE version_id = $1 ORDER BY nivel ASC, parent_id NULLS FIRST, orden ASC, id ASC`,
        [vid]
    );
    return q.rows;
}

async function getPerfilesByVersion(pool, versionId) {
    const vid = Number(versionId);
    if (!Number.isFinite(vid)) return [];
    const q = await pool.query(
        `SELECT p.id, p.version_id, p.nodo_id, p.cargo_etiqueta, p.salario_base, p.equipo_tipo, p.extra,
                n.nombre AS nodo_nombre, n.codigo AS nodo_codigo, n.nivel
         FROM cotizador_ti_perfil p
         JOIN cotizador_ti_nodo n ON n.id = p.nodo_id
         WHERE p.version_id = $1
         ORDER BY p.id ASC`,
        [vid]
    );
    return q.rows;
}

function pathForNodo(nodosById, nodoId) {
    const parts = [];
    let cur = nodosById.get(Number(nodoId));
    let guard = 0;
    while (cur && guard < 8) {
        parts.unshift(String(cur.nombre || '').trim());
        cur = cur.parent_id ? nodosById.get(Number(cur.parent_id)) : null;
        guard += 1;
    }
    return parts.filter(Boolean).join(' › ');
}

async function buildCargosRowsForActiveVersion(pool, parametros) {
    const vid = await getActiveVersionId(pool);
    if (!vid) return [];
    const q = await pool.query(
        `SELECT cells FROM cotizador_ti_hoja_fila WHERE version_id = $1 ORDER BY orden ASC, id ASC`,
        [vid]
    );
    const out = [];
    for (const row of q.rows) {
        const cells = row.cells && typeof row.cells === 'object' ? row.cells : {};
        const label = cargoLabelFromCells(cells);
        const sal = salarioFromCells(cells);
        const eq = equipoFromCells(cells);
        if (!String(label || '').trim() && !(Number(sal) > 0)) continue;
        const rolOriginal = String(cells['Rol original (Cinte)'] ?? '').trim();
        const cargoRow = perfilFinancieroToCargoRow({
            cargoLabel: String(label || '').trim() || 'Sin rol',
            salarioBase: sal,
            equipoTipo: eq,
            parametros
        });
        cargoRow.rol_original_cinte = rolOriginal || cargoRow.cargo;
        out.push(cargoRow);
    }
    if (out.length) return out;
    const nodos = await getNodosByVersion(pool, vid);
    const perfiles = await getPerfilesByVersion(pool, vid);
    const byId = new Map(nodos.map((n) => [Number(n.id), n]));
    const legacy = [];
    for (const p of perfiles) {
        const path = pathForNodo(byId, p.nodo_id);
        const lab = String(p.cargo_etiqueta || '').trim() || path || String(p.nodo_nombre || '').trim();
        const legacyRow = perfilFinancieroToCargoRow({
            cargoLabel: lab,
            salarioBase: p.salario_base,
            equipoTipo: p.equipo_tipo,
            parametros
        });
        legacyRow.rol_original_cinte = legacyRow.cargo;
        legacy.push(legacyRow);
    }
    return legacy;
}

async function listHojaFilasPaged(pool, versionId, { page = 1, limit = 20, q = '' } = {}) {
    const vid = Number(versionId);
    if (!Number.isFinite(vid)) return { items: [], total: 0, page: 1, limit: 20, totalPages: 0 };
    const lim = Math.min(100, Math.max(1, Number(limit) || 20));
    const pg = Math.max(1, Number(page) || 1);
    const offset = (pg - 1) * lim;
    const needle = `%${String(q || '').trim()}%`;
    const hasQ = Boolean(String(q || '').trim());
    const countQ = hasQ
        ? await pool.query(
              `SELECT COUNT(*)::int AS n FROM cotizador_ti_hoja_fila WHERE version_id = $1 AND cells::text ILIKE $2`,
              [vid, needle]
          )
        : await pool.query(`SELECT COUNT(*)::int AS n FROM cotizador_ti_hoja_fila WHERE version_id = $1`, [vid]);
    const total = countQ.rows[0]?.n ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / lim));
    const dataQ = hasQ
        ? await pool.query(
              `SELECT id, version_id, orden, cells, created_at FROM cotizador_ti_hoja_fila
               WHERE version_id = $1 AND cells::text ILIKE $2
               ORDER BY orden ASC, id ASC LIMIT $3 OFFSET $4`,
              [vid, needle, lim, offset]
          )
        : await pool.query(
              `SELECT id, version_id, orden, cells, created_at FROM cotizador_ti_hoja_fila
               WHERE version_id = $1 ORDER BY orden ASC, id ASC LIMIT $2 OFFSET $3`,
              [vid, lim, offset]
          );
    return { items: dataQ.rows, total, page: pg, limit: lim, totalPages };
}

async function getHojaFila(pool, id) {
    const hid = Number(id);
    if (!Number.isFinite(hid)) return null;
    const q = await pool.query(
        `SELECT id, version_id, orden, cells, created_at FROM cotizador_ti_hoja_fila WHERE id = $1`,
        [hid]
    );
    return q.rows[0] || null;
}

async function insertHojaFila(pool, body) {
    const vid = Number(body.versionId);
    if (!Number.isFinite(vid)) throw Object.assign(new Error('versionId inválido'), { status: 400 });
    const cells = body.cells && typeof body.cells === 'object' ? body.cells : {};
    const maxOrd = await pool.query(`SELECT COALESCE(MAX(orden),0)::int AS m FROM cotizador_ti_hoja_fila WHERE version_id = $1`, [vid]);
    const orden = Number(body.orden) || Number(maxOrd.rows[0].m) + 1;
    const q = await pool.query(
        `INSERT INTO cotizador_ti_hoja_fila (version_id, orden, cells) VALUES ($1,$2,$3::jsonb)
         RETURNING id, version_id, orden, cells, created_at`,
        [vid, orden, JSON.stringify(cells)]
    );
    return q.rows[0];
}

async function updateHojaFila(pool, id, patch) {
    const hid = Number(id);
    if (!Number.isFinite(hid)) return null;
    if (patch.cells == null || typeof patch.cells !== 'object') return null;
    if (patch.orden != null && Number.isFinite(Number(patch.orden))) {
        const q = await pool.query(
            `UPDATE cotizador_ti_hoja_fila SET cells = $1::jsonb, orden = $2 WHERE id = $3
             RETURNING id, version_id, orden, cells, created_at`,
            [JSON.stringify(patch.cells), Number(patch.orden), hid]
        );
        return q.rows[0] || null;
    }
    const q = await pool.query(
        `UPDATE cotizador_ti_hoja_fila SET cells = $1::jsonb WHERE id = $2 RETURNING id, version_id, orden, cells, created_at`,
        [JSON.stringify(patch.cells), hid]
    );
    return q.rows[0] || null;
}

async function deleteHojaFila(pool, id) {
    const hid = Number(id);
    if (!Number.isFinite(hid)) return { deleted: false };
    const r = await pool.query('DELETE FROM cotizador_ti_hoja_fila WHERE id = $1 RETURNING id', [hid]);
    return { deleted: r.rowCount > 0 };
}

async function importHojaFilasReplace(pool, versionId, headers, rowObjects) {
    const vid = Number(versionId);
    if (!Number.isFinite(vid)) throw Object.assign(new Error('versionId inválido'), { status: 400 });
    if (!Array.isArray(headers) || !headers.length) throw Object.assign(new Error('headers requerido'), { status: 400 });
    if (!Array.isArray(rowObjects)) throw Object.assign(new Error('filas requeridas'), { status: 400 });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`DELETE FROM cotizador_ti_hoja_fila WHERE version_id = $1`, [vid]);
        await client.query(`UPDATE cotizador_ti_version SET sheet_headers = $2::jsonb WHERE id = $1`, [
            vid,
            JSON.stringify(headers)
        ]);
        let ord = 0;
        for (const ro of rowObjects) {
            ord += 1;
            await client.query(`INSERT INTO cotizador_ti_hoja_fila (version_id, orden, cells) VALUES ($1,$2,$3::jsonb)`, [
                vid,
                ord,
                JSON.stringify(ro && typeof ro === 'object' ? ro : {})
            ]);
        }
        await client.query('COMMIT');
        return { inserted: rowObjects.length, columnCount: headers.length };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

function stableCodigo(parentId, nivel, nombre) {
    const h = crypto.createHash('md5').update(`${parentId ?? 'null'}|${nivel}|${nombre}`).digest('hex').slice(0, 12);
    return `n${nivel}_${h}`;
}

async function insertNodo(pool, body) {
    const pid = body.parentId == null ? null : Number(body.parentId);
    const niv = Number(body.nivel);
    const nom = String(body.nombre || '').trim();
    const cod = String(body.codigo || '').trim() || stableCodigo(pid, niv, nom);
    const q = await pool.query(
        `INSERT INTO cotizador_ti_nodo (version_id, parent_id, nivel, codigo, nombre, orden, es_hoja)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
            Number(body.versionId),
            pid,
            niv,
            cod,
            nom,
            Number(body.orden) || 0,
            Boolean(body.esHoja)
        ]
    );
    return q.rows[0];
}

async function updateNodo(pool, id, patch) {
    const nid = Number(id);
    if (!Number.isFinite(nid)) return null;
    const fields = [];
    const vals = [];
    let i = 1;
    if (patch.nombre != null) {
        fields.push(`nombre = $${i++}`);
        vals.push(String(patch.nombre));
    }
    if (patch.codigo != null) {
        fields.push(`codigo = $${i++}`);
        vals.push(String(patch.codigo));
    }
    if (patch.orden != null) {
        fields.push(`orden = $${i++}`);
        vals.push(Number(patch.orden));
    }
    if (patch.esHoja != null) {
        fields.push(`es_hoja = $${i++}`);
        vals.push(Boolean(patch.esHoja));
    }
    if (!fields.length) return null;
    vals.push(nid);
    const q = await pool.query(`UPDATE cotizador_ti_nodo SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, vals);
    return q.rows[0] || null;
}

async function deleteNodoCascade(pool, id) {
    const nid = Number(id);
    if (!Number.isFinite(nid)) return { deleted: false };
    const r = await pool.query('DELETE FROM cotizador_ti_nodo WHERE id = $1 RETURNING id', [nid]);
    return { deleted: r.rowCount > 0 };
}

async function upsertPerfil(pool, body) {
    const vid = Number(body.versionId);
    const nid = Number(body.nodoId);
    if (!Number.isFinite(vid) || !Number.isFinite(nid)) throw Object.assign(new Error('versionId y nodoId son obligatorios'), { status: 400 });
    const q = await pool.query(
        `INSERT INTO cotizador_ti_perfil (version_id, nodo_id, cargo_etiqueta, salario_base, equipo_tipo, extra)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)
         ON CONFLICT (version_id, nodo_id)
         DO UPDATE SET cargo_etiqueta = EXCLUDED.cargo_etiqueta, salario_base = EXCLUDED.salario_base,
            equipo_tipo = EXCLUDED.equipo_tipo, extra = EXCLUDED.extra
         RETURNING *`,
        [
            vid,
            nid,
            String(body.cargoEtiqueta || '').trim(),
            Number(body.salarioBase) || 0,
            String(body.equipoTipo || '1').trim() || '1',
            JSON.stringify(body.extra && typeof body.extra === 'object' ? body.extra : {})
        ]
    );
    return q.rows[0];
}

async function insertPerfil(pool, body) {
    return upsertPerfil(pool, body);
}

async function updatePerfil(pool, id, patch) {
    const pid = Number(id);
    if (!Number.isFinite(pid)) return null;
    const fields = [];
    const vals = [];
    let i = 1;
    if (patch.cargoEtiqueta != null) {
        fields.push(`cargo_etiqueta = $${i++}`);
        vals.push(String(patch.cargoEtiqueta));
    }
    if (patch.salarioBase != null) {
        fields.push(`salario_base = $${i++}`);
        vals.push(Number(patch.salarioBase));
    }
    if (patch.equipoTipo != null) {
        fields.push(`equipo_tipo = $${i++}`);
        vals.push(String(patch.equipoTipo));
    }
    if (patch.extra != null) {
        fields.push(`extra = $${i++}::jsonb`);
        vals.push(JSON.stringify(patch.extra));
    }
    if (!fields.length) return null;
    vals.push(pid);
    const q = await pool.query(`UPDATE cotizador_ti_perfil SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, vals);
    return q.rows[0] || null;
}

async function deletePerfil(pool, id) {
    const pid = Number(id);
    if (!Number.isFinite(pid)) return { deleted: false };
    const r = await pool.query('DELETE FROM cotizador_ti_perfil WHERE id = $1 RETURNING id', [pid]);
    return { deleted: r.rowCount > 0 };
}

async function mergeTiCargosIntoCatalogos(pool, out) {
    await ensureTiRolesSchema(pool);
    const parametros = out.parametros && typeof out.parametros === 'object' ? out.parametros : {};
    const rows = await buildCargosRowsForActiveVersion(pool, parametros);
    if (!rows.length) return out;
    const key = getInternoTiClienteKey();
    const cpp =
        out.cargos_por_cliente && typeof out.cargos_por_cliente === 'object' && !Array.isArray(out.cargos_por_cliente)
            ? { ...out.cargos_por_cliente }
            : {};
    cpp[key] = rows;
    out.cargos_por_cliente = cpp;
    return out;
}

function createTiRolesStore(deps) {
    const { pool } = deps;
    return {
        ensureTiRolesSchema: () => ensureTiRolesSchema(pool),
        getInternoTiClienteKey,
        getActiveVersionId: () => getActiveVersionId(pool),
        getActiveCatalogRow: () => getActiveCatalogRow(pool),
        listVersions: () => listVersions(pool),
        createVersion: (body) => createVersion(pool, body),
        setVersionActive: (id) => setVersionActive(pool, id),
        getNodosByVersion: (vid) => getNodosByVersion(pool, vid),
        getPerfilesByVersion: (vid) => getPerfilesByVersion(pool, vid),
        buildCargosRowsForActiveVersion: (parametros) => buildCargosRowsForActiveVersion(pool, parametros),
        mergeTiCargosIntoCatalogos: (out) => mergeTiCargosIntoCatalogos(pool, out),
        insertNodo: (body) => insertNodo(pool, body),
        updateNodo: (id, patch) => updateNodo(pool, id, patch),
        deleteNodoCascade: (id) => deleteNodoCascade(pool, id),
        upsertPerfil: (body) => upsertPerfil(pool, body),
        insertPerfil: (body) => insertPerfil(pool, body),
        updatePerfil: (id, patch) => updatePerfil(pool, id, patch),
        deletePerfil: (id) => deletePerfil(pool, id),
        listHojaFilasPaged: (versionId, opts) => listHojaFilasPaged(pool, versionId, opts),
        getHojaFila: (id) => getHojaFila(pool, id),
        insertHojaFila: (body) => insertHojaFila(pool, body),
        updateHojaFila: (id, patch) => updateHojaFila(pool, id, patch),
        deleteHojaFila: (id) => deleteHojaFila(pool, id),
        importHojaFilasReplace: (versionId, headers, rowObjects) => importHojaFilasReplace(pool, versionId, headers, rowObjects)
    };
}

module.exports = {
    createTiRolesStore,
    ensureTiRolesSchema,
    getInternoTiClienteKey,
    mergeTiCargosIntoCatalogos
};
