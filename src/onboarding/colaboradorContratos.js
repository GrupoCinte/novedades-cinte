'use strict';

const { foldForMatch } = require('../cotizador/clienteNombreMatch');

const CONTRATOS_VIGENTES_COUNT_SQL = `(
    SELECT COUNT(*)::int
    FROM colaborador_contratos cc
    WHERE cc.cedula = c.cedula
      AND cc.vigente IS TRUE
)`;

/** Campos de contrato que no deben pisar la cabecera cuando entra un cliente distinto. */
const CONTRACT_PERSON_KEYS = [
    'cliente',
    'cliente_proyecto',
    'fecha_ingreso',
    'fecha_termino',
    'tipo_contrato',
    'esquema_contrato',
    'duracion_servicio',
    'puesto',
    'descriptivo_puesto_sig',
    'sueldo_nomina',
    'tarifa_cliente',
    'costo_empresa',
    'utilidad',
    'empleador',
    'lider_catalogo'
];

function normalizeCedula(value) {
    return String(value || '').replace(/\D/g, '');
}

function trimCliente(value) {
    return String(value || '').trim();
}

function isoDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    return null;
}

function sameCliente(a, b) {
    const fa = foldForMatch(a);
    const fb = foldForMatch(b);
    return Boolean(fa) && fa === fb;
}

/**
 * Decide qué hacer con el contrato a partir del estado ANTERIOR de la persona.
 * @returns {'insert_first'|'extend'|'new_client'|'reingreso'|'identity_only'}
 */
function decideContractAction({ exists, activo, clienteActual, clienteNuevo }) {
    const nuevo = trimCliente(clienteNuevo);
    if (!exists) return nuevo ? 'insert_first' : 'identity_only';
    if (activo === false) return 'reingreso';
    if (!nuevo) return 'identity_only';
    if (sameCliente(clienteActual, nuevo)) return 'extend';
    return 'new_client';
}

function filterExtendedForAction(payload, action) {
    if (!payload || typeof payload !== 'object') return {};
    if (action !== 'new_client') return { ...payload };
    const out = { ...payload };
    for (const key of CONTRACT_PERSON_KEYS) delete out[key];
    return out;
}

function toApiContrato(row) {
    if (!row) return null;
    return {
        id: String(row.id),
        cliente: trimCliente(row.cliente) || 'Sin cliente',
        tipo: row.tipo_contrato ? String(row.tipo_contrato).trim() : '',
        tipo_contrato: row.tipo_contrato ? String(row.tipo_contrato).trim() : '',
        fechaInicio: isoDate(row.fecha_inicio),
        fecha_inicio: isoDate(row.fecha_inicio),
        fechaTermino: isoDate(row.fecha_termino),
        fecha_termino: isoDate(row.fecha_termino),
        vigente: row.vigente !== false,
        esCabecera: row.es_cabecera === true,
        es_cabecera: row.es_cabecera === true,
        origen: row.origen || null
    };
}

async function ensureColaboradorContratosTable(pool, logger) {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS colaborador_contratos (
                id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                cedula          TEXT NOT NULL REFERENCES colaboradores(cedula) ON DELETE CASCADE,
                cliente         TEXT NOT NULL,
                tipo_contrato   TEXT NULL,
                fecha_inicio    DATE NULL,
                fecha_termino   DATE NULL,
                vigente         BOOLEAN NOT NULL DEFAULT TRUE,
                es_cabecera     BOOLEAN NOT NULL DEFAULT FALSE,
                origen          TEXT NULL,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await pool.query(
            `CREATE INDEX IF NOT EXISTS idx_colaborador_contratos_cedula
             ON colaborador_contratos (cedula)`
        );
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS uq_colaborador_contratos_cabecera
            ON colaborador_contratos (cedula)
            WHERE es_cabecera IS TRUE
        `);
        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS uq_colaborador_contratos_vigente_cliente
            ON colaborador_contratos (cedula, lower(btrim(cliente)))
            WHERE vigente IS TRUE
        `);
        await seedContratosFromColaboradores(pool);
    } catch (error) {
        if (String(error?.code || '') === '42501') {
            if (logger && typeof logger.warn === 'function') {
                logger.warn('[Onboarding] Permisos insuficientes para colaborador_contratos.');
            }
            return;
        }
        throw error;
    }
}

