const { z } = require('zod');
const crypto = require('node:crypto');
const { buildColaboradorExtendedZodShape } = require('../colaboradores/colaboradoresExtendedZod');
const { normalizeCatalogValue } = require('../utils');
const { foldForMatch } = require('../cotizador/clienteNombreMatch');
const { normalizeRoleOrNull } = require('../rbac');
const { semaforoFromDiasRestantes } = require('../reubicaciones/reubicacionesSemaforo');
const { aprobarMallaTurnosMes } = require('../mallaTurnoHeExport');
const { resolveActorUserIdForSession } = require('../resolveActorUserId');
const { reubicacionesGuard, canRegisterObservacion, canDecideAptitud } = require('../reubicaciones/reubicacionesAuthService');
const { registrarObservacion, obtenerUltimaObservacion, obtenerHistorialObservaciones } = require('../reubicaciones/reubicacionesObservacionesService');
const { registrarDecision, obtenerUltimaDecision, obtenerHistorialDecisiones } = require('../reubicaciones/reubicacionesDecisionesService');
const { calcularEstado, ESTADOS } = require('../reubicaciones/reubicacionesEstados');
const { diasHabilesTranscurridos } = require('../reubicaciones/reubicacionesCalendario');
const { getFestivosSet } = require('../festivosService');

function directorioGuard() {
    return (req, res, next) => {
        const role = normalizeRoleOrNull(req.user?.role);
        if (role !== 'super_admin' && role !== 'cac') {
            return res.status(403).json({ ok: false, error: 'Sin permiso para el directorio maestro.' });
        }
        return next();
    };
}

/** AUT-576: mallas-turnos sin panel directorio (GP + super_admin/cac). */
function mallasRoleGuard() {
    return (req, res, next) => {
        const role = normalizeRoleOrNull(req.user?.role);
        if (role === 'super_admin' || role === 'cac' || role === 'gp') {
            return next();
        }
        return res.status(403).json({ ok: false, error: 'Sin permiso para mallas de turnos.' });
    };
}

function canAprobarMallaRole(role) {
    const r = normalizeRoleOrNull(role);
    return r === 'super_admin' || r === 'cac' || r === 'gp';
}

async function writeAudit(pool, row) {
    try {
        await pool.query(
            `INSERT INTO audit_log (actor_user_id, actor_role, action, entity_type, entity_id, metadata)
             VALUES ($1::uuid, $2::user_role, $3, $4, $5::uuid, $6::jsonb)`,
            [
                row.actorUserId,
                row.actorRole || null,
                row.action,
                row.entityType,
                row.entityId || null,
                JSON.stringify(row.metadata || {})
            ]
        );
    } catch (e) {
        console.warn('[Directorio] audit_log omitido:', e.message);
    }
}

function parseUuidActor(sub) {
    const s = String(sub || '').trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) return s;
    return null;
}

function appendAptitudFilter(whereParts, params, decision, pipelineAlias = 'rp') {
    const normalized = String(decision || '').toUpperCase();
    if (normalized === 'APTO' || normalized === 'NO_APTO') {
        const index = params.length + 1;
        whereParts.push(`EXISTS (SELECT 1 FROM reubicaciones_decisiones rd WHERE rd.pipeline_id = ${pipelineAlias}.id AND rd.decision = $${index})`);
        params.push(normalized);
    } else if (normalized === 'SIN_DECISION') {
        whereParts.push(`NOT EXISTS (SELECT 1 FROM reubicaciones_decisiones rd WHERE rd.pipeline_id = ${pipelineAlias}.id)`);
    }
}

async function assertColaboradorCatalogPair(getLideresByCliente, cliente, lider) {
    const c = normalizeCatalogValue(cliente);
    const l = normalizeCatalogValue(lider);
    if (!c || !l) return;
    const lista = await getLideresByCliente(c);
    const ok = lista.some((li) => foldForMatch(li) === foldForMatch(l));
    if (!ok) {
        throw Object.assign(new Error('Cliente y líder no forman un par válido en el catálogo activo.'), { status: 400 });
    }
}

