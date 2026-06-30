/**
 * Buzón de novedades Zoho: ingest HTTP/Dynamo, match activos en PG, diff y apply con revisión CH.
 */

const { flattenExtractorOutput } = require('../contratacion/extractorToFichaMap');
const { COLABORADORES_EXTENDED_KEYS } = require('../colaboradores/colaboradoresExtendedColumns');
const { normalizeChListText } = require('./chTextNormalize');

const ZOHO_RECORD_TYPE = 'zoho_novedad';
const DIFF_PREVIEW_LIMIT = 10;

const MVP_TIPOS = new Set(['integracion', 'modificacion_id']);

/** Tipos que no van al buzón Novedades Zoho (se gestionan en En ingreso u otro flujo). */
const BUZON_EXCLUDED_TIPOS = new Set(['integracion']);

const VALID_SOURCES = new Set(['dynamo_stream_zoho', 'n8n_webhook', 'manual']);

/** Campos permitidos por tipo al aplicar. `null` = todos los del payload normalizado. */
const WHITELIST_BY_TIPO = {
    integracion: null,
    modificacion_id: null,
    salida: ['fecha_termino', 'fecha_notificacion_termino', 'termino'],
    extension: ['fecha_termino', 'duracion_servicio', 'venta_total', 'costo_empresa'],
    cancelacion_ingreso: ['onboarding_status', 'fecha_ingreso', 'codigo'],
    cancelacion_salida: ['fecha_termino', 'fecha_notificacion_termino', 'termino', 'activo']
};

const CORE_PATCH_KEYS = new Set(['nombre', 'cliente', 'puesto', 'activo', 'correo_cinte', 'lider_catalogo', 'gp_user_id']);

function normalizeCedula(value) {
    if (value == null) return '';
    return String(value).replace(/\D+/g, '');
}

function trimOrNull(value, maxLen = 2000) {
    if (value == null) return null;
    const s = String(value).trim();
    if (!s || s === 'nada') return null;
    return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function readD(flatField) {
    return trimOrNull(flatField);
}

function parseJsonField(value) {
    if (value == null) return null;
    if (typeof value === 'object') return value;
    const s = String(value).trim();
    if (!s) return null;
    try {
        return JSON.parse(s);
    } catch {
        return null;
    }
}

function isZohoNovedadItem(rawItem) {
    if (!rawItem || typeof rawItem !== 'object') return false;
    const rt = String(rawItem.record_type || rawItem.recordType || '').trim().toLowerCase();
    if (rt === ZOHO_RECORD_TYPE) return true;
    const pk = String(rawItem.pk || rawItem.PK || rawItem.whatsapp_number || '').trim().toLowerCase();
    return pk.startsWith('zoho_novedad#');
}

function isTipoEligibleForBuzon(tipoNovedad) {
    const t = String(tipoNovedad || '').trim().toLowerCase();
    return Boolean(t) && !BUZON_EXCLUDED_TIPOS.has(t);
}

function buzonTipoExclusionSql(alias = '') {
    const col = alias ? `${alias}.tipo_novedad` : 'tipo_novedad';
    return `${col} <> 'integracion'`;
}

function getAllowedFieldsForTipo(tipoNovedad) {
    const t = String(tipoNovedad || '').trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(WHITELIST_BY_TIPO, t)) {
        return WHITELIST_BY_TIPO[t];
    }
    return null;
}

function normalizeComparable(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return value;
    const s = String(value).trim();
    return s || null;
}

/**
 * @param {Record<string, unknown>} currentRow
 * @param {Record<string, unknown>} proposed
 * @returns {Array<{ field: string, before: unknown, after: unknown }>}
 */
function buildDiff(currentRow, proposed) {
    const diff = [];
    const keys = new Set([
        ...Object.keys(proposed || {}),
        ...COLABORADORES_EXTENDED_KEYS,
        ...CORE_PATCH_KEYS
    ]);
    for (const field of keys) {
        if (field.startsWith('_')) continue;
        const after = proposed && proposed[field] !== undefined ? proposed[field] : undefined;
        if (after === undefined) continue;
        const before = currentRow ? currentRow[field] : null;
        const bNorm = normalizeComparable(before);
        const aNorm = normalizeComparable(after);
        if (bNorm === aNorm) continue;
        if (bNorm == null && aNorm == null) continue;
        diff.push({ field, before: bNorm, after: aNorm });
    }
    return diff;
}

