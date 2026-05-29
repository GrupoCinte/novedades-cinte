/** Estados de conciliación / facturación (alineado con backend Zod). */
export const ESTADOS_FACTURACION = ['PENDIENTE', 'ENVIADA', 'DEVUELTA', 'CONCILIADA', 'RADICADA'];

export const ESTADOS_FACTURACION_META = [
    { key: 'PENDIENTE', label: 'Pendiente', pill: 'text-amber-500 border-amber-500/30 bg-amber-500/10' },
    { key: 'ENVIADA', label: 'Enviada', pill: 'text-blue-500 border-blue-500/30 bg-blue-500/10' },
    { key: 'DEVUELTA', label: 'Devuelta', pill: 'text-red-500 border-red-500/30 bg-red-500/10' },
    { key: 'CONCILIADA', label: 'Conciliada', pill: 'text-[#65BCF7] border-[#2F7BB8]/30 bg-[#2F7BB8]/10' },
    { key: 'RADICADA', label: 'Radicada', pill: 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10' }
];

const SEGMENT_DOT = {
    PENDIENTE: 'bg-amber-500',
    ENVIADA: 'bg-blue-500',
    DEVUELTA: 'bg-red-500',
    CONCILIADA: 'bg-[#65BCF7]',
    RADICADA: 'bg-emerald-500'
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

/** Pills de resumen (Pendiente, Enviada, …): solo en vista «Todos / seleccionar». */
export function shouldShowFacturacionEstadosResumen(isTodosClientes) {
    return Boolean(isTodosClientes);
}

/** Acción grupal: solo con un cliente concreto seleccionado. */
export function shouldShowFacturacionAccionGrupal(isTodosClientes) {
    return !Boolean(isTodosClientes);
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
    return (Array.isArray(rows) ? rows : []).reduce(
        (acc, r) => {
            const est = r.estado || 'PENDIENTE';
            if (ESTADOS_FACTURACION.includes(est)) acc[est] = (acc[est] || 0) + 1;
            return acc;
        },
        { PENDIENTE: 0, ENVIADA: 0, DEVUELTA: 0, CONCILIADA: 0, RADICADA: 0 }
    );
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
    if (!Array.isArray(rows) || !rows.length || !totales) return totales;

    const cerradosCount = rows.filter((r) => r.cerrado).length;
    const estados = rows.reduce(
        (acc, r) => {
            const est = r.estado || 'PENDIENTE';
            acc[est] = (acc[est] || 0) + 1;
            return acc;
        },
        { PENDIENTE: 0, ENVIADA: 0, DEVUELTA: 0, CONCILIADA: 0, RADICADA: 0 }
    );

    return {
        ...totales,
        cerradosCount,
        pendientesCount: rows.length - cerradosCount,
        estados
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
export function validateFacturacionForm({ proyecto, estado, facturaFv, fechaRadicacion, motivoDevolucion, requireProyecto = true }) {
    const est = String(estado || 'PENDIENTE').trim();
    if (!ESTADOS_FACTURACION.includes(est)) {
        return { ok: false, error: 'Estado de conciliación inválido' };
    }
    if (requireProyecto && !String(proyecto || '').trim()) {
        return { ok: false, error: 'El proyecto es obligatorio' };
    }
    if (est === 'RADICADA' || est === 'ENVIADA') {
        if (!String(facturaFv || '').trim()) {
            return { ok: false, error: 'El número de factura (FV) es obligatorio para este estado' };
        }
        if (!String(fechaRadicacion || '').trim()) {
            return { ok: false, error: 'La fecha de radicación es obligatoria para este estado' };
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fechaRadicacion).trim())) {
            return { ok: false, error: 'La fecha de radicación debe tener formato AAAA-MM-DD' };
        }
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
    const needsRadicacion = est === 'RADICADA' || est === 'ENVIADA';
    return {
        cedula: String(cedula || '').trim(),
        anio,
        mes,
        proyecto: trimOrNull(form.proyecto),
        observaciones: trimOrNull(form.observaciones),
        estado: est,
        facturaFv: needsRadicacion ? trimOrNull(form.facturaFv) : null,
        fechaRadicacion: needsRadicacion ? trimOrNull(form.fechaRadicacion) : null,
        motivoDevolucion: est === 'DEVUELTA' ? trimOrNull(form.motivoDevolucion) : null
    };
}

/**
 * Valida y arma payload acción masiva.
 * @param {string[]|undefined} cedulas - si se envía, solo esas cédulas (p. ej. filtro activo).
 */
export function buildFacturacionMasivaPayload(form, { cliente, anio, mes, cedulas }) {
    const est = String(form.estado || 'PENDIENTE').trim();
    const validation = validateFacturacionForm({
        estado: est,
        facturaFv: form.facturaFv,
        fechaRadicacion: form.fechaRadicacion,
        motivoDevolucion: form.motivoDevolucion,
        requireProyecto: false
    });
    if (!validation.ok) return validation;

    const needsRadicacion = est === 'RADICADA' || est === 'ENVIADA';
    const payload = {
        cliente: String(cliente || '').trim(),
        anio,
        mes,
        estado: est,
        facturaFv: needsRadicacion ? trimOrNull(form.facturaFv) : null,
        fechaRadicacion: needsRadicacion ? trimOrNull(form.fechaRadicacion) : null,
        motivoDevolucion: est === 'DEVUELTA' ? trimOrNull(form.motivoDevolucion) : null
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

/** Mensaje de éxito tras guardar. */
export function facturacionSuccessMessage(kind, meta = {}) {
    if (kind === 'individual') {
        return `Facturación guardada para ${meta.nombre || meta.cedula || 'colaborador'}.`;
    }
    if (kind === 'masiva') {
        return `Acción grupal aplicada a ${meta.updated ?? 0} colaborador(es).`;
    }
    return 'Cambios guardados correctamente.';
}
