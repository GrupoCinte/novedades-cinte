/** Estados de conciliación / facturación (alineado con backend Zod). */
import { countEstadosFromRows as countEstadosFromRowsShared, aggregateServicioCierre, COLA_ESTADO_LABELS, normalizeCedula } from './facturacionAggregate.js';

export const ESTADOS_FACTURACION = ['PENDIENTE', 'APROBADO_ANALISTA', 'APROBADO_FINANZAS', 'DEVUELTA', 'CONCILIADA'];

export const ESTADOS_FACTURACION_META = [
    { key: 'PENDIENTE', label: 'Pendiente', shortLabel: 'Pend.', pill: 'text-amber-500 border-amber-500/30 bg-amber-500/10' },
    { key: 'APROBADO_ANALISTA', label: 'Aprobado Analista', shortLabel: 'Anal.', pill: 'text-[#2F7BB8] border-[#2F7BB8]/30 bg-[#2F7BB8]/10' },
    { key: 'APROBADO_FINANZAS', label: 'Aprobado Finanzas', shortLabel: 'Fin.', pill: 'text-violet-500 border-violet-500/30 bg-violet-500/10' },
    { key: 'DEVUELTA', label: 'Devuelta', shortLabel: 'Dev.', pill: 'text-red-500 border-red-500/30 bg-red-500/10' },
    { key: 'CONCILIADA', label: 'Conciliada', shortLabel: 'Conc.', pill: 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10' }
];

const SEGMENT_DOT = {
    PENDIENTE: 'bg-amber-500',
    APROBADO_ANALISTA: 'bg-[#2F7BB8]',
    APROBADO_FINANZAS: 'bg-violet-500',
    DEVUELTA: 'bg-red-500',
    CONCILIADA: 'bg-emerald-500'
};

/** Tono pill alineado con Capital Humano / onboarding (light, dark). */
const ESTADO_TONE = {
    PENDIENTE: ['border-amber-300 bg-amber-50 text-amber-900', 'border-amber-500/30 bg-amber-500/10 text-amber-200'],
    APROBADO_ANALISTA: ['border-[#65BCF7]/40 bg-[#2F7BB8]/10 text-[#004D87]', 'border-[#65BCF7]/30 bg-[#2F7BB8]/15 text-[#65BCF7]'],
    APROBADO_FINANZAS: ['border-violet-300 bg-violet-50 text-violet-900', 'border-violet-500/30 bg-violet-500/10 text-violet-200'],
    DEVUELTA: ['border-rose-300 bg-rose-50 text-rose-900', 'border-rose-500/30 bg-rose-500/10 text-rose-200'],
    CONCILIADA: ['border-emerald-300 bg-emerald-50 text-emerald-900', 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200']
};

const ESTADO_DOT_COLOR = {
    PENDIENTE: '#f59e0b',
    APROBADO_ANALISTA: '#2F7BB8',
    APROBADO_FINANZAS: '#8b5cf6',
    DEVUELTA: '#ef4444',
    CONCILIADA: '#10b981'
};

/**
 * @param {object} filters
 * @returns {boolean}
 */
export function hasFacturacionAdvancedFilters(filters) {
    if (!filters) return false;
    if (String(filters.fSearch || '').trim()) return true;
    if (String(filters.fEstado || '').trim()) return true;
    if (filters.fCerrado && filters.fCerrado !== 'TODOS') return true;
    if (String(filters.fProyecto || '').trim()) return true;
    if (filters.fNovedades && filters.fNovedades !== 'TODOS') return true;
    return false;
}

/**
 * Filtrado local de filas de facturación.
 */
export function filterFacturacionRows(rows, filters) {
    const list = Array.isArray(rows) ? rows : [];
    const fSearch = String(filters?.fSearch || '').trim().toLowerCase();
    const fEstado = String(filters?.fEstado || '').trim();
    const fCerrado = filters?.fCerrado ?? 'TODOS';
    const fProyecto = String(filters?.fProyecto || '').trim().toLowerCase();
    const fNovedades = filters?.fNovedades ?? 'TODOS';

    return list.filter((r) => {
        if (fSearch) {
            const nameMatch = String(r.nombre || '').toLowerCase().includes(fSearch);
            const cedulaMatch = String(r.cedula || '').includes(fSearch);
            if (!nameMatch && !cedulaMatch) return false;
        }
        if (fEstado) {
            const est = r.estado || 'PENDIENTE';
            if (est !== fEstado) return false;
        }
        if (fCerrado !== 'TODOS') {
            const isCerrado = Boolean(r.cerrado);
            if (fCerrado === 'CERRADO' && !isCerrado) return false;
            if (fCerrado === 'PENDIENTE' && isCerrado) return false;
        }
        if (fProyecto) {
            const projMatch = String(r.proyecto || '').toLowerCase().includes(fProyecto);
            if (!projMatch) return false;
        }
        if (fNovedades !== 'TODOS') {
            const hasNov = (r.novedadesCount || 0) > 0;
            if (fNovedades === 'CON_NOVEDADES' && !hasNov) return false;
            if (fNovedades === 'SIN_NOVEDADES' && hasNov) return false;
        }
        return true;
    });
}

/** Pills de resumen en workspace de servicio (nivel 2). */
export function shouldShowFacturacionEstadosResumen(inWorkspace) {
    return Boolean(inWorkspace);
}

/** Acción grupal: en workspace de servicio. */
export function shouldShowFacturacionAccionGrupal(inWorkspace) {
    return Boolean(inWorkspace);
}

/** Indicador de conciliación del cliente: solo con cliente concreto. */
export function shouldShowClienteConciliacionIndicador(isTodosClientes) {
    return !Boolean(isTodosClientes);
}

function buildClienteConciliacionEstadoSlots(estados) {
    return ESTADOS_FACTURACION_META.map((meta) => ({
        key: meta.key,
        label: meta.label,
        active: (estados[meta.key] || 0) > 0,
        pill: meta.pill
    }));
}

function countEstadosFromRows(rows) {
    return countEstadosFromRowsShared(rows);
}

/**
 * Resumen del estado de conciliación de un cliente (chips de 5 estados).
 * @returns {{ kind: 'empty'|'ok', clienteLabel: string, detail: string, estados: object, estadoSlots: object[] }}
 */
export function computeClienteConciliacionSnapshot(rows, { cliente = '' } = {}) {
    const list = Array.isArray(rows) ? rows : [];
    const clienteLabel = String(cliente || '').trim() || 'Cliente';
    const estados = countEstadosFromRows(list);
    const estadoSlots = buildClienteConciliacionEstadoSlots(estados);

    if (!list.length) {
        return {
            kind: 'empty',
            clienteLabel,
            detail: 'Sin colaboradores en el mes',
            estados,
            estadoSlots
        };
    }

    const cerrados = list.filter((r) => r.cerrado).length;
    const total = list.length;

    return {
        kind: 'ok',
        clienteLabel,
        detail: `${cerrados}/${total} cerrados`,
        estados,
        estadoSlots
    };
}

/** Clase del punto de color por estado (indicador minimalista). */
export function conciliacionEstadoDotClass(estadoKey) {
    return SEGMENT_DOT[estadoKey] || 'bg-slate-500';
}

/** Color sólido del dot (chips estilo Capital Humano). */
export function conciliacionEstadoDotColor(estadoKey) {
    return ESTADO_DOT_COLOR[estadoKey] || '#64748b';
}

/** Tono pill por estado (mismo patrón que En ingreso / onboarding). */
export function conciliacionEstadoTone(estadoKey, isLight = false) {
    const pair = ESTADO_TONE[estadoKey];
    if (!pair) {
        return isLight ? 'border-slate-300 bg-slate-100 text-slate-700' : 'border-slate-500/30 bg-slate-500/10 text-slate-300';
    }
    return isLight ? pair[0] : pair[1];
}

export function conciliacionEstadoTodosTone(isLight = false) {
    return isLight ? 'border-slate-300 bg-slate-100 text-slate-700' : 'border-slate-500/30 bg-slate-500/10 text-slate-300';
}

/** Chip de estado (mismas medidas que pills de Gestión / resumen de estados). */
export function conciliacionEstadoChipClass(active, pill, isLight = false) {
    const base = 'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-body text-xs font-medium transition-all';
    if (active) {
        return `${base} ${pill}`;
    }
    return isLight
        ? `${base} border-slate-200 bg-slate-50/80 text-slate-400/70`
        : `${base} border-slate-700/50 bg-slate-800/30 text-slate-500/50`;
}

/** Alterna filtro de estado al pulsar pill del resumen. */
export function toggleFacturacionEstadoFilter(currentEstado, clickedEstado) {
    const cur = String(currentEstado || '').trim();
    const next = String(clickedEstado || '').trim();
    if (!next) return '';
    return cur === next ? '' : next;
}

/** Agrega campos de ajuste anticipo desde filas del servicio. */
export function aggregateAdvanceTotalesFromRows(rows) {
    if (!Array.isArray(rows) || !rows.length) {
        return {
            ajusteAnticipoSum: 0,
            ajusteAnticipoSuma: 0,
            saldoAnticipoNetCop: 0,
            saldoAnticipoTipo: null,
            ajusteAnticipoMesLabel: null,
            billingAdvanceMode: false
        };
    }

    let ajusteAnticipoSum = 0;
    let ajusteAnticipoSuma = 0;
    let ajusteAnticipoMesLabel = null;
    let billingAdvanceMode = false;

    for (const r of rows) {
        ajusteAnticipoSum += Number(r.ajusteAnticipoSumCop) || 0;
        ajusteAnticipoSuma += Number(r.ajusteAnticipoSumaCop) || 0;
        if (r.billingAdvanceMode) billingAdvanceMode = true;
        if (!ajusteAnticipoMesLabel && r.ajusteAnticipoMesLabel) {
            ajusteAnticipoMesLabel = r.ajusteAnticipoMesLabel;
        }
    }

    const saldoAnticipoNetCop = ajusteAnticipoSuma - ajusteAnticipoSum;
    const saldoAnticipoTipo =
        saldoAnticipoNetCop > 0 ? 'contra' : saldoAnticipoNetCop < 0 ? 'favor' : null;

    return {
        ajusteAnticipoSum,
        ajusteAnticipoSuma,
        saldoAnticipoNetCop,
        saldoAnticipoTipo,
        ajusteAnticipoMesLabel,
        billingAdvanceMode
    };
}

/**
 * Agrega conteos por estado a totales del mes.
 */
export function buildFacturacionTotales(rows, totales) {
    if (!Array.isArray(rows) || !rows.length) return totales || null;

    const cedulas = rows.map((r) => r.cedula);
    const agg = aggregateServicioCierre(rows, cedulas);
    const advance = aggregateAdvanceTotalesFromRows(rows);

    return {
        ...(totales || {}),
        tarifaSum: agg.totales.tarifaSum,
        incrementoSum: agg.totales.incrementoSum,
        deduccionSum: agg.totales.deduccionSum,
        facturaSum: agg.totales.facturaSum,
        ...advance,
        cerradosCount: agg.consultoresCerrados,
        pendientesCount: agg.consultoresTotal - agg.consultoresCerrados,
        estados: agg.estados
    };
}

function trimOrNull(v) {
    const s = String(v ?? '').trim();
    return s ? s : null;
}

/**
 * Valida formulario individual antes de POST /facturacion.
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
export function validateFacturacionForm({ proyecto, estado, fechaRadicacion, motivoDevolucion, requireProyecto = true }) {
    const est = String(estado || 'PENDIENTE').trim();
    if (!ESTADOS_FACTURACION.includes(est)) {
        return { ok: false, error: 'Estado de conciliación inválido' };
    }
    if (requireProyecto && !String(proyecto || '').trim()) {
        return { ok: false, error: 'El proyecto es obligatorio' };
    }
    if (String(fechaRadicacion || '').trim() && !/^\d{4}-\d{2}-\d{2}$/.test(String(fechaRadicacion).trim())) {
        return { ok: false, error: 'La fecha de radicación debe tener formato AAAA-MM-DD' };
    }
    if (est === 'DEVUELTA' && !String(motivoDevolucion || '').trim()) {
        return { ok: false, error: 'El motivo de devolución es obligatorio' };
    }
    return { ok: true };
}

/**
 * Payload POST facturación individual.
 */
export function buildFacturacionSavePayload(form, { cedula, anio, mes }) {
    const est = String(form.estado || 'PENDIENTE').trim();
    return {
        cedula: String(cedula || '').trim(),
        anio,
        mes,
        proyecto: trimOrNull(form.proyecto),
        observaciones: trimOrNull(form.observaciones),
        estado: est,
        facturaFv: trimOrNull(form.facturaFv),
        fechaRadicacion: trimOrNull(form.fechaRadicacion),
        motivoDevolucion: est === 'DEVUELTA' ? trimOrNull(form.motivoDevolucion) : null
    };
}

/** Valida observación obligatoria al aprobar o rechazar revisión. */
export function validateRevisionObservacion(observaciones) {
    if (!String(observaciones || '').trim()) {
        return { ok: false, error: 'La observación es obligatoria' };
    }
    return { ok: true };
}

const ELEVATED_ROLES = new Set(['super_admin', 'cac']);

function normalizeRole(role) {
    return String(role || '').trim().toLowerCase();
}

function normalizeEstado(estado) {
    const e = String(estado || 'PENDIENTE').trim();
    return ESTADOS_FACTURACION.includes(e) ? e : 'PENDIENTE';
}

function resolveEffectiveEtapa(role, estadoActual) {
    const r = normalizeRole(role);
    if (ELEVATED_ROLES.has(r)) {
        const est = normalizeEstado(estadoActual);
        if (est === 'APROBADO_ANALISTA') return 'NOMINA';
        if (est === 'PENDIENTE' || est === 'DEVUELTA') return 'ANALISTA';
        return null;
    }
    if (r === 'analista_conciliaciones') return 'ANALISTA';
    if (r === 'nomina') return 'NOMINA';
    return null;
}

function normalizeEtapaObjetivo(etapaObjetivo) {
    const etapa = String(etapaObjetivo || '').trim().toUpperCase();
    return etapa === 'ANALISTA' || etapa === 'NOMINA' ? etapa : null;
}

function canRoleActAtEtapa(role, etapaObjetivo) {
    const etapa = normalizeEtapaObjetivo(etapaObjetivo);
    if (!etapa) return false;
    const r = normalizeRole(role);
    if (ELEVATED_ROLES.has(r)) return true;
    if (etapa === 'ANALISTA') return r === 'analista_conciliaciones';
    if (etapa === 'NOMINA') return r === 'nomina';
    return false;
}

/** Elegibilidad por etapa fija (masiva), sin adaptar etapa por fila en roles elevados. */
export function canActOnEstadoForEtapa(role, estadoActual, accion, etapaObjetivo) {
    const act = String(accion || '').trim().toLowerCase();
    if (act !== 'aprobar' && act !== 'rechazar') return false;
    const etapa = normalizeEtapaObjetivo(etapaObjetivo);
    if (!etapa || !canRoleActAtEtapa(role, etapa)) return false;

    const est = normalizeEstado(estadoActual);
    if (etapa === 'ANALISTA') {
        if (act === 'rechazar') return false;
        return est === 'PENDIENTE' || est === 'DEVUELTA';
    }
    if (etapa === 'NOMINA') {
        return est === 'APROBADO_ANALISTA';
    }
    return false;
}

function canActOnEstado(role, estadoActual, accion) {
    const act = String(accion || '').trim().toLowerCase();
    if (act !== 'aprobar' && act !== 'rechazar') return false;
    const est = normalizeEstado(estadoActual);
    const etapa = resolveEffectiveEtapa(role, est);
    if (!etapa) return false;
    if (etapa === 'ANALISTA') {
        if (act === 'rechazar') return false;
        return est === 'PENDIENTE' || est === 'DEVUELTA';
    }
    if (etapa === 'NOMINA') {
        return est === 'APROBADO_ANALISTA';
    }
    return false;
}

/** Roles que pueden usar aprobación masiva de revisión. */
export function canUserPerformMasivaRevision(role) {
    const r = normalizeRole(role);
    return r === 'analista_conciliaciones' || r === 'nomina' || ELEVATED_ROLES.has(r);
}

/** Filas sobre las que el rol puede ejecutar la acción masiva indicada. */
export function filterMasivaEligibleRows(role, rows, accion = 'aprobar', etapaObjetivo = null) {
    const list = Array.isArray(rows) ? rows : [];
    const etapa = normalizeEtapaObjetivo(etapaObjetivo);
    if (etapa) {
        return list.filter((row) => canActOnEstadoForEtapa(role, row?.estado, accion, etapa));
    }
    return list.filter((row) => canActOnEstado(role, row?.estado, accion));
}

/** Opciones de etapa disponibles para masiva (p. ej. super_admin con filas mixtas). */
export function listMasivaEtapaOptions(role, rows, accion = 'aprobar') {
    const options = [];
    const analistaCount = filterMasivaEligibleRows(role, rows, accion, 'ANALISTA').length;
    const nominaCount = filterMasivaEligibleRows(role, rows, accion, 'NOMINA').length;
    if (analistaCount > 0) {
        options.push({
            etapaObjetivo: 'ANALISTA',
            eligibleCount: analistaCount,
            aprobarLabel: 'Enviar a Nómina',
            title: 'Aprobación masiva — Analista'
        });
    }
    if (nominaCount > 0) {
        options.push({
            etapaObjetivo: 'NOMINA',
            eligibleCount: nominaCount,
            aprobarLabel: 'Aprobar cierres',
            title: 'Aprobación masiva — Nómina'
        });
    }
    if (ELEVATED_ROLES.has(normalizeRole(role)) && options.length > 1) {
        return [options.sort((a, b) => b.eligibleCount - a.eligibleCount)[0]];
    }
    return options;
}

/** Etapa por defecto: prioriza pendientes de analista. */
export function defaultMasivaEtapaObjetivo(role, rows, accion = 'aprobar') {
    const options = listMasivaEtapaOptions(role, rows, accion);
    const analista = options.find((o) => o.etapaObjetivo === 'ANALISTA');
    if (analista) return 'ANALISTA';
    return options[0]?.etapaObjetivo || null;
}

/** Analista o super_admin pueden ajustar montos en PENDIENTE / DEVUELTA. */
export function canEditConciliacionAjustes(role, estado) {
    const r = normalizeRole(role);
    const est = normalizeEstado(estado);
    if (r !== 'analista_conciliaciones' && r !== 'super_admin') return false;
    return est === 'PENDIENTE' || est === 'DEVUELTA';
}

/** Acciones de revisión visibles según rol y estado del cierre. */
export function getRevisionActionsForUser(role, estado) {
    const est = normalizeEstado(estado);
    if (est === 'APROBADO_FINANZAS' || est === 'CONCILIADA') {
        return {
            canAprobar: false,
            canRechazar: false,
            etapaLabel: est === 'CONCILIADA' ? 'Conciliada' : 'Finanzas',
            aprobarLabel: 'Aprobar',
            readOnlyMessage:
                est === 'CONCILIADA'
                    ? 'Este cierre ya fue conciliado.'
                    : 'Cierre aprobado en finanzas. Pendiente de exportación o cierre del servicio.'
        };
    }
    const etapa = resolveEffectiveEtapa(role, est);
    if (!etapa) {
        return { canAprobar: false, canRechazar: false, etapaLabel: null, aprobarLabel: 'Aprobar' };
    }
    if (etapa === 'ANALISTA') {
        const canAprobar = est === 'PENDIENTE' || est === 'DEVUELTA';
        return {
            canAprobar,
            canRechazar: false,
            etapaLabel: 'Analista',
            aprobarLabel: 'Enviar a Nómina'
        };
    }
    if (etapa === 'NOMINA' && est === 'APROBADO_ANALISTA') {
        return {
            canAprobar: true,
            canRechazar: true,
            etapaLabel: 'Nómina',
            aprobarLabel: 'Aprobar cierre'
        };
    }
    return { canAprobar: false, canRechazar: false, etapaLabel: etapa, aprobarLabel: 'Aprobar' };
}

/**
 * Arma payload para POST /facturacion/revision (sin calcular estado en cliente).
 * @param {'aprobar'|'rechazar'} accion
 */
export function buildFacturacionRevisionPayload({ accion, observaciones }, { cedula, anio, mes, servicioId }) {
    const obs = String(observaciones || '').trim();
    const validation = validateRevisionObservacion(obs);
    if (!validation.ok) return validation;

    const act = String(accion || '').trim().toLowerCase();
    if (act !== 'aprobar' && act !== 'rechazar') {
        return { ok: false, error: 'Acción inválida' };
    }

    const data = {
        cedula: String(cedula || '').trim(),
        anio,
        mes,
        accion: act,
        observacion: obs
    };
    const sid = String(servicioId || '').trim();
    if (sid) data.servicioId = sid;

    return { ok: true, data };
}

/**
 * Arma payload para POST /facturacion/ajustes.
 */
export function buildFacturacionAjustesPayload({ observaciones, cedula, anio, mes }, draft) {
    const obs = String(observaciones || '').trim();
    const validation = validateRevisionObservacion(obs);
    if (!validation.ok) return validation;

    const payload = {
        cedula: String(cedula || '').trim(),
        anio,
        mes,
        observacion: obs
    };

    const tarifaEffective = Math.round(Number(draft?.tarifaEffective) || 0);
    const tarifaMaestro = Math.round(Number(draft?.tarifaMaestro) || 0);
    const tarifaDraft = draft?.tarifaDraft;
    if (tarifaDraft !== undefined && tarifaDraft !== '') {
        const val = Math.round(Number(tarifaDraft) || 0);
        if (val !== tarifaEffective) {
            payload.tarifaOverride = val === tarifaMaestro ? null : val;
        }
    }

    const montosNovedad = [];
    const items = Array.isArray(draft?.items) ? draft.items : [];
    const montosDraft = draft?.montosDraft || {};
    for (const item of items) {
        const id = String(item.id || '');
        if (!id) continue;
        const draftVal = montosDraft[id];
        if (draftVal === undefined || draftVal === '') continue;
        const current = Math.round(Number(item.montoCop) || 0);
        const master = Math.round(Number(item.montoMaestro ?? item.montoCop) || 0);
        const next = Math.round(Number(draftVal) || 0);
        if (next !== current) {
            montosNovedad.push({ novedadId: id, montoCop: next });
        } else if (item.montoAjustado && next === master) {
            montosNovedad.push({ novedadId: id, montoCop: null });
        }
    }
    if (montosNovedad.length) payload.montosNovedad = montosNovedad;

    if (payload.tarifaOverride === undefined && !payload.montosNovedad?.length) {
        return { ok: false, error: 'No hay cambios para guardar' };
    }

    return { ok: true, data: payload };
}

/**
 * Valida y arma payload acción masiva de revisión.
 */
export function buildFacturacionRevisionMasivaPayload(form, { cliente, anio, mes, cedulas, servicioId, etapaObjetivo }) {
    const obs = String(form.observacion || form.observaciones || '').trim();
    const validation = validateRevisionObservacion(obs);
    if (!validation.ok) return validation;

    const act = String(form.accion || 'aprobar').trim().toLowerCase();
    if (act !== 'aprobar' && act !== 'rechazar') {
        return { ok: false, error: 'Acción inválida' };
    }

    const etapa = normalizeEtapaObjetivo(etapaObjetivo);
    if (!etapa) {
        return { ok: false, error: 'Etapa objetivo inválida' };
    }

    const cedulasList = Array.isArray(cedulas)
        ? cedulas.map((c) => String(c || '').trim()).filter(Boolean)
        : [];
    if (!cedulasList.length) {
        return { ok: false, error: 'No hay consultores elegibles para esta etapa' };
    }

    const payload = {
        cliente: String(cliente || '').trim(),
        anio,
        mes,
        accion: act,
        observacion: obs,
        etapaObjetivo: etapa,
        cedulas: cedulasList
    };

    const sid = String(servicioId || '').trim();
    if (sid) payload.servicioId = sid;

    return { ok: true, data: payload };
}

/** Etapa de revisión masiva según rol, filas y etapa seleccionada. */
export function resolveMasivaEtapaForRows(role, rows, accion = 'aprobar', etapaObjetivo = null) {
    const etapaFija = normalizeEtapaObjetivo(etapaObjetivo);
    if (etapaFija) return etapaFija;

    const eligible = filterMasivaEligibleRows(role, rows, accion);
    if (!eligible.length) return null;

    const r = normalizeRole(role);
    if (r === 'analista_conciliaciones') return 'ANALISTA';
    if (r === 'nomina') return 'NOMINA';
    if (ELEVATED_ROLES.has(r)) {
        return defaultMasivaEtapaObjetivo(role, rows, accion);
    }
    return null;
}

export function getMasivaRevisionDefaults(role, rows, accion = 'aprobar', etapaObjetivo = null) {
    const etapa = resolveMasivaEtapaForRows(role, rows, accion, etapaObjetivo);
    const eligible = etapa
        ? filterMasivaEligibleRows(role, rows, accion, etapa)
        : filterMasivaEligibleRows(role, rows, accion);
    if (etapa === 'NOMINA') {
        const canRechazar = filterMasivaEligibleRows(role, rows, 'rechazar', 'NOMINA').length > 0;
        return {
            accionDefault: 'aprobar',
            canRechazar,
            aprobarLabel: 'Aprobar cierres',
            rechazarLabel: 'Rechazar cierres',
            title: 'Aprobación masiva — Nómina',
            etapa,
            eligibleCount: eligible.length
        };
    }
    if (etapa === 'ANALISTA') {
        return {
            accionDefault: 'aprobar',
            canRechazar: false,
            aprobarLabel: 'Enviar a Nómina',
            rechazarLabel: null,
            title: 'Aprobación masiva — Analista',
            etapa,
            eligibleCount: eligible.length
        };
    }
    return {
        accionDefault: 'aprobar',
        canRechazar: false,
        aprobarLabel: 'Aprobar',
        rechazarLabel: null,
        title: 'Aprobación masiva',
        etapa: null,
        eligibleCount: 0
    };
}

/** Actualiza estado de una fila en memoria tras revisión individual. */
export function patchFacturacionRowEstado(rows, cedula, estado) {
    const cedNorm = normalizeCedula(cedula);
    if (!cedNorm) return rows;
    return (Array.isArray(rows) ? rows : []).map((row) =>
        normalizeCedula(row?.cedula) === cedNorm ? { ...row, estado: normalizeEstado(estado) } : row
    );
}

/** Estado resultante tras aprobar/rechazar en revisión individual. */
export function resolveEstadoTrasRevisionIndividual(prevEst, revisionAccion) {
    let nextEst = normalizeEstado(prevEst);
    const act = String(revisionAccion || '').trim().toLowerCase();
    if (act === 'aprobar') {
        if (nextEst === 'PENDIENTE' || nextEst === 'DEVUELTA') nextEst = 'APROBADO_ANALISTA';
        else if (nextEst === 'APROBADO_ANALISTA') nextEst = 'APROBADO_FINANZAS';
    } else if (act === 'rechazar' && nextEst === 'APROBADO_ANALISTA') {
        nextEst = 'DEVUELTA';
    }
    return nextEst;
}

/** Estado resultante tras aprobación masiva por etapa objetivo. */
export function resolveEstadoTrasMasivaAprobar(prevEst, etapaObjetivo) {
    const est = normalizeEstado(prevEst);
    const etapa = normalizeEtapaObjetivo(etapaObjetivo);
    if (etapa === 'NOMINA' && est === 'APROBADO_ANALISTA') return 'APROBADO_FINANZAS';
    if (etapa === 'ANALISTA' && (est === 'PENDIENTE' || est === 'DEVUELTA')) return 'APROBADO_ANALISTA';
    return resolveEstadoTrasRevisionIndividual(est, 'aprobar');
}

/** Patch optimista de varias filas tras aprobación masiva. */
export function patchFacturacionRowsMasivaAprobar(rows, cedulas, etapaObjetivo) {
    const set = new Set((Array.isArray(cedulas) ? cedulas : []).map((c) => normalizeCedula(c)).filter(Boolean));
    if (!set.size) return rows;
    return (Array.isArray(rows) ? rows : []).map((row) => {
        const ced = normalizeCedula(row?.cedula);
        if (!set.has(ced)) return row;
        return {
            ...row,
            estado: resolveEstadoTrasMasivaAprobar(row.estado, etapaObjetivo)
        };
    });
}

/**
 * Qué refrescar tras una mutación (sin tocar Dynamo directamente).
 * @param {{ hasServicioSel?: boolean, mutationKind?: string }} opts
 * @returns {{ resumen: boolean, cola: boolean, resumenSilent: boolean, colaBackground: boolean }}
 */
export function resolveRefreshTargets({ hasServicioSel, mutationKind } = {}) {
    const inWorkspace = Boolean(hasServicioSel);
    const kind = String(mutationKind || '').trim().toLowerCase();

    if (kind === 'servicio_estado') {
        return { resumen: false, cola: true, resumenSilent: false, colaBackground: true };
    }
    if (kind === 'revision' || kind === 'masiva') {
        return {
            resumen: inWorkspace,
            cola: false,
            resumenSilent: inWorkspace,
            colaBackground: false
        };
    }
    if (kind === 'ajustes' || kind === 'revert') {
        return {
            resumen: inWorkspace,
            cola: false,
            resumenSilent: inWorkspace,
            colaBackground: false
        };
    }
    if (inWorkspace) {
        return { resumen: true, cola: false, resumenSilent: true, colaBackground: false };
    }
    return { resumen: false, cola: true, resumenSilent: false, colaBackground: false };
}

/** Spinner de tabla solo en carga inicial (stale-while-revalidate). */
export function shouldShowTablaInitialLoading({ loadingResumen, refreshingResumen, rowCount }) {
    return Boolean(loadingResumen) && !refreshingResumen && !Number(rowCount);
}

export const COP_FORMATTER = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
});

