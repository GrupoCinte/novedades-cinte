'use strict';

const { canRoleViewType } = require('./rbac');
const { validateMergedNovedadForAdmin, toYmd, toHms, nonNegNum } = require('./novedadPersistValidation');
const { toUtcMsFromDateAndTime } = require('./novedadHeTime');

const PATCH_CAMEL_TO_SNAKE = {
    nombre: 'nombre',
    cedula: 'cedula',
    correoSolicitante: 'correo_solicitante',
    cliente: 'cliente',
    lider: 'lider',
    gpUserId: 'gp_user_id',
    tipoNovedad: 'tipo_novedad',
    area: 'area',
    fecha: 'fecha',
    horaInicio: 'hora_inicio',
    horaFin: 'hora_fin',
    fechaInicio: 'fecha_inicio',
    fechaFin: 'fecha_fin',
    cantidadHoras: 'cantidad_horas',
    horasDiurnas: 'horas_diurnas',
    horasNocturnas: 'horas_nocturnas',
    horasRecargoDomingo: 'horas_recargo_domingo',
    horasRecargoDomingoDiurnas: 'horas_recargo_domingo_diurnas',
    horasRecargoDomingoNocturnas: 'horas_recargo_domingo_nocturnas',
    tipoHoraExtra: 'tipo_hora_extra',
    montoCop: 'monto_cop',
    estado: 'estado',
    heDomingoObservacion: 'he_domingo_observacion',
    soporteRuta: 'soporte_ruta',
    unidad: 'unidad'
};

async function writeNovedadAudit(pool, { actorUserId, actorRole, action, entityId, metadata }) {
    try {
        await pool.query(
            `INSERT INTO audit_log (actor_user_id, actor_role, action, entity_type, entity_id, metadata)
             VALUES ($1::uuid, $2::user_role, $3, $4, $5::uuid, $6::jsonb)`,
            [actorUserId, actorRole || null, action, 'novedad', entityId, JSON.stringify(metadata || {})]
        );
    } catch (e) {
        console.warn('[novedad-admin] audit_log omitido:', e.message);
    }
}

async function findNovedadRowByParam(pool, idParam) {
    const raw = String(idParam || '').trim();
    if (!raw) return null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) {
        const q = await pool.query('SELECT * FROM novedades WHERE id = $1::uuid LIMIT 1', [raw]);
        return q.rows[0] || null;
    }
    const q2 = await pool.query('SELECT * FROM novedades WHERE creado_en = $1::timestamptz LIMIT 1', [raw]);
    return q2.rows[0] || null;
}

function assertRowAccessibleByScope(req, row) {
    if (!row) return;
    if (!req.scope?.canViewAllAreas) {
        const areas = Array.isArray(req.scope?.areas) ? req.scope.areas : [];
        const a = row.area != null ? String(row.area) : '';
        if (a && !areas.includes(a)) {
            const e = new Error('No autorizado sobre esta área');
            e.statusCode = 403;
            throw e;
        }
    }
    if (!canRoleViewType(req.user?.role || '', row.tipo_novedad)) {
        const e = new Error('No autorizado para este tipo de novedad');
        e.statusCode = 403;
        throw e;
    }
}

async function resolveActorUserId(pool, req) {
    const actorSub = String(req.user?.sub || '').trim();
    const actorUserIdRaw = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorSub) ? actorSub : null;
    let actorUserId = null;
    if (actorUserIdRaw || req.user?.email) {
        try {
            const uq = await pool.query('SELECT id FROM users WHERE id = $1 OR email = $2 LIMIT 1', [
                actorUserIdRaw,
                req.user?.email || ''
            ]);
            actorUserId = uq.rows[0]?.id || null;
        } catch {
            actorUserId = null;
        }
    }
    return actorUserId;
}

function snapshotRowForAudit(row) {
    return {
        nombre: row.nombre,
        cedula: row.cedula,
        tipo_novedad: row.tipo_novedad,
        estado: row.estado,
        cliente: row.cliente,
        lider: row.lider,
        area: row.area,
        fecha_inicio: row.fecha_inicio,
        fecha_fin: row.fecha_fin
    };
}

