'use strict';

const { foldForMatch } = require('../cotizador/clienteNombreMatch');
const { computeContratoEconomia, parseMoney } = require('./contratoCostoCalc');
const { ensureContratoVencimientoColumns } = require('./contratoVencimientoService');
const {
    ensureColaboradorContratoHistorialTable,
    flattenHistorialMap,
    listHistorialByCedula,
    recordContratoDiff,
    recordFichaDiff,
    snapshotFromContratoRow
} = require('./contratoHistorial');

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
    'rt_aprox',
    'honorarios',
    'costo_licencias_teams_correo',
    'costo_equipo_computo',
    'auxilios_no_prestacionales',
    'otros_ingresos',
    'empleador',
    'lider_catalogo'
];

const CONTRATOS_SELECT_SQL = `id, cedula, cliente, tipo_contrato, fecha_inicio, fecha_termino,
                vigente, es_cabecera, origen,
                esquema_contrato, sueldo_nomina, tarifa_cliente, costo_empresa, utilidad, rt_aprox,
                honorarios, costo_licencias_teams_correo, costo_equipo_computo,
                auxilios_no_prestacionales, otros_ingresos`;

const ECONOMIA_INPUT_KEYS = [
    'esquema_contrato',
    'sueldo_nomina',
    'tarifa_cliente',
    'honorarios',
    'costo_licencias_teams_correo',
    'costo_equipo_computo',
    'auxilios_no_prestacionales',
    'otros_ingresos'
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
        origen: row.origen || null,
        esquema_contrato: row.esquema_contrato != null ? String(row.esquema_contrato) : '',
        sueldo_nomina: row.sueldo_nomina != null ? Number(row.sueldo_nomina) : null,
        tarifa_cliente: row.tarifa_cliente != null ? Number(row.tarifa_cliente) : null,
        costo_empresa: row.costo_empresa != null ? Number(row.costo_empresa) : null,
        utilidad: row.utilidad != null ? Number(row.utilidad) : null,
        rt_aprox: row.rt_aprox != null ? Number(row.rt_aprox) : null,
        honorarios: row.honorarios != null ? String(row.honorarios) : '',
        costo_licencias_teams_correo:
            row.costo_licencias_teams_correo != null ? Number(row.costo_licencias_teams_correo) : null,
        costo_equipo_computo: row.costo_equipo_computo != null ? Number(row.costo_equipo_computo) : null,
        auxilios_no_prestacionales:
            row.auxilios_no_prestacionales != null ? String(row.auxilios_no_prestacionales) : '',
        otros_ingresos: row.otros_ingresos != null ? String(row.otros_ingresos) : ''
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
        await fillCabeceraFechaTerminoFromPersona(pool);
        await pool.query(`
            ALTER TABLE colaborador_contratos
            ADD COLUMN IF NOT EXISTS esquema_contrato TEXT NULL,
            ADD COLUMN IF NOT EXISTS sueldo_nomina NUMERIC(18,2) NULL,
            ADD COLUMN IF NOT EXISTS tarifa_cliente NUMERIC(18,2) NULL,
            ADD COLUMN IF NOT EXISTS costo_empresa NUMERIC(18,2) NULL,
            ADD COLUMN IF NOT EXISTS utilidad NUMERIC(18,2) NULL,
            ADD COLUMN IF NOT EXISTS rt_aprox NUMERIC(10,4) NULL,
            ADD COLUMN IF NOT EXISTS honorarios TEXT NULL,
            ADD COLUMN IF NOT EXISTS costo_licencias_teams_correo NUMERIC(18,2) NULL,
            ADD COLUMN IF NOT EXISTS costo_equipo_computo NUMERIC(18,2) NULL,
            ADD COLUMN IF NOT EXISTS auxilios_no_prestacionales TEXT NULL,
            ADD COLUMN IF NOT EXISTS otros_ingresos TEXT NULL
        `);
        await pool.query(`
            UPDATE colaborador_contratos cc
            SET esquema_contrato = COALESCE(cc.esquema_contrato, NULLIF(btrim(c.esquema_contrato), '')),
                sueldo_nomina = COALESCE(cc.sueldo_nomina, c.sueldo_nomina),
                tarifa_cliente = COALESCE(cc.tarifa_cliente, c.tarifa_cliente),
                costo_empresa = COALESCE(cc.costo_empresa, c.costo_empresa),
                utilidad = COALESCE(cc.utilidad, c.utilidad),
                rt_aprox = COALESCE(cc.rt_aprox, c.rt_aprox),
                honorarios = COALESCE(cc.honorarios, c.honorarios),
                costo_licencias_teams_correo = COALESCE(cc.costo_licencias_teams_correo, c.costo_licencias_teams_correo),
                costo_equipo_computo = COALESCE(cc.costo_equipo_computo, c.costo_equipo_computo),
                auxilios_no_prestacionales = COALESCE(cc.auxilios_no_prestacionales, c.auxilios_no_prestacionales),
                otros_ingresos = COALESCE(cc.otros_ingresos, c.otros_ingresos)
            FROM colaboradores c
            WHERE cc.cedula = c.cedula
              AND cc.es_cabecera IS TRUE
        `);
        await ensureColaboradorContratoHistorialTable(pool, logger);
        await ensureContratoVencimientoColumns(pool, logger);
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

/** AUT-320: el Excel deja fecha_termino en la persona; la copia a cabecera vigente si el contrato no la tiene. */
async function fillCabeceraFechaTerminoFromPersona(db, cedula) {
    const ced = cedula ? normalizeCedula(cedula) : '';
    const params = ced ? [ced] : [];
    const cedFilter = ced ? 'AND cc.cedula = $1' : '';
    const q = await db.query(
        `UPDATE colaborador_contratos cc
         SET fecha_termino = c.fecha_termino,
             updated_at = NOW()
         FROM colaboradores c
         WHERE cc.cedula = c.cedula
           AND cc.es_cabecera IS TRUE
           AND cc.vigente IS TRUE
           AND cc.fecha_termino IS NULL
           AND c.fecha_termino IS NOT NULL
           ${cedFilter}`,
        params
    );
    return q.rowCount || 0;
}

async function loadPersonContractState(db, cedula) {
    const ced = normalizeCedula(cedula);
    if (!ced) return null;
    const q = await db.query(
        `SELECT cedula, activo, cliente, fecha_ingreso, fecha_termino, tipo_contrato, motivo_baja,
                esquema_contrato, tarifa_cliente, costo_empresa
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
        `SELECT ${CONTRATOS_SELECT_SQL}
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
    const historialByContrato = await listHistorialByCedula(db, item.cedula);
    item.contratos = contratos.map((c) => ({
        ...c,
        historial: historialByContrato.get(String(c.id)) || []
    }));
    item.historial = flattenHistorialMap(historialByContrato);
    item.contratos_vigentes_count = item.contratos.filter((c) => c.vigente).length;
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

/** Vigente por cliente usando fold (Colsubsidio ≈ COLSUBSIDIO). */
async function findVigenteByClienteLoose(db, cedula, cliente) {
    const ced = normalizeCedula(cedula);
    const cli = trimCliente(cliente);
    if (!ced || !cli) return null;
    const exact = await findVigenteByCliente(db, ced, cli);
    if (exact) return exact;
    const vigentes = await listVigentes(db, ced);
    return vigentes.find((c) => sameCliente(c.cliente, cli)) || null;
}

async function listVigentesByCedulas(db, cedulas) {
    const unique = [...new Set((cedulas || []).map(normalizeCedula).filter(Boolean))];
    const map = new Map();
    if (!unique.length) return map;
    const q = await db.query(
        `SELECT id, cedula, cliente, tipo_contrato, fecha_inicio, fecha_termino,
                vigente, es_cabecera, origen
         FROM colaborador_contratos
         WHERE cedula = ANY($1::text[])
           AND vigente IS TRUE`,
        [unique]
    );
    for (const row of q.rows || []) {
        const list = map.get(row.cedula) || [];
        list.push(row);
        map.set(row.cedula, list);
    }
    return map;
}

async function historicizeVigentes(db, cedula, { keepCabecera = false, actor, origen } = {}) {
    const ced = normalizeCedula(cedula);
    if (!ced) return 0;
    const vigentes = await listVigentes(db, ced);
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
    for (const row of vigentes) {
        await recordContratoDiff(db, {
            contratoId: row.id,
            cedula: ced,
            before: snapshotFromContratoRow(row),
            after: { ...snapshotFromContratoRow(row), vigente: false },
            actor,
            origen: origen || 'historicize'
        });
    }
    return q.rowCount || 0;
}

async function listVigentes(db, cedula) {
    const q = await db.query(
        `SELECT id, cedula, cliente, tipo_contrato, fecha_inicio, fecha_termino,
                vigente, es_cabecera, origen
         FROM colaborador_contratos
         WHERE cedula = $1
           AND vigente IS TRUE
         ORDER BY es_cabecera DESC, fecha_inicio DESC NULLS LAST, created_at DESC`,
        [cedula]
    );
    return q.rows || [];
}

async function findLatestHistoricoByCliente(db, cedula, cliente) {
    const q = await db.query(
        `SELECT id, cedula, cliente, tipo_contrato, fecha_inicio, fecha_termino,
                vigente, es_cabecera, origen
         FROM colaborador_contratos
         WHERE cedula = $1
           AND vigente IS FALSE
           AND lower(btrim(cliente)) = lower(btrim($2))
         ORDER BY updated_at DESC NULLS LAST, created_at DESC
         LIMIT 1`,
        [cedula, cliente]
    );
    return q.rows[0] || null;
}

async function markPersonBajaSnapshot(db, cedula, { motivo, fechaTermino, termino }) {
    const q = await db.query(
        `UPDATE colaboradores SET
            activo = FALSE,
            motivo_baja = $1,
            termino = COALESCE($2, termino),
            fecha_termino = $3::date,
            tiempo_permanencia_meses = CASE
                WHEN fecha_ingreso IS NOT NULL
                THEN ROUND(
                    EXTRACT(EPOCH FROM (
                        $3::date::timestamp - fecha_ingreso::timestamp
                    )) / (60*60*24*30.4375), 2)
                ELSE tiempo_permanencia_meses
            END,
            updated_at = NOW()
         WHERE cedula = $4
         RETURNING cedula, activo, motivo_baja, fecha_termino`,
        [motivo, termino || null, isoDate(fechaTermino), cedula]
    );
    return q.rows[0] || null;
}

async function promoteCabeceraFromVigentes(db, cedula) {
    const vigentes = await listVigentes(db, cedula);
    if (!vigentes.length) {
        await db.query(
            `UPDATE colaborador_contratos
             SET es_cabecera = FALSE, updated_at = NOW()
             WHERE cedula = $1 AND es_cabecera IS TRUE`,
            [cedula]
        );
        return null;
    }
    const next = vigentes.find((c) => c.es_cabecera) || vigentes[0];
    await db.query(
        `UPDATE colaborador_contratos
         SET es_cabecera = (id = $2::uuid), updated_at = NOW()
         WHERE cedula = $1`,
        [cedula, next.id]
    );
    await updatePersonCabeceraSnapshot(db, cedula, {
        cliente: next.cliente,
        tipoContrato: next.tipo_contrato,
        fechaInicio: next.fecha_inicio,
        fechaTermino: next.fecha_termino,
        reactivate: true
    });
    return next;
}

/**
 * Recalcula activo de la persona: sigue activa si queda ≥1 vigente.
 * El último contrato cerrado sí manda a Bajas.
 */
async function syncPersonActivoFromContratos(db, cedula, { motivo, fechaTermino, termino } = {}) {
    const vigentes = await listVigentes(db, cedula);
    if (!vigentes.length) {
        const row = await markPersonBajaSnapshot(db, cedula, { motivo, fechaTermino, termino });
        return { personActivo: false, vigentesRestantes: 0, person: row };
    }
    const cab = await promoteCabeceraFromVigentes(db, cedula);
    return {
        personActivo: true,
        vigentesRestantes: vigentes.length,
        person: {
            cedula,
            activo: true,
            motivo_baja: null,
            fecha_termino: cab ? isoDate(cab.fecha_termino) : null
        }
    };
}

function resolveCloseTarget(vigentes, { cliente, contratoId }) {
    const id = contratoId ? String(contratoId) : '';
    if (id) {
        return vigentes.find((c) => String(c.id) === id) || null;
    }
    const cli = trimCliente(cliente);
    if (cli) {
        return vigentes.find((c) => sameCliente(c.cliente, cli)) || null;
    }
    if (vigentes.length === 1) return vigentes[0];
    if (vigentes.length > 1) {
        throw Object.assign(new Error('Indique el cliente del contrato a cerrar'), { status: 400 });
    }
    return null;
}

/**
 * Cierra UN contrato vigente (llave = cliente). La persona solo pasa a Bajas
 * si no le queda otro vigente.
 */
async function closeContrato(db, input = {}) {
    const cedula = normalizeCedula(input.cedula);
    if (!cedula) throw Object.assign(new Error('Cédula inválida'), { status: 400 });
    const fechaTermino = isoDate(input.fechaTermino || input.fecha_termino);
    const motivo = input.motivo || input.motivo_baja || null;
    const termino = input.termino || null;
    const vigentes = await listVigentes(db, cedula);
    const target = resolveCloseTarget(vigentes, {
        cliente: input.cliente,
        contratoId: input.contratoId || input.contrato_id
    });

    if (!target) {
        if (trimCliente(input.cliente) || input.contratoId || input.contrato_id) {
            throw Object.assign(new Error('No hay contrato vigente para ese cliente'), { status: 404 });
        }
        const row = await markPersonBajaSnapshot(db, cedula, { motivo, fechaTermino, termino });
        if (!row) throw Object.assign(new Error('Colaborador no encontrado'), { status: 404 });
        return {
            action: 'person_baja',
            contrato: null,
            personActivo: false,
            vigentesRestantes: 0,
            person: row
        };
    }

    await db.query(
        `UPDATE colaborador_contratos
         SET vigente = FALSE,
             es_cabecera = FALSE,
             fecha_termino = COALESCE($2::date, fecha_termino),
             updated_at = NOW()
         WHERE id = $1::uuid AND cedula = $3`,
        [target.id, fechaTermino, cedula]
    );
    await recordContratoDiff(db, {
        contratoId: target.id,
        cedula,
        before: snapshotFromContratoRow(target),
        after: {
            ...snapshotFromContratoRow(target),
            vigente: false,
            fecha_termino: fechaTermino || target.fecha_termino
        },
        actor: input.actor,
        origen: input.origen || 'baja'
    });
    const sync = await syncPersonActivoFromContratos(db, cedula, { motivo, fechaTermino, termino });
    return {
        action: 'close_contrato',
        contrato: toApiContrato({ ...target, vigente: false, es_cabecera: false, fecha_termino: fechaTermino || target.fecha_termino }),
        ...sync
    };
}

/**
 * Revierte una salida: reabre el último contrato histórico de ese cliente.
 * Si ya hay vigente de ese cliente, no abre otro.
 */
async function reopenContrato(db, input = {}) {
    const cedula = normalizeCedula(input.cedula);
    const cliente = trimCliente(input.cliente);
    if (!cedula) throw Object.assign(new Error('Cédula inválida'), { status: 400 });
    if (!cliente) throw Object.assign(new Error('La ficha debe traer el cliente a reabrir'), { status: 400 });

    const already = await findVigenteByCliente(db, cedula, cliente);
    if (already) {
        const sync = await syncPersonActivoFromContratos(db, cedula);
        return {
            action: 'noop_already_vigente',
            contrato: toApiContrato(already),
            ...sync
        };
    }

    const hist = await findLatestHistoricoByCliente(db, cedula, cliente);
    if (!hist) {
        throw Object.assign(new Error('No hay una salida previa de ese cliente para revertir'), { status: 404 });
    }

    await db.query(
        `UPDATE colaborador_contratos
         SET vigente = TRUE, updated_at = NOW()
         WHERE id = $1::uuid AND cedula = $2`,
        [hist.id, cedula]
    );
    await recordContratoDiff(db, {
        contratoId: hist.id,
        cedula,
        before: snapshotFromContratoRow(hist),
        after: { ...snapshotFromContratoRow(hist), vigente: true },
        actor: input.actor,
        origen: input.origen || 'reopen'
    });
    const sync = await syncPersonActivoFromContratos(db, cedula);
    return {
        action: 'reopen_contrato',
        contrato: toApiContrato({ ...hist, vigente: true }),
        ...sync
    };
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
            await updateContratoTermino(db, existing.id, {
                fechaTermino: input.fechaTermino,
                tipoContrato: input.tipoContrato,
                fechaInicio: input.fechaInicio,
                actor: input.actor,
                origen: input.origen
            });
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
    origen,
    actor
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
    const row = q.rows[0] || null;
    if (row) {
        await recordContratoDiff(db, {
            contratoId: row.id,
            cedula: row.cedula,
            before: {},
            after: snapshotFromContratoRow(row),
            actor,
            origen: origen || 'insert'
        });
    }
    return row;
}

async function updateContratoTermino(db, id, { fechaTermino, tipoContrato, fechaInicio, actor, origen }) {
    const beforeQ = await db.query(
        `SELECT id, cedula, cliente, tipo_contrato, fecha_inicio, fecha_termino,
                vigente, es_cabecera, origen
         FROM colaborador_contratos
         WHERE id = $1::uuid`,
        [id]
    );
    const before = beforeQ.rows[0] || null;
    await db.query(
        `UPDATE colaborador_contratos
         SET fecha_termino = COALESCE($2::date, fecha_termino),
             tipo_contrato = COALESCE($3, tipo_contrato),
             fecha_inicio = COALESCE($4::date, fecha_inicio),
             updated_at = NOW()
         WHERE id = $1::uuid`,
        [id, isoDate(fechaTermino), tipoContrato || null, isoDate(fechaInicio)]
    );
    if (before) {
        await recordContratoDiff(db, {
            contratoId: before.id,
            cedula: before.cedula,
            before: snapshotFromContratoRow(before),
            after: {
                ...snapshotFromContratoRow(before),
                fecha_termino: isoDate(fechaTermino) || before.fecha_termino,
                tipo_contrato: tipoContrato || before.tipo_contrato,
                fecha_inicio: isoDate(fechaInicio) || before.fecha_inicio
            },
            actor,
            origen: origen || 'extend'
        });
    }
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
        origen: input.origen || 'promote',
        actor: input.actor || null
    };

    // AUT-340: guardar la ficha no debe "resucitar" un contrato que ya fue
    // cerrado para ese cliente. Si hay histórico cerrado del mismo cliente y no
    // hay vigente, se evita insertar un contrato nuevo (el reingreso real entra
    // por integración/novedad, no por editar la ficha).
    const preventReopenClosed = input.preventReopenClosed === true;
    async function guardResurrect() {
        if (!preventReopenClosed || !cliente) return null;
        const closed = await findLatestHistoricoByCliente(db, cedula, cliente);
        if (closed) return { action: 'identity_only', contrato: toApiContrato(closed) };
        return null;
    }

    if (action === 'identity_only') {
        return { action, contrato: null };
    }

    if (action === 'extend') {
        const vigente = cliente ? await findVigenteByCliente(db, cedula, cliente) : null;
        if (vigente) {
            await updateContratoTermino(db, vigente.id, {
                fechaTermino: payload.fechaTermino,
                tipoContrato: payload.tipoContrato,
                actor: payload.actor,
                origen: payload.origen
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
                tipoContrato: payload.tipoContrato,
                actor: payload.actor,
                origen: payload.origen
            });
            return { action: 'extend', contrato: toApiContrato(cabecera) };
        }
        const blocked = await guardResurrect();
        if (blocked) return blocked;
        const inserted = await insertContratoSafe(db, {
            ...payload,
            vigente: true,
            esCabecera: !cabecera && !existed,
            origen: payload.origen,
            actor: payload.actor
        });
        return { action: existed ? 'extend' : 'insert_first', contrato: toApiContrato(inserted) };
    }

    if (action === 'new_client') {
        if (!cliente) return { action: 'identity_only', contrato: null };
        const already = await findVigenteByCliente(db, cedula, cliente);
        if (already) {
            await updateContratoTermino(db, already.id, {
                fechaTermino: payload.fechaTermino,
                tipoContrato: payload.tipoContrato,
                actor: payload.actor,
                origen: payload.origen
            });
            return { action: 'extend', contrato: toApiContrato(already) };
        }
        const blocked = await guardResurrect();
        if (blocked) return blocked;
        const inserted = await insertContratoSafe(db, {
            ...payload,
            vigente: true,
            esCabecera: false,
            origen: payload.origen,
            actor: payload.actor
        });
        return { action, contrato: toApiContrato(inserted) };
    }

    if (action === 'reingreso') {
        await historicizeVigentes(db, cedula, {
            keepCabecera: false,
            actor: payload.actor,
            origen: payload.origen || 'reingreso'
        });
        let contrato = null;
        if (cliente) {
            contrato = toApiContrato(await insertContratoSafe(db, {
                ...payload,
                vigente: true,
                esCabecera: true,
                origen: payload.origen || 'reingreso',
                actor: payload.actor
            }));
        }
        await updatePersonCabeceraSnapshot(db, cedula, {
            cliente: cliente || undefined,
            tipoContrato: payload.tipoContrato,
            fechaInicio: payload.fechaInicio,
            fechaTermino: payload.fechaTermino,
            reactivate: true
        });
        await recordFichaDiff(db, {
            cedula,
            before: {
                activo: existed ? existed.activo !== false : false,
                motivo_baja: existed && existed.motivo_baja,
                termino: existed && existed.termino
            },
            after: { activo: true, motivo_baja: '', termino: '' },
            actor: payload.actor,
            origen: payload.origen || 'reingreso',
            onlyKeys: ['activo', 'motivo_baja', 'termino']
        });
        return { action, contrato };
    }

    // insert_first
    if (!cliente) return { action: 'identity_only', contrato: null };
    const already = await findVigenteByCliente(db, cedula, cliente);
    if (already) {
        await updateContratoTermino(db, already.id, {
            fechaTermino: payload.fechaTermino,
            tipoContrato: payload.tipoContrato,
            actor: payload.actor,
            origen: payload.origen
        });
        return { action: 'extend', contrato: toApiContrato(already) };
    }
    const cabecera = await findCabecera(db, cedula);
    if (cabecera) {
        await updateContratoTermino(db, cabecera.id, {
            fechaTermino: payload.fechaTermino,
            tipoContrato: payload.tipoContrato,
            actor: payload.actor,
            origen: payload.origen
        });
        return { action: 'extend', contrato: toApiContrato(cabecera) };
    }
    const blockedFirst = await guardResurrect();
    if (blockedFirst) return blockedFirst;
    const inserted = await insertContratoSafe(db, {
        ...payload,
        vigente: true,
        esCabecera: true,
        origen: payload.origen,
        actor: payload.actor
    });
    return { action, contrato: toApiContrato(inserted) };
}

/**
 * Tras PATCH/POST de ficha: aplica la misma política que promote
 * (no reescribe cliente/fechas de la cabecera si el cliente cambió).
 */
async function syncPersonContractsFromFicha(db, {
    cedula,
    existed,
    cliente,
    tipoContrato,
    fechaInicio,
    fechaTermino,
    origen = 'ficha',
    allowReingreso = true,
    actor
}) {
    let action = decideContractAction({
        exists: Boolean(existed),
        activo: existed ? existed.activo !== false : true,
        clienteActual: existed && existed.cliente,
        clienteNuevo: cliente
    });
    // Editar/guardar ficha en Bajas no es reingreso. El reingreso entra por integración/novedad.
    if (action === 'reingreso' && allowReingreso === false) {
        action = 'identity_only';
    }
    const allowInicio = action === 'insert_first' || action === 'reingreso';
    return applyContractEvent(db, {
        cedula,
        cliente,
        tipoContrato,
        fechaInicio: allowInicio ? fechaInicio : undefined,
        fechaTermino,
        origen,
        existed,
        action,
        actor,
        preventReopenClosed: allowReingreso === false
    });
}

function mergeEconomiaSource(row, patch) {
    const out = { ...(row || {}) };
    const src = patch && typeof patch === 'object' ? patch : {};
    for (const key of ECONOMIA_INPUT_KEYS) {
        if (src[key] !== undefined) out[key] = src[key];
    }
    if (src.tipo_contrato !== undefined) out.tipo_contrato = src.tipo_contrato;
    return out;
}

function stripComputedEconomia(payload) {
    if (!payload || typeof payload !== 'object') return {};
    const out = { ...payload };
    delete out.costo_empresa;
    delete out.utilidad;
    delete out.rt_aprox;
    delete out.contrato_id;
    return out;
}

function stripEconomiaFromPersonPatch(payload) {
    const out = stripComputedEconomia(payload);
    for (const key of ECONOMIA_INPUT_KEYS) delete out[key];
    return out;
}

async function loadContratoRowForEconomia(db, cedula, contratoId) {
    const ced = normalizeCedula(cedula);
    if (contratoId) {
        const q = await db.query(
            `SELECT * FROM colaborador_contratos WHERE id = $1::uuid AND cedula = $2 LIMIT 1`,
            [contratoId, ced]
        );
        return q.rows[0] || null;
    }
    const cab = await db.query(
        `SELECT * FROM colaborador_contratos WHERE cedula = $1 AND es_cabecera IS TRUE LIMIT 1`,
        [ced]
    );
    return cab.rows[0] || null;
}

function shouldWriteEconomiaToPerson({ editingOther, contractAction } = {}) {
    return editingOther !== true && contractAction !== 'new_client';
}

async function persistContratoEconomia(db, {
    cedula,
    contratoId,
    patch,
    actor,
    origen
}) {
    const row = await loadContratoRowForEconomia(db, cedula, contratoId);
    if (contratoId && !row) {
        throw Object.assign(new Error('Contrato no encontrado'), { status: 404 });
    }
    if (!row) {
        const calc = computeContratoEconomia(mergeEconomiaSource({}, patch));
        return { editingOther: false, calc, contratoId: null };
    }
    const source = mergeEconomiaSource(row, patch);
    const calc = computeContratoEconomia(source);
    const next = {
        esquema_contrato: source.esquema_contrato != null ? String(source.esquema_contrato) : null,
        sueldo_nomina: source.sueldo_nomina != null && source.sueldo_nomina !== ''
            ? parseMoney(source.sueldo_nomina)
            : null,
        tarifa_cliente: source.tarifa_cliente != null && source.tarifa_cliente !== ''
            ? parseMoney(source.tarifa_cliente)
            : null,
        honorarios: source.honorarios != null ? String(source.honorarios) : null,
        costo_licencias_teams_correo:
            source.costo_licencias_teams_correo != null && source.costo_licencias_teams_correo !== ''
                ? parseMoney(source.costo_licencias_teams_correo)
                : null,
        costo_equipo_computo:
            source.costo_equipo_computo != null && source.costo_equipo_computo !== ''
                ? parseMoney(source.costo_equipo_computo)
                : null,
        auxilios_no_prestacionales:
            source.auxilios_no_prestacionales != null ? String(source.auxilios_no_prestacionales) : null,
        otros_ingresos: source.otros_ingresos != null ? String(source.otros_ingresos) : null,
        costo_empresa: calc.costo_empresa,
        utilidad: calc.utilidad,
        rt_aprox: calc.rt_aprox
    };
    await db.query(
        `UPDATE colaborador_contratos SET
            esquema_contrato = $2,
            sueldo_nomina = $3,
            tarifa_cliente = $4,
            honorarios = $5,
            costo_licencias_teams_correo = $6,
            costo_equipo_computo = $7,
            auxilios_no_prestacionales = $8,
            otros_ingresos = $9,
            costo_empresa = $10,
            utilidad = $11,
            rt_aprox = $12,
            updated_at = NOW()
         WHERE id = $1::uuid AND cedula = $13`,
        [
            row.id,
            next.esquema_contrato,
            next.sueldo_nomina,
            next.tarifa_cliente,
            next.honorarios,
            next.costo_licencias_teams_correo,
            next.costo_equipo_computo,
            next.auxilios_no_prestacionales,
            next.otros_ingresos,
            next.costo_empresa,
            next.utilidad,
            next.rt_aprox,
            normalizeCedula(cedula)
        ]
    );
    await recordContratoDiff(db, {
        contratoId: row.id,
        cedula: normalizeCedula(cedula),
        before: snapshotFromContratoRow(row),
        after: snapshotFromContratoRow({ ...row, ...next }),
        actor,
        origen: origen || 'ficha_patch'
    });
    return {
        editingOther: row.es_cabecera !== true,
        calc,
        contratoId: row.id
    };
}

module.exports = {
    CONTRATOS_VIGENTES_COUNT_SQL,
    CONTRACT_PERSON_KEYS,
    ECONOMIA_INPUT_KEYS,
    decideContractAction,
    filterExtendedForAction,
    mergeEconomiaSource,
    stripComputedEconomia,
    stripEconomiaFromPersonPatch,
    persistContratoEconomia,
    loadContratoRowForEconomia,
    shouldWriteEconomiaToPerson,
    filterContratosByClientes,
    contratosVigentesCountSql,
    sameCliente,
    ensureColaboradorContratosTable,
    seedContratosFromColaboradores,
    fillCabeceraFechaTerminoFromPersona,
    loadPersonContractState,
    listContratosByCedula,
    findVigenteByCliente,
    findVigenteByClienteLoose,
    listVigentesByCedulas,
    attachContratosToItem,
    historicizeVigentes,
    closeContrato,
    reopenContrato,
    resolveCloseTarget,
    applyContractEvent,
    syncPersonContractsFromFicha,
    toApiContrato,
    isoDate
};
