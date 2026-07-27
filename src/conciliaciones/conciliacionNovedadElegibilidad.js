'use strict';

const { resolveNovedadesBucket } = require('./facturacionAggregate');
const {
    isAdvanceMonthBilling,
    resolveAdvancePeriods,
    splitNovedadesByAdvanceScope
} = require('./conciliacionAdvanceMonth');

const NOVEDADES_ELEGIBLES_SELECT = `nov.id, nov.cedula, nov.tipo_novedad, nov.monto_cop, nov.cantidad_horas, nov.unidad,
                nov.modalidad, nov.hora_inicio, nov.hora_fin, nov.fecha_inicio, nov.fecha_fin, nov.aprobado_en`;

const ESTADOS_FACTURACION_CORTE = new Set(['APROBADO_ANALISTA', 'APROBADO_FINANZAS', 'CONCILIADA']);

/** Tras aprobación analista el cierre queda congelado: solo snapshot consumido. */
function isFacturacionEstadoConCorteNovedades(estado) {
    const e = String(estado || 'PENDIENTE').trim();
    return ESTADOS_FACTURACION_CORTE.has(e);
}

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
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const end = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { start, end };
}

/**
 * Novedades registradas manualmente desde conciliaciones (historial NOVEDAD_MANUAL).
 * Cubre altas con aprobado_en posterior al bucket cuando ya quedaron en historial.
 * @param {import('pg').Pool} pool
 * @param {{ clienteCanon: string, factAnio: number, factMes: number, cedulaRaw?: string }} opts
 * @returns {Promise<string[]>}
 */
async function listNovedadIdsFromConciliacionManualHistorial(pool, opts) {
    const factY = Number(opts.factAnio);
    const factM = Number(opts.factMes);
    if (!Number.isFinite(factY) || !Number.isFinite(factM) || factM < 1 || factM > 12) return [];

    const params = [factY, factM, opts.clienteCanon];
    let cedulaSql = '';
    const cedDigits = opts.cedulaRaw != null ? String(opts.cedulaRaw).replace(/\D/g, '') : '';
    if (cedDigits) {
        params.push(cedDigits);
        cedulaSql = ` AND regexp_replace(COALESCE(h.cedula, ''), '\\D', '', 'g') = $${params.length}`;
    }

    const q = await pool.query(
        `SELECT DISTINCT (h.detalle->>'novedadId')::uuid AS novedad_id
         FROM conciliaciones_facturacion_historial h
         INNER JOIN novedades nov ON nov.id = (h.detalle->>'novedadId')::uuid
         WHERE h.accion = 'NOVEDAD_MANUAL'
           AND h.anio = $1::integer
           AND h.mes = $2::integer
           AND h.detalle->>'novedadId' IS NOT NULL
           AND lower(btrim(COALESCE(nov.cliente, ''))) = lower(btrim($3::text))
           AND nov.estado = 'Aprobado'::novedad_estado
           AND NOT EXISTS (
               SELECT 1 FROM conciliaciones_novedad_consumo cnc WHERE cnc.novedad_id = nov.id
           )
         ${cedulaSql}`,
        params
    );
    return (q.rows || []).map((r) => String(r.novedad_id)).filter(Boolean);
}

/**
 * @param {object} deps
 * @param {object} scope
 * @param {{ clienteCanon: string, cedulaRaw?: string, factAnio: number, factMes: number }} opts
 * @param {Map<string, object>} byId
 */
async function appendConciliacionManualNovedadesFromHistorial(deps, scope, opts, byId) {
    const { pool, normalizeCedula, canRoleViewType } = deps;
    const manualIds = await listNovedadIdsFromConciliacionManualHistorial(pool, {
        clienteCanon: opts.clienteCanon,
        factAnio: opts.factAnio,
        factMes: opts.factMes,
        cedulaRaw: opts.cedulaRaw
    });
    const missingIds = manualIds.filter((id) => !byId.has(String(id)));
    if (!missingIds.length) return;

    const q = await pool.query(
        `SELECT ${NOVEDADES_ELEGIBLES_SELECT}
         FROM novedades nov
         WHERE nov.id = ANY($1::uuid[])`,
        [missingIds]
    );

    const role = String(scope?.role || '');
    for (const row of q.rows || []) {
        if (!canRoleViewType(role, row.tipo_novedad)) continue;
        const ced = normalizeCedula(String(row.cedula || ''));
        if (opts.cedulaRaw != null && ced !== normalizeCedula(opts.cedulaRaw)) continue;
        byId.set(String(row.id), row);
    }
}