function registerDirectorioRoutes(deps) {
    const {
        app,
        pool,
        verificarToken,
        allowPanel,
        adminActionLimiter,
        getLideresByCliente,
        getAreaFromRole,
        listClientesLideresPaged,
        listClientesLideresByClienteSummaryPaged,
        insertClienteLider,
        updateClienteLiderById,
        deleteClienteLiderById,
        listColaboradoresPaged,
        insertColaborador,
        updateColaboradorByCedula,
        deleteColaboradorByCedula,
        listGpUsersForDirectorio,
        insertGpUserPlaceholder,
        updateGpUserById,
        resolveOrCreateGpUserIdForColaboradorCedula,
        clearGpUserReferences,
        linkGpCognitoSubByEmail,
        normalizeCedula,
        listMallaTurnosCeldasRange,
        upsertMallaTurnosCeldas,
        getMallaTurnoAprobacionStatus,
        getMallaNocturnoConfig,
        upsertMallaNocturnoConfig,
        getColaboradorByCedula,
        listAssignedClientesForGpUserId,
        resolveGpInternalUserIdForScope
    } = deps;

    /** Lecturas: sin adminActionLimiter (200/hora incluía cada GET y bloqueaba uso normal del directorio). */
    const readGuard = [verificarToken, allowPanel('directorio'), directorioGuard()];
    /** Escrituras: mismo límite que cotizador/guardar (costosas / abuso). */
    const writeGuard = [verificarToken, allowPanel('directorio'), adminActionLimiter, directorioGuard()];
    /** AUT-576: rutas mallas (GP sin panel directorio). */
    const mallasReadGuard = [verificarToken, mallasRoleGuard()];
    const mallasWriteGuard = [verificarToken, mallasRoleGuard(), adminActionLimiter];
    
    const reubicacionesWriteRoleGuard = (req, res, next) => {
        const role = normalizeRoleOrNull(req.user?.role) || req.user?.role;
        if (role === 'atraccion_talento') {
            return res.status(403).json({ ok: false, error: 'Atracción de Talento tiene acceso de solo lectura.' });
        }
        next();
    };

    const reubReadGuard = [verificarToken, reubicacionesGuard];
    const reubWriteGuard = [verificarToken, reubicacionesGuard, reubicacionesWriteRoleGuard, adminActionLimiter];
    
    const colaboradoresRoleGuard = () => {
        return (req, res, next) => {
            const role = normalizeRoleOrNull(req.user?.role);
            if (role === 'super_admin' || role === 'cac' || role === 'gp') {
                return next();
            }
            return res.status(403).json({ ok: false, error: 'Sin permiso para consultar colaboradores.' });
        };
    };
    const colaboradoresReadGuard = [verificarToken, colaboradoresRoleGuard()];


    async function assertGpClienteAsignado(req, clienteRaw) {
        const role = normalizeRoleOrNull(req.user?.role);
        if (role !== 'gp') return;
        const cliente = normalizeCatalogValue(clienteRaw);
        if (!cliente) {
            throw Object.assign(new Error('Cliente es obligatorio.'), { status: 400 });
        }
        const gpEmail = String(req.user?.email || '')
            .trim()
            .toLowerCase();
        const gpUserId = parseUuidActor(req.user?.sub);
        if (typeof listAssignedClientesForGpUserId !== 'function' || typeof resolveGpInternalUserIdForScope !== 'function') {
            throw Object.assign(new Error('Alcance GP no configurado.'), { status: 500 });
        }
        const gpId = await resolveGpInternalUserIdForScope({ gpEmail, gpUserId });
        const assigned = await listAssignedClientesForGpUserId(gpId);
        const fold = foldForMatch(cliente);
        const ok = assigned.some((c) => foldForMatch(c) === fold);
        if (!ok) {
            throw Object.assign(new Error('Sin permiso para este cliente.'), { status: 403 });
        }
    }

    const clienteLiderListSchema = z.object({
        activo: z.enum(['true', 'false', 'all']).optional(),
        q: z.string().max(200).optional(),
        cliente: z.string().min(1).max(500).optional(),
        limit: z.coerce.number().int().min(1).max(2000).optional(),
        offset: z.coerce.number().int().min(0).optional()
    });

    const clienteLiderCreateSchema = z
        .object({
            cliente: z.string().min(1).max(500),
            lider: z.string().min(1).max(500),
            nit: z.string().min(1).max(40),
            gp_user_id: z.string().uuid().optional().nullable(),
            gp_colaborador_cedula: z.string().min(5).max(20).optional().nullable()
        })
        .superRefine((data, ctx) => {
            if (data.gp_user_id && data.gp_colaborador_cedula) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Usa gp_user_id o gp_colaborador_cedula, no ambos.'
                });
            }
            const nd = String(data.nit || '').replace(/\D/g, '');
            if (!nd) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'NIT obligatorio (al menos un dígito)',
                    path: ['nit']
                });
            }
        });

    const clienteLiderPatchSchema = z
        .object({
            activo: z.boolean().optional(),
            cliente: z.string().min(1).max(500).optional(),
            lider: z.string().min(1).max(500).optional(),
            gp_user_id: z.string().uuid().optional().nullable(),
            gp_colaborador_cedula: z.string().min(5).max(20).optional().nullable(),
            nit: z.string().max(40).optional()
        })
        .superRefine((data, ctx) => {
            if (data.gp_user_id && data.gp_colaborador_cedula) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Usa gp_user_id o gp_colaborador_cedula, no ambos.'
                });
            }
            const touches =
                data.cliente !== undefined ||
                data.lider !== undefined ||
                data.gp_user_id !== undefined ||
                data.gp_colaborador_cedula !== undefined;
            if (!touches) return;
            const nd = data.nit !== undefined ? String(data.nit).replace(/\D/g, '') : '';
            if (!nd) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'NIT obligatorio al actualizar cliente, líder o GP',
                    path: ['nit']
                });
            }
        });

    async function resolveGpForClienteLiderPayload(parsedData) {
        if (parsedData.gp_colaborador_cedula) {
            const resolved = await resolveOrCreateGpUserIdForColaboradorCedula(parsedData.gp_colaborador_cedula);
            return { gpUserId: resolved.gp_user_id, gpResolution: resolved };
        }
        const gpUserId = parsedData.gp_user_id ?? null;
        return { gpUserId, gpResolution: null };
    }

    const colabListSchema = z.object({
        activo: z.enum(['true', 'false', 'all']).optional(),
        q: z.string().max(200).optional(),
        /** Filtro exacto por cliente (nombre canónico en colaboradores.cliente). */
        cliente: z.string().min(1).max(500).optional(),
        /** Filtro exacto por tipo de contrato; «Sin clasificar» = vacío en BD. */
        tipo_contrato: z.string().max(200).optional(),
        limit: z.coerce.number().int().min(1).max(1000).optional(),
        offset: z.coerce.number().int().min(0).optional(),
        sort: z.enum(['nombre', 'cedula', 'codigo', 'correo', 'cliente', 'lider', 'activo']).optional(),
        dir: z.enum(['asc', 'desc']).optional()
    });

    const mallaTurnoFranjaEnum = z.enum(['06_14', '14_22', '22_06']);
    const mallaIsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    const mallasTurnosListSchema = z
        .object({
            cliente: z.string().min(1).max(500),
            desde: mallaIsoDate,
            hasta: mallaIsoDate,
            origen: z.enum(['mallas', 'nocturnos']).optional()
        })
        .superRefine((data, ctx) => {
            if (data.desde > data.hasta) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'desde debe ser anterior o igual a hasta', path: ['hasta'] });
            }
            const t0 = new Date(`${data.desde}T12:00:00`);
            const t1 = new Date(`${data.hasta}T12:00:00`);
            const spanDays = Math.floor((t1.getTime() - t0.getTime()) / 86400000) + 1;
            if (spanDays > 400) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Rango máximo 400 días', path: ['hasta'] });
            }
        });
    const mallaHhMm = z.string().regex(/^\d{2}:\d{2}$/);
    const mallaPatchModeEnum = z.enum(['replace', 'merge']);
    const mallasTurnosPutSchema = z.object({
        cliente: z.string().min(1).max(500),
        patches: z
            .array(
                z
                    .object({
                        fecha: mallaIsoDate,
                        franja: mallaTurnoFranjaEnum,
                        cedulas: z.array(z.string().min(5).max(24)).max(10),
                        horaInicio: mallaHhMm.optional(),
                        horaFin: mallaHhMm.optional(),
                        mode: mallaPatchModeEnum.optional(),
                        origen: z.enum(['mallas', 'nocturnos']).optional()
                    })
                    .refine(
                        (p) =>
                            (p.horaInicio == null && p.horaFin == null) ||
                            (p.horaInicio != null && p.horaFin != null),
                        { message: 'horaInicio y horaFin deben enviarse juntos' }
                    )
            )
            .max(1200)
    });

    const describeMallaPutValidationError = (zodError) => {
        const issue = zodError?.issues?.[0];
        if (!issue) return 'Datos inválidos al guardar la malla.';
        const path = (Array.isArray(issue.path) ? issue.path : []).map((p) => String(p));
        const has = (key) => path.includes(key);
        if (has('cliente')) return 'Selecciona un cliente válido.';
        if (has('cedulas')) {
            return 'Cédula inválida (entre 5 y 24 caracteres) o más de 10 personas por franja.';
        }
        if (has('fecha')) return 'Una de las fechas seleccionadas no es válida.';
        if (has('franja')) return 'Franja horaria inválida.';
        if (has('horaInicio') || has('horaFin')) {
            return 'Horario nocturno inválido: usa formato HH:MM y envía inicio y fin juntos.';
        }
        if (has('mode')) return 'Modo de asignación inválido.';
        if (has('patches')) return 'Demasiados cambios en una sola operación.';
        return issue.message || 'Datos inválidos al guardar la malla.';
    };

    const mallaNocturnoConfigPutSchema = z.object({
        horaInicio: mallaHhMm,
        horaFin: mallaHhMm
    });

    const mallaVariantEnum = z.enum(['mallas', 'nocturnos']);
    const mallasTurnosAprobacionQuerySchema = z.object({
        cliente: z.string().min(1).max(500),
        anio: z.coerce.number().int().min(2000).max(2100),
        mes: z.coerce.number().int().min(1).max(12),
        variant: mallaVariantEnum
    });
    const mallasTurnosAprobarBodySchema = z.object({
        cliente: z.string().min(1).max(500),
        anio: z.coerce.number().int().min(2000).max(2100),
        mes: z.coerce.number().int().min(1).max(12),
        variant: mallaVariantEnum
    });

    const colabExtendedShape = buildColaboradorExtendedZodShape();

    const colabCreateSchema = z.object({
        cedula: z.string().min(5).max(20),
        nombre: z.string().min(2).max(400),
        correo_cinte: z.string().email().max(320).optional().nullable(),
        cliente: z.string().max(500).optional().nullable(),
        lider_catalogo: z.string().max(500).optional().nullable(),
        gp_user_id: z.string().uuid().optional().nullable(),
        activo: z.boolean().optional(),
        ...colabExtendedShape
    });

    const colabPatchSchema = z.object({
        nombre: z.string().min(2).max(400).optional(),
        correo_cinte: z.string().email().max(320).optional().nullable(),
        cliente: z.string().max(500).optional().nullable(),
        lider_catalogo: z.string().max(500).optional().nullable(),
        gp_user_id: z.string().uuid().optional().nullable(),
        activo: z.boolean().optional(),
        ...colabExtendedShape
    });

    const gpCreateSchema = z.object({
        email: z.string().email().max(320),
        full_name: z.string().min(2).max(400)
    });

    const gpPatchSchema = z.object({
        full_name: z.string().min(2).max(400).optional(),
        is_active: z.boolean().optional()
    });

    const clienteResumenListSchema = z.object({
        activo: z.enum(['true', 'false', 'all']).optional(),
        q: z.string().max(200).optional(),
        limit: z.coerce.number().int().min(1).max(2000).optional(),
        offset: z.coerce.number().int().min(0).optional()
    });

    const reubicacionesPipelineListSchema = z.object({
        q: z.string().max(200).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
        offset: z.coerce.number().int().min(0).optional(),
        fecha_fin_desde: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
        fecha_fin_hasta: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
        apto_no_apto: z.enum(['APTO', 'NO_APTO', 'SIN_DECISION']).optional(),
        estado: z.preprocess((val) => {
            if (val == null || val === '') return undefined;
            const arr = Array.isArray(val) ? val : String(val).split(',');
            const cleaned = arr.map((s) => String(s).trim()).filter(Boolean);
            return cleaned.length ? cleaned : undefined;
        }, z.array(z.enum(['Pendiente', 'En proceso', 'Con novedad'])).optional()),
        sort: z
            .enum([
                'cedula',
                'consultor',
                'tipo_contrato',
                'cliente_actual',
                'cliente_destino',
                'causal',
                'fecha_fin',
                'estado',
                'tarifa'
            ])
            .optional(),
        dir: z.enum(['asc', 'desc']).optional()
    });

    const reubicacionesPipelineCreateSchema = z.object({
        cedula: z.string().min(5).max(20),
        fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        cliente_destino: z.union([z.string().max(500), z.literal('')]).optional().nullable(),
        causal: z.union([z.string().max(500), z.literal('')]).optional().nullable()
    });

    const reubicacionesPipelinePatchSchema = z.object({
        fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        cliente_destino: z.union([z.string().max(500), z.literal('')]).optional().nullable(),
        causal: z.union([z.string().max(500), z.literal('')]).optional().nullable()
    });

    function textOrNull(v) {
        const s = String(v ?? '').trim();
        return s ? s : null;
    }

    function normalizePipelineRow(row) {
        let fechaFin = row.fecha_fin;
        if (fechaFin instanceof Date) fechaFin = fechaFin.toISOString().slice(0, 10);
        else if (typeof fechaFin === 'string') fechaFin = fechaFin.slice(0, 10);

        let monedaSalario;
        let monedaAuxilios;
        if (row.montos_divisa && typeof row.montos_divisa === 'object') {
            if (row.montos_divisa.sueldo_nomina) monedaSalario = row.montos_divisa.sueldo_nomina;
            if (row.montos_divisa.otros_ingresos) monedaAuxilios = row.montos_divisa.otros_ingresos;
        }

        return {
            id: row.id,
            cedula: row.cedula,
            fecha_fin: fechaFin,
            cliente_destino: row.cliente_destino,
            causal: row.causal,
            consultor: row.consultor,
            tipo_contrato: row.tipo_contrato,
            cliente_actual: row.cliente_actual,
            puesto: row.puesto,
            salario: row.salario != null ? Number(row.salario) : null,
            moneda_salario: monedaSalario,
            auxilios: row.auxilios != null ? Number(row.auxilios) : null,
            moneda_auxilios: monedaAuxilios,
            tipo_ficha: row.tipo_ficha,
            tarifa_cliente: row.tarifa_cliente != null ? Number(row.tarifa_cliente) : null,
            montos_divisa: row.montos_divisa ?? null,
            created_at: row.created_at,
            updated_at: row.updated_at
        };
    }

    const MONTH_SHORT_ES_DASH = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    function formatMonthYmDash(ym) {
        const m = /^(\d{4})-(\d{2})$/.exec(String(ym || ''));
        if (!m) return String(ym || '');
        const mi = Number(m[2]) - 1;
        if (mi < 0 || mi > 11) return String(ym || '');
        return `${MONTH_SHORT_ES_DASH[mi]} ${m[1]}`;
    }

    /**
     * Métricas pre-agregadas para `AdministracionDashboardPage` (una ronda de SQL en paralelo).
     * Evita decenas/centenares de GET paginados que dejaban el dashboard lento o colgando el proxy.
     */
    async function queryAdminDashboardMetrics() {
        const diasSql = `(rp.fecha_fin::date - (timezone('America/Bogota', now()))::date)`;
        const semaforoSql = `(CASE WHEN ${diasSql} < 0 THEN 'Vencido' WHEN ${diasSql} > 30 THEN 'Verde' WHEN ${diasSql} >= 15 THEN 'Amarillo' ELSE 'Rojo' END)`;
        const SEMAFORO_LABEL_LOCAL = {
            Verde: 'Proyectado',
            Amarillo: 'En riesgo',
            Rojo: 'Urgente',
            Vencido: 'Vencido'
        };
        const [
            clientesRes,
            colabRes,
            reubTotalRes,
            semRes,
            tipoCtRes,
            topCliCons,
            mesFinRes,
            topActivosRes
        ] = await Promise.all([
            pool.query(
                `SELECT COUNT(*)::int AS total FROM (
                    SELECT cl.cliente FROM clientes_lideres cl WHERE cl.activo = true GROUP BY cl.cliente
                ) t`
            ),
            pool.query(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE activo)::int AS activos,
                        COUNT(*) FILTER (WHERE NOT activo)::int AS inactivos
                 FROM colaboradores`
            ),
            pool.query(
                `SELECT COUNT(*)::int AS total
                 FROM reubicaciones_pipeline rp
                 INNER JOIN colaboradores c ON c.cedula = rp.cedula
                 WHERE rp.estado IS DISTINCT FROM 'Cerrado'`
            ),
            pool.query(
                `SELECT ${semaforoSql} AS semaforo, COUNT(*)::int AS n
                 FROM reubicaciones_pipeline rp
                 INNER JOIN colaboradores c ON c.cedula = rp.cedula
                 WHERE rp.estado IS DISTINCT FROM 'Cerrado'
                 GROUP BY 1`
            ),
            pool.query(
                `SELECT COALESCE(NULLIF(TRIM(tipo_contrato::text), ''), 'Sin clasificar') AS name, COUNT(*)::int AS value
                 FROM colaboradores
                 GROUP BY 1 ORDER BY value DESC`
            ),
            pool.query(
                `SELECT COALESCE(NULLIF(TRIM(cliente), ''), 'Sin cliente') AS name, COUNT(*)::int AS value
                 FROM colaboradores
                 GROUP BY 1 ORDER BY value DESC LIMIT 12`
            ),
            pool.query(
                `SELECT to_char(rp.fecha_fin, 'YYYY-MM') AS month, COUNT(*)::int AS count
                 FROM reubicaciones_pipeline rp
                 INNER JOIN colaboradores c ON c.cedula = rp.cedula
                 WHERE rp.fecha_fin IS NOT NULL AND rp.estado IS DISTINCT FROM 'Cerrado'
                 GROUP BY 1 ORDER BY 1`
            ),
            pool.query(
                `SELECT agg.cliente AS name, agg.active_count::int AS value
                 FROM (
                     SELECT cl.cliente, COUNT(*) FILTER (WHERE cl.activo)::int AS active_count
                     FROM clientes_lideres cl WHERE cl.activo = true GROUP BY cl.cliente
                 ) agg
                 ORDER BY agg.active_count DESC, agg.cliente ASC LIMIT 12`
            )
        ]);

        const col = colabRes.rows[0] || {};
        const counts = { Verde: 0, Amarillo: 0, Rojo: 0, Vencido: 0 };
        for (const row of semRes.rows || []) {
            const k = String(row.semaforo || '');
            if (Object.prototype.hasOwnProperty.call(counts, k)) counts[k] = Number(row.n) || 0;
        }
        const semaforoOrder = ['Verde', 'Amarillo', 'Rojo', 'Vencido'];
        const semaforoSeries = semaforoOrder.map((key) => ({
            key,
            name: SEMAFORO_LABEL_LOCAL[key],
            value: counts[key]
        }));
        let riesgoCount = 0;
        for (const key of ['Amarillo', 'Rojo', 'Vencido']) {
            riesgoCount += counts[key] || 0;
        }

        const mesFinData = (mesFinRes.rows || []).map((r) => ({
            month: r.month,
            label: formatMonthYmDash(r.month),
            count: Number(r.count) || 0
        }));

        return {
            ok: true,
            clientesActivosTotal: clientesRes.rows[0]?.total ?? 0,
            colaboradoresTotal: col.total ?? 0,
            colaboradoresActivos: col.activos ?? 0,
            colaboradoresInactivos: col.inactivos ?? 0,
            reubicacionesTotal: reubTotalRes.rows[0]?.total ?? 0,
            semaforoSeries,
            tipoContratoData: tipoCtRes.rows || [],
            topClientesConsultores: topCliCons.rows || [],
            mesFinData,
            topActivosCatalogo: topActivosRes.rows || [],
            riesgoCount
        };
    }

    app.get('/api/directorio/admin-dashboard-metrics', ...readGuard, async (_req, res) => {
        try {
            const data = await queryAdminDashboardMetrics();
            return res.json(data);
        } catch (e) {
            console.error('GET directorio admin-dashboard-metrics:', e);
            return res.status(500).json({ ok: false, error: 'No se pudieron calcular las métricas del dashboard.' });
        }
    });

    app.get('/api/directorio/clientes-resumen', ...readGuard, async (req, res) => {
        try {
            const q = clienteResumenListSchema.safeParse(req.query);
            if (!q.success) return res.status(400).json({ ok: false, error: 'Parámetros inválidos' });
            const { activo, limit, offset, q: search } = q.data;
            let activoBool = null;
            if (activo === 'true') activoBool = true;
            if (activo === 'false') activoBool = false;
            const { rows, total } = await listClientesLideresByClienteSummaryPaged({
                activo: activoBool,
                q: search,
                limit,
                offset
            });
            return res.json({ ok: true, items: rows, total, limit: limit ?? 50, offset: offset ?? 0 });
        } catch (e) {
            console.error('GET directorio clientes-resumen:', e);
            return res.status(500).json({ ok: false, error: 'No se pudo listar el resumen de clientes.' });
        }
    });

    app.get('/api/directorio/clientes-lideres', ...readGuard, async (req, res) => {
        try {
            const q = clienteLiderListSchema.safeParse(req.query);
            if (!q.success) return res.status(400).json({ ok: false, error: 'Parámetros inválidos' });
            const { activo, limit, offset, q: search, cliente } = q.data;
            let activoBool = null;
            if (activo === 'true') activoBool = true;
            if (activo === 'false') activoBool = false;
            const { rows, total } = await listClientesLideresPaged({
                activo: activoBool,
                q: search,
                cliente: cliente || null,
                limit,
                offset
            });
            return res.json({ ok: true, items: rows, total, limit: limit ?? 50, offset: offset ?? 0 });
        } catch (e) {
            console.error('GET directorio clientes-lideres:', e);
            return res.status(500).json({ ok: false, error: 'No se pudo listar el catálogo.' });
        }
    });

    app.post('/api/directorio/clientes-lideres', ...writeGuard, async (req, res) => {
        try {
            const parsed = clienteLiderCreateSchema.safeParse(req.body || {});
            if (!parsed.success) return res.status(400).json({ ok: false, error: 'Datos inválidos' });
            const { gpUserId, gpResolution } = await resolveGpForClienteLiderPayload(parsed.data);
            const row = await insertClienteLider(parsed.data.cliente, parsed.data.lider, gpUserId, parsed.data.nit);
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user?.sub),
                actorRole: normalizeRoleOrNull(req.user?.role),
                action: 'clientes_lideres.create',
                entityType: 'clientes_lideres',
                entityId: row.id,
                metadata: {
                    cliente: row.cliente,
                    lider: row.lider,
                    nit: row.nit,
                    gp_user_id: row.gp_user_id,
                    gp_colaborador_cedula: parsed.data.gp_colaborador_cedula || null,
                    gp_created_user: Boolean(gpResolution?.created_gp_user)
                }
            });
            return res.status(201).json({ ok: true, item: row });
        } catch (e) {
            const st = Number(e?.status) || (String(e?.code) === '23505' ? 409 : 500);
            if (st >= 500) console.error('POST directorio clientes-lideres:', e);
            return res.status(st).json({ ok: false, error: e.message || 'No se pudo crear el par.' });
        }
    });

    app.patch('/api/directorio/clientes-lideres/:id', ...writeGuard, async (req, res) => {
        try {
            const id = String(req.params.id || '').trim();
            if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ ok: false, error: 'Id inválido' });
            const parsed = clienteLiderPatchSchema.safeParse(req.body || {});
            if (!parsed.success) return res.status(400).json({ ok: false, error: 'Datos inválidos' });
            const patch = { ...parsed.data };
            let gpResolution = null;
            if (patch.gp_colaborador_cedula) {
                const resolved = await resolveOrCreateGpUserIdForColaboradorCedula(patch.gp_colaborador_cedula);
                patch.gp_user_id = resolved.gp_user_id;
                gpResolution = resolved;
            }
            delete patch.gp_colaborador_cedula;
            const row = await updateClienteLiderById(id, patch);
            if (!row) return res.status(404).json({ ok: false, error: 'No encontrado' });
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user?.sub),
                actorRole: normalizeRoleOrNull(req.user?.role),
                action: 'clientes_lideres.patch',
                entityType: 'clientes_lideres',
                entityId: row.id,
                metadata: {
                    ...patch,
                    gp_colaborador_cedula: parsed.data.gp_colaborador_cedula || null,
                    gp_created_user: Boolean(gpResolution?.created_gp_user)
                }
            });
            return res.json({ ok: true, item: row });
        } catch (e) {
            const st = Number(e?.status) || (String(e?.code) === '23505' ? 409 : 500);
            if (st >= 500) console.error('PATCH directorio clientes-lideres:', e);
            return res.status(st).json({ ok: false, error: e.message || 'No se pudo actualizar.' });
        }
    });

    app.delete('/api/directorio/clientes-lideres/:id', ...writeGuard, async (req, res) => {
        try {
            const id = String(req.params.id || '').trim();
            if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ ok: false, error: 'Id inválido' });
            const row = await deleteClienteLiderById(id);
            if (!row) return res.status(404).json({ ok: false, error: 'No encontrado' });
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user?.sub),
                actorRole: normalizeRoleOrNull(req.user?.role),
                action: 'clientes_lideres.delete',
                entityType: 'clientes_lideres',
                entityId: row.id,
                metadata: { cliente: row.cliente, lider: row.lider, nit: row.nit }
            });
            return res.json({ ok: true, deleted: row });
        } catch (e) {
            const st = Number(e?.status) || (String(e?.code) === '23503' ? 409 : 500);
            if (st >= 500) console.error('DELETE directorio clientes-lideres:', e);
            return res.status(st).json({ ok: false, error: e.message || 'No se pudo eliminar.' });
        }
    });

    app.get('/api/directorio/colaboradores', ...colaboradoresReadGuard, async (req, res) => {
        try {
            const q = colabListSchema.safeParse(req.query);
            if (!q.success) return res.status(400).json({ ok: false, error: 'Parámetros inválidos' });
            const { activo, limit, offset, q: search, sort, dir, tipo_contrato: tipoContrato, cliente: clienteColab } =
                q.data;
            let activoBool = null;
            if (activo === 'true') activoBool = true;
            if (activo === 'false') activoBool = false;
            const { rows, total } = await listColaboradoresPaged({
                activo: activoBool,
                q: search,
                cliente: clienteColab ? String(clienteColab).trim() : '',
                tipoContrato: tipoContrato ? String(tipoContrato).trim() : '',
                limit,
                offset,
                sort,
                dir
            });
            return res.json({ ok: true, items: rows, total, limit: limit ?? 50, offset: offset ?? 0 });
        } catch (e) {
            console.error('GET directorio colaboradores:', e);
            return res.status(500).json({ ok: false, error: 'No se pudo listar colaboradores.' });
        }
    });

    app.post('/api/directorio/colaboradores', ...writeGuard, async (req, res) => {
        try {
            const parsed = colabCreateSchema.safeParse(req.body || {});
            if (!parsed.success) return res.status(400).json({ ok: false, error: 'Datos inválidos' });
            const body = parsed.data;
            if (body.cliente && body.lider_catalogo) {
                await assertColaboradorCatalogPair(getLideresByCliente, body.cliente, body.lider_catalogo);
            }
            const row = await insertColaborador(body);
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user?.sub),
                actorRole: normalizeRoleOrNull(req.user?.role),
                action: 'colaboradores.create',
                entityType: 'colaboradores',
                entityId: null,
                metadata: { cedula: row.cedula }
            });
            return res.status(201).json({ ok: true, item: row });
        } catch (e) {
            const st = Number(e?.status) || (String(e?.code) === '23505' ? 409 : 500);
            if (st >= 500) console.error('POST directorio colaboradores:', e);
            return res.status(st).json({ ok: false, error: e.message || 'No se pudo crear el colaborador.' });
        }
    });

    app.patch('/api/directorio/colaboradores/:cedula', ...writeGuard, async (req, res) => {
        try {
            const cedula = normalizeCedula(req.params.cedula);
            if (!cedula) return res.status(400).json({ ok: false, error: 'Cédula inválida' });
            const parsed = colabPatchSchema.safeParse(req.body || {});
            if (!parsed.success) return res.status(400).json({ ok: false, error: 'Datos inválidos' });
            const body = parsed.data;
            if (body.cliente && body.lider_catalogo) {
                await assertColaboradorCatalogPair(getLideresByCliente, body.cliente, body.lider_catalogo);
            }
            const row = await updateColaboradorByCedula(cedula, body);
            if (!row) return res.status(404).json({ ok: false, error: 'Colaborador no encontrado' });
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user?.sub),
                actorRole: normalizeRoleOrNull(req.user?.role),
                action: 'colaboradores.patch',
                entityType: 'colaboradores',
                entityId: null,
                metadata: { cedula: row.cedula, patch: body }
            });
            return res.json({ ok: true, item: row });
        } catch (e) {
            const st = Number(e?.status) || (String(e?.code) === '23503' ? 400 : 500);
            if (st >= 500) console.error('PATCH directorio colaboradores:', e);
            return res.status(st).json({ ok: false, error: e.message || 'No se pudo actualizar.' });
        }
    });

    app.delete('/api/directorio/colaboradores/:cedula', ...writeGuard, async (req, res) => {
        try {
            const cedula = normalizeCedula(req.params.cedula);
            if (!cedula) return res.status(400).json({ ok: false, error: 'Cédula inválida' });
            const row = await deleteColaboradorByCedula(cedula);
            if (!row) return res.status(404).json({ ok: false, error: 'Colaborador no encontrado' });
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user?.sub),
                actorRole: normalizeRoleOrNull(req.user?.role),
                action: 'colaboradores.delete',
                entityType: 'colaboradores',
                entityId: null,
                metadata: { cedula }
            });
            return res.json({ ok: true, deleted: row.cedula });
        } catch (e) {
            const st = Number(e?.status) || (String(e?.code) === '23503' ? 409 : 500);
            if (st >= 500) console.error('DELETE directorio colaboradores:', e);
            return res.status(st).json({ ok: false, error: e.message || 'No se pudo eliminar.' });
        }
    });

    app.get('/api/directorio/mallas-turnos/clientes', ...mallasReadGuard, async (req, res) => {
        try {
            const role = normalizeRoleOrNull(req.user?.role);
            if (role === 'gp') {
                const gpEmail = String(req.user?.email || '')
                    .trim()
                    .toLowerCase();
                const gpUserId = parseUuidActor(req.user?.sub);
                const gpId = await resolveGpInternalUserIdForScope({ gpEmail, gpUserId });
                const assigned = await listAssignedClientesForGpUserId(gpId);
                const items = assigned.map((cliente) => ({ cliente }));
                return res.json({ ok: true, items, total: items.length });
            }
            const { rows, total } = await listClientesLideresByClienteSummaryPaged({
                activo: true,
                limit: 2000,
                offset: 0
            });
            return res.json({ ok: true, items: rows, total: total ?? rows.length });
        } catch (e) {
            const st = Number(e?.status) || 500;
            if (st >= 500) console.error('GET directorio mallas-turnos/clientes:', e);
            return res.status(st).json({ ok: false, error: e.message || 'No se pudo listar clientes de mallas.' });
        }
    });

    app.get('/api/directorio/mallas-turnos/colaboradores', ...mallasReadGuard, async (req, res) => {
        try {
            const q = colabListSchema.safeParse(req.query);
            if (!q.success) return res.status(400).json({ ok: false, error: 'Parámetros inválidos' });
            const { activo, limit, offset, q: search, sort, dir, tipo_contrato: tipoContrato, cliente: clienteColab } =
                q.data;
            const cliente = clienteColab ? String(clienteColab).trim() : '';
            if (!cliente) {
                return res.status(400).json({ ok: false, error: 'Cliente es obligatorio.' });
            }
            await assertGpClienteAsignado(req, cliente);
            let activoBool = null;
            if (activo === 'true') activoBool = true;
            if (activo === 'false') activoBool = false;
            const { rows, total } = await listColaboradoresPaged({
                activo: activoBool,
                q: search,
                cliente,
                tipoContrato: tipoContrato ? String(tipoContrato).trim() : '',
                limit,
                offset,
                sort,
                dir
            });
            return res.json({ ok: true, items: rows, total, limit: limit ?? 50, offset: offset ?? 0 });
        } catch (e) {
            const st = Number(e?.status) || 500;
            if (st >= 500) console.error('GET directorio mallas-turnos/colaboradores:', e);
            return res.status(st).json({ ok: false, error: e.message || 'No se pudieron listar colaboradores.' });
        }
    });

    app.get('/api/directorio/mallas-turnos', ...mallasReadGuard, async (req, res) => {
        try {
            const parsed = mallasTurnosListSchema.safeParse(req.query);
            if (!parsed.success) return res.status(400).json({ ok: false, error: 'Parámetros inválidos' });
            const { desde, hasta, cliente, origen } = parsed.data;
            await assertGpClienteAsignado(req, cliente);
            const items = await listMallaTurnosCeldasRange({ cliente, desde, hasta, origen });
            return res.json({ ok: true, items });
        } catch (e) {
            const st = Number(e?.status) || 500;
            if (st >= 500) console.error('GET directorio mallas-turnos:', e);
            return res.status(st).json({ ok: false, error: e.message || 'No se pudo listar la malla de turnos.' });
        }
    });

    app.put('/api/directorio/mallas-turnos', ...mallasWriteGuard, async (req, res) => {
        try {
            const parsed = mallasTurnosPutSchema.safeParse(req.body || {});
            if (!parsed.success) {
                return res
                    .status(400)
                    .json({ ok: false, error: describeMallaPutValidationError(parsed.error) });
            }
            const { cliente, patches } = parsed.data;
            await assertGpClienteAsignado(req, cliente);
            await upsertMallaTurnosCeldas({ cliente, patches });
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user?.sub),
                actorRole: normalizeRoleOrNull(req.user?.role),
                action: 'mallas_turnos.upsert',
                entityType: 'malla_turno_asignacion',
                entityId: null,
                metadata: { cliente, patchCount: patches.length }
            });
            return res.json({ ok: true, applied: patches.length });
        } catch (e) {
            const st = Number(e?.status) || 500;
            if (st >= 500) console.error('PUT directorio mallas-turnos:', e);
            return res.status(st).json({ ok: false, error: e.message || 'No se pudo guardar la malla.' });
        }
    });

    app.get('/api/directorio/mallas-turnos/nocturno-config', ...mallasReadGuard, async (_req, res) => {
        try {
            const config = await getMallaNocturnoConfig();
            return res.json({ ok: true, ...config });
        } catch (e) {
            console.error('GET directorio mallas-turnos/nocturno-config:', e);
            const st = Number(e?.status) || 500;
            return res.status(st).json({
                ok: false,
                error: e.message || 'No se pudo leer el horario nocturno.'
            });
        }
    });

    app.put('/api/directorio/mallas-turnos/nocturno-config', ...writeGuard, async (req, res) => {
        try {
            const parsed = mallaNocturnoConfigPutSchema.safeParse(req.body || {});
            if (!parsed.success) return res.status(400).json({ ok: false, error: 'Datos inválidos' });
            const config = await upsertMallaNocturnoConfig(parsed.data);
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user?.sub),
                actorRole: normalizeRoleOrNull(req.user?.role),
                action: 'malla_nocturno_config.upsert',
                entityType: 'malla_nocturno_config',
                entityId: null,
                metadata: { horaInicio: config.horaInicio, horaFin: config.horaFin }
            });
            return res.json({ ok: true, ...config });
        } catch (e) {
            const st = Number(e?.status) || 500;
            if (st >= 500) console.error('PUT directorio mallas-turnos/nocturno-config:', e);
            return res.status(st).json({ ok: false, error: e.message || 'No se pudo guardar el horario nocturno.' });
        }
    });

    app.get('/api/directorio/mallas-turnos/aprobacion', ...mallasReadGuard, async (req, res) => {
        try {
            const parsed = mallasTurnosAprobacionQuerySchema.safeParse(req.query);
            if (!parsed.success) return res.status(400).json({ ok: false, error: 'Parámetros inválidos' });
            await assertGpClienteAsignado(req, parsed.data.cliente);
            const status = await getMallaTurnoAprobacionStatus(parsed.data);
            return res.json({ ok: true, ...status });
        } catch (e) {
            const st = Number(e?.status) || 500;
            if (st >= 500) console.error('GET directorio mallas-turnos/aprobacion:', e);
            return res.status(st).json({ ok: false, error: e.message || 'No se pudo consultar la aprobación.' });
        }
    });

    app.post('/api/directorio/mallas-turnos/aprobar', ...mallasWriteGuard, async (req, res) => {
        try {
            const parsed = mallasTurnosAprobarBodySchema.safeParse(req.body || {});
            if (!parsed.success) return res.status(400).json({ ok: false, error: 'Datos inválidos' });
            const role = normalizeRoleOrNull(req.user?.role);
            if (!canAprobarMallaRole(role)) {
                return res.status(403).json({ ok: false, error: 'Sin permiso para aprobar mallas de turnos.' });
            }
            await assertGpClienteAsignado(req, parsed.data.cliente);
            const actorEmail = String(req.user?.email || '').trim();
            const actorUserId = await resolveActorUserIdForSession(pool, {
                sub: req.user?.sub,
                email: actorEmail
            });
            const result = await aprobarMallaTurnosMes({
                pool,
                ...parsed.data,
                approver: {
                    userId: actorUserId,
                    email: actorEmail,
                    role
                },
                allowReaprobacion: true,
                getColaboradorByCedula,
                getLideresByCliente,
                listMallaTurnosCeldasRange,
                getMallaNocturnoConfig
            });
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user?.sub),
                actorRole: role,
                action: 'mallas_turnos.aprobar',
                entityType: 'malla_turno_aprobacion',
                entityId: null,
                metadata: {
                    ...parsed.data,
                    novedadesGeneradas: result.novedadesGeneradas,
                    reaprobacion: Boolean(result.reaprobacion)
                }
            });
            return res.json({ ok: true, ...result });
        } catch (e) {
            const st = Number(e?.status) || 500;
            if (st >= 500) console.error('POST directorio mallas-turnos/aprobar:', e);
            return res.status(st).json({ ok: false, error: e.message || 'No se pudo aprobar la malla.' });
        }
    });

function _buildPipelinePatchUpdates(d, current, n) {
    const sets = [];
    const vals = [];
    const afterData = { ...current };

    if (d.fecha_fin !== undefined) {
        sets.push(`fecha_fin = $${n}::date`);
        vals.push(d.fecha_fin);
        afterData.fecha_fin = d.fecha_fin;
        n += 1;
    }
    if (d.cliente_destino !== undefined) {
        const val = textOrNull(d.cliente_destino);
        sets.push(`cliente_destino = $${n}`);
        vals.push(val);
        afterData.cliente_destino = val;
        n += 1;
    }
    if (d.causal !== undefined) {
        const val = textOrNull(d.causal);
        sets.push(`causal = $${n}`);
        vals.push(val);
        afterData.causal = val;
        n += 1;
    }
    
    return { sets, vals, afterData, n };
}

function _buildPipelineWhereSql(d, gpAssignedClientes) {
    const whereParts = [];
    const whereParams = [];

    if (gpAssignedClientes) {
        if (gpAssignedClientes.length === 0) return { whereParts: ['1=0'], whereParams: [] };
        const placeholders = gpAssignedClientes.map((_, i) => `$${whereParams.length + 1 + i}`);
        whereParts.push(`c.cliente IN (${placeholders.join(', ')})`);
        whereParams.push(...gpAssignedClientes);
    }

    const search = textOrNull(d.q);
    if (search) {
        const i = whereParams.length + 1;
        whereParts.push(`(
            c.cedula ILIKE '%' || $${i} || '%'
            OR c.nombre ILIKE '%' || $${i} || '%'
            OR COALESCE(rp.cliente_destino, '') ILIKE '%' || $${i} || '%'
            OR COALESCE(rp.causal, '') ILIKE '%' || $${i} || '%'
        )`);
        whereParams.push(search);
    }

    if (textOrNull(d.fecha_fin_desde)) {
        whereParts.push(`rp.fecha_fin >= $${whereParams.length + 1}::date`);
        whereParams.push(d.fecha_fin_desde);
    }
    if (textOrNull(d.fecha_fin_hasta)) {
        whereParts.push(`rp.fecha_fin <= $${whereParams.length + 1}::date`);
        whereParams.push(d.fecha_fin_hasta);
    }
    if (d.estado && d.estado.length > 0) {
        const estadoConds = [];
        if (d.estado.includes('Con novedad')) estadoConds.push(`COALESCE(rp.motivo_novedad, '') <> ''`);
        if (d.estado.includes('Pendiente')) estadoConds.push(`(COALESCE(rp.motivo_novedad, '') = '' AND rp.fecha_fin > (timezone('America/Bogota', now()))::date)`);
        if (d.estado.includes('En proceso')) estadoConds.push(`(COALESCE(rp.motivo_novedad, '') = '' AND rp.fecha_fin <= (timezone('America/Bogota', now()))::date)`);
        if (estadoConds.length) whereParts.push(`(${estadoConds.join(' OR ')})`);
    }

    appendAptitudFilter(whereParts, whereParams, d.apto_no_apto);
    whereParts.push(`rp.estado IS DISTINCT FROM 'Cerrado'`);

    return { whereParts, whereParams };
}

function _buildPipelineOrderSql(sortKey, dirStr) {
    const dir = dirStr === 'desc' ? 'DESC' : 'ASC';
    const estadoOrderSql = `
        CASE
            WHEN COALESCE(rp.motivo_novedad, '') <> '' THEN 3
            WHEN rp.fecha_fin > (timezone('America/Bogota', now()))::date THEN 1
            ELSE 2
        END
    `;
    const orderMap = {
        cedula: `c.cedula ${dir}`,
        consultor: `c.nombre ${dir} NULLS LAST`,
        tipo_contrato: `c.tipo_contrato ${dir} NULLS LAST`,
        cliente_actual: `c.cliente ${dir} NULLS LAST`,
        cliente_destino: `rp.cliente_destino ${dir} NULLS LAST`,
        causal: `rp.causal ${dir} NULLS LAST`,
        fecha_fin: `rp.fecha_fin ${dir} NULLS LAST`,
        estado: `${estadoOrderSql} ${dir}, rp.fecha_fin ASC NULLS LAST`,
        tarifa: `c.tarifa_cliente ${dir} NULLS LAST`
    };
    return (sortKey && orderMap[sortKey]) ? `ORDER BY ${orderMap[sortKey]}` : 'ORDER BY rp.fecha_fin ASC NULLS LAST, c.nombre ASC';
}

function _buildHistorialGlobalWhereSql(q, gpAssignedClientes) {
    const params = [];
    const whereParts = [];
    
    if (gpAssignedClientes) {
        if (gpAssignedClientes.length === 0) return { whereParts: ['1=0'], params: [], cursorFecha: null, cursorId: null };
        const placeholders = gpAssignedClientes.map((_, i) => `$${params.length + 1 + i}`);
        whereParts.push(`c.cliente IN (${placeholders.join(', ')})`);
        params.push(...gpAssignedClientes);
    }

    const search = textOrNull(q.q);
    if (search) {
        const i = params.length + 1;
        whereParts.push(`(c.cedula ILIKE '%' || $${i} || '%' OR c.nombre ILIKE '%' || $${i} || '%')`);
        params.push(search);
    }

    if (textOrNull(q.fecha_fin_desde)) {
        whereParts.push(`rh.fecha >= $${params.length + 1}::timestamptz`);
        params.push(textOrNull(q.fecha_fin_desde) + 'T00:00:00-05:00');
    }
    if (textOrNull(q.fecha_fin_hasta)) {
        whereParts.push(`rh.fecha <= $${params.length + 1}::timestamptz`);
        params.push(textOrNull(q.fecha_fin_hasta) + 'T23:59:59.999-05:00');
    }
    
    if (q.estado) {
        const arr = String(q.estado).split(',');
        const estadoConds = [];
        if (arr.includes('Con novedad')) estadoConds.push(`COALESCE(rp.motivo_novedad, '') <> ''`);
        if (arr.includes('Pendiente')) estadoConds.push(`(COALESCE(rp.motivo_novedad, '') = '' AND rp.fecha_fin > (timezone('America/Bogota', now()))::date)`);
        if (arr.includes('En proceso')) estadoConds.push(`(COALESCE(rp.motivo_novedad, '') = '' AND rp.fecha_fin <= (timezone('America/Bogota', now()))::date)`);
        if (estadoConds.length) whereParts.push(`(${estadoConds.join(' OR ')})`);
    }

    appendAptitudFilter(whereParts, params, q.apto_no_apto);

    if (q.tipo) {
        const arr = String(q.tipo).split(',');
        const placeholders = arr.map((_, i) => `$${params.length + 1 + i}`);
        whereParts.push(`rh.tipo IN (${placeholders.join(', ')})`);
        params.push(...arr);
    }

    if (q.actor) {
        const i = params.length + 1;
        whereParts.push(`rh.actor_nombre ILIKE '%' || $${i} || '%'`);
        params.push(q.actor);
    }

    const cursor = q.cursor ? Buffer.from(q.cursor, 'base64').toString('utf8') : null;
    let cursorFecha = null;
    let cursorId = null;
    if (cursor) {
        const parts = cursor.split('|');
        if (parts.length === 2) {
            cursorFecha = parts[0];
            cursorId = parts[1];
            const i = params.length + 1;
            whereParts.push(`(rh.fecha, rh.id) < ($${i}::timestamptz, $${i+1}::uuid)`);
            params.push(cursorFecha, cursorId);
        }
    }
    return { whereParts, params, cursorFecha, cursorId };
}

    app.get('/api/directorio/reubicaciones-pipeline', ...reubReadGuard, async (req, res) => {
        try {
            const parsed = reubicacionesPipelineListSchema.safeParse(req.query);
            if (!parsed.success) return res.status(400).json({ ok: false, error: 'Parámetros inválidos' });
            const d = parsed.data;
            const limit = d.limit ?? 50;
            const offset = d.offset ?? 0;

            const selectFields = `
                SELECT
                    rp.id,
                    rp.cedula,
                    rp.fecha_fin,
                    rp.cliente_destino,
                    rp.causal,
                    rp.motivo_novedad,
                    rp.tipo_ficha,
                    rp.created_at,
                    rp.updated_at,
                    c.nombre AS consultor,
                    c.tipo_contrato,
                    c.cliente AS cliente_actual,
                    COALESCE(rp.puesto, c.puesto) AS puesto,
                    COALESCE(rp.salario, c.sueldo_nomina) AS salario,
                    COALESCE(rp.auxilios, 
                        CASE 
                            WHEN c.auxilio_transporte_obligatorio IS NULL AND c.auxilios_no_prestacionales IS NULL THEN NULL 
                            ELSE (COALESCE(c.auxilio_transporte_obligatorio, 0) + COALESCE(c.auxilios_no_prestacionales, 0)) 
                        END
                    ) AS auxilios,
                    c.tarifa_cliente,
                    c.montos_divisa
                FROM reubicaciones_pipeline rp
                INNER JOIN colaboradores c ON c.cedula = rp.cedula`;

            let gpAssignedClientes = null;
            const role = normalizeRoleOrNull(req.user?.role);
            if (role === 'gp') {
                const gpEmail = String(req.user?.email || '').trim().toLowerCase();
                const gpUserId = parseUuidActor(req.user?.sub);
                const gpId = await resolveGpInternalUserIdForScope({ gpEmail, gpUserId });
                gpAssignedClientes = await listAssignedClientesForGpUserId(gpId);
                if (gpAssignedClientes.length === 0) {
                    return res.json({ ok: true, items: [], total: 0, limit, offset });
                }
            }

            const { whereParts, whereParams } = _buildPipelineWhereSql(d, gpAssignedClientes);
            const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

            const orderSql = _buildPipelineOrderSql(d.sort, d.dir);

            const fromJoin = `
                FROM reubicaciones_pipeline rp
                INNER JOIN colaboradores c ON c.cedula = rp.cedula`;

            const countSql = `SELECT COUNT(*)::int AS total ${fromJoin} ${whereSql}`;
            const cRes = await pool.query(countSql, whereParams);
            const total = cRes.rows[0]?.total ?? 0;

            const limIdx = whereParams.length + 1;
            const offIdx = whereParams.length + 2;
            const listSql = `${selectFields} ${whereSql} ${orderSql} LIMIT $${limIdx}::int OFFSET $${offIdx}::int`;
            const listParams = [...whereParams, limit, offset];
            const listRes = await pool.query(listSql, listParams);
            const rows = listRes.rows;
            
            const festivosSet = await getFestivosSet();
            const hoy = new Date();

            const mappedRows = rows.map(row => {
                const base = normalizePipelineRow(row);
                const { estado, motivo } = calcularEstado({ 
                    fecha_fin: base.fecha_fin, 
                    novedad: row.motivo_novedad, 
                    fecha_actual: hoy 
                });
                let dias_transcurridos = 0;
                let dias_restantes = null;
                if (estado === ESTADOS.EN_PROCESO) {
                    dias_transcurridos = diasHabilesTranscurridos(base.fecha_fin, hoy, festivosSet);
                } else if (estado === ESTADOS.PENDIENTE) {
                    dias_restantes = diasHabilesTranscurridos(hoy, base.fecha_fin, festivosSet);
                }
                return {
                    ...base,
                    estado,
                    motivo,
                    dias_transcurridos,
                    dias_restantes
                };
            });

            return res.json({
                ok: true,
                items: mappedRows,
                total,
                limit,
                offset
            });
        } catch (e) {
            console.error('GET directorio reubicaciones-pipeline:', e);
            return res.status(500).json({ ok: false, error: 'No se pudo listar reubicaciones.' });
        }
    });

    app.post('/api/directorio/reubicaciones-pipeline', ...reubWriteGuard, async (req, res) => {
        try {
            const parsed = reubicacionesPipelineCreateSchema.safeParse(req.body || {});
            if (!parsed.success) return res.status(400).json({ ok: false, error: 'Datos inválidos' });
            const cedula = normalizeCedula(parsed.data.cedula);
            if (!cedula) return res.status(400).json({ ok: false, error: 'Cédula inválida' });
            const cedCheck = await pool.query('SELECT cliente FROM colaboradores WHERE cedula = $1', [cedula]);
            if (cedCheck.rows.length) {
                await assertGpClienteAsignado(req, cedCheck.rows[0].cliente);
            }
            const clienteDestino = textOrNull(parsed.data.cliente_destino);
            const causal = textOrNull(parsed.data.causal);
            let row;
            try {
                const ins = await pool.query(
                    `INSERT INTO reubicaciones_pipeline (cedula, fecha_fin, cliente_destino, causal)
                     VALUES ($1, $2::date, $3, $4)
                     RETURNING id, cedula, fecha_fin, cliente_destino, causal, created_at, updated_at`,
                    [cedula, parsed.data.fecha_fin, clienteDestino, causal]
                );
                row = ins.rows[0];
            } catch (e) {
                if (String(e?.code) === '23505') {
                    return res.status(409).json({
                        ok: false,
                        error: 'Ya existe un registro de reubicación para esta cédula.'
                    });
                }
                if (String(e?.code) === '23503') {
                    return res.status(400).json({
                        ok: false,
                        error: 'La cédula ingresada no pertenece a ningún colaborador registrado en el directorio.'
                    });
                }
                throw e;
            }
            const joined = await pool.query(
                `SELECT
                    rp.id,
                    rp.cedula,
                    rp.fecha_fin,
                    rp.cliente_destino,
                    rp.causal,
                    rp.motivo_novedad,
                    rp.created_at,
                    rp.updated_at,
                    c.nombre AS consultor,
                    c.tipo_contrato,
                    c.cliente AS cliente_actual,
                    c.tarifa_cliente,
                    c.montos_divisa
                 FROM reubicaciones_pipeline rp
                 INNER JOIN colaboradores c ON c.cedula = rp.cedula
                 WHERE rp.id = $1::uuid`,
                [row.id]
            );
            
            const festivosSet = await getFestivosSet();
            const hoy = new Date();
            const raw = joined.rows[0];
            const base = normalizePipelineRow(raw);
            const { estado, motivo } = calcularEstado({ 
                fecha_fin: base.fecha_fin, 
                novedad: raw.motivo_novedad, 
                fecha_actual: hoy 
            });
            let dias_transcurridos = 0;
            if (estado === ESTADOS.EN_PROCESO) {
                dias_transcurridos = diasHabilesTranscurridos(base.fecha_fin, hoy, festivosSet);
            }
            const item = { ...base, estado, motivo, dias_transcurridos };
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user?.sub),
                actorRole: normalizeRoleOrNull(req.user?.role),
                action: 'reubicaciones_pipeline.create',
                entityType: 'reubicaciones_pipeline',
                entityId: row.id,
                metadata: { cedula }
            });
            return res.status(201).json({ ok: true, item });
        } catch (e) {
            const st = Number(e?.status) || (String(e?.code) === '23503' ? 400 : 500);
            if (st >= 500) console.error('POST directorio reubicaciones-pipeline:', e);
            return res.status(st).json({ ok: false, error: e.message || 'No se pudo crear.' });
        }
    });

    app.patch('/api/directorio/reubicaciones-pipeline/:id', ...reubWriteGuard, async (req, res) => {
        const { registrarEventoHistorial } = require('../reubicaciones/reubicacionesHistoryService');
        let client;
        try {
            const id = String(req.params.id || '').trim();
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
                return res.status(400).json({ ok: false, error: 'Id inválido' });
            }
            
            client = await pool.connect();
            await client.query('BEGIN');

            const q = await client.query(
                `SELECT c.cliente, rp.fecha_fin, rp.causal, rp.tipo_ficha, rp.motivo_novedad, rp.estado, rp.cliente_destino, rp.cedula
                 FROM reubicaciones_pipeline rp
                 INNER JOIN colaboradores c ON c.cedula = rp.cedula
                 WHERE rp.id = $1::uuid FOR UPDATE`,
                [id]
            );
            if (!q.rows.length) {
                await client.query('ROLLBACK');
                return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
            }
            try {
                await assertGpClienteAsignado(req, q.rows[0].cliente);
            } catch (e) {
                await client.query('ROLLBACK');
                throw e;
            }

            const parsed = reubicacionesPipelinePatchSchema.safeParse(req.body || {});
            if (!parsed.success) {
                await client.query('ROLLBACK');
                return res.status(400).json({ ok: false, error: 'Datos inválidos' });
            }
            const d = parsed.data;
            const current = q.rows[0];
            
            const beforeData = {
                fecha_fin: current.fecha_fin,
                cliente_destino: current.cliente_destino,
                causal: current.causal,
                estado: current.estado
            };

            let { sets, vals, afterData, n } = _buildPipelinePatchUpdates(d, current, 1);

            const fechaFinEfectiva = d.fecha_fin !== undefined ? d.fecha_fin : current.fecha_fin;
            const causalEfectiva = d.causal !== undefined ? textOrNull(d.causal) : current.causal;
            const esSalida = String(current.tipo_ficha || '').toUpperCase() === 'SALIDA';
            const motivoEsDatosFaltantes = String(current.motivo_novedad || '').startsWith('Faltan datos obligatorios:');
            
            if (motivoEsDatosFaltantes && fechaFinEfectiva && (!esSalida || causalEfectiva)) {
                const estadoRecalculado = calcularEstado({ fecha_fin: fechaFinEfectiva }).estado;
                sets.push('motivo_novedad = NULL');
                sets.push(`estado = $${n}`);
                vals.push(estadoRecalculado);
                afterData.estado = estadoRecalculado;
                n += 1;
            }
            
            if (sets.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ ok: false, error: 'Sin cambios' });
            }
            
            sets.push('updated_at = NOW()');
            vals.push(id);
            const upd = await client.query(
                `UPDATE reubicaciones_pipeline SET ${sets.join(', ')} WHERE id = $${n}::uuid RETURNING id`,
                vals
            );
            
            if (!upd.rows.length) {
                await client.query('ROLLBACK');
                return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
            }
            
            // HU-06: Registrar el cambio manual de la ficha
            const eventId = `patch_${id}_${Date.now()}`;
            await registrarEventoHistorial(client, {
                caso_id: id,
                consultor_id: current.cedula,
                tipo: 'modificacion_manual',
                actor_nombre: req.user?.full_name || 'Usuario',
                actor_rol: req.user?.role || 'admin',
                origen: 'MANUAL',
                descripcion: 'Actualización manual de la ficha',
                before_data: beforeData,
                after_data: afterData,
                source_event_id: eventId
            });
            
            // Si hubo cambio de estado, lanzar evento específico
            if (beforeData.estado !== afterData.estado) {
                await registrarEventoHistorial(client, {
                    caso_id: id,
                    consultor_id: current.cedula,
                    tipo: 'transicion_automatica',
                    actor_nombre: req.user?.full_name || 'Usuario',
                    actor_rol: req.user?.role || 'admin',
                    origen: 'SISTEMA',
                    descripcion: `Estado recalculado a ${afterData.estado} por datos completos`,
                    before_data: { estado: beforeData.estado },
                    after_data: { estado: afterData.estado },
                    source_event_id: `estado_${eventId}`
                });
            }

            await client.query('COMMIT');

            const joined = await pool.query(
                `SELECT
                    rp.id,
                    rp.cedula,
                    rp.fecha_fin,
                    rp.cliente_destino,
                    rp.causal,
                    rp.created_at,
                    rp.updated_at,
                    c.nombre AS consultor,
                    c.tipo_contrato,
                    c.cliente AS cliente_actual,
                    c.tarifa_cliente,
                    c.montos_divisa,
                    (rp.fecha_fin::date - (timezone('America/Bogota', now()))::date) AS dias_restantes
                 FROM reubicaciones_pipeline rp
                 INNER JOIN colaboradores c ON c.cedula = rp.cedula
                 WHERE rp.id = $1::uuid`,
                [id]
            );
            const item = normalizePipelineRow(joined.rows[0]);
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user?.sub),
                actorRole: normalizeRoleOrNull(req.user?.role),
                action: 'reubicaciones_pipeline.patch',
                entityType: 'reubicaciones_pipeline',
                entityId: id,
                metadata: d
            });
            return res.json({ ok: true, item });
        } catch (e) {
            if (client) await client.query('ROLLBACK');
            const status = e.status || 500;
            if (status >= 500) console.error('PATCH directorio reubicaciones-pipeline:', e);
            return res.status(status).json({ ok: false, error: e.message || 'No se pudo actualizar.' });
        } finally {
            if (client) client.release();
        }
    });

    app.get('/api/directorio/reubicaciones/:id/historial', ...reubReadGuard, async (req, res) => {
        try {
            const pipelineId = String(req.params.id || '').trim();
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pipelineId)) {
                return res.status(400).json({ ok: false, error: 'Id inválido' });
            }
            // CA-07: Verificación GP
            const q = await pool.query(`SELECT c.cliente FROM reubicaciones_pipeline rp INNER JOIN colaboradores c ON c.cedula = rp.cedula WHERE rp.id = $1::uuid`, [pipelineId]);
            if (!q.rows.length) return res.status(404).json({ ok: false, error: 'Caso no encontrado' });
            await assertGpClienteAsignado(req, q.rows[0].cliente);

            const cursor = req.query.cursor ? Buffer.from(req.query.cursor, 'base64').toString('utf8') : null;
            let cursorFecha = null;
            let cursorId = null;
            if (cursor) {
                const parts = cursor.split('|');
                if (parts.length === 2) {
                    cursorFecha = parts[0];
                    cursorId = parts[1];
                }
            }

            const limit = 20;
            const params = [pipelineId];
            let cursorSql = '';
            if (cursorFecha && cursorId) {
                cursorSql = ` AND (fecha, id) < ($2::timestamptz, $3::uuid) `;
                params.push(cursorFecha, cursorId);
            }

            const sql = `
                SELECT id, tipo, origen, actor_nombre, actor_rol, fecha, descripcion, before_data, after_data
                FROM reubicaciones_historial
                WHERE caso_id = $1::uuid ${cursorSql}
                ORDER BY fecha DESC, id DESC
                LIMIT ${limit + 1}
            `;
            
            const result = await pool.query(sql, params);
            const hasMore = result.rows.length > limit;
            const items = hasMore ? result.rows.slice(0, limit) : result.rows;
            
            const historyMap = {
                'ficha_recibida': 'Ficha Recibida',
                'ficha_actualizada': 'Ficha Actualizada',
                'cambio_estado': 'Cambio de Estado',
                'modificacion_manual': 'Edición Manual',
                'observacion_agregada': 'Observación',
                'decision_agregada': 'Decisión',
                'reubicacion': 'Reubicación',
                'salida': 'Salida',
                'sincronizacion_extension': 'Sincronización',
                'transicion_automatica': 'Transición Automática'
            };

            const mapped = items.map(r => ({
                id: r.id,
                tipo_label: historyMap[r.tipo] || r.tipo,
                origen: r.origen,
                actor: r.actor_nombre,
                rol: r.actor_rol,
                fecha: r.fecha,
                descripcion: r.descripcion,
                before: r.before_data,
                after: r.after_data
            }));

            let nextCursor = null;
            if (hasMore) {
                const lastItem = items[items.length - 1];
                nextCursor = Buffer.from(`${lastItem.fecha.toISOString()}|${lastItem.id}`).toString('base64');
            }

            return res.json({ ok: true, data: { historial: mapped, next_cursor: nextCursor } });
        } catch (e) {
            const st = Number(e?.status) || 500;
            if (st >= 500) console.error('GET historial:', e);
            return res.status(st).json({ ok: false, error: e.message || 'Error al obtener el historial' });
        }
    });

    app.get('/api/directorio/clientes-destino', ...reubReadGuard, async (req, res) => {
        try {
            const sql = `
                SELECT DISTINCT cliente
                FROM clientes_lideres
                WHERE activo = true
                ORDER BY cliente ASC
            `;
            const result = await pool.query(sql);
            return res.json({ ok: true, data: result.rows });
        } catch (e) {
            console.error('GET clientes-destino:', e);
            return res.status(500).json({ ok: false, error: 'Error al obtener clientes destino' });
        }
    });

    app.get('/api/directorio/reubicaciones-historial-global', ...reubReadGuard, async (req, res) => {
        try {
            const limit = 50;

            // CA-07: Verificación GP (global)
            let gpAssignedClientes = null;
            const role = normalizeRoleOrNull(req.user?.role);
            if (role === 'gp') {
                const gpEmail = String(req.user?.email || '').trim().toLowerCase();
                const gpUserId = parseUuidActor(req.user?.sub);
                const gpId = await resolveGpInternalUserIdForScope({ gpEmail, gpUserId });
                gpAssignedClientes = await listAssignedClientesForGpUserId(gpId);
                if (gpAssignedClientes.length === 0) {
                    return res.json({ ok: true, data: { historial: [], next_cursor: null } });
                }
            }

            const { whereParts, params, cursorFecha, cursorId } = _buildHistorialGlobalWhereSql(req.query, gpAssignedClientes);
            
            const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

            const sql = `
                SELECT 
                    rh.id, rh.tipo, rh.origen, rh.actor_nombre, rh.actor_rol, rh.fecha, rh.descripcion, rh.before_data, rh.after_data,
                    rp.id as caso_id, rp.fecha_fin, rp.cliente_destino, rp.causal, rp.tipo_ficha,
                    c.cedula, c.nombre as consultor, c.cliente as cliente_actual
                FROM reubicaciones_historial rh
                INNER JOIN reubicaciones_pipeline rp ON rp.id = rh.caso_id
                INNER JOIN colaboradores c ON c.cedula = rp.cedula
                ${whereSql}
                ORDER BY rh.fecha DESC, rh.id DESC
                LIMIT ${limit + 1}
            `;
            
            const result = await pool.query(sql, params);
            const hasMore = result.rows.length > limit;
            const items = hasMore ? result.rows.slice(0, limit) : result.rows;
            
            const historyMap = {
                'ficha_recibida': 'Ficha Recibida',
                'ficha_actualizada': 'Ficha Actualizada',
                'cambio_estado': 'Cambio de Estado',
                'modificacion_manual': 'Edición Manual',
                'observacion_agregada': 'Observación',
                'decision_agregada': 'Decisión',
                'reubicacion': 'Reubicación',
                'salida': 'Salida',
                'sincronizacion_extension': 'Sincronización',
                'transicion_automatica': 'Transición Automática'
            };

            const mapped = items.map(r => ({
                id: r.id,
                caso_id: r.caso_id,
                consultor: r.consultor,
                cedula: r.cedula,
                cliente_actual: r.cliente_actual,
                cliente_destino: r.cliente_destino,
                tipo_ficha: r.tipo_ficha,
                tipo_label: historyMap[r.tipo] || r.tipo,
                origen: r.origen,
                actor: r.actor_nombre,
                rol: r.actor_rol,
                fecha: r.fecha,
                descripcion: r.descripcion,
                before: r.before_data,
                after: r.after_data
            }));

            let nextCursor = null;
            if (hasMore) {
                const lastItem = items[items.length - 1];
                nextCursor = Buffer.from(`${lastItem.fecha.toISOString()}|${lastItem.id}`).toString('base64');
            }

            return res.json({ ok: true, data: { historial: mapped, next_cursor: nextCursor } });
        } catch (e) {
            const st = Number(e?.status) || 500;
            if (st >= 500) console.error('GET historial-global:', e);
            return res.status(st).json({ ok: false, error: e.message || 'Error al obtener el historial global' });
        }
    });

    app.get('/api/directorio/reubicaciones-pipeline/:id/aptitud-context', ...reubReadGuard, async (req, res) => {
        try {
            const pipelineId = req.params.id;
            const observacion = await obtenerUltimaObservacion({ pipelineId, pool });
            const decision = await obtenerUltimaDecision({ pipelineId, pool });
            const historialObs = await obtenerHistorialObservaciones({ pipelineId, pool });
            const historialDec = await obtenerHistorialDecisiones({ pipelineId, pool });
            return res.json({ ok: true, observacion, decision, historialObs, historialDec });
        } catch (e) {
            console.error('GET aptitud-context:', e);
            return res.status(500).json({ ok: false, error: 'Error al obtener contexto de aptitud' });
        }
    });

    // Historial técnico de eventos que modificaron la fecha de salida desde Zoho.
    // Cada evento conserva la fecha anterior y la nueva, sin crear un segundo caso.
    app.get('/api/directorio/reubicaciones-pipeline/:id/eventos-origen', ...reubReadGuard, async (req, res) => {
        try {
            const pipelineId = String(req.params.id || '').trim();
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pipelineId)) {
                return res.status(400).json({ ok: false, error: 'Id inválido' });
            }
            const result = await pool.query(
                `SELECT source_event_id, tipo_evento, fecha_anterior, fecha_nueva, processed_at
                 FROM reubicaciones_source_events
                 WHERE pipeline_id = $1::uuid
                 ORDER BY processed_at DESC`,
                [pipelineId]
            );
            return res.json({ ok: true, items: result.rows || [] });
        } catch (e) {
            console.error('GET eventos-origen:', e);
            return res.status(500).json({ ok: false, error: 'Error al obtener el historial de cambios de fecha' });
        }
    });

    app.post('/api/directorio/reubicaciones-pipeline/:id/observacion', ...reubWriteGuard, async (req, res) => {
        try {
            if (!canRegisterObservacion(req)) {
                return res.status(403).json({ ok: false, error: 'No tienes permiso para registrar observaciones' });
            }
            const pipelineId = req.params.id;
            const { observacion, expectedVersion } = req.body;
            const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
            const reqUser = req.user || {};
            const actor = { user_id: parseUuidActor(reqUser.sub), role: reqUser.role, nombre: reqUser.full_name };
            
            const result = await registrarObservacion({ pipelineId, observacion, expectedVersion, actor, pool, idempotencyKey });
            return res.status(result.status).json(result.body);
        } catch (e) {
            console.error('POST observacion:', e);
            return res.status(500).json({ ok: false, error: 'Error interno al guardar observacion' });
        }
    });

    app.post('/api/directorio/reubicaciones-pipeline/:id/decision', ...reubWriteGuard, async (req, res) => {
        try {
            if (!canDecideAptitud(req)) {
                return res.status(403).json({ ok: false, error: 'No tienes permiso para decidir aptitud' });
            }
            const pipelineId = req.params.id;
            const { decision, justificacion } = req.body;
            const idempotencyKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];
            const reqUser = req.user || {};
            const actor = { user_id: parseUuidActor(reqUser.sub), role: reqUser.role, nombre: reqUser.full_name };
            
            const result = await registrarDecision({ pipelineId, decision, justificacion, decididoPor: actor, pool, idempotencyKey });
            return res.status(result.status).json(result.body);
        } catch (e) {
            console.error('POST decision:', e);
            return res.status(500).json({ ok: false, error: 'Error interno al guardar decisión' });
        }
    });

    app.get('/api/directorio/gp', ...readGuard, async (req, res) => {
        try {
            const rows = await listGpUsersForDirectorio();
            return res.json({ ok: true, items: rows });
        } catch (e) {
            console.error('GET directorio gp:', e);
            return res.status(500).json({ ok: false, error: 'No se pudo listar usuarios GP.' });
        }
    });

    app.post('/api/directorio/gp', ...writeGuard, async (req, res) => {
        try {
            const parsed = gpCreateSchema.safeParse(req.body || {});
            if (!parsed.success) return res.status(400).json({ ok: false, error: 'Datos inválidos' });
            const area = getAreaFromRole('gp');
            const placeholder = `cognito_gp_placeholder:${crypto.randomBytes(32).toString('hex')}`;
            const row = await insertGpUserPlaceholder({
                email: parsed.data.email,
                fullName: parsed.data.full_name,
                passwordPlaceholder: placeholder,
                area
            });
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user?.sub),
                actorRole: normalizeRoleOrNull(req.user?.role),
                action: 'users.gp.create',
                entityType: 'users',
                entityId: row.id,
                metadata: { email: row.email }
            });
            return res.status(201).json({ ok: true, item: row });
        } catch (e) {
            const st = Number(e?.status) || (String(e?.code) === '23505' ? 409 : 500);
            if (st >= 500) console.error('POST directorio gp:', e);
            return res.status(st).json({ ok: false, error: e.message || 'No se pudo crear el GP.' });
        }
    });

    app.patch('/api/directorio/gp/:id', ...writeGuard, async (req, res) => {
        try {
            const id = String(req.params.id || '').trim();
            if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ ok: false, error: 'Id inválido' });
            const parsed = gpPatchSchema.safeParse(req.body || {});
            if (!parsed.success) return res.status(400).json({ ok: false, error: 'Datos inválidos' });
            const before = await pool.query(
                `SELECT id, is_active FROM users WHERE id = $1::uuid AND role = 'gp'::user_role`,
                [id]
            );
            const row = await updateGpUserById(id, parsed.data);
            if (!row) return res.status(404).json({ ok: false, error: 'GP no encontrado' });
            if (parsed.data.is_active === false && before.rows[0]?.is_active) {
                await clearGpUserReferences(id);
            }
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user?.sub),
                actorRole: normalizeRoleOrNull(req.user?.role),
                action: 'users.gp.patch',
                entityType: 'users',
                entityId: row.id,
                metadata: parsed.data
            });
            return res.json({ ok: true, item: row });
        } catch (e) {
            console.error('PATCH directorio gp:', e);
            return res.status(500).json({ ok: false, error: e.message || 'No se pudo actualizar.' });
        }
    });

    /** Cualquier usuario con rol `gp` puede vincular su JWT Cognito (`sub`) a la fila interna con el mismo email. */
    app.post('/api/directorio/gp/vincular-cognito-self', verificarToken, adminActionLimiter, async (req, res) => {
        try {
            const role = normalizeRoleOrNull(req.user?.role);
            if (role !== 'gp') {
                return res.status(403).json({ ok: false, error: 'Solo usuarios con rol gp pueden vincular su cuenta.' });
            }
            const email =
                String(req.user?.email || '')
                    .trim()
                    .toLowerCase() || '';
            const sub = String(req.user?.sub || '').trim();
            if (!email || !sub) {
                return res.status(400).json({ ok: false, error: 'Token sin email o sub; no se puede vincular.' });
            }
            const row = await linkGpCognitoSubByEmail(email, sub);
            if (!row) {
                return res.status(404).json({
                    ok: false,
                    error: 'No hay fila interna GP activa con este correo. Pide a un administrador que te registre en el directorio.'
                });
            }
            return res.json({ ok: true, item: row });
        } catch (e) {
            const st = Number(e?.status) || 500;
            if (st >= 500) console.error('POST vincular gp self:', e);
            return res.status(st).json({ ok: false, error: e.message || 'No se pudo vincular.' });
        }
    });
}

module.exports = { registerDirectorioRoutes };
