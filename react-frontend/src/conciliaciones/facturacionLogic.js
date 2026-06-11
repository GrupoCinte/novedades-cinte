/** Estados de conciliación / facturación (alineado con backend Zod). */
export const ESTADOS_FACTURACION = ['PENDIENTE', 'ENVIADA', 'DEVUELTA', 'CONCILIADA', 'RADICADA'];

export const ESTADOS_FACTURACION_META = [
    {
        key: 'PENDIENTE',
        label: 'Pendiente',
        pillLight: 'border-amber-300 bg-amber-50 text-amber-900',
        pillDark: 'border-amber-500/40 bg-amber-500/15 text-amber-200',
        pill: 'text-amber-700 border-amber-300 bg-amber-50'
    },
    {
        key: 'ENVIADA',
        label: 'Enviada',
        pillLight: 'border-blue-300 bg-blue-50 text-blue-900',
        pillDark: 'border-blue-500/40 bg-blue-500/15 text-blue-200',
        pill: 'text-blue-700 border-blue-300 bg-blue-50'
    },
    {
        key: 'DEVUELTA',
        label: 'Devuelta',
        pillLight: 'border-rose-300 bg-rose-50 text-rose-900',
        pillDark: 'border-rose-500/40 bg-rose-500/15 text-rose-200',
        pill: 'text-rose-700 border-rose-300 bg-rose-50'
    },
    {
        key: 'CONCILIADA',
        label: 'Conciliada',
        pillLight: 'border-cyan-300 bg-cyan-50 text-cyan-900',
        pillDark: 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200',
        pill: 'text-cyan-800 border-cyan-300 bg-cyan-50'
    },
    {
        key: 'RADICADA',
        label: 'Radicada',
        pillLight: 'border-emerald-300 bg-emerald-50 text-emerald-900',
        pillDark: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
        pill: 'text-emerald-700 border-emerald-300 bg-emerald-50'
    }
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

const STEP_CIRCLE_FILLED = {
    PENDIENTE: {
        light: 'border-amber-500 bg-amber-500 text-white shadow-[0_0_8px_rgba(245,158,11,0.45)]',
        dark: 'border-amber-400 bg-amber-500/85 text-white shadow-[0_0_10px_rgba(245,158,11,0.35)]'
    },
    ENVIADA: {
        light: 'border-blue-500 bg-blue-500 text-white shadow-[0_0_8px_rgba(59,130,246,0.45)]',
        dark: 'border-blue-400 bg-blue-500/85 text-white shadow-[0_0_10px_rgba(59,130,246,0.35)]'
    },
    DEVUELTA: {
        light: 'border-rose-500 bg-rose-500 text-white shadow-[0_0_8px_rgba(244,63,94,0.4)]',
        dark: 'border-rose-400 bg-rose-500/85 text-white shadow-[0_0_10px_rgba(244,63,94,0.32)]'
    },
    CONCILIADA: {
        light: 'border-[#2F7BB8] bg-[#2F7BB8] text-white shadow-[0_0_8px_rgba(47,123,184,0.45)]',
        dark: 'border-[#65BCF7] bg-[#2F7BB8]/90 text-white shadow-[0_0_10px_rgba(101,188,247,0.38)]'
    },
    RADICADA: {
        light: 'border-emerald-500 bg-emerald-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.4)]',
        dark: 'border-emerald-400 bg-emerald-500/85 text-white shadow-[0_0_10px_rgba(16,185,129,0.32)]'
    }
};

const STEP_LABEL_FILLED = {
    PENDIENTE: { light: 'text-amber-700', dark: 'text-amber-300' },
    ENVIADA: { light: 'text-blue-700', dark: 'text-blue-300' },
    DEVUELTA: { light: 'text-rose-700', dark: 'text-rose-300' },
    CONCILIADA: { light: 'text-[#2F7BB8]', dark: 'text-[#65BCF7]' },
    RADICADA: { light: 'text-emerald-700', dark: 'text-emerald-300' }
};

const STEP_CONNECTOR = {
    PENDIENTE: { light: 'bg-amber-400', dark: 'bg-amber-500/55' },
    ENVIADA: { light: 'bg-blue-400', dark: 'bg-blue-500/55' },
    DEVUELTA: { light: 'bg-rose-400', dark: 'bg-rose-500/55' },
    CONCILIADA: { light: 'bg-[#65BCF7]', dark: 'bg-[#65BCF7]/55' },
    RADICADA: { light: 'bg-emerald-400', dark: 'bg-emerald-500/55' }
};

/** Círculo del stepper (estilo En ingreso / TaskProgressCompact). */
export function conciliacionEstadoStepCircleClass(meta, isLight, { activeFilter = false, hasCount = false } = {}) {
    const mode = isLight ? 'light' : 'dark';
    const base =
        'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold tabular-nums transition-all duration-300 sm:h-10 sm:w-10 sm:text-xs';

    if (activeFilter) {
        return `${base} ${
            isLight
                ? 'border-[#2F7BB8] bg-cyan-50 text-[#2F7BB8] shadow-[0_0_14px_rgba(47,123,184,0.4)] animate-pulse'
                : 'border-[#65BCF7] bg-[#2F7BB8]/25 text-[#65BCF7] shadow-[0_0_16px_rgba(101,188,247,0.5)] animate-pulse'
        }`;
    }
    if (hasCount) {
        return `${base} ${STEP_CIRCLE_FILLED[meta.key]?.[mode] || STEP_CIRCLE_FILLED.PENDIENTE[mode]}`;
    }
    return `${base} ${
        isLight ? 'border-slate-300 bg-white text-slate-400' : 'border-slate-700 bg-transparent text-slate-600'
    }`;
}

/** Etiqueta bajo el círculo del stepper. */
export function conciliacionEstadoStepLabelClass(meta, isLight, { activeFilter = false, hasCount = false } = {}) {
    const mode = isLight ? 'light' : 'dark';
    const base = 'mt-2 max-w-[5.5rem] text-center text-[10px] font-semibold leading-tight sm:text-[11px]';
    if (activeFilter) {
        return `${base} ${isLight ? 'text-[#2F7BB8]' : 'text-[#65BCF7]'}`;
    }
    if (hasCount) {
        return `${base} ${STEP_LABEL_FILLED[meta.key]?.[mode] || (isLight ? 'text-slate-700' : 'text-slate-300')}`;
    }
    return `${base} ${isLight ? 'text-slate-400' : 'text-slate-500'}`;
}

/** Conector horizontal entre pasos. */
export function conciliacionEstadoStepConnectorClass(meta, isLight, filled = false) {
    const mode = isLight ? 'light' : 'dark';
    const tone = filled
        ? STEP_CONNECTOR[meta.key]?.[mode] || (isLight ? 'bg-slate-300' : 'bg-slate-600/50')
        : isLight
          ? 'bg-slate-200'
          : 'bg-slate-700/50';
    return `mt-[1.125rem] h-0.5 w-6 shrink-0 transition-all duration-300 sm:mt-5 sm:w-10 md:w-14 ${tone}`;
}

/** Badge plano (legacy). */
export function conciliacionEstadoBadgeClass(meta, isLight = false, activeFilter = false) {
    const palette = isLight ? meta.pillLight : meta.pillDark;
    const ring = activeFilter
        ? isLight
            ? 'ring-2 ring-[#2F7BB8] ring-offset-2 ring-offset-white shadow-sm'
            : 'ring-2 ring-[#65BCF7] ring-offset-2 ring-offset-[#0b1220] shadow-sm'
        : '';
    return `inline-flex min-w-[7.25rem] items-center justify-center gap-2 rounded-lg border px-3.5 py-2 font-body text-sm font-semibold tabular-nums transition-all ${palette} ${ring} ${
        activeFilter ? 'brightness-105' : ''
    }`;
}

/** @deprecated Usar conciliacionEstadoBadgeClass */
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
export function validateFacturacionForm({
    proyecto,
    estado,
    facturaFv,
    fechaRadicacion,
    motivoDevolucion,
    horasFacturadas,
    requireHoras = false,
    requireProyecto = true
}) {
    const est = String(estado || 'PENDIENTE').trim();
    if (!ESTADOS_FACTURACION.includes(est)) {
        return { ok: false, error: 'Estado de conciliación inválido' };
    }
    if (requireProyecto && !String(proyecto || '').trim()) {
        return { ok: false, error: 'El proyecto es obligatorio' };
    }
    if (requireHoras) {
        const hrs = Number(horasFacturadas);
        if (!Number.isFinite(hrs) || hrs <= 0) {
            return { ok: false, error: 'Las horas facturadas son obligatorias para la regla Horas base' };
        }
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
        horasFacturadas: form.horasFacturadas !== undefined && form.horasFacturadas !== null && form.horasFacturadas !== ''
            ? Number(form.horasFacturadas) || 0
            : undefined,
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