export function formatCopCached(n) {
    return COP_FORMATTER.format(Number(n) || 0);
}

/** Inserta, actualiza o elimina un servicio en la lista local (evita refetch completo). */
export function mergeServicioInList(servicios, servicio, { removedId } = {}) {
    const list = Array.isArray(servicios) ? servicios : [];
    const rid = String(removedId || '').trim();
    if (rid) return list.filter((s) => String(s.id || '') !== rid);
    if (!servicio?.id) return list;
    const sid = String(servicio.id);
    const idx = list.findIndex((s) => String(s.id || '') === sid);
    if (idx >= 0) {
        const next = [...list];
        next[idx] = { ...next[idx], ...servicio };
        return next;
    }
    return [...list, servicio];
}

/**
 * Valida y arma payload acción masiva (legacy; solo super_admin/cac vía API directa).
 * @param {string[]|undefined} cedulas - si se envía, solo esas cédulas (p. ej. filtro activo).
 */
export function buildFacturacionMasivaPayload(form, { cliente, anio, mes, cedulas }) {
    const est = String(form.estado || 'PENDIENTE').trim();
    const validation = validateFacturacionForm({
        estado: est,
        fechaRadicacion: form.fechaRadicacion,
        motivoDevolucion: form.motivoDevolucion,
        requireProyecto: false
    });
    if (!validation.ok) return validation;

    const payload = {
        cliente: String(cliente || '').trim(),
        anio,
        mes,
        estado: est,
        facturaFv: trimOrNull(form.facturaFv),
        fechaRadicacion: trimOrNull(form.fechaRadicacion),
        motivoDevolucion: est === 'DEVUELTA' ? trimOrNull(form.motivoDevolucion) : null,
        observaciones: trimOrNull(form.observaciones)
    };

    if (Array.isArray(cedulas) && cedulas.length > 0) {
        payload.cedulas = cedulas.map((c) => String(c || '').trim()).filter(Boolean);
    }

    return { ok: true, data: payload };
}

