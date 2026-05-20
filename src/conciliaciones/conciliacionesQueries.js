/**
 * Consultas del módulo Conciliaciones (facturación vs novedades aprobadas por cliente/mes).
 * Fecha efectiva de novedad para el bucket mensual (Bogotá):
 * COALESCE(fecha_inicio::date, fecha::date, (creado_en AT TIME ZONE 'America/Bogota')::date)
 */

const { buildFoldToCanonicoMap, matchExcelClienteABd, foldForMatch } = require('../cotizador/clienteNombreMatch');

/** @param {string} alias */
function effectiveNovedadDateSql(alias = 'nov') {
    return `COALESCE(${alias}.fecha_inicio::date, ${alias}.fecha::date, (${alias}.creado_en AT TIME ZONE 'America/Bogota')::date)`;
}

/**
 * @param {number} year
 * @param {number} month 1-12
 */
function monthRangeDates(year, month) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0));
    const pad = (n) => String(n).padStart(2, '0');
    const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    return { start: iso(start), end: iso(end) };
}

async function resolveClienteCanon(deps, clienteRaw) {
    const { pool, getClientesList, normalizeCatalogValue } = deps;
    const raw = normalizeCatalogValue(clienteRaw);
    if (!raw) return null;
    const clientesCanonico = await getClientesList();
    const { map } = buildFoldToCanonicoMap(clientesCanonico);
    const canonical = matchExcelClienteABd(raw, map);
    return canonical || raw;
}

/**
 * @param {*} deps
 * @param {{ role: string, canViewAllAreas: boolean, areas: string[] }} scope
 */
async function listConciliacionesClientes(deps, scope) {
    const { pool, listScopedDistinctClientes, listAssignedClientesForGpUserId, resolveGpInternalUserIdForScope } = deps;
    const role = String(scope?.role || '');
    const canonicalByFold = new Map();

    const add = (label) => {
        const t = String(label || '').trim();
        if (!t) return;
        const k = foldForMatch(t);
        if (!canonicalByFold.has(k)) canonicalByFold.set(k, t);
    };

    if (role === 'gp') {
        const gpId = await resolveGpInternalUserIdForScope(scope);
        const assigned = await listAssignedClientesForGpUserId(gpId);
        if (!assigned.length) return [];
        const lowerAssigned = new Set(assigned.map((x) => String(x).toLowerCase()));
        const q = await pool.query(
            `SELECT DISTINCT BTRIM(cliente) AS c
             FROM colaboradores
             WHERE activo IS NOT FALSE
               AND NULLIF(BTRIM(COALESCE(cliente, '')), '') IS NOT NULL`
        );
        for (const row of q.rows || []) {
            const c = String(row.c || '').trim();
            if (lowerAssigned.has(c.toLowerCase())) add(c);
        }
        return Array.from(canonicalByFold.values()).sort((a, b) =>
            a.localeCompare(b, 'es', { sensitivity: 'base' })
        );
    }

    const fromNov = await listScopedDistinctClientes(scope, {});
    fromNov.forEach(add);

    const viewAll = Boolean(scope?.canViewAllAreas) || role === 'super_admin' || role === 'cac';
    if (viewAll) {
        const q = await pool.query(
            `SELECT DISTINCT BTRIM(cliente) AS c
             FROM colaboradores
             WHERE activo IS NOT FALSE
               AND NULLIF(BTRIM(COALESCE(cliente, '')), '') IS NOT NULL`
        );
        for (const row of q.rows || []) add(row.c);
    }

    return Array.from(canonicalByFold.values()).sort((a, b) =>
        a.localeCompare(b, 'es', { sensitivity: 'base' })
    );
}

async function assertClienteConciliacionPermitido(deps, scope, clienteRaw) {
    const allowed = await listConciliacionesClientes(deps, scope);
    const canon = await resolveClienteCanon(deps, clienteRaw);
    if (!canon) return { ok: false, status: 400, error: 'Cliente inválido' };
    const fold = foldForMatch(canon);
    const ok = allowed.some((c) => foldForMatch(c) === fold);
    if (!ok) return { ok: false, status: 403, error: 'Sin acceso a este cliente' };
    return { ok: true, canon };
}

