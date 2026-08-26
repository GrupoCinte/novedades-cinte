/**
 * Buzón de novedades Zoho: ingest HTTP/Dynamo, match activos en PG, diff y apply con revisión CH.
 */

const {
    flattenExtractorOutput,
    EXTRACTOR_MONEY_KEYS
} = require('../contratacion/extractorToFichaMap');
const { COLABORADORES_EXTENDED_KEYS } = require('../colaboradores/colaboradoresExtendedColumns');
const { normalizeChListText } = require('./chTextNormalize');
const { parseSalarioCop } = require('../shared/n8nFieldNormalizers');
const { insertTarifaHistorial } = require('../conciliaciones/conciliacionTarifaHistorial');
const { upsertColaboradorAsignacion } = require('../conciliaciones/colaboradorAsignaciones');
const { foldForMatch } = require('../cotizador/clienteNombreMatch');
const { resolveClienteOnWrite } = require('../clientes/clienteCanonWrite');
const { applyRegistroBajaColaborador } = require('./bajaColaborador');
const { applyContractEvent, reopenContrato } = require('./colaboradorContratos');

const ZOHO_RECORD_TYPE = 'zoho_novedad';
const DIFF_PREVIEW_LIMIT = 10;

const MONEY_FIELDS = new Set([...EXTRACTOR_MONEY_KEYS, 'utilidad', 'rt_aprox']);

const MVP_TIPOS = new Set(['integracion', 'modificacion_id']);

/** Tipos que no van al buzón Novedades Zoho (se gestionan en En ingreso u otro flujo). */
const BUZON_EXCLUDED_TIPOS = new Set(['integracion']);

const VALID_SOURCES = new Set(['dynamo_stream_zoho', 'n8n_webhook', 'manual']);

/** Campos permitidos por tipo al aplicar. `null` = todos los del payload normalizado. */
const WHITELIST_BY_TIPO = {
    integracion: null,
    modificacion_id: null,
    salida: ['fecha_termino', 'fecha_notificacion_termino', 'termino', 'activo'],
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
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }
    const s = String(value).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (/^-?\d+(\.\d+)?$/.test(s)) {
        const n = Number(s);
        if (!Number.isNaN(n)) return n;
    }
    return s;
}

function normalizeMoneyComparable(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = parseSalarioCop(value);
    if (parsed != null) return parsed;
    const n = Number(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
}

/**
 * Igualdad canónica para diff (casefold texto, numérico money).
 * @param {string} field
 * @param {unknown} before
 * @param {unknown} after
 */
function valuesEqualForDiff(field, before, after) {
    if (MONEY_FIELDS.has(field)) {
        const b = normalizeMoneyComparable(before);
        const a = normalizeMoneyComparable(after);
        if (b == null && a == null) return true;
        if (b == null || a == null) return false;
        return b === a;
    }
    const bNorm = normalizeComparable(before);
    const aNorm = normalizeComparable(after);
    if (bNorm == null && aNorm == null) return true;
    if (bNorm == null || aNorm == null) return false;
    if (typeof bNorm === 'number' || typeof aNorm === 'number') {
        return Number(bNorm) === Number(aNorm);
    }
    if (typeof bNorm === 'boolean' || typeof aNorm === 'boolean') {
        return bNorm === aNorm;
    }
    return String(bNorm).toLocaleUpperCase('es') === String(aNorm).toLocaleUpperCase('es');
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
        if (valuesEqualForDiff(field, before, after)) continue;
        const bNorm = MONEY_FIELDS.has(field)
            ? normalizeMoneyComparable(before) ?? normalizeComparable(before)
            : normalizeComparable(before);
        const aNorm = MONEY_FIELDS.has(field)
            ? normalizeMoneyComparable(after) ?? normalizeComparable(after)
            : normalizeComparable(after);
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
    if (MONEY_FIELDS.has(field) || field === 'duracion_servicio') {
        const money = normalizeMoneyComparable(s);
        if (money != null) return money;
        const n = Number(s);
        if (!Number.isNaN(n)) return n;
    }
    if (field === 'cliente') return resolveClienteOnWrite(s);
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
    const puestoPlano = readD(r.puesto ?? r.Puesto_Cargo);
    const fechaTerminoPlano = readD(r.fecha_termino ?? r.fechaTermino);
    const fechaIngresoPlano = readD(r.fecha_ingreso ?? r.fechaIngreso);

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
        puesto: puestoPlano,
        fecha_termino: fechaTerminoPlano,
        fecha_ingreso: fechaIngresoPlano,
        n8n_execution_id: trimOrNull(r.n8n_execution_id || r.n8nExecutionId),
        nombre_asunto: trimOrNull(r.nombreAsunto || parsedSubject.nombre || nombrePlano),
        cliente_asunto: trimOrNull(r.clienteAsunto || parsedSubject.cliente || clientePlano),
        cedula_plano: cedulaPlano,
        nombre_plano: nombrePlano,
        cliente_plano: clientePlano,
        codigo_plano: codigoPlano
    };
}

