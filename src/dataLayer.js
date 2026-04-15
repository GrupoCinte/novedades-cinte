const crypto = require('node:crypto');
const { buildFoldToCanonicoMap, matchExcelClienteABd } = require('./cotizador/clienteNombreMatch');

function createDataLayer(deps) {
    const {
        pool,
        fs,
        xlsx,
        CLIENTES_LIDERES_XLSX_PATH,
        normalizeCatalogValue,
        normalizeCedula,
        canRoleViewType,
        getAreaFromRole
    } = deps;

    async function ensureUserRoleEnumValues() {
        const enumStatements = [
            { role: 'nomina', sql: `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'nomina'` },
            { role: 'sst', sql: `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'sst'` },
            { role: 'cac', sql: `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'cac'` }
        ];
        for (const item of enumStatements) {
            try {
                await pool.query(item.sql);
            } catch (error) {
                if (String(error?.code || '') === '42501') {
                    console.warn(`[RBAC] No fue posible agregar rol '${item.role}' al enum user_role (permiso insuficiente).`);
                    console.warn('[RBAC] Ejecuta este SQL con un usuario owner/superuser de PostgreSQL:');
                    console.warn(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS '${item.role}';`);
                    continue;
                }
                throw error;
            }
        }
    }

    async function ensureClientesLideresTable() {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS clientes_lideres (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    cliente TEXT NOT NULL,
                    lider TEXT NOT NULL,
                    activo BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT uq_cliente_lider UNIQUE (cliente, lider)
                )
            `);
            await pool.query('CREATE INDEX IF NOT EXISTS idx_clientes_lideres_cliente ON clientes_lideres(cliente)');
            await pool.query('CREATE INDEX IF NOT EXISTS idx_clientes_lideres_activo ON clientes_lideres(activo)');
        } catch (error) {
            if (String(error?.code || '') === '42501') {
                console.warn('[Catalogos] Permisos insuficientes para gestionar DDL de clientes_lideres. Se asume tabla existente.');
                return;
            }
            throw error;
        }
    }

    async function ensureNovedadesIndexes() {
        try {
            await pool.query('CREATE INDEX IF NOT EXISTS idx_novedades_creado_en ON novedades(creado_en)');
            await pool.query('CREATE INDEX IF NOT EXISTS idx_novedades_area ON novedades(area)');
            await pool.query('CREATE INDEX IF NOT EXISTS idx_novedades_estado ON novedades(estado)');
            await pool.query('CREATE INDEX IF NOT EXISTS idx_novedades_tipo ON novedades(tipo_novedad)');
            await pool.query('CREATE INDEX IF NOT EXISTS idx_novedades_correo ON novedades(correo_solicitante)');
            await pool.query('CREATE INDEX IF NOT EXISTS idx_novedades_cliente ON novedades(cliente)');
        } catch (error) {
            if (String(error?.code || '') === '42501') {
                console.warn('[DB] Permisos insuficientes para crear indices en novedades. Se continúa sin cambios de índice.');
                return;
            }
            throw error;
        }
    }

    async function ensureNovedadesHourSplitColumns() {
        try {
            await pool.query('ALTER TABLE novedades ADD COLUMN IF NOT EXISTS horas_diurnas NUMERIC(8,2) NOT NULL DEFAULT 0');
            await pool.query('ALTER TABLE novedades ADD COLUMN IF NOT EXISTS horas_nocturnas NUMERIC(8,2) NOT NULL DEFAULT 0');
        } catch (error) {
            if (String(error?.code || '') === '42501') {
                console.warn('[DB] Permisos insuficientes para agregar columnas de desglose horario. Se continúa sin migración de columnas.');
                return;
            }
            throw error;
        }
    }

    async function ensureNovedadesMontoCopColumn() {
        try {
            await pool.query('ALTER TABLE novedades ADD COLUMN IF NOT EXISTS monto_cop NUMERIC(16,2) NULL');
        } catch (error) {
            if (String(error?.code || '') === '42501') {
                console.warn('[DB] Permisos insuficientes para agregar monto_cop en novedades.');
                return;
            }
            throw error;
        }
    }

    async function ensureNovedadesApproverEmailColumns() {
        try {
            await pool.query('ALTER TABLE novedades ADD COLUMN IF NOT EXISTS aprobado_por_email TEXT NULL');
            await pool.query('ALTER TABLE novedades ADD COLUMN IF NOT EXISTS rechazado_por_email TEXT NULL');
        } catch (error) {
            if (String(error?.code || '') === '42501') {
                console.warn('[DB] Permisos insuficientes para agregar aprobado_por_email / rechazado_por_email.');
                return;
            }
            throw error;
        }
    }

    /** GP por fila de catálogo (asignación desde módulo administración / cliente). */
    async function ensureClientesLideresGpUserColumn() {
        try {
            await ensureClientesLideresTable();
            await pool.query('ALTER TABLE clientes_lideres ADD COLUMN IF NOT EXISTS gp_user_id UUID NULL');
            try {
                await pool.query(`
                    ALTER TABLE clientes_lideres
                    ADD CONSTRAINT fk_clientes_lideres_gp_user
                    FOREIGN KEY (gp_user_id) REFERENCES users(id) ON DELETE SET NULL
                `);
            } catch (e) {
                if (!['42710', '42P16', '42501'].includes(String(e?.code))) throw e;
            }
        } catch (error) {
            if (String(error?.code || '') === '42501') {
                console.warn('[Catalogos] Permisos insuficientes para gp_user_id en clientes_lideres.');
                return;
            }
            throw error;
        }
    }

    /**
     * Celda Excel del GP: correo o nombre (columnas habituales).
     * @param {Record<string, unknown>} row
     * @returns {string|null}
     */
    function parseGpCellFromExcelRow(row) {
        const v =
            row.GP ??
            row.GP_EMAIL ??
            row.CORREO_GP ??
            row['Email GP'] ??
            row['Email GP '] ??
            row.email_gp ??
            row.EmailGP ??
            row.email_GP ??
            row['Nombre GP'] ??
            row.NOMBRE_GP ??
            row.nombre_gp ??
            row.Nombre_GP ??
            '';
        const s = String(v || '').trim();
        return s || null;
    }

    /**
     * Resuelve `users.id` (rol gp) para migración: por email o por nombre completo coincidente.
     * Prefiere filas activas.
     * @param {import('pg').Pool|import('pg').PoolClient} db
     * @param {string|null} cellRaw
     * @returns {Promise<string|null>}
     */
    async function resolveGpUserIdForCatalogMigration(db, cellRaw) {
        const raw = String(cellRaw || '').trim();
        if (!raw) return null;
        if (raw.includes('@')) {
            const em = raw.toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return null;
            const q = await db.query(
                `SELECT id::text AS id FROM users
                 WHERE lower(btrim(email)) = lower(btrim($1)) AND role = 'gp'::user_role
                 ORDER BY is_active DESC NULLS LAST, updated_at DESC NULLS LAST
                 LIMIT 1`,
                [em]
            );
            return q.rows[0]?.id || null;
        }
        const nameNorm = normalizeCatalogValue(raw);
        if (!nameNorm) return null;
        const q2 = await db.query(
            `SELECT id::text AS id FROM users
             WHERE role = 'gp'::user_role
               AND lower(btrim(full_name)) = lower(btrim($1))
             ORDER BY is_active DESC NULLS LAST, updated_at DESC NULLS LAST
             LIMIT 1`,
            [nameNorm]
        );
        return q2.rows[0]?.id || null;
    }

    async function migrateClientesLideresFromExcelIfNeeded() {
        await ensureClientesLideresTable();
        await ensureClientesLideresGpUserColumn();
        const existing = await pool.query('SELECT COUNT(*)::int AS count FROM clientes_lideres WHERE activo = TRUE');
        if ((existing.rows[0]?.count || 0) > 0) return;
        if (!CLIENTES_LIDERES_XLSX_PATH) {
            console.warn('[Catalogos] CLIENTES_LIDERES_XLSX_PATH no está definido. Se omite migración desde Excel.');
            return;
        }
        if (!fs.existsSync(CLIENTES_LIDERES_XLSX_PATH)) {
            console.warn(`[Catalogos] Archivo Excel de clientes/lideres no encontrado: ${CLIENTES_LIDERES_XLSX_PATH}`);
            return;
        }
        const workbook = xlsx.readFile(CLIENTES_LIDERES_XLSX_PATH);
        const sheetName = workbook.SheetNames[0];
        const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
        if (!Array.isArray(rows) || rows.length === 0) return;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const row of rows) {
                const clienteRaw = normalizeCatalogValue(row.CLIENTE ?? row.Cliente ?? row.cliente);
                const liderRaw = normalizeCatalogValue(row.Lider ?? row.LÍDER ?? row.lider ?? row['Líder']);
                if (!clienteRaw || !liderRaw) continue;
                const gpCell = parseGpCellFromExcelRow(row);
                const gpId = gpCell ? await resolveGpUserIdForCatalogMigration(client, gpCell) : null;
                if (gpCell && !gpId) {
                    console.warn(
                        `[Catalogos] Fila Excel: GP "${gpCell}" sin coincidencia en users (rol gp); se omite gp_user_id para ${clienteRaw} / ${liderRaw}.`
                    );
                }
                await client.query(
                    `INSERT INTO clientes_lideres (cliente, lider, activo, gp_user_id)
                     VALUES ($1, $2, TRUE, $3::uuid)
                     ON CONFLICT (cliente, lider)
                     DO UPDATE SET activo = TRUE, gp_user_id = COALESCE(EXCLUDED.gp_user_id, clientes_lideres.gp_user_id), updated_at = NOW()`,
                    [clienteRaw, liderRaw, gpId]
                );
            }
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async function getClientesList() {
        const q = await pool.query(
            `SELECT DISTINCT cliente
             FROM clientes_lideres
             WHERE activo = TRUE
             ORDER BY cliente ASC`
        );
        return q.rows.map((r) => r.cliente);
    }

    async function getLideresByCliente(cliente) {
        const raw = normalizeCatalogValue(cliente);
        if (!raw) return [];
        const clientesCanonico = await getClientesList();
        const { map } = buildFoldToCanonicoMap(clientesCanonico);
        const canonical = matchExcelClienteABd(raw, map);
        const clienteParaQuery = canonical || raw;
        const q = await pool.query(
            `SELECT lider
             FROM clientes_lideres
             WHERE activo = TRUE AND cliente = $1
             ORDER BY lider ASC`,
            [clienteParaQuery]
        );
        return q.rows.map((r) => r.lider);
    }

    async function migrateExcelIfNeeded() {
        // Desactivado por decisión de producto:
        // la fuente oficial de datos es PostgreSQL y NO se debe migrar desde Excel.
        return;
    }

    async function ensureColaboradoresTable() {
        try {
            await pool.query(`
                CREATE TABLE IF NOT EXISTS colaboradores (
                    cedula TEXT PRIMARY KEY,
                    nombre TEXT NOT NULL,
                    activo BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            `);
            await pool.query('CREATE INDEX IF NOT EXISTS idx_colaboradores_activo ON colaboradores(activo)');
            await ensureColaboradoresDirectoryColumns();
        } catch (error) {
            if (String(error?.code || '') === '42501') {
                console.warn('[Colaboradores] Permisos insuficientes para crear tabla colaboradores.');
                return;
            }
            throw error;
        }
    }

    /**
     * Columnas de contacto / GP en directorio y snapshot en novedades.
     * Convención cédulas sintéticas: docs/colaboradores-cedulas-sinteticas.md
     */
    async function ensureColaboradoresDirectoryColumns() {
        try {
            await pool.query('ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS correo_cinte TEXT NULL');
            await pool.query('ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS cliente TEXT NULL');
            await pool.query('ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS lider_catalogo TEXT NULL');
            await pool.query('ALTER TABLE colaboradores ADD COLUMN IF NOT EXISTS gp_user_id UUID NULL');
            await pool.query('ALTER TABLE novedades ADD COLUMN IF NOT EXISTS gp_user_id UUID NULL');
            try {
                await pool.query(`
                    ALTER TABLE colaboradores
                    ADD CONSTRAINT fk_colaboradores_gp_user
                    FOREIGN KEY (gp_user_id) REFERENCES users(id) ON DELETE SET NULL
                `);
            } catch (e) {
                // 42710 duplicate_object, 42501 sin privilegio para CONSTRAINT (no es superusuario de BD)
                if (!['42710', '42P16', '42501'].includes(String(e?.code))) throw e;
            }
            try {
                await pool.query(`
                    ALTER TABLE novedades
                    ADD CONSTRAINT fk_novedades_gp_user_snapshot
                    FOREIGN KEY (gp_user_id) REFERENCES users(id) ON DELETE SET NULL
                `);
            } catch (e) {
                if (!['42710', '42P16', '42501'].includes(String(e?.code))) throw e;
            }
        } catch (error) {
            if (String(error?.code || '') === '42501') {
                console.warn('[Colaboradores] Permisos insuficientes para columnas de directorio extendido / gp.');
                return;
            }
            throw error;
        }
    }

    async function ensureCinteLeonardoPair() {
        await ensureClientesLideresTable();
        await pool.query(
            `INSERT INTO clientes_lideres (cliente, lider, activo)
             VALUES ('CINTE', 'Leonardo Rojas', TRUE)
             ON CONFLICT (cliente, lider)
             DO UPDATE SET activo = TRUE, updated_at = NOW()`
        );
    }

    async function ensureUsersCognitoSubColumn() {
        try {
            await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS cognito_sub TEXT NULL');
            await pool.query(
                'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cognito_sub ON users(cognito_sub) WHERE cognito_sub IS NOT NULL'
            );
        } catch (error) {
            if (String(error?.code || '') === '42501') {
                console.warn('[Users] Permisos insuficientes para columna cognito_sub / índice.');
                return;
            }
            throw error;
        }
    }

    /**
     * @param {{ activo?: boolean|null, q?: string, limit?: number, offset?: number }} opts
     */
    async function listClientesLideresPaged(opts = {}) {
        const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 2000);
        const offset = Math.max(Number(opts.offset) || 0, 0);
        const params = [];
        const where = [];
        const whereAlias = [];
        if (opts.activo === true || opts.activo === false) {
            params.push(opts.activo);
            where.push(`activo = $${params.length}`);
            whereAlias.push(`cl.activo = $${params.length}`);
        }
        const qRaw = String(opts.q || '').trim();
        if (qRaw) {
            params.push(`%${qRaw.toLowerCase()}%`);
            where.push(
                `(lower(cliente) LIKE $${params.length} OR lower(lider) LIKE $${params.length})`
            );
            whereAlias.push(
                `(lower(cl.cliente) LIKE $${params.length} OR lower(cl.lider) LIKE $${params.length})`
            );
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const whereAliasSql = whereAlias.length ? `WHERE ${whereAlias.join(' AND ')}` : '';
        params.push(limit, offset);
        const limIdx = params.length - 1;
        const offIdx = params.length;
        const countQ = await pool.query(
            `SELECT COUNT(*)::int AS total FROM clientes_lideres ${whereSql}`,
            params.slice(0, params.length - 2)
        );
        const listQ = await pool.query(
            `SELECT
                cl.id,
                cl.cliente,
                cl.lider,
                cl.activo,
                cl.gp_user_id,
                cl.created_at,
                cl.updated_at,
                NULLIF(BTRIM(u.full_name), '') AS gp_full_name
             FROM clientes_lideres cl
             LEFT JOIN users u ON cl.gp_user_id = u.id
             ${whereAliasSql}
             ORDER BY cl.cliente ASC, cl.lider ASC
             LIMIT $${limIdx} OFFSET $${offIdx}`,
            params
        );
        return { rows: listQ.rows || [], total: countQ.rows[0]?.total ?? 0 };
    }

    /**
     * @param {string} cliente
     * @param {string} lider
     * @param {string|null|undefined} gpUserId UUID de users (rol gp) o null
     */
    async function insertClienteLider(cliente, lider, gpUserId = null) {
        const c = normalizeCatalogValue(cliente);
        const l = normalizeCatalogValue(lider);
        if (!c || !l) throw Object.assign(new Error('Cliente y líder son obligatorios'), { status: 400 });
        const gp = gpUserId === undefined || gpUserId === null || gpUserId === '' ? null : String(gpUserId).trim();
        const q = await pool.query(
            `INSERT INTO clientes_lideres (cliente, lider, activo, gp_user_id)
             VALUES ($1, $2, TRUE, $3::uuid)
             ON CONFLICT (cliente, lider)
             DO UPDATE SET activo = TRUE, gp_user_id = COALESCE(EXCLUDED.gp_user_id, clientes_lideres.gp_user_id), updated_at = NOW()
             RETURNING id, cliente, lider, activo, gp_user_id, created_at, updated_at`,
            [c, l, gp]
        );
        return q.rows[0];
    }

    /**
     * @param {string} id
     * @param {{ activo?: boolean, cliente?: string, lider?: string, gp_user_id?: string|null }} patch
     */
    async function updateClienteLiderById(id, patch) {
        const cur = await pool.query(
            'SELECT id, cliente, lider, activo, gp_user_id FROM clientes_lideres WHERE id = $1::uuid LIMIT 1',
            [id]
        );
        if (!cur.rows[0]) return null;
        const row = cur.rows[0];
        const nextCliente = patch.cliente !== undefined ? normalizeCatalogValue(patch.cliente) : row.cliente;
        const nextLider = patch.lider !== undefined ? normalizeCatalogValue(patch.lider) : row.lider;
        const nextActivo = patch.activo !== undefined ? Boolean(patch.activo) : row.activo;
        const nextGp =
            patch.gp_user_id !== undefined
                ? patch.gp_user_id === null || patch.gp_user_id === ''
                    ? null
                    : String(patch.gp_user_id).trim()
                : row.gp_user_id;
        if (!nextCliente || !nextLider) throw Object.assign(new Error('Cliente y líder no pueden quedar vacíos'), { status: 400 });
        const q = await pool.query(
            `UPDATE clientes_lideres
             SET cliente = $2, lider = $3, activo = $4, gp_user_id = $5::uuid, updated_at = NOW()
             WHERE id = $1::uuid
             RETURNING id, cliente, lider, activo, gp_user_id, created_at, updated_at`,
            [id, nextCliente, nextLider, nextActivo, nextGp]
        );
        return q.rows[0] || null;
    }

    /**
     * @param {{ q?: string, activo?: boolean|null, limit?: number, offset?: number }} opts
     */
    async function listColaboradoresPaged(opts = {}) {
        const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
        const offset = Math.max(Number(opts.offset) || 0, 0);
        const params = [];
        const where = [];
        if (opts.activo === true || opts.activo === false) {
            params.push(opts.activo);
            where.push(`activo = $${params.length}`);
        }
        const qRaw = String(opts.q || '').trim();
        if (qRaw) {
            const like = `%${qRaw.toLowerCase()}%`;
            params.push(like, like, like, like);
            const i = params.length;
            where.push(
                `(lower(cedula) LIKE $${i - 3}
                  OR lower(nombre) LIKE $${i - 2}
                  OR lower(coalesce(correo_cinte, '')) LIKE $${i - 1}
                  OR lower(coalesce(cliente, '')) LIKE $${i})`
            );
        }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const countQ = await pool.query(`SELECT COUNT(*)::int AS total FROM colaboradores ${whereSql}`, params);
        params.push(limit, offset);
        const limIdx = params.length - 1;
        const offIdx = params.length;
        const listQ = await pool.query(
            `SELECT cedula, nombre, activo, correo_cinte, cliente, lider_catalogo, gp_user_id, created_at, updated_at
             FROM colaboradores
             ${whereSql}
             ORDER BY nombre ASC
             LIMIT $${limIdx} OFFSET $${offIdx}`,
            params
        );
        return { rows: listQ.rows || [], total: countQ.rows[0]?.total ?? 0 };
    }

    async function insertColaborador(row) {
        const ced = normalizeCedula(row.cedula);
        if (!ced) throw Object.assign(new Error('Cédula inválida'), { status: 400 });
        const nombre = normalizeCatalogValue(row.nombre);
        if (!nombre) throw Object.assign(new Error('Nombre es obligatorio'), { status: 400 });
        const correo = row.correo_cinte ? String(row.correo_cinte).trim().toLowerCase() : null;
        const cliente = row.cliente ? normalizeCatalogValue(row.cliente) : null;
        const lider = row.lider_catalogo ? normalizeCatalogValue(row.lider_catalogo) : null;
        const gpId = row.gp_user_id || null;
        const q = await pool.query(
            `INSERT INTO colaboradores (cedula, nombre, activo, correo_cinte, cliente, lider_catalogo, gp_user_id)
             VALUES ($1, $2, COALESCE($3, TRUE), $4, $5, $6, $7)
             RETURNING cedula, nombre, activo, correo_cinte, cliente, lider_catalogo, gp_user_id, created_at, updated_at`,
            [ced, nombre, row.activo !== false, correo, cliente, lider, gpId]
        );
        return q.rows[0];
    }

    async function updateColaboradorByCedula(cedulaRaw, patch) {
        const ced = normalizeCedula(cedulaRaw);
        if (!ced) throw Object.assign(new Error('Cédula inválida'), { status: 400 });
        const cur = await pool.query(
            `SELECT cedula, nombre, activo, correo_cinte, cliente, lider_catalogo, gp_user_id FROM colaboradores WHERE cedula = $1 LIMIT 1`,
            [ced]
        );
        if (!cur.rows[0]) return null;
        const r = cur.rows[0];
        const nombre = patch.nombre !== undefined ? normalizeCatalogValue(patch.nombre) : r.nombre;
        if (!nombre) throw Object.assign(new Error('Nombre no puede quedar vacío'), { status: 400 });
        const correo =
            patch.correo_cinte !== undefined
                ? patch.correo_cinte
                    ? String(patch.correo_cinte).trim().toLowerCase()
                    : null
                : r.correo_cinte;
        const cliente =
            patch.cliente !== undefined ? (patch.cliente ? normalizeCatalogValue(patch.cliente) : null) : r.cliente;
        const lider =
            patch.lider_catalogo !== undefined
                ? patch.lider_catalogo
                    ? normalizeCatalogValue(patch.lider_catalogo)
                    : null
                : r.lider_catalogo;
        const activo = patch.activo !== undefined ? Boolean(patch.activo) : r.activo;
        const gpId = patch.gp_user_id !== undefined ? patch.gp_user_id || null : r.gp_user_id;
        const q = await pool.query(
            `UPDATE colaboradores SET
                nombre = $2,
                activo = $3,
                correo_cinte = $4,
                cliente = $5,
                lider_catalogo = $6,
                gp_user_id = $7,
                updated_at = NOW()
             WHERE cedula = $1
             RETURNING cedula, nombre, activo, correo_cinte, cliente, lider_catalogo, gp_user_id, created_at, updated_at`,
            [ced, nombre, activo, correo, cliente, lider, gpId]
        );
        return q.rows[0] || null;
    }

    async function listGpUsersForDirectorio() {
        const q = await pool.query(
            `SELECT id, email, username, full_name, role, is_active, cognito_sub, created_at
             FROM users
             WHERE role = 'gp'::user_role
             ORDER BY lower(email) ASC`
        );
        return q.rows || [];
    }

    async function insertGpUserPlaceholder({ email, fullName, passwordPlaceholder, area }) {
        const em = String(email || '').trim().toLowerCase();
        const fn = normalizeCatalogValue(fullName) || em;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) throw Object.assign(new Error('Email inválido'), { status: 400 });
        const q = await pool.query(
            `INSERT INTO users (email, username, full_name, role, area, password_hash, is_active)
             VALUES ($1, $2, $3, 'gp'::user_role, $4::user_area, $5, TRUE)
             RETURNING id, email, username, full_name, role, is_active, cognito_sub, created_at`,
            [em, em, fn, area, passwordPlaceholder]
        );
        return q.rows[0];
    }

    async function updateGpUserById(id, patch) {
        const cur = await pool.query(
            `SELECT id, full_name, is_active FROM users WHERE id = $1::uuid AND role = 'gp'::user_role LIMIT 1`,
            [id]
        );
        if (!cur.rows[0]) return null;
        const fullName = patch.full_name !== undefined ? normalizeCatalogValue(patch.full_name) || cur.rows[0].full_name : cur.rows[0].full_name;
        const isActive = patch.is_active !== undefined ? Boolean(patch.is_active) : cur.rows[0].is_active;
        const q = await pool.query(
            `UPDATE users SET full_name = $2, is_active = $3, updated_at = NOW() WHERE id = $1::uuid AND role = 'gp'::user_role
             RETURNING id, email, username, full_name, role, is_active, cognito_sub, created_at`,
            [id, fullName, isActive]
        );
        return q.rows[0] || null;
    }

    /**
     * Resuelve o crea un user GP interno a partir de una cédula de colaborador.
     * Devuelve UUID para asignar en clientes_lideres.gp_user_id y sincroniza colaboradores.gp_user_id.
     * @param {string} cedulaRaw
     * @returns {Promise<{ gp_user_id: string, created_gp_user: boolean, gp_email: string }>}
     */
    async function resolveOrCreateGpUserIdForColaboradorCedula(cedulaRaw) {
        const ced = normalizeCedula(cedulaRaw);
        if (!ced) throw Object.assign(new Error('Cédula de colaborador inválida.'), { status: 400 });
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const cq = await client.query(
                `SELECT cedula, nombre, correo_cinte, gp_user_id
                 FROM colaboradores
                 WHERE cedula = $1
                 LIMIT 1`,
                [ced]
            );
            const col = cq.rows[0];
            if (!col) throw Object.assign(new Error('Colaborador no encontrado para asignación GP.'), { status: 404 });
            const email = String(col.correo_cinte || '')
                .trim()
                .toLowerCase();
            if (!email) {
                throw Object.assign(new Error('El colaborador no tiene correo Cinte. No se puede crear/vincular GP.'), {
                    status: 400
                });
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                throw Object.assign(new Error('Correo Cinte inválido en colaborador.'), { status: 400 });
            }

            let gpUserId = null;
            let createdGpUser = false;

            const currentGp = col.gp_user_id ? String(col.gp_user_id).trim() : '';
            if (currentGp) {
                const qgp = await client.query(
                    `SELECT id::text AS id
                     FROM users
                     WHERE id = $1::uuid AND role = 'gp'::user_role
                     LIMIT 1`,
                    [currentGp]
                );
                if (qgp.rows[0]?.id) gpUserId = qgp.rows[0].id;
            }

            if (!gpUserId) {
                const qEmail = await client.query(
                    `SELECT id::text AS id, role::text AS role
                     FROM users
                     WHERE lower(btrim(email)) = lower(btrim($1))
                     LIMIT 1`,
                    [email]
                );
                if (qEmail.rows[0]) {
                    if (qEmail.rows[0].role !== 'gp') {
                        throw Object.assign(
                            new Error('El correo del colaborador ya existe en users con un rol distinto a GP.'),
                            { status: 409 }
                        );
                    }
                    gpUserId = qEmail.rows[0].id;
                }
            }

            if (!gpUserId) {
                const fullName = normalizeCatalogValue(col.nombre) || email;
                const area = typeof getAreaFromRole === 'function' ? getAreaFromRole('gp') : 'Operaciones';
                const placeholder = `cognito_gp_placeholder:${crypto.randomBytes(32).toString('hex')}`;
                const ins = await client.query(
                    `INSERT INTO users (email, username, full_name, role, area, password_hash, is_active)
                     VALUES ($1, $2, $3, 'gp'::user_role, $4::user_area, $5, TRUE)
                     RETURNING id::text AS id`,
                    [email, email, fullName, area, placeholder]
                );
                gpUserId = ins.rows[0]?.id || null;
                createdGpUser = true;
            }

            if (!gpUserId) throw Object.assign(new Error('No se pudo resolver usuario GP para colaborador.'), { status: 500 });

            await client.query(
                `UPDATE colaboradores
                 SET gp_user_id = $2::uuid, updated_at = NOW()
                 WHERE cedula = $1`,
                [ced, gpUserId]
            );
            await client.query('COMMIT');
            return { gp_user_id: gpUserId, created_gp_user: createdGpUser, gp_email: email };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    async function clearGpUserReferences(gpUserId) {
        await pool.query('UPDATE colaboradores SET gp_user_id = NULL, updated_at = NOW() WHERE gp_user_id = $1::uuid', [
            gpUserId
        ]);
        try {
            await pool.query(
                'UPDATE clientes_lideres SET gp_user_id = NULL, updated_at = NOW() WHERE gp_user_id = $1::uuid',
                [gpUserId]
            );
        } catch (e) {
            if (String(e?.code || '') === '42703') return;
            throw e;
        }
    }

    /**
     * @param {string} emailNorm
     * @param {string} cognitoSub
     */
    async function linkGpCognitoSubByEmail(emailNorm, cognitoSub) {
        const em = String(emailNorm || '').trim().toLowerCase();
        const sub = String(cognitoSub || '').trim();
        if (!em || !sub) throw Object.assign(new Error('Email y sub Cognito son obligatorios'), { status: 400 });
        const taken = await pool.query(
            'SELECT id FROM users WHERE cognito_sub = $1 AND lower(btrim(email)) <> lower(btrim($2)) LIMIT 1',
            [sub, em]
        );
        if (taken.rows[0]) {
            throw Object.assign(new Error('Este sub de Cognito ya está vinculado a otro usuario'), { status: 409 });
        }
        const q = await pool.query(
            `UPDATE users
             SET cognito_sub = $2, updated_at = NOW()
             WHERE lower(btrim(email)) = lower(btrim($1)) AND role = 'gp'::user_role AND is_active = TRUE
             RETURNING id, email, cognito_sub`,
            [em, sub]
        );
        return q.rows[0] || null;
    }

    async function getColaboradorByCedula(cedulaRaw) {
        const c = normalizeCedula(cedulaRaw);
        if (!c) return null;
        try {
            const q = await pool.query(
                `SELECT cedula, nombre, correo_cinte, cliente, lider_catalogo, gp_user_id
                 FROM colaboradores
                 WHERE activo = TRUE AND cedula = $1
                 LIMIT 1`,
                [c]
            );
            return q.rows[0] || null;
        } catch (error) {
            // Columnas de directorio aún no migradas (42703 = undefined_column)
            if (String(error?.code || '') !== '42703') throw error;
            const q2 = await pool.query(
                `SELECT cedula, nombre FROM colaboradores WHERE activo = TRUE AND cedula = $1 LIMIT 1`,
                [c]
            );
            const row = q2.rows[0];
            if (!row) return null;
            return {
                ...row,
                correo_cinte: null,
                cliente: null,
                lider_catalogo: null,
                gp_user_id: null
            };
        }
    }

    /**
     * @param {string|null|undefined} gpUserId
     * @returns {Promise<string[]>}
     */
    async function listAssignedClientesForGpUserId(gpUserId) {
        const id = String(gpUserId || '').trim();
        if (!id) return [];
        const q = await pool.query(
            `SELECT DISTINCT cliente
             FROM clientes_lideres
             WHERE activo = TRUE AND gp_user_id = $1::uuid
             ORDER BY cliente ASC`,
            [id]
        );
        return (q.rows || []).map((r) => r.cliente).filter(Boolean);
    }

    /**
     * Resuelve el users.id interno del GP para scoping.
     * Prioriza email de sesión (Cognito), con fallback al gpUserId recibido en scope.
     * @param {{ gpEmail?: string|null, gpUserId?: string|null }} scope
     * @returns {Promise<string|null>}
     */
    async function resolveGpInternalUserIdForScope(scope = {}) {
        const email = String(scope.gpEmail || '')
            .trim()
            .toLowerCase();
        if (email) {
            const q = await pool.query(
                `SELECT id::text AS id
                 FROM users
                 WHERE role = 'gp'::user_role
                   AND lower(btrim(email)) = lower(btrim($1))
                 ORDER BY is_active DESC NULLS LAST, updated_at DESC NULLS LAST
                 LIMIT 1`,
                [email]
            );
            if (q.rows[0]?.id) return q.rows[0].id;
        }
        const id = String(scope.gpUserId || '').trim();
        return id || null;
    }

    async function getScopedNovedades(scope, options = {}) {
        const role = scope?.role || '';
        const tipo = String(options?.tipo || '').trim();
        const estado = String(options?.estado || '').trim();
        const correo = String(options?.correo || '').trim().toLowerCase();
        const cliente = String(options?.cliente || '').trim().toLowerCase();
        const sortByRaw = String(options?.sortBy || '').trim();
        const sortDirRaw = String(options?.sortDir || '').trim().toLowerCase();
        const sortBy = ['creadoEn', 'estado', 'tipoNovedad'].includes(sortByRaw) ? sortByRaw : 'creadoEn';
        const sortDir = sortDirRaw === 'asc' ? 'asc' : 'desc';
        const whereParts = [];
        const params = [];
        if (!scope?.canViewAllAreas && Array.isArray(scope?.areas) && scope.areas.length > 0) {
            params.push(scope.areas);
            whereParts.push(`(nov.area IS NULL OR nov.area::text = ANY($${params.length}::text[]))`);
        }
        if (role === 'gp') {
            const gpInternalId = await resolveGpInternalUserIdForScope(scope);
            const assignedClientes = await listAssignedClientesForGpUserId(gpInternalId);
            if (!assignedClientes.length) {
                return [];
            }
            const normalized = assignedClientes.map((c) => String(c).toLowerCase());
            params.push(normalized);
            whereParts.push(`lower(coalesce(nov.cliente, '')) = ANY($${params.length}::text[])`);
        }
        if (tipo) {
            params.push(tipo);
            whereParts.push(`lower(btrim(coalesce(nov.tipo_novedad, ''))) = lower(btrim($${params.length}))`);
        }
        if (estado) {
            params.push(estado);
            whereParts.push(`nov.estado = $${params.length}::novedad_estado`);
        }
        if (correo) {
            params.push(`%${correo}%`);
            whereParts.push(`lower(coalesce(nov.correo_solicitante, '')) LIKE $${params.length}`);
        }
        if (cliente) {
            params.push(`%${cliente}%`);
            whereParts.push(`lower(coalesce(nov.cliente, '')) LIKE $${params.length}`);
        }
        const orderColumnMap = {
            creadoEn: 'creado_en',
            estado: 'estado',
            tipoNovedad: 'tipo_novedad'
        };
        const orderColumn = orderColumnMap[sortBy] || 'creado_en';
        const orderDirection = sortDir === 'asc' ? 'ASC' : 'DESC';
        const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
        const q = await pool.query(
            `SELECT
                nov.id, nov.nombre, nov.cedula, nov.correo_solicitante, nov.cliente, nov.lider, nov.tipo_novedad, nov.area,
                nov.fecha, nov.hora_inicio, nov.hora_fin, nov.fecha_inicio, nov.fecha_fin, nov.cantidad_horas, nov.tipo_hora_extra, nov.horas_diurnas, nov.horas_nocturnas,
                nov.monto_cop, nov.soporte_ruta, nov.estado, nov.creado_en, nov.aprobado_en, nov.aprobado_por_rol, nov.rechazado_en, nov.rechazado_por_rol,
                COALESCE(NULLIF(BTRIM(nov.aprobado_por_email), ''), NULLIF(BTRIM(ua.email), '')) AS aprobado_por_correo,
                COALESCE(NULLIF(BTRIM(nov.rechazado_por_email), ''), NULLIF(BTRIM(ur.email), '')) AS rechazado_por_correo
             FROM novedades nov
             LEFT JOIN users ua ON nov.aprobado_por_user_id = ua.id
             LEFT JOIN users ur ON nov.rechazado_por_user_id = ur.id
             ${whereSql}
             ORDER BY nov.${orderColumn} ${orderDirection}, nov.creado_en DESC`,
            params
        );
        return (q.rows || []).filter((row) => canRoleViewType(role, row.tipo_novedad));
    }

    return {
        ensureUserRoleEnumValues,
        ensureClientesLideresTable,
        ensureClientesLideresGpUserColumn,
        ensureNovedadesIndexes,
        ensureNovedadesHourSplitColumns,
        ensureNovedadesMontoCopColumn,
        ensureNovedadesApproverEmailColumns,
        migrateClientesLideresFromExcelIfNeeded,
        ensureColaboradoresTable,
        ensureColaboradoresDirectoryColumns,
        ensureUsersCognitoSubColumn,
        ensureCinteLeonardoPair,
        getColaboradorByCedula,
        getClientesList,
        getLideresByCliente,
        listClientesLideresPaged,
        insertClienteLider,
        updateClienteLiderById,
        listColaboradoresPaged,
        insertColaborador,
        updateColaboradorByCedula,
        listGpUsersForDirectorio,
        insertGpUserPlaceholder,
        updateGpUserById,
        resolveOrCreateGpUserIdForColaboradorCedula,
        clearGpUserReferences,
        linkGpCognitoSubByEmail,
        migrateExcelIfNeeded,
        getScopedNovedades
    };
}

module.exports = { createDataLayer };