function parseGpUserIdPatch(raw) {
    if (raw === null || raw === '') return { value: null };
    const s = String(raw).trim();
    if (!s) return { value: null };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) {
        return { error: 'gpUserId debe ser un UUID válido o vacío.' };
    }
    return { value: s };
}

function mergeAdminPatch(existingRow, body, normalizeEstado, parseDateOrNull, parseTimeOrNull) {
    const merged = { ...existingRow };
    const patch = body && typeof body === 'object' ? body : {};
    const appliedKeys = [];

    for (const [camel, snake] of Object.entries(PATCH_CAMEL_TO_SNAKE)) {
        if (!Object.prototype.hasOwnProperty.call(patch, camel)) continue;
        appliedKeys.push(camel);
        const v = patch[camel];
        if (snake === 'gp_user_id') {
            const r = parseGpUserIdPatch(v);
            if (r.error) return { error: r.error, merged: null, appliedKeys: [] };
            merged[snake] = r.value;
            continue;
        }
        if (snake === 'estado') {
            merged[snake] = normalizeEstado(v);
            continue;
        }
        if (snake === 'fecha' || snake === 'fecha_inicio' || snake === 'fecha_fin') {
            const d = parseDateOrNull(v);
            merged[snake] = d || null;
            continue;
        }
        if (snake === 'hora_inicio' || snake === 'hora_fin') {
            const t = parseTimeOrNull(v);
            merged[snake] = t || null;
            continue;
        }
        if (
            snake === 'cantidad_horas' ||
            snake === 'horas_diurnas' ||
            snake === 'horas_nocturnas' ||
            snake === 'horas_recargo_domingo' ||
            snake === 'horas_recargo_domingo_diurnas' ||
            snake === 'horas_recargo_domingo_nocturnas'
        ) {
            const n = nonNegNum(v, 0);
            if (n === null) return { error: 'Las horas deben ser números mayores o iguales a cero.', merged: null, appliedKeys: [] };
            merged[snake] = n;
            continue;
        }
        if (snake === 'monto_cop') {
            if (v === null || v === '' || v === undefined) {
                merged[snake] = null;
            } else {
                const n = Number(v);
                merged[snake] = Number.isFinite(n) ? Number(n.toFixed(2)) : null;
            }
            continue;
        }
        if (snake === 'correo_solicitante' || snake === 'tipo_hora_extra' || snake === 'he_domingo_observacion' || snake === 'soporte_ruta') {
            merged[snake] = v == null || v === '' ? null : String(v);
            continue;
        }
        merged[snake] = v == null ? '' : String(v).trim();
    }

    return { merged, appliedKeys, error: null };
}

/**
 * @returns {Promise<{ status: number, body: object }>}
 */
function isElevatedNovedadAdmin(role) {
    return role === 'super_admin' || role === 'cac';
}

async function adminDeleteNovedad({ pool, req, idParam }) {
    if (!isElevatedNovedadAdmin(req.user?.role)) {
        return { status: 403, body: { ok: false, error: 'Solo super administrador puede eliminar novedades.' } };
    }
    const motivo = String(req.body?.motivo ?? '').trim();
    if (!motivo) {
        return { status: 400, body: { ok: false, error: 'El motivo de eliminación es obligatorio.' } };
    }

    const row = await findNovedadRowByParam(pool, idParam);
    if (!row) return { status: 404, body: { ok: false, error: 'Registro no encontrado' } };
    try {
        assertRowAccessibleByScope(req, row);
    } catch (e) {
        return { status: e.statusCode || 403, body: { ok: false, error: e.message } };
    }

    const actorUserId = await resolveActorUserId(pool, req);
    await writeNovedadAudit(pool, {
        actorUserId,
        actorRole: req.user?.role || null,
        action: 'novedad_delete',
        entityId: row.id,
        metadata: { motivo, snapshot: snapshotRowForAudit(row) }
    });

    await pool.query('DELETE FROM novedades WHERE id = $1::uuid', [row.id]);
    return { status: 200, body: { ok: true, success: true } };
}