function novedadesAreaClause(scope) {
    const role = String(scope?.role || '');
    if (role === 'gp') return { sql: '', params: [] };
    // Roles amplios: sin areas en scope no deben anular todas las novedades (AND FALSE).
    if (
        role === 'super_admin' ||
        role === 'cac' ||
        role === 'analista_conciliaciones' ||
        role === 'nomina' ||
        role === 'admin_ch' ||
        role === 'admin_ops'
    ) {
        return { sql: '', params: [] };
    }
    if (scope?.canViewAllAreas) return { sql: '', params: [] };
    const areas = Array.isArray(scope?.areas) ? scope.areas.filter(Boolean) : [];
    if (!areas.length) return { sql: ' AND FALSE ', params: [] };
    return { sql: ' AND (nov.area IS NULL OR nov.area::text = ANY($IDX::text[])) ', params: [areas] };
}

/**
 * @param {object} row
 * @param {{ novStart: string, novEnd: string, factStart: string, factEnd: string }} ranges
 */
function isNovedadElegibleParaCierreRow(row, ranges) {
    const effectiveDate = row.fecha_inicio || row.fecha || row.creado_en;
    const eff =
        effectiveDate instanceof Date
            ? effectiveDate.toISOString().slice(0, 10)
            : String(effectiveDate || '').slice(0, 10);
    const aprobado = row.aprobado_en;
    const aprobadoStr =
        aprobado instanceof Date ? aprobado.toISOString().slice(0, 10) : aprobado ? String(aprobado).slice(0, 10) : '';

    const { novStart, novEnd, factStart, factEnd } = ranges;
    const ruleA = eff >= novStart && eff <= novEnd && (!aprobadoStr || aprobadoStr <= novEnd);
    // Tardía: fecha efectiva anterior al bucket, aprobada en el mes de facturación.
    const ruleB =
        eff &&
        eff < novStart &&
        aprobadoStr &&
        aprobadoStr >= factStart &&
        aprobadoStr <= factEnd;
    return ruleA || ruleB;
}

/**
 * SQL WHERE fragment: novedad elegible para cierre (sin filtro cédula).
 * Params: $1 cliente, $2 novStart, $3 novEnd, $4 factStart, $5 factEnd
 * @param {string} novAlias
 */
function novedadElegibleWhereSql(novAlias = 'nov') {
    const dateExpr = effectiveNovedadDateSql(novAlias);
    const aprobadoDateExpr = `(${novAlias}.aprobado_en AT TIME ZONE 'America/Bogota')::date`;
    return `
        ${novAlias}.estado = 'Aprobado'::novedad_estado
        AND lower(btrim(COALESCE(${novAlias}.cliente, ''))) = lower(btrim($1::text))
        AND NOT EXISTS (
            SELECT 1 FROM conciliaciones_novedad_consumo cnc
            WHERE cnc.novedad_id = ${novAlias}.id
        )
        AND (
            (${dateExpr} >= $2::date AND ${dateExpr} <= $3::date
                AND (${novAlias}.aprobado_en IS NULL OR ${aprobadoDateExpr} <= $3::date))
            OR (${dateExpr} < $2::date
                AND ${novAlias}.aprobado_en IS NOT NULL
                AND ${aprobadoDateExpr} >= $4::date
                AND ${aprobadoDateExpr} <= $5::date)
        )`;
}

/**
 * Novedades del mes anterior (ajuste anticipo) para ADVANCE_MONTH.
 * Params: $1 cliente, $2 adjStart, $3 adjEnd
 */
function novedadAjusteAnticipoWhereSql(novAlias = 'nov') {
    const dateExpr = effectiveNovedadDateSql(novAlias);
    return `
        ${novAlias}.estado = 'Aprobado'::novedad_estado
        AND lower(btrim(COALESCE(${novAlias}.cliente, ''))) = lower(btrim($1::text))
        AND ${novAlias}.aprobado_en IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM conciliaciones_novedad_consumo cnc
            WHERE cnc.novedad_id = ${novAlias}.id
        )
        AND ${dateExpr} >= $2::date
        AND ${dateExpr} <= $3::date`;
}