function buildPatchFromNormalized(tipoNovedad, normalized) {
    const whitelist = getAllowedFieldsForTipo(tipoNovedad);
    const patch = {};
    for (const [key, val] of Object.entries(normalized || {})) {
        if (key.startsWith('_')) continue;
        if (val === undefined || val === null || val === '') continue;
        if (whitelist && !whitelist.includes(key)) continue;
        patch[key] = val;
    }
    return patch;
}

function normalizeEditValue(field, value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean' || typeof value === 'number') return value;
    const s = String(value).trim();
    if (!s || s === 'nada') return null;
    if (field === 'activo') {
        if (s === 'true' || s === '1') return true;
        if (s === 'false' || s === '0') return false;
    }
    const numericFields = new Set(['venta_total', 'costo_empresa', 'duracion_servicio', 'sueldo_nomina']);
    if (numericFields.has(field)) {
        const n = Number(s);
        if (!Number.isNaN(n)) return n;
    }
    return s.length > 2000 ? s.slice(0, 2000) : s;
}

function isFieldEditableForTipo(tipoNovedad, field) {
    const whitelist = getAllowedFieldsForTipo(tipoNovedad);
    if (whitelist === null) return true;
    return whitelist.includes(field);
}

function mapDynamoZohoPayload(rawItem) {
    const r = rawItem || {};
    const extractorRaw = r.extractor_output ?? r.extractorOutput ?? r.payload_extractor;
    const extractorObj = parseJsonField(extractorRaw) || (typeof extractorRaw === 'object' ? extractorRaw : null);
    const parsedSubject = parseJsonField(r.parsed_subject ?? r.parsedSubject) || {};

    const codigoPlano = readD(r.codigo);
    const cedulaPlano = readD(r.cedula);
    const nombrePlano = readD(r['nombre y apellido'] ?? r.nombre_y_apellido);
    const clientePlano = readD(r.cliente);

    return {
        record_type: ZOHO_RECORD_TYPE,
        external_id: trimOrNull(r.external_id || r.externalId || r.internetMessageId || r.pk),
        tipo_novedad: trimOrNull(r.tipo_novedad || r.tipoNovedadZoho || r.tipo),
        id_registro: trimOrNull(
            r.id_registro || codigoPlano || r.idRegistroZoho || parsedSubject.id_registro
        ),
        subject: trimOrNull(r.subject || r.asunto),
        received_at: r.received_at || r.receivedAt || r.fecha_recepcion || null,
        extractor_output: extractorObj,
        parsed_subject: parsedSubject,
        n8n_execution_id: trimOrNull(r.n8n_execution_id || r.n8nExecutionId),
        nombre_asunto: trimOrNull(r.nombreAsunto || parsedSubject.nombre || nombrePlano),
        cliente_asunto: trimOrNull(r.clienteAsunto || parsedSubject.cliente || clientePlano),
        cedula_plano: cedulaPlano,
        nombre_plano: nombrePlano,
        cliente_plano: clientePlano,
        codigo_plano: codigoPlano
    };
}

function normalizeExtractorPayload(extractorOutput) {
    if (!extractorOutput || typeof extractorOutput !== 'object') return {};
    const flat = flattenExtractorOutput(extractorOutput);
    const out = {};
    for (const [k, v] of Object.entries(flat)) {
        if (v === undefined || v === null || v === '') continue;
        if (['nombre', 'cliente', 'puesto', 'nombres', 'primer_apellido', 'segundo_apellido'].includes(k)) {
            out[k] = normalizeChListText(v);
        } else {
            out[k] = v;
        }
    }
    return out;
}

function buildMatchSnapshot(row) {
    if (!row) return null;
    return {
        cedula: row.cedula,
        nombre: row.nombre,
        codigo: row.codigo,
        cliente: row.cliente
    };
}

