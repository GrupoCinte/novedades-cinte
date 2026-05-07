const { z } = require('zod');
const crypto = require('node:crypto');
const { buildColaboradorExtendedZodShape } = require('../colaboradores/colaboradoresExtendedZod');
const { normalizeCatalogValue } = require('../utils');
const { foldForMatch } = require('../cotizador/clienteNombreMatch');
const { normalizeRoleOrNull } = require('../rbac');
const { semaforoFromDiasRestantes } = require('../reubicaciones/reubicacionesSemaforo');

function directorioGuard() {
    return (req, res, next) => {
        const role = normalizeRoleOrNull(req.user?.role);
        if (role !== 'super_admin' && role !== 'cac') {
            return res.status(403).json({ ok: false, error: 'Sin permiso para el directorio maestro.' });
        }
        return next();
    };
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
        normalizeCedula
    } = deps;

    /** Lecturas: sin adminActionLimiter (200/hora incluía cada GET y bloqueaba uso normal del directorio). */
    const readGuard = [verificarToken, allowPanel('directorio'), directorioGuard()];
    /** Escrituras: mismo límite que cotizador/guardar (costosas / abuso). */
    const writeGuard = [verificarToken, allowPanel('directorio'), adminActionLimiter, directorioGuard()];

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
        /** Filtro exacto por tipo de contrato; «Sin clasificar» = vacío en BD. */
        tipo_contrato: z.string().max(200).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
        offset: z.coerce.number().int().min(0).optional(),
        sort: z.enum(['nombre', 'cedula', 'codigo', 'correo', 'cliente', 'lider', 'activo']).optional(),
        dir: z.enum(['asc', 'desc']).optional()
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
        semaforo: z.preprocess((val) => {
            if (val == null || val === '') return undefined;
            const arr = Array.isArray(val) ? val : String(val).split(',');
            const cleaned = arr.map((s) => String(s).trim()).filter(Boolean);
            return cleaned.length ? cleaned : undefined;
        }, z.array(z.enum(['Verde', 'Amarillo', 'Rojo', 'Vencido'])).optional()),
        sort: z
            .enum([
                'cedula',
                'consultor',
                'tipo_contrato',
                'cliente_actual',
                'cliente_destino',
                'causal',
                'fecha_fin',
                'dias_restantes',
                'semaforo',
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
        const dias =
            row.dias_restantes === null || row.dias_restantes === undefined
                ? null
                : Number(row.dias_restantes);
        let fechaFin = row.fecha_fin;
        if (fechaFin instanceof Date) fechaFin = fechaFin.toISOString().slice(0, 10);
        else if (typeof fechaFin === 'string') fechaFin = fechaFin.slice(0, 10);
        return {
            id: row.id,
            cedula: row.cedula,
            fecha_fin: fechaFin,
            cliente_destino: row.cliente_destino,
            causal: row.causal,
            consultor: row.consultor,
            tipo_contrato: row.tipo_contrato,
            cliente_actual: row.cliente_actual,
            tarifa_cliente: row.tarifa_cliente != null ? Number(row.tarifa_cliente) : null,
            montos_divisa: row.montos_divisa ?? null,
            dias_restantes: dias,
            semaforo: semaforoFromDiasRestantes(dias),
            created_at: row.created_at,
            updated_at: row.updated_at
        };
    }

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

    app.get('/api/directorio/colaboradores', ...readGuard, async (req, res) => {
        try {
            const q = colabListSchema.safeParse(req.query);
            if (!q.success) return res.status(400).json({ ok: false, error: 'Parámetros inválidos' });
            const { activo, limit, offset, q: search, sort, dir, tipo_contrato: tipoContrato } = q.data;
            let activoBool = null;
            if (activo === 'true') activoBool = true;
            if (activo === 'false') activoBool = false;
            const { rows, total } = await listColaboradoresPaged({
                activo: activoBool,
                q: search,
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

    app.get('/api/directorio/reubicaciones-pipeline', ...readGuard, async (req, res) => {
        try {
            const parsed = reubicacionesPipelineListSchema.safeParse(req.query);
            if (!parsed.success) return res.status(400).json({ ok: false, error: 'Parámetros inválidos' });
            const d = parsed.data;
            const limit = d.limit ?? 50;
            const offset = d.offset ?? 0;

            const diasSql = `(rp.fecha_fin::date - (timezone('America/Bogota', now()))::date)`;
            const semaforoSql = `(CASE WHEN ${diasSql} < 0 THEN 'Vencido' WHEN ${diasSql} > 30 THEN 'Verde' WHEN ${diasSql} >= 15 THEN 'Amarillo' ELSE 'Rojo' END)`;

            const selectFields = `
                SELECT
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
                    ${diasSql} AS dias_restantes
                FROM reubicaciones_pipeline rp
                INNER JOIN colaboradores c ON c.cedula = rp.cedula`;

            const whereParts = [];
            const whereParams = [];

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

            const fd = textOrNull(d.fecha_fin_desde);
            const fh = textOrNull(d.fecha_fin_hasta);
            if (fd) {
                whereParts.push(`rp.fecha_fin >= $${whereParams.length + 1}::date`);
                whereParams.push(fd);
            }
            if (fh) {
                whereParts.push(`rp.fecha_fin <= $${whereParams.length + 1}::date`);
                whereParams.push(fh);
            }
            if (d.semaforo && d.semaforo.length > 0) {
                whereParts.push(`${semaforoSql} = ANY($${whereParams.length + 1}::text[])`);
                whereParams.push(d.semaforo);
            }

            const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

            const dir = d.dir === 'desc' ? 'DESC' : 'ASC';
            const sortKey = d.sort;
            const orderMap = {
                cedula: `c.cedula ${dir}`,
                consultor: `c.nombre ${dir} NULLS LAST`,
                tipo_contrato: `c.tipo_contrato ${dir} NULLS LAST`,
                cliente_actual: `c.cliente ${dir} NULLS LAST`,
                cliente_destino: `rp.cliente_destino ${dir} NULLS LAST`,
                causal: `rp.causal ${dir} NULLS LAST`,
                fecha_fin: `rp.fecha_fin ${dir} NULLS LAST`,
                dias_restantes: `${diasSql} ${dir} NULLS LAST`,
                semaforo: `${diasSql} ${dir} NULLS LAST`,
                tarifa: `c.tarifa_cliente ${dir} NULLS LAST`
            };
            const orderSql =
                sortKey && orderMap[sortKey]
                    ? `ORDER BY ${orderMap[sortKey]}`
                    : 'ORDER BY rp.fecha_fin ASC NULLS LAST, c.nombre ASC';

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

            return res.json({
                ok: true,
                items: rows.map(normalizePipelineRow),
                total,
                limit,
                offset
            });
        } catch (e) {
            console.error('GET directorio reubicaciones-pipeline:', e);
            return res.status(500).json({ ok: false, error: 'No se pudo listar reubicaciones.' });
        }
    });

    app.post('/api/directorio/reubicaciones-pipeline', ...writeGuard, async (req, res) => {
        try {
            const parsed = reubicacionesPipelineCreateSchema.safeParse(req.body || {});
            if (!parsed.success) return res.status(400).json({ ok: false, error: 'Datos inválidos' });
            const cedula = normalizeCedula(parsed.data.cedula);
            if (!cedula) return res.status(400).json({ ok: false, error: 'Cédula inválida' });
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
                throw e;
            }
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
                [row.id]
            );
            const item = normalizePipelineRow(joined.rows[0]);
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

    app.patch('/api/directorio/reubicaciones-pipeline/:id', ...writeGuard, async (req, res) => {
        try {
            const id = String(req.params.id || '').trim();
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
                return res.status(400).json({ ok: false, error: 'Id inválido' });
            }
            const parsed = reubicacionesPipelinePatchSchema.safeParse(req.body || {});
            if (!parsed.success) return res.status(400).json({ ok: false, error: 'Datos inválidos' });
            const d = parsed.data;
            const sets = [];
            const vals = [];
            let n = 1;
            if (d.fecha_fin !== undefined) {
                sets.push(`fecha_fin = $${n}::date`);
                vals.push(d.fecha_fin);
                n += 1;
            }
            if (d.cliente_destino !== undefined) {
                sets.push(`cliente_destino = $${n}`);
                vals.push(textOrNull(d.cliente_destino));
                n += 1;
            }
            if (d.causal !== undefined) {
                sets.push(`causal = $${n}`);
                vals.push(textOrNull(d.causal));
                n += 1;
            }
            if (sets.length === 0) return res.status(400).json({ ok: false, error: 'Sin cambios' });
            sets.push('updated_at = NOW()');
            vals.push(id);
            const upd = await pool.query(
                `UPDATE reubicaciones_pipeline SET ${sets.join(', ')} WHERE id = $${n}::uuid RETURNING id`,
                vals
            );
            if (!upd.rows.length) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
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
            console.error('PATCH directorio reubicaciones-pipeline:', e);
            return res.status(500).json({ ok: false, error: e.message || 'No se pudo actualizar.' });
        }
    });

    app.delete('/api/directorio/reubicaciones-pipeline/:id', ...writeGuard, async (req, res) => {
        try {
            const id = String(req.params.id || '').trim();
            if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
                return res.status(400).json({ ok: false, error: 'Id inválido' });
            }
            const del = await pool.query(`DELETE FROM reubicaciones_pipeline WHERE id = $1::uuid RETURNING id`, [id]);
            if (!del.rows.length) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user?.sub),
                actorRole: normalizeRoleOrNull(req.user?.role),
                action: 'reubicaciones_pipeline.delete',
                entityType: 'reubicaciones_pipeline',
                entityId: id,
                metadata: {}
            });
            return res.json({ ok: true, deleted: id });
        } catch (e) {
            console.error('DELETE directorio reubicaciones-pipeline:', e);
            return res.status(500).json({ ok: false, error: e.message || 'No se pudo eliminar.' });
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