/**
 * @param {object} deps
 * @param {object} scope
 * @param {{ clienteCanon: string, cedulaRaw?: string, factAnio: number, factMes: number, billingType?: string, novedadesYear?: number, novedadesMonth?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listNovedadesElegiblesParaCierre(deps, scope, opts) {
    const { pool, normalizeCedula, canRoleViewType } = deps;
    const factY = Number(opts.factAnio);
    const factM = Number(opts.factMes);
    const novBucket =
        opts.novedadesYear != null && opts.novedadesMonth != null
            ? { year: Number(opts.novedadesYear), month: Number(opts.novedadesMonth) }
            : resolveNovedadesBucket(factY, factM, opts.billingType);

    const mrNov = monthRangeDates(novBucket.year, novBucket.month);
    const mrFact = monthRangeDates(factY, factM);
    if (!mrNov || !mrFact) return [];

    const advanceBilling = isAdvanceMonthBilling(opts.billingType);
    const areaPart = novedadesAreaClause(scope);
    const params = [opts.clienteCanon, mrNov.start, mrNov.end, mrFact.start, mrFact.end];
    let areaSql = areaPart.sql;
    if (areaPart.params.length) {
        params.push(areaPart.params[0]);
        areaSql = areaSql.replace('$IDX', `$${params.length}`);
    }

    let cedulaSql = '';
    const cedDigits = opts.cedulaRaw != null ? normalizeCedula(opts.cedulaRaw) : '';
    if (cedDigits) {
        params.push(cedDigits);
        cedulaSql = ` AND regexp_replace(COALESCE(nov.cedula, ''), '\\D', '', 'g') = $${params.length}`;
    }

    const q = await pool.query(
        `SELECT ${NOVEDADES_ELEGIBLES_SELECT}
         FROM novedades nov
         WHERE ${novedadElegibleWhereSql('nov')}
         ${cedulaSql}
         ${areaSql}`,
        params
    );

    const role = String(scope?.role || '');
    const ranges = { novStart: mrNov.start, novEnd: mrNov.end, factStart: mrFact.start, factEnd: mrFact.end };
    /** @type {Map<string, object>} */
    const byId = new Map();
    for (const row of q.rows || []) {
        if (!isNovedadElegibleParaCierreRow(row, ranges)) continue;
        if (!canRoleViewType(role, row.tipo_novedad)) continue;
        const key = row.id ? String(row.id) : `${row.cedula}-${row.fecha_inicio}-${row.tipo_novedad}-${byId.size}`;
        byId.set(key, row);
    }

    if (isAdvanceMonthBilling(opts.billingType)) {
        const periods = resolveAdvancePeriods(factY, factM);
        const mrAdj = periods ? monthRangeDates(periods.adjustment.year, periods.adjustment.month) : null;
        if (mrAdj) {
            const adjParams = [opts.clienteCanon, mrAdj.start, mrAdj.end];
            let adjAreaSql = areaPart.sql;
            if (areaPart.params.length) {
                adjParams.push(areaPart.params[0]);
                adjAreaSql = adjAreaSql.replace('$IDX', `$${adjParams.length}`);
            }
            let adjCedulaSql = '';
            if (cedDigits) {
                adjParams.push(cedDigits);
                adjCedulaSql = ` AND regexp_replace(COALESCE(nov.cedula, ''), '\\D', '', 'g') = $${adjParams.length}`;
            }
            const qAdj = await pool.query(
                `SELECT ${NOVEDADES_ELEGIBLES_SELECT}
                 FROM novedades nov
                 WHERE ${novedadAjusteAnticipoWhereSql('nov')}
                 ${adjCedulaSql}
                 ${adjAreaSql}`,
                adjParams
            );
            for (const row of qAdj.rows || []) {
                if (!canRoleViewType(role, row.tipo_novedad)) continue;
                const key = row.id ? String(row.id) : `${row.cedula}-${row.fecha_inicio}-${row.tipo_novedad}-adj`;
                if (!byId.has(key)) byId.set(key, row);
            }
        }
    }

    await appendConciliacionManualNovedadesFromHistorial(deps, scope, opts, byId);

    return Array.from(byId.values());
}

/**
 * Novedades ya consumidas en un cierre (siguen visibles en resumen/detalle tras aprobar analista).
 * @param {object} deps
 * @param {object} scope
 * @param {{ clienteCanon: string, cedulaRaw?: string, factAnio: number, factMes: number }} opts
 * @returns {Promise<object[]>}
 */
