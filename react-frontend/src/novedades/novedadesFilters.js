/** Primer y último día (YYYY-MM-DD) del mes 0–11 en `year`, para filtros de creación. */
export function creadoEnRangeForMonthIndex(monthIndex, year) {
    const mi = Number(monthIndex);
    if (!Number.isFinite(mi) || mi < 0 || mi > 11) return { desde: '', hasta: '' };
    const y = Number(year);
    if (!Number.isFinite(y)) return { desde: '', hasta: '' };
    const pad = (n) => String(n).padStart(2, '0');
    const lastDay = new Date(y, mi + 1, 0).getDate();
    return {
        desde: `${y}-${pad(mi + 1)}-01`,
        hasta: `${y}-${pad(mi + 1)}-${pad(lastDay)}`
    };
}

/** Devuelve índice de mes 0–11 si el rango coincide con un mes completo del año dado. */
export function mesIndexFromCreadoEnRange(desde, hasta, year = new Date().getFullYear()) {
    if (!desde || !hasta) return '';
    for (let i = 0; i < 12; i += 1) {
        const r = creadoEnRangeForMonthIndex(i, year);
        if (r.desde === desde && r.hasta === hasta) return String(i);
    }
    return '';
}

const MS_DAY = 86400000;

function toIsoDate(input) {
    if (!input) return '';
    const asString = String(input);
    if (/^\d{4}-\d{2}-\d{2}$/.test(asString)) return asString;
    const parsed = new Date(asString);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
}

function matchesLeadTimeBucket(it, bucket) {
    if (!/^[0-3]$/.test(String(bucket || ''))) return true;
    const estado = String(it.estado || '');
    let decisionIso = '';
    if (estado === 'Aprobado') decisionIso = it.aprobadoEn || '';
    else if (estado === 'Rechazado') decisionIso = it.rechazadoEn || '';
    else return false;
    if (!it.creadoEn || !decisionIso) return false;
    const c0 = new Date(it.creadoEn);
    const c1 = new Date(decisionIso);
    if (Number.isNaN(c0.getTime()) || Number.isNaN(c1.getTime())) return false;
    const ms = c1 - c0;
    if (ms <= 0) return false;
    const b = String(bucket);
    if (b === '0') return ms < MS_DAY;
    if (b === '1') return ms >= MS_DAY && ms < 3 * MS_DAY;
    if (b === '2') return ms >= 3 * MS_DAY && ms < 7 * MS_DAY;
    return ms >= 7 * MS_DAY;
}

export const EMPTY_NOVEDADES_FILTERS = {
    fTipo: '',
    fEstado: '',
    fNombre: '',
    fCliente: '',
    fCreadoDesde: '',
    fCreadoHasta: '',
    fGpUserId: '',
    fLeadTimeBucket: '',
    fNominaProcesado: '',
    fFechaInicioDesde: '',
    fFechaInicioHasta: ''
};

/** Resumen para el chip de filtros activos. */
export function buildFiltrosResumen(filters) {
    const parts = [];
    let n = 0;
    const {
        fTipo, fEstado, fNombre, fCliente, fCreadoDesde, fCreadoHasta, fGpUserId, fLeadTimeBucket,
        fNominaProcesado, fFechaInicioDesde, fFechaInicioHasta
    } = filters || {};

    if (String(fTipo || '').trim()) {
        n += 1;
        parts.push(`Tipo: ${fTipo}`);
    }
    if (String(fEstado || '').trim()) {
        n += 1;
        parts.push(`Estado: ${fEstado}`);
    }
    const nom = String(fNombre || '').trim();
    if (nom) {
        n += 1;
        parts.push(nom.length > 22 ? `${nom.slice(0, 20)}…` : nom);
    }
    if (String(fCliente || '').trim()) {
        n += 1;
        const c = fCliente;
        parts.push(c.length > 26 ? `${c.slice(0, 24)}…` : c);
    }
    if (String(fCreadoDesde || '').trim() || String(fCreadoHasta || '').trim()) {
        n += 1;
        parts.push('Rango fechas');
    }
    if (String(fGpUserId || '').trim()) {
        n += 1;
        parts.push('GP');
    }
    if (String(fLeadTimeBucket || '').trim() && /^[0-3]$/.test(fLeadTimeBucket)) {
        const leadLabels = ['≤24 h', '1–3 d', '3–7 d', '>7 d'];
        n += 1;
        parts.push(`Tiempo decisión: ${leadLabels[Number(fLeadTimeBucket)] || fLeadTimeBucket}`);
    }
    if (String(fNominaProcesado || '').trim() === 'si') {
        n += 1;
        parts.push('Procesado nómina');
    } else if (String(fNominaProcesado || '').trim() === 'no') {
        n += 1;
        parts.push('Pendiente nómina');
    }
    if (String(fFechaInicioDesde || '').trim() || String(fFechaInicioHasta || '').trim()) {
        n += 1;
        parts.push('F. inicio');
    }

    const head = parts.slice(0, 2).join(', ');
    const more = parts.length > 2 ? '…' : '';
    const chipLabel =
        n === 0
            ? 'Sin filtros activos'
            : `${n} filtro${n === 1 ? '' : 's'} activo${n === 1 ? '' : 's'}${head ? ` (${head}${more})` : ''}`;

    return { chipLabel, activeCount: n };
}