/** Tiempo visible del banner de éxito en facturación (ms). */
export const FACTURACION_SUCCESS_BANNER_MS = 5000;

/**
 * Programa el cierre automático del banner de éxito.
 * @returns {() => void} cancelar el temporizador
 */
export function planSuccessBannerDismiss(onDismiss, ms = FACTURACION_SUCCESS_BANNER_MS) {
    if (typeof onDismiss !== 'function' || !Number.isFinite(ms) || ms <= 0) {
        return () => {};
    }
    const id = setTimeout(onDismiss, ms);
    return () => clearTimeout(id);
}

/** Tipos que incrementan la factura neta (bonificaciones / horas extra / disponibilidad). */
const NOVEDAD_TIPOS_SUMA = new Set(['Bonos', 'Hora Extra', 'Disponibilidad']);

export const HORAS_MES_LABORALES = 176;
export const DIAS_MES_FACTURACION = 30;

/** Novedad calculada que usa valor hora de la tarifa (modo HOURS). Incluye HE en suma. */
export function isNovedadCalculadaValorHora(row) {
    const calculado = Boolean(row?.montoCalculado || row?.montoOrigen === 'calculado');
    return calculado && (row?.medida === 'hours' || row?.medida === 'days');
}

/** Modo HOURS activo según props del servicio / API. */
export function isHoursBillingContext({ billingMode, baseHours, horasBaseMes } = {}) {
    if (horasBaseMes != null && Number(horasBaseMes) > 0) return true;
    const mode = String(billingMode || '').trim().toUpperCase();
    const bh = Number(baseHours);
    return mode === 'HOURS' && Number.isFinite(bh) && bh > 0;
}