async function listNovedadesConsumidasParaCierre(deps, scope, opts) {
    const { pool, normalizeCedula, canRoleViewType } = deps;
    const factY = Number(opts.factAnio);
    const factM = Number(opts.factMes);
    if (!Number.isFinite(factY) || !Number.isFinite(factM) || factM < 1 || factM > 12) return [];

    const areaPart = novedadesAreaClause(scope);
    const params = [opts.clienteCanon, factY, factM];
    let areaSql = areaPart.sql;
    if (areaPart.params.length) {
        params.push(areaPart.params[0]);
        areaSql = areaSql.replace('$IDX', `$${params.length}`);
    }

    let cedulaSql = '';
    const cedDigits = opts.cedulaRaw != null ? normalizeCedula(opts.cedulaRaw) : '';
    if (cedDigits) {
        params.push(cedDigits);
        cedulaSql = ` AND regexp_replace(COALESCE(cnc.cedula, ''), '\\D', '', 'g') = $${params.length}`;
    }

    const q = await pool.query(
        `SELECT ${NOVEDADES_ELEGIBLES_SELECT}
         FROM conciliaciones_novedad_consumo cnc
         INNER JOIN novedades nov ON nov.id = cnc.novedad_id
         WHERE cnc.anio = $2::integer
           AND cnc.mes = $3::integer
           AND lower(btrim(COALESCE(nov.cliente, ''))) = lower(btrim($1::text))
         ${cedulaSql}
         ${areaSql}`,
        params
    );

    const role = String(scope?.role || '');
    return (q.rows || []).filter((row) => canRoleViewType(role, row.tipo_novedad));
}

/**
 * Novedades ya consumidas cuya fecha efectiva cae en el bucket de novedades del mes de facturación.
 * Cubre mes vencido: vacaciones de junio consumidas al cerrar junio deben verse al facturar julio.
 */
async function listNovedadesConsumidasEnBucketNov(deps, scope, opts) {
    const { pool, normalizeCedula, canRoleViewType } = deps;
    const novBucket =
        opts.novedadesYear != null && opts.novedadesMonth != null
            ? { year: Number(opts.novedadesYear), month: Number(opts.novedadesMonth) }
            : resolveNovedadesBucket(opts.factAnio, opts.factMes, opts.billingType);
    const mrNov = monthRangeDates(novBucket.year, novBucket.month);
    if (!mrNov) return [];

    const areaPart = novedadesAreaClause(scope);
    const params = [opts.clienteCanon, mrNov.start, mrNov.end];
    let areaSql = areaPart.sql;
    if (areaPart.params.length) {
        params.push(areaPart.params[0]);
        areaSql = areaSql.replace('$IDX', `$${params.length}`);
    }

    let cedulaSql = '';
    const cedDigits = opts.cedulaRaw != null ? normalizeCedula(opts.cedulaRaw) : '';
    if (cedDigits) {
        params.push(cedDigits);
        cedulaSql = ` AND regexp_replace(COALESCE(cnc.cedula, ''), '\\D', '', 'g') = $${params.length}`;
    }

    const dateExpr = effectiveNovedadDateSql('nov');
    const q = await pool.query(
        `SELECT ${NOVEDADES_ELEGIBLES_SELECT}
         FROM conciliaciones_novedad_consumo cnc
         INNER JOIN novedades nov ON nov.id = cnc.novedad_id
         WHERE lower(btrim(COALESCE(nov.cliente, ''))) = lower(btrim($1::text))
           AND ${dateExpr} >= $2::date
           AND ${dateExpr} <= $3::date
         ${cedulaSql}
         ${areaSql}`,
        params
    );

    const role = String(scope?.role || '');
    return (q.rows || []).filter((row) => canRoleViewType(role, row.tipo_novedad));
}

function mergeNovedadRowsUnique(...lists) {
    const byId = new Map();
    for (const list of lists) {
        for (const row of list || []) {
            if (row?.id) byId.set(String(row.id), row);
        }
    }
    return [...byId.values()];
}

function resolveNovedadesRowsParaColaborador(estadoFact, elegiblesCol, consumidasCol, bucketConsumidasCol) {
    if (isFacturacionEstadoConCorteNovedades(estadoFact)) {
        if (consumidasCol.length) return consumidasCol;
        if (bucketConsumidasCol.length) return bucketConsumidasCol;
        return elegiblesCol;
    }
    return mergeNovedadRowsUnique(elegiblesCol, bucketConsumidasCol);
}

