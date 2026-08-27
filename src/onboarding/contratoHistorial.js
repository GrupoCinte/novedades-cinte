'use strict';

const { COLABORADORES_EXTENDED_COLUMNS } = require('../colaboradores/colaboradoresExtendedColumns');

const HISTORIAL_FIELDS = [
    { key: 'cliente', label: 'Cliente' },
    { key: 'tipo_contrato', label: 'Tipo de contrato' },
    { key: 'fecha_inicio', label: 'Fecha de inicio' },
    { key: 'fecha_termino', label: 'Fecha de término' },
    { key: 'esquema_contrato', label: 'Esquema' },
    { key: 'tarifa_cliente', label: 'Tarifa' },
    { key: 'costo_empresa', label: 'Costo empresa' },
    { key: 'vigente', label: 'Estado del contrato' }
];

const BASE_FICHA_LABELS = {
    nombre: 'Nombre',
    correo_cinte: 'Correo Cinte',
    cliente: 'Cliente',
    lider_catalogo: 'Líder',
    activo: 'Activo',
    tipo_personal: 'Tipo de personal',
    motivo_baja: 'Motivo de baja',
    termino: 'Término',
    gp_user_id: 'GP asignado'
};

const SKIP_FICHA_KEYS = new Set([
    'cedula',
    'id',
    'created_at',
    'updated_at',
    'edad',
    'tiempo_permanencia_meses',
    'contratos',
    'historial',
    'contratos_vigentes_count',
    'contratos_vigentes',
    'cliente',
    'tipo_contrato',
    'fecha_ingreso',
    'fecha_termino',
    'fecha_inicio',
    'vigente',
    'tipo_personal'
]);

const FIELD_BY_KEY = new Map([
    ...HISTORIAL_FIELDS.map((f) => [f.key, f]),
    ...COLABORADORES_EXTENDED_COLUMNS.map((c) => [c.key, { key: c.key, label: c.label, sqlType: c.sqlType }]),
    ...Object.entries(BASE_FICHA_LABELS).map(([key, label]) => [key, { key, label }])
]);

const DATE_KEYS = new Set([
    'fecha_inicio',
    'fecha_termino',
    ...COLABORADORES_EXTENDED_COLUMNS.filter((c) => c.sqlType === 'DATE').map((c) => c.key)
]);
const MONEY_KEYS = new Set(
    COLABORADORES_EXTENDED_COLUMNS.filter((c) => String(c.sqlType).startsWith('NUMERIC')).map((c) => c.key)
);
const BOOL_KEYS = new Set([
    'activo',
    'vigente',
    ...COLABORADORES_EXTENDED_COLUMNS.filter((c) => c.sqlType === 'BOOLEAN').map((c) => c.key)
]);
const JSON_KEYS = new Set(
    COLABORADORES_EXTENDED_COLUMNS.filter((c) => c.sqlType === 'JSONB').map((c) => c.key)
);

function asUuid(value) {
    const s = String(value || '').trim();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)) return s;
    return null;
}

function isoDate(value) {
    if (!value && value !== 0) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return s;
}

function normalizeMoney(value) {
    if (value == null || value === '') return '';
    const n = Number(value);
    if (!Number.isFinite(n)) return String(value).trim();
    return String(n);
}

function normalizeEstado(value) {
    if (value === true || value === 'true' || value === 'Vigente') return 'Vigente';
    if (value === false || value === 'false' || value === 'Cerrado') return 'Cerrado';
    if (value == null || value === '') return '';
    return String(value).trim();
}