function appendSetForColumn(setParts, vals, col, val) {
    let i = vals.length + 1;
    if (col === 'fecha' || col === 'fecha_inicio' || col === 'fecha_fin') {
        const y = toYmd(val);
        setParts.push(`${col} = $${i}::date`);
        vals.push(y);
        return;
    }
    if (col === 'hora_inicio' || col === 'hora_fin') {
        const t = toHms(val);
        setParts.push(`${col} = $${i}::time`);
        vals.push(t);
        return;
    }
    if (
        col === 'cantidad_horas' ||
        col === 'horas_diurnas' ||
        col === 'horas_nocturnas' ||
        col === 'horas_recargo_domingo' ||
        col === 'horas_recargo_domingo_diurnas' ||
        col === 'horas_recargo_domingo_nocturnas'
    ) {
        setParts.push(`${col} = $${i}::numeric`);
        vals.push(nonNegNum(val, 0) ?? 0);
        return;
    }
    if (col === 'monto_cop') {
        setParts.push(`${col} = $${i}::numeric`);
        vals.push(val == null ? null : Number(val));
        return;
    }
    if (col === 'gp_user_id') {
        setParts.push(`${col} = $${i}::uuid`);
        vals.push(val);
        return;
    }
    if (col === 'area') {
        setParts.push(`${col} = $${i}::user_area`);
        vals.push(String(val));
        return;
    }
    if (col === 'estado') {
        setParts.push(`${col} = $${i}::novedad_estado`);
        vals.push(String(val));
        return;
    }
    if (col === 'unidad') {
        setParts.push(`${col} = $${i}`);
        vals.push(String(val || 'dias'));
        return;
    }
    setParts.push(`${col} = $${i}`);
    vals.push(val);
}

/**
 * @returns {Promise<{ status: number, body: object }>}
 */
async function adminPatchNovedad({ pool, req, idParam, normalizeEstado, parseDateOrNull, parseTimeOrNull }) {
    if (!isElevatedNovedadAdmin(req.user?.role)) {
        return { status: 403, body: { ok: false, error: 'Solo super administrador puede editar novedades.' } };
    }

    const row = await findNovedadRowByParam(pool, idParam);
    if (!row) return { status: 404, body: { ok: false, error: 'Registro no encontrado' } };
    try {
        assertRowAccessibleByScope(req, row);
    } catch (e) {
        return { status: e.statusCode || 403, body: { ok: false, error: e.message } };
    }

    const { merged, appliedKeys, error: mergeErr } = mergeAdminPatch(row, req.body, normalizeEstado, parseDateOrNull, parseTimeOrNull);
    if (mergeErr) return { status: 400, body: { ok: false, error: mergeErr } };
    if (!appliedKeys.length) {
        return { status: 400, body: { ok: false, error: 'No se enviaron campos para actualizar.' } };
    }

    const v = validateMergedNovedadForAdmin(merged, { toUtcMsFromDateAndTime });
    if (!v.ok) return { status: 400, body: { ok: false, error: v.error } };

    const actorUserId = await resolveActorUserId(pool, req);
    await writeNovedadAudit(pool, {
        actorUserId,
        actorRole: req.user?.role || null,
        action: 'novedad_admin_patch',
        entityId: row.id,
        metadata: { keys: appliedKeys, patch: req.body }
    });

    const snakeKeys = appliedKeys.map((camel) => PATCH_CAMEL_TO_SNAKE[camel]).filter(Boolean);
    const setParts = [];
    const vals = [];
    for (const col of snakeKeys) {
        appendSetForColumn(setParts, vals, col, merged[col]);
    }

    if (String(merged.estado) === 'Pendiente') {
        setParts.push(
            'aprobado_por_user_id = NULL',
            'aprobado_por_rol = NULL',
            'aprobado_por_email = NULL',
            'aprobado_en = NULL',
            'rechazado_por_user_id = NULL',
            'rechazado_por_rol = NULL',
            'rechazado_por_email = NULL',
            'rechazado_en = NULL'
        );
    }

    const i = vals.length + 1;
    const sql = `UPDATE novedades SET ${setParts.join(', ')} WHERE id = $${i}::uuid`;
    vals.push(row.id);
    await pool.query(sql, vals);

    return { status: 200, body: { ok: true, success: true } };
}

module.exports = {
    adminDeleteNovedad,
    adminPatchNovedad,
    findNovedadRowByParam,
    PATCH_CAMEL_TO_SNAKE
};
