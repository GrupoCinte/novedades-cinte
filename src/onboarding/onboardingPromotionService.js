/**
 * Servicio único de promoción a `colaboradores`.
 *
 * Es la única puerta de escritura automática (Dynamo Stream, webhook n8n, ETL Excel, manual).
 * Flujo:
 *   1) INSERT raw en `onboarding_staging` (idempotente por UNIQUE source/external/event/seq).
 *   2) Si NO pasa validación → status='requiere_revision', NO toca colaboradores.
 *   3) Si pasa validación y es estado terminal → UPSERT idempotente en `colaboradores`.
 *   4) Si pasa pero status intermedio → status='recibido', NO toca colaboradores.
 *
 * Reglas de upsert (no machaca lo editado por CH):
 *   - `COALESCE(EXCLUDED.X, colaboradores.X)` → solo escribe si llega valor nuevo.
 *   - Cliente/puesto/fechas de contrato no se pisan si la persona ya está activa en otro cliente.
 *   - Reingreso (activo=false): reactiva, limpia baja y abre contrato nuevo (AUT-313).
 *
 * No depende de DynamoDB: recibe un payload normalizado. El mapper `mapDynamoItemForPromotion`
 * convierte un item Dynamo crudo a payload normalizado.
 */

const { z } = require('zod');
const {
    COLABORADORES_EXTENDED_KEYS,
    COLABORADORES_EXTENDED_COLUMNS,
    normalizeExtendedFieldForDb
} = require('../colaboradores/colaboradoresExtendedColumns');
const { applyLegacyEmergencyParse } = require('../contratacion/extractorToFichaMap');
const { normalizeChListText, normalizeColabTextPatch } = require('./chTextNormalize');
const { resolveClienteOnWrite, loadClientesCanonico } = require('../clientes/clienteCanonWrite');
const {
    decideContractAction,
    filterExtendedForAction,
    loadPersonContractState,
    applyContractEvent
} = require('./colaboradorContratos');

const EXT_SQL_TYPE_BY_KEY = Object.fromEntries(
    (COLABORADORES_EXTENDED_COLUMNS || []).map((c) => [c.key, String(c.sqlType || 'TEXT').toUpperCase()])
);

/** Desenvuelve AttributeValue Dynamo mal aplanado: `{S:'x'}` / `{N:'1'}`. */
function unwrapDynamoishValue(value) {
    if (value == null) return value;
    if (typeof value !== 'object' || Array.isArray(value)) return value;
    if ('S' in value) return value.S;
    if ('N' in value) return value.N;
    if ('BOOL' in value) return value.BOOL;
    if ('NULL' in value) return null;
    return value;
}

/**
 * Sanitiza payload extendido para columnas tipadas de Postgres.
 * Omite valores que no se pueden coerce (evita tumbar el upsert base).
 */
function sanitizeExtendedPayloadForDb(extended) {
    if (!extended || typeof extended !== 'object') return {};
    const out = {};
    for (const [key, raw] of Object.entries(extended)) {
        let v = unwrapDynamoishValue(raw);
        if (v == null || v === '') continue;
        if (typeof v === 'object') continue;
        const sqlType = EXT_SQL_TYPE_BY_KEY[key] || 'TEXT';
        if (sqlType === 'DATE') {
            const d = parseFechaInicioSmart(v);
            if (d) out[key] = d;
            continue;
        }
        if (sqlType === 'INTEGER') {
            const n = parseInt(String(v).replace(/[^\d-]/g, ''), 10);
            if (Number.isFinite(n) && n >= 0 && n < 150) out[key] = n;
            continue;
        }
        const normalized = normalizeExtendedFieldForDb(key, v);
        if (normalized !== undefined && normalized !== null && normalized !== '') {
            out[key] = normalized;
        }
    }
    return out;
}

/** Estados terminales de n8n que disparan el upsert real a `colaboradores`. */
const TERMINAL_STATUSES = new Set([
    'contratado',
    'finalizado',
    'completado',
    'contrato recibido',
    'contrato_recibido',
    'contract_received',
    'hired'
]);

/** Estados que se interpretan como rechazo: solo staging, NO se desactiva colaborador. */
const REJECTED_STATUSES = new Set([
    'rechazado',
    'eliminado',
    'rejected',
    'eliminated'
]);