async function seedContratosFromColaboradores(pool) {
    await pool.query(`
        INSERT INTO colaborador_contratos (
            cedula, cliente, tipo_contrato, fecha_inicio, fecha_termino,
            vigente, es_cabecera, origen
        )
        SELECT
            c.cedula,
            btrim(c.cliente),
            NULLIF(btrim(COALESCE(c.tipo_contrato, '')), ''),
            c.fecha_ingreso,
            c.fecha_termino,
            (c.activo IS TRUE AND c.motivo_baja IS NULL),
            TRUE,
            'seed'
        FROM colaboradores c
        WHERE btrim(COALESCE(c.cliente, '')) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM colaborador_contratos x WHERE x.cedula = c.cedula
          )
    `);
}

async function loadPersonContractState(db, cedula) {
    const ced = normalizeCedula(cedula);
    if (!ced) return null;
    const q = await db.query(
        `SELECT cedula, activo, cliente, fecha_ingreso, fecha_termino, tipo_contrato, motivo_baja
         FROM colaboradores
         WHERE cedula = $1
         LIMIT 1`,
        [ced]
    );
    return q.rows[0] || null;
}

async function listContratosByCedula(db, cedula) {
    const ced = normalizeCedula(cedula);
    if (!ced) return [];
    const q = await db.query(
        `SELECT id, cedula, cliente, tipo_contrato, fecha_inicio, fecha_termino,
                vigente, es_cabecera, origen
         FROM colaborador_contratos
         WHERE cedula = $1
         ORDER BY es_cabecera DESC, vigente DESC, fecha_inicio DESC NULLS LAST, created_at DESC`,
        [ced]
    );
    return (q.rows || []).map(toApiContrato).filter(Boolean);
}

function filterContratosByClientes(contratos, clientesScope) {
    const list = Array.isArray(contratos) ? contratos : [];
    if (!Array.isArray(clientesScope) || clientesScope.length === 0) return list;
    const folds = new Set(clientesScope.map((c) => foldForMatch(c)).filter(Boolean));
    if (!folds.size) return list;
    return list.filter((c) => folds.has(foldForMatch(c && c.cliente)));
}

function contratosVigentesCountSql({ clientesParamIndex } = {}) {
    if (!clientesParamIndex) return CONTRATOS_VIGENTES_COUNT_SQL;
    return `(
        SELECT COUNT(*)::int
        FROM colaborador_contratos cc
        WHERE cc.cedula = c.cedula
          AND cc.vigente IS TRUE
          AND LOWER(TRIM(cc.cliente)) = ANY($${clientesParamIndex}::text[])
    )`;
}

async function attachContratosToItem(db, item, { clientesScope } = {}) {
    if (!item || !item.cedula) return item;
    const contratos = filterContratosByClientes(
        await listContratosByCedula(db, item.cedula),
        clientesScope
    );
    item.contratos = contratos;
    item.contratos_vigentes_count = contratos.filter((c) => c.vigente).length;
    return item;
}

async function findCabecera(db, cedula) {
    const q = await db.query(
        `SELECT id, cedula, cliente, tipo_contrato, fecha_inicio, fecha_termino,
                vigente, es_cabecera, origen
         FROM colaborador_contratos
         WHERE cedula = $1
           AND es_cabecera IS TRUE
         LIMIT 1`,
        [cedula]
    );
    return q.rows[0] || null;
}

async function findVigenteByCliente(db, cedula, cliente) {
    const q = await db.query(
        `SELECT id, cedula, cliente, tipo_contrato, fecha_inicio, fecha_termino,
                vigente, es_cabecera, origen
         FROM colaborador_contratos
         WHERE cedula = $1
           AND vigente IS TRUE
           AND lower(btrim(cliente)) = lower(btrim($2))
         LIMIT 1`,
        [cedula, cliente]
    );
    return q.rows[0] || null;
}

async function historicizeVigentes(db, cedula, { keepCabecera = false } = {}) {
    const ced = normalizeCedula(cedula);
    if (!ced) return 0;
    const q = await db.query(
        `UPDATE colaborador_contratos
         SET vigente = FALSE,
             es_cabecera = CASE WHEN $2 THEN es_cabecera ELSE FALSE END,
             updated_at = NOW()
         WHERE cedula = $1
           AND vigente IS TRUE
         RETURNING id`,
        [ced, keepCabecera === true]
    );
    return q.rowCount || 0;
}