function novedadesAreaClause(scope) {
    const role = String(scope?.role || '');
    if (role === 'gp') return { sql: '', params: [] };
    if (scope?.canViewAllAreas) return { sql: '', params: [] };
    const areas = Array.isArray(scope?.areas) ? scope.areas.filter(Boolean) : [];
    if (!areas.length) return { sql: ' AND FALSE ', params: [] };
    return { sql: ' AND (nov.area IS NULL OR nov.area::text = ANY($IDX::text[])) ', params: [areas] };
}

/**
 * @returns {Promise<{ rows: object[], totales: object }>}
 */
async function getConciliacionResumenPorClienteMes(deps, scope, clienteCanon, year, month) {
    const { pool, normalizeCedula, canRoleViewType } = deps;
    const mr = monthRangeDates(year, month);
    if (!mr) return { rows: [], totales: { tarifaSum: 0, deduccionSum: 0, facturaSum: 0, colaboradores: 0 } };

    const areaPart = novedadesAreaClause(scope);
    let areaSql = areaPart.sql;
    const params = [clienteCanon, mr.start, mr.end];
    if (areaPart.params.length) {
        params.push(areaPart.params[0]);
        areaSql = areaSql.replace('$IDX', `$${params.length}`);
    }

    const dateExpr = effectiveNovedadDateSql('nov');
    const qNov = await pool.query(
        `SELECT nov.cedula, nov.tipo_novedad, nov.monto_cop
         FROM novedades nov
         WHERE nov.estado = 'Aprobado'::novedad_estado
           AND lower(btrim(COALESCE(nov.cliente, ''))) = lower(btrim($1::text))
           AND ${dateExpr} >= $2::date
           AND ${dateExpr} <= $3::date
           ${areaSql}`,
        params
    );

    /** @type {Map<string, { count: number, sumMonto: number }>} */
    const agg = new Map();
    const role = String(scope?.role || '');
    for (const row of qNov.rows || []) {
        if (!canRoleViewType(role, row.tipo_novedad)) continue;
        const cedDigits = normalizeCedula(String(row.cedula || ''));
        if (!cedDigits) continue;
        const cur = agg.get(cedDigits) || { count: 0, sumMonto: 0 };
        cur.count += 1;
        cur.sumMonto += Number(row.monto_cop || 0) || 0;
        agg.set(cedDigits, cur);
    }

    const qCol = await pool.query(
        `SELECT cedula, nombre, cliente, tarifa_cliente, moneda, profesion
         FROM colaboradores
         WHERE activo IS NOT FALSE
           AND lower(btrim(COALESCE(cliente, ''))) = lower(btrim($1::text))
         ORDER BY nombre ASC`,
        [clienteCanon]
    );

    let tarifaSum = 0;
    let deduccionSum = 0;
    let facturaSum = 0;
    const rows = [];
    for (const c of qCol.rows || []) {
        const cedDigits = normalizeCedula(String(c.cedula || ''));
        const tarifa = Number(c.tarifa_cliente || 0) || 0;
        const a = cedDigits ? agg.get(cedDigits) : null;
        const cnt = a?.count ?? 0;
        const sumMonto = a?.sumMonto ?? 0;
        const factura = tarifa - sumMonto;
        tarifaSum += tarifa;
        deduccionSum += sumMonto;
        facturaSum += factura;
        rows.push({
            cedula: String(c.cedula || '').trim(),
            nombre: String(c.nombre || '').trim(),
            cliente: String(c.cliente || '').trim(),
            tarifaCliente: tarifa,
            moneda: c.moneda != null ? String(c.moneda) : '',
            perfil: c.profesion != null ? String(c.profesion).trim() : '',
            novedadesCount: cnt,
            novedadesSumCop: sumMonto,
            facturaCop: factura
        });
    }

    return {
        rows,
        totales: {
            tarifaSum,
            deduccionSum,
            facturaSum,
            colaboradores: rows.length,
            conNovedad: rows.filter((r) => r.novedadesCount > 0).length
        }
    };
}

