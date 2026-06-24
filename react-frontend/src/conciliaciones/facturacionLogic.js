/** Estados de conciliación / facturación (alineado con backend Zod). */
import { countEstadosFromRows as countEstadosFromRowsShared, aggregateServicioCierre } from './facturacionAggregate.js';

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

/**
 * Agrega conteos por estado a totales del mes.
 */
export function buildFacturacionTotales(rows, totales) {
    if (!Array.isArray(rows) || !rows.length) return totales || null;

    const cedulas = rows.map((r) => r.cedula);
    const agg = aggregateServicioCierre(rows, cedulas);

    return {
        ...(totales || {}),
        tarifaSum: agg.totales.tarifaSum,
        deduccionSum: agg.totales.deduccionSum,
        facturaSum: agg.totales.facturaSum,
        colaboradores: agg.consultoresTotal,
        conNovedad: agg.consultoresConNovedad,
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
export function filterMasivaEligibleRows(role, rows, accion = 'aprobar') {
    return (Array.isArray(rows) ? rows : []).filter((row) => canActOnEstado(role, row?.estado, accion));
}

/** Acciones de revisión visibles según rol y estado del cierre. */
export function getRevisionActionsForUser(role, estado) {
    const est = normalizeEstado(estado);
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
export function buildFacturacionRevisionPayload({ accion, observaciones }, { cedula, anio, mes }) {
    const obs = String(observaciones || '').trim();
    const validation = validateRevisionObservacion(obs);
    if (!validation.ok) return validation;

    const act = String(accion || '').trim().toLowerCase();
    if (act !== 'aprobar' && act !== 'rechazar') {
        return { ok: false, error: 'Acción inválida' };
    }

    return {
        ok: true,
        data: {
            cedula: String(cedula || '').trim(),
            anio,
            mes,
            accion: act,
            observacion: obs
        }
    };
}

/**
 * Valida y arma payload acción masiva de revisión.
 */
export function buildFacturacionRevisionMasivaPayload(form, { cliente, anio, mes, cedulas }) {
    const obs = String(form.observacion || form.observaciones || '').trim();
    const validation = validateRevisionObservacion(obs);
    if (!validation.ok) return validation;

    const act = String(form.accion || 'aprobar').trim().toLowerCase();
    if (act !== 'aprobar' && act !== 'rechazar') {
        return { ok: false, error: 'Acción inválida' };
    }

    const payload = {
        cliente: String(cliente || '').trim(),
        anio,
        mes,
        accion: act,
        observacion: obs
    };

    if (Array.isArray(cedulas) && cedulas.length > 0) {
        payload.cedulas = cedulas.map((c) => String(c || '').trim()).filter(Boolean);
    }

    return { ok: true, data: payload };
}

/** Etapa de revisión masiva según rol y filas elegibles para la acción. */
export function resolveMasivaEtapaForRows(role, rows, accion = 'aprobar') {
    const eligible = filterMasivaEligibleRows(role, rows, accion);
    if (!eligible.length) return null;

    const r = normalizeRole(role);
    if (r === 'analista_conciliaciones') return 'ANALISTA';
    if (r === 'nomina') return 'NOMINA';
    if (ELEVATED_ROLES.has(r)) {
        const estados = eligible.map((row) => normalizeEstado(row?.estado));
        const allNomina = estados.every((e) => e === 'APROBADO_ANALISTA');
        const allAnalista = estados.every((e) => e === 'PENDIENTE' || e === 'DEVUELTA');
        if (allNomina) return 'NOMINA';
        if (allAnalista) return 'ANALISTA';
        return 'MIXED';
    }
    return null;
}

export function getMasivaRevisionDefaults(role, rows, accion = 'aprobar') {
    const eligible = filterMasivaEligibleRows(role, rows, accion);
    const etapa = resolveMasivaEtapaForRows(role, rows, accion);
    if (etapa === 'NOMINA') {
        const canRechazar = filterMasivaEligibleRows(role, rows, 'rechazar').length > 0;
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
    if (etapa === 'MIXED') {
        return {
            accionDefault: 'aprobar',
            canRechazar: false,
            aprobarLabel: 'Aprobar elegibles',
            rechazarLabel: null,
            title: 'Aprobación masiva',
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

/**
 * Impacto de una novedad sobre la tarifa del consultor en conciliación.
 * @returns {'suma' | 'resta'}
 */
export function getNovedadImpactoFacturacion(tipoNovedad, row = null) {
    if (row?.impacto === 'suma' || row?.impacto === 'resta') return row.impacto;
    const tipo = String(tipoNovedad || '').trim();
    return NOVEDAD_TIPOS_SUMA.has(tipo) ? 'suma' : 'resta';
}

/** Total neto del desglose; con items cargados recalcula desde la lista (coherente con filas visibles). */
export function computeFacturaLedgerTotal(tarifaCliente, items, facturaCop = null) {
    let total = Number(tarifaCliente) || 0;
    if (Array.isArray(items)) {
        for (const row of items) {
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
    if (kind === 'masiva') {
        return `Aprobación aplicada a ${meta.updated ?? 0} consultor(es).`;
    }
    return 'Cambios guardados correctamente.';
}