async function insertContratoSafe(db, input) {
    try {
        return await insertContrato(db, input);
    } catch (error) {
        if (String(error?.code) !== '23505') throw error;
        const cedula = input.cedula;
        const existing = (input.esCabecera && (await findCabecera(db, cedula)))
            || (input.cliente && (await findVigenteByCliente(db, cedula, input.cliente)));
        if (existing) {
            await updateContratoTermino(db, existing.id, input);
            return existing;
        }
        throw error;
    }
}

async function insertContrato(db, {
    cedula,
    cliente,
    tipoContrato,
    fechaInicio,
    fechaTermino,
    vigente = true,
    esCabecera = false,
    origen
}) {
    const q = await db.query(
        `INSERT INTO colaborador_contratos (
            cedula, cliente, tipo_contrato, fecha_inicio, fecha_termino,
            vigente, es_cabecera, origen
         ) VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $8)
         RETURNING id, cedula, cliente, tipo_contrato, fecha_inicio, fecha_termino,
                   vigente, es_cabecera, origen`,
        [
            cedula,
            cliente,
            tipoContrato || null,
            isoDate(fechaInicio),
            isoDate(fechaTermino),
            vigente !== false,
            esCabecera === true,
            origen || null
        ]
    );
    return q.rows[0] || null;
}

async function updateContratoTermino(db, id, { fechaTermino, tipoContrato, fechaInicio }) {
    await db.query(
        `UPDATE colaborador_contratos
         SET fecha_termino = COALESCE($2::date, fecha_termino),
             tipo_contrato = COALESCE($3, tipo_contrato),
             fecha_inicio = COALESCE($4::date, fecha_inicio),
             updated_at = NOW()
         WHERE id = $1::uuid`,
        [id, isoDate(fechaTermino), tipoContrato || null, isoDate(fechaInicio)]
    );
}

async function updatePersonCabeceraSnapshot(db, cedula, {
    cliente,
    tipoContrato,
    fechaInicio,
    fechaTermino,
    reactivate = false
}) {
    const sets = ['updated_at = NOW()'];
    const vals = [];
    let i = 1;
    if (cliente) {
        sets.push(`cliente = $${i++}`);
        vals.push(cliente);
    }
    if (tipoContrato !== undefined) {
        sets.push(`tipo_contrato = $${i++}`);
        vals.push(tipoContrato || null);
    }
    if (fechaInicio !== undefined) {
        sets.push(`fecha_ingreso = COALESCE($${i++}::date, fecha_ingreso)`);
        vals.push(isoDate(fechaInicio));
    }
    if (fechaTermino !== undefined) {
        sets.push(`fecha_termino = $${i++}::date`);
        vals.push(isoDate(fechaTermino));
    }
    if (reactivate) {
        sets.push('activo = TRUE');
        sets.push('motivo_baja = NULL');
        sets.push('fecha_baja_efectiva = NULL');
        sets.push('termino = NULL');
    }
    vals.push(cedula);
    await db.query(
        `UPDATE colaboradores SET ${sets.join(', ')} WHERE cedula = $${i}`,
        vals
    );
}

/**
 * Aplica la política de contratos usando el estado ANTERIOR de la persona.
 * @param {import('pg').Pool | import('pg').PoolClient} db
 */
