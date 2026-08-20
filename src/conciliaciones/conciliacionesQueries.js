/**
 * Consultas del módulo Conciliaciones (facturación vs novedades aprobadas por cliente/mes).
 * Fecha efectiva de novedad para el bucket mensual (Bogotá):
 * COALESCE(fecha_inicio::date, fecha::date, (creado_en AT TIME ZONE 'America/Bogota')::date)
 */

const { resolveClienteOnWrite, clienteMatchKey, sameClienteLabel } = require('../clientes/clienteCanonWrite');
const {
    aggregateServicioCierre,
    mergeConciliacionServicioRows,
    filterRowsByServicioLideres,
    aggregateConciliacionRows,
    deriveEstadoCola,
    sortColaCierresItems,
    resolveNovedadesBucket,
    aggregateDashboardFromColaItems
} = require('./facturacionAggregate');
const {
    validateRevisionRequest,
    validateRevisionRequestMasiva,
    canBypassEstadoChange,
    normalizeEstado,
    normalizeEtapaObjetivo
} = require('./facturacionRevision');
const {
    computeNovedadImpactoMonto,
    aggregateNovedadesImpacto,
    buildHorasBillingContext
} = require('./conciliacionNovedadImpacto');
const {
    parseAjustesFromFacturacionRow,
    resolveNovedadMontoConAjuste,
    aggregateNovedadesImpactoConAjustes,
    canEditConciliacionAjustes,
    buildAjusteHistorialObservacion
} = require('./conciliacionAjustes');
const { resolveDiasBaseMes } = require('./conciliacionDiasBaseMes');
const {
    resolveTarifaBaseMes,
    colaboradorVisibleEnMesSql,
    isoDate
} = require('./conciliacionTarifaProrrateo');
const { fetchTarifaHistorialTramosMes, fetchTarifaHistorialTramosMesBatch } = require('./conciliacionTarifaHistorial');
const { fetchTarifasAsignacionBatch } = require('./colaboradorAsignaciones');
const {
    isFacturacionEstadoConCorteNovedades,
    listNovedadesElegiblesParaCierre,
    listNovedadesConsumidasParaCierre,
    listNovedadesConsumidasEnBucketNov,
    groupNovedadRowsByCedula,
    resolveNovedadesRowsParaColaborador,
    listNovedadesForFacturacionByEstado,
    consumirNovedadesParaCierreAnalista,
    liberarNovedadesConsumidas
} = require('./conciliacionNovedadElegibilidad');
const {
    isAdvanceMonthBilling,
    aggregateAdvanceFactura,
    classifyNovedadAdvanceScope,
    resolveAdvancePeriods,
    emptyAdvanceFields
} = require('./conciliacionAdvanceMonth');
const {
    ensureListoExportIfCompleto,
    getServicioCierreRow,
    mapServicioCierreToApi,
    markServicioConciliada
} = require('./conciliacionServicioCierre');
const { getLatestViewTokenMeta } = require('./conciliacionEmailAccion');
const { isWideConciliacionRole, canRevertConciliacionCierre } = require('./conciliacionRbac');

const NOVEDADES_IMPACTO_SELECT = `nov.id, nov.cedula, nov.tipo_novedad, nov.monto_cop, nov.cantidad_horas, nov.unidad,
                nov.modalidad, nov.hora_inicio, nov.hora_fin, nov.fecha_inicio, nov.fecha_fin, nov.creado_en`;

/** @param {string} alias */
function effectiveNovedadDateSql(alias = 'nov') {
    return `COALESCE(${alias}.fecha_inicio::date, ${alias}.fecha::date, (${alias}.creado_en AT TIME ZONE 'America/Bogota')::date)`;
}