/** Horas base del mes: baseHours en modo HOURS, si no 176. */
export function resolveHorasBaseMes({ billingMode, baseHours, horasBaseMes } = {}) {
    if (horasBaseMes != null && Number(horasBaseMes) > 0) return Number(horasBaseMes);
    const mode = String(billingMode || '').trim().toUpperCase();
    const bh = Number(baseHours);
    if (mode === 'HOURS' && Number.isFinite(bh) && bh > 0) return bh;
    return HORAS_MES_LABORALES;
}

export function computeValorHoraCop(tarifa, horasBaseMes) {
    const base = Number(horasBaseMes) || HORAS_MES_LABORALES;
    const t = Number(tarifa) || 0;
    if (base <= 0) return 0;
    return Math.round(t / base);
}

/** Alias explícito: tarifa mensual → valor hora. */
export function computeValorHoraFromTarifa(tarifa, horasBaseMes) {
    return computeValorHoraCop(tarifa, horasBaseMes);
}

/** Valor hora × baseHours → tarifa mensual COP. */
export function computeTarifaMesFromValorHora(valorHora, horasBaseMes) {
    const vh = Number(valorHora) || 0;
    const base = Number(horasBaseMes) || HORAS_MES_LABORALES;
    if (base <= 0) return 0;
    return Math.round(vh * base);
}

