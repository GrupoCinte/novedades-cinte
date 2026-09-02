/**
 * Rutas REST del módulo Onboarding.
 *
 * - POST /api/onboarding/intake (auth API key) — entrada manual/reintentos/ETL externo.
 * - GET  /api/onboarding/personal — lista del maestro `colaboradores` con filtros.
 * - GET  /api/onboarding/bajas    — colaboradores con baja efectiva o motivo registrado.
 * - GET  /api/onboarding/sena     — subvista `tipo_personal='sena'`.
 * - GET  /api/onboarding/staff    — subvista `tipo_personal='staff'`.
 * - GET  /api/onboarding/licencias[/:cedula] — licencias maternidad/paternidad/lactancia.
 * - GET  /api/onboarding/calculadora/:cedula | PUT /api/onboarding/calculadora/:cedula
 * - GET  /api/onboarding/documentos-extranjeros[/:cedula] | PUT ./:cedula
 * - GET  /api/onboarding/catalogos/motivo-baja | /ciudades | /eps | /afp | /arl | /ccf
 * - GET  /api/onboarding/reportes/rotacion
 * - GET  /api/onboarding/staging — auditoría del buzón (solo super_admin).
 * - PATCH /api/onboarding/personal/:cedula/baja — marca baja con motivo legal del catálogo.
 * - PATCH /api/onboarding/personal/:cedula/cancelar — cancelado manual (no baja).
 * - GET  /api/onboarding/cancelados — cancelados manuales (no Bajas).
 *
 * RBAC: el panel `onboarding` se controla por `src/rbac.js`. GP queda acotado a sus clientes
 * (`gp_user_id`) en todas las lecturas; admin_ch/team_ch ven todo; nómina solo lectura.
 */

const { z } = require('zod');
const crypto = require('node:crypto');
const {
    createOnboardingPromotionService,
    mapDynamoItemForPromotion
} = require('./onboardingPromotionService');
const { createFichaNovedadesService, getLastZohoDynamoSyncSummary } = require('./fichaNovedadesService');
const { normalizeRoleOrNull } = require('../rbac');
const { buildColaboradorExtendedZodShape } = require('../colaboradores/colaboradoresExtendedZod');
const {
    buildPersonalOrderBy,
    buildLicenciasOrderBy,
    buildExtranjerosOrderBy,
    isAllowedPersonalSort,
    isAllowedLicenciasSort,
    isAllowedExtranjerosSort
} = require('./onboardingListSort');
const { normalizeColabTextPatch } = require('./chTextNormalize');
const { inferTipoPersonal } = require('./tipoPersonalInfer');
const { applyRegistroBajaColaborador } = require('./bajaColaborador');
const { applyCancelarColaborador } = require('./cancelarColaborador');
const {
    CONTRATOS_VIGENTES_COUNT_SQL,
    attachContratosToItem,
    contratosVigentesCountSql,
    decideContractAction,
    filterExtendedForAction,
    loadPersonContractState,
    persistContratoEconomia,
    shouldWriteEconomiaToPerson,
    stripComputedEconomia,
    stripEconomiaFromPersonPatch,
    syncPersonContractsFromFicha
} = require('./colaboradorContratos');
const { actorFromUser, recordFichaDiff } = require('./contratoHistorial');
const { computeContratoEconomia } = require('./contratoCostoCalc');
const {
    createContratoVencimientoService,
    isAllowedPorVencerSort
} = require('./contratoVencimientoService');
const { gpScopePorVencer, tokenEquals } = require('./contratoVencimiento');
const { FICHA_NACIO_SQL } = require('./contratoDashboardCiclo');
const {
    optionalStringList,
    optionalEnumList,
    applyLowerInFilter,
    applyExactInFilter
} = require('./personalListFilters');

/**
 * Audit helper alineado con el módulo Directorio. No rompe si la tabla no existe.
 */
async function writeAudit(pool, row) {
    try {
        await pool.query(
            `INSERT INTO audit_log (actor_user_id, actor_role, action, entity_type, entity_id, metadata)
             VALUES ($1::uuid, $2::user_role, $3, $4, $5::uuid, $6::jsonb)`,
            [
                row.actorUserId || null,
                row.actorRole || null,
                row.action,
                row.entityType,
                row.entityId || null,
                JSON.stringify(row.metadata || {})
            ]
        );
    } catch (e) {
        console.warn('[Onboarding] audit_log omitido:', e.message);
    }
}

function parseUuidActor(sub) {
    const s = String(sub || '').trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) return s;
    return null;
}

/** Filtra GP a sus clientes. Devuelve los clientes asignados (cadenas trim). */
async function listAssignedClientesForGp(pool, gpUserId) {
    if (!gpUserId) return [];
    const q = await pool.query(
        `SELECT DISTINCT TRIM(cliente) AS cliente
         FROM clientes_lideres
         WHERE gp_user_id = $1::uuid AND activo = TRUE`,
        [gpUserId]
    );
    return (q.rows || []).map((r) => String(r.cliente || '').trim()).filter(Boolean);
}

/**
 * Construye un filtro SQL para acotar listados al scope del usuario.
 * Para `gp` exige `gp_user_id = $userId` O `cliente IN (...assigned)`.
 *
 * @returns {{ where: string, params: any[] }}
 */
async function buildScopeFilter(pool, user) {
    const role = normalizeRoleOrNull(user && user.role);
    const sub = String((user && user.sub) || '').trim();
    const isUuidSub = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sub);
    if (role === 'gp' && isUuidSub) {
        const clientes = await listAssignedClientesForGp(pool, sub);
        if (clientes.length === 0) {
            // GP sin clientes → no ve nada
            return { where: 'FALSE', params: [] };
        }
        // gp_user_id snapshot o cliente vinculado
        return {
            where: '(c.gp_user_id = $G_USER OR LOWER(TRIM(c.cliente)) = ANY($G_CLIENTES))',
            params: [sub, clientes.map((s) => s.toLowerCase())],
            placeholders: ['$G_USER', '$G_CLIENTES'],
            clientes
        };
    }
    return { where: 'TRUE', params: [], placeholders: [], clientes: null };
}

function applyScopePlaceholders(whereTemplate, paramIdxStart, scopeFilter) {
    if (!scopeFilter.placeholders || scopeFilter.placeholders.length === 0) {
        return { sql: whereTemplate, idx: paramIdxStart };
    }
    let sql = whereTemplate;
    let nextIdx = paramIdxStart;
    for (const placeholder of scopeFilter.placeholders) {
        sql = sql.replace(placeholder, `$${nextIdx}`);
        nextIdx += 1;
    }
    return { sql, idx: nextIdx };
}

/**
 * @typedef OnboardingRoutesDeps
 * @property {import('express').Express} app
 * @property {import('pg').Pool} pool
 * @property {Function} verificarToken
 * @property {Function} allowPanel
 * @property {Function} allowRoles
 * @property {Function} disallowRoles
 * @property {Function} adminActionLimiter
 * @property {Function} catalogLimiter
 * @property {Function} normalizeCedula
 */

