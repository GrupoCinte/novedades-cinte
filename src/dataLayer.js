function createDataLayer(deps) {
    const {
        pool,
        fs,
        xlsx,
        CLIENTES_LIDERES_XLSX_PATH,
        normalizeCatalogValue,
        normalizeCedula,
        canRoleViewType
    } = deps;

    async function ensureUserRoleEnumValues() {
        const enumStatements = [
            { role: 'nomina', sql: `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'nomina'` },
            { role: 'sst', sql: `ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'sst'` }
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

    async function migrateClientesLideresFromExcelIfNeeded() {
        await ensureClientesLideresTable();
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
                await client.query(
                    `INSERT INTO clientes_lideres (cliente, lider, activo)
                     VALUES ($1, $2, TRUE)
                     ON CONFLICT (cliente, lider)
                     DO UPDATE SET activo = TRUE, updated_at = NOW()`,
                    [clienteRaw, liderRaw]
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
        const q = await pool.query(
            `SELECT lider
             FROM clientes_lideres
             WHERE activo = TRUE AND cliente = $1
             ORDER BY lider ASC`,
            [cliente]
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
        } catch (error) {
            if (String(error?.code || '') === '42501') {
                console.warn('[Colaboradores] Permisos insuficientes para crear tabla colaboradores.');
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

    async function getColaboradorByCedula(cedulaRaw) {
        const c = normalizeCedula(cedulaRaw);
        if (!c) return null;
        const q = await pool.query(
            `SELECT cedula, nombre FROM colaboradores WHERE activo = TRUE AND cedula = $1 LIMIT 1`,
            [c]
        );
        return q.rows[0] || null;
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
            whereParts.push(`(area IS NULL OR area::text = ANY($${params.length}::text[]))`);
        }
        if (tipo) {
            params.push(tipo);
            whereParts.push(`tipo_novedad = $${params.length}`);
        }
        if (estado) {
            params.push(estado);
            whereParts.push(`estado = $${params.length}::novedad_estado`);
        }
        if (correo) {
            params.push(`%${correo}%`);
            whereParts.push(`lower(coalesce(correo_solicitante, '')) LIKE $${params.length}`);
        }
        if (cliente) {
            params.push(`%${cliente}%`);
            whereParts.push(`lower(coalesce(cliente, '')) LIKE $${params.length}`);
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
                id, nombre, cedula, correo_solicitante, cliente, lider, tipo_novedad, area,
                fecha, hora_inicio, hora_fin, fecha_inicio, fecha_fin, cantidad_horas, tipo_hora_extra, horas_diurnas, horas_nocturnas,
                soporte_ruta, estado, creado_en, aprobado_en, aprobado_por_rol, rechazado_en, rechazado_por_rol
             FROM novedades
             ${whereSql}
             ORDER BY ${orderColumn} ${orderDirection}, creado_en DESC`,
            params
        );
        return (q.rows || []).filter((row) => canRoleViewType(role, row.tipo_novedad));
    }

    return {
        ensureUserRoleEnumValues,
        ensureClientesLideresTable,
        ensureNovedadesIndexes,
        ensureNovedadesHourSplitColumns,
        migrateClientesLideresFromExcelIfNeeded,
        ensureColaboradoresTable,
        ensureCinteLeonardoPair,
        getColaboradorByCedula,
        getClientesList,
        getLideresByCliente,
        migrateExcelIfNeeded,
        getScopedNovedades
    };
}

module.exports = { createDataLayer };