const CH_TEXT_KEYS = new Set([
    'nombre',
    'cliente',
    'puesto',
    'nombres',
    'primer_apellido',
    'segundo_apellido'
]);

function normalizeExtractorPayload(extractorOutput, tipoNovedad) {
    if (!extractorOutput || typeof extractorOutput !== 'object') return {};
    const flat = flattenExtractorOutput(extractorOutput);
    const out = {};
    for (const [k, v] of Object.entries(flat)) {
        if (v === undefined || v === null || v === '') continue;
        if (k === 'cliente') {
            out[k] = resolveClienteOnWrite(v);
        } else if (CH_TEXT_KEYS.has(k)) {
            out[k] = normalizeChListText(v);
        } else {
            out[k] = v;
        }
    }
    const tipo = String(tipoNovedad || '').trim().toLowerCase();
    if (tipo === 'modificacion_id' && out.fecha_ingreso) {
        out.vigente_desde = out.fecha_ingreso;
        delete out.fecha_ingreso;
    }
    return out;
}

function isEmptyNormValue(value) {
    return value === undefined || value === null || value === '';
}

function setNormalizedIfEmpty(out, key, value) {
    if (!out || !key) return;
    if (!isEmptyNormValue(out[key])) return;
    if (isEmptyNormValue(value)) return;
    if (key === 'cliente') {
        out[key] = resolveClienteOnWrite(value);
    } else if (CH_TEXT_KEYS.has(key)) {
        out[key] = normalizeChListText(value);
    } else {
        out[key] = value;
    }
}

/**
 * Completa payload_normalizado con campos planos Dynamo / parsed_subject
 * cuando el extractor lite/MVP no los trae (match OK pero ficha incompleta).
 * @param {Record<string, unknown>} normalized
 * @param {ReturnType<typeof mapDynamoZohoPayload>} mapped
 */
function enrichNormalizedFromMapped(normalized, mapped = {}) {
    const out = { ...(normalized || {}) };
    const parsed =
        mapped.parsed_subject && typeof mapped.parsed_subject === 'object' ? mapped.parsed_subject : {};

    setNormalizedIfEmpty(out, 'cedula', mapped.cedula_plano || parsed.cedula);
    setNormalizedIfEmpty(
        out,
        'nombre',
        mapped.nombre_asunto || mapped.nombre_plano || parsed.nombre
    );
    setNormalizedIfEmpty(
        out,
        'cliente',
        mapped.cliente_asunto || mapped.cliente_plano || parsed.cliente
    );
    setNormalizedIfEmpty(out, 'puesto', parsed.puesto || mapped.puesto);
    setNormalizedIfEmpty(out, 'fecha_termino', parsed.fecha_termino || mapped.fecha_termino);
    setNormalizedIfEmpty(out, 'fecha_ingreso', parsed.fecha_ingreso || mapped.fecha_ingreso);

    for (const [key, value] of Object.entries(parsed)) {
        if (!key || key.startsWith('_') || key === 'codigo' || key === 'id_registro') continue;
        setNormalizedIfEmpty(out, key, value);
    }

    // Código de persona: forzar id_registro / plano (nunca Codigo_Oportunidad residual).
    const codigoPersona =
        mapped.id_registro || mapped.codigo_plano || parsed.id_registro || parsed.codigo;
    if (!isEmptyNormValue(codigoPersona)) {
        out.codigo = String(codigoPersona).trim();
    }

    const tipo = String(mapped.tipo_novedad || '').trim().toLowerCase();
    if (tipo === 'modificacion_id' && out.fecha_ingreso) {
        out.vigente_desde = out.fecha_ingreso;
        delete out.fecha_ingreso;
    }

    if (
        out.empleador != null &&
        out.cliente != null &&
        String(out.empleador).toLocaleUpperCase('es') === String(out.cliente).toLocaleUpperCase('es')
    ) {
        delete out.empleador;
    }

    return out;
}