function normalizeJson(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'string') {
        try {
            return JSON.stringify(JSON.parse(value));
        } catch {
            return value.trim();
        }
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function normalizeHistorialValue(campo, value) {
    if (campo === 'vigente') return normalizeEstado(value);
    if (BOOL_KEYS.has(campo)) {
        if (value === true || value === 'true' || value === '1') return 'Sí';
        if (value === false || value === 'false' || value === '0') return 'No';
        if (value == null || value === '') return '';
        return String(value).trim();
    }
    if (DATE_KEYS.has(campo) || campo === 'fecha_inicio' || campo === 'fecha_termino') return isoDate(value);
    if (MONEY_KEYS.has(campo) || campo === 'tarifa_cliente' || campo === 'costo_empresa') return normalizeMoney(value);
    if (JSON_KEYS.has(campo)) return normalizeJson(value);
    if (value == null) return '';
    return String(value).trim();
}

function labelForCampo(campo) {
    const hit = FIELD_BY_KEY.get(campo);
    return hit ? hit.label : campo;
}

function snapshotFromContratoRow(row) {
    if (!row || typeof row !== 'object') return {};
    return {
        cliente: row.cliente,
        tipo_contrato: row.tipo_contrato != null ? row.tipo_contrato : row.tipo,
        fecha_inicio: row.fecha_inicio != null ? row.fecha_inicio : row.fechaInicio,
        fecha_termino: row.fecha_termino != null ? row.fecha_termino : row.fechaTermino,
        esquema_contrato: row.esquema_contrato,
        tarifa_cliente: row.tarifa_cliente,
        costo_empresa: row.costo_empresa,
        vigente: row.vigente
    };
}

function moneySnapshotFromPerson(row) {
    if (!row || typeof row !== 'object') return {};
    return {
        esquema_contrato: row.esquema_contrato,
        tarifa_cliente: row.tarifa_cliente,
        costo_empresa: row.costo_empresa
    };
}

function actorFromUser(user, { fallbackNombre = 'Sistema' } = {}) {
    if (!user || typeof user !== 'object') {
        return { userId: null, nombre: fallbackNombre, email: null, role: null };
    }
    const email = user.email ? String(user.email).trim() : '';
    const nombre = String(user.name || user.full_name || email || fallbackNombre).trim() || fallbackNombre;
    return {
        userId: asUuid(user.sub || user.id || user.userId),
        nombre,
        email: email || null,
        role: user.role ? String(user.role) : null
    };
}

function keysForFichaDiff(prev, next, onlyKeys) {
    if (Array.isArray(onlyKeys) && onlyKeys.length) {
        return onlyKeys.filter((key) => !SKIP_FICHA_KEYS.has(key) && !String(key).startsWith('_'));
    }
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(next);
    if (!prevKeys.length) return nextKeys;
    if (!nextKeys.length) return prevKeys;
    return nextKeys.filter((key) => Object.prototype.hasOwnProperty.call(prev, key));
}

function diffFichaSnapshots(before, after, { onlyKeys } = {}) {
    const prev = before && typeof before === 'object' ? before : {};
    const next = after && typeof after === 'object' ? after : {};
    const keys = keysForFichaDiff(prev, next, onlyKeys);
    const rows = [];
    for (const key of keys) {
        if (SKIP_FICHA_KEYS.has(key)) continue;
        if (key.startsWith('_')) continue;
        const valorAntes = normalizeHistorialValue(key, prev[key]);
        const valorDespues = normalizeHistorialValue(key, next[key]);
        if (valorAntes === valorDespues) continue;
        rows.push({
            campo: key,
            campoLabel: labelForCampo(key),
            valorAntes,
            valorDespues
        });
    }
    rows.sort((a, b) => a.campoLabel.localeCompare(b.campoLabel, 'es'));
    return rows;
}

function diffContractSnapshots(before, after) {
    const prev = before && typeof before === 'object' ? before : {};
    const next = after && typeof after === 'object' ? after : {};
    const rows = [];
    for (const field of HISTORIAL_FIELDS) {
        const valorAntes = normalizeHistorialValue(field.key, prev[field.key]);
        const valorDespues = normalizeHistorialValue(field.key, next[field.key]);
        if (valorAntes === valorDespues) continue;
        rows.push({
            campo: field.key,
            campoLabel: field.label,
            valorAntes,
            valorDespues
        });
    }
    return rows;
}

function toApiHistorial(row) {
    if (!row) return null;
    const campo = String(row.campo || '');
    return {
        id: String(row.id),
        contratoId: String(row.contrato_id || row.contratoId || ''),
        campo,
        campoLabel: row.campo_label || row.campoLabel || labelForCampo(campo),
        valorAntes: row.valor_antes != null ? String(row.valor_antes) : row.valorAntes != null ? String(row.valorAntes) : '',
        valorDespues: row.valor_despues != null ? String(row.valor_despues) : row.valorDespues != null ? String(row.valorDespues) : '',
        actorNombre: row.actor_nombre || row.actorNombre || 'Sistema',
        actorEmail: row.actor_email || row.actorEmail || null,
        origen: row.origen || null,
        createdAt: row.created_at || row.createdAt || null
    };
}

async function ensureColaboradorContratoHistorialTable(pool, logger) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS colaborador_contrato_historial (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                contrato_id     UUID NOT NULL REFERENCES colaborador_contratos(id) ON DELETE CASCADE,
                cedula          TEXT NOT NULL,
                campo           TEXT NOT NULL,
                valor_antes     TEXT NULL,
                valor_despues   TEXT NULL,
                actor_user_id   UUID NULL,
                actor_nombre    TEXT NULL,
                actor_email     TEXT NULL,
                actor_role      TEXT NULL,
                origen          TEXT NULL,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_colab_contrato_hist_contrato
            ON colaborador_contrato_historial (contrato_id, created_at DESC)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_colab_contrato_hist_cedula
            ON colaborador_contrato_historial (cedula, created_at DESC)
        `);
        await pool.query(`
            ALTER TABLE colaborador_contrato_historial
            ALTER COLUMN contrato_id DROP NOT NULL
        `);
    } catch (error) {
        if (String(error?.code || '') === '42501') {
            if (logger && typeof logger.warn === 'function') {
                logger.warn('[Onboarding] Permisos insuficientes para colaborador_contrato_historial.');
            }
            return;
        }
        throw error;
    }
}

async function insertHistorialRows(db, rows) {
    const list = Array.isArray(rows) ? rows : [];
    const inClientTx = typeof db.release === 'function';
    for (const row of list) {
        if (inClientTx) {
            await db.query('SAVEPOINT contrato_hist_w');
        }
        try {
            await db.query(
                `INSERT INTO colaborador_contrato_historial (
                    contrato_id, cedula, campo, valor_antes, valor_despues,
                    actor_user_id, actor_nombre, actor_email, actor_role, origen
                 ) VALUES ($1::uuid, $2, $3, $4, $5, $6::uuid, $7, $8, $9, $10)`,
                [
                    row.contratoId || null,
                    row.cedula,
                    row.campo,
                    row.valorAntes || null,
                    row.valorDespues || null,
                    asUuid(row.actor && row.actor.userId),
                    (row.actor && row.actor.nombre) || 'Sistema',
                    (row.actor && row.actor.email) || null,
                    (row.actor && row.actor.role) || null,
                    row.origen || null
                ]
            );
            if (inClientTx) {
                await db.query('RELEASE SAVEPOINT contrato_hist_w');
            }
        } catch (error) {
            if (inClientTx) {
                try {
                    await db.query('ROLLBACK TO SAVEPOINT contrato_hist_w');
                } catch {
                    /* la transacción padre sigue usable */
                }
            }
            throw error;
        }
    }
}

async function recordContratoDiff(db, {
    contratoId,
    cedula,
    before,
    after,
    actor,
    origen
} = {}) {
    const id = String(contratoId || '').trim();
    const ced = String(cedula || '').replace(/\D/g, '');
    if (!id || !ced) return [];
    const diffs = diffContractSnapshots(before, after);
    if (!diffs.length) return [];
    const rows = diffs.map((d) => ({
        contratoId: id,
        cedula: ced,
        campo: d.campo,
        valorAntes: d.valorAntes,
        valorDespues: d.valorDespues,
        actor: actor || actorFromUser(null),
        origen: origen || null
    }));
    try {
        await insertHistorialRows(db, rows);
    } catch (error) {
        console.warn('[Onboarding] historial de contrato omitido:', error.message);
        return [];
    }
    return diffs;
}

async function findCabeceraId(db, cedula) {
    const ced = String(cedula || '').replace(/\D/g, '');
    if (!ced) return null;
    const q = await db.query(
        `SELECT id FROM colaborador_contratos
         WHERE cedula = $1 AND es_cabecera IS TRUE
         LIMIT 1`,
        [ced]
    );
    return q.rows[0] ? String(q.rows[0].id) : null;
}

async function recordFichaDiff(db, { cedula, before, after, actor, origen, contratoId, onlyKeys } = {}) {
    const ced = String(cedula || '').replace(/\D/g, '');
    if (!ced) return [];
    const diffs = diffFichaSnapshots(before, after, { onlyKeys });
    if (!diffs.length) return [];
    const rows = diffs.map((d) => ({
        contratoId: contratoId || null,
        cedula: ced,
        campo: d.campo,
        valorAntes: d.valorAntes,
        valorDespues: d.valorDespues,
        actor: actor || actorFromUser(null),
        origen: origen || 'ficha'
    }));
    try {
        await insertHistorialRows(db, rows);
    } catch (error) {
        console.warn('[Onboarding] historial de ficha omitido:', error.message);
        return [];
    }
    return diffs;
}

async function recordCabeceraMoneyDiff(db, { cedula, before, after, actor, origen } = {}) {
    return recordFichaDiff(db, { cedula, before, after, actor, origen });
}

async function listHistorialByCedula(db, cedula) {
    const map = new Map();
    const ced = String(cedula || '').replace(/\D/g, '');
    if (!ced) return map;
    try {
        const q = await db.query(
            `SELECT id, contrato_id, cedula, campo, valor_antes, valor_despues,
                    actor_user_id, actor_nombre, actor_email, actor_role, origen, created_at
             FROM colaborador_contrato_historial
             WHERE cedula = $1
             ORDER BY created_at DESC, id DESC`,
            [ced]
        );
        for (const row of q.rows || []) {
            const key = row.contrato_id ? String(row.contrato_id) : '';
            const list = map.get(key) || [];
            const item = toApiHistorial(row);
            if (item) list.push(item);
            map.set(key, list);
        }
    } catch (error) {
        console.warn('[Onboarding] no se pudo leer historial de contratos:', error.message);
    }
    return map;
}

function flattenHistorialMap(map) {
    const all = [];
    for (const list of map.values()) all.push(...list);
    all.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return all;
}

module.exports = {
    HISTORIAL_FIELDS,
    actorFromUser,
    diffContractSnapshots,
    diffFichaSnapshots,
    ensureColaboradorContratoHistorialTable,
    flattenHistorialMap,
    labelForCampo,
    listHistorialByCedula,
    moneySnapshotFromPerson,
    normalizeHistorialValue,
    recordCabeceraMoneyDiff,
    recordContratoDiff,
    recordFichaDiff,
    snapshotFromContratoRow,
    toApiHistorial
};
