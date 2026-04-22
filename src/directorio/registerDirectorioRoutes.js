const { z } = require('zod');
const crypto = require('node:crypto');
const { normalizeCatalogValue } = require('../utils');
const { foldForMatch } = require('../cotizador/clienteNombreMatch');
const { normalizeRoleOrNull } = require('../rbac');

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
        listGpUsersForDirectorio,
        insertGpUserPlaceholder,
        updateGpUserById,
        resolveOrCreateGpUserIdForColaboradorCedula,
        clearGpUserReferences,
        linkGpCognitoSubByEmail,
        normalizeCedula
    } = deps;

    const guard = [verificarToken, allowPanel('directorio'), adminActionLimiter, directorioGuard()];

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
        });

    const clienteLiderPatchSchema = z
        .object({
            activo: z.boolean().optional(),
            cliente: z.string().min(1).max(500).optional(),
            lider: z.string().min(1).max(500).optional(),
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
        limit: z.coerce.number().int().min(1).max(200).optional(),
        offset: z.coerce.number().int().min(0).optional(),
        sort: z.enum(['nombre', 'cedula', 'correo', 'cliente', 'lider', 'activo']).optional(),
        dir: z.enum(['asc', 'desc']).optional()
    });

    const colabCreateSchema = z.object({
        cedula: z.string().min(5).max(20),
        nombre: z.string().min(2).max(400),
        correo_cinte: z.string().email().max(320).optional().nullable(),
        cliente: z.string().max(500).optional().nullable(),
        lider_catalogo: z.string().max(500).optional().nullable(),
        gp_user_id: z.string().uuid().optional().nullable(),
        activo: z.boolean().optional()
    });

    const colabPatchSchema = z.object({
        nombre: z.string().min(2).max(400).optional(),
        correo_cinte: z.string().email().max(320).optional().nullable(),
        cliente: z.string().max(500).optional().nullable(),
        lider_catalogo: z.string().max(500).optional().nullable(),
        gp_user_id: z.string().uuid().optional().nullable(),
        activo: z.boolean().optional()
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

    app.get('/api/directorio/clientes-resumen', ...guard, async (req, res) => {
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

    app.get('/api/directorio/clientes-lideres', ...guard, async (req, res) => {
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

    app.post('/api/directorio/clientes-lideres', ...guard, async (req, res) => {
        try {
            const parsed = clienteLiderCreateSchema.safeParse(req.body || {});
            if (!parsed.success) return res.status(400).json({ ok: false, error: 'Datos inválidos' });
            const { gpUserId, gpResolution } = await resolveGpForClienteLiderPayload(parsed.data);
            const row = await insertClienteLider(parsed.data.cliente, parsed.data.lider, gpUserId);
            await writeAudit(pool, {
                actorUserId: parseUuidActor(req.user?.sub),
                actorRole: normalizeRoleOrNull(req.user?.role),
                action: 'clientes_lideres.create',
                entityType: 'clientes_lideres',
                entityId: row.id,
                metadata: {
                    cliente: row.cliente,
                    lider: row.lider,
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

    app.patch('/api/directorio/clientes-lideres/:id', ...guard, async (req, res) => {
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

    app.get('/api/directorio/colaboradores', ...guard, async (req, res) => {
        try {
            const q = colabListSchema.safeParse(req.query);
            if (!q.success) return res.status(400).json({ ok: false, error: 'Parámetros inválidos' });
            const { activo, limit, offset, q: search, sort, dir } = q.data;
            let activoBool = null;
            if (activo === 'true') activoBool = true;
            if (activo === 'false') activoBool = false;
            const { rows, total } = await listColaboradoresPaged({
                activo: activoBool,
                q: search,
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

    app.post('/api/directorio/colaboradores', ...guard, async (req, res) => {
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

    app.patch('/api/directorio/colaboradores/:cedula', ...guard, async (req, res) => {
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

    app.get('/api/directorio/gp', ...guard, async (req, res) => {
        try {
            const rows = await listGpUsersForDirectorio();
            return res.json({ ok: true, items: rows });
        } catch (e) {
            console.error('GET directorio gp:', e);
            return res.status(500).json({ ok: false, error: 'No se pudo listar usuarios GP.' });
        }
    });

    app.post('/api/directorio/gp', ...guard, async (req, res) => {
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

    app.patch('/api/directorio/gp/:id', ...guard, async (req, res) => {
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