function normalizeStatus(status) {
    return String(status || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function isTerminalStatus(status) {
    const s = normalizeStatus(status);
    if (!s) return false;
    if (TERMINAL_STATUSES.has(s)) return true;
    if (s.includes('contrato') && (s.includes('recib') || s.includes('firmad'))) return true;
    if (s === 'finalizado' || s === 'completado') return true;
    return false;
}

function isRejectedStatus(status) {
    const s = normalizeStatus(status);
    if (!s) return false;
    if (REJECTED_STATUSES.has(s)) return true;
    if (s.includes('rechaz')) return true;
    if (s.includes('eliminad')) return true;
    return false;
}

/** Solo dígitos. */
function normalizeCedula(value) {
    if (value == null) return '';
    const s = String(value);
    const digits = s.replace(/\D+/g, '');
    return digits;
}

function normalizeEmail(value) {
    if (value == null) return null;
    const s = String(value).trim().toLowerCase();
    return s || null;
}

function trimOrNull(value, maxLen = 1000) {
    if (value == null) return null;
    const s = String(value).trim();
    if (!s) return null;
    return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function normalizePromotionTextFields(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    const out = { ...payload };
    for (const key of ['nombre', 'cliente', 'puesto', 'descriptivo_puesto_sig', 'nombres', 'primer_apellido', 'segundo_apellido']) {
        if (out[key] == null) continue;
        out[key] = key === 'cliente' ? resolveClienteOnWrite(out[key]) : normalizeChListText(out[key]);
    }
    if (out.extended && typeof out.extended === 'object') {
        out.extended = { ...out.extended };
        for (const key of ['nombre', 'cliente', 'puesto', 'descriptivo_puesto_sig']) {
            if (out.extended[key] == null) continue;
            out.extended[key] =
                key === 'cliente' ? resolveClienteOnWrite(out.extended[key]) : normalizeChListText(out.extended[key]);
        }
    }
    return out;
}

/**
 * Construye ISO `YYYY-MM-DD` solo si el calendario es válido (evita 31/02).
 * @param {number} year
 * @param {number} month 1-12
 * @param {number} day 1-31
 */
function toIsoYmd(year, month, day) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
    if (year < 1900 || year > 2999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const dt = new Date(Date.UTC(year, month - 1, day));
    if (
        dt.getUTCFullYear() !== year ||
        dt.getUTCMonth() !== month - 1 ||
        dt.getUTCDate() !== day
    ) {
        return null;
    }
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDateOrNull(value) {
    if (value == null) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }
    const s = String(value).trim();
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    // No usar `new Date('11/03/2026')`: en V8 es MM/DD (EE.UU.) y en Colombia es DD/MM.
    if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(s)) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

function parseNumberOrNull(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const s = String(value).replace(/[^0-9,.\-]/g, '').replace(',', '.');
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

/** Valores centinela que n8n escribe en Dynamo antes de tener el dato real. */
const SENTINEL_VALUES = new Set([
    'cargando',
    'pendiente',
    'pendiente_valor',
    'pendientevalor',
    'no_requerido',
    'no requerido',
    'norequerido',
    'n/a',
    'na',
    'null',
    'undefined',
    'nada',
    'sin dato',
    'sindato',
    ''
]);

const MESES_ES = {
    ene: 1, enero: 1,
    feb: 2, febrero: 2,
    mar: 3, marzo: 3,
    abr: 4, abril: 4,
    may: 5, mayo: 5,
    jun: 6, junio: 6,
    jul: 7, julio: 7,
    ago: 8, agosto: 8,
    sep: 9, sept: 9, septiembre: 9, set: 9, setiembre: 9,
    oct: 10, octubre: 10,
    nov: 11, noviembre: 11,
    dic: 12, diciembre: 12
};

function stripAccentsLower(s) {
    return String(s)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

/**
 * Parser tolerante para `fecha_inicio` tal como la guarda n8n en DynamoDB.
 *
 * Acepta (prioridad):
 * - ISO `YYYY-MM-DD` (con o sin tiempo).
 * - Numérico con separadores **siempre DD/MM/YYYY** (Colombia): `11/03/2026`,
 *   `09-04-2026`, `11.03.2026`. Nunca MM/DD vía `new Date(...)`.
 * - Formato es-ES abreviado: `"may 22, 2026"`, `"dic 31, 2026"`.
 * - Formato largo: `"27 de julio de 2026"`.
 * - Date instance válido.
 *
 * Devuelve `null` ante vacíos, centinelas n8n (`CARGANDO`, `PENDIENTE`, …)
 * o fechas numéricas ambiguas inválidas de calendario.
 */
function parseFechaInicioSmart(value) {
    if (value == null) return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
    }
    const raw = String(value).trim();
    if (!raw) return null;
    const norm = stripAccentsLower(raw);
    if (SENTINEL_VALUES.has(norm)) return null;

    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
        const y = Number(raw.slice(0, 4));
        const m = Number(raw.slice(5, 7));
        const d = Number(raw.slice(8, 10));
        return toIsoYmd(y, m, d);
    }

    // Colombia / n8n histórico: DD/MM/YYYY (también - y .)
    // Ejemplos reales: "11/03/2026" → 2026-03-11 (NO noviembre); "09/04/2026" → 2026-04-09.
    const mNum = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
    if (mNum) {
        let dia = Number(mNum[1]);
        let mes = Number(mNum[2]);
        let anio = Number(mNum[3]);
        if (anio < 100) anio += anio >= 70 ? 1900 : 2000;
        return toIsoYmd(anio, mes, dia);
    }

    // "may 22, 2026" / "dic 31, 2026" (agente extractor abreviado)
    const mEs = norm.match(/^([a-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
    if (mEs) {
        const mes = MESES_ES[mEs[1]];
        const dia = Number(mEs[2]);
        const anio = Number(mEs[3]);
        return toIsoYmd(anio, mes, dia);
    }

    // "27 de julio de 2026" / "28 de julio del 2026" (formato largo n8n)
    const mLargo = norm.match(/^(\d{1,2})\s+de\s+([a-z]{3,})\s+(?:de|del)\s+(\d{4})$/);
    if (mLargo) {
        const dia = Number(mLargo[1]);
        const mes = MESES_ES[mLargo[2]];
        const anio = Number(mLargo[3]);
        return toIsoYmd(anio, mes, dia);
    }

    const fallback = parseDateOrNull(raw);
    if (fallback && /^\d{4}-\d{2}-\d{2}$/.test(fallback)) return fallback;
    return null;
}

/**
 * Parser para salarios en formato n8n / Colombia: `"CO$ 14.200.000"`,
 * `"$2.300.000"`, `"14200000"`. Trata los `.` como separador de miles.
 * Devuelve `null` para centinelas (`PENDIENTE`, etc.) o cadenas sin dígitos.
 */
function parseSalarioCop(value) {
    if (value == null) return null;
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
    const raw = String(value).trim();
    if (!raw) return null;
    const norm = stripAccentsLower(raw);
    if (SENTINEL_VALUES.has(norm)) return null;
    const digits = raw.replace(/[^0-9]/g, '');
    if (!digits) return null;
    const n = Number(digits);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Convierte un item DynamoDB (post-unmarshall) en payload normalizado para promoción.
 * No infiere campos que CH debe completar manualmente (tarifa, EPS/AFP/etc).
 *
 * @param {object} rawItem Item crudo de Dynamo (objeto JS).
 * @returns {object} payload normalizado (campos opcionales pueden ser null/undefined).
 */
function mapDynamoItemForPromotion(rawItem) {
    if (!rawItem || typeof rawItem !== 'object') return { __raw: rawItem };
    const r = rawItem;

    // Nombre completo a partir de combinaciones disponibles
    let nombreFull = trimOrNull(r['nombre y apellido']) ||
        trimOrNull(r.nombre_y_apellido) ||
        trimOrNull(r.nombreCompleto) ||
        null;
    let primerApellido = null;
    let segundoApellido = null;
    let nombres = null;

    if (!nombreFull) {
        const partsNombre = trimOrNull(r.nombre);
        const partsApellido = trimOrNull(r.apellido);
        if (partsNombre && partsApellido) {
            nombreFull = `${partsNombre} ${partsApellido}`.trim();
            nombres = partsNombre;
            const apTokens = String(partsApellido).trim().split(/\s+/);
            primerApellido = apTokens[0] || null;
            segundoApellido = apTokens.length > 1 ? apTokens.slice(1).join(' ') : null;
        } else if (partsNombre) {
            nombreFull = partsNombre;
            nombres = partsNombre;
        } else if (partsApellido) {
            nombreFull = partsApellido;
            primerApellido = partsApellido;
        }
    }

    // Cuando `nombreFull` viene como una sola cadena, intentamos separar nombres / apellidos.
    if (nombreFull && !nombres && !primerApellido) {
        const tokens = String(nombreFull).trim().split(/\s+/);
        if (tokens.length >= 3) {
            // Heurística simple: últimos 2 = apellidos, resto = nombres
            segundoApellido = tokens[tokens.length - 1];
            primerApellido = tokens[tokens.length - 2];
            nombres = tokens.slice(0, tokens.length - 2).join(' ');
        } else if (tokens.length === 2) {
            nombres = tokens[0];
            primerApellido = tokens[1];
        } else if (tokens.length === 1) {
            nombres = tokens[0];
        }
    }

    const cedula = normalizeCedula(r.cedula ?? r['cédula'] ?? r.cedula_identidad ?? r.documento ?? r.documento_identidad);
    const correoCinte = normalizeEmail(r.correo_cinte);
    const emailPersonal = normalizeEmail(r.email_personal) || normalizeEmail(r.email);
    const celular =
        trimOrNull(r.celular_personal) ||
        trimOrNull(r.celular) ||
        trimOrNull(r.whatsapp_numerico) ||
        trimOrNull(r.telefono) ||
        trimOrNull(r.whatsapp) ||
        null;
    const whatsappNumber = trimOrNull(r.whatsapp_number) || trimOrNull(r.whatsappNumber) || null;
    const status = trimOrNull(r.status) || trimOrNull(r.statuses) || null;

    // `fecha_inicio` es el nombre real con que n8n persiste en DynamoDB la fecha
    // pactada de ingreso del consultor (extraída del correo de selección por el
    // "Agente Extractor Ficha", formato es-ES como "may 22, 2026"). Lo aceptamos
    // primero; los otros nombres (`fecha_ingreso`, `fechaIngreso`) se conservan
    // por compat con payloads del webhook /intake o ETLs externos. Ya NO usamos
    // `ts_validacion_completada` como fallback: es el timestamp de cierre
    // administrativo, no la fecha real de inicio.
    const fechaIngreso =
        parseFechaInicioSmart(r.fecha_inicio) ||
        parseFechaInicioSmart(r.fecha_ingreso) ||
        parseFechaInicioSmart(r.fechaIngreso) ||
        null;
    // `salario_numeros` viene de n8n como "CO$ 14.200.000". Lo parseamos con
    // separador de miles "." antes de caer a los nombres genéricos.
    const sueldoNomina =
        parseSalarioCop(r.salario_numeros) ??
        parseNumberOrNull(r.sueldo_nomina ?? r.salario ?? r.salary);
    const tipoContrato = trimOrNull(r.tipo_contrato);
    const esquemaContrato = trimOrNull(r.esquema_contrato);

    const extended = {};
    for (const key of COLABORADORES_EXTENDED_KEYS) {
        if (key === 'montos_divisa') continue;
        const v = r[key];
        if (v == null || v === '') continue;
        if (typeof v === 'object') extended[key] = v;
        else extended[key] = trimOrNull(v, 8000);
    }

    const merged = applyLegacyEmergencyParse({ ...r, ...extended });

    return normalizePromotionTextFields({
        cedula,
        nombre: nombreFull,
        nombres: trimOrNull(merged.nombres) || nombres,
        primer_apellido: trimOrNull(merged.primer_apellido) || primerApellido,
        segundo_apellido: trimOrNull(merged.segundo_apellido) || segundoApellido,
        correo_cinte: correoCinte,
        email_personal: emailPersonal,
        celular_personal: celular,
        direccion_domicilio: trimOrNull(r.direccion) || trimOrNull(r.direccion_domicilio) || null,
        puesto: trimOrNull(r.puesto) || trimOrNull(r.cargo) || trimOrNull(r.Descriptivo_Cinte) || null,
        empleador: trimOrNull(r.empleador) || trimOrNull(r.empresa) || null,
        sueldo_nomina: sueldoNomina,
        cliente: trimOrNull(r.cliente) || trimOrNull(r.cliente_proyecto) || null,
        fecha_ingreso: fechaIngreso,
        tipo_contrato: tipoContrato,
        esquema_contrato: esquemaContrato,
        codigo: trimOrNull(r.codigo) || trimOrNull(r.codigo_opt) || null,
        status,
        whatsapp_number: whatsappNumber,
        dynamo_external_id: whatsappNumber || trimOrNull(r.id) || trimOrNull(r.execution_id) || null,
        extended,
        __raw: r
    });
}

/**
 * Zod schemas. Distinguimos validaciones por escenario:
 *  - intake / dynamo / etl con `forcePromote=false`: requeridos relajados (puede ser solo `cedula`).
 *  - Promoción real (terminal o forcePromote): requeridos estrictos.
 */
const promotionPayloadSchema = z
    .object({
        cedula: z.string().regex(/^\d+$/).min(5).max(20).optional().nullable(),
        nombre: z.string().min(2).max(400).optional().nullable(),
        nombres: z.string().max(400).optional().nullable(),
        primer_apellido: z.string().max(200).optional().nullable(),
        segundo_apellido: z.string().max(200).optional().nullable(),
        correo_cinte: z.string().email().max(320).optional().nullable(),
        email_personal: z.string().email().max(320).optional().nullable(),
        celular_personal: z.string().max(60).optional().nullable(),
        direccion_domicilio: z.string().max(500).optional().nullable(),
        puesto: z.string().max(400).optional().nullable(),
        empleador: z.string().max(200).optional().nullable(),
        sueldo_nomina: z.number().optional().nullable(),
        cliente: z.string().max(500).optional().nullable(),
        fecha_ingreso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
        status: z.string().max(200).optional().nullable(),
        whatsapp_number: z.string().max(60).optional().nullable(),
        dynamo_external_id: z.string().max(120).optional().nullable(),
        tipo_personal: z.enum(['consultor', 'staff', 'sena', 'alianza']).optional()
    })
    .passthrough();

/**
 * Crea el servicio de promoción.
 * @param {{ pool: import('pg').Pool, logger?: any }} deps
 */
function createOnboardingPromotionService({ pool, logger } = {}) {
    if (!pool || typeof pool.query !== 'function') {
        throw new Error('createOnboardingPromotionService requiere `pool` válido.');
    }
    const log = logger && typeof logger.info === 'function' ? logger : null;

    function warn(msg, extra) {
        if (log) log.warn(extra || {}, msg);
        else console.warn('[Onboarding promote]', msg, extra || '');
    }

    /**
     * Inserta una entrada en `onboarding_staging` o reutiliza la existente si coincide la UNIQUE.
     * @returns {Promise<{ stagingId: string, isNew: boolean }>}
     */
    async function upsertStaging(client, { source, externalId, eventType, sequenceNumber, shardId, rawPayload }) {
        const insertQ = await client.query(
            `INSERT INTO onboarding_staging
                (source, external_id, event_type, sequence_number, shard_id, payload, status)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'recibido')
             ON CONFLICT (source, external_id, event_type, sequence_number)
             DO UPDATE SET payload = EXCLUDED.payload
             RETURNING id::text AS id`,
            [
                source,
                externalId || null,
                eventType || 'INSERT',
                sequenceNumber || null,
                shardId || null,
                JSON.stringify(rawPayload || {})
            ]
        );
        return { stagingId: insertQ.rows[0].id, isNew: true };
    }

    async function markStaging(client, stagingId, { status, error, cedula }) {
        await client.query(
            `UPDATE onboarding_staging
             SET status = $1,
                 error = $2,
                 cedula_resultante = COALESCE($3, cedula_resultante),
                 processed_at = NOW()
             WHERE id = $4::uuid`,
            [status, error || null, cedula || null, stagingId]
        );
    }

    /**
     * Hace upsert idempotente en `colaboradores` con los campos disponibles.
     * Usa COALESCE para no machacar valores ya editados por CH.
     */
    async function upsertColaborador(client, payload, { source, tipoPersonal }) {
        const completedAtSql = payload.status && isTerminalStatus(payload.status) ? 'NOW()' : 'NULL';
        const tp = tipoPersonal || payload.tipo_personal || 'consultor';
        /** n8n/Dynamo es fuente de verdad para fecha_ingreso en promoción automática. */
        const fechaFromN8n = source === 'dynamo_stream' || source === 'n8n_webhook' || source === 'manual';
        const insertFechaSql = fechaFromN8n ? '$17::date' : 'COALESCE($17::date, CURRENT_DATE)';

        const q = await client.query(
            `INSERT INTO colaboradores (
                cedula, nombre, primer_apellido, segundo_apellido, nombres,
                correo_cinte, celular_personal, direccion_domicilio,
                puesto, empleador, sueldo_nomina,
                cliente,
                whatsapp_number, dynamo_external_id,
                onboarding_status, onboarding_completed_at,
                tipo_personal, activo, fecha_ingreso, created_at, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5,
                $6, $7, $8,
                $9, $10, $11,
                $12,
                $13, $14,
                $15, ${completedAtSql},
                $16, TRUE, ${insertFechaSql}, NOW(), NOW()
            )
            ON CONFLICT (cedula) DO UPDATE SET
                nombre = COALESCE(NULLIF(EXCLUDED.nombre, ''), colaboradores.nombre),
                primer_apellido = COALESCE(EXCLUDED.primer_apellido, colaboradores.primer_apellido),
                segundo_apellido = COALESCE(EXCLUDED.segundo_apellido, colaboradores.segundo_apellido),
                nombres = COALESCE(EXCLUDED.nombres, colaboradores.nombres),
                correo_cinte = COALESCE(EXCLUDED.correo_cinte, colaboradores.correo_cinte),
                celular_personal = COALESCE(EXCLUDED.celular_personal, colaboradores.celular_personal),
                direccion_domicilio = COALESCE(EXCLUDED.direccion_domicilio, colaboradores.direccion_domicilio),
                puesto = CASE
                    WHEN colaboradores.activo IS FALSE THEN COALESCE(EXCLUDED.puesto, colaboradores.puesto)
                    WHEN EXCLUDED.cliente IS NOT NULL
                         AND lower(btrim(COALESCE(EXCLUDED.cliente, '')))
                             IS DISTINCT FROM lower(btrim(COALESCE(colaboradores.cliente, '')))
                    THEN colaboradores.puesto
                    ELSE COALESCE(EXCLUDED.puesto, colaboradores.puesto)
                END,
                empleador = CASE
                    WHEN colaboradores.activo IS FALSE THEN COALESCE(EXCLUDED.empleador, colaboradores.empleador)
                    WHEN EXCLUDED.cliente IS NOT NULL
                         AND lower(btrim(COALESCE(EXCLUDED.cliente, '')))
                             IS DISTINCT FROM lower(btrim(COALESCE(colaboradores.cliente, '')))
                    THEN colaboradores.empleador
                    ELSE COALESCE(EXCLUDED.empleador, colaboradores.empleador)
                END,
                sueldo_nomina = CASE
                    WHEN colaboradores.activo IS FALSE THEN COALESCE(EXCLUDED.sueldo_nomina, colaboradores.sueldo_nomina)
                    WHEN EXCLUDED.cliente IS NOT NULL
                         AND lower(btrim(COALESCE(EXCLUDED.cliente, '')))
                             IS DISTINCT FROM lower(btrim(COALESCE(colaboradores.cliente, '')))
                    THEN colaboradores.sueldo_nomina
                    ELSE COALESCE(colaboradores.sueldo_nomina, EXCLUDED.sueldo_nomina)
                END,
                fecha_ingreso = CASE
                    WHEN colaboradores.activo IS FALSE THEN COALESCE(EXCLUDED.fecha_ingreso, colaboradores.fecha_ingreso)
                    WHEN EXCLUDED.cliente IS NOT NULL
                         AND lower(btrim(COALESCE(EXCLUDED.cliente, '')))
                             IS DISTINCT FROM lower(btrim(COALESCE(colaboradores.cliente, '')))
                    THEN colaboradores.fecha_ingreso
                    ELSE colaboradores.fecha_ingreso
                END,
                /* Cliente cabecera no cambia si ya hay persona activa con otro cliente (AUT-313). */
                cliente = CASE
                    WHEN colaboradores.activo IS FALSE THEN COALESCE(EXCLUDED.cliente, colaboradores.cliente)
                    ELSE colaboradores.cliente
                END,
                whatsapp_number = COALESCE(EXCLUDED.whatsapp_number, colaboradores.whatsapp_number),
                dynamo_external_id = COALESCE(EXCLUDED.dynamo_external_id, colaboradores.dynamo_external_id),
                onboarding_status = COALESCE(EXCLUDED.onboarding_status, colaboradores.onboarding_status),
                onboarding_completed_at = COALESCE(colaboradores.onboarding_completed_at, EXCLUDED.onboarding_completed_at),
                tipo_personal = COALESCE(EXCLUDED.tipo_personal, colaboradores.tipo_personal),
                activo = CASE
                    WHEN colaboradores.activo IS FALSE THEN TRUE
                    ELSE colaboradores.activo
                END,
                motivo_baja = CASE
                    WHEN colaboradores.activo IS FALSE THEN NULL
                    ELSE colaboradores.motivo_baja
                END,
                fecha_baja_efectiva = CASE
                    WHEN colaboradores.activo IS FALSE THEN NULL
                    ELSE colaboradores.fecha_baja_efectiva
                END,
                termino = CASE
                    WHEN colaboradores.activo IS FALSE THEN NULL
                    ELSE colaboradores.termino
                END,
                updated_at = NOW()
            RETURNING cedula`,
            [
                payload.cedula,
                payload.nombre,
                payload.primer_apellido,
                payload.segundo_apellido,
                payload.nombres,
                payload.correo_cinte,
                payload.celular_personal,
                payload.direccion_domicilio,
                payload.puesto,
                payload.empleador,
                payload.sueldo_nomina,
                payload.cliente,
                payload.whatsapp_number,
                payload.dynamo_external_id,
                payload.status,
                tp,
                payload.fecha_ingreso
            ]
        );
        return q.rows[0] && q.rows[0].cedula ? String(q.rows[0].cedula) : null;
    }

    /**
     * Punto único de promoción.
     *
     * @param {object} rawPayload Item ya mapeado (use `mapDynamoItemForPromotion` antes si viene de Dynamo).
     * @param {'dynamo_stream'|'n8n_webhook'|'excel_etl'|'manual'} source Origen.
     * @param {object} [meta] Metadata adicional.
     * @param {string} [meta.eventType] 'INSERT' | 'MODIFY' | 'REMOVE' | 'BATCH_IMPORT'.
     * @param {string} [meta.sequenceNumber] (solo Dynamo Stream).
     * @param {string} [meta.shardId] (solo Dynamo Stream).
     * @param {boolean} [meta.forcePromote] Forzar upsert aunque status no sea terminal.
     * @param {string} [meta.tipoPersonal] 'consultor' | 'staff' | 'sena' | 'alianza' (default 'consultor').
     * @returns {Promise<{ ok: boolean, status: string, stagingId: string, cedula?: string, error?: string }>}
     */
    async function promoteToColaborador(rawPayload, source, meta = {}) {
        const validSources = new Set(['dynamo_stream', 'n8n_webhook', 'excel_etl', 'manual']);
        if (!validSources.has(source)) {
            throw new Error(`source inválido: ${source}`);
        }
        const eventType = meta.eventType || 'INSERT';

        // Si es REMOVE: no promovemos, solo loggeamos. Las bajas las decide CH.
        if (eventType === 'REMOVE') {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                const { stagingId } = await upsertStaging(client, {
                    source,
                    externalId: rawPayload && (rawPayload.whatsapp_number || rawPayload.dynamo_external_id || rawPayload.cedula),
                    eventType,
                    sequenceNumber: meta.sequenceNumber,
                    shardId: meta.shardId,
                    rawPayload
                });
                await markStaging(client, stagingId, { status: 'rechazado', error: 'REMOVE event' });
                await client.query('COMMIT');
                return { ok: true, status: 'rechazado', stagingId };
            } catch (e) {
                try { await client.query('ROLLBACK'); } catch { /* ignore */ }
                throw e;
            } finally {
                client.release();
            }
        }

        // Validación Zod (relajada): saca defaults útiles
        let validated;
        try {
            validated = promotionPayloadSchema.parse(rawPayload || {});
        } catch (e) {
            // Aún si Zod falla, queremos guardar el raw en staging para inspección
            warn('Zod parse failed; se guarda raw en staging', { error: String(e && e.message) });
            validated = { ...(rawPayload || {}) };
        }

        const externalId =
            validated.whatsapp_number ||
            validated.dynamo_external_id ||
            validated.cedula ||
            (rawPayload && (rawPayload.whatsapp_number || rawPayload.id || rawPayload.email)) ||
            null;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { stagingId } = await upsertStaging(client, {
                source,
                externalId,
                eventType,
                sequenceNumber: meta.sequenceNumber,
                shardId: meta.shardId,
                rawPayload: { ...rawPayload, __validated: validated }
            });

            const status = validated.status;

            // Rechazo: solo marca staging, no toca colaboradores
            if (isRejectedStatus(status)) {
                await markStaging(client, stagingId, { status: 'rechazado', error: `Status rechazado en n8n: ${status}` });
                await client.query('COMMIT');
                return { ok: true, status: 'rechazado', stagingId };
            }

            // Determinar si corresponde upsert
            const shouldUpsert = Boolean(meta.forcePromote) || isTerminalStatus(status);
            if (!shouldUpsert) {
                await markStaging(client, stagingId, { status: 'recibido' });
                await client.query('COMMIT');
                return { ok: true, status: 'recibido', stagingId };
            }

            // Requeridos mínimos para upsert terminal desde n8n/Dynamo.
            // correo_cinte NO es excluyente: n8n no lo envía; CH lo completa después en la ficha
            // (login Entra fallará hasta que exista, pero el colaborador debe aparecer en el maestro).
            const missing = [];
            if (!validated.cedula) missing.push('cedula');
            if (!validated.nombre) missing.push('nombre');

            if (missing.length) {
                const err = `Faltan requeridos: ${missing.join(', ')}`;
                await markStaging(client, stagingId, { status: 'requiere_revision', error: err });
                await client.query('COMMIT');
                return { ok: false, status: 'requiere_revision', stagingId, error: err };
            }

            const normalizedValidated = normalizePromotionTextFields(validated);
            if (normalizedValidated.cliente) {
                const canonList = await loadClientesCanonico(client);
                normalizedValidated.cliente = resolveClienteOnWrite(normalizedValidated.cliente, canonList);
            }
            const prevPerson = await loadPersonContractState(client, normalizedValidated.cedula);
            const contractAction = decideContractAction({
                exists: Boolean(prevPerson),
                activo: prevPerson ? prevPerson.activo !== false : true,
                clienteActual: prevPerson && prevPerson.cliente,
                clienteNuevo: normalizedValidated.cliente
            });

            const cedulaInsertada = await upsertColaborador(client, normalizedValidated, {
                source,
                tipoPersonal: meta.tipoPersonal
            });

            await applyContractEvent(client, {
                cedula: cedulaInsertada,
                cliente: normalizedValidated.cliente,
                tipoContrato: normalizedValidated.tipo_contrato,
                fechaInicio: normalizedValidated.fecha_ingreso,
                fechaTermino: normalizedValidated.fecha_termino
                    || (normalizedValidated.extended && normalizedValidated.extended.fecha_termino),
                origen: `promote_${source}`,
                existed: prevPerson,
                action: contractAction
            });

            const extPayload = filterExtendedForAction(
                normalizeColabTextPatch({
                    cedula: cedulaInsertada,
                    ...sanitizeExtendedPayloadForDb(
                        normalizedValidated.extended && typeof normalizedValidated.extended === 'object'
                            ? normalizedValidated.extended
                            : {}
                    ),
                    email_personal: normalizedValidated.email_personal,
                    codigo: normalizedValidated.codigo,
                    tipo_contrato: normalizedValidated.tipo_contrato,
                    esquema_contrato: normalizedValidated.esquema_contrato
                }),
                contractAction
            );
            if (validated.fecha_ingreso && contractAction !== 'new_client') {
                extPayload.fecha_ingreso = validated.fecha_ingreso;
            }
            const updatable = buildExtendedUpdate(extPayload, cedulaInsertada);
            if (updatable.cols.length) {
                await client.query(
                    `UPDATE colaboradores SET ${updatable.cols.join(', ')}, updated_at = NOW()
                     WHERE cedula = $1`,
                    [cedulaInsertada, ...updatable.values]
                );
            }

            await markStaging(client, stagingId, { status: 'aplicado', cedula: cedulaInsertada });
            await client.query('COMMIT');
            return { ok: true, status: 'aplicado', stagingId, cedula: cedulaInsertada };
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch { /* ignore */ }
            warn('promoteToColaborador failed', { error: String(e && e.message), source });
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Helper para casos donde el ETL del Excel ya tiene un payload completo (no necesita
     * pasar por validación estricta de Zod). Hace upsert directo en `colaboradores`
     * usando las columnas extendidas adicionales si vienen.
     *
     * @param {object} extendedPayload Payload con cualquier campo extendido (`tarifa_cliente`, `eps`, etc).
     * @param {{ tipoPersonal?: string, activo?: boolean, source?: string }} [opts]
     */
    async function upsertColaboradorExtended(extendedPayload, opts = {}) {
        const source = opts.source || 'excel_etl';
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { stagingId } = await upsertStaging(client, {
                source,
                externalId: extendedPayload.cedula,
                eventType: 'BATCH_IMPORT',
                rawPayload: extendedPayload
            });

            // Para ETL: insertamos cédula y luego dejamos que un UPDATE separado actualice las
            // columnas extendidas (evitamos generar un INSERT enorme con 80 columnas).
            const cedulaNorm = normalizeCedula(extendedPayload.cedula);
            if (!cedulaNorm) {
                await markStaging(client, stagingId, { status: 'requiere_revision', error: 'cedula vacía o no numérica' });
                await client.query('COMMIT');
                return { ok: false, status: 'requiere_revision', stagingId, error: 'cedula vacía o no numérica' };
            }

            const nombreVal = normalizeChListText(trimOrNull(extendedPayload.nombre) || 'SIN NOMBRE');
            const activo = opts.activo !== undefined ? Boolean(opts.activo) : true;
            const tp = opts.tipoPersonal || extendedPayload.tipo_personal || 'consultor';

            await client.query(
                `INSERT INTO colaboradores (cedula, nombre, activo, tipo_personal, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, NOW(), NOW())
                 ON CONFLICT (cedula) DO UPDATE SET
                    nombre = COALESCE(NULLIF(EXCLUDED.nombre, ''), colaboradores.nombre),
                    /* activo SE puede actualizar desde ETL (es la fuente histórica) */
                    activo = EXCLUDED.activo,
                    tipo_personal = COALESCE(EXCLUDED.tipo_personal, colaboradores.tipo_personal),
                    updated_at = NOW()`,
                [cedulaNorm, nombreVal, activo, tp]
            );

            // Update granular de columnas presentes en el payload extendido
            const updatable = buildExtendedUpdate(extendedPayload, cedulaNorm);
            if (updatable.cols.length) {
                await client.query(
                    `UPDATE colaboradores SET ${updatable.cols.join(', ')}, updated_at = NOW()
                     WHERE cedula = $1`,
                    [cedulaNorm, ...updatable.values]
                );
            }

            await markStaging(client, stagingId, { status: 'aplicado', cedula: cedulaNorm });
            await client.query('COMMIT');
            return { ok: true, status: 'aplicado', stagingId, cedula: cedulaNorm };
        } catch (e) {
            try { await client.query('ROLLBACK'); } catch { /* ignore */ }
            throw e;
        } finally {
            client.release();
        }
    }

    return {
        promoteToColaborador,
        upsertColaboradorExtended,
        mapDynamoItemForPromotion,
        isTerminalStatus,
        isRejectedStatus,
        normalizeCedula
    };
}

/**
 * Construye un UPDATE granular dinámico para columnas extendidas presentes en el payload.
 * Se ejecuta SOLO con campos no-null. Salta `cedula` (PK) y `created_at`.
 *
 * @returns {{ cols: string[], values: any[] }} `cols` ya incluye el `$N` correspondiente.
 */
function buildExtendedUpdate(payload, cedula) {
    const skip = new Set(['cedula', 'nombre', 'activo', 'tipo_personal', 'created_at', '__raw']);
    const cols = [];
    const values = [];
    let idx = 2; // $1 = cedula en WHERE
    for (const [key, val] of Object.entries(payload || {})) {
        if (skip.has(key)) continue;
        if (val === undefined) continue;
        // Aceptamos null para limpiar el campo
        cols.push(`${key} = $${idx}`);
        values.push(val);
        idx += 1;
    }
    return { cols, values };
}

module.exports = {
    createOnboardingPromotionService,
    mapDynamoItemForPromotion,
    parseFechaInicioSmart,
    isTerminalStatus,
    isRejectedStatus,
    TERMINAL_STATUSES,
    REJECTED_STATUSES
};