/** Valor hora × cantidad de horas → monto COP (novedad por horas, modo HOURS). */
export function computeMontoFromValorHoraCop(valorHora, cantidadHoras) {
    const vh = Number(valorHora) || 0;
    const q = Number(cantidadHoras) || 0;
    if (vh <= 0 || q <= 0) return 0;
    return Math.round(vh * q);
}

/** Modo HOURS: monto días = valorHora × días × (baseHours / 30). */
export function computeMontoNovedadDiasFromValorHora(valorHora, dias, horasBaseMes) {
    const vh = Number(valorHora) || 0;
    const d = Number(dias) || 0;
    const base = Number(horasBaseMes) || HORAS_MES_LABORALES;
    if (vh <= 0 || d <= 0) return 0;
    return Math.round(vh * d * (base / DIAS_MES_FACTURACION));
}

/**
 * Recalcula monto de novedad en edición según medida.
 * Modo HOURS: valorHora × cantidad (horas) o valorHora × días × baseHours/30.
 */
export function computeMontoNovedadPreview(row, { tarifa, horasBaseMes, valorHora, hoursMode = false } = {}) {
    const esCalculado = row?.montoOrigen === 'calculado' || row?.montoCalculado;
    if (!hoursMode) {
        if (!esCalculado && row?.medida !== 'hours') {
            return Number(row?.montoMaestro ?? row?.montoCop) || 0;
        }
    } else if (!esCalculado && row?.medida !== 'hours' && row?.medida !== 'days') {
        return Number(row?.montoMaestro ?? row?.montoCop) || 0;
    }
    const q = Number(row?.cantidad) || 0;
    const t = Number(tarifa) || 0;
    const vh =
        valorHora != null && valorHora !== ''
            ? Number(valorHora) || 0
            : computeValorHoraCop(t, horasBaseMes);

    if (row?.medida === 'days') {
        if (hoursMode) {
            const vhDefault = computeValorHoraCop(t, horasBaseMes);
            const vhNum = valorHora != null && valorHora !== '' ? Math.round(Number(valorHora)) : vhDefault;
            if (vhNum === vhDefault) return Math.round((t / DIAS_MES_FACTURACION) * q);
            return computeMontoNovedadDiasFromValorHora(vhNum, q, horasBaseMes);
        }
        return Math.round((t / DIAS_MES_FACTURACION) * q);
    }
    if (row?.medida === 'hours') {
        if (hoursMode) return computeMontoFromValorHoraCop(vh, q);
        return Math.round((t / horasBaseMes) * q);
    }
    return Number(row?.montoMaestro ?? row?.montoCop) || 0;
}