/**
 * Re-aplana extractor + enrich desde staging (retroactivo pendiente/sin_match).
 * Preserva `__manual_edits` de ediciones CH previas.
 * @param {object} row fila ficha_novedades_staging
 * @returns {{ normalized: Record<string, unknown>, mapped: ReturnType<typeof mapDynamoZohoPayload> }}
 */
function rebuildNormalizedFromStagingRow(row) {
    const raw = parseJsonField(row?.payload_raw) || {};
    const prevNorm = parseJsonField(row?.payload_normalizado) || {};
    const rawItem = {
        record_type: ZOHO_RECORD_TYPE,
        ...raw,
        tipo_novedad: raw.tipo_novedad || row?.tipo_novedad,
        id_registro: raw.id_registro || row?.id_registro,
        subject: raw.subject || row?.subject,
        codigo: raw.codigo || raw.id_registro || row?.id_registro
    };
    if (!rawItem.extractor_output && prevNorm.extractor_output) {
        rawItem.extractor_output = prevNorm.extractor_output;
    }

    const mapped = mapDynamoZohoPayload(rawItem);
    if (!mapped.tipo_novedad) mapped.tipo_novedad = row?.tipo_novedad || null;
    if (!mapped.id_registro) mapped.id_registro = row?.id_registro || null;

    const hasExtractor =
        mapped.extractor_output &&
        typeof mapped.extractor_output === 'object' &&
        Object.keys(mapped.extractor_output).length > 0;

    let normalized;
    if (hasExtractor) {
        normalized = enrichNormalizedFromMapped(
            normalizeExtractorPayload(mapped.extractor_output, mapped.tipo_novedad || row?.tipo_novedad),
            mapped
        );
    } else {
        // Sin extractor: conservar payload previo (edits/planos) y solo saneamiento.
        normalized = { ...prevNorm };
        delete normalized.__manual_edits;
        if (!isEmptyNormValue(row?.id_registro)) {
            normalized.codigo = String(row.id_registro).trim();
        } else if (!isEmptyNormValue(mapped.id_registro)) {
            normalized.codigo = String(mapped.id_registro).trim();
        }
        if (
            normalized.empleador != null &&
            normalized.cliente != null &&
            String(normalized.empleador).toLocaleUpperCase('es') ===
                String(normalized.cliente).toLocaleUpperCase('es')
        ) {
            delete normalized.empleador;
        }
    }

    const manual =
        prevNorm.__manual_edits && typeof prevNorm.__manual_edits === 'object'
            ? prevNorm.__manual_edits
            : {};
    for (const [key, value] of Object.entries(manual)) {
        if (!key || key.startsWith('_')) continue;
        if (value === null || value === undefined || value === '') {
            delete normalized[key];
        } else {
            normalized[key] = value;
        }
    }
    if (Object.keys(manual).length > 0) {
        normalized.__manual_edits = manual;
    }

    return { normalized, mapped };
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
/** Fold para comparar nombres de persona (tildes + puntuación). */
function foldPersonName(value) {
    return foldForMatch(value)
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extrae nombre/cliente del subject Zoho cuando el payload trae "nada".
 * @param {string|null|undefined} subject
 * @returns {{ nombre: string|null, cliente: string|null }}
 */
function extractPersonHintsFromSubject(subject) {
    const s = String(subject || '').replace(/\s+/g, ' ').trim();
    if (!s) return { nombre: null, cliente: null };

    let m = s.match(/Modificaci[oó]n sobre ID\s+\d+\s*-\s*(.+?)(?:-([^-()]+))?(?:\s*\(|$)/i);
    if (m) {
        return { nombre: trimOrNull(m[1]), cliente: trimOrNull(m[2]) };
    }
    m = s.match(/Extensi[oó]n\s*-\s*(.+?)\s*\/\s*(.+?)\s*$/i);
    if (m) {
        return { nombre: trimOrNull(m[1]), cliente: trimOrNull(m[2]) };
    }
    m = s.match(/Salida de\s+(.+?)\s+-\s+(.+?)(?:\s*\(|$)/i);
    if (m) {
        return { nombre: trimOrNull(m[1]), cliente: trimOrNull(m[2]) };
    }
    m = s.match(/Cancelaci[oó]n de Ingreso\s+\d+\s*-\s*(.+?)\s+-\s*(.+?)(?:\s*\(|$)/i);
    if (m) {
        return { nombre: trimOrNull(m[1]), cliente: trimOrNull(m[2]) };
    }
    return { nombre: null, cliente: null };
}

/** Códigos de persona Zoho / CH; evita IDs de ticket (p.ej. 16366). */
function isLikelyPersonCodigo(codigo) {
    const c = trimOrNull(codigo);
    if (!c) return false;
    if (/^20\d{5,}$/.test(c)) return true;
    if (/[A-Za-z]/.test(c)) return true;
    return c.length >= 8;
}

const NOMBRE_FOLD_SQL = `trim(regexp_replace(
    regexp_replace(
      lower(translate(trim(coalesce(nombre, '')),
        'áàäâÁÀÄÂéèëêÉÈËÊíìïîÍÌÏÎóòöôÓÒÖÔúùüûÚÙÜÛñÑ',
        'aaaaAAAAeeeeEEEEiiiiIIIIooooOOOOuuuuUUUUnN')),
      '[^a-z0-9\\s]+', ' ', 'g'),
    '\\s+', ' ', 'g'))`;

const CLIENTE_FOLD_SQL = `trim(regexp_replace(
    regexp_replace(
      lower(translate(trim(coalesce(cliente, '')),
        'áàäâÁÀÄÂéèëêÉÈËÊíìïîÍÌÏÎóòöôÓÒÖÔúùüûÚÙÜÛñÑ',
        'aaaaAAAAeeeeEEEEiiiiIIIIooooOOOOuuuuUUUUnN')),
      '[^a-z0-9\\s]+', ' ', 'g'),
    '\\s+', ' ', 'g'))`;

async function matchColaborador(pool, hints = {}, options = {}) {
    const fromSubject = extractPersonHintsFromSubject(hints.subject);
    const codigoRaw = trimOrNull(hints.codigo);
    const codigo = isLikelyPersonCodigo(codigoRaw) ? codigoRaw : null;
    const cedula = normalizeCedula(hints.cedula);
    const nombreRaw = trimOrNull(hints.nombre) || fromSubject.nombre;
    const clienteRaw = trimOrNull(hints.cliente) || fromSubject.cliente;
    const nombre = nombreRaw ? normalizeChListText(nombreRaw) : null;
    const cliente = clienteRaw ? normalizeChListText(clienteRaw) : null;
    const nombreFold = foldPersonName(nombreRaw || '');
    const clienteFold = foldPersonName(clienteRaw || '');
    const tipo = String(hints.tipo_novedad || '').trim().toLowerCase();
    const allowInactive =
        options.allowInactive === true ||
        tipo === 'cancelacion_ingreso' ||
        tipo === 'salida';
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

    if (nombreFold && clienteFold) {
        const q = await pool.query(
            `SELECT cedula, nombre, cliente, codigo
             FROM colaboradores
             WHERE ${NOMBRE_FOLD_SQL} = $1
               AND ${CLIENTE_FOLD_SQL} = $2${activoClause}
             ORDER BY activo DESC, updated_at DESC NULLS LAST
             LIMIT 1`,
            [nombreFold, clienteFold]
        );
        if (q.rows[0]) return { row: q.rows[0], strategy: 'nombre_cliente' };
    }

    if (nombreFold) {
        const q = await pool.query(
            `SELECT cedula, nombre, cliente, codigo
             FROM colaboradores
             WHERE ${NOMBRE_FOLD_SQL} = $1${activoClause}
             ORDER BY activo DESC, updated_at DESC NULLS LAST
             LIMIT 2`,
            [nombreFold]
        );
        if (q.rows.length === 1) return { row: q.rows[0], strategy: 'nombre' };
        if (q.rows.length > 1 && clienteFold) {
            const byCli = q.rows.find((r) => foldPersonName(r.cliente) === clienteFold);
            if (byCli) return { row: byCli, strategy: 'nombre_cliente' };
        }
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

/**
 * @param {import('pg').Pool} pool
 * @param {string[]} cedulas
 * @returns {Promise<Map<string, object>>}
 */
async function loadColaboradoresFullByCedulas(pool, cedulas = []) {
    const unique = [...new Set((cedulas || []).map(normalizeCedula).filter(Boolean))];
    const map = new Map();
    if (unique.length === 0) return map;
    const q = await pool.query(`SELECT * FROM colaboradores WHERE cedula = ANY($1::text[])`, [unique]);
    for (const row of q.rows || []) {
        if (row?.cedula) map.set(String(row.cedula), row);
    }
    return map;
}

function parseDiffJsonLen(diffJson) {
    if (Array.isArray(diffJson)) return diffJson.length;
    const parsed = parseJsonField(diffJson);
    return Array.isArray(parsed) ? parsed.length : 0;
}

const SIBLING_CLOSE_REASON = 'Cerrada por aprobación de otra ficha del mismo colaborador';

function fichaSortTs(row) {
    const d = row?.received_at || row?.created_at;
    if (!d) return 0;
    const t = new Date(d).getTime();
    return Number.isNaN(t) ? 0 : t;
}

function toFichaListEntry(row) {
    return {
        id: row.id,
        tipo_novedad: row.tipo_novedad,
        subject: row.subject,
        status: row.status,
        diff_count: row.diff_count != null ? Number(row.diff_count) : 0,
        received_at: row.received_at,
        created_at: row.created_at,
        id_registro: row.id_registro,
        match_strategy: row.match_strategy
    };
}

/**
 * Agrupa inbox: por cédula matcheada; sin_match quedan 1:1.
 * @param {Array<object>} items filas planas con diff_count
 * @returns {Array<object>}
 */
function groupInboxByCedula(items = []) {
    const groups = new Map();
    const singles = [];

    for (const row of items || []) {
        const status = String(row.status || '').toLowerCase();
        const ced = normalizeCedula(row.colaborador_cedula_match);
        if (status === 'sin_match' || !ced) {
            singles.push({
                ...row,
                id: row.id,
                latest_id: row.id,
                fichas_count: 1,
                fichas: [toFichaListEntry(row)],
                tipos: row.tipo_novedad ? [row.tipo_novedad] : [],
                group_key: row.id
            });
            continue;
        }
        if (!groups.has(ced)) groups.set(ced, []);
        groups.get(ced).push(row);
    }

    const groupedRows = [];
    for (const [ced, rows] of groups.entries()) {
        const sorted = [...rows].sort((a, b) => fichaSortTs(b) - fichaSortTs(a));
        const latest = sorted[0];
        const fichas = sorted.map(toFichaListEntry);
        const tipos = [...new Set(sorted.map((r) => r.tipo_novedad).filter(Boolean))];
        groupedRows.push({
            id: latest.id,
            latest_id: latest.id,
            tipo_novedad: latest.tipo_novedad,
            id_registro: latest.id_registro,
            subject: latest.subject,
            status: latest.status,
            cedula_detectada: latest.cedula_detectada,
            colaborador_cedula_match: ced,
            colaborador_nombre_snap: latest.colaborador_nombre_snap,
            received_at: latest.received_at,
            created_at: latest.created_at,
            reviewed_by: latest.reviewed_by,
            reviewed_at: latest.reviewed_at,
            n8n_execution_id: latest.n8n_execution_id,
            match_strategy: latest.match_strategy,
            diff_count: latest.diff_count != null ? Number(latest.diff_count) : 0,
            fichas_count: fichas.length,
            fichas,
            tipos,
            group_key: `cedula:${ced}`
        });
    }

    const out = [...groupedRows, ...singles];
    out.sort((a, b) => fichaSortTs(b) - fichaSortTs(a));
    return out;
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

        const normalized = enrichNormalizedFromMapped(
            normalizeExtractorPayload(mapped.extractor_output, mapped.tipo_novedad),
            mapped
        );
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
            subject: mapped.subject || rawItem.subject,
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
        // Inbox: traer payloads para recalcular diff_count vivo (el JSON guardado suele estar hinchado).
        const selectSql = isHistoricoList
            ? `SELECT id, tipo_novedad, id_registro, subject, status,
                      cedula_detectada, colaborador_cedula_match, colaborador_nombre_snap,
                      received_at, created_at, reviewed_by, reviewed_at, n8n_execution_id,
                      match_strategy,
                      jsonb_array_length(COALESCE(diff_json, '[]'::jsonb)) AS diff_count
               FROM ficha_novedades_staging
               ${whereSql}
               ORDER BY ${orderBy}
               LIMIT $${p++} OFFSET $${p++}`
            : `SELECT id, tipo_novedad, id_registro, subject, status,
                      cedula_detectada, colaborador_cedula_match, colaborador_nombre_snap,
                      received_at, created_at, reviewed_by, reviewed_at, n8n_execution_id,
                      match_strategy, payload_raw, payload_normalizado, diff_json
               FROM ficha_novedades_staging
               ${whereSql}
               ORDER BY ${orderBy}
               LIMIT $${p++} OFFSET $${p++}`;
        const q = await pool.query(selectSql, params);

        let items = q.rows;
        if (!isHistoricoList && items.length > 0) {
            const cedulas = items.map((r) => r.colaborador_cedula_match).filter(Boolean);
            const colabMap = await loadColaboradoresFullByCedulas(pool, cedulas);
            const persistJobs = [];
            items = items.map((row) => {
                const { normalized } = rebuildNormalizedFromStagingRow(row);
                let diffJson = [];
                const ced = normalizeCedula(row.colaborador_cedula_match);
                if (ced && colabMap.has(ced)) {
                    diffJson = buildDiff(colabMap.get(ced), normalized);
                }
                persistJobs.push({
                    id: row.id,
                    normalized,
                    diffJson,
                    prevLen: parseDiffJsonLen(row.diff_json)
                });
                return {
                    id: row.id,
                    tipo_novedad: row.tipo_novedad,
                    id_registro: row.id_registro,
                    subject: row.subject,
                    status: row.status,
                    cedula_detectada: row.cedula_detectada,
                    colaborador_cedula_match: row.colaborador_cedula_match,
                    colaborador_nombre_snap: row.colaborador_nombre_snap,
                    received_at: row.received_at,
                    created_at: row.created_at,
                    reviewed_by: row.reviewed_by,
                    reviewed_at: row.reviewed_at,
                    n8n_execution_id: row.n8n_execution_id,
                    match_strategy: row.match_strategy,
                    diff_count: diffJson.length
                };
            });
            // Persistir solo si el conteo cambió (evita escrituras inútiles).
            await Promise.all(
                persistJobs
                    .filter((j) => j.prevLen !== j.diffJson.length)
                    .map((j) =>
                        pool.query(
                            `UPDATE ficha_novedades_staging
                             SET payload_normalizado = $2::jsonb,
                                 diff_json = $3::jsonb
                             WHERE id = $1::uuid AND status IN ('pendiente', 'sin_match')`,
                            [j.id, JSON.stringify(j.normalized), JSON.stringify(j.diffJson)]
                        )
                    )
            );
            items = groupInboxByCedula(items);
        }

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
            items,
            // Inbox agrupado: total de filas de tabla = grupos; pendingCount sigue siendo fichas.
            total: isHistoricoList ? countQ.rows[0]?.total || 0 : items.length,
            pendingCount: pendingQ.rows[0]?.pending || 0,
            historicoCount: historicoQ.rows[0]?.total || 0,
            fichasTotal: isHistoricoList ? undefined : countQ.rows[0]?.total || 0
        };
    }

    async function getNovedadById(id) {
        const q = await pool.query(`SELECT * FROM ficha_novedades_staging WHERE id = $1::uuid LIMIT 1`, [id]);
        const row = q.rows[0] || null;
        if (!row) return null;
        if (!['pendiente', 'sin_match'].includes(row.status)) {
            return row;
        }

        const { normalized } = rebuildNormalizedFromStagingRow(row);
        row.payload_normalizado = normalized;

        let diffJson = Array.isArray(row.diff_json)
            ? row.diff_json
            : parseJsonField(row.diff_json) || [];
        if (row.colaborador_cedula_match) {
            const current = await loadColaboradorFull(pool, row.colaborador_cedula_match);
            if (current) {
                diffJson = buildDiff(current, normalized);
            }
        }
        row.diff_json = diffJson;

        await pool.query(
            `UPDATE ficha_novedades_staging
             SET payload_normalizado = $2::jsonb,
                 diff_json = $3::jsonb
             WHERE id = $1::uuid AND status IN ('pendiente', 'sin_match')`,
            [id, JSON.stringify(normalized), JSON.stringify(diffJson)]
        );

        // Hermanas del mismo consultor (para selector en modal).
        const ced = normalizeCedula(row.colaborador_cedula_match);
        if (ced && row.status === 'pendiente') {
            const sibs = await pool.query(
                `SELECT id, tipo_novedad, subject, status, id_registro, match_strategy,
                        received_at, created_at,
                        jsonb_array_length(COALESCE(diff_json, '[]'::jsonb)) AS diff_count
                 FROM ficha_novedades_staging
                 WHERE colaborador_cedula_match = $1
                   AND status = 'pendiente'
                   AND ${buzonTipoExclusionSql()}
                 ORDER BY COALESCE(received_at, created_at) DESC NULLS LAST`,
                [ced]
            );
            row.fichas = (sibs.rows || []).map(toFichaListEntry);
            row.fichas_count = row.fichas.length;
            row.latest_id = row.fichas[0]?.id || row.id;
        } else {
            row.fichas = [toFichaListEntry({ ...row, diff_count: diffJson.length })];
            row.fichas_count = 1;
            row.latest_id = row.id;
        }

        return row;
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

    async function approveNovedad(id, reviewer = {}, options = {}) {
        const closeSiblings = options.closeSiblings === true;
        const row = await getNovedadById(id);
        if (!row) throw Object.assign(new Error('Novedad no encontrada'), { status: 404 });
        if (!['pendiente', 'sin_match'].includes(row.status)) {
            throw Object.assign(new Error(`Estado no aprobable: ${row.status}`), { status: 409 });
        }
        const cedula = row.colaborador_cedula_match;
        if (!cedula) {
            throw Object.assign(new Error('Vincule un colaborador antes de aprobar'), { status: 400 });
        }

        const tipo = String(row.tipo_novedad || '').trim().toLowerCase();
        const normalized = { ...(row.payload_normalizado || {}) };
        if (normalized.cliente) {
            normalized.cliente = resolveClienteOnWrite(normalized.cliente);
        }
        const patch = buildPatchFromNormalized(row.tipo_novedad, normalized);
        if (Object.keys(patch).length === 0 && tipo !== 'salida' && tipo !== 'cancelacion_salida') {
            throw Object.assign(new Error('Payload sin campos aplicables'), { status: 400 });
        }
        if (tipo === 'salida' && !patch.fecha_termino && !normalized.fecha_termino) {
            throw Object.assign(new Error('Salida sin fecha_termino'), { status: 400 });
        }

        const current = await loadColaboradorFull(pool, cedula);
        const clienteFicha = trimOrNull(normalized.cliente);

        if (tipo === 'salida') {
            if (!clienteFicha) {
                throw Object.assign(new Error('Salida sin cliente: no se puede cerrar el contrato'), { status: 400 });
            }
            await applyRegistroBajaColaborador(pool, cedula, {
                fecha_termino: patch.fecha_termino || normalized.fecha_termino,
                termino: patch.termino || normalized.termino,
                cliente: clienteFicha
            });
            delete patch.fecha_termino;
            delete patch.fecha_notificacion_termino;
            delete patch.termino;
            delete patch.fecha_baja_efectiva;
            delete patch.activo;
        }

        if (tipo === 'cancelacion_salida') {
            if (!clienteFicha) {
                throw Object.assign(new Error('Cancelación de salida sin cliente: no se puede reabrir el contrato'), {
                    status: 400
                });
            }
            await reopenContrato(pool, { cedula, cliente: clienteFicha });
            delete patch.fecha_termino;
            delete patch.fecha_notificacion_termino;
            delete patch.termino;
            delete patch.fecha_baja_efectiva;
            delete patch.activo;
        }

        const clienteNuevo = normalized.cliente ? String(normalized.cliente).trim() : '';
        const clienteActual = current?.cliente ? String(current.cliente).trim() : '';
        const esClienteDistinto =
            clienteNuevo &&
            clienteActual &&
            foldForMatch(clienteNuevo) !== foldForMatch(clienteActual);

        const tiposContrato = tipo === 'integracion' || tipo === 'modificacion_id' || tipo === 'extension';
        if (tiposContrato) {
            const contract = await applyContractEvent(pool, {
                cedula,
                cliente: clienteNuevo || clienteActual,
                tipoContrato: normalized.tipo_contrato || patch.tipo_contrato,
                fechaInicio: normalized.fecha_ingreso || patch.fecha_ingreso,
                fechaTermino: normalized.fecha_termino || patch.fecha_termino,
                origen: `novedad_${tipo}`,
                existed: current
            });
            if (contract.action === 'new_client') {
                delete patch.cliente;
                delete patch.fecha_ingreso;
                delete patch.tipo_contrato;
                delete patch.esquema_contrato;
                delete patch.puesto;
                delete patch.empleador;
                delete patch.sueldo_nomina;
                delete patch.tarifa_cliente;
                delete patch.costo_empresa;
                delete patch.lider_catalogo;
                delete patch.cliente_proyecto;
                delete patch.fecha_termino;
            }
            if (contract.action === 'reingreso') {
                patch.activo = true;
            }
        }

        if (esClienteDistinto && (tipo === 'modificacion_id' || tipo === 'integracion')) {
            await upsertColaboradorAsignacion(pool, {
                cedula,
                cliente: clienteNuevo,
                tarifa: normalized.tarifa_cliente ?? patch.tarifa_cliente,
                fechaInicio: normalized.vigente_desde || normalized.fecha_ingreso || patch.fecha_ingreso,
                codigoZoho: normalized.codigo || patch.codigo
            });
            delete patch.cliente;
            if (patch.tarifa_cliente != null) delete patch.tarifa_cliente;
        }

        if (tipo === 'modificacion_id') {
            const vigenteDesde = normalized.vigente_desde || patch.vigente_desde;
            const nuevaTarifa = normalized.tarifa_cliente ?? patch.tarifa_cliente;
            const clienteHist = esClienteDistinto ? clienteNuevo : clienteActual || clienteNuevo;
            if (vigenteDesde && nuevaTarifa != null && clienteHist) {
                await insertTarifaHistorial(pool, cedula, clienteHist, nuevaTarifa, vigenteDesde, {
                    source: 'ficha_modificacion',
                    stagingId: id
                });
                const hoy = new Date().toISOString().slice(0, 10);
                if (String(vigenteDesde) > hoy) {
                    delete patch.tarifa_cliente;
                }
            }
            delete patch.vigente_desde;
        }

        if (Object.keys(patch).length > 0) {
            await applyPatchToColaborador(cedula, patch);
        }

        const reviewedBy = trimOrNull(reviewer.sub || reviewer.email || reviewer.displayName, 320);
        await pool.query(
            `UPDATE ficha_novedades_staging
             SET status = 'aplicado', reviewed_by = $2, reviewed_at = NOW(), processed_at = NOW(), error = NULL
             WHERE id = $1::uuid`,
            [id, reviewedBy]
        );

        let siblingsClosed = 0;
        if (closeSiblings) {
            const closed = await pool.query(
                `UPDATE ficha_novedades_staging
                 SET status = 'rechazado',
                     reviewed_by = $3,
                     reviewed_at = NOW(),
                     processed_at = NOW(),
                     error = $4
                 WHERE colaborador_cedula_match = $1
                   AND status = 'pendiente'
                   AND id <> $2::uuid
                 RETURNING id`,
                [normalizeCedula(cedula), id, reviewedBy, SIBLING_CLOSE_REASON]
            );
            siblingsClosed = closed.rowCount || closed.rows?.length || 0;
        }

        return { ok: true, status: 'aplicado', cedula, siblings_closed: siblingsClosed };
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
        const manualEdits = {
            ...(normalized.__manual_edits && typeof normalized.__manual_edits === 'object'
                ? normalized.__manual_edits
                : {})
        };

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
                manualEdits[key] = null;
            } else {
                normalized[key] = val;
                manualEdits[key] = val;
            }
        }
        normalized.__manual_edits = manualEdits;

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

        // Devolver fila ya actualizada sin re-aplanar (preserva __manual_edits recién guardados).
        row.payload_normalizado = normalized;
        row.diff_json = diffJson;
        row.reviewed_by = reviewedBy;
        return row;
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
        enrichNormalizedFromMapped,
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
    enrichNormalizedFromMapped,
    rebuildNormalizedFromStagingRow,
    groupInboxByCedula,
    matchColaborador,
    extractPersonHintsFromSubject,
    foldPersonName,
    isLikelyPersonCodigo,
    mapDynamoZohoPayload,
    MONEY_FIELDS,
    SIBLING_CLOSE_REASON,
    ZOHO_RECORD_TYPE,
    BUZON_EXCLUDED_TIPOS,
    WHITELIST_BY_TIPO,
    VALID_SOURCES
};