/** Filtro client-side para Dashboard, Calendario, Análisis y Alertas HE (campos no soportados por API). */
export function applyClientSideFilters(items, filters) {
    const list = Array.isArray(items) ? items : [];
    const {
        fTipo, fEstado, fNombre, fCliente, fCreadoDesde, fCreadoHasta, fLeadTimeBucket,
        fNominaProcesado, fFechaInicioDesde, fFechaInicioHasta
    } = { ...EMPTY_NOVEDADES_FILTERS, ...filters };

    return list.filter((it) => {
        if (fTipo && it.tipoNovedad !== fTipo) return false;
        if (fEstado && it.estado !== fEstado) return false;
        if (fCliente) {
            const a = String(it.cliente || '').trim().toLowerCase();
            const b = String(fCliente).trim().toLowerCase();
            if (a !== b) return false;
        }
        if (fNombre) {
            const n = String(it.nombre || '').toLowerCase();
            const q = String(fNombre).trim().toLowerCase();
            if (!n.includes(q)) return false;
        }
        if (fCreadoDesde || fCreadoHasta) {
            const creado = toIsoDate(it.creadoEn);
            if (!creado) return false;
            if (fCreadoDesde && creado < fCreadoDesde) return false;
            if (fCreadoHasta && creado > fCreadoHasta) return false;
        }
        if (fLeadTimeBucket && !matchesLeadTimeBucket(it, fLeadTimeBucket)) return false;
        if (fNominaProcesado === 'si' && !it.nominaProcesado) return false;
        if (fNominaProcesado === 'no' && it.nominaProcesado) return false;
        if (fFechaInicioDesde || fFechaInicioHasta) {
            const fi = toIsoDate(it.fechaInicio);
            if (!fi) return false;
            if (fFechaInicioDesde && fi < fFechaInicioDesde) return false;
            if (fFechaInicioHasta && fi > fFechaInicioHasta) return false;
        }
        return true;
    });
}

/** Query params para API paginada de Gestión y export Excel. */
export function filtersToGestionParams(filters, { page, limit } = {}) {
    const {
        fTipo, fEstado, fNombre, fCliente, fCreadoDesde, fCreadoHasta, fGpUserId, fLeadTimeBucket,
        fNominaProcesado, fFechaInicioDesde, fFechaInicioHasta
    } = { ...EMPTY_NOVEDADES_FILTERS, ...filters };

    const params = {};
    if (page != null) params.page = String(page);
    if (limit != null) params.limit = String(limit);
    if (fTipo) params.tipo = fTipo;
    if (fEstado) params.estado = fEstado;
    if (fNombre) params.nombre = fNombre;
    if (fCliente) params.cliente = fCliente;
    if (fCreadoDesde) params.createdFrom = fCreadoDesde;
    if (fCreadoHasta) params.createdTo = fCreadoHasta;
    if (fGpUserId) params.gpUserId = fGpUserId;
    if (fLeadTimeBucket && /^[0-3]$/.test(fLeadTimeBucket)) params.leadTimeBucket = fLeadTimeBucket;
    if (fNominaProcesado === 'si' || fNominaProcesado === 'no') params.nominaProcesado = fNominaProcesado;
    if (fFechaInicioDesde) params.fechaInicioDesde = fFechaInicioDesde;
    if (fFechaInicioHasta) params.fechaInicioHasta = fFechaInicioHasta;
    return params;
}

/** Body `filters` para POST /api/novedades/nomina-procesar (snake/query style). */
export function filtersToNominaProcesarBody(filters) {
    const params = filtersToGestionParams(filters);
    return {
        tipo: params.tipo || '',
        estado: params.estado || '',
        nombre: params.nombre || '',
        cliente: params.cliente || '',
        createdFrom: params.createdFrom || '',
        createdTo: params.createdTo || '',
        gpUserId: params.gpUserId || '',
        leadTimeBucket: params.leadTimeBucket || '',
        nominaProcesado: params.nominaProcesado || '',
        fechaInicioDesde: params.fechaInicioDesde || '',
        fechaInicioHasta: params.fechaInicioHasta || ''
    };
}