/** @param {object[]} rows @param {(v: string) => string} normalizeCedula */
function groupNovedadRowsByCedula(rows, normalizeCedula) {
    /** @type {Map<string, object[]>} */
    const map = new Map();
    for (const row of rows || []) {
        const ced = normalizeCedula(String(row.cedula || ''));
        if (!ced) continue;
        const cur = map.get(ced) || [];
        cur.push(row);
        map.set(ced, cur);
    }
    return map;
}

/**
 * Elegibles (vivo) o consumidas (snapshot) según estado del cierre.
 * Si el cierre ya fue aprobado pero no hay consumo persistido, se muestran elegibles
 * (p. ej. aprobación directa a finanzas o bucket de novedades distinto al aprobar).
 * @param {object} deps
 * @param {object} scope
 * @param {object} opts
 * @param {string} [estadoFacturacion]
 */
async function listNovedadesForFacturacionByEstado(deps, scope, opts, estadoFacturacion) {
    const bucketOpts = {
        ...opts,
        novedadesYear: opts.novedadesYear,
        novedadesMonth: opts.novedadesMonth
    };
    const [elegibles, consumidasMes, bucketConsumidas] = await Promise.all([
        listNovedadesElegiblesParaCierre(deps, scope, opts),
        listNovedadesConsumidasParaCierre(deps, scope, opts),
        listNovedadesConsumidasEnBucketNov(deps, scope, bucketOpts)
    ]);
    return resolveNovedadesRowsParaColaborador(
        estadoFacturacion,
        elegibles,
        consumidasMes,
        bucketConsumidas
    );
}

/**
 * @param {import('pg').PoolClient} client
 * @param {object} deps
 * @param {object} scope
 * @param {{ facturacionId: string, cedula: string, anio: number, mes: number, servicioId?: string, clienteCanon: string, billingType?: string, novedadesYear?: number, novedadesMonth?: number, actorUserId?: string|null }} opts
 */
async function consumirNovedadesParaCierreAnalista(client, deps, scope, opts) {
    const rows = await listNovedadesElegiblesParaCierre(deps, scope, {
        clienteCanon: opts.clienteCanon,
        cedulaRaw: opts.cedula,
        factAnio: opts.anio,
        factMes: opts.mes,
        billingType: opts.billingType,
        novedadesYear: opts.novedadesYear,
        novedadesMonth: opts.novedadesMonth
    });

    let toConsume = rows;
    if (isAdvanceMonthBilling(opts.billingType)) {
        const periods = resolveAdvancePeriods(opts.anio, opts.mes);
        if (!periods) return [];
        const { adjustmentRows } = splitNovedadesByAdvanceScope(rows, periods);
        if (!adjustmentRows.length) return [];
        toConsume = adjustmentRows;
    }

    const novedadIds = [];
    for (const row of toConsume) {
        if (!row.id) continue;
        await client.query(
            `INSERT INTO conciliaciones_novedad_consumo
                (novedad_id, facturacion_id, cedula, anio, mes, servicio_id, consumido_por_user_id)
             VALUES ($1::uuid, $2::uuid, $3, $4::integer, $5::integer, $6, $7::uuid)
             ON CONFLICT (novedad_id) DO NOTHING`,
            [
                row.id,
                opts.facturacionId,
                opts.cedula,
                opts.anio,
                opts.mes,
                opts.servicioId ? String(opts.servicioId) : null,
                opts.actorUserId || null
            ]
        );
        novedadIds.push(String(row.id));
    }
    return novedadIds;
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} facturacionId
 */
async function liberarNovedadesConsumidas(client, facturacionId) {
    await client.query(`DELETE FROM conciliaciones_novedad_consumo WHERE facturacion_id = $1::uuid`, [facturacionId]);
}

module.exports = {
    NOVEDADES_ELEGIBLES_SELECT,
    effectiveNovedadDateSql,
    monthRangeDates,
    isNovedadElegibleParaCierreRow,
    novedadElegibleWhereSql,
    novedadAjusteAnticipoWhereSql,
    isFacturacionEstadoConCorteNovedades,
    listNovedadIdsFromConciliacionManualHistorial,
    appendConciliacionManualNovedadesFromHistorial,
    listNovedadesElegiblesParaCierre,
    listNovedadesConsumidasParaCierre,
    listNovedadesConsumidasEnBucketNov,
    mergeNovedadRowsUnique,
    resolveNovedadesRowsParaColaborador,
    groupNovedadRowsByCedula,
    listNovedadesForFacturacionByEstado,
    consumirNovedadesParaCierreAnalista,
    liberarNovedadesConsumidas
};