async function applyContractEvent(db, input = {}) {
    const cedula = normalizeCedula(input.cedula);
    const cliente = trimCliente(input.cliente);
    if (!cedula) return { action: 'identity_only', contrato: null };

    const existed = input.existed !== undefined
        ? input.existed
        : await loadPersonContractState(db, cedula);
    const action = input.action || decideContractAction({
        exists: Boolean(existed),
        activo: existed ? existed.activo !== false : true,
        clienteActual: existed && existed.cliente,
        clienteNuevo: cliente
    });

    const payload = {
        cedula,
        cliente,
        tipoContrato: input.tipoContrato || input.tipo_contrato || null,
        fechaInicio: input.fechaInicio || input.fecha_ingreso || null,
        fechaTermino: input.fechaTermino || input.fecha_termino || null,
        origen: input.origen || 'promote'
    };

    if (action === 'identity_only') {
        return { action, contrato: null };
    }

    if (action === 'extend') {
        const vigente = cliente ? await findVigenteByCliente(db, cedula, cliente) : null;
        if (vigente) {
            await updateContratoTermino(db, vigente.id, {
                fechaTermino: payload.fechaTermino,
                tipoContrato: payload.tipoContrato
            });
            if (vigente.es_cabecera) {
                await updatePersonCabeceraSnapshot(db, cedula, {
                    fechaTermino: payload.fechaTermino,
                    tipoContrato: payload.tipoContrato
                });
            }
            return { action, contrato: toApiContrato({ ...vigente, ...payload, es_cabecera: vigente.es_cabecera }) };
        }
        const cabecera = await findCabecera(db, cedula);
        if (cabecera && (!cliente || sameCliente(cabecera.cliente, cliente))) {
            await updateContratoTermino(db, cabecera.id, {
                fechaTermino: payload.fechaTermino,
                tipoContrato: payload.tipoContrato
            });
            return { action: 'extend', contrato: toApiContrato(cabecera) };
        }
        const inserted = await insertContratoSafe(db, {
            ...payload,
            vigente: true,
            esCabecera: !cabecera && !existed,
            origen: payload.origen
        });
        return { action: existed ? 'extend' : 'insert_first', contrato: toApiContrato(inserted) };
    }

    if (action === 'new_client') {
        if (!cliente) return { action: 'identity_only', contrato: null };
        const already = await findVigenteByCliente(db, cedula, cliente);
        if (already) {
            await updateContratoTermino(db, already.id, {
                fechaTermino: payload.fechaTermino,
                tipoContrato: payload.tipoContrato
            });
            return { action: 'extend', contrato: toApiContrato(already) };
        }
        const inserted = await insertContratoSafe(db, {
            ...payload,
            vigente: true,
            esCabecera: false,
            origen: payload.origen
        });
        return { action, contrato: toApiContrato(inserted) };
    }

    if (action === 'reingreso') {
        await historicizeVigentes(db, cedula, { keepCabecera: false });
        let contrato = null;
        if (cliente) {
            contrato = toApiContrato(await insertContratoSafe(db, {
                ...payload,
                vigente: true,
                esCabecera: true,
                origen: payload.origen || 'reingreso'
            }));
        }
        await updatePersonCabeceraSnapshot(db, cedula, {
            cliente: cliente || undefined,
            tipoContrato: payload.tipoContrato,
            fechaInicio: payload.fechaInicio,
            fechaTermino: payload.fechaTermino,
            reactivate: true
        });
        return { action, contrato };
    }

    // insert_first
    if (!cliente) return { action: 'identity_only', contrato: null };
    const already = await findVigenteByCliente(db, cedula, cliente);
    if (already) {
        await updateContratoTermino(db, already.id, {
            fechaTermino: payload.fechaTermino,
            tipoContrato: payload.tipoContrato
        });
        return { action: 'extend', contrato: toApiContrato(already) };
    }
    const cabecera = await findCabecera(db, cedula);
    if (cabecera) {
        await updateContratoTermino(db, cabecera.id, {
            fechaTermino: payload.fechaTermino,
            tipoContrato: payload.tipoContrato
        });
        return { action: 'extend', contrato: toApiContrato(cabecera) };
    }
    const inserted = await insertContratoSafe(db, {
        ...payload,
        vigente: true,
        esCabecera: true,
        origen: payload.origen
    });
    return { action, contrato: toApiContrato(inserted) };
}

/**
 * Tras PATCH/POST de ficha: aplica la misma política que promote
 * (no reescribe cliente/fechas de la cabecera si el cliente cambió).
 */
async function syncPersonContractsFromFicha(db, { cedula, existed, cliente, tipoContrato, fechaInicio, fechaTermino, origen = 'ficha' }) {
    const action = decideContractAction({
        exists: Boolean(existed),
        activo: existed ? existed.activo !== false : true,
        clienteActual: existed && existed.cliente,
        clienteNuevo: cliente
    });
    const allowInicio = action === 'insert_first' || action === 'reingreso';
    return applyContractEvent(db, {
        cedula,
        cliente,
        tipoContrato,
        fechaInicio: allowInicio ? fechaInicio : undefined,
        fechaTermino,
        origen,
        existed,
        action
    });
}

module.exports = {
    CONTRATOS_VIGENTES_COUNT_SQL,
    CONTRACT_PERSON_KEYS,
    decideContractAction,
    filterExtendedForAction,
    filterContratosByClientes,
    contratosVigentesCountSql,
    sameCliente,
    ensureColaboradorContratosTable,
    seedContratosFromColaboradores,
    loadPersonContractState,
    listContratosByCedula,
    attachContratosToItem,
    historicizeVigentes,
    applyContractEvent,
    syncPersonContractsFromFicha,
    toApiContrato,
    isoDate
};