/** Muestra columna valor hora en desglose (modo HOURS). */
export function showHorasDesgloseColumn({ billingMode, baseHours, horasBaseMes } = {}) {
    if (horasBaseMes != null && Number(horasBaseMes) > 0) return true;
    const mode = String(billingMode || '').trim().toUpperCase();
    const bh = Number(baseHours);
    return mode === 'HOURS' && Number.isFinite(bh) && bh > 0;
}

function formatCopShort(n) {
    const x = Number(n) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}

/** Valor COP para celda valor hora (modo HOURS). null → celda vacía (—). */
export function formatValorDesgloseCell({ medida, valorHora, tarifaValorHora } = {}) {
    const vh = valorHora ?? tarifaValorHora;
    if (medida === 'tarifa' || medida === 'hours' || medida === 'days') {
        const n = Number(vh);
        return Number.isFinite(n) && n > 0 ? n : null;
    }
    return null;
}

/** @deprecated Use formatValorDesgloseCell */
export function formatHorasDesgloseCell(args = {}) {
    const n = formatValorDesgloseCell(args);
    if (n == null) return { primary: '—', secondary: null };
    return { primary: formatCopShort(n), secondary: null };
}

/**
 * Impacto de una novedad sobre la tarifa del consultor en conciliación.
 * @returns {'suma' | 'resta'}
 */