/** Puesto/cargo del consultor (no confundir con profesion académica). */
function resolvePuestoColaborador(row) {
    for (const key of ['puesto', 'perfil_cargo', 'descriptivo_puesto_sig']) {
        const s = String(row?.[key] ?? '').trim();
        if (s) return s;
    }
    return '';
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
    const { getClientesList, normalizeCatalogValue } = deps;
    const raw = normalizeCatalogValue(clienteRaw);
    if (!raw) return null;
    const clientesCanonico = await getClientesList();
    return resolveClienteOnWrite(raw, clientesCanonico) || raw;
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
        const k = clienteMatchKey(t);
        if (k && !canonicalByFold.has(k)) canonicalByFold.set(k, t);
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

/** Une listas de clientes deduplicando por fold (PG + Dynamo u otras fuentes). */
function mergeConciliacionClientesLists(pgClients, extraClients) {
    const byFold = new Map();
    const add = (label) => {
        const t = String(label || '').trim();
        if (!t) return;
        const k = clienteMatchKey(t);
        if (k && !byFold.has(k)) byFold.set(k, t);
    };
    for (const c of pgClients || []) add(c);
    for (const c of extraClients || []) add(c);
    return Array.from(byFold.values()).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

async function assertClienteConciliacionPermitido(deps, scope, clienteRaw) {
    const canon = await resolveClienteCanon(deps, clienteRaw);
    if (!canon) return { ok: false, status: 400, error: 'Cliente inválido' };
    if (isWideConciliacionRole(scope?.role)) {
        return { ok: true, canon };
    }
    const allowed = await listConciliacionesClientes(deps, scope);
    const ok = allowed.some((c) => sameClienteLabel(c, canon));
    if (!ok) return { ok: false, status: 403, error: 'Sin acceso a este cliente' };
    return { ok: true, canon };
}

function parseNovedadesImpactOptions(source = {}) {
    const opts = {};
    const billingType = String(source.billingType || source.billing_type || '').trim();
    if (billingType) opts.billingType = billingType;
    const billingMode = String(source.billingMode || source.billing_mode || '').trim();
    if (billingMode) opts.billingMode = billingMode;
    const baseHoursRaw = source.baseHours ?? source.base_hours;
    if (baseHoursRaw != null && baseHoursRaw !== '') {
        const bh = Number(baseHoursRaw);
        if (Number.isFinite(bh) && bh > 0) opts.baseHours = bh;
    }
    if (source.novedadesYear != null && source.novedadesMonth != null) {
        opts.novedadesYear = Number(source.novedadesYear);
        opts.novedadesMonth = Number(source.novedadesMonth);
    }
    if (Array.isArray(source.servicioCedulas) && source.servicioCedulas.length) {
        opts.servicioCedulas = source.servicioCedulas;
    }
    return opts;
}

function novedadesImpactOptionsFromBillingType(billingTypeOrOpts) {
    if (typeof billingTypeOrOpts === 'string') {
        const t = billingTypeOrOpts.trim();
        return t ? { billingType: t } : {};
    }
    if (billingTypeOrOpts && typeof billingTypeOrOpts === 'object') {
        return parseNovedadesImpactOptions(billingTypeOrOpts);
    }
    return {};
}

function computeFacturacionImpacto(tarifaMaestro, novedadRows, ajustes, options = {}) {
    const factY = Number(options.factAnio ?? options.factYear ?? options.anio);
    const factM = Number(options.factMes ?? options.factMonth ?? options.mes);
    if (isAdvanceMonthBilling(options.billingType)) {
        return aggregateAdvanceFactura(tarifaMaestro, novedadRows, ajustes, {
            ...options,
            factAnio: factY,
            factMes: factM
        });
    }
    return {
        ...aggregateNovedadesImpactoConAjustes(tarifaMaestro, novedadRows, ajustes, options),
        ...emptyAdvanceFields()
    };
}

function buildAdvanceRowFields(impacto) {
    if (!impacto?.billingAdvanceMode) return emptyAdvanceFields();
    return {
        ajusteAnticipoSumCop: impacto.ajusteAnticipoSumCop || 0,
        ajusteAnticipoSumaCop: impacto.ajusteAnticipoSumaCop || 0,
        saldoAnticipoNetCop: impacto.saldoAnticipoNetCop || 0,
        saldoAnticipoTipo: impacto.saldoAnticipoTipo ?? null,
        ajusteAnticipoMesLabel: impacto.ajusteAnticipoMesLabel ?? null,
        novedadesCountAjuste: impacto.countAdjustment ?? 0,
        billingAdvanceMode: true,
        novedadesInfoCount: impacto.novedadesInfoCount ?? 0,
        pendingAdjustmentCount: impacto.pendingAdjustmentCount ?? 0
    };
}

function novedadesAreaClause(scope) {
    const role = String(scope?.role || '');
    if (role === 'gp') return { sql: '', params: [] };
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

const COLABORADOR_RESUMEN_SELECT_SQL = `SELECT 
            c.cedula, 
            c.nombre, 
            c.cliente, 
            c.profesion,
            c.puesto,
            c.perfil_cargo,
            c.descriptivo_puesto_sig,
            c.fecha_ingreso,
            c.fecha_termino,
            c.activo,
            c.tipo_contrato, 
            c.comercial, 
            c.sueldo_nomina, 
            c.tarifa_cliente, 
            c.moneda, 
            c.codigo, 
            c.honorarios,
            c.cliente_proyecto,
            c.modalidad_contrato AS tipo_servicio,
            c.lider_catalogo,
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
            f.tarifa_override,
            f.montos_novedad_override,
            f.cantidad_horas_novedad_override,
            CASE WHEN f.id IS NOT NULL THEN TRUE ELSE FALSE END AS cerrado
         FROM colaboradores c
         LEFT JOIN conciliaciones_facturacion f ON f.cedula = c.cedula AND f.anio = $2::integer AND f.mes = $3::integer`;

function buildConciliacionResumenRowsFromColaboradores(colRows, ctx) {
    const {
        elegiblesByCed,
        consumidasByCed,
        bucketConsumidasByCed,
        asignacionTarifas,
        historialMap,
        options,
        factY,
        factM,
        normalizeCedula,
        totals
    } = ctx;
    const rows = [];
    for (const c of colRows || []) {
        const cedDigits = normalizeCedula(String(c.cedula || ''));
        const tarifaMaestroCol = Number(c.tarifa_cliente || 0) || 0;
        const tarifaCatalogo = asignacionTarifas.has(cedDigits)
            ? asignacionTarifas.get(cedDigits)
            : tarifaMaestroCol;
        const ajustes = parseAjustesFromFacturacionRow(c);
        const estadoFact = c.estado != null ? String(c.estado) : 'PENDIENTE';
        const consumidasCol = cedDigits ? consumidasByCed.get(cedDigits) || [] : [];
        const elegiblesCol = cedDigits ? elegiblesByCed.get(cedDigits) || [] : [];
        const bucketConsumidasCol = cedDigits ? bucketConsumidasByCed.get(cedDigits) || [] : [];
        const novRowsForCol = cedDigits
            ? resolveNovedadesRowsParaColaborador(
                  estadoFact,
                  elegiblesCol,
                  consumidasCol,
                  bucketConsumidasCol
              )
            : [];
        const cnt = novRowsForCol.length;

        const fIngreso = isoDate(c.fecha_ingreso);
        const fTermino = isoDate(c.fecha_termino);
        const tramos = historialMap.get(cedDigits) || [];
        const prorrateo = resolveTarifaBaseMes({
            tarifaMaestro: tarifaCatalogo,
            year: factY,
            month: factM,
            fechaIngreso: fIngreso,
            fechaTermino: fTermino,
            billingMode: options.billingMode,
            baseHours: options.baseHours,
            tramos,
            festivosSet: ctx.festivosSet ?? null
        });
        const tarifaBaseMes = prorrateo.tarifaBase;

        const impactOpts = {
            ...options,
            factAnio: factY,
            factMes: factM,
            diasDenominadorMes: prorrateo.daysInMonth,
            festivosSet: ctx.festivosSet ?? null
        };
        const impacto = computeFacturacionImpacto(tarifaBaseMes, novRowsForCol, ajustes, impactOpts);
        const tarifa = impacto.tarifaCliente;
        const sumMonto = impacto.novedadesSumCop;
        const sumSuma = impacto.novedadesSumaCop;
        const factura = impacto.facturaCop;
        const advanceFields = buildAdvanceRowFields(impacto);
        const novedadesTipos = [
            ...new Set(
                novRowsForCol
                    .map((r) => String(r.tipo_novedad || '').trim())
                    .filter(Boolean)
            )
        ].sort((x, y) => x.localeCompare(y, 'es', { sensitivity: 'base' }));
        const novedadesDetalle = [...novRowsForCol]
            .map((r) => {
                const tipo = String(r.tipo_novedad || '').trim();
                if (!tipo) return null;
                const creadoRaw = r.creado_en ?? r.creadoEn ?? null;
                let creadoEn = null;
                if (creadoRaw instanceof Date) {
                    creadoEn = creadoRaw.toISOString();
                } else if (creadoRaw) {
                    const d = new Date(creadoRaw);
                    creadoEn = Number.isNaN(d.getTime()) ? null : d.toISOString();
                }
                return { tipo, creadoEn };
            })
            .filter(Boolean)
            .sort((a, b) => {
                const ta = a.creadoEn ? new Date(a.creadoEn).getTime() : 0;
                const tb = b.creadoEn ? new Date(b.creadoEn).getTime() : 0;
                if (ta !== tb) return ta - tb;
                return a.tipo.localeCompare(b.tipo, 'es', { sensitivity: 'base' });
            });
        totals.tarifaSum += tarifa;
        totals.incrementoSum += sumSuma;
        totals.deduccionSum += sumMonto;
        totals.ajusteAnticipoSum += advanceFields.ajusteAnticipoSumCop || 0;
        totals.ajusteAnticipoSuma += advanceFields.ajusteAnticipoSumaCop || 0;
        totals.facturaSum += factura;

        const fCierre = c.fecha_cierre
            ? c.fecha_cierre instanceof Date
                ? c.fecha_cierre.toISOString().slice(0, 10)
                : String(c.fecha_cierre).slice(0, 10)
            : '';

        rows.push({
            cedula: String(c.cedula || '').trim(),
            nombre: String(c.nombre || '').trim(),
            cliente: String(c.cliente || '').trim(),
            tarifaCliente: tarifa,
            tarifaMaestro: tarifaCatalogo,
            tarifaMaestroCol,
            tarifaProrrateada: prorrateo.tarifaProrrateada,
            tarifaAjustada: impacto.tarifaAjustada,
            prorrateoAplicado: prorrateo.prorrateoAplicado,
            diasFacturables: prorrateo.diasFacturables,
            diasMes: prorrateo.daysInMonth,
            diasHabilesFacturables: prorrateo.businessDaysFacturables ?? null,
            horasFacturables: prorrateo.horasFacturables,
            tramosTarifa: prorrateo.tramosAplicados,
            fechaTermino: fTermino,
            activoColaborador: c.activo,
            activo: c.activo === false ? false : c.activo !== false ? true : null,
            moneda: c.moneda != null ? String(c.moneda) : '',
            puesto: resolvePuestoColaborador(c),
            perfil: resolvePuestoColaborador(c),
            profesion: c.profesion != null ? String(c.profesion).trim() : '',
            novedadesCount: cnt,
            novedadesTipos,
            novedadesDetalle,
            novedadesSumCop: sumMonto,
            novedadesSumaCop: sumSuma,
            facturaCop: factura,
            ...advanceFields,
            fechaIngreso: fIngreso,
            tipoContrato: c.tipo_contrato != null ? String(c.tipo_contrato) : '',
            comercial: c.comercial != null ? String(c.comercial) : '',
            sueldoNomina: c.sueldo_nomina != null ? Number(c.sueldo_nomina) : 0,
            codigo: c.codigo != null ? String(c.codigo) : '',
            honorarios: c.honorarios != null ? String(c.honorarios) : '',
            clienteProyecto: c.cliente_proyecto != null ? String(c.cliente_proyecto) : '',
            tipoServicio: c.tipo_servicio != null ? String(c.tipo_servicio) : '',
            nit: c.nit != null ? String(c.nit) : '',
            lider: c.lider_catalogo != null ? String(c.lider_catalogo).trim() : '',
            facturacionId: c.facturacion_id || null,
            proyecto:
                c.proyecto != null
                    ? String(c.proyecto)
                    : c.cliente_proyecto != null
                      ? String(c.cliente_proyecto)
                      : '',
            observaciones: c.observaciones != null ? String(c.observaciones) : '',
            fechaCierre: fCierre,
            horasFacturadas: c.horas_facturadas != null ? Number(c.horas_facturadas) : 0,
            estado: c.estado != null ? String(c.estado) : 'PENDIENTE',
            facturaFv: c.factura_fv != null ? String(c.factura_fv) : '',
            fechaRadicacion: c.fecha_radicacion
                ? c.fecha_radicacion instanceof Date
                    ? c.fecha_radicacion.toISOString().slice(0, 10)
                    : String(c.fecha_radicacion).slice(0, 10)
                : '',
            motivoDevolucion: c.motivo_devolucion != null ? String(c.motivo_devolucion) : '',
            cerrado: Boolean(c.cerrado)
        });
    }
    return rows;
}

/** Incluye filas de asociados Dynamo que faltan en el resumen (p. ej. cliente vacío), respetando visibilidad del mes. */
async function enrichConciliacionRowsWithServicioCedulas(
    deps,
    scope,
    existingRows,
    servicioCedulas,
    clienteCanon,
    year,
    month,
    options = {}
) {
    const { pool, normalizeCedula } = deps;
    const factY = Number(year);
    const factM = Number(month);
    const existing = new Set((existingRows || []).map((r) => normalizeCedula(String(r.cedula || ''))));
    const missing = [
        ...new Set(
            (servicioCedulas || [])
                .map((c) => normalizeCedula(String(c || '')))
                .filter((c) => c && !existing.has(c))
        )
    ];
    if (!missing.length) return existingRows || [];

    const novBucket =
        options.novedadesYear != null && options.novedadesMonth != null
            ? { year: Number(options.novedadesYear), month: Number(options.novedadesMonth) }
            : resolveNovedadesBucket(factY, factM, options.billingType);
    const novOpts = {
        clienteCanon,
        factAnio: factY,
        factMes: factM,
        billingType: options.billingType,
        novedadesYear: novBucket.year,
        novedadesMonth: novBucket.month
    };
    const [elegiblesAll, consumidasAll, bucketConsumidasAll] = await Promise.all([
        listNovedadesElegiblesParaCierre(deps, scope, novOpts),
        listNovedadesConsumidasParaCierre(deps, scope, novOpts),
        listNovedadesConsumidasEnBucketNov(deps, scope, novOpts)
    ]);
    const elegiblesByCed = groupNovedadRowsByCedula(elegiblesAll, normalizeCedula);
    const consumidasByCed = groupNovedadRowsByCedula(consumidasAll, normalizeCedula);
    const bucketConsumidasByCed = groupNovedadRowsByCedula(bucketConsumidasAll, normalizeCedula);
    const visibilidadSql = colaboradorVisibleEnMesSql('c', 2, 3);

    const qExtra = await pool.query(
        `${COLABORADOR_RESUMEN_SELECT_SQL}
         WHERE $1::text IS NOT NULL
           AND regexp_replace(c.cedula, '[^0-9]', '', 'g') = ANY($4::text[])
           AND ${visibilidadSql}
         ORDER BY c.nombre ASC`,
        [clienteCanon, factY, factM, missing]
    );

    const [asignacionTarifas, historialMap, festivosSet] = await Promise.all([
        fetchTarifasAsignacionBatch(pool, missing, clienteCanon),
        fetchTarifaHistorialTramosMesBatch(pool, missing, clienteCanon, factY, factM),
        resolveFestivosSetSafe(deps)
    ]);

    const extraRows = buildConciliacionResumenRowsFromColaboradores(qExtra.rows || [], {
        elegiblesByCed,
        consumidasByCed,
        bucketConsumidasByCed,
        asignacionTarifas,
        historialMap,
        festivosSet,
        options,
        factY,
        factM,
        normalizeCedula,
        totals: {
            tarifaSum: 0,
            incrementoSum: 0,
            deduccionSum: 0,
            facturaSum: 0,
            ajusteAnticipoSum: 0,
            ajusteAnticipoSuma: 0
        }
    });

    return [...(existingRows || []), ...extraRows];
}

/**
 * @returns {Promise<{ rows: object[], totales: object }>}
 */
async function getConciliacionResumenPorClienteMes(deps, scope, clienteCanon, year, month, options = {}) {
    const { pool, normalizeCedula, canRoleViewType } = deps;
    const factY = Number(year);
    const factM = Number(month);
    const novBucket =
        options.novedadesYear != null && options.novedadesMonth != null
            ? { year: Number(options.novedadesYear), month: Number(options.novedadesMonth) }
            : resolveNovedadesBucket(factY, factM, options.billingType);

    const mrNov = monthRangeDates(novBucket.year, novBucket.month);
    if (!mrNov) return { rows: [], totales: { tarifaSum: 0, incrementoSum: 0, deduccionSum: 0, facturaSum: 0, colaboradores: 0 } };

    const novOpts = {
        clienteCanon,
        factAnio: factY,
        factMes: factM,
        billingType: options.billingType,
        novedadesYear: novBucket.year,
        novedadesMonth: novBucket.month
    };

    const [elegiblesAll, consumidasAll, bucketConsumidasAll] = await Promise.all([
        listNovedadesElegiblesParaCierre(deps, scope, novOpts),
        listNovedadesConsumidasParaCierre(deps, scope, novOpts),
        listNovedadesConsumidasEnBucketNov(deps, scope, novOpts)
    ]);
    const elegiblesByCed = groupNovedadRowsByCedula(elegiblesAll, normalizeCedula);
    const consumidasByCed = groupNovedadRowsByCedula(consumidasAll, normalizeCedula);
    const bucketConsumidasByCed = groupNovedadRowsByCedula(bucketConsumidasAll, normalizeCedula);

    const visibilidadSql = colaboradorVisibleEnMesSql('c', 2, 3);

    const qCol = await pool.query(
        `${COLABORADOR_RESUMEN_SELECT_SQL}
         WHERE lower(btrim(COALESCE(c.cliente, ''))) = lower(btrim($1::text))
           AND ${visibilidadSql}
         ORDER BY c.nombre ASC`,
        [clienteCanon, factY, factM]
    );

    const cedulasBatch = (qCol.rows || [])
        .map((c) => normalizeCedula(String(c.cedula || '')))
        .filter(Boolean);
    const [asignacionTarifas, historialMap, festivosSet] = await Promise.all([
        fetchTarifasAsignacionBatch(pool, cedulasBatch, clienteCanon),
        fetchTarifaHistorialTramosMesBatch(pool, cedulasBatch, clienteCanon, factY, factM),
        resolveFestivosSetSafe(deps)
    ]);

    const totals = {
        tarifaSum: 0,
        incrementoSum: 0,
        deduccionSum: 0,
        facturaSum: 0,
        ajusteAnticipoSum: 0,
        ajusteAnticipoSuma: 0
    };
    const rowCtx = {
        elegiblesByCed,
        consumidasByCed,
        bucketConsumidasByCed,
        asignacionTarifas,
        historialMap,
        options,
        factY,
        factM,
        normalizeCedula,
        totals,
        festivosSet
    };
    let rows = buildConciliacionResumenRowsFromColaboradores(qCol.rows, rowCtx);

    if (Array.isArray(options.servicioCedulas) && options.servicioCedulas.length) {
        rows = await enrichConciliacionRowsWithServicioCedulas(
            deps,
            scope,
            rows,
            options.servicioCedulas,
            clienteCanon,
            factY,
            factM,
            {
                ...options,
                novedadesYear: novBucket.year,
                novedadesMonth: novBucket.month
            }
        );
    }

    return {
        rows,
        totales: {
            tarifaSum: rows.reduce((s, r) => s + (Number(r.tarifaCliente) || 0), 0),
            incrementoSum: rows.reduce((s, r) => s + (Number(r.novedadesSumaCop) || 0), 0),
            deduccionSum: rows.reduce((s, r) => s + (Number(r.novedadesSumCop) || 0), 0),
            facturaSum: rows.reduce((s, r) => s + (Number(r.facturaCop) || 0), 0),
            ajusteAnticipoSum: rows.reduce((s, r) => s + (Number(r.ajusteAnticipoSumCop) || 0), 0),
            ajusteAnticipoSuma: rows.reduce((s, r) => s + (Number(r.ajusteAnticipoSumaCop) || 0), 0),
            colaboradores: rows.length,
            conNovedad: rows.filter((r) => r.novedadesCount > 0).length
        }
    };
}

/**
 * Resumen de facturación del mes para todos los clientes del alcance (vista «Todos / seleccionar»).
 * @returns {Promise<{ rows: object[], totales: object, clientesCount: number }>}
 */
async function mapWithConcurrency(items, limit, fn) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return [];
    const concurrency = Math.max(1, Math.min(Number(limit) || 1, list.length));
    const results = new Array(list.length);
    let nextIndex = 0;
    async function worker() {
        while (nextIndex < list.length) {
            const i = nextIndex++;
            results[i] = await fn(list[i], i);
        }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return results;
}

async function getConciliacionResumenTodosClientesMes(deps, scope, year, month) {
    const clientes = await listConciliacionesClientes(deps, scope);
    if (!clientes.length) {
        return {
            rows: [],
            totales: { tarifaSum: 0, incrementoSum: 0, deduccionSum: 0, facturaSum: 0, colaboradores: 0, conNovedad: 0 },
            clientesCount: 0
        };
    }

    const allRows = [];
    let tarifaSum = 0;
    let incrementoSum = 0;
    let deduccionSum = 0;
    let facturaSum = 0;
    let conNovedad = 0;

    const payloads = await mapWithConcurrency(clientes, 5, (clienteCanon) =>
        getConciliacionResumenPorClienteMes(deps, scope, clienteCanon, year, month)
    );

    payloads.forEach((payload, idx) => {
        const clienteCanon = clientes[idx];
        for (const row of payload.rows || []) {
            allRows.push({
                ...row,
                cliente: String(row.cliente || clienteCanon).trim()
            });
        }
        tarifaSum += Number(payload.totales?.tarifaSum) || 0;
        incrementoSum += Number(payload.totales?.incrementoSum) || 0;
        deduccionSum += Number(payload.totales?.deduccionSum) || 0;
        facturaSum += Number(payload.totales?.facturaSum) || 0;
        conNovedad += Number(payload.totales?.conNovedad) || 0;
    });

    allRows.sort((a, b) => {
        const byName = String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
        if (byName !== 0) return byName;
        return String(a.cliente || '').localeCompare(String(b.cliente || ''), 'es', { sensitivity: 'base' });
    });

    return {
        rows: allRows,
        totales: {
            tarifaSum,
            incrementoSum,
            deduccionSum,
            facturaSum,
            colaboradores: allRows.length,
            conNovedad
        },
        clientesCount: clientes.length
    };
}

async function resolveFestivosSetSafe(deps) {
    if (typeof deps?.getFestivosSet === 'function') {
        try {
            return await deps.getFestivosSet();
        } catch {
            return null;
        }
    }
    return null;
}

async function fetchConciliacionNovedadRowsForCierre(deps, scope, clienteCanon, cedulaRaw, year, month, options = {}) {
    const { pool, normalizeCedula } = deps;
    const factY = Number(year);
    const factM = Number(month);
    const novBucket = resolveNovedadesBucket(factY, factM, options.billingType);
    const cedDigits = normalizeCedula(cedulaRaw);
    if (!cedDigits) {
        return { tarifaMaestro: 0, tarifaCatalogo: 0, tarifaMaestroCol: 0, prorrateo: null, filteredRows: [], factY, factM, cedDigits: '' };
    }

    const qTarifa = await pool.query(
        `SELECT c.tarifa_cliente, c.fecha_ingreso, c.fecha_termino, c.activo
         FROM colaboradores c
         WHERE lower(btrim(COALESCE(c.cliente, ''))) = lower(btrim($1::text))
           AND regexp_replace(COALESCE(c.cedula, ''), '\\D', '', 'g') = $2
           AND ${colaboradorVisibleEnMesSql('c', 3, 4)}
         LIMIT 1`,
        [clienteCanon, cedDigits, factY, factM]
    );
    const colRow = qTarifa.rows[0] || {};
    const tarifaMaestroCol = Number(colRow.tarifa_cliente) || 0;
    const asignacionTarifas = await fetchTarifasAsignacionBatch(pool, [cedDigits], clienteCanon);
    const tarifaCatalogo = asignacionTarifas.has(cedDigits)
        ? asignacionTarifas.get(cedDigits)
        : tarifaMaestroCol;
    const tramos = await fetchTarifaHistorialTramosMes(pool, cedDigits, clienteCanon, factY, factM);
    const festivosSet = await resolveFestivosSetSafe(deps);
    const prorrateo = resolveTarifaBaseMes({
        tarifaMaestro: tarifaCatalogo,
        year: factY,
        month: factM,
        fechaIngreso: isoDate(colRow.fecha_ingreso),
        fechaTermino: isoDate(colRow.fecha_termino),
        billingMode: options.billingMode,
        baseHours: options.baseHours,
        tramos,
        festivosSet
    });
    const tarifaMaestro = prorrateo.tarifaBase;

    const qEst = await pool.query(
        `SELECT estado FROM conciliaciones_facturacion
         WHERE regexp_replace(COALESCE(cedula, ''), '\\D', '', 'g') = $1
           AND anio = $2::integer AND mes = $3::integer
         LIMIT 1`,
        [cedDigits, factY, factM]
    );
    const estadoFact = qEst.rows[0]?.estado != null ? String(qEst.rows[0].estado) : 'PENDIENTE';

    const novedadRows = await listNovedadesForFacturacionByEstado(
        deps,
        scope,
        {
            clienteCanon,
            cedulaRaw,
            factAnio: factY,
            factMes: factM,
            billingType: options.billingType,
            novedadesYear: novBucket.year,
            novedadesMonth: novBucket.month
        },
        estadoFact
    );

    const ids = novedadRows.map((r) => r.id).filter(Boolean);
    if (!ids.length) {
        return { tarifaMaestro, tarifaCatalogo, tarifaMaestroCol, prorrateo, filteredRows: [], factY, factM, cedDigits };
    }

    const q = await pool.query(
        `SELECT nov.id, nov.nombre, nov.cedula, nov.tipo_novedad, nov.monto_cop, nov.estado,
                nov.fecha, nov.fecha_inicio, nov.fecha_fin, nov.creado_en,
                nov.cantidad_horas, nov.unidad, nov.modalidad, nov.hora_inicio, nov.hora_fin,
                COALESCE(ua.full_name, nov.aprobado_por_email, 'Aprobador CINTE') AS aprobador
         FROM novedades nov
         LEFT JOIN users ua ON nov.aprobado_por_user_id = ua.id
         WHERE nov.id = ANY($1::uuid[])
         ORDER BY nov.creado_en DESC`,
        [ids]
    );

    return {
        tarifaMaestro,
        tarifaCatalogo,
        tarifaMaestroCol,
        prorrateo,
        filteredRows: q.rows || [],
        factY,
        factM,
        cedDigits
    };
}

async function listConciliacionNovedadesDetalle(deps, scope, clienteCanon, cedulaRaw, year, month, options = {}) {
    const { pool, normalizeCedula } = deps;
    const fetched = await fetchConciliacionNovedadRowsForCierre(
        deps,
        scope,
        clienteCanon,
        cedulaRaw,
        year,
        month,
        options
    );
    const { tarifaMaestro, tarifaCatalogo, prorrateo, filteredRows, factY, factM, cedDigits } = fetched;
    if (!cedDigits) {
        return {
            items: [],
            tarifaCliente: 0,
            tarifaMaestro: 0,
            tarifaAjustada: false,
            facturaCop: 0
        };
    }

    const qAjustes = await pool.query(
        `SELECT tarifa_override, montos_novedad_override, cantidad_horas_novedad_override
         FROM conciliaciones_facturacion
         WHERE regexp_replace(COALESCE(cedula, ''), '\\D', '', 'g') = $1
           AND anio = $2::integer AND mes = $3::integer
         LIMIT 1`,
        [cedDigits, factY, factM]
    );
    const ajustes = parseAjustesFromFacturacionRow(qAjustes.rows[0] || {});
    const festivosSet = await resolveFestivosSetSafe(deps);
    const impactOpts = {
        ...options,
        factAnio: factY,
        factMes: factM,
        diasDenominadorMes: prorrateo?.daysInMonth,
        festivosSet
    };
    const advancePeriods = isAdvanceMonthBilling(options.billingType)
        ? resolveAdvancePeriods(factY, factM)
        : null;

    const items = filteredRows.map((row) => {
        const impact = resolveNovedadMontoConAjuste(tarifaMaestro, row, ajustes, impactOpts);
        const scope =
            advancePeriods && classifyNovedadAdvanceScope(row, advancePeriods)
                ? classifyNovedadAdvanceScope(row, advancePeriods)
                : undefined;
        return {
            id: row.id,
            nombre: String(row.nombre || '').trim(),
            cedula: String(row.cedula || '').trim(),
            tipoNovedad: String(row.tipo_novedad || '').trim(),
            montoCop: impact.montoCop,
            montoMaestro: impact.montoMaestro,
            montoAjustado: impact.montoAjustado,
            montoOrigen: impact.montoOrigen,
            impacto: impact.impacto,
            medida: impact.medida,
            cantidad: impact.cantidad,
            cantidadHoras: impact.cantidadHoras ?? null,
            cantidadHorasMaestro: impact.cantidadHorasMaestro ?? null,
            cantidadHorasAjustado: impact.cantidadHorasAjustado ?? false,
            montoCalculado: impact.montoCalculado,
            valorHora: impact.valorHora ?? null,
            valorHoraMaestro: impact.valorHoraMaestro ?? null,
            valorHoraAjustado: impact.valorHoraAjustado ?? false,
            estado: String(row.estado || ''),
            fecha: row.fecha ? row.fecha.toISOString().slice(0, 10) : null,
            fechaInicio: row.fecha_inicio ? row.fecha_inicio.toISOString().slice(0, 10) : null,
            fechaFin: row.fecha_fin ? row.fecha_fin.toISOString().slice(0, 10) : null,
            creadoEn: row.creado_en ? row.creado_en.toISOString() : null,
            aprobador: String(row.aprobador || 'Aprobador CINTE').trim(),
            scope
        };
    });

    const agg = computeFacturacionImpacto(tarifaMaestro, filteredRows, ajustes, impactOpts);
    const advanceFields = buildAdvanceRowFields(agg);
    const billingCtx = buildHorasBillingContext(options, agg.tarifaCliente);
    // El valor hora es una tarifa contractual y NO se prorratea por días trabajados.
    // Cuando hay prorrateo, agg.tarifaCliente ya viene reducido por el ratio de días,
    // así que dividirlo entre baseHours completas subestima el valor hora. Se recalcula
    // sobre las horas facturables para cumplir: valorHora × horasFacturables = tarifa prorrateada.
    if (
        billingCtx.tarifaValorHora != null &&
        prorrateo?.prorrateoAplicado &&
        Number(prorrateo?.horasFacturables) > 0
    ) {
        billingCtx.tarifaValorHora = Math.round(
            Number(agg.tarifaCliente) / Number(prorrateo.horasFacturables)
        );
    }

    let diasBase = { diasBaseMes: null, diasBaseLabel: null, festivosAplicados: false };
    if (options.billingMode) {
        let festivosSet = null;
        if (typeof deps.getFestivosSet === 'function') {
            try {
                festivosSet = await deps.getFestivosSet();
            } catch {
                festivosSet = null;
            }
        }
        diasBase = resolveDiasBaseMes({
            billingMode: options.billingMode,
            year: factY,
            month: factM,
            festivosSet
        });
    }

    return {
        items,
        ...billingCtx,
        ...diasBase,
        tarifaCliente: agg.tarifaCliente,
        tarifaMaestro: tarifaCatalogo ?? agg.tarifaMaestro,
        tarifaProrrateada: prorrateo?.tarifaProrrateada ?? agg.tarifaMaestro,
        prorrateoAplicado: prorrateo?.prorrateoAplicado ?? false,
        diasFacturables: prorrateo?.diasFacturables ?? null,
        diasMes: prorrateo?.daysInMonth ?? null,
        diasHabilesFacturables: prorrateo?.businessDaysFacturables ?? null,
        horasFacturables: prorrateo?.horasFacturables ?? null,
        tramosTarifa: prorrateo?.tramosAplicados ?? [],
        tarifaAjustada: agg.tarifaAjustada,
        facturaCop: agg.facturaCop,
        ...advanceFields
    };
}

/**
 * Resumen multi-cliente para el dashboard: agrega la cola de cierres (servicios + consultores asociados).
 * Misma fuente en tiempo real que Facturación → cola de cierres.
 * @param {object[]} servicios - servicios del catálogo (Dynamo) con consultoresCedulas
 * @returns {Promise<{ rows: object[], globalTotales: object, clientesCount: number, serviciosCount: number }>}
 */
async function listDashboardLiderClienteRows(deps, scope, year, month) {
    const payload = await getConciliacionResumenTodosClientesMes(deps, scope, year, month);
    return (payload.rows || []).map((r) => ({
        cliente: String(r.cliente || '').trim(),
        lider: String(r.lider || '').trim() || 'Sin líder',
        cedula: String(r.cedula || '').trim(),
        estado: String(r.estado || 'PENDIENTE').trim(),
        facturaCop: Number(r.facturaCop) || 0,
        tarifaCliente: Number(r.tarifaCliente) || 0
    }));
}

async function getConciliacionesDashboardResumen(deps, scope, year, month, servicios) {
    const { items } = await getColaCierresPorMes(deps, scope, year, month, undefined, servicios);
    return aggregateDashboardFromColaItems(items);
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

    const existingQ = await pool.query(
        'SELECT id, estado FROM conciliaciones_facturacion WHERE cedula = $1 AND anio = $2::integer AND mes = $3::integer LIMIT 1',
        [ced, y, m]
    );
    const prevEst = existingQ.rows[0]?.estado ?? null;
    const requestedEst = normalizeEstado(est);
    const role = String(scope?.role || '').trim().toLowerCase();
    if (!canBypassEstadoChange(role)) {
        if (prevEst !== null && requestedEst !== normalizeEstado(prevEst)) {
            const error = new Error('El estado solo puede cambiarse mediante revisión de aprobación');
            error.status = 403;
            throw error;
        }
        if (prevEst === null && requestedEst !== 'PENDIENTE') {
            const error = new Error('El estado inicial debe ser PENDIENTE');
            error.status = 403;
            throw error;
        }
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

function buildRevisionActor(actor, scope) {
    const role = String(actor?.role || scope?.role || '').trim().toLowerCase();
    const email = String(actor?.email || '').trim().toLowerCase();
    const nombre = String(actor?.full_name || actor?.fullName || actor?.name || email || 'Usuario').trim();
    const userId = actor?.id || actor?.sub || null;
    return { role, email: email || 'sin-correo@local', nombre: nombre || 'Usuario', userId };
}

/**
 * Tras aprobar consultores, promueve el servicio a LISTO_EXPORT si ya está completo
 * (AUT-552: el path de aprobación no pasaba por tryNotify / cola).
 */
async function ensureListoExportTrasAprobacion(deps, scope, { clienteCanon, anio, mes, servicioId } = {}) {
    if (!clienteCanon || !deps?.pool || typeof deps.listServicios !== 'function') return;
    const y = Number(anio);
    const m = Number(mes);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return;

    try {
        const servicios = await deps.listServicios(scope);
        let matching = (Array.isArray(servicios) ? servicios : []).filter((s) =>
            sameClienteLabel(s?.client, clienteCanon)
        );
        const sid = String(servicioId || '').trim();
        if (sid) {
            matching = matching.filter((s) => String(s.id) === sid);
        }
        for (const serv of matching) {
            const cedulas = (Array.isArray(serv.consultoresCedulas) ? serv.consultoresCedulas : [])
                .map((c) => deps.normalizeCedula(c))
                .filter(Boolean);
            if (!cedulas.length) continue;
            const novBucket = resolveNovedadesBucket(y, m, serv.billingType);
            const resumen = await getConciliacionResumenPorClienteMes(deps, scope, clienteCanon, y, m, {
                novedadesYear: novBucket.year,
                novedadesMonth: novBucket.month,
                billingType: serv.billingType,
                billingMode: serv.billingMode,
                baseHours: serv.baseHours
            });
            const rows = await enrichConciliacionRowsWithServicioCedulas(
                deps,
                scope,
                resumen.rows || [],
                cedulas,
                clienteCanon,
                y,
                m,
                {
                    novedadesYear: novBucket.year,
                    novedadesMonth: novBucket.month,
                    billingType: serv.billingType,
                    billingMode: serv.billingMode,
                    baseHours: serv.baseHours
                }
            );
            const merged = mergeConciliacionServicioRows(rows, cedulas);
            const filtered = filterRowsByServicioLideres(
                merged,
                serv.lideresAsociados || serv.lideres_asociados,
                cedulas
            );
            const agg = aggregateConciliacionRows(filtered);
            await ensureListoExportIfCompleto(deps.pool, serv.id, y, m, agg);
        }
    } catch (e) {
        console.error('[conciliaciones] ensureListoExportTrasAprobacion', {
            clienteCanon,
            anio,
            mes,
            servicioId,
            error: e.message
        });
    }
}

async function applyConciliacionFacturacionRevision(deps, scope, payload, actor) {
    const { pool, normalizeCedula } = deps;
    const { cedula, anio, mes, accion, observacion, etapaObjetivo, skipListoExport } = payload || {};
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

    const colQ = await pool.query('SELECT cliente FROM colaboradores WHERE cedula = $1 LIMIT 1', [ced]);
    if (!colQ.rows[0]) {
        const error = new Error('Colaborador no encontrado');
        error.status = 404;
        throw error;
    }
    const chk = await assertClienteConciliacionPermitido(deps, scope, colQ.rows[0].cliente);
    if (!chk.ok) {
        const error = new Error(chk.error || 'No autorizado');
        error.status = chk.status || 403;
        throw error;
    }

    const revActor = buildRevisionActor(actor, scope);
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let rowQ = await client.query(
            `SELECT id, estado, observaciones, motivo_devolucion
             FROM conciliaciones_facturacion
             WHERE cedula = $1 AND anio = $2::integer AND mes = $3::integer
             FOR UPDATE`,
            [ced, y, m]
        );
        let row = rowQ.rows[0];
        let estadoActual = row ? normalizeEstado(row.estado) : 'PENDIENTE';

        const etapaFija = normalizeEtapaObjetivo(etapaObjetivo);
        let validation = validateRevisionRequest({
            role: revActor.role,
            estadoActual,
            accion,
            observacion,
            etapaObjetivo: etapaFija || undefined
        });
        if (!validation.ok) {
            const error = new Error(validation.error || 'Revisión inválida');
            error.status = validation.status || 400;
            throw error;
        }

        if (!row) {
            const insertQ = await client.query(
                `INSERT INTO conciliaciones_facturacion (cedula, anio, mes, estado, fecha_cierre, updated_at)
                 VALUES ($1, $2, $3, 'PENDIENTE', CURRENT_DATE, NOW())
                 RETURNING id, estado, observaciones, motivo_devolucion`,
                [ced, y, m]
            );
            row = insertQ.rows[0];
            estadoActual = 'PENDIENTE';
            validation = validateRevisionRequest({
                role: revActor.role,
                estadoActual,
                accion,
                observacion,
                etapaObjetivo: etapaFija || undefined
            });
            if (!validation.ok) {
                const error = new Error(validation.error || 'Revisión inválida');
                error.status = validation.status || 400;
                throw error;
            }
        }

        const motivoDevolucion = validation.accion === 'RECHAZAR' ? validation.observacion : null;
        const updateQ = await client.query(
            `UPDATE conciliaciones_facturacion
             SET estado = $1,
                 observaciones = $2,
                 motivo_devolucion = $3,
                 fecha_cierre = CURRENT_DATE,
                 updated_at = NOW()
             WHERE id = $4
             RETURNING id, cedula, anio, mes, proyecto, observaciones, horas_facturadas, estado,
                       factura_fv, fecha_radicacion, motivo_devolucion, fecha_cierre, created_at, updated_at`,
            [validation.estado, validation.observacion, motivoDevolucion, row.id]
        );

        if (validation.estado === 'DEVUELTA') {
            await liberarNovedadesConsumidas(client, row.id);
        }

        let historialDetalle = null;
        if (validation.estado === 'APROBADO_ANALISTA') {
            const billingCtx = await resolveServicioBillingForRevision(deps, scope, chk.canon, ced, {
                anio: y,
                mes: m,
                servicioId: payload?.servicioId
            });
            const novedadIdsConsumidas = await consumirNovedadesParaCierreAnalista(client, deps, scope, {
                facturacionId: row.id,
                cedula: ced,
                anio: y,
                mes: m,
                servicioId: billingCtx.servicioId,
                clienteCanon: chk.canon,
                billingType: billingCtx.billingType,
                novedadesYear: billingCtx.novedadesYear,
                novedadesMonth: billingCtx.novedadesMonth,
                actorUserId: revActor.userId
            });
            if (novedadIdsConsumidas.length) {
                historialDetalle = JSON.stringify({ novedadIds: novedadIdsConsumidas });
            }
        }

        await client.query(
            `INSERT INTO conciliaciones_facturacion_historial
                (facturacion_id, cedula, anio, mes, accion, etapa, estado_anterior, estado_nuevo,
                 observacion, actor_user_id, actor_email, actor_nombre, actor_role, detalle)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::uuid, $11, $12, $13::user_role, $14::jsonb)`,
            [
                row.id,
                ced,
                y,
                m,
                validation.accion,
                validation.etapa,
                estadoActual,
                validation.estado,
                validation.observacion,
                revActor.userId,
                revActor.email,
                revActor.nombre,
                revActor.role,
                historialDetalle
            ]
        );

        await client.query('COMMIT');
        const updatedRow = updateQ.rows[0];

        if (
            !skipListoExport &&
            (validation.estado === 'APROBADO_ANALISTA' ||
                validation.estado === 'APROBADO_FINANZAS' ||
                validation.estado === 'CONCILIADA')
        ) {
            await ensureListoExportTrasAprobacion(deps, scope, {
                clienteCanon: chk.canon,
                anio: y,
                mes: m,
                servicioId: payload?.servicioId
            });
        }

        return updatedRow;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function applyConciliacionFacturacionRevisionMasiva(deps, scope, payload, actor) {
    const { pool, normalizeCedula } = deps;
    const { cliente, cedulas: cedulasPayload, anio, mes, accion, observacion, servicioId, etapaObjetivo } =
        payload || {};

    const chk = await assertClienteConciliacionPermitido(deps, scope, cliente);
    if (!chk.ok) {
        const error = new Error(chk.error || 'No autorizado');
        error.status = chk.status || 403;
        throw error;
    }

    const etapaFija = normalizeEtapaObjetivo(etapaObjetivo);
    if (!etapaFija) {
        const error = new Error('Etapa objetivo inválida');
        error.status = 400;
        throw error;
    }

    if (!Array.isArray(cedulasPayload) || cedulasPayload.length === 0) {
        const error = new Error('Debe indicar al menos una cédula');
        error.status = 400;
        throw error;
    }

    const y = Number(anio);
    const m = Number(mes);

    const visibilidadSql = colaboradorVisibleEnMesSql('c', 2, 3);
    const colQ = await pool.query(
        `SELECT c.cedula FROM colaboradores c
         WHERE lower(btrim(COALESCE(c.cliente, ''))) = lower(btrim($1::text))
           AND ${visibilidadSql}`,
        [chk.canon, y, m]
    );
    const allCedulas = colQ.rows.map((r) => String(r.cedula || '').trim()).filter(Boolean);
    const allowed = new Set(allCedulas);
    const cedulas = cedulasPayload.map((c) => normalizeCedula(c)).filter((c) => allowed.has(c));
    if (!cedulas.length) return { updated: 0, errors: [], skipped: 0 };

    const revActor = buildRevisionActor(actor, scope);

    let updated = 0;
    let skipped = 0;
    const errors = [];
    for (const ced of cedulas) {
        try {
            const rowQ = await pool.query(
                `SELECT estado FROM conciliaciones_facturacion
                 WHERE cedula = $1 AND anio = $2::integer AND mes = $3::integer
                 LIMIT 1`,
                [ced, y, m]
            );
            const estadoActual = rowQ.rows[0] ? normalizeEstado(rowQ.rows[0].estado) : 'PENDIENTE';
            const preCheck = validateRevisionRequestMasiva({
                role: revActor.role,
                estadoActual,
                accion,
                observacion,
                etapaObjetivo: etapaFija
            });
            if (!preCheck.ok) {
                if (preCheck.skip) {
                    skipped += 1;
                    continue;
                }
                errors.push({ cedula: ced, error: preCheck.error || 'No elegible' });
                continue;
            }

            await applyConciliacionFacturacionRevision(
                deps,
                scope,
                {
                    cedula: ced,
                    anio,
                    mes,
                    accion,
                    observacion,
                    servicioId,
                    etapaObjetivo: etapaFija,
                    skipListoExport: true
                },
                actor
            );
            updated += 1;
        } catch (e) {
            errors.push({ cedula: ced, error: e.message || 'Error' });
        }
    }

    if (updated > 0 && String(accion || '').toUpperCase() === 'APROBAR') {
        await ensureListoExportTrasAprobacion(deps, scope, {
            clienteCanon: chk.canon,
            anio: y,
            mes: m,
            servicioId
        });
    }

    return { updated, errors, skipped };
}

async function applyConciliacionFacturacionAjustes(deps, scope, payload, actor) {
    const { pool, normalizeCedula } = deps;
    const { cedula, anio, mes, observacion, tarifaOverride, montosNovedad, cantidadesHorasNovedad, billingType, billingMode, baseHours } = payload || {};
    const obs = String(observacion || '').trim();
    if (!obs) {
        const error = new Error('La observación es obligatoria');
        error.status = 400;
        throw error;
    }

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

    const colQ = await pool.query(
        `SELECT cliente, tarifa_cliente FROM colaboradores WHERE cedula = $1 LIMIT 1`,
        [ced]
    );
    if (!colQ.rows[0]) {
        const error = new Error('Colaborador no encontrado');
        error.status = 404;
        throw error;
    }
    const chk = await assertClienteConciliacionPermitido(deps, scope, colQ.rows[0].cliente);
    if (!chk.ok) {
        const error = new Error(chk.error || 'No autorizado');
        error.status = chk.status || 403;
        throw error;
    }

    const tarifaMaestro = Number(colQ.rows[0].tarifa_cliente) || 0;
    const revActor = buildRevisionActor(actor, scope);
    const novOpts = parseNovedadesImpactOptions({ billingType, billingMode, baseHours });

    const { filteredRows } = await fetchConciliacionNovedadRowsForCierre(
        deps,
        scope,
        chk.canon,
        ced,
        y,
        m,
        novOpts
    );
    const rawById = new Map(filteredRows.map((row) => [String(row.id), row]));

    const detalleNovedades = await listConciliacionNovedadesDetalle(
        deps,
        scope,
        chk.canon,
        ced,
        y,
        m,
        novOpts
    );
    const novedadById = new Map((detalleNovedades.items || []).map((item) => [String(item.id), item]));

    if (
        tarifaOverride === undefined &&
        (!Array.isArray(montosNovedad) || !montosNovedad.length) &&
        (!Array.isArray(cantidadesHorasNovedad) || !cantidadesHorasNovedad.length)
    ) {
        const error = new Error('No hay cambios para guardar');
        error.status = 400;
        throw error;
    }

    if (Array.isArray(cantidadesHorasNovedad)) {
        for (const entry of cantidadesHorasNovedad) {
            const nid = String(entry?.novedadId || '').trim();
            if (!nid || !novedadById.has(nid)) {
                const error = new Error(`Novedad no válida para este cierre: ${nid || '(vacío)'}`);
                error.status = 400;
                throw error;
            }
            if (entry.cantidadHoras != null) {
                const val = Number(entry.cantidadHoras);
                if (!Number.isFinite(val) || val < 0) {
                    const error = new Error('Cantidad de horas de novedad inválida');
                    error.status = 400;
                    throw error;
                }
            }
        }
    }

    if (Array.isArray(montosNovedad)) {
        for (const entry of montosNovedad) {
            const nid = String(entry?.novedadId || '').trim();
            if (!nid || !novedadById.has(nid)) {
                const error = new Error(`Novedad no válida para este cierre: ${nid || '(vacío)'}`);
                error.status = 400;
                throw error;
            }
            if (entry.montoCop != null) {
                const val = Number(entry.montoCop);
                if (!Number.isFinite(val) || val < 0) {
                    const error = new Error('Monto de novedad inválido');
                    error.status = 400;
                    throw error;
                }
            }
        }
    }

    if (tarifaOverride != null) {
        const val = Number(tarifaOverride);
        if (!Number.isFinite(val) || val < 0) {
            const error = new Error('Tarifa inválida');
            error.status = 400;
            throw error;
        }
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let rowQ = await client.query(
            `SELECT id, estado, tarifa_override, montos_novedad_override, cantidad_horas_novedad_override
             FROM conciliaciones_facturacion
             WHERE cedula = $1 AND anio = $2::integer AND mes = $3::integer
             FOR UPDATE`,
            [ced, y, m]
        );
        let row = rowQ.rows[0];
        let estadoActual = row ? normalizeEstado(row.estado) : 'PENDIENTE';

        if (!canEditConciliacionAjustes(revActor.role, estadoActual)) {
            const error = new Error('No autorizado para ajustar montos en el estado actual');
            error.status = 403;
            throw error;
        }

        if (!row) {
            const insertQ = await client.query(
                `INSERT INTO conciliaciones_facturacion (cedula, anio, mes, estado, fecha_cierre, updated_at)
                 VALUES ($1, $2, $3, 'PENDIENTE', CURRENT_DATE, NOW())
                 RETURNING id, estado, tarifa_override, montos_novedad_override, cantidad_horas_novedad_override`,
                [ced, y, m]
            );
            row = insertQ.rows[0];
            estadoActual = 'PENDIENTE';
        }

        const ajustesActuales = parseAjustesFromFacturacionRow(row);
        const tarifaEfectivaActual = detalleNovedades.tarifaCliente;
        const montosMap = { ...(ajustesActuales.montosNovedadOverride || {}) };
        const chMap = { ...(ajustesActuales.cantidadHorasNovedadOverride || {}) };
        let nuevaTarifaOverride = ajustesActuales.tarifaOverride;
        const historialEntries = [];

        if (tarifaOverride !== undefined) {
            const prevEffective = tarifaEfectivaActual;
            if (tarifaOverride === null) {
                nuevaTarifaOverride = null;
            } else {
                nuevaTarifaOverride = Math.round(Number(tarifaOverride));
            }
            const aggPreview = computeFacturacionImpacto(tarifaMaestro, filteredRows, {
                tarifaOverride: nuevaTarifaOverride,
                montosNovedadOverride: montosMap,
                cantidadHorasNovedadOverride: chMap
            }, novOpts);
            const nextEffective = aggPreview.tarifaCliente;
            if (prevEffective !== nextEffective) {
                historialEntries.push({
                    observacion: buildAjusteHistorialObservacion('tarifa', prevEffective, nextEffective),
                    detalle: {
                        campo: 'tarifa',
                        valorAnterior: prevEffective,
                        valorNuevo: nextEffective,
                        valorMaestro: tarifaMaestro
                    }
                });
            }
        }

        if (Array.isArray(cantidadesHorasNovedad)) {
            for (const entry of cantidadesHorasNovedad) {
                const nid = String(entry.novedadId);
                const item = novedadById.get(nid);
                const prevHoras = item.cantidadHoras;
                if (entry.cantidadHoras === null) {
                    delete chMap[nid];
                    delete montosMap[nid];
                } else {
                    chMap[nid] = Math.round(Number(entry.cantidadHoras) * 100) / 100;
                    delete montosMap[nid];
                }
                const rawRow = rawById.get(nid);
                const nextImpact = resolveNovedadMontoConAjuste(
                    tarifaMaestro,
                    rawRow,
                    {
                        tarifaOverride: nuevaTarifaOverride,
                        montosNovedadOverride: montosMap,
                        cantidadHorasNovedadOverride: chMap
                    },
                    novOpts
                );
                const nextHoras = nextImpact.cantidadHoras;
                if (prevHoras !== nextHoras) {
                    historialEntries.push({
                        observacion: buildAjusteHistorialObservacion(
                            'cantidad_horas_novedad',
                            prevHoras,
                            entry.cantidadHoras === null ? null : nextHoras,
                            { tipoNovedad: item.tipoNovedad }
                        ),
                        detalle: {
                            campo: 'cantidad_horas_novedad',
                            novedadId: nid,
                            tipoNovedad: item.tipoNovedad,
                            valorAnterior: prevHoras,
                            valorNuevo: nextHoras,
                            valorMaestro: item.cantidadHorasMaestro ?? item.cantidadHoras
                        }
                    });
                }
                const prevMonto = item.montoCop;
                const nextMonto = nextImpact.montoCop;
                if (prevMonto !== nextMonto) {
                    historialEntries.push({
                        observacion: buildAjusteHistorialObservacion(
                            'monto_novedad',
                            prevMonto,
                            nextMonto,
                            { tipoNovedad: item.tipoNovedad }
                        ),
                        detalle: {
                            campo: 'monto_novedad',
                            novedadId: nid,
                            tipoNovedad: item.tipoNovedad,
                            valorAnterior: prevMonto,
                            valorNuevo: nextMonto,
                            valorMaestro: item.montoMaestro,
                            montoOrigen: item.montoOrigen,
                            origen: 'cantidad_horas'
                        }
                    });
                }
            }
        }

        if (Array.isArray(montosNovedad)) {
            for (const entry of montosNovedad) {
                const nid = String(entry.novedadId);
                const item = novedadById.get(nid);
                const rawRow = rawById.get(nid);
                const prevMonto = item.montoCop;
                let nextMonto;
                if (entry.montoCop === null) {
                    delete montosMap[nid];
                    const base = resolveNovedadMontoConAjuste(
                        tarifaMaestro,
                        rawRow,
                        {
                            tarifaOverride: nuevaTarifaOverride,
                            montosNovedadOverride: montosMap,
                            cantidadHorasNovedadOverride: chMap
                        },
                        novOpts
                    );
                    nextMonto = base.montoCop;
                } else {
                    const val = Math.round(Number(entry.montoCop));
                    montosMap[nid] = val;
                    nextMonto = val;
                }
                if (prevMonto !== nextMonto) {
                    historialEntries.push({
                        observacion: buildAjusteHistorialObservacion(
                            'monto_novedad',
                            prevMonto,
                            entry.montoCop === null ? null : nextMonto,
                            { tipoNovedad: item.tipoNovedad }
                        ),
                        detalle: {
                            campo: 'monto_novedad',
                            novedadId: nid,
                            tipoNovedad: item.tipoNovedad,
                            valorAnterior: prevMonto,
                            valorNuevo: nextMonto,
                            valorMaestro: item.montoMaestro,
                            montoOrigen: item.montoOrigen
                        }
                    });
                }
            }
        }

        if (!historialEntries.length) {
            const error = new Error('No hay cambios para guardar');
            error.status = 400;
            throw error;
        }

        const updateQ = await client.query(
            `UPDATE conciliaciones_facturacion
             SET tarifa_override = $1,
                 montos_novedad_override = $2::jsonb,
                 cantidad_horas_novedad_override = $3::jsonb,
                 updated_at = NOW()
             WHERE id = $4
             RETURNING id, cedula, anio, mes, estado, tarifa_override, montos_novedad_override, cantidad_horas_novedad_override, updated_at`,
            [
                nuevaTarifaOverride,
                JSON.stringify(montosMap),
                JSON.stringify(chMap),
                row.id
            ]
        );

        for (const hist of historialEntries) {
            await client.query(
                `INSERT INTO conciliaciones_facturacion_historial
                    (facturacion_id, cedula, anio, mes, accion, etapa, estado_anterior, estado_nuevo,
                     observacion, detalle, actor_user_id, actor_email, actor_nombre, actor_role)
                 VALUES ($1, $2, $3, $4, 'AJUSTE', 'ANALISTA', $5, $5, $6, $7::jsonb, $8::uuid, $9, $10, $11::user_role)`,
                [
                    row.id,
                    ced,
                    y,
                    m,
                    estadoActual,
                    `${hist.observacion}. ${obs}`,
                    JSON.stringify(hist.detalle),
                    revActor.userId,
                    revActor.email,
                    revActor.nombre,
                    revActor.role
                ]
            );
        }

        await client.query('COMMIT');
        return updateQ.rows[0];
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function listConciliacionFacturacionHistorial(deps, scope, query) {
    const { pool, normalizeCedula } = deps;
    const { cedula, anio, mes } = query || {};
    const ced = normalizeCedula(cedula);
    if (!ced) {
        const error = new Error('Cédula inválida');
        error.status = 400;
        throw error;
    }
    const y = Number(anio);
    const m = Number(mes);
    if (!Number.isFinite(y) || y < 2000 || y > 2100 || !Number.isFinite(m) || m < 1 || m > 12) {
        const error = new Error('Año o mes inválido');
        error.status = 400;
        throw error;
    }

    const colQ = await pool.query(
        `SELECT cliente, cedula
         FROM colaboradores
         WHERE regexp_replace(COALESCE(cedula, ''), '\\D', '', 'g') = $1
         LIMIT 1`,
        [ced]
    );
    if (!colQ.rows[0]) {
        const error = new Error('Colaborador no encontrado');
        error.status = 404;
        throw error;
    }
    const chk = await assertClienteConciliacionPermitido(deps, scope, colQ.rows[0].cliente);
    if (!chk.ok) {
        const error = new Error(chk.error || 'No autorizado');
        error.status = chk.status || 403;
        throw error;
    }

    const q = await pool.query(
        `SELECT id, facturacion_id, cedula, anio, mes, accion, etapa, estado_anterior, estado_nuevo,
                observacion, detalle, actor_user_id, actor_email, actor_nombre, actor_role, created_at
         FROM conciliaciones_facturacion_historial
         WHERE regexp_replace(COALESCE(cedula, ''), '\\D', '', 'g') = $1 AND anio = $2::integer AND mes = $3::integer
         ORDER BY created_at ASC`,
        [ced, y, m]
    );

    return (q.rows || []).map((r) => ({
        id: r.id,
        facturacionId: r.facturacion_id,
        cedula: r.cedula,
        anio: r.anio,
        mes: r.mes,
        accion: r.accion,
        etapa: r.etapa,
        estadoAnterior: r.estado_anterior,
        estadoNuevo: r.estado_nuevo,
        observacion: r.observacion,
        detalle: r.detalle || null,
        actorUserId: r.actor_user_id,
        actorEmail: r.actor_email,
        actorNombre: r.actor_nombre,
        actorRole: r.actor_role,
        createdAt: r.created_at
    }));
}

async function resolveServicioBillingForRevision(deps, scope, clienteCanon, cedula, payload) {
    const y = Number(payload?.anio);
    const m = Number(payload?.mes);
    const servicioId = String(payload?.servicioId || '').trim();
    let serv = null;

    if (typeof deps.listServicios === 'function') {
        const servicios = await deps.listServicios(scope);
        const list = Array.isArray(servicios) ? servicios : [];
        if (servicioId) {
            serv = list.find((s) => String(s.id) === servicioId) || null;
        }
        if (!serv) {
            const cedNorm = deps.normalizeCedula(cedula);
            serv =
                list.find((s) => {
                    if (!sameClienteLabel(s.client, clienteCanon)) return false;
                    const cedulas = Array.isArray(s.consultoresCedulas) ? s.consultoresCedulas : [];
                    return cedulas.some((c) => deps.normalizeCedula(c) === cedNorm);
                }) || null;
        }
    }

    if (serv) {
        const novBucket = resolveNovedadesBucket(y, m, serv.billingType);
        return {
            billingType: serv.billingType,
            servicioId: serv.id,
            novedadesYear: novBucket.year,
            novedadesMonth: novBucket.month
        };
    }

    const novBucket = resolveNovedadesBucket(y, m, null);
    return {
        billingType: null,
        servicioId: null,
        novedadesYear: novBucket.year,
        novedadesMonth: novBucket.month
    };
}

async function revertConciliacionFacturacion(deps, scope, payload, actor) {
    const { pool, normalizeCedula } = deps;
    const { cedula, anio, mes, observacion } = payload || {};
    const obs = String(observacion || '').trim();
    if (!obs) {
        const error = new Error('La observación es obligatoria');
        error.status = 400;
        throw error;
    }

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

    const revActor = buildRevisionActor(actor, scope);
    if (!canRevertConciliacionCierre(revActor.role)) {
        const error = new Error('No autorizado para revertir cierres');
        error.status = 403;
        throw error;
    }

    const colQ = await pool.query('SELECT cliente FROM colaboradores WHERE cedula = $1 LIMIT 1', [ced]);
    if (!colQ.rows[0]) {
        const error = new Error('Colaborador no encontrado');
        error.status = 404;
        throw error;
    }
    const chk = await assertClienteConciliacionPermitido(deps, scope, colQ.rows[0].cliente);
    if (!chk.ok) {
        const error = new Error(chk.error || 'No autorizado');
        error.status = chk.status || 403;
        throw error;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const rowQ = await client.query(
            `SELECT id, estado FROM conciliaciones_facturacion
             WHERE regexp_replace(COALESCE(cedula, ''), '\\D', '', 'g') = $1
               AND anio = $2::integer AND mes = $3::integer
             FOR UPDATE`,
            [ced, y, m]
        );
        const row = rowQ.rows[0];
        if (!row) {
            const error = new Error('No hay cierre de facturación para revertir');
            error.status = 404;
            throw error;
        }

        const estadoAnterior = normalizeEstado(row.estado);
        if (estadoAnterior === 'PENDIENTE') {
            const error = new Error('El consultor ya está en estado Pendiente');
            error.status = 400;
            throw error;
        }

        const updateQ = await client.query(
            `UPDATE conciliaciones_facturacion
             SET estado = 'PENDIENTE',
                 observaciones = NULL,
                 motivo_devolucion = NULL,
                 tarifa_override = NULL,
                 montos_novedad_override = '{}'::jsonb,
                 cantidad_horas_novedad_override = '{}'::jsonb,
                 factura_fv = NULL,
                 fecha_radicacion = NULL,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING id, cedula, anio, mes, estado, updated_at`,
            [row.id]
        );

        await client.query(
            `INSERT INTO conciliaciones_facturacion_historial
                (facturacion_id, cedula, anio, mes, accion, etapa, estado_anterior, estado_nuevo,
                 observacion, actor_user_id, actor_email, actor_nombre, actor_role)
             VALUES ($1, $2, $3, $4, 'REVERTIR', 'ANALISTA', $5, 'PENDIENTE', $6, $7::uuid, $8, $9, $10::user_role)`,
            [
                row.id,
                ced,
                y,
                m,
                estadoAnterior,
                obs,
                revActor.userId,
                revActor.email,
                revActor.nombre,
                revActor.role
            ]
        );

        await liberarNovedadesConsumidas(client, row.id);

        await client.query('COMMIT');
        return { reverted: 1, row: updateQ.rows[0] };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/** @deprecated alias — revierte cierre preservando historial */
async function deleteConciliacionFacturacion(deps, scope, payload, actor) {
    return revertConciliacionFacturacion(deps, scope, payload, actor);
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
    const role = String(scope?.role || '').trim().toLowerCase();
    if (!canBypassEstadoChange(role)) {
        const error = new Error('La acción masiva de estado debe hacerse mediante revisión de aprobación');
        error.status = 403;
        throw error;
    }
    const { cliente, anio, mes, estado, facturaFv, fechaRadicacion, motivoDevolucion, observaciones, cedulas: cedulasPayload } = payload;
    
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
    const obs = observaciones !== undefined ? (observaciones === null ? null : String(observaciones).trim()) : null;

    // Obtener cédulas visibles en el mes (activos + salidas del mes M)
    const visibilidadSql = colaboradorVisibleEnMesSql('c', 2, 3);
    const colQ = await pool.query(
        `SELECT c.cedula FROM colaboradores c
         WHERE lower(btrim(COALESCE(c.cliente, ''))) = lower(btrim($1::text))
           AND ${visibilidadSql}`,
        [chk.canon, y, m]
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
                `INSERT INTO conciliaciones_facturacion (cedula, anio, mes, estado, factura_fv, fecha_radicacion, motivo_devolucion, observaciones, fecha_cierre, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, CURRENT_DATE, NOW())
                 ON CONFLICT (cedula, anio, mes)
                 DO UPDATE SET 
                    estado = EXCLUDED.estado,
                    factura_fv = EXCLUDED.factura_fv,
                    fecha_radicacion = EXCLUDED.fecha_radicacion,
                    motivo_devolucion = EXCLUDED.motivo_devolucion,
                    observaciones = COALESCE(EXCLUDED.observaciones, conciliaciones_facturacion.observaciones),
                    fecha_cierre = CURRENT_DATE,
                    updated_at = NOW()`,
                [ced, y, m, est, fv, fRad, mot, obs]
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

// ==========================================
// SERVICIOS (Facturacion Consultores)
// ==========================================

async function listServicios(deps, scope) {
    const { pool } = deps;
    const allowedClients = await listConciliacionesClientes(deps, scope);
    if (!allowedClients.length) return [];

    const q = await pool.query(
        `SELECT s.id, s.cliente, s.nombre_servicio, s.inicio_contrato, s.dia_cierre, s.modo_facturacion, s.tipo_facturacion, s.horas_base, s.created_at,
                (SELECT COUNT(*) FROM servicio_consultores sc WHERE sc.servicio_id = s.id) AS consultores_count
         FROM servicios s
         WHERE lower(btrim(COALESCE(s.cliente, ''))) = ANY($1::text[])
         ORDER BY s.created_at DESC`,
        [allowedClients.map(c => String(c).toLowerCase())]
    );

    return q.rows.map(r => ({
        id: r.id,
        client: String(r.cliente || '').trim(),
        serviceName: String(r.nombre_servicio || '').trim(),
        inicioContrato: r.inicio_contrato ? r.inicio_contrato.toISOString().slice(0, 10) : '',
        diaCierre: Number(r.dia_cierre),
        modoFacturacion: String(r.modo_facturacion || '').trim(),
        tipoFacturacion: r.tipo_facturacion ? String(r.tipo_facturacion).trim() : '',
        horasBase: r.horas_base != null ? Number(r.horas_base) : null,
        consultoresCount: Number(r.consultores_count || 0),
        createdAt: r.created_at
    }));
}

async function createServicio(deps, scope, payload) {
    const { pool } = deps;
    const cliente = payload.client;
    const nombreServicio = payload.serviceName;
    const inicioContrato = payload.inicio_contrato || payload.inicioContrato;
    const diaCierreRaw = payload.dia_cierre !== undefined ? payload.dia_cierre : payload.diaCierre;
    const modoFacturacion = payload.modo_facturacion || payload.modoFacturacion;
    const tipoFacturacion = payload.tipo_facturacion || payload.tipoFacturacion;
    const horasBase = payload.horas_base !== undefined ? payload.horas_base : payload.horasBase;

    const diaCierre = Number(diaCierreRaw);
    if (isNaN(diaCierre) || diaCierre < 1 || diaCierre > 31) {
        const error = new Error('El día de cierre debe ser un número entero entre 1 y 31');
        error.status = 400;
        throw error;
    }

    const chk = await assertClienteConciliacionPermitido(deps, scope, cliente);
    if (!chk.ok) {
        const error = new Error(chk.error || 'No autorizado para este cliente');
        error.status = chk.status || 403;
        throw error;
    }

    const q = await pool.query(
        `INSERT INTO servicios (cliente, nombre_servicio, inicio_contrato, dia_cierre, modo_facturacion, tipo_facturacion, horas_base)
         VALUES ($1, $2, $3::date, $4, $5, $6, $7)
         RETURNING id, cliente, nombre_servicio, inicio_contrato, dia_cierre, modo_facturacion, tipo_facturacion, horas_base`,
        [chk.canon, nombreServicio, inicioContrato, diaCierre, modoFacturacion, tipoFacturacion, horasBase]
    );

    const r = q.rows[0];
    return {
        id: r.id,
        client: r.cliente,
        serviceName: r.nombre_servicio,
        inicioContrato: r.inicio_contrato.toISOString().slice(0, 10),
        diaCierre: r.dia_cierre,
        modoFacturacion: r.modo_facturacion,
        tipoFacturacion: r.tipo_facturacion ? String(r.tipo_facturacion).trim() : '',
        horasBase: r.horas_base != null ? Number(r.horas_base) : null
    };
}

async function updateServicio(deps, scope, idServicio, payload) {
    const { pool } = deps;
    const cliente = payload.client;
    const nombreServicio = payload.serviceName;
    const inicioContrato = payload.inicio_contrato || payload.inicioContrato;
    const diaCierreRaw = payload.dia_cierre !== undefined ? payload.dia_cierre : payload.diaCierre;
    const modoFacturacion = payload.modo_facturacion || payload.modoFacturacion;
    const tipoFacturacion = payload.tipo_facturacion || payload.tipoFacturacion;
    const horasBase = payload.horas_base !== undefined ? payload.horas_base : payload.horasBase;

    const diaCierre = Number(diaCierreRaw);
    if (isNaN(diaCierre) || diaCierre < 1 || diaCierre > 31) {
        const error = new Error('El día de cierre debe ser un número entero entre 1 y 31');
        error.status = 400;
        throw error;
    }

    // Primero validar cliente anterior
    const sQ = await pool.query(`SELECT cliente FROM servicios WHERE id = $1`, [idServicio]);
    if (sQ.rows.length === 0) {
        const err = new Error('Servicio no encontrado');
        err.status = 404;
        throw err;
    }
    const oldCliente = sQ.rows[0].cliente;

    const chkOld = await assertClienteConciliacionPermitido(deps, scope, oldCliente);
    if (!chkOld.ok) {
        const error = new Error('No autorizado para modificar este servicio');
        error.status = 403;
        throw error;
    }

    const chkNew = await assertClienteConciliacionPermitido(deps, scope, cliente);
    if (!chkNew.ok) {
        const error = new Error('No autorizado para asignar a este nuevo cliente');
        error.status = 403;
        throw error;
    }

    const q = await pool.query(
        `UPDATE servicios
         SET cliente = $1, nombre_servicio = $2, inicio_contrato = $3::date, dia_cierre = $4, modo_facturacion = $5, tipo_facturacion = $6, horas_base = $7
         WHERE id = $8
         RETURNING id, cliente, nombre_servicio, inicio_contrato, dia_cierre, modo_facturacion, tipo_facturacion, horas_base`,
        [chkNew.canon, nombreServicio, inicioContrato, diaCierre, modoFacturacion, tipoFacturacion, horasBase, idServicio]
    );

    const r = q.rows[0];
    return {
        id: r.id,
        client: r.cliente,
        serviceName: r.nombre_servicio,
        inicioContrato: r.inicio_contrato.toISOString().slice(0, 10),
        diaCierre: r.dia_cierre,
        modoFacturacion: r.modo_facturacion,
        tipoFacturacion: r.tipo_facturacion ? String(r.tipo_facturacion).trim() : '',
        horasBase: r.horas_base != null ? Number(r.horas_base) : null
    };
}

async function deleteServicio(deps, scope, idServicio) {
    const { pool } = deps;

    // Primero validar cliente
    const sQ = await pool.query(`SELECT cliente FROM servicios WHERE id = $1`, [idServicio]);
    if (sQ.rows.length === 0) {
        const err = new Error('Servicio no encontrado');
        err.status = 404;
        throw err;
    }
    const cliente = sQ.rows[0].cliente;

    const chk = await assertClienteConciliacionPermitido(deps, scope, cliente);
    if (!chk.ok) {
        const error = new Error('No autorizado para eliminar este servicio');
        error.status = 403;
        throw error;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Primero eliminar relaciones de consultores
        await client.query(`DELETE FROM servicio_consultores WHERE servicio_id = $1`, [idServicio]);
        // Luego eliminar el servicio
        await client.query(`DELETE FROM servicios WHERE id = $1`, [idServicio]);
        await client.query('COMMIT');
        return { success: true };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}


async function listServicioConsultores(deps, scope, servicioId) {
    const { pool } = deps;
    
    // Primero obtener el servicio para validar cliente
    const sQ = await pool.query(`SELECT cliente FROM servicios WHERE id = $1`, [servicioId]);
    if (sQ.rows.length === 0) {
        const err = new Error('Servicio no encontrado');
        err.status = 404;
        throw err;
    }
    const cliente = sQ.rows[0].cliente;

    const chk = await assertClienteConciliacionPermitido(deps, scope, cliente);
    if (!chk.ok) {
        const error = new Error(chk.error || 'No autorizado');
        error.status = chk.status || 403;
        throw error;
    }

    // Obtener colaboradores disponibles: excluir los ya asociados a otro servicio del mismo cliente
    const q = await pool.query(
        `SELECT c.cedula, c.nombre, c.tarifa_cliente, c.costo_empresa, c.moneda, sc.licencias, sc.equipo, sc.otras_dotaciones,
                CASE WHEN sc.servicio_id IS NOT NULL THEN TRUE ELSE FALSE END as asociado
         FROM colaboradores c
         LEFT JOIN servicio_consultores sc ON c.cedula = sc.cedula AND sc.servicio_id = $1
         WHERE c.activo IS NOT FALSE
           AND lower(btrim(COALESCE(c.cliente, ''))) = lower(btrim($2::text))
           AND (
             sc.servicio_id IS NOT NULL
             OR NOT EXISTS (
               SELECT 1
               FROM servicio_consultores sc3
               JOIN servicios s3 ON s3.id = sc3.servicio_id
               WHERE sc3.servicio_id <> $1
                 AND sc3.cedula = c.cedula
                 AND lower(btrim(COALESCE(s3.cliente, ''))) = lower(btrim($2::text))
             )
           )
         ORDER BY c.nombre ASC`,
        [servicioId, chk.canon]
    );

    return q.rows.map(r => ({
        cedula: r.cedula,
        nombre: r.nombre,
        licencias: r.licencias || '',
        equipo: r.equipo || '',
        otrasDotaciones: r.otras_dotaciones || '',
        tarifaCliente: r.tarifa_cliente != null ? Number(r.tarifa_cliente) : null,
        costoCinte: r.costo_empresa != null ? Number(r.costo_empresa) : null,
        moneda: r.moneda ? String(r.moneda).trim() : 'COP',
        asociado: Boolean(r.asociado)
    }));
}

async function upsertServicioConsultores(deps, scope, servicioId, consultoresAsociados) {
    const { pool, normalizeCedula } = deps;

    const sQ = await pool.query(`SELECT cliente FROM servicios WHERE id = $1`, [servicioId]);
    if (sQ.rows.length === 0) {
        const err = new Error('Servicio no encontrado');
        err.status = 404;
        throw err;
    }
    const cliente = sQ.rows[0].cliente;

    const chk = await assertClienteConciliacionPermitido(deps, scope, cliente);
    if (!chk.ok) {
        const error = new Error(chk.error || 'No autorizado');
        error.status = chk.status || 403;
        throw error;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Eliminar asociaciones actuales de este servicio (para re-crearlas y así manejar las desasociaciones)
        await client.query(`DELETE FROM servicio_consultores WHERE servicio_id = $1`, [servicioId]);

        const cedulasNuevas = (consultoresAsociados || [])
            .map((c) => normalizeCedula(c?.cedula))
            .filter(Boolean);

        if (cedulasNuevas.length) {
            // Un consultor solo puede estar en un servicio por cliente
            await client.query(
                `DELETE FROM servicio_consultores sc
                 USING servicios s
                 WHERE sc.servicio_id = s.id
                   AND sc.servicio_id <> $1
                   AND lower(btrim(COALESCE(s.cliente, ''))) = lower(btrim($2::text))
                   AND regexp_replace(COALESCE(sc.cedula, ''), '\\D', '', 'g') = ANY($3::text[])`,
                [servicioId, chk.canon, cedulasNuevas]
            );
        }

        for (const c of consultoresAsociados) {
            // Validar que el consultor realmente pertenezca al cliente (por seguridad)
            const colChk = await client.query(
                `SELECT 1 FROM colaboradores WHERE cedula = $1 AND lower(btrim(COALESCE(cliente, ''))) = lower(btrim($2::text)) AND activo IS NOT FALSE`,
                [c.cedula, chk.canon]
            );
            
            if (colChk.rows.length > 0) {
                await client.query(
                    `INSERT INTO servicio_consultores (servicio_id, cedula, licencias, equipo, otras_dotaciones)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [servicioId, c.cedula, c.licencias || null, c.equipo || null, c.otrasDotaciones || null]
                );
            }
        }

        await client.query('COMMIT');
        return { success: true };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Marca servicio/mes como CONCILIADA (requiere ENVIADA previa).
 */
async function markConciliacionServicioConciliada(deps, scope, payload, actor) {
    const { pool } = deps;
    const servicioId = String(payload?.servicioId || '').trim();
    const year = Number(payload?.anio ?? payload?.year);
    const month = Number(payload?.mes ?? payload?.month);
    if (!servicioId) {
        const error = new Error('servicioId requerido');
        error.status = 400;
        throw error;
    }
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
        const error = new Error('Año y mes inválidos');
        error.status = 400;
        throw error;
    }

    if (typeof deps.listServicios === 'function') {
        const servicios = await deps.listServicios(scope);
        const serv = (Array.isArray(servicios) ? servicios : []).find((s) => String(s.id) === servicioId);
        if (!serv) {
            const error = new Error('Servicio no encontrado');
            error.status = 404;
            throw error;
        }
        const chk = await assertClienteConciliacionPermitido(deps, scope, serv.client);
        if (!chk.ok) {
            const error = new Error(chk.error || 'No autorizado');
            error.status = chk.status || 403;
            throw error;
        }
    }

    const revActor = buildRevisionActor(actor, scope);
    return markServicioConciliada(pool, scope, {
        servicioId,
        year,
        month,
        actor: revActor
    });
}

/**
 * Cola de cierres del mes: agrega por servicio intersectando consultores asociados con filas del mes.
 * @param {object[]} servicios - lista de servicios (p. ej. Dynamo) con consultoresCedulas
 * @returns {Promise<{ items: object[], count: number }>}
 */
async function getColaCierresPorMes(deps, scope, year, month, clienteOpcional, servicios) {
    let serviciosList = Array.isArray(servicios) ? servicios : [];
    const clienteFilter = String(clienteOpcional || '').trim();

    if (clienteFilter) {
        const canon = await resolveClienteCanon(deps, clienteFilter);
        if (canon) {
            serviciosList = serviciosList.filter((s) => sameClienteLabel(s.client, canon));
        } else {
            serviciosList = [];
        }
    }

    /** @type {Map<string, object[]>} */
    const byClient = new Map();
    for (const s of serviciosList) {
        const cl = String(s.client || '').trim();
        if (!cl) continue;
        if (!byClient.has(cl)) byClient.set(cl, []);
        byClient.get(cl).push(s);
    }

    const items = [];
    for (const [clienteCanon, servs] of byClient) {
        /** @type {Map<string, Promise<{ rows: object[], totales: object }>>} */
        const resumenCache = new Map();

        const buildColaItem = async (serv) => {
            const novBucket = resolveNovedadesBucket(year, month, serv.billingType);
            const cacheKey = `${novBucket.year}-${novBucket.month}|${year}-${month}|${serv.billingMode || ''}|${serv.baseHours ?? ''}`;
            if (!resumenCache.has(cacheKey)) {
                resumenCache.set(
                    cacheKey,
                    getConciliacionResumenPorClienteMes(deps, scope, clienteCanon, year, month, {
                        novedadesYear: novBucket.year,
                        novedadesMonth: novBucket.month,
                        billingType: serv.billingType,
                        billingMode: serv.billingMode,
                        baseHours: serv.baseHours
                    })
                );
            }
            const payload = await resumenCache.get(cacheKey);
            const rowsBase = payload.rows || [];
            const cedulas = Array.isArray(serv.consultoresCedulas) ? serv.consultoresCedulas : [];
            const rows = await enrichConciliacionRowsWithServicioCedulas(
                deps,
                scope,
                rowsBase,
                cedulas,
                clienteCanon,
                year,
                month,
                {
                    novedadesYear: novBucket.year,
                    novedadesMonth: novBucket.month,
                    billingType: serv.billingType,
                    billingMode: serv.billingMode,
                    baseHours: serv.baseHours
                }
            );
            const merged = mergeConciliacionServicioRows(rows, cedulas);
            const filtered = filterRowsByServicioLideres(
                merged,
                serv.lideresAsociados || serv.lideres_asociados,
                cedulas
            );
            const lideresDistintos = [
                ...new Set(filtered.map((r) => String(r.lider || '').trim()).filter(Boolean))
            ];
            const agg = aggregateConciliacionRows(filtered);
            await ensureListoExportIfCompleto(deps.pool, serv.id, year, month, agg);
            const cierreRow = await getServicioCierreRow(deps.pool, serv.id, year, month);
            const cierreApi = mapServicioCierreToApi(cierreRow);
            const tokenMeta = await getLatestViewTokenMeta(
                deps.pool,
                serv.id,
                year,
                month,
                agg.consultoresTotal
            );
            return {
                servicioId: serv.id,
                client: serv.client,
                serviceName: serv.serviceName,
                closingDay: serv.closingDay,
                billingMode: serv.billingMode,
                billingType: serv.billingType,
                baseHours: serv.baseHours != null ? Number(serv.baseHours) : null,
                initDate: serv.initDate || '',
                consultoresCedulas: cedulas.map((c) => String(c || '').trim()).filter(Boolean),
                lideresAsociados: Array.isArray(serv.lideresAsociados)
                    ? serv.lideresAsociados
                    : Array.isArray(serv.lideres_asociados)
                      ? serv.lideres_asociados
                      : [],
                lideresDistintos,
                consultoresTotal: agg.consultoresTotal,
                consultoresCerrados: agg.consultoresCerrados,
                consultoresConNovedad: agg.consultoresConNovedad,
                estados: agg.estados,
                totales: agg.totales,
                estadoCola: deriveEstadoCola(agg),
                ...cierreApi,
                ...tokenMeta
            };
        };

        const servItems = await mapWithConcurrency(servs, 5, buildColaItem);
        items.push(...servItems);
    }

    const sorted = sortColaCierresItems(items);
    return { items: sorted, count: sorted.length };
}

async function createConciliacionNovedadManual(deps, scope, payload, actor) {
    const { createConciliacionNovedadManual: createManual } = require('./conciliacionNovedadManual');
    return createManual(deps, scope, payload, actor);
}

module.exports = {
    effectiveNovedadDateSql,
    monthRangeDates,
    resolveClienteCanon,
    listConciliacionesClientes,
    isWideConciliacionRole,
    mergeConciliacionClientesLists,
    assertClienteConciliacionPermitido,
    parseNovedadesImpactOptions,
    novedadesImpactOptionsFromBillingType,
    getConciliacionResumenPorClienteMes,
    enrichConciliacionRowsWithServicioCedulas,
    getConciliacionResumenTodosClientesMes,
    listConciliacionNovedadesDetalle,
    getConciliacionesDashboardResumen,
    listDashboardLiderClienteRows,
    upsertConciliacionFacturacion,
    applyConciliacionFacturacionRevision,
    applyConciliacionFacturacionRevisionMasiva,
    applyConciliacionFacturacionAjustes,
    listConciliacionFacturacionHistorial,
    upsertConciliacionFacturacionMasiva,
    deleteConciliacionFacturacion,
    revertConciliacionFacturacion,
    listConciliacionesFacturacion,
    getColaCierresPorMes,
    markConciliacionServicioConciliada,
    createConciliacionNovedadManual,
    listServicios,
    createServicio,
    updateServicio,
    deleteServicio,
    listServicioConsultores,
    upsertServicioConsultores
};