/** @param {OnboardingRoutesDeps} deps */
function registerOnboardingRoutes(deps) {
    const {
        app,
        pool,
        verificarToken,
        allowPanel,
        allowRoles,
        adminActionLimiter,
        catalogLimiter,
        normalizeCedula,
        updateColaboradorByCedula,
        listEmailsInGroups
    } = deps;

    if (!app || !pool || !verificarToken || !allowPanel) {
        throw new Error('registerOnboardingRoutes: dependencias incompletas.');
    }

    const promotion = createOnboardingPromotionService({ pool });
    const fichaNovedades = createFichaNovedadesService({ pool, updateColaboradorByCedula });
    const vencimiento = createContratoVencimientoService({ pool, listEmailsInGroups });

    /** Lecturas (panel onboarding). */
    const readGuard = [verificarToken, allowPanel('onboarding')];
    /** Escrituras (panel onboarding + roles administrativos). Excluye `gp` y `nomina`. */
    const writeGuard = [
        verificarToken,
        allowPanel('onboarding'),
        adminActionLimiter,
        allowRoles(['super_admin', 'admin_ch', 'cac'])
    ];
    /** Edición de ficha de colaborador: incluye team_ch (no puede tramitar baja). */
    const writeFichaGuard = [
        verificarToken,
        allowPanel('onboarding'),
        adminActionLimiter,
        allowRoles(['super_admin', 'admin_ch', 'team_ch', 'cac'])
    ];
    /** Sólo super_admin para staging (datos crudos sensibles). */
    const adminOnlyGuard = [verificarToken, allowPanel('onboarding'), allowRoles(['super_admin'])];
    /** Catálogos (todo el panel onboarding). */
    const catGuard = [verificarToken, allowPanel('onboarding'), catalogLimiter];

    const CINTE_EMAIL_SUFFIX_RE = /@(?:grupocinte\.com)$/i;
    function zCorreoCinteOptional() {
        return z
            .string()
            .email()
            .max(320)
            .optional()
            .nullable()
            .refine((v) => !v || CINTE_EMAIL_SUFFIX_RE.test(String(v).trim()), {
                message: 'El correo Cinte debe ser @grupocinte.com'
            });
    }

    const colabExtendedShape = buildColaboradorExtendedZodShape();
    const colabPatchSchema = z.object({
        nombre: z.string().min(2).max(400).optional(),
        correo_cinte: zCorreoCinteOptional(),
        cliente: z.string().max(500).optional().nullable(),
        lider_catalogo: z.string().max(500).optional().nullable(),
        gp_user_id: z.string().uuid().optional().nullable(),
        activo: z.boolean().optional(),
        contrato_id: z.string().uuid().optional().nullable(),
        ...colabExtendedShape
    });
    /** Alta de colaborador: cédula y nombre obligatorios; resto opcional (mismo shape extendido). */
    const colabCreateSchema = colabPatchSchema.extend({
        cedula: z.string().regex(/^\d{3,20}$/, 'cédula debe tener entre 3 y 20 dígitos'),
        nombre: z.string().min(2).max(400)
    });

    /* =========================================================================
     * Intake (n8n webhook / reintentos / ETL externo).
     * Auth por API key + HMAC opcional. No usa JWT (es un endpoint server-to-server).
     * ========================================================================= */
    function checkIntakeAuth(req, res) {
        const expectedKey = (process.env.ONBOARDING_INGEST_KEY || '').trim();
        if (!expectedKey) {
            res.status(503).json({ ok: false, error: 'Onboarding intake no configurado (falta ONBOARDING_INGEST_KEY).' });
            return false;
        }
        const headerKey = String(req.get('x-onboarding-key') || '').trim();
        if (!headerKey || headerKey !== expectedKey) {
            res.status(401).json({ ok: false, error: 'API key inválida.' });
            return false;
        }
        // HMAC opcional
        const hmacSecret = (process.env.ONBOARDING_INGEST_HMAC_SECRET || '').trim();
        if (hmacSecret) {
            const sigHeader = String(req.get('x-onboarding-signature') || '').trim();
            if (!sigHeader.startsWith('sha256=')) {
                res.status(401).json({ ok: false, error: 'Firma HMAC ausente o malformada.' });
                return false;
            }
            const expectedHex = crypto
                .createHmac('sha256', hmacSecret)
                .update(JSON.stringify(req.body || {}))
                .digest('hex');
            const provided = sigHeader.slice('sha256='.length);
            const okSig = expectedHex.length === provided.length &&
                crypto.timingSafeEqual(Buffer.from(expectedHex, 'hex'), Buffer.from(provided, 'hex'));
            if (!okSig) {
                res.status(401).json({ ok: false, error: 'Firma HMAC inválida.' });
                return false;
            }
        }
        return true;
    }

    const intakeSchema = z.object({
        source: z.enum(['dynamo_stream', 'n8n_webhook', 'excel_etl', 'manual']).optional(),
        force_promote: z.boolean().optional(),
        tipo_personal: z.enum(['consultor', 'staff', 'sena', 'alianza']).optional(),
        /** Si `from_dynamo_raw=true`, el `payload` se trata como item Dynamo crudo y se mapea automáticamente. */
        from_dynamo_raw: z.boolean().optional(),
        event_type: z.enum(['INSERT', 'MODIFY', 'REMOVE', 'BATCH_IMPORT']).optional(),
        sequence_number: z.string().max(200).optional().nullable(),
        shard_id: z.string().max(500).optional().nullable(),
        payload: z.record(z.any())
    });

    app.post('/api/onboarding/intake', async (req, res) => {
        if (!checkIntakeAuth(req, res)) return;
        let body;
        try {
            body = intakeSchema.parse(req.body || {});
        } catch (e) {
            return res.status(400).json({ ok: false, error: 'Payload inválido', detail: e.errors || e.message });
        }
        try {
            const source = body.source || 'n8n_webhook';
            const payload = body.from_dynamo_raw ? mapDynamoItemForPromotion(body.payload) : body.payload;
            const result = await promotion.promoteToColaborador(payload, source, {
                eventType: body.event_type || 'INSERT',
                sequenceNumber: body.sequence_number || undefined,
                shardId: body.shard_id || undefined,
                forcePromote: Boolean(body.force_promote),
                tipoPersonal: body.tipo_personal
            });
            return res.status(result.ok ? 200 : 422).json(result);
        } catch (e) {
            console.error('[Onboarding intake]', e.message);
            return res.status(500).json({ ok: false, error: 'Error interno', message: e.message });
        }
    });

    /* =========================================================================
     * Listados de personal (consultores activos, staff, sena, bajas, etc).
     * ========================================================================= */
    const personalQuerySchema = z.object({
        tipo_personal: optionalEnumList(['consultor', 'staff', 'sena', 'alianza']),
        activo: z.enum(['true', 'false', 'all']).optional(),
        pais: optionalStringList(80),
        cliente: optionalStringList(500),
        empleador: optionalStringList(200),
        puesto: optionalStringList(200),
        modalidad_trabajo: optionalStringList(120),
        sexo: optionalStringList(80),
        tipo_contrato: optionalStringList(200),
        profesion: optionalStringList(400),
        tipo_identificacion: optionalStringList(200),
        departamento: optionalStringList(200),
        ciudad: optionalStringList(200),
        motivo_baja: optionalStringList(200),
        fecha_ingreso_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        fecha_ingreso_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        fecha_baja_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        fecha_baja_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        gp_user_id: z.string().uuid().optional(),
        q: z.string().max(200).optional(),
        sort: z.string().max(80).optional(),
        dir: z.enum(['asc', 'desc']).optional(),
        limit: z.coerce.number().int().min(1).max(2000).optional(),
        offset: z.coerce.number().int().min(0).optional()
    });

    /**
     * Construye listado paginado de `colaboradores` con filtros aplicados al scope del usuario.
     */
    async function listColaboradoresOnboarding(req, res, fixedFilters = {}) {
        const parsed = personalQuerySchema.safeParse(req.query || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: 'Query inválido', detail: parsed.error.errors });
        }
        if (!isAllowedPersonalSort(parsed.data.sort)) {
            return res.status(400).json({ ok: false, error: 'sort no permitido' });
        }
        const filters = { ...parsed.data, ...fixedFilters };
        const limit = Math.min(filters.limit || 100, 2000);
        const offset = filters.offset || 0;

        const scope = await buildScopeFilter(pool, req.user);
        const where = [];
        const params = [];
        let p = 1;

        p = applyExactInFilter('c.tipo_personal', filters.tipo_personal, params, where, p);
        if (filters.activo === 'true') {
            where.push(`c.activo = TRUE`);
        } else if (filters.activo === 'false') {
            where.push(`c.activo = FALSE`);
        }
        p = applyLowerInFilter('c.pais', filters.pais, params, where, p);
        p = applyLowerInFilter('c.cliente', filters.cliente, params, where, p);
        p = applyLowerInFilter('c.empleador', filters.empleador, params, where, p);
        p = applyLowerInFilter('c.puesto', filters.puesto, params, where, p);
        p = applyLowerInFilter('c.modalidad_trabajo', filters.modalidad_trabajo, params, where, p);
        p = applyLowerInFilter('c.sexo', filters.sexo, params, where, p);
        p = applyLowerInFilter('c.tipo_contrato', filters.tipo_contrato, params, where, p);
        p = applyLowerInFilter('c.profesion', filters.profesion, params, where, p);
        p = applyLowerInFilter('c.tipo_identificacion', filters.tipo_identificacion, params, where, p);
        p = applyLowerInFilter('c.departamento', filters.departamento, params, where, p);
        p = applyLowerInFilter('c.ciudad', filters.ciudad, params, where, p);
        p = applyLowerInFilter('c.motivo_baja', filters.motivo_baja, params, where, p);
        if (filters.fecha_ingreso_desde) {
            params.push(filters.fecha_ingreso_desde);
            where.push(`c.fecha_ingreso >= $${p++}::date`);
        }
        if (filters.fecha_ingreso_hasta) {
            params.push(filters.fecha_ingreso_hasta);
            where.push(`c.fecha_ingreso <= $${p++}::date`);
        }
        // Flags privadas para particionar Personal Activo / Próximos a ingresar.
        // - `_fecha_ingreso_futura`: solo colaboradores con fecha_ingreso > hoy.
        // - `_fecha_ingreso_no_futura`: con fecha_ingreso <= hoy o sin fecha registrada.
        if (filters._fecha_ingreso_futura) {
            where.push(`c.fecha_ingreso IS NOT NULL AND c.fecha_ingreso > CURRENT_DATE`);
        }
        if (filters._fecha_ingreso_no_futura) {
            where.push(`(c.fecha_ingreso IS NULL OR c.fecha_ingreso <= CURRENT_DATE)`);
        }
        if (filters.fecha_baja_desde) {
            params.push(filters.fecha_baja_desde);
            where.push(`c.fecha_termino >= $${p++}::date`);
        }
        if (filters.fecha_baja_hasta) {
            params.push(filters.fecha_baja_hasta);
            where.push(`c.fecha_termino <= $${p++}::date`);
        }
        if (filters.gp_user_id) {
            params.push(filters.gp_user_id);
            where.push(`c.gp_user_id = $${p++}::uuid`);
        }
        if (filters.q) {
            params.push(`%${String(filters.q).toLowerCase()}%`);
            where.push(`(LOWER(c.cedula) LIKE $${p} OR LOWER(c.nombre) LIKE $${p} OR LOWER(COALESCE(c.correo_cinte, '')) LIKE $${p})`);
            p += 1;
        }
        if (filters._motivo_baja_present) {
            where.push(`c.motivo_baja IS NOT NULL`);
        }
        if (filters._es_baja) {
            where.push(
                `(c.activo = FALSE OR c.motivo_baja IS NOT NULL)`
            );
        }
        if (filters._es_cancelado) {
            where.push(`c.cancelado IS TRUE`);
        } else {
            where.push(`c.cancelado IS NOT TRUE`);
        }

        // Scope GP
        const scopeApplied = applyScopePlaceholders(scope.where, p, scope);
        if (scopeApplied.sql && scopeApplied.sql !== 'TRUE') {
            where.push(scopeApplied.sql);
            params.push(...scope.params);
            p = scopeApplied.idx;
        }
        if (scopeApplied.sql === 'FALSE') {
            return res.json({ ok: true, items: [], total: 0, limit, offset });
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const countQ = await pool.query(
            `SELECT COUNT(*)::int AS total FROM colaboradores c ${whereSql}`,
            params
        );
        const total = countQ.rows[0] ? Number(countQ.rows[0].total) : 0;

        const orderBy = buildPersonalOrderBy(filters.sort, filters.dir);

        let vigentesSql = CONTRATOS_VIGENTES_COUNT_SQL;
        if (Array.isArray(scope.clientes) && scope.clientes.length) {
            params.push(scope.clientes.map((s) => String(s).toLowerCase()));
            vigentesSql = contratosVigentesCountSql({ clientesParamIndex: p });
            p += 1;
        }

        params.push(limit, offset);
        const listQ = await pool.query(
            `SELECT
                c.cedula, c.nombre, c.activo, c.tipo_personal, c.correo_cinte, c.cliente,
                c.lider_catalogo, c.gp_user_id,
                c.pais, c.empleador, c.puesto, c.cliente_proyecto,
                c.tipo_contrato, c.descriptivo_puesto_sig,
                c.fecha_ingreso, c.fecha_termino, c.fecha_baja_efectiva,
                c.motivo_baja, c.cancelado, c.fecha_cancelacion, c.obs_cancelacion,
                c.termino, c.tiempo_permanencia_meses,
                c.whatsapp_number, c.onboarding_status, c.onboarding_completed_at,
                c.created_at, c.updated_at,
                ${vigentesSql} AS contratos_vigentes_count
             FROM colaboradores c
             ${whereSql}
             ORDER BY ${orderBy}
             LIMIT $${p++} OFFSET $${p++}`,
            params
        );
        return res.json({ ok: true, items: listQ.rows, total, limit, offset });
    }

    // Personal/SENA/Staff: excluyen automáticamente los que aún no han ingresado
    // (fecha_ingreso futura). Esos se ven en /api/onboarding/proximos.
    app.get('/api/onboarding/personal', ...readGuard, (req, res) =>
        listColaboradoresOnboarding(req, res, { _fecha_ingreso_no_futura: true })
    );
    app.get('/api/onboarding/bajas', ...readGuard, (req, res) =>
        listColaboradoresOnboarding(req, res, { activo: 'all', _es_baja: true })
    );
    app.get('/api/onboarding/cancelados', ...readGuard, (req, res) =>
        listColaboradoresOnboarding(req, res, { activo: 'all', _es_cancelado: true })
    );
    app.get('/api/onboarding/sena', ...readGuard, (req, res) =>
        listColaboradoresOnboarding(req, res, { tipo_personal: 'sena', _fecha_ingreso_no_futura: true })
    );
    app.get('/api/onboarding/staff', ...readGuard, (req, res) =>
        listColaboradoresOnboarding(req, res, { tipo_personal: 'staff', _fecha_ingreso_no_futura: true })
    );
    // Próximos a ingresar: cualquier tipo_personal con fecha_ingreso > hoy.
    app.get('/api/onboarding/proximos', ...readGuard, (req, res) =>
        listColaboradoresOnboarding(req, res, { activo: 'true', _fecha_ingreso_futura: true })
    );

    const porVencerQuerySchema = z.object({
        kind: z.enum(['T30', 'T15', 'T5']).optional(),
        cliente: z.string().max(500).optional(),
        q: z.string().max(200).optional(),
        sort: z.string().max(80).optional(),
        dir: z.enum(['asc', 'desc']).optional(),
        limit: z.coerce.number().int().min(1).max(2000).optional(),
        offset: z.coerce.number().int().min(0).optional()
    });

    app.get('/api/onboarding/por-vencer', ...readGuard, async (req, res) => {
        const parsed = porVencerQuerySchema.safeParse(req.query || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: 'Query inválido', detail: parsed.error.errors });
        }
        if (!isAllowedPorVencerSort(parsed.data.sort)) {
            return res.status(400).json({ ok: false, error: 'sort no permitido' });
        }
        try {
            const scope = await buildScopeFilter(pool, req.user);
            const gpScope = gpScopePorVencer(scope);
            if (gpScope.sql === 'FALSE') {
                return res.json({ ok: true, items: [], total: 0, limit: parsed.data.limit || 50, offset: parsed.data.offset || 0 });
            }
            const result = await vencimiento.listPorVencer({
                kind: parsed.data.kind,
                q: parsed.data.q,
                cliente: parsed.data.cliente,
                sort: parsed.data.sort,
                dir: parsed.data.dir,
                limit: parsed.data.limit || 50,
                offset: parsed.data.offset || 0,
                scopeSql: gpScope.sql,
                scopeParams: gpScope.params
            });
            return res.json({ ok: true, ...result });
        } catch (e) {
            console.error('[Onboarding por-vencer]', e.message);
            return res.status(500).json({ ok: false, error: 'Error interno' });
        }
    });

    function allowInternalVencimiento(req, res, next) {
        const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
        const expected = String(process.env.CONTRATOS_VENCIMIENTO_TOKEN || '').trim();
        if (tokenEquals(token, expected)) return next();
        return verificarToken(req, res, () => allowRoles(['super_admin', 'admin_ch'])(req, res, next));
    }

    app.get('/api/onboarding/internal/elegibles-vencimiento', allowInternalVencimiento, async (req, res) => {
        try {
            const kind = String(req.query.kind || '').toUpperCase();
            const items = await vencimiento.listElegiblesExactos({
                kind,
                asOfDate: req.query.asOfDate || undefined
            });
            const recipients = await vencimiento.resolveChRecipients();
            res.json({ ok: true, items, recipients });
        } catch (error) {
            const status = Number(error.statusCode) || 500;
            if (status >= 500) console.error('[Onboarding elegibles-vencimiento]', error.message);
            res.status(status).json({
                ok: false,
                error: status === 400 ? error.message : 'Error interno'
            });
        }
    });

    app.post('/api/onboarding/internal/marcar-vencimiento', allowInternalVencimiento, async (req, res) => {
        try {
            const result = await vencimiento.marcarEnviados({
                kind: req.body?.kind,
                contratoIds: req.body?.contratoIds,
                asOfDate: req.body?.asOfDate
            });
            res.json({ ok: true, ...result });
        } catch (error) {
            const status = Number(error.statusCode) || 500;
            if (status >= 500) console.error('[Onboarding marcar-vencimiento]', error.message);
            res.status(status).json({
                ok: false,
                error: status === 400 ? error.message : 'Error interno'
            });
        }
    });

    /* =========================================================================
     * Ficha completa de colaborador (modal de edición manual).
     * GET   /api/onboarding/personal/:cedula → lectura (con scope GP).
     * PATCH /api/onboarding/personal/:cedula → edición manual (writeFichaGuard).
     * ========================================================================= */
    app.get('/api/onboarding/personal/:cedula', ...readGuard, async (req, res) => {
        const cedula = String(req.params.cedula || '').replace(/\D+/g, '');
        if (!cedula) {
            return res.status(400).json({ ok: false, error: 'cedula inválida' });
        }
        try {
            // Aplica el scope GP igual que los listados: el WHERE base es por cédula y
            // se concatena el filtro del scope si existe (FALSE bloquea, TRUE pasa).
            const scope = await buildScopeFilter(pool, req.user);
            const where = ['c.cedula = $1'];
            const params = [cedula];
            let p = 2;
            const scopeApplied = applyScopePlaceholders(scope.where, p, scope);
            if (scopeApplied.sql && scopeApplied.sql !== 'TRUE') {
                where.push(scopeApplied.sql);
                params.push(...scope.params);
                p = scopeApplied.idx;
            }
            if (scopeApplied.sql === 'FALSE') {
                return res.status(403).json({ ok: false, error: 'fuera de scope' });
            }
            const q = await pool.query(
                `SELECT c.* FROM colaboradores c WHERE ${where.join(' AND ')} LIMIT 1`,
                params
            );
            if (q.rows.length === 0) {
                // Para GP cuyo scope excluye la cédula, también caemos aquí porque el
                // WHERE compuesto no devuelve fila. Distinguimos: si existe en la tabla
                // sin scope, es 403; si no existe, 404.
                const existsQ = await pool.query(
                    `SELECT 1 FROM colaboradores WHERE cedula = $1 LIMIT 1`,
                    [cedula]
                );
                if (existsQ.rows.length > 0) {
                    return res.status(403).json({ ok: false, error: 'fuera de scope' });
                }
                return res.status(404).json({ ok: false, error: 'colaborador no encontrado' });
            }
            const item = await attachContratosToItem(pool, q.rows[0], {
                clientesScope: scope.clientes || null
            });
            return res.json({ ok: true, item });
        } catch (e) {
            console.error('[Onboarding personal GET]', e.message);
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.patch('/api/onboarding/personal/:cedula', ...writeFichaGuard, async (req, res) => {
        const cedula = String(req.params.cedula || '').replace(/\D+/g, '');
        if (!cedula) {
            return res.status(400).json({ ok: false, error: 'cedula inválida' });
        }
        if (typeof updateColaboradorByCedula !== 'function') {
            return res.status(503).json({
                ok: false,
                error: 'updateColaboradorByCedula no disponible en este entorno.'
            });
        }
        const parsed = colabPatchSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({
                ok: false,
                error: 'Payload inválido',
                detail: parsed.error.errors
            });
        }
        try {
            const patch = stripComputedEconomia(normalizeColabTextPatch(parsed.data));
            const contratoId = parsed.data.contrato_id || null;
            const beforeQ = await pool.query(`SELECT * FROM colaboradores WHERE cedula = $1 LIMIT 1`, [cedula]);
            const existed = beforeQ.rows[0] || await loadPersonContractState(pool, cedula);
            if (!existed) {
                return res.status(404).json({ ok: false, error: 'colaborador no encontrado' });
            }
            const estaEnBajas = existed.activo === false;
            const contractAction = decideContractAction({
                exists: true,
                activo: existed.activo !== false,
                clienteActual: existed.cliente,
                clienteNuevo: patch.cliente
            });
            const actor = actorFromUser(req.user);
            await syncPersonContractsFromFicha(pool, {
                cedula,
                existed,
                cliente: patch.cliente || existed.cliente,
                tipoContrato: patch.tipo_contrato,
                fechaInicio: patch.fecha_ingreso,
                fechaTermino: patch.fecha_termino,
                origen: 'ficha_patch',
                allowReingreso: false,
                actor
            });
            const economia = await persistContratoEconomia(pool, {
                cedula,
                contratoId,
                patch,
                actor,
                origen: 'ficha_patch'
            });
            let patchToApply = contractAction === 'new_client'
                ? filterExtendedForAction(patch, 'new_client')
                : { ...patch };
            if (!shouldWriteEconomiaToPerson({
                editingOther: economia.editingOther,
                contractAction
            })) {
                patchToApply = stripEconomiaFromPersonPatch(patchToApply);
            } else {
                patchToApply.costo_empresa = economia.calc.costo_empresa;
                patchToApply.utilidad = economia.calc.utilidad;
                patchToApply.rt_aprox = economia.calc.rt_aprox;
            }
            if (estaEnBajas) {
                delete patchToApply.activo;
            }
            if (!String(patchToApply.cliente || '').trim()) {
                delete patchToApply.cliente;
            }
            const tipoTrasCinte = inferTipoPersonal({
                tipo_personal: patchToApply.tipo_personal || existed.tipo_personal,
                cliente: patchToApply.cliente || existed.cliente,
                tipo_contrato: patchToApply.tipo_contrato || existed.tipo_contrato,
                puesto: patchToApply.puesto || existed.puesto,
                subtipo_sena: patchToApply.subtipo_sena || existed.subtipo_sena
            });
            if (tipoTrasCinte && tipoTrasCinte !== existed.tipo_personal) {
                await pool.query(
                    `UPDATE colaboradores
                     SET tipo_personal = $2, updated_at = NOW()
                     WHERE cedula = $1 AND tipo_personal IS DISTINCT FROM $2`,
                    [cedula, tipoTrasCinte]
                );
            }
            const updated = await updateColaboradorByCedula(cedula, patchToApply);
            if (!updated) {
                return res.status(404).json({ ok: false, error: 'colaborador no encontrado' });
            }
            if (tipoTrasCinte) updated.tipo_personal = tipoTrasCinte;
            const onlyKeys = Object.keys(patchToApply);
            if (tipoTrasCinte && tipoTrasCinte !== existed.tipo_personal) {
                onlyKeys.push('tipo_personal');
            }
            const historial = await recordFichaDiff(pool, {
                cedula,
                before: existed,
                after: updated,
                actor,
                origen: 'ficha_patch',
                onlyKeys
            });
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user && req.user.sub),
                actorRole: req.user && req.user.role,
                action: 'colaboradores.patch_onboarding',
                entityType: 'colaboradores',
                entityId: null,
                metadata: { cedula, patch }
            });
            return res.json({
                ok: true,
                item: await attachContratosToItem(pool, updated),
                historial_omitido: historial.omitted === true
            });
        } catch (e) {
            console.error('[Onboarding personal PATCH]', e.message);
            const status = Number.isInteger(e?.status) ? e.status : 500;
            return res.status(status).json({ ok: false, error: e.message });
        }
    });

    /* =========================================================================
     * Alta manual de colaborador (modal "Agregar" del onboarding).
     * POST /api/onboarding/personal → crea fila base + aplica resto de campos.
     * ========================================================================= */
    app.post('/api/onboarding/personal', ...writeFichaGuard, async (req, res) => {
        if (typeof updateColaboradorByCedula !== 'function') {
            return res.status(503).json({
                ok: false,
                error: 'updateColaboradorByCedula no disponible en este entorno.'
            });
        }
        const parsed = colabCreateSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({
                ok: false,
                error: 'Payload inválido',
                detail: parsed.error.errors
            });
        }
        const cedula = String(parsed.data.cedula).replace(/\D+/g, '');
        if (!cedula) {
            return res.status(400).json({ ok: false, error: 'cedula inválida' });
        }
        try {
            const existsQ = await pool.query(
                `SELECT 1 FROM colaboradores WHERE cedula = $1 LIMIT 1`,
                [cedula]
            );
            if (existsQ.rows.length > 0) {
                return res.status(409).json({ ok: false, error: 'Ya existe un colaborador con esa cédula.' });
            }
            const normalizedCreate = normalizeColabTextPatch(parsed.data);
            const tipoPersonal = inferTipoPersonal(normalizedCreate);
            await pool.query(
                `INSERT INTO colaboradores (cedula, nombre, activo, tipo_personal, created_at, updated_at)
                 VALUES ($1, $2, TRUE, $3, NOW(), NOW())`,
                [cedula, normalizedCreate.nombre, tipoPersonal]
            );
            // Resto de campos (cliente, líder, extendidos) vía el mismo helper del PATCH.
            const { cedula: _omit, nombre: _n, ...rest } = stripComputedEconomia(normalizedCreate);
            const calcAlta = computeContratoEconomia(rest);
            const updated = await updateColaboradorByCedula(cedula, {
                ...rest,
                costo_empresa: calcAlta.costo_empresa,
                utilidad: calcAlta.utilidad,
                rt_aprox: calcAlta.rt_aprox
            });
            const actor = actorFromUser(req.user);
            await syncPersonContractsFromFicha(pool, {
                cedula,
                existed: null,
                cliente: normalizedCreate.cliente,
                tipoContrato: normalizedCreate.tipo_contrato,
                fechaInicio: normalizedCreate.fecha_ingreso,
                fechaTermino: normalizedCreate.fecha_termino,
                origen: 'ficha_alta',
                actor
            });
            await persistContratoEconomia(pool, {
                cedula,
                contratoId: null,
                patch: rest,
                actor,
                origen: 'ficha_alta'
            });
            await recordFichaDiff(pool, {
                cedula,
                before: {},
                after: updated,
                actor,
                origen: 'ficha_alta',
                onlyKeys: Object.keys(normalizedCreate)
            });
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user && req.user.sub),
                actorRole: req.user && req.user.role,
                action: 'colaboradores.create_onboarding',
                entityType: 'colaboradores',
                entityId: null,
                metadata: { cedula }
            });
            return res.status(201).json({
                ok: true,
                item: await attachContratosToItem(pool, updated || { cedula })
            });
        } catch (e) {
            console.error('[Onboarding personal POST]', e.message);
            const status = String(e?.code) === '23505' ? 409 : (Number.isInteger(e?.status) ? e.status : 500);
            return res.status(status).json({ ok: false, error: e.message || 'No se pudo crear el colaborador.' });
        }
    });

    /* =========================================================================
     * Marcar baja con motivo legal del catálogo.
     * Sólo super_admin / admin_ch / cac. team_ch no puede tramitar bajas.
     * ========================================================================= */
    const bajaSchema = z.object({
        motivo_baja: z.string().min(2).max(200),
        termino: z.string().max(500).optional().nullable(),
        fecha_termino: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        observaciones: z.string().max(2000).optional().nullable(),
        cliente: z.string().max(500).optional().nullable(),
        contrato_id: z.string().uuid().optional().nullable()
    });

    app.patch('/api/onboarding/personal/:cedula/baja', ...writeGuard, async (req, res) => {
        const cedula = String(req.params.cedula || '').replace(/\D+/g, '');
        if (!cedula) {
            return res.status(400).json({ ok: false, error: 'cedula inválida' });
        }
        const parsed = bajaSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: 'Payload inválido', detail: parsed.error.errors });
        }
        try {
            const beforeBaja = await pool.query(`SELECT * FROM colaboradores WHERE cedula = $1 LIMIT 1`, [cedula]);
            const item = await applyRegistroBajaColaborador(pool, cedula, {
                motivo_baja: parsed.data.motivo_baja,
                fecha_termino: parsed.data.fecha_termino,
                termino: parsed.data.termino,
                cliente: parsed.data.cliente,
                contrato_id: parsed.data.contrato_id,
                actor: actorFromUser(req.user)
            });
            const afterBaja = await pool.query(`SELECT * FROM colaboradores WHERE cedula = $1 LIMIT 1`, [cedula]);
            await recordFichaDiff(pool, {
                cedula,
                before: beforeBaja.rows[0] || {},
                after: afterBaja.rows[0] || {},
                actor: actorFromUser(req.user),
                origen: 'baja',
                onlyKeys: ['motivo_baja', 'activo', 'termino']
            });
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user && req.user.sub),
                actorRole: req.user && req.user.role,
                action: 'colaborador.baja',
                entityType: 'colaborador',
                entityId: null,
                metadata: { cedula, ...parsed.data }
            });
            return res.json({ ok: true, item });
        } catch (e) {
            console.error('[Onboarding baja]', e.message);
            const status = Number.isInteger(e?.status) ? e.status : 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al marcar baja' });
        }
    });

    const cancelarSchema = z.object({
        observaciones: z.string().max(2000).optional().nullable()
    });

    app.patch('/api/onboarding/personal/:cedula/cancelar', ...writeGuard, async (req, res) => {
        const cedula = String(req.params.cedula || '').replace(/\D+/g, '');
        if (!cedula) {
            return res.status(400).json({ ok: false, error: 'cedula inválida' });
        }
        const parsed = cancelarSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: 'Payload inválido', detail: parsed.error.errors });
        }
        try {
            const beforeQ = await pool.query(`SELECT * FROM colaboradores WHERE cedula = $1 LIMIT 1`, [cedula]);
            const result = await applyCancelarColaborador(pool, cedula, {
                observaciones: parsed.data.observaciones
            });
            const afterQ = await pool.query(`SELECT * FROM colaboradores WHERE cedula = $1 LIMIT 1`, [cedula]);
            await recordFichaDiff(pool, {
                cedula,
                before: beforeQ.rows[0] || {},
                after: afterQ.rows[0] || {},
                actor: actorFromUser(req.user),
                origen: 'cancelado',
                onlyKeys: ['cancelado', 'activo', 'obs_cancelacion']
            });
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user && req.user.sub),
                actorRole: req.user && req.user.role,
                action: 'colaborador.cancelado',
                entityType: 'colaborador',
                entityId: null,
                metadata: { cedula, observaciones: parsed.data.observaciones || null }
            });
            return res.json({ ok: true, item: result.item });
        } catch (e) {
            console.error('[Onboarding cancelar]', e.message);
            const status = Number.isInteger(e?.status) ? e.status : 500;
            return res.status(status).json({ ok: false, error: e.message || 'Error al cancelar' });
        }
    });

    /* =========================================================================
     * Calculadora salarial (1:1 por cédula).
     * ========================================================================= */
    app.get('/api/onboarding/calculadora/:cedula', ...readGuard, async (req, res) => {
        const cedula = String(req.params.cedula || '').replace(/\D+/g, '');
        if (!cedula) return res.status(400).json({ ok: false, error: 'cedula inválida' });
        try {
            const q = await pool.query(
                `SELECT cs.*, c.nombre, c.cliente, c.tipo_personal
                 FROM colaborador_calculo_salarial cs
                 INNER JOIN colaboradores c ON c.cedula = cs.cedula
                 WHERE cs.cedula = $1`,
                [cedula]
            );
            return res.json({ ok: true, item: q.rows[0] || null });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    const calculadoraSchema = z.object({
        costo_empresa: z.number().nullable().optional(),
        tarifa_cliente: z.number().nullable().optional(),
        pct_ajuste_salario: z.number().min(-1).max(5).optional(),
        pct_ajuste_tarifa: z.number().min(-1).max(5).optional(),
        moneda: z.string().max(3).optional(),
        periodicidad_pago: z.string().max(60).optional(),
        vigente_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        vigente_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable()
    });

    app.put('/api/onboarding/calculadora/:cedula', ...writeGuard, async (req, res) => {
        const cedula = String(req.params.cedula || '').replace(/\D+/g, '');
        if (!cedula) return res.status(400).json({ ok: false, error: 'cedula inválida' });
        const parsed = calculadoraSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: 'Payload inválido', detail: parsed.error.errors });
        }
        try {
            // Verifica que la cedula exista
            const exists = await pool.query(
                `SELECT esquema_contrato, tarifa_cliente, costo_empresa
                 FROM colaboradores WHERE cedula = $1 LIMIT 1`,
                [cedula]
            );
            if (exists.rows.length === 0) {
                return res.status(404).json({ ok: false, error: 'colaborador no encontrado' });
            }
            const userId = parseUuidActor(req.user && req.user.sub);
            const q = await pool.query(
                `INSERT INTO colaborador_calculo_salarial
                    (cedula, costo_empresa, tarifa_cliente, pct_ajuste_salario, pct_ajuste_tarifa,
                     moneda, periodicidad_pago, vigente_desde, vigente_hasta, updated_by_user_id)
                 VALUES ($1, $2, $3, COALESCE($4, 0), COALESCE($5, 0),
                         COALESCE($6, 'COP'), $7, $8::date, $9::date, $10::uuid)
                 ON CONFLICT (cedula) DO UPDATE SET
                    costo_empresa = COALESCE(EXCLUDED.costo_empresa, colaborador_calculo_salarial.costo_empresa),
                    tarifa_cliente = COALESCE(EXCLUDED.tarifa_cliente, colaborador_calculo_salarial.tarifa_cliente),
                    pct_ajuste_salario = EXCLUDED.pct_ajuste_salario,
                    pct_ajuste_tarifa = EXCLUDED.pct_ajuste_tarifa,
                    moneda = COALESCE(EXCLUDED.moneda, colaborador_calculo_salarial.moneda),
                    periodicidad_pago = COALESCE(EXCLUDED.periodicidad_pago, colaborador_calculo_salarial.periodicidad_pago),
                    vigente_desde = COALESCE(EXCLUDED.vigente_desde, colaborador_calculo_salarial.vigente_desde),
                    vigente_hasta = EXCLUDED.vigente_hasta,
                    updated_by_user_id = EXCLUDED.updated_by_user_id
                 RETURNING *`,
                [
                    cedula,
                    parsed.data.costo_empresa ?? null,
                    parsed.data.tarifa_cliente ?? null,
                    parsed.data.pct_ajuste_salario ?? 0,
                    parsed.data.pct_ajuste_tarifa ?? 0,
                    parsed.data.moneda || null,
                    parsed.data.periodicidad_pago || null,
                    parsed.data.vigente_desde || null,
                    parsed.data.vigente_hasta || null,
                    userId
                ]
            );

            // También actualizamos tarifa_cliente y costo_empresa en `colaboradores` para que
            // Conciliaciones y otros módulos consuman valores frescos.
            await pool.query(
                `UPDATE colaboradores SET
                    costo_empresa = COALESCE($1, costo_empresa),
                    tarifa_cliente = COALESCE($2, tarifa_cliente),
                    utilidad = COALESCE($3, utilidad),
                    rt_aprox = COALESCE($4, rt_aprox),
                    updated_at = NOW()
                 WHERE cedula = $5`,
                [
                    q.rows[0].costo_empresa,
                    q.rows[0].tarifa_cliente,
                    q.rows[0].utilidad,
                    q.rows[0].rt_aprox,
                    cedula
                ]
            );

            await recordFichaDiff(pool, {
                cedula,
                before: exists.rows[0],
                after: {
                    ...exists.rows[0],
                    tarifa_cliente: q.rows[0].tarifa_cliente,
                    costo_empresa: q.rows[0].costo_empresa
                },
                actor: actorFromUser(req.user),
                origen: 'calculadora',
                onlyKeys: ['tarifa_cliente', 'costo_empresa']
            });
            await writeAudit(pool, {
                actorUserId: userId,
                actorRole: req.user && req.user.role,
                action: 'calculadora.upsert',
                entityType: 'colaborador',
                entityId: null,
                metadata: { cedula, ...parsed.data }
            });
            return res.json({ ok: true, item: q.rows[0] });
        } catch (e) {
            console.error('[Onboarding calculadora]', e.message);
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    /* =========================================================================
     * Licencias de maternidad / paternidad / lactancia.
     * ========================================================================= */
    const licenciasQuerySchema = z.object({
        q: z.string().max(200).optional(),
        cliente: z.string().max(500).optional(),
        tipo_licencia: z.enum(['maternidad', 'paternidad', 'lactancia']).optional(),
        estado: z.enum(['abierta', 'cerrada']).optional(),
        eps: z.string().max(200).optional(),
        inicio_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        inicio_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        sort: z.string().max(80).optional(),
        dir: z.enum(['asc', 'desc']).optional(),
        limit: z.coerce.number().int().min(1).max(2000).optional(),
        offset: z.coerce.number().int().min(0).optional()
    });

    app.get('/api/onboarding/licencias', ...readGuard, async (req, res) => {
        const parsed = licenciasQuerySchema.safeParse(req.query || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: 'Query inválido', detail: parsed.error.errors });
        }
        if (!isAllowedLicenciasSort(parsed.data.sort)) {
            return res.status(400).json({ ok: false, error: 'sort no permitido' });
        }
        const filters = parsed.data;
        const limit = Math.min(filters.limit || 100, 2000);
        const offset = filters.offset || 0;
        try {
            const where = [];
            const params = [];
            let p = 1;
            if (filters.q) {
                params.push(`%${String(filters.q).toLowerCase()}%`);
                where.push(`(LOWER(l.cedula) LIKE $${p} OR LOWER(COALESCE(c.nombre, '')) LIKE $${p})`);
                p += 1;
            }
            if (filters.cliente) {
                params.push(String(filters.cliente).trim());
                where.push(`LOWER(TRIM(COALESCE(c.cliente, l.cliente))) = LOWER($${p++})`);
            }
            if (filters.tipo_licencia) {
                params.push(filters.tipo_licencia);
                where.push(`l.tipo_licencia = $${p++}`);
            }
            if (filters.estado) {
                params.push(filters.estado);
                where.push(`l.estado = $${p++}`);
            }
            if (filters.eps) {
                params.push(String(filters.eps).trim());
                where.push(`LOWER(TRIM(COALESCE(l.eps, ''))) = LOWER($${p++})`);
            }
            if (filters.inicio_desde) {
                params.push(filters.inicio_desde);
                where.push(`l.inicio_licencia >= $${p++}::date`);
            }
            if (filters.inicio_hasta) {
                params.push(filters.inicio_hasta);
                where.push(`l.inicio_licencia <= $${p++}::date`);
            }
            const scope = await buildScopeFilter(pool, req.user);
            const scopeApplied = applyScopePlaceholders(scope.where, p, scope);
            if (scopeApplied.sql && scopeApplied.sql !== 'TRUE') {
                where.push(scopeApplied.sql);
                params.push(...scope.params);
                p = scopeApplied.idx;
            }
            if (scopeApplied.sql === 'FALSE') {
                return res.json({ ok: true, items: [], total: 0, limit, offset });
            }
            const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
            const countQ = await pool.query(
                `SELECT COUNT(*)::int AS total
                 FROM colaborador_licencias_maternidad l
                 LEFT JOIN colaboradores c ON c.cedula = l.cedula
                 ${whereSql}`,
                params
            );
            const total = countQ.rows[0] ? Number(countQ.rows[0].total) : 0;
            const orderBy = buildLicenciasOrderBy(filters.sort, filters.dir);
            params.push(limit, offset);
            const listQ = await pool.query(
                `SELECT l.*, c.nombre, c.cliente, c.tipo_personal
                 FROM colaborador_licencias_maternidad l
                 LEFT JOIN colaboradores c ON c.cedula = l.cedula
                 ${whereSql}
                 ORDER BY ${orderBy}
                 LIMIT $${p++} OFFSET $${p++}`,
                params
            );
            return res.json({ ok: true, items: listQ.rows, total, limit, offset });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    const licenciaSchema = z.object({
        cedula: z.string().regex(/^\d+$/).min(5).max(20),
        cliente: z.string().max(500).optional().nullable(),
        tipo_licencia: z.enum(['maternidad', 'paternidad', 'lactancia']).optional(),
        meses_gestacion: z.number().optional().nullable(),
        parto_fecha_aproximada: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        inicio_licencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        fin_licencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        eps: z.string().max(200).optional().nullable(),
        observaciones: z.string().max(2000).optional().nullable(),
        estado: z.enum(['abierta', 'cerrada']).optional()
    });

    app.post('/api/onboarding/licencias', ...writeGuard, async (req, res) => {
        const parsed = licenciaSchema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: 'Payload inválido', detail: parsed.error.errors });
        }
        try {
            const d = parsed.data;
            const q = await pool.query(
                `INSERT INTO colaborador_licencias_maternidad
                    (cedula, cliente, tipo_licencia, meses_gestacion,
                     parto_fecha_aproximada, inicio_licencia, fin_licencia,
                     eps, observaciones, estado)
                 VALUES ($1, $2, COALESCE($3, 'maternidad'), $4,
                         $5::date, $6::date, $7::date,
                         $8, $9, COALESCE($10, 'abierta'))
                 RETURNING *`,
                [
                    d.cedula, d.cliente || null, d.tipo_licencia || null, d.meses_gestacion ?? null,
                    d.parto_fecha_aproximada || null, d.inicio_licencia || null, d.fin_licencia || null,
                    d.eps || null, d.observaciones || null, d.estado || null
                ]
            );
            return res.json({ ok: true, item: q.rows[0] });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    /* =========================================================================
     * Documentos extranjeros (SIRE / RUTEC / PPT).
     * ========================================================================= */
    const extranjerosQuerySchema = z.object({
        q: z.string().max(200).optional(),
        cliente: z.string().max(500).optional(),
        lugar_nacimiento: z.string().max(200).optional(),
        tipo_identificacion: z.string().max(120).optional(),
        estado_documento: z.string().max(80).optional(),
        registro_sire: z.enum(['true', 'false']).optional(),
        registro_rutec: z.enum(['true', 'false']).optional(),
        vence_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        vence_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        sort: z.string().max(80).optional(),
        dir: z.enum(['asc', 'desc']).optional(),
        limit: z.coerce.number().int().min(1).max(2000).optional(),
        offset: z.coerce.number().int().min(0).optional()
    });

    app.get('/api/onboarding/documentos-extranjeros', ...readGuard, async (req, res) => {
        const parsed = extranjerosQuerySchema.safeParse(req.query || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: 'Query inválido', detail: parsed.error.errors });
        }
        if (!isAllowedExtranjerosSort(parsed.data.sort)) {
            return res.status(400).json({ ok: false, error: 'sort no permitido' });
        }
        const filters = parsed.data;
        const limit = Math.min(filters.limit || 100, 2000);
        const offset = filters.offset || 0;
        try {
            const where = [];
            const params = [];
            let p = 1;
            if (filters.q) {
                params.push(`%${String(filters.q).toLowerCase()}%`);
                where.push(`(LOWER(d.cedula) LIKE $${p} OR LOWER(COALESCE(c.nombre, '')) LIKE $${p})`);
                p += 1;
            }
            if (filters.cliente) {
                params.push(String(filters.cliente).trim());
                where.push(`LOWER(TRIM(COALESCE(c.cliente, ''))) = LOWER($${p++})`);
            }
            if (filters.lugar_nacimiento) {
                params.push(`%${String(filters.lugar_nacimiento).toLowerCase()}%`);
                where.push(`LOWER(COALESCE(d.lugar_nacimiento, '')) LIKE $${p++}`);
            }
            if (filters.tipo_identificacion) {
                params.push(String(filters.tipo_identificacion).trim());
                where.push(`LOWER(TRIM(COALESCE(d.tipo_identificacion, ''))) = LOWER($${p++})`);
            }
            if (filters.estado_documento) {
                params.push(String(filters.estado_documento).trim());
                where.push(`LOWER(TRIM(COALESCE(d.estado_documento, ''))) = LOWER($${p++})`);
            }
            if (filters.registro_sire) {
                params.push(filters.registro_sire === 'true');
                where.push(`d.registro_sire = $${p++}::boolean`);
            }
            if (filters.registro_rutec) {
                params.push(filters.registro_rutec === 'true');
                where.push(`d.registro_rutec = $${p++}::boolean`);
            }
            if (filters.vence_desde) {
                params.push(filters.vence_desde);
                where.push(`d.fecha_vencimiento >= $${p++}::date`);
            }
            if (filters.vence_hasta) {
                params.push(filters.vence_hasta);
                where.push(`d.fecha_vencimiento <= $${p++}::date`);
            }
            const scope = await buildScopeFilter(pool, req.user);
            const scopeApplied = applyScopePlaceholders(scope.where, p, scope);
            if (scopeApplied.sql && scopeApplied.sql !== 'TRUE') {
                where.push(scopeApplied.sql);
                params.push(...scope.params);
                p = scopeApplied.idx;
            }
            if (scopeApplied.sql === 'FALSE') {
                return res.json({ ok: true, items: [], total: 0, limit, offset });
            }
            const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
            const countQ = await pool.query(
                `SELECT COUNT(*)::int AS total
                 FROM colaborador_documentos_extranjeros d
                 INNER JOIN colaboradores c ON c.cedula = d.cedula
                 ${whereSql}`,
                params
            );
            const total = countQ.rows[0] ? Number(countQ.rows[0].total) : 0;
            const orderBy = buildExtranjerosOrderBy(filters.sort, filters.dir);
            params.push(limit, offset);
            const listQ = await pool.query(
                `SELECT d.*, c.nombre, c.cliente, c.tipo_personal, c.activo
                 FROM colaborador_documentos_extranjeros d
                 INNER JOIN colaboradores c ON c.cedula = d.cedula
                 ${whereSql}
                 ORDER BY ${orderBy}
                 LIMIT $${p++} OFFSET $${p++}`,
                params
            );
            return res.json({ ok: true, items: listQ.rows, total, limit, offset });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    const docExtranjeroSchema = z.object({
        cedula: z.string().regex(/^\d+$/).min(5).max(20),
        lugar_nacimiento: z.string().max(200).optional().nullable(),
        tipo_identificacion: z.string().max(120).optional().nullable(),
        numero_identidad: z.string().max(60).optional().nullable(),
        motivo: z.string().max(200).optional().nullable(),
        fecha_vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        registro_sire: z.boolean().optional().nullable(),
        registro_rutec: z.boolean().optional().nullable(),
        vigencia_renovar: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        no_contrato: z.string().max(60).optional().nullable(),
        estado_documento: z.string().max(80).optional().nullable(),
        observaciones: z.string().max(2000).optional().nullable()
    });

    app.put('/api/onboarding/documentos-extranjeros/:cedula', ...writeGuard, async (req, res) => {
        const cedula = String(req.params.cedula || '').replace(/\D+/g, '');
        if (!cedula) return res.status(400).json({ ok: false, error: 'cedula inválida' });
        const parsed = docExtranjeroSchema.safeParse({ ...req.body, cedula });
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: 'Payload inválido', detail: parsed.error.errors });
        }
        try {
            const d = parsed.data;
            const q = await pool.query(
                `INSERT INTO colaborador_documentos_extranjeros
                    (cedula, lugar_nacimiento, tipo_identificacion, numero_identidad,
                     motivo, fecha_vencimiento, registro_sire, registro_rutec,
                     vigencia_renovar, no_contrato, estado_documento, observaciones, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6::date, $7, $8, $9::date, $10, $11, $12, NOW())
                 ON CONFLICT (cedula) DO UPDATE SET
                    lugar_nacimiento = COALESCE(EXCLUDED.lugar_nacimiento, colaborador_documentos_extranjeros.lugar_nacimiento),
                    tipo_identificacion = COALESCE(EXCLUDED.tipo_identificacion, colaborador_documentos_extranjeros.tipo_identificacion),
                    numero_identidad = COALESCE(EXCLUDED.numero_identidad, colaborador_documentos_extranjeros.numero_identidad),
                    motivo = COALESCE(EXCLUDED.motivo, colaborador_documentos_extranjeros.motivo),
                    fecha_vencimiento = COALESCE(EXCLUDED.fecha_vencimiento, colaborador_documentos_extranjeros.fecha_vencimiento),
                    registro_sire = COALESCE(EXCLUDED.registro_sire, colaborador_documentos_extranjeros.registro_sire),
                    registro_rutec = COALESCE(EXCLUDED.registro_rutec, colaborador_documentos_extranjeros.registro_rutec),
                    vigencia_renovar = COALESCE(EXCLUDED.vigencia_renovar, colaborador_documentos_extranjeros.vigencia_renovar),
                    no_contrato = COALESCE(EXCLUDED.no_contrato, colaborador_documentos_extranjeros.no_contrato),
                    estado_documento = COALESCE(EXCLUDED.estado_documento, colaborador_documentos_extranjeros.estado_documento),
                    observaciones = COALESCE(EXCLUDED.observaciones, colaborador_documentos_extranjeros.observaciones),
                    updated_at = NOW()
                 RETURNING *`,
                [
                    cedula, d.lugar_nacimiento || null, d.tipo_identificacion || null, d.numero_identidad || null,
                    d.motivo || null, d.fecha_vencimiento || null, d.registro_sire ?? null, d.registro_rutec ?? null,
                    d.vigencia_renovar || null, d.no_contrato || null, d.estado_documento || null, d.observaciones || null
                ]
            );
            return res.json({ ok: true, item: q.rows[0] });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    /* =========================================================================
     * Catálogos (lectura).
     * ========================================================================= */
    function catalogoEndpoint(table) {
        return async (_req, res) => {
            try {
                const q = await pool.query(
                    `SELECT * FROM ${table} WHERE activo = TRUE ORDER BY ${table === 'cat_motivo_baja' ? 'orden, motivo' : (table === 'cat_ciudades' ? 'ciudad' : 'nombre')}`
                );
                return res.json({ ok: true, items: q.rows });
            } catch (e) {
                return res.status(500).json({ ok: false, error: e.message });
            }
        };
    }

    app.get('/api/onboarding/catalogos/motivo-baja', ...catGuard, catalogoEndpoint('cat_motivo_baja'));
    app.get('/api/onboarding/catalogos/ciudades', ...catGuard, catalogoEndpoint('cat_ciudades'));
    app.get('/api/onboarding/catalogos/eps', ...catGuard, catalogoEndpoint('cat_eps'));
    app.get('/api/onboarding/catalogos/afp', ...catGuard, catalogoEndpoint('cat_afp'));
    app.get('/api/onboarding/catalogos/arl', ...catGuard, catalogoEndpoint('cat_arl'));
    app.get('/api/onboarding/catalogos/ccf', ...catGuard, catalogoEndpoint('cat_ccf'));
    app.get('/api/onboarding/catalogos/cesantias', ...catGuard, catalogoEndpoint('cat_cesantias'));
    app.get('/api/onboarding/catalogos/puestos', ...catGuard, async (req, res) => {
        try {
            const q = await pool.query(
                `SELECT DISTINCT TRIM(puesto) AS puesto
                 FROM colaboradores
                 WHERE puesto IS NOT NULL AND TRIM(puesto) <> ''
                 ORDER BY 1`
            );
            return res.json({ ok: true, items: q.rows });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    /** Valores DISTINCT desde `colaboradores` para filtros avanzados (desplegables). */
    const COLAB_DISTINCT_FILTER_COLS = new Set([
        'sexo',
        'tipo_contrato',
        'profesion',
        'tipo_identificacion',
        'departamento',
        'ciudad'
    ]);
    app.get('/api/onboarding/catalogos/colaborador-valores/:campo', ...catGuard, async (req, res) => {
        const campo = String(req.params.campo || '').trim();
        if (!COLAB_DISTINCT_FILTER_COLS.has(campo)) {
            return res.status(400).json({ ok: false, error: 'campo de catálogo no permitido' });
        }
        try {
            const q = await pool.query(
                `SELECT DISTINCT TRIM(c.${campo}) AS valor
                 FROM colaboradores c
                 WHERE c.${campo} IS NOT NULL AND TRIM(c.${campo}) <> ''
                 ORDER BY 1`
            );
            return res.json({ ok: true, campo, items: q.rows.map((r) => r.valor).filter(Boolean) });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    /* =========================================================================
     * Reporte de rotación (reemplazo de hoja Excel "Rotación").
     * Agrupa bajas por motivo y rango opcional, devuelve total + breakdown.
     * ========================================================================= */
    const rotacionQuerySchema = z.object({
        desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        cliente: z.string().max(500).optional(),
        tipo_personal: z.enum(['consultor', 'staff', 'sena', 'alianza']).optional()
    });

    app.get('/api/onboarding/reportes/rotacion', ...readGuard, async (req, res) => {
        const parsed = rotacionQuerySchema.safeParse(req.query || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: 'Query inválido', detail: parsed.error.errors });
        }
        const { desde, hasta, cliente, tipo_personal } = parsed.data;
        const where = [`c.motivo_baja IS NOT NULL`];
        const params = [];
        let p = 1;
        if (desde) { params.push(desde); where.push(`c.fecha_termino >= $${p++}::date`); }
        if (hasta) { params.push(hasta); where.push(`c.fecha_termino <= $${p++}::date`); }
        if (cliente) { params.push(cliente); where.push(`LOWER(TRIM(c.cliente)) = LOWER($${p++})`); }
        if (tipo_personal) { params.push(tipo_personal); where.push(`c.tipo_personal = $${p++}`); }
        const scope = await buildScopeFilter(pool, req.user);
        const scopeApplied = applyScopePlaceholders(scope.where, p, scope);
        if (scopeApplied.sql && scopeApplied.sql !== 'TRUE') {
            where.push(scopeApplied.sql);
            params.push(...scope.params);
            p = scopeApplied.idx;
        }
        if (scopeApplied.sql === 'FALSE') {
            return res.json({ ok: true, total: 0, items: [], by_month: [] });
        }
        const whereSql = `WHERE ${where.join(' AND ')}`;
        try {
            // Normaliza motivo_baja (case/acentos/espacios + sinónimos y errores comunes)
            // mapeando al catálogo de motivos; lo no clasificable cae en 'Otros'.
            const byMotivoQ = await pool.query(
                `SELECT motivo, COUNT(*)::int AS cuenta
                 FROM (
                    SELECT CASE
                        WHEN m LIKE '%renunc%' OR m LIKE '%renin%' OR m LIKE '%voluntar%' THEN 'Renuncia Voluntaria'
                        WHEN m LIKE '%mutuo%' THEN 'Mutuo Acuerdo'
                        WHEN m LIKE '%prueba%' THEN 'Periodo de Prueba'
                        WHEN m LIKE '%notif%' THEN 'Notificación Termino de Servicio'
                        WHEN m LIKE '%obra%' OR m LIKE '%labor%' THEN 'Termino de la Obra o Labor'
                        WHEN m LIKE '%contrato%' THEN 'Termino de Contrato'
                        WHEN m LIKE '%servicio%' THEN 'Termino de Servicio'
                        WHEN m LIKE '%absor%' OR m LIKE '%aborcion%' OR m LIKE '%absocion%'
                             OR (m LIKE 'ab%' AND m LIKE '%cion') THEN 'Absorción'
                        ELSE 'Otros'
                    END AS motivo
                    FROM (
                        SELECT lower(regexp_replace(
                            translate(TRIM(c.motivo_baja), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'),
                            '\\s+', ' ', 'g')) AS m
                        FROM colaboradores c ${whereSql}
                    ) z
                 ) g
                 GROUP BY motivo
                 ORDER BY cuenta DESC`,
                params
            );
            const byMonthQ = await pool.query(
                `SELECT to_char(c.fecha_termino, 'YYYY-MM') AS mes, COUNT(*)::int AS cuenta
                 FROM colaboradores c ${whereSql}
                 GROUP BY mes
                 ORDER BY mes DESC`,
                params
            );
            const totalQ = await pool.query(
                `SELECT COUNT(*)::int AS total FROM colaboradores c ${whereSql}`,
                params
            );
            return res.json({
                ok: true,
                total: totalQ.rows[0] ? Number(totalQ.rows[0].total) : 0,
                items: byMotivoQ.rows,
                by_month: byMonthQ.rows
            });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    /* =========================================================================
     * Panel de gráficas onboarding: agregados de cabecera para el dashboard.
     *  - headcount_by_tipo: activos agrupados por tipo_personal
     *  - activos_vs_bajas: conteo activos vs bajas
     *  - ingresos_by_month: ingresos por mes (rango opcional desde/hasta o últimos 12 meses)
     *  - ingresos_mes: ingresos del mes actual Bogotá
     *  - ciclo_ficha_ingreso: días promedio desde que nació la ficha hasta fecha_ingreso
     * Respeta el scope GP igual que el reporte de rotación.
     * ========================================================================= */
    const graficasQuerySchema = z.object({
        desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        cliente: z.string().max(500).optional(),
        tipo_personal: z.enum(['consultor', 'staff', 'sena', 'alianza']).optional()
    });

    app.get('/api/onboarding/reportes/graficas', ...readGuard, async (req, res) => {
        const parsed = graficasQuerySchema.safeParse(req.query || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: 'Query inválido', detail: parsed.error.errors });
        }
        const { desde, hasta, cliente, tipo_personal } = parsed.data;
        const scope = await buildScopeFilter(pool, req.user);

        /** Construye WHERE + params aislados por consulta, anexando cliente/tipo + scope GP. */
        const buildWhere = (baseConds, { withTipo = true } = {}) => {
            const where = [...baseConds];
            const params = [];
            let p = 1;
            if (cliente) { params.push(cliente); where.push(`LOWER(TRIM(c.cliente)) = LOWER($${p++})`); }
            if (withTipo && tipo_personal) { params.push(tipo_personal); where.push(`c.tipo_personal = $${p++}`); }
            const scopeApplied = applyScopePlaceholders(scope.where, p, scope);
            if (scopeApplied.sql === 'FALSE') {
                return { whereSql: '', params, scopeFalse: true };
            }
            if (scopeApplied.sql && scopeApplied.sql !== 'TRUE') {
                where.push(scopeApplied.sql);
                params.push(...scope.params);
            }
            return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params, scopeFalse: false };
        };

        try {
            const headcount = buildWhere([`c.activo = TRUE`]);
            const avb = buildWhere([], { withTipo: false });
            // Para ingresos aplicamos el rango sobre fecha_ingreso (o últimos 12 meses por defecto).
            const ingresoBase = buildWhere([`c.fecha_ingreso IS NOT NULL`]);
            const irpBase = buildWhere([]);
            if (headcount.scopeFalse || avb.scopeFalse || ingresoBase.scopeFalse || irpBase.scopeFalse) {
                return res.json({
                    ok: true,
                    headcount_by_tipo: [],
                    activos_vs_bajas: { activos: 0, bajas: 0 },
                    ingresos_by_month: [],
                    ingresos_mes: { mes: null, cuenta: 0 },
                    ciclo_ficha_ingreso: { promedio_dias: null, n: 0 },
                    irp: {
                        bajas_periodo: 0,
                        headcount_inicio: 0,
                        headcount_fin: 0,
                        promedio: 0,
                        irp: null,
                        desde: desde || null,
                        hasta: hasta || null
                    }
                });
            }

            const headcountQ = await pool.query(
                `SELECT COALESCE(c.tipo_personal, 'consultor') AS tipo, COUNT(*)::int AS cuenta
                 FROM colaboradores c ${headcount.whereSql}
                 GROUP BY c.tipo_personal
                 ORDER BY cuenta DESC`,
                headcount.params
            );

            const avbQ = await pool.query(
                `SELECT
                    COUNT(*) FILTER (WHERE c.activo = TRUE AND c.cancelado IS NOT TRUE)::int AS activos,
                    COUNT(*) FILTER (WHERE c.activo = FALSE AND c.cancelado IS NOT TRUE)::int AS bajas
                 FROM colaboradores c ${avb.whereSql}`,
                avb.params
            );

            // ingresos por mes: rango explícito si viene desde/hasta; si no, últimos 12 meses.
            const ingParams = [...ingresoBase.params];
            let ingWhere = ingresoBase.whereSql;
            if (desde || hasta) {
                const extra = [];
                if (desde) { ingParams.push(desde); extra.push(`c.fecha_ingreso >= $${ingParams.length}::date`); }
                if (hasta) { ingParams.push(hasta); extra.push(`c.fecha_ingreso <= $${ingParams.length}::date`); }
                ingWhere = ingWhere
                    ? `${ingWhere} AND ${extra.join(' AND ')}`
                    : `WHERE ${extra.join(' AND ')}`;
            } else {
                ingWhere = ingWhere
                    ? `${ingWhere} AND c.fecha_ingreso >= (CURRENT_DATE - INTERVAL '12 months')`
                    : `WHERE c.fecha_ingreso >= (CURRENT_DATE - INTERVAL '12 months')`;
            }
            const ingresosQ = await pool.query(
                `SELECT to_char(c.fecha_ingreso, 'YYYY-MM') AS mes, COUNT(*)::int AS cuenta
                 FROM colaboradores c ${ingWhere}
                 GROUP BY mes
                 ORDER BY mes ASC`,
                ingParams
            );

            const mesParams = [...ingresoBase.params];
            let mesWhere = ingresoBase.whereSql;
            mesWhere = mesWhere
                ? `${mesWhere} AND to_char(c.fecha_ingreso, 'YYYY-MM') = to_char((timezone('America/Bogota', now()))::date, 'YYYY-MM')`
                : `WHERE to_char(c.fecha_ingreso, 'YYYY-MM') = to_char((timezone('America/Bogota', now()))::date, 'YYYY-MM')`;
            const mesQ = await pool.query(
                `SELECT to_char((timezone('America/Bogota', now()))::date, 'YYYY-MM') AS mes,
                        COUNT(*)::int AS cuenta
                 FROM colaboradores c ${mesWhere}`,
                mesParams
            );

            const cicloParams = [...ingresoBase.params];
            let cicloWhere = ingresoBase.whereSql;
            if (desde || hasta) {
                const extra = [];
                if (desde) { cicloParams.push(desde); extra.push(`c.fecha_ingreso >= $${cicloParams.length}::date`); }
                if (hasta) { cicloParams.push(hasta); extra.push(`c.fecha_ingreso <= $${cicloParams.length}::date`); }
                cicloWhere = cicloWhere
                    ? `${cicloWhere} AND ${extra.join(' AND ')}`
                    : `WHERE ${extra.join(' AND ')}`;
            }
            const nacio = `(${FICHA_NACIO_SQL.trim()})`;
            cicloWhere = cicloWhere
                ? `${cicloWhere} AND ${nacio} IS NOT NULL AND c.fecha_ingreso >= ${nacio}`
                : `WHERE ${nacio} IS NOT NULL AND c.fecha_ingreso >= ${nacio}`;
            const cicloQ = await pool.query(
                `SELECT ROUND(AVG((c.fecha_ingreso - ${nacio}))::numeric, 1) AS promedio_dias,
                        COUNT(*)::int AS n
                 FROM colaboradores c ${cicloWhere}`,
                cicloParams
            );

            // IRP = bajas del periodo / promedio de empleados (inicio,fin) x 100.
            // Periodo: desde/hasta si vienen; si no, últimos 12 meses hasta hoy.
            const irpParams = [...irpBase.params];
            let inicioExpr;
            let finExpr;
            if (desde) { irpParams.push(desde); inicioExpr = `$${irpParams.length}::date`; }
            else { inicioExpr = `(CURRENT_DATE - INTERVAL '12 months')::date`; }
            if (hasta) { irpParams.push(hasta); finExpr = `$${irpParams.length}::date`; }
            else { finExpr = `CURRENT_DATE`; }
            const irpQ = await pool.query(
                `SELECT
                    COUNT(*) FILTER (
                        WHERE c.fecha_termino BETWEEN ${inicioExpr} AND ${finExpr}
                    )::int AS bajas_periodo,
                    COUNT(*) FILTER (
                        WHERE c.fecha_ingreso <= ${inicioExpr}
                          AND (c.fecha_termino IS NULL OR c.fecha_termino > ${inicioExpr})
                    )::int AS headcount_inicio,
                    COUNT(*) FILTER (
                        WHERE c.fecha_ingreso <= ${finExpr}
                          AND (c.fecha_termino IS NULL OR c.fecha_termino > ${finExpr})
                    )::int AS headcount_fin
                 FROM colaboradores c ${irpBase.whereSql}`,
                irpParams
            );
            const irpRow = irpQ.rows[0] || {};
            const bajasPeriodo = Number(irpRow.bajas_periodo) || 0;
            const headInicio = Number(irpRow.headcount_inicio) || 0;
            const headFin = Number(irpRow.headcount_fin) || 0;
            const promedio = (headInicio + headFin) / 2.0;
            const irpValor = promedio > 0 ? Number(((bajasPeriodo / promedio) * 100).toFixed(2)) : null;

            return res.json({
                ok: true,
                headcount_by_tipo: headcountQ.rows,
                activos_vs_bajas: avbQ.rows[0]
                    ? { activos: Number(avbQ.rows[0].activos), bajas: Number(avbQ.rows[0].bajas) }
                    : { activos: 0, bajas: 0 },
                ingresos_by_month: ingresosQ.rows,
                ingresos_mes: {
                    mes: mesQ.rows[0]?.mes || null,
                    cuenta: Number(mesQ.rows[0]?.cuenta) || 0
                },
                ciclo_ficha_ingreso: {
                    promedio_dias: cicloQ.rows[0]?.promedio_dias != null
                        ? Number(cicloQ.rows[0].promedio_dias)
                        : null,
                    n: Number(cicloQ.rows[0]?.n) || 0
                },
                irp: {
                    bajas_periodo: bajasPeriodo,
                    headcount_inicio: headInicio,
                    headcount_fin: headFin,
                    promedio: Number(promedio.toFixed(2)),
                    irp: irpValor,
                    desde: desde || null,
                    hasta: hasta || null
                }
            });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    /* =========================================================================
     * Auditoría del buzón onboarding_staging. Solo super_admin.
     * ========================================================================= */
    const stagingQuerySchema = z.object({
        status: z.enum(['recibido', 'aplicado', 'rechazado', 'requiere_revision']).optional(),
        source: z.enum(['dynamo_stream', 'n8n_webhook', 'excel_etl', 'manual']).optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
        offset: z.coerce.number().int().min(0).optional()
    });

    app.get('/api/onboarding/staging', ...adminOnlyGuard, async (req, res) => {
        const parsed = stagingQuerySchema.safeParse(req.query || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: 'Query inválido', detail: parsed.error.errors });
        }
        const { status, source, limit = 100, offset = 0 } = parsed.data;
        const where = [];
        const params = [];
        let p = 1;
        if (status) { params.push(status); where.push(`status = $${p++}`); }
        if (source) { params.push(source); where.push(`source = $${p++}`); }
        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        params.push(limit, offset);
        try {
            const q = await pool.query(
                `SELECT id, source, external_id, event_type, status,
                        cedula_resultante, error, sequence_number, shard_id,
                        created_at, processed_at, payload
                 FROM onboarding_staging
                 ${whereSql}
                 ORDER BY created_at DESC
                 LIMIT $${p++} OFFSET $${p++}`,
                params
            );
            return res.json({ ok: true, items: q.rows });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    /* =========================================================================
     * Novedades Zoho — buzón de revisión (Capital Humano).
     * ========================================================================= */
    const fichaNovedadesQuerySchema = z.object({
        status: z.enum(['pendiente', 'aplicado', 'rechazado', 'sin_match']).optional(),
        scope: z.enum(['inbox', 'historico']).optional(),
        tipo_novedad: z.string().max(80).optional(),
        cedula: z.string().max(20).optional(),
        limit: z.coerce.number().int().min(1).max(500).optional(),
        offset: z.coerce.number().int().min(0).optional()
    });

    const fichaNovedadesIdSchema = z.object({
        id: z.string().uuid()
    });

    const fichaNovedadesRejectSchema = z.object({
        reason: z.string().max(2000).optional().nullable()
    });

    const fichaNovedadesApproveSchema = z.object({
        close_siblings: z.boolean().optional(),
        apply_fields: z.array(z.string().min(1).max(80)).min(1).max(80).optional()
    });

    const fichaNovedadesLinkSchema = z.object({
        cedula: z.string().min(5).max(20)
    });

    const fichaNovedadesEditSchema = z.object({
        edits: z
            .record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
            .refine((obj) => Object.keys(obj).length >= 1 && Object.keys(obj).length <= 30, {
                message: 'edits debe tener entre 1 y 30 campos'
            })
    });

    const fichaNovedadesIntakeSchema = z.object({
        source: z.enum(['n8n_webhook', 'dynamo_stream_zoho', 'manual']).optional(),
        payload: z.record(z.any())
    });

    const fichaNovedadesSyncSchema = z.object({
        dryRun: z.boolean().optional()
    });

    app.post('/api/onboarding/ficha-novedades/sync-dynamo', async (req, res) => {
        if (!checkIntakeAuth(req, res)) return;
        let body = {};
        try {
            body = fichaNovedadesSyncSchema.parse(req.body || {});
        } catch (e) {
            return res.status(400).json({ ok: false, error: 'Payload inválido', detail: e.errors || e.message });
        }
        try {
            const summary = await fichaNovedades.syncMissingFromDynamo({
                dryRun: Boolean(body.dryRun)
            });
            const status = summary.ok ? 200 : 500;
            return res.status(status).json(summary);
        } catch (e) {
            console.error('[Ficha novedades sync-dynamo]', e.message);
            return res.status(500).json({ ok: false, error: 'Error interno', message: e.message });
        }
    });

    app.post('/api/onboarding/ficha-novedades/intake', async (req, res) => {
        if (!checkIntakeAuth(req, res)) return;
        let body;
        try {
            body = fichaNovedadesIntakeSchema.parse(req.body || {});
        } catch (e) {
            return res.status(400).json({ ok: false, error: 'Payload inválido', detail: e.errors || e.message });
        }
        try {
            const result = await fichaNovedades.ingestFromHttp(body.payload, {
                source: body.source || 'n8n_webhook',
                eventType: 'INSERT'
            });
            if (!result.ok) {
                const status = result.error ? 422 : 400;
                return res.status(status).json(result);
            }
            return res.status(200).json(result);
        } catch (e) {
            console.error('[Ficha novedades intake]', e.message);
            return res.status(500).json({ ok: false, error: 'Error interno', message: e.message });
        }
    });

    app.get('/api/onboarding/ficha-novedades', ...readGuard, async (req, res) => {
        const parsed = fichaNovedadesQuerySchema.safeParse(req.query || {});
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: 'Query inválido', detail: parsed.error.errors });
        }
        try {
            const data = await fichaNovedades.listNovedades(parsed.data);
            return res.json({ ok: true, ...data });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.get('/api/onboarding/ficha-novedades/:id', ...readGuard, async (req, res) => {
        const parsed = fichaNovedadesIdSchema.safeParse(req.params);
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: 'Id inválido' });
        }
        try {
            const row = await fichaNovedades.getNovedadById(parsed.data.id);
            if (!row) return res.status(404).json({ ok: false, error: 'No encontrado' });
            return res.json({ ok: true, item: row });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    });

    app.patch('/api/onboarding/ficha-novedades/:id', ...writeGuard, async (req, res) => {
        const idParsed = fichaNovedadesIdSchema.safeParse(req.params);
        if (!idParsed.success) {
            return res.status(400).json({ ok: false, error: 'Id inválido' });
        }
        const bodyParsed = fichaNovedadesEditSchema.safeParse(req.body || {});
        if (!bodyParsed.success) {
            return res.status(400).json({ ok: false, error: 'Body inválido', detail: bodyParsed.error.errors });
        }
        try {
            const item = await fichaNovedades.updateNovedadPayload(
                idParsed.data.id,
                bodyParsed.data.edits,
                req.user || {}
            );
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user && req.user.sub),
                actorRole: req.user && req.user.role,
                action: 'ficha_novedad_editar',
                entityType: 'ficha_novedades_staging',
                entityId: idParsed.data.id,
                metadata: { fields: Object.keys(bodyParsed.data.edits) }
            });
            return res.json({ ok: true, item });
        } catch (e) {
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/onboarding/ficha-novedades/:id/aprobar', ...writeGuard, async (req, res) => {
        const parsed = fichaNovedadesIdSchema.safeParse(req.params);
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: 'Id inválido' });
        }
        const bodyParsed = fichaNovedadesApproveSchema.safeParse(req.body || {});
        if (!bodyParsed.success) {
            return res.status(400).json({ ok: false, error: 'Body inválido', detail: bodyParsed.error.errors });
        }
        try {
            const result = await fichaNovedades.approveNovedad(parsed.data.id, req.user || {}, {
                closeSiblings: bodyParsed.data.close_siblings === true,
                applyFields: bodyParsed.data.apply_fields
            });
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user && req.user.sub),
                actorRole: req.user && req.user.role,
                action: 'ficha_novedad_aprobar',
                entityType: 'ficha_novedades_staging',
                entityId: parsed.data.id,
                metadata: {
                    cedula: result.cedula,
                    close_siblings: bodyParsed.data.close_siblings === true,
                    siblings_closed: result.siblings_closed
                }
            });
            return res.json(result);
        } catch (e) {
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/onboarding/ficha-novedades/:id/rechazar', ...writeGuard, async (req, res) => {
        const idParsed = fichaNovedadesIdSchema.safeParse(req.params);
        if (!idParsed.success) {
            return res.status(400).json({ ok: false, error: 'Id inválido' });
        }
        const bodyParsed = fichaNovedadesRejectSchema.safeParse(req.body || {});
        if (!bodyParsed.success) {
            return res.status(400).json({ ok: false, error: 'Body inválido', detail: bodyParsed.error.errors });
        }
        try {
            const result = await fichaNovedades.rejectNovedad(
                idParsed.data.id,
                req.user || {},
                bodyParsed.data.reason
            );
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user && req.user.sub),
                actorRole: req.user && req.user.role,
                action: 'ficha_novedad_rechazar',
                entityType: 'ficha_novedades_staging',
                entityId: idParsed.data.id,
                metadata: { reason: bodyParsed.data.reason || null }
            });
            return res.json(result);
        } catch (e) {
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/onboarding/ficha-novedades/:id/vincular', ...writeGuard, async (req, res) => {
        const idParsed = fichaNovedadesIdSchema.safeParse(req.params);
        if (!idParsed.success) {
            return res.status(400).json({ ok: false, error: 'Id inválido' });
        }
        const bodyParsed = fichaNovedadesLinkSchema.safeParse(req.body || {});
        if (!bodyParsed.success) {
            return res.status(400).json({ ok: false, error: 'Body inválido', detail: bodyParsed.error.errors });
        }
        try {
            const result = await fichaNovedades.linkNovedad(
                idParsed.data.id,
                bodyParsed.data.cedula,
                req.user || {}
            );
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user && req.user.sub),
                actorRole: req.user && req.user.role,
                action: 'ficha_novedad_vincular',
                entityType: 'ficha_novedades_staging',
                entityId: idParsed.data.id,
                metadata: { cedula: result.cedula }
            });
            return res.json(result);
        } catch (e) {
            const status = e.status || 500;
            return res.status(status).json({ ok: false, error: e.message });
        }
    });

    /* =========================================================================
     * Health del módulo.
     * ========================================================================= */
    app.get('/api/onboarding/health', ...readGuard, async (_req, res) => {
        const intakeReady = Boolean((process.env.ONBOARDING_INGEST_KEY || '').trim());
        const autopromote = String(process.env.ONBOARDING_AUTOPROMOTE || '').toLowerCase() === 'true';
        const streamPoller = String(process.env.CONTRATACION_STREAM_POLLER_ENABLED || '').toLowerCase() === 'true';
        const dynamoSyncOnStart =
            String(process.env.FICHA_NOVEDADES_DYNAMO_SYNC_ON_START || '').toLowerCase() === 'true';
        const dynamoSyncIntervalMs = Number(process.env.FICHA_NOVEDADES_DYNAMO_SYNC_INTERVAL_MS || 0) || 0;
        const promoteIntervalMs = Number(process.env.ONBOARDING_DYNAMO_PROMOTE_INTERVAL_MS || 300000) || 0;
        return res.json({
            ok: true,
            intake_endpoint: intakeReady ? 'configured' : 'missing-key',
            autopromote_flag: autopromote,
            stream_poller: streamPoller,
            dynamo_promote_interval_ms: promoteIntervalMs,
            dynamo_sync_on_start: dynamoSyncOnStart,
            dynamo_sync_interval_ms: dynamoSyncIntervalMs,
            last_sync_summary: getLastZohoDynamoSyncSummary(),
            // Autopromote ya no exige poller: Lambda /intake + reconcile periódico del portal.
            ready: intakeReady
        });
    });

    // Marca de uso de normalizeCedula para evitar lint de no-unused
    if (typeof normalizeCedula === 'function') {
        // silencio: API queda para futuro endpoint que lo requiera
    }
}

module.exports = { registerOnboardingRoutes };