export function getNovedadImpactoFacturacion(tipoNovedad, row = null) {
    if (row?.impacto === 'suma' || row?.impacto === 'resta') return row.impacto;
    const tipo = String(tipoNovedad || '').trim();
    return NOVEDAD_TIPOS_SUMA.has(tipo) ? 'suma' : 'resta';
}

/** Suma de incrementos (bonos, HE, disponibilidad) en COP. */
export function computeNovedadesIncrementoCop(novedadesSumaCop) {
    return Math.round(Number(novedadesSumaCop) || 0);
}

/** Suma de deducciones (restas) en COP. */
export function computeNovedadesDeduccionCop(novedadesSumCop) {
    return Math.round(Number(novedadesSumCop) || 0);
}

/** Neto de novedades sobre la tarifa: incrementos − deducciones. */
export function computeNovedadesImpactoNetCop(novedadesSumaCop, novedadesSumCop) {
    return computeNovedadesIncrementoCop(novedadesSumaCop) - computeNovedadesDeduccionCop(novedadesSumCop);
}

/** Neto de saldo anticipo: valor explícito si existe, si no incrementos − deducciones del ajuste. */
export function resolveSaldoAnticipoNetCop(saldoNetRaw, ajusteSuma, ajusteResta) {
    if (saldoNetRaw != null && saldoNetRaw !== '') {
        return Math.round(Number(saldoNetRaw));
    }
    return Math.round(Number(ajusteSuma) || 0) - Math.round(Number(ajusteResta) || 0);
}

/** Etiqueta de saldo anticipo para UI. */
export function formatSaldoAnticipoLabel(tipo, mesLabel) {
    const mes = mesLabel ? ` (${mesLabel})` : '';
    if (tipo === 'favor') return `Saldo a favor${mes}`;
    if (tipo === 'contra') return `Saldo en contra${mes}`;
    return '';
}

/** Totales de ajuste anticipo para fila o detalle. */
export function computeAdvanceDisplayTotals(source = {}) {
    const ajusteSuma = Math.round(Number(source.ajusteAnticipoSumaCop) || 0);
    const ajusteResta = Math.round(Number(source.ajusteAnticipoSumCop) || 0);
    const net = resolveSaldoAnticipoNetCop(source.saldoAnticipoNetCop, ajusteSuma, ajusteResta);
    return {
        ajusteAnticipoSumaCop: ajusteSuma,
        ajusteAnticipoSumCop: ajusteResta,
        saldoAnticipoNetCop: net,
        saldoAnticipoTipo: source.saldoAnticipoTipo ?? (net > 0 ? 'contra' : net < 0 ? 'favor' : null),
        ajusteAnticipoMesLabel: source.ajusteAnticipoMesLabel ?? null,
        billingAdvanceMode: Boolean(source.billingAdvanceMode)
    };
}

/** Total neto del desglose; con items cargados recalcula desde la lista (coherente con filas visibles). */
export function computeFacturaLedgerTotal(tarifaCliente, items, facturaCop = null, options = {}) {
    let total = Number(tarifaCliente) || 0;
    const advanceMode = Boolean(options.billingAdvanceMode);
    if (Array.isArray(items)) {
        for (const row of items) {
            if (advanceMode && row.scope === 'periodo_actual') continue;
            const monto = Number(row.montoCop);
            if (!Number.isFinite(monto) || monto === 0) continue;
            const impacto = getNovedadImpactoFacturacion(row.tipoNovedad, row);
            total += impacto === 'suma' ? monto : -monto;
        }
        return total;
    }
    if (facturaCop != null && facturaCop !== '') return Number(facturaCop) || 0;
    return total;
}

/** Mensaje de éxito tras guardar. */
export function facturacionSuccessMessage(kind, meta = {}) {
    if (kind === 'individual') {
        return `Facturación guardada para ${meta.nombre || meta.cedula || 'colaborador'}.`;
    }
    if (kind === 'revision_aprobada') {
        return `Cierre aprobado para ${meta.nombre || meta.cedula || 'colaborador'}.`;
    }
    if (kind === 'revision_rechazada') {
        return `Cierre rechazado para ${meta.nombre || meta.cedula || 'colaborador'}.`;
    }
    if (kind === 'ajustes') {
        return `Montos ajustados para ${meta.nombre || meta.cedula || 'colaborador'}.`;
    }
    if (kind === 'masiva') {
        return `Aprobación aplicada a ${meta.updated ?? 0} consultor(es).`;
    }
    return 'Cambios guardados correctamente.';
}

/** Solo analista (o super_admin) puede revertir cierres activos. */
export function canRevertConciliacionCierre(role, estado, cerrado = true) {
    const r = normalizeRole(role);
    if (r !== 'analista_conciliaciones' && r !== 'super_admin') return false;
    if (!cerrado) return false;
    const est = normalizeEstado(estado);
    return est !== 'PENDIENTE';
}

/** Servicio completo: todos los consultores en APROBADO_FINANZAS o CONCILIADA. */
export function isServicioCompletoFinanzas(rows, cedulas) {
    const set = new Set((cedulas || []).map((c) => String(c || '').replace(/\D/g, '')).filter(Boolean));
    const filtered = set.size
        ? (Array.isArray(rows) ? rows : []).filter((r) => set.has(String(r?.cedula || '').replace(/\D/g, '')))
        : [];
    if (!filtered.length) return false;
    return filtered.every((r) => {
        const e = normalizeEstado(r?.estado);
        return e === 'APROBADO_FINANZAS' || e === 'CONCILIADA';
    });
}

export function canExportServicioCompleto(role) {
    const r = normalizeRole(role);
    return (
        r === 'analista_conciliaciones' ||
        r === 'nomina' ||
        r === 'super_admin' ||
        r === 'cac'
    );
}

export const ESTADOS_SERVICIO = ['EN_REVISION', 'LISTO_EXPORT', 'ENVIADA', 'CONCILIADA'];

