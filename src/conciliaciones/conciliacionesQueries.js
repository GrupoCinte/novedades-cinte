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
        `SELECT 
            c.cedula, 
            c.nombre, 
            c.cliente, 
            c.profesion, 
            c.fecha_ingreso, 
            c.tipo_contrato, 
            c.comercial, 
            c.sueldo_nomina, 
            c.tarifa_cliente, 
            c.moneda, 
            c.codigo, 
            c.honorarios,
            c.cliente_proyecto,
            c.modalidad_contrato AS tipo_servicio,
            (SELECT COALESCE(MAX(nit), '') FROM clientes_lideres cl WHERE cl.activo = TRUE AND lower(btrim(cl.cliente)) = lower(btrim(c.cliente))) AS nit,
            f.id AS facturacion_id,
            f.proyecto,
            f.observaciones,
            f.fecha_cierre,
            f.horas_facturadas,
            f.estado,
            f.factura_fv,
            f.fecha_radicacion,
            f.motivo_devolucion,
            CASE WHEN f.id IS NOT NULL THEN TRUE ELSE FALSE END AS cerrado
         FROM colaboradores c
         LEFT JOIN conciliaciones_facturacion f ON f.cedula = c.cedula AND f.anio = $2::integer AND f.mes = $3::integer
         WHERE c.activo IS NOT FALSE
           AND lower(btrim(COALESCE(c.cliente, ''))) = lower(btrim($1::text))
         ORDER BY c.nombre ASC`,
        [clienteCanon, Number(year), Number(month)]
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
        
        const fIngreso = c.fecha_ingreso ? (c.fecha_ingreso instanceof Date ? c.fecha_ingreso.toISOString().slice(0, 10) : String(c.fecha_ingreso).slice(0, 10)) : '';
        const fCierre = c.fecha_cierre ? (c.fecha_cierre instanceof Date ? c.fecha_cierre.toISOString().slice(0, 10) : String(c.fecha_cierre).slice(0, 10)) : '';

        rows.push({
            cedula: String(c.cedula || '').trim(),
            nombre: String(c.nombre || '').trim(),
            cliente: String(c.cliente || '').trim(),
            tarifaCliente: tarifa,
            moneda: c.moneda != null ? String(c.moneda) : '',
            perfil: c.profesion != null ? String(c.profesion).trim() : '',
            novedadesCount: cnt,
            novedadesSumCop: sumMonto,
            facturaCop: factura,
            fechaIngreso: fIngreso,
            tipoContrato: c.tipo_contrato != null ? String(c.tipo_contrato) : '',
            comercial: c.comercial != null ? String(c.comercial) : '',
            sueldoNomina: c.sueldo_nomina != null ? Number(c.sueldo_nomina) : 0,
            codigo: c.codigo != null ? String(c.codigo) : '',
            honorarios: c.honorarios != null ? String(c.honorarios) : '',
            clienteProyecto: c.cliente_proyecto != null ? String(c.cliente_proyecto) : '',
            tipoServicio: c.tipo_servicio != null ? String(c.tipo_servicio) : '',
            nit: c.nit != null ? String(c.nit) : '',
            facturacionId: c.facturacion_id || null,
            proyecto: c.proyecto != null ? String(c.proyecto) : (c.cliente_proyecto != null ? String(c.cliente_proyecto) : ''),
            observaciones: c.observaciones != null ? String(c.observaciones) : '',
            fechaCierre: fCierre,
            horasFacturadas: c.horas_facturadas != null ? Number(c.horas_facturadas) : 0,
            estado: c.estado != null ? String(c.estado) : 'PENDIENTE',
            facturaFv: c.factura_fv != null ? String(c.factura_fv) : '',
            fechaRadicacion: c.fecha_radicacion ? (c.fecha_radicacion instanceof Date ? c.fecha_radicacion.toISOString().slice(0, 10) : String(c.fecha_radicacion).slice(0, 10)) : '',
            motivoDevolucion: c.motivo_devolucion != null ? String(c.motivo_devolucion) : '',
            cerrado: Boolean(c.cerrado)
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

/**
 * Resumen de facturación del mes para todos los clientes del alcance (vista «Todos / seleccionar»).
 * @returns {Promise<{ rows: object[], totales: object, clientesCount: number }>}
 */
async function getConciliacionResumenTodosClientesMes(deps, scope, year, month) {
    const clientes = await listConciliacionesClientes(deps, scope);
    if (!clientes.length) {
        return {
            rows: [],
            totales: { tarifaSum: 0, deduccionSum: 0, facturaSum: 0, colaboradores: 0, conNovedad: 0 },
            clientesCount: 0
        };
    }

    const allRows = [];
    let tarifaSum = 0;
    let deduccionSum = 0;
    let facturaSum = 0;
    let conNovedad = 0;

    for (const clienteCanon of clientes) {
        const payload = await getConciliacionResumenPorClienteMes(deps, scope, clienteCanon, year, month);
        for (const row of payload.rows || []) {
            allRows.push({
                ...row,
                cliente: String(row.cliente || clienteCanon).trim()
            });
        }
        tarifaSum += Number(payload.totales?.tarifaSum) || 0;
        deduccionSum += Number(payload.totales?.deduccionSum) || 0;
        facturaSum += Number(payload.totales?.facturaSum) || 0;
        conNovedad += Number(payload.totales?.conNovedad) || 0;
    }

    allRows.sort((a, b) => {
        const byName = String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
        if (byName !== 0) return byName;
        return String(a.cliente || '').localeCompare(String(b.cliente || ''), 'es', { sensitivity: 'base' });
    });

    return {
        rows: allRows,
        totales: {
            tarifaSum,
            deduccionSum,
            facturaSum,
            colaboradores: allRows.length,
            conNovedad
        },
        clientesCount: clientes.length
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
                nov.fecha, nov.fecha_inicio, nov.fecha_fin, nov.creado_en,
                COALESCE(ua.full_name, nov.aprobado_por_email, 'Aprobador CINTE') AS aprobador
         FROM novedades nov
         LEFT JOIN users ua ON nov.aprobado_por_user_id = ua.id
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
        creadoEn: row.creado_en ? row.creado_en.toISOString() : null,
        aprobador: String(row.aprobador || 'Aprobador CINTE').trim()
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

async function upsertConciliacionFacturacion(deps, scope, payload) {
    const { pool, normalizeCedula } = deps;
    const { cedula, anio, mes, proyecto, observaciones, horasFacturadas, estado, facturaFv, fechaRadicacion, motivoDevolucion } = payload;
    const ced = normalizeCedula(cedula);
    if (!ced) {
        const error = new Error('Cédula inválida');
        error.status = 400;
        throw error;
    }

    const y = Number(anio);
    const m = Number(mes);
    if (!Number.isFinite(y) || y < 2000 || y > 2100) {
        const error = new Error('Año inválido');
        error.status = 400;
        throw error;
    }
    if (!Number.isFinite(m) || m < 1 || m > 12) {
        const error = new Error('Mes inválido');
        error.status = 400;
        throw error;
    }

    const prj = proyecto !== undefined ? (proyecto === null ? null : String(proyecto).trim()) : null;
    const obs = observaciones !== undefined ? (observaciones === null ? null : String(observaciones).trim()) : null;
    const hrs = horasFacturadas !== undefined ? Number(horasFacturadas) || 0 : 0;
    const est = estado !== undefined ? String(estado).trim() : 'PENDIENTE';
    const fv = facturaFv !== undefined ? (facturaFv === null ? null : String(facturaFv).trim()) : null;
    const fRad = fechaRadicacion !== undefined ? (fechaRadicacion === null ? null : String(fechaRadicacion).trim()) : null;
    const mot = motivoDevolucion !== undefined ? (motivoDevolucion === null ? null : String(motivoDevolucion).trim()) : null;

    const colQ = await pool.query('SELECT cliente FROM colaboradores WHERE cedula = $1 LIMIT 1', [ced]);
    if (!colQ.rows[0]) {
        const error = new Error('Colaborador no encontrado');
        error.status = 404;
        throw error;
    }
    const colCliente = colQ.rows[0].cliente;
    const chk = await assertClienteConciliacionPermitido(deps, scope, colCliente);
    if (!chk.ok) {
        const error = new Error(chk.error || 'No autorizado');
        error.status = chk.status || 403;
        throw error;
    }

    const q = await pool.query(
        `INSERT INTO conciliaciones_facturacion (cedula, anio, mes, proyecto, observaciones, horas_facturadas, estado, factura_fv, fecha_radicacion, motivo_devolucion, fecha_cierre, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, CURRENT_DATE, NOW())
         ON CONFLICT (cedula, anio, mes)
         DO UPDATE SET 
            proyecto = EXCLUDED.proyecto, 
            observaciones = EXCLUDED.observaciones, 
            horas_facturadas = EXCLUDED.horas_facturadas,
            estado = EXCLUDED.estado,
            factura_fv = EXCLUDED.factura_fv,
            fecha_radicacion = EXCLUDED.fecha_radicacion,
            motivo_devolucion = EXCLUDED.motivo_devolucion,
            fecha_cierre = CURRENT_DATE,
            updated_at = NOW()
         RETURNING id, cedula, anio, mes, proyecto, observaciones, horas_facturadas, estado, factura_fv, fecha_radicacion, motivo_devolucion, fecha_cierre, created_at, updated_at`,
        [ced, y, m, prj, obs, hrs, est, fv, fRad, mot]
    );

    return q.rows[0];
}

async function listConciliacionesFacturacion(deps, scope, year, month) {
    const { pool } = deps;
    const y = Number(year);
    const m = Number(month);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return [];

    const allowedClients = await listConciliacionesClientes(deps, scope);
    if (!allowedClients.length) return [];

    const q = await pool.query(
        `SELECT f.id, f.cedula, c.nombre, c.cliente, f.anio, f.mes, f.proyecto, f.observaciones, f.fecha_cierre, f.horas_facturadas, f.estado, f.factura_fv, f.fecha_radicacion, f.motivo_devolucion
         FROM conciliaciones_facturacion f
         JOIN colaboradores c ON f.cedula = c.cedula
         WHERE f.anio = $1::integer AND f.mes = $2::integer
           AND lower(btrim(COALESCE(c.cliente, ''))) = ANY($3::text[])
         ORDER BY c.nombre ASC`,
        [y, m, allowedClients.map(cl => String(cl).toLowerCase())]
    );

    return q.rows.map(row => ({
        id: row.id,
        cedula: String(row.cedula || '').trim(),
        nombre: String(row.nombre || '').trim(),
        cliente: String(row.cliente || '').trim(),
        anio: row.anio,
        mes: row.mes,
        proyecto: row.proyecto || '',
        observaciones: row.observaciones || '',
        fechaCierre: row.fecha_cierre ? row.fecha_cierre.toISOString().slice(0, 10) : '',
        horasFacturadas: Number(row.horas_facturadas || 0),
        estado: row.estado || 'PENDIENTE',
        facturaFv: row.factura_fv || '',
        fechaRadicacion: row.fecha_radicacion ? row.fecha_radicacion.toISOString().slice(0, 10) : '',
        motivoDevolucion: row.motivo_devolucion || ''
    }));
}

async function upsertConciliacionFacturacionMasiva(deps, scope, payload) {
    const { pool } = deps;
    const { cliente, anio, mes, estado, facturaFv, fechaRadicacion, motivoDevolucion, cedulas: cedulasPayload } = payload;
    
    const chk = await assertClienteConciliacionPermitido(deps, scope, cliente);
    if (!chk.ok) {
        const error = new Error(chk.error || 'No autorizado');
        error.status = chk.status || 403;
        throw error;
    }

    const y = Number(anio);
    const m = Number(mes);
    if (!Number.isFinite(y) || y < 2000 || y > 2100) {
        const error = new Error('Año inválido');
        error.status = 400;
        throw error;
    }
    if (!Number.isFinite(m) || m < 1 || m > 12) {
        const error = new Error('Mes inválido');
        error.status = 400;
        throw error;
    }

    const est = estado !== undefined ? String(estado).trim() : 'PENDIENTE';
    const fv = facturaFv !== undefined ? (facturaFv === null ? null : String(facturaFv).trim()) : null;
    const fRad = fechaRadicacion !== undefined ? (fechaRadicacion === null ? null : String(fechaRadicacion).trim()) : null;
    const mot = motivoDevolucion !== undefined ? (motivoDevolucion === null ? null : String(motivoDevolucion).trim()) : null;

    // Obtener todas las cédulas de este cliente
    const colQ = await pool.query(
        `SELECT cedula FROM colaboradores WHERE activo IS NOT FALSE AND lower(btrim(COALESCE(cliente, ''))) = lower(btrim($1::text))`,
        [chk.canon]
    );

    const allCedulas = colQ.rows.map((r) => String(r.cedula || '').trim()).filter(Boolean);
    let cedulas = allCedulas;
    if (Array.isArray(cedulasPayload) && cedulasPayload.length > 0) {
        const allowed = new Set(allCedulas);
        cedulas = cedulasPayload.map((c) => String(c || '').trim()).filter((c) => allowed.has(c));
    }
    if (cedulas.length === 0) return { updated: 0 };

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        for (const ced of cedulas) {
            await client.query(
                `INSERT INTO conciliaciones_facturacion (cedula, anio, mes, estado, factura_fv, fecha_radicacion, motivo_devolucion, fecha_cierre, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6::date, $7, CURRENT_DATE, NOW())
                 ON CONFLICT (cedula, anio, mes)
                 DO UPDATE SET 
                    estado = EXCLUDED.estado,
                    factura_fv = EXCLUDED.factura_fv,
                    fecha_radicacion = EXCLUDED.fecha_radicacion,
                    motivo_devolucion = EXCLUDED.motivo_devolucion,
                    fecha_cierre = CURRENT_DATE,
                    updated_at = NOW()`,
                [ced, y, m, est, fv, fRad, mot]
            );
        }
        
        await client.query('COMMIT');
        return { updated: cedulas.length };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    effectiveNovedadDateSql,
    monthRangeDates,
    resolveClienteCanon,
    listConciliacionesClientes,
    assertClienteConciliacionPermitido,
    getConciliacionResumenPorClienteMes,
    getConciliacionResumenTodosClientesMes,
    listConciliacionNovedadesDetalle,
    getConciliacionesDashboardResumen,
    upsertConciliacionFacturacion,
    upsertConciliacionFacturacionMasiva,
    listConciliacionesFacturacion
};