function buildIngestEnrichment(matchRow, matchStrategy, diffJson) {
    return {
        match: buildMatchSnapshot(matchRow),
        match_strategy: matchStrategy,
        diff_count: diffJson.length,
        diff_preview: diffJson.slice(0, DIFF_PREVIEW_LIMIT)
    };
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ codigo?: string, cedula?: string, nombre?: string, cliente?: string, tipo_novedad?: string }} hints
 * @param {{ allowInactive?: boolean }} [options]
 * @returns {Promise<{ row: object|null, strategy: string|null }>}
 */
async function matchColaborador(pool, hints = {}, options = {}) {
    const codigo = trimOrNull(hints.codigo);
    const cedula = normalizeCedula(hints.cedula);
    const nombre = hints.nombre ? normalizeChListText(hints.nombre) : null;
    const cliente = hints.cliente ? normalizeChListText(hints.cliente) : null;
    const tipo = String(hints.tipo_novedad || '').trim().toLowerCase();
    const allowInactive =
        options.allowInactive === true || tipo === 'cancelacion_ingreso';
    const activoClause = allowInactive ? '' : ' AND activo = true';

    if (codigo) {
        const q = await pool.query(
            `SELECT cedula, nombre, cliente, codigo
             FROM colaboradores
             WHERE TRIM(codigo) = $1${activoClause}
             ORDER BY activo DESC, updated_at DESC NULLS LAST
             LIMIT 1`,
            [codigo]
        );
        if (q.rows[0]) return { row: q.rows[0], strategy: 'codigo' };
    }

    if (cedula) {
        const q = await pool.query(
            `SELECT cedula, nombre, cliente, codigo
             FROM colaboradores
             WHERE cedula = $1${activoClause}
             LIMIT 1`,
            [cedula]
        );
        if (q.rows[0]) return { row: q.rows[0], strategy: 'cedula' };
    }

    if (nombre && cliente) {
        const q = await pool.query(
            `SELECT cedula, nombre, cliente, codigo
             FROM colaboradores
             WHERE LOWER(TRIM(nombre)) = LOWER($1)
               AND LOWER(TRIM(cliente)) = LOWER($2)${activoClause}
             ORDER BY activo DESC, updated_at DESC NULLS LAST
             LIMIT 1`,
            [nombre, cliente]
        );
        if (q.rows[0]) return { row: q.rows[0], strategy: 'nombre_cliente' };
    }

    if (nombre) {
        const q = await pool.query(
            `SELECT cedula, nombre, cliente, codigo
             FROM colaboradores
             WHERE LOWER(TRIM(nombre)) = LOWER($1)${activoClause}
             ORDER BY activo DESC, updated_at DESC NULLS LAST
             LIMIT 1`,
            [nombre]
        );
        if (q.rows[0]) return { row: q.rows[0], strategy: 'nombre' };
    }

    return { row: null, strategy: null };
}

async function loadColaboradorFull(pool, cedula) {
    const ced = normalizeCedula(cedula);
    if (!ced) return null;
    const q = await pool.query(`SELECT * FROM colaboradores WHERE cedula = $1 LIMIT 1`, [ced]);
    return q.rows[0] || null;
}

/** Último resumen de sync Dynamo → Postgres (compartido entre instancias del servicio). */
let lastZohoDynamoSyncSummary = null;

function getLastZohoDynamoSyncSummary() {
    return lastZohoDynamoSyncSummary;
}