async function listConciliacionNovedadesDetalle(deps, scope, clienteCanon, cedulaRaw, year, month) {
    const { pool, normalizeCedula, canRoleViewType } = deps;
    const mr = monthRangeDates(year, month);
    if (!mr) return [];
    const cedDigits = normalizeCedula(cedulaRaw);
    if (!cedDigits) return [];

    const areaPart = novedadesAreaClause(scope);
    const params = [clienteCanon, mr.start, mr.end, cedDigits];
    let areaSql = areaPart.sql;
    if (areaPart.params.length) {
        params.push(areaPart.params[0]);
        areaSql = areaSql.replace('$IDX', `$${params.length}`);
    }

    const dateExpr = effectiveNovedadDateSql('nov');
    const q = await pool.query(
        `SELECT nov.id, nov.nombre, nov.cedula, nov.tipo_novedad, nov.monto_cop, nov.estado,
                nov.fecha, nov.fecha_inicio, nov.fecha_fin, nov.creado_en
         FROM novedades nov
         WHERE nov.estado = 'Aprobado'::novedad_estado
           AND lower(btrim(COALESCE(nov.cliente, ''))) = lower(btrim($1::text))
           AND ${dateExpr} >= $2::date
           AND ${dateExpr} <= $3::date
           AND regexp_replace(COALESCE(nov.cedula, ''), '\\D', '', 'g') = $4
           ${areaSql}
         ORDER BY nov.creado_en DESC`,
        params
    );

    const role = String(scope?.role || '');
    return (q.rows || []).filter((row) => canRoleViewType(role, row.tipo_novedad)).map((row) => ({
        id: row.id,
        nombre: String(row.nombre || '').trim(),
        cedula: String(row.cedula || '').trim(),
        tipoNovedad: String(row.tipo_novedad || '').trim(),
        montoCop: row.monto_cop != null ? Number(row.monto_cop) : null,
        estado: String(row.estado || ''),
        fecha: row.fecha ? row.fecha.toISOString().slice(0, 10) : null,
        fechaInicio: row.fecha_inicio ? row.fecha_inicio.toISOString().slice(0, 10) : null,
        fechaFin: row.fecha_fin ? row.fecha_fin.toISOString().slice(0, 10) : null,
        creadoEn: row.creado_en ? row.creado_en.toISOString() : null
    }));
}

/**
 * Resumen multi-cliente para el dashboard (un request por cliente; lista acotada por alcance).
 * @returns {Promise<{ rows: { cliente: string, totales: object }[], globalTotales: object, clientesCount: number }>}
 */
async function getConciliacionesDashboardResumen(deps, scope, year, month) {
    const clientes = await listConciliacionesClientes(deps, scope);
    const rows = [];
    for (const cliente of clientes) {
        const payload = await getConciliacionResumenPorClienteMes(deps, scope, cliente, year, month);
        rows.push({
            cliente,
            totales: payload.totales
        });
    }
    const globalTotales = rows.reduce(
        (acc, r) => ({
            tarifaSum: acc.tarifaSum + (Number(r.totales?.tarifaSum) || 0),
            deduccionSum: acc.deduccionSum + (Number(r.totales?.deduccionSum) || 0),
            facturaSum: acc.facturaSum + (Number(r.totales?.facturaSum) || 0),
            colaboradores: acc.colaboradores + (Number(r.totales?.colaboradores) || 0),
            conNovedad: acc.conNovedad + (Number(r.totales?.conNovedad) || 0)
        }),
        { tarifaSum: 0, deduccionSum: 0, facturaSum: 0, colaboradores: 0, conNovedad: 0 }
    );
    return { rows, globalTotales, clientesCount: clientes.length };
}

module.exports = {
    effectiveNovedadDateSql,
    monthRangeDates,
    resolveClienteCanon,
    listConciliacionesClientes,
    assertClienteConciliacionPermitido,
    getConciliacionResumenPorClienteMes,
    listConciliacionNovedadesDetalle,
    getConciliacionesDashboardResumen
};