export const ESTADOS_SERVICIO_META = [
    {
        key: 'EN_REVISION',
        label: 'En revisión',
        shortLabel: 'Revisión',
        description: 'Cierre en curso por consultor'
    },
    {
        key: 'LISTO_EXPORT',
        label: 'Listo export',
        shortLabel: 'Listo Excel',
        description: 'Todos aprobados en finanzas; puede descargar Excel'
    },
    {
        key: 'ENVIADA',
        label: 'Enviada',
        shortLabel: 'Enviada',
        description: 'Excel descargado; paquete enviado'
    },
    {
        key: 'CONCILIADA',
        label: 'Conciliada',
        shortLabel: 'Conciliada',
        description: 'Cierre del servicio confirmado por analista'
    }
];

export function normalizeEstadoServicio(value) {
    const v = String(value || '').trim().toUpperCase();
    return ESTADOS_SERVICIO.includes(v) ? v : 'EN_REVISION';
}

export function canMarcarServicioConciliada(role, estadoServicio) {
    const r = normalizeRole(role);
    if (r !== 'analista_conciliaciones' && r !== 'super_admin') return false;
    return normalizeEstadoServicio(estadoServicio) === 'ENVIADA';
}

/** Solo lectura cuando finanzas completas y servicio conciliado a nivel servicio/mes. */
export function isServicioCierreReadonly(estadoServicio) {
    return normalizeEstadoServicio(estadoServicio) === 'CONCILIADA';
}

export function servicioListoExportExcel(estadoServicio) {
    const e = normalizeEstadoServicio(estadoServicio);
    return e === 'LISTO_EXPORT' || e === 'ENVIADA' || e === 'CONCILIADA';
}

/**
 * Badge principal de la tarjeta de cola: refleja estadoServicio (Enviada/Conciliada),
 * no el estadoCola legacy «Conciliado» (= solo finanzas completas).
 */
export function resolveTarjetaCierreBadge(item) {
    const servicio = normalizeEstadoServicio(item?.estadoServicio);
    if (servicio === 'CONCILIADA') {
        return { chipKey: 'SERVICIO_CONCILIADA', label: 'Conciliada' };
    }
    if (servicio === 'ENVIADA') {
        return { chipKey: 'SERVICIO_ENVIADA', label: 'Enviada' };
    }
    const cola = String(item?.estadoCola || 'PENDIENTE');
    if (servicio === 'LISTO_EXPORT' || cola === 'CONCILIADA') {
        return { chipKey: 'SERVICIO_LISTO_EXPORT', label: 'Listo export' };
    }
    return { chipKey: cola, label: COLA_ESTADO_LABELS[cola] || cola };
}

/** Actualiza estadoServicio de un ítem de cola (p. ej. tras descargar Excel). */
export function patchColaItemEstadoServicio(items, servicioId, estadoServicio) {
    const sid = String(servicioId || '').trim();
    const est = normalizeEstadoServicio(estadoServicio);
    if (!sid) return items;
    return (Array.isArray(items) ? items : []).map((i) =>
        String(i.servicioId) === sid ? { ...i, estadoServicio: est } : i
    );
}

/**
 * Estado visible por fila de consultor: hereda Enviada/Conciliada del servicio
 * cuando el consultor ya está en finanzas.
 * @returns {{ displayKey: string, label: string, workflowEstado: string }}
 */
export function resolveFilaEstadoDisplay(rowEstado, estadoServicio) {
    const workflowEstado = normalizeEstado(rowEstado);
    const serv = normalizeEstadoServicio(estadoServicio);
    const finanzasOk = workflowEstado === 'APROBADO_FINANZAS' || workflowEstado === 'CONCILIADA';

    if (finanzasOk && serv === 'CONCILIADA') {
        return { displayKey: 'CONCILIADA', label: 'Conciliada', workflowEstado };
    }
    if (finanzasOk && serv === 'ENVIADA') {
        return { displayKey: 'SERVICIO_ENVIADA', label: 'Enviada', workflowEstado };
    }
    if (finanzasOk && serv === 'LISTO_EXPORT') {
        return { displayKey: 'SERVICIO_LISTO_EXPORT', label: 'Listo export', workflowEstado };
    }

    const meta = ESTADOS_FACTURACION_META.find((m) => m.key === workflowEstado);
    return {
        displayKey: workflowEstado,
        label: meta?.label || workflowEstado,
        workflowEstado
    };
}

/** Conteo lun–vie del mes de facturación, opcionalmente excluyendo festivos. */
export function countBusinessDaysInMonth(year, month, festivosSet) {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return 0;
    const daysInMonth = new Date(y, m, 0).getDate();
    let count = 0;
    for (let d = 1; d <= daysInMonth; d += 1) {
        const ymd = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dow = new Date(`${ymd}T12:00:00`).getDay();
        if (dow === 0 || dow === 6) continue;
        if (festivosSet instanceof Set && festivosSet.has(ymd)) continue;
        count += 1;
    }
    return count;
}

/** Referencia de días base según billingMode (solo visualización; no altera montos). */
export function resolveDiasBaseMesDisplay({ billingMode, year, month, festivosSet = null, festivosLoaded = false }) {
    const mode = String(billingMode || '').trim().toUpperCase();
    if (mode === 'CALENDAR_DAYS') {
        return {
            diasBaseMes: DIAS_MES_FACTURACION,
            diasBaseLabel: 'Días calendario (estándar)',
            festivosAplicados: false
        };
    }
    if (mode === 'BUSINESS_DAYS') {
        const festivosOk = Boolean(festivosLoaded && festivosSet instanceof Set);
        return {
            diasBaseMes: countBusinessDaysInMonth(year, month, festivosOk ? festivosSet : null),
            diasBaseLabel: 'Días hábiles del mes',
            festivosAplicados: festivosOk
        };
    }
    return { diasBaseMes: null, diasBaseLabel: null, festivosAplicados: false };
}

export function formatDiasBaseMesLine({ diasBaseMes, diasBaseLabel, monthLabel, festivosAplicados, billingMode }) {
    if (diasBaseMes == null || !diasBaseLabel) return null;
    const mode = String(billingMode || '').trim().toUpperCase();
    if (mode === 'BUSINESS_DAYS') {
        const note = festivosAplicados ? '' : ' (festivos no disponibles)';
        return `${diasBaseLabel}${monthLabel ? ` (${monthLabel})` : ''}: ${diasBaseMes}${note}`;
    }
    return `${diasBaseLabel}: ${diasBaseMes}`;
}