function createFichaNovedadesService({ pool, logger, updateColaboradorByCedula } = {}) {
    if (!pool || typeof pool.query !== 'function') {
        throw new Error('createFichaNovedadesService requiere pool válido.');
    }

    const log = logger && typeof logger.error === 'function' ? logger : console;

    /**
     * Núcleo compartido HTTP + Dynamo stream.
     * @param {Record<string, unknown>} rawItem
     * @param {{ source?: string, eventType?: string, sequenceNumber?: string, shardId?: string }} meta
     */
    async function ingestZohoPayload(rawItem, meta = {}) {
        const source = VALID_SOURCES.has(meta.source) ? meta.source : 'dynamo_stream_zoho';
        const mapped = mapDynamoZohoPayload(rawItem);

        if (!mapped.external_id) {
            return { ok: false, error: 'external_id requerido' };
        }
        if (!mapped.tipo_novedad) {
            return { ok: false, error: 'tipo_novedad requerido' };
        }
        if (!isTipoEligibleForBuzon(mapped.tipo_novedad)) {
            return {
                ok: true,
                skipped: true,
                reason: 'tipo_not_in_buzon',
                tipo_novedad: mapped.tipo_novedad
            };
        }

        const existing = await pool.query(
            `SELECT id, status, match_strategy, colaborador_cedula_match
             FROM ficha_novedades_staging WHERE external_id = $1 LIMIT 1`,
            [mapped.external_id]
        );
        if (existing.rows[0]) {
            return {
                ok: true,
                duplicate: true,
                id: existing.rows[0].id,
                status: existing.rows[0].status,
                match_strategy: existing.rows[0].match_strategy,
                match: existing.rows[0].colaborador_cedula_match
                    ? { cedula: existing.rows[0].colaborador_cedula_match }
                    : null
            };
        }

        const normalized = normalizeExtractorPayload(mapped.extractor_output);
        if (mapped.tipo_novedad === 'cancelacion_ingreso') {
            normalized.onboarding_status = 'cancelado_ingreso';
        }
        const cedulaDetectada =
            normalizeCedula(normalized.cedula || normalized.numero_identidad) ||
            normalizeCedula(mapped.cedula_plano) ||
            null;

        const { row: matchRow, strategy: matchStrategy } = await matchColaborador(pool, {
            codigo: mapped.id_registro || normalized.codigo || mapped.codigo_plano,
            cedula: cedulaDetectada,
            nombre: normalized.nombre || mapped.nombre_asunto || mapped.nombre_plano,
            cliente: normalized.cliente || mapped.cliente_asunto || mapped.cliente_plano,
            tipo_novedad: mapped.tipo_novedad
        });

        let status = 'pendiente';
        let diffJson = [];
        let colaboradorSnap = null;

        if (!matchRow) {
            status = 'sin_match';
        } else {
            const current = await loadColaboradorFull(pool, matchRow.cedula);
            diffJson = buildDiff(current || {}, normalized);
            colaboradorSnap = matchRow.nombre;
            if (diffJson.length === 0 && MVP_TIPOS.has(mapped.tipo_novedad)) {
                status = 'pendiente';
            }
        }

        const enrichment = buildIngestEnrichment(matchRow, matchStrategy, diffJson);

        const insert = await pool.query(
            `INSERT INTO ficha_novedades_staging (
                source, external_id, event_type, tipo_novedad, id_registro,
                subject, received_at, payload_raw, payload_normalizado, diff_json,
                status, cedula_detectada, colaborador_cedula_match, colaborador_nombre_snap,
                sequence_number, shard_id, n8n_execution_id, match_strategy
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8::jsonb, $9::jsonb, $10::jsonb,
                $11, $12, $13, $14,
                $15, $16, $17, $18
            )
            RETURNING id, status`,
            [
                source,
                mapped.external_id,
                meta.eventType || 'INSERT',
                mapped.tipo_novedad,
                mapped.id_registro,
                mapped.subject,
                mapped.received_at ? new Date(mapped.received_at) : null,
                JSON.stringify(rawItem),
                JSON.stringify(normalized),
                JSON.stringify(diffJson),
                status,
                cedulaDetectada,
                matchRow ? matchRow.cedula : null,
                colaboradorSnap,
                meta.sequenceNumber || null,
                meta.shardId || null,
                mapped.n8n_execution_id,
                matchStrategy
            ]
        );

        return {
            ok: true,
            id: insert.rows[0].id,
            status: insert.rows[0].status,
            ...enrichment
        };
    }

    async function ingestFromDynamo(rawItem, meta = {}) {
        if (!isZohoNovedadItem(rawItem)) {
            return { ok: false, skipped: true, reason: 'not_zoho_novedad' };
        }
        if (meta.eventType === 'REMOVE') {
            return { ok: true, skipped: true, reason: 'remove_event' };
        }
        return ingestZohoPayload(rawItem, { ...meta, source: 'dynamo_stream_zoho' });
    }

    async function ingestFromHttp(payload, meta = {}) {
        const rawItem = {
            record_type: ZOHO_RECORD_TYPE,
            ...(payload && typeof payload === 'object' ? payload : {})
        };
        const source = VALID_SOURCES.has(meta.source) ? meta.source : 'n8n_webhook';
        return ingestZohoPayload(rawItem, { ...meta, source, eventType: meta.eventType || 'INSERT' });
    }

    async function listNovedades(filters = {}) {
        const { status, scope, tipo_novedad, cedula, limit = 100, offset = 0 } = filters;
        const where = [buzonTipoExclusionSql()];
        const params = [];
        let p = 1;

        if (status) {
            params.push(status);
            where.push(`status = $${p++}`);
        } else {
            const resolvedScope = scope === 'historico' ? 'historico' : 'inbox';
            if (resolvedScope === 'historico') {
                where.push(`status IN ('aplicado', 'rechazado')`);
            } else {
                where.push(`status IN ('pendiente', 'sin_match')`);
            }
        }

        if (tipo_novedad) {
            if (!isTipoEligibleForBuzon(tipo_novedad)) {
                return { items: [], total: 0, pendingCount: 0, historicoCount: 0 };
            }
            params.push(tipo_novedad);
            where.push(`tipo_novedad = $${p++}`);
        }
        if (cedula) {
            params.push(normalizeCedula(cedula));
            where.push(`colaborador_cedula_match = $${p++}`);
        }

        const isHistoricoList =
            scope === 'historico' ||
            status === 'aplicado' ||
            status === 'rechazado';
        const orderBy = isHistoricoList
            ? 'reviewed_at DESC NULLS LAST, created_at DESC'
            : 'created_at DESC';

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        params.push(limit, offset);
        const q = await pool.query(
            `SELECT id, tipo_novedad, id_registro, subject, status,
                    cedula_detectada, colaborador_cedula_match, colaborador_nombre_snap,
                    received_at, created_at, reviewed_by, reviewed_at, n8n_execution_id,
                    match_strategy,
                    jsonb_array_length(diff_json) AS diff_count
             FROM ficha_novedades_staging
             ${whereSql}
             ORDER BY ${orderBy}
             LIMIT $${p++} OFFSET $${p++}`,
            params
        );
        const countQ = await pool.query(
            `SELECT COUNT(*)::int AS total FROM ficha_novedades_staging ${whereSql}`,
            params.slice(0, params.length - 2)
        );
        const pendingQ = await pool.query(
            `SELECT COUNT(*)::int AS pending FROM ficha_novedades_staging
             WHERE status IN ('pendiente', 'sin_match') AND ${buzonTipoExclusionSql()}`
        );
        const historicoQ = await pool.query(
            `SELECT COUNT(*)::int AS total FROM ficha_novedades_staging
             WHERE status IN ('aplicado', 'rechazado') AND ${buzonTipoExclusionSql()}`
        );
        return {
            items: q.rows,
            total: countQ.rows[0]?.total || 0,
            pendingCount: pendingQ.rows[0]?.pending || 0,
            historicoCount: historicoQ.rows[0]?.total || 0
        };
    }

    async function getNovedadById(id) {
        const q = await pool.query(`SELECT * FROM ficha_novedades_staging WHERE id = $1::uuid LIMIT 1`, [id]);
        return q.rows[0] || null;
    }

    async function applyPatchToColaborador(cedula, patch) {
        if (typeof updateColaboradorByCedula === 'function') {
            const updated = await updateColaboradorByCedula(cedula, patch);
            if (!updated) throw Object.assign(new Error('Colaborador no encontrado'), { status: 404 });
            return updated;
        }
        const cols = [];
        const vals = [];
        let idx = 1;
        const allowed = new Set([...COLABORADORES_EXTENDED_KEYS, ...CORE_PATCH_KEYS]);
        for (const [key, val] of Object.entries(patch)) {
            if (!allowed.has(key)) continue;
            cols.push(`${key} = $${idx++}`);
            vals.push(val);
        }
        if (cols.length === 0) {
            throw Object.assign(new Error('Sin campos aplicables'), { status: 400 });
        }
        vals.push(normalizeCedula(cedula));
        const q = await pool.query(
            `UPDATE colaboradores SET ${cols.join(', ')}, updated_at = NOW()
             WHERE cedula = $${idx}
             RETURNING cedula`,
            vals
        );
        if (!q.rows[0]) throw Object.assign(new Error('Colaborador no encontrado'), { status: 404 });
        return q.rows[0];
    }

    async function approveNovedad(id, reviewer = {}) {
        const row = await getNovedadById(id);
        if (!row) throw Object.assign(new Error('Novedad no encontrada'), { status: 404 });
        if (!['pendiente', 'sin_match'].includes(row.status)) {
            throw Object.assign(new Error(`Estado no aprobable: ${row.status}`), { status: 409 });
        }
        const cedula = row.colaborador_cedula_match;
        if (!cedula) {
            throw Object.assign(new Error('Vincule un colaborador antes de aprobar'), { status: 400 });
        }

        const normalized = row.payload_normalizado || {};
        const patch = buildPatchFromNormalized(row.tipo_novedad, normalized);
        if (Object.keys(patch).length === 0) {
            throw Object.assign(new Error('Payload sin campos aplicables'), { status: 400 });
        }

        await applyPatchToColaborador(cedula, patch);

        const reviewedBy = trimOrNull(reviewer.sub || reviewer.email || reviewer.displayName, 320);
        await pool.query(
            `UPDATE ficha_novedades_staging
             SET status = 'aplicado', reviewed_by = $2, reviewed_at = NOW(), processed_at = NOW(), error = NULL
             WHERE id = $1::uuid`,
            [id, reviewedBy]
        );
        return { ok: true, status: 'aplicado', cedula };
    }

    async function rejectNovedad(id, reviewer = {}, reason = null) {
        const row = await getNovedadById(id);
        if (!row) throw Object.assign(new Error('Novedad no encontrada'), { status: 404 });
        if (!['pendiente', 'sin_match'].includes(row.status)) {
            throw Object.assign(new Error(`Estado no rechazable: ${row.status}`), { status: 409 });
        }
        const reviewedBy = trimOrNull(reviewer.sub || reviewer.email || reviewer.displayName, 320);
        await pool.query(
            `UPDATE ficha_novedades_staging
             SET status = 'rechazado', reviewed_by = $2, reviewed_at = NOW(), processed_at = NOW(), error = $3
             WHERE id = $1::uuid`,
            [id, reviewedBy, trimOrNull(reason, 2000)]
        );
        return { ok: true, status: 'rechazado' };
    }

    async function linkNovedad(id, cedulaRaw, reviewer = {}) {
        const row = await getNovedadById(id);
        if (!row) throw Object.assign(new Error('Novedad no encontrada'), { status: 404 });
        if (row.status !== 'sin_match') {
            throw Object.assign(new Error('Solo se vincula en estado sin_match'), { status: 409 });
        }
        const cedula = normalizeCedula(cedulaRaw);
        if (!cedula) throw Object.assign(new Error('Cédula inválida'), { status: 400 });

        const colab = await loadColaboradorFull(pool, cedula);
        if (!colab) throw Object.assign(new Error('Colaborador no encontrado'), { status: 404 });

        const normalized = row.payload_normalizado || {};
        const diffJson = buildDiff(colab, normalized);

        await pool.query(
            `UPDATE ficha_novedades_staging
             SET status = 'pendiente',
                 colaborador_cedula_match = $2,
                 colaborador_nombre_snap = $3,
                 diff_json = $4::jsonb,
                 match_strategy = 'manual',
                 reviewed_by = $5,
                 reviewed_at = NOW(),
                 error = NULL
             WHERE id = $1::uuid`,
            [
                id,
                cedula,
                colab.nombre,
                JSON.stringify(diffJson),
                trimOrNull(reviewer.sub || reviewer.email, 320)
            ]
        );
        return { ok: true, status: 'pendiente', cedula, diff: diffJson, match_strategy: 'manual' };
    }

    async function updateNovedadPayload(id, edits = {}, reviewer = {}) {
        const row = await getNovedadById(id);
        if (!row) throw Object.assign(new Error('Novedad no encontrada'), { status: 404 });
        if (row.status !== 'pendiente') {
            throw Object.assign(new Error(`Estado no editable: ${row.status}`), { status: 409 });
        }
        const cedula = row.colaborador_cedula_match;
        if (!cedula) {
            throw Object.assign(new Error('Vincule un colaborador antes de editar'), { status: 400 });
        }
        if (!edits || typeof edits !== 'object' || Array.isArray(edits)) {
            throw Object.assign(new Error('Edits inválidos'), { status: 400 });
        }
        const editKeys = Object.keys(edits).filter((k) => !k.startsWith('_'));
        if (editKeys.length === 0) {
            throw Object.assign(new Error('Sin campos para editar'), { status: 400 });
        }
        if (editKeys.length > 30) {
            throw Object.assign(new Error('Demasiados campos en una sola edición'), { status: 400 });
        }

        const diffRows = Array.isArray(row.diff_json) ? row.diff_json : parseJsonField(row.diff_json) || [];
        const diffFields = new Set(diffRows.map((d) => d.field).filter(Boolean));
        const normalized = { ...(row.payload_normalizado || {}) };

        for (const key of editKeys) {
            if (!diffFields.has(key)) {
                throw Object.assign(new Error(`Campo no editable: ${key}`), { status: 400 });
            }
            if (!isFieldEditableForTipo(row.tipo_novedad, key)) {
                throw Object.assign(
                    new Error(`Campo no permitido para tipo ${row.tipo_novedad}: ${key}`),
                    { status: 400 }
                );
            }
            const val = normalizeEditValue(key, edits[key]);
            if (val === null || val === '') {
                delete normalized[key];
            } else {
                normalized[key] = val;
            }
        }

        const colab = await loadColaboradorFull(pool, cedula);
        if (!colab) throw Object.assign(new Error('Colaborador no encontrado'), { status: 404 });

        const diffJson = buildDiff(colab, normalized);
        const reviewedBy = trimOrNull(reviewer.sub || reviewer.email || reviewer.displayName, 320);

        await pool.query(
            `UPDATE ficha_novedades_staging
             SET payload_normalizado = $2::jsonb,
                 diff_json = $3::jsonb,
                 reviewed_by = $4,
                 reviewed_at = NOW(),
                 error = NULL
             WHERE id = $1::uuid`,
            [id, JSON.stringify(normalized), JSON.stringify(diffJson), reviewedBy]
        );

        return getNovedadById(id);
    }

    /**
     * Backfill / reconciliación: scan Dynamo zoho_novedad → ingest faltantes en Postgres.
     * Idempotente por external_id (ingestZohoPayload dedupe).
     */
    async function syncMissingFromDynamo(options = {}) {
        const {
            dynamoClient,
            tableName = (process.env.DYNAMODB_TABLE_NAME || '').trim(),
            dryRun = false,
            limit = null
        } = options;

        const startedAt = new Date().toISOString();
        const summary = {
            ok: true,
            dry_run: Boolean(dryRun),
            table_name: tableName,
            scanned: 0,
            would_insert: 0,
            inserted: 0,
            skipped_duplicate: 0,
            skipped_invalid: 0,
            skipped_excluded_tipo: 0,
            errors: 0,
            by_status: {},
            by_tipo: {},
            error_samples: [],
            started_at: startedAt,
            finished_at: null
        };

        if (!tableName) {
            summary.ok = false;
            summary.error = 'DYNAMODB_TABLE_NAME no configurado';
            summary.finished_at = new Date().toISOString();
            lastZohoDynamoSyncSummary = summary;
            return summary;
        }

        const { createZohoDynamoDocumentClient, scanZohoNovedadItems } = require('./zohoDynamoScan');
        const docClient = dynamoClient || createZohoDynamoDocumentClient();

        let knownExternalIds = new Set();
        try {
            const pgRows = await pool.query(`SELECT external_id FROM ficha_novedades_staging`);
            knownExternalIds = new Set(
                pgRows.rows.map((r) => String(r.external_id || '').trim()).filter(Boolean)
            );
        } catch (e) {
            summary.ok = false;
            summary.error = e.message;
            summary.finished_at = new Date().toISOString();
            lastZohoDynamoSyncSummary = summary;
            return summary;
        }

        let dynamoItems;
        if (Array.isArray(options.itemsOverride)) {
            dynamoItems = options.itemsOverride;
        } else {
            try {
                dynamoItems = await scanZohoNovedadItems(docClient, tableName, {
                    limit: limit != null ? Number(limit) : undefined
                });
            } catch (e) {
                summary.ok = false;
                summary.error = e.message;
                summary.finished_at = new Date().toISOString();
                lastZohoDynamoSyncSummary = summary;
                return summary;
            }
        }

        summary.scanned = dynamoItems.length;

        for (const rawItem of dynamoItems) {
            const mapped = mapDynamoZohoPayload(rawItem);
            const externalId = mapped.external_id;

            if (!externalId || !mapped.tipo_novedad) {
                summary.skipped_invalid += 1;
                continue;
            }

            if (!isTipoEligibleForBuzon(mapped.tipo_novedad)) {
                summary.skipped_excluded_tipo += 1;
                continue;
            }

            if (knownExternalIds.has(externalId)) {
                summary.skipped_duplicate += 1;
                continue;
            }

            if (dryRun) {
                summary.would_insert += 1;
                const tipo = mapped.tipo_novedad;
                summary.by_tipo[tipo] = (summary.by_tipo[tipo] || 0) + 1;
                continue;
            }

            try {
                const result = await ingestFromDynamo(rawItem, { eventType: 'INSERT' });
                if (result.duplicate) {
                    summary.skipped_duplicate += 1;
                    knownExternalIds.add(externalId);
                    continue;
                }
                if (!result.ok) {
                    summary.errors += 1;
                    if (summary.error_samples.length < 5) {
                        summary.error_samples.push({
                            external_id: externalId,
                            error: result.error || result.reason || 'unknown'
                        });
                    }
                    continue;
                }

                summary.inserted += 1;
                knownExternalIds.add(externalId);
                const status = result.status || 'pendiente';
                summary.by_status[status] = (summary.by_status[status] || 0) + 1;
                const tipo = mapped.tipo_novedad;
                summary.by_tipo[tipo] = (summary.by_tipo[tipo] || 0) + 1;
            } catch (e) {
                summary.errors += 1;
                if (summary.error_samples.length < 5) {
                    summary.error_samples.push({ external_id: externalId, error: e.message });
                }
                log.error({ error: e.message, external_id: externalId }, 'FichaNovedades sync ingest error');
            }
        }

        summary.finished_at = new Date().toISOString();
        lastZohoDynamoSyncSummary = summary;
        return summary;
    }

    return {
        ingestZohoPayload,
        ingestFromDynamo,
        ingestFromHttp,
        syncMissingFromDynamo,
        getLastSyncSummary: getLastZohoDynamoSyncSummary,
        listNovedades,
        getNovedadById,
        approveNovedad,
        rejectNovedad,
        linkNovedad,
        updateNovedadPayload,
        matchColaborador,
        buildDiff,
        buildPatchFromNormalized,
        isZohoNovedadItem,
        isTipoEligibleForBuzon,
        getAllowedFieldsForTipo,
        normalizeExtractorPayload,
        mapDynamoZohoPayload
    };
}

module.exports = {
    createFichaNovedadesService,
    getLastZohoDynamoSyncSummary,
    isZohoNovedadItem,
    isTipoEligibleForBuzon,
    buildDiff,
    getAllowedFieldsForTipo,
    buildPatchFromNormalized,
    normalizeExtractorPayload,
    matchColaborador,
    mapDynamoZohoPayload,
    ZOHO_RECORD_TYPE,
    BUZON_EXCLUDED_TIPOS,
    WHITELIST_BY_TIPO,
    VALID_SOURCES
};
