import { Component, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Pencil, Trash2 } from 'lucide-react';
import { useModuleTheme } from './moduleTheme.js';
import { buildGestionTableDash } from './gestionTableDashTheme.js';
import ModuleFiltersToolbar from './shared/filters/ModuleFiltersToolbar.jsx';
import ModuleFiltersDrawer from './shared/filters/ModuleFiltersDrawer.jsx';
import {
    buildReubicacionesChipLabel,
    REUBICACIONES_FILTER_DEFAULTS
} from './admin/directorioFilters.js';
import { nativeCalendarOnlyInputProps } from './nativeCalendarOnlyInputProps.js';
import { formatMoneyAmountOnly } from './multiCurrencyMoney.js';
import { ReubicacionesDetalleModal } from './ReubicacionesDetalleModal.jsx';
import ReubicacionesHistorialGlobal from './ReubicacionesHistorialGlobal.jsx';

function readCookie(name) {
    const raw = typeof document !== 'undefined' ? String(document.cookie || '') : '';
    if (!raw) return '';
    const parts = raw.split(';');
    for (const part of parts) {
        const [k, ...rest] = part.trim().split('=');
        if (k === name) return decodeURIComponent(rest.join('=') || '');
    }
    return '';
}

function authHeaders(token) {
    const headers = { 'Content-Type': 'application/json' };
    const t = String(token || '').trim();
    if (t) headers.Authorization = `Bearer ${t}`;
    const xsrf = readCookie('cinteXsrf');
    if (xsrf) headers['x-cinte-xsrf'] = xsrf;
    return headers;
}


/** Componente visual para estado de reubicaciones HU-05 */
export function EstadoBadge({ estado, dias_transcurridos, isLight }) {
    const s = String(estado || '');
    if (s === 'Pendiente') {
        return (
            <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isLight ? 'bg-emerald-100 text-emerald-900' : 'bg-emerald-900/45 text-emerald-100'
                }`}
            >
                Pendiente
            </span>
        );
    }
    if (s === 'En proceso') {
        const diaStr = (dias_transcurridos != null && dias_transcurridos > 0) ? ` · día ${dias_transcurridos}` : '';
        return (
            <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isLight ? 'bg-amber-100 text-amber-950' : 'bg-amber-900/45 text-amber-100'
                }`}
            >
                {`En proceso${diaStr}`}
                <AlertTriangle className={isLight ? 'h-3 w-3 shrink-0 text-amber-700' : 'h-3 w-3 shrink-0 text-amber-200'} aria-hidden />
            </span>
        );
    }
    if (s === 'Con novedad') {
        return (
            <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isLight ? 'bg-red-200/95 text-red-950' : 'bg-red-950/50 text-red-100'
                }`}
            >
                Con novedad
                <AlertTriangle className="h-3 w-3 shrink-0 text-red-100" aria-hidden />
            </span>
        );
    }
    return (
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${isLight ? 'bg-slate-100 text-slate-700' : 'bg-slate-800 text-slate-200'}`}>
            —
        </span>
    );
}

const ESTADO_CODES = ['Pendiente', 'En proceso', 'Con novedad'];
const ESTADO_LABELS = { 'Pendiente': 'Pendiente', 'En proceso': 'En proceso', 'Con novedad': 'Con novedad' };

function emptyForm() {
    return { cedula: '', fecha_fin: '', cliente_destino: '', causal: '' };
}

/**
 * @typedef {{ seq: number, reset?: boolean, fechaFinDesde?: string, fechaFinHasta?: string, estado?: string }} PipelineNavIntent
 */

export default function ReubicacionesPipelinePage(props) {
    return (
        <ReubicacionesPipelineErrorBoundary>
            <ReubicacionesPipelinePageInner {...props} />
        </ReubicacionesPipelineErrorBoundary>
    );
}

class ReubicacionesPipelineErrorBoundary extends Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    render() {
        if (this.state.error) {
            return (
                <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800/50 dark:bg-red-950/30 dark:text-red-100">
                    No se pudo mostrar Reubicaciones: {String(this.state.error?.message || this.state.error)}
                </div>
            );
        }
        return this.props.children;
    }
}

function ReubicacionesPipelinePageInner({ token, auth, navIntent }) { // nosonar
    const { isLight, field, labelMuted, headingAccent } = useModuleTheme();
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    
    
    const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);

    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [q, setQ] = useState('');
    const [appliedQ, setAppliedQ] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [msg, setMsg] = useState(null);

    const [fechaFinDesde, setFechaFinDesde] = useState('');
    const [fechaFinHasta, setFechaFinHasta] = useState('');
    const [estadoFiltro, setEstadoFiltro] = useState('');
    const [viewMode, setViewMode] = useState('reubicados');
    const [aptoFiltro, setAptoFiltro] = useState('');
    const [tipoEventoFiltro, setTipoEventoFiltro] = useState('');
    const [actorFiltro, setActorFiltro] = useState('');
    const [appliedFechaFinDesde, setAppliedFechaFinDesde] = useState('');
    const [appliedFechaFinHasta, setAppliedFechaFinHasta] = useState('');
    const [appliedEstadoFiltro, setAppliedEstadoFiltro] = useState('');
    const [appliedAptoFiltro, setAppliedAptoFiltro] = useState('');
    const [appliedTipoEventoFiltro, setAppliedTipoEventoFiltro] = useState('');
    const [appliedActorFiltro, setAppliedActorFiltro] = useState('');
    const [tipoFichaFiltro, setTipoFichaFiltro] = useState('');
    const [appliedTipoFichaFiltro, setAppliedTipoFichaFiltro] = useState('');
    const [clienteFiltro, setClienteFiltro] = useState('');
    const [appliedClienteFiltro, setAppliedClienteFiltro] = useState('');
    const [gpFiltro, setGpFiltro] = useState('');
    const [appliedGpFiltro, setAppliedGpFiltro] = useState('');
    const [diasRestantesDesde, setDiasRestantesDesde] = useState('');
    const [diasRestantesHasta, setDiasRestantesHasta] = useState('');
    const [appliedDiasRestantesDesde, setAppliedDiasRestantesDesde] = useState('');
    const [appliedDiasRestantesHasta, setAppliedDiasRestantesHasta] = useState('');
    const [clienteOptions, setClienteOptions] = useState([]);
    const [gpOptions, setGpOptions] = useState([]);

    const [sort, setSort] = useState({ key: null, dir: 'asc' });

    const [createOpen, setCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState(emptyForm);
    const [createSaving, setCreateSaving] = useState(false);

    const [detailOpen, setDetailOpen] = useState(false);
    const [detailRow, setDetailRow] = useState(null);

    const totalPages = Math.max(1, Math.ceil((Number(total) || 0) / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const offset = (safePage - 1) * pageSize;

    const handleSortHeader = useCallback((columnKey) => {
        setSort((cur) => {
            if (cur.key === columnKey) {
                return { key: columnKey, dir: cur.dir === 'asc' ? 'desc' : 'asc' };
            }
            return { key: columnKey, dir: 'asc' };
        });
        setPage(1);
    }, []);

    const SortTh = useMemo(() => {
        function Cmp({ colKey, label, align = 'left' }) {
            const active = sort.key === colKey;
            const alignCls = align === 'right' ? 'text-right' : 'text-left';
            return (
                <th className={`${alignCls} p-4 whitespace-nowrap font-semibold`}>
                    <button
                        type="button"
                        onClick={() => handleSortHeader(colKey)}
                        className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-semibold text-inherit hover:text-[#65BCF7]"
                    >
                        {label}
                        {active ? (
                            sort.dir === 'asc' ? (
                                <ArrowUp size={14} className="shrink-0 text-[#65BCF7]" />
                            ) : (
                                <ArrowDown size={14} className="shrink-0 text-[#65BCF7]" />
                            )
                        ) : null}
                    </button>
                </th>
            );
        }
        return Cmp;
    }, [sort, handleSortHeader]);

    const chipLabel = useMemo(
        () =>
            buildReubicacionesChipLabel({
                q: appliedQ,
                fechaFinDesde: appliedFechaFinDesde,
                fechaFinHasta: appliedFechaFinHasta,
                estado: appliedEstadoFiltro,
                aptoNoApto: appliedAptoFiltro,
                tipoEvento: appliedTipoEventoFiltro,
                actor: appliedActorFiltro,
                tipoFicha: appliedTipoFichaFiltro,
                cliente: appliedClienteFiltro,
                gp: appliedGpFiltro,
                diasRestantesDesde: appliedDiasRestantesDesde,
                diasRestantesHasta: appliedDiasRestantesHasta,
                pageSize
            }),
        [appliedQ, appliedFechaFinDesde, appliedFechaFinHasta, appliedEstadoFiltro, appliedAptoFiltro, appliedTipoEventoFiltro, appliedActorFiltro, appliedTipoFichaFiltro, appliedClienteFiltro, appliedGpFiltro, appliedDiasRestantesDesde, appliedDiasRestantesHasta, pageSize]
    );

    const clearFilters = useCallback(() => {
        setQ(REUBICACIONES_FILTER_DEFAULTS.q);
        setAppliedQ(REUBICACIONES_FILTER_DEFAULTS.q);
        setFechaFinDesde(REUBICACIONES_FILTER_DEFAULTS.fechaFinDesde);
        setFechaFinHasta(REUBICACIONES_FILTER_DEFAULTS.fechaFinHasta);
        setEstadoFiltro(REUBICACIONES_FILTER_DEFAULTS.estado);
        setAppliedFechaFinDesde(REUBICACIONES_FILTER_DEFAULTS.fechaFinDesde);
        setAppliedFechaFinHasta(REUBICACIONES_FILTER_DEFAULTS.fechaFinHasta);
        setAppliedEstadoFiltro(REUBICACIONES_FILTER_DEFAULTS.estado);
        setAptoFiltro('');
        setAppliedAptoFiltro('');
        setTipoEventoFiltro('');
        setAppliedTipoEventoFiltro('');
        setActorFiltro('');
        setAppliedActorFiltro('');
        setTipoFichaFiltro('');
        setAppliedTipoFichaFiltro('');
        setClienteFiltro('');
        setAppliedClienteFiltro('');
        setGpFiltro('');
        setAppliedGpFiltro('');
        setDiasRestantesDesde('');
        setDiasRestantesHasta('');
        setAppliedDiasRestantesDesde('');
        setAppliedDiasRestantesHasta('');
        setPageSize(REUBICACIONES_FILTER_DEFAULTS.pageSize);
        setPage(1);
    }, []);

    const applyDrawerFilters = useCallback(() => {
        setAppliedQ(q);
        setAppliedFechaFinDesde(fechaFinDesde);
        setAppliedFechaFinHasta(fechaFinHasta);
        setAppliedEstadoFiltro(estadoFiltro);
        setAppliedAptoFiltro(aptoFiltro);
        setAppliedTipoEventoFiltro(tipoEventoFiltro);
        setAppliedActorFiltro(actorFiltro);
        setAppliedTipoFichaFiltro(tipoFichaFiltro);
        setAppliedClienteFiltro(clienteFiltro);
        setAppliedGpFiltro(gpFiltro);
        setAppliedDiasRestantesDesde(diasRestantesDesde);
        setAppliedDiasRestantesHasta(diasRestantesHasta);
        setPage(1);
        setFiltersPanelOpen(false);
    }, [q, fechaFinDesde, fechaFinHasta, estadoFiltro, aptoFiltro, tipoEventoFiltro, actorFiltro, tipoFichaFiltro, clienteFiltro, gpFiltro, diasRestantesDesde, diasRestantesHasta]);

    useEffect(() => {
        let cancelled = false;
        const loadFilterOptions = async () => {
            try {
                const res = await fetch('/api/directorio/reubicaciones-filtros', {
                    credentials: 'include',
                    headers: authHeaders(token)
                });
                const json = await res.json().catch(() => ({}));
                if (!cancelled && res.ok) {
                    setClienteOptions(Array.isArray(json.items) ? json.items : []);
                    setGpOptions(Array.isArray(json.gpItems) ? json.gpItems : []);
                }
            } catch {
                if (!cancelled) {
                    setClienteOptions([]);
                    setGpOptions([]);
                }
            }
        };
        loadFilterOptions();
        return () => { cancelled = true; };
    }, [token]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const u = new URLSearchParams({
                limit: String(pageSize),
                offset: String(offset)
            });
            const qq = String(appliedQ || '').trim();
            if (qq) u.set('q', qq);
            if (appliedFechaFinDesde) u.set('fecha_fin_desde', appliedFechaFinDesde);
            if (appliedFechaFinHasta) u.set('fecha_fin_hasta', appliedFechaFinHasta);
            if (appliedEstadoFiltro) u.set('estado', appliedEstadoFiltro);
            if (appliedAptoFiltro) u.set('apto_no_apto', appliedAptoFiltro);
            if (appliedTipoFichaFiltro) u.set('tipo_ficha', appliedTipoFichaFiltro);
            if (appliedClienteFiltro) u.set('cliente', appliedClienteFiltro);
            if (appliedGpFiltro) u.set('gp', appliedGpFiltro);
            if (appliedDiasRestantesDesde !== '') u.set('dias_restantes_desde', appliedDiasRestantesDesde);
            if (appliedDiasRestantesHasta !== '') u.set('dias_restantes_hasta', appliedDiasRestantesHasta);
            if (sort.key) {
                u.set('sort', sort.key);
                u.set('dir', sort.dir);
            }
            const res = await fetch(`/api/directorio/reubicaciones-pipeline?${u}`, {
                credentials: 'include',
                headers: authHeaders(token)
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
            setItems(Array.isArray(j.items) ? j.items : []);
            setTotal(Number(j.total) || 0);
        } catch (e) {
            setMsg({ text: e.message || 'No se pudo cargar el pipeline.', ok: false });
            setItems([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [token, pageSize, offset, appliedQ, appliedFechaFinDesde, appliedFechaFinHasta, appliedEstadoFiltro, appliedAptoFiltro, appliedTipoFichaFiltro, appliedClienteFiltro, appliedGpFiltro, appliedDiasRestantesDesde, appliedDiasRestantesHasta, sort, viewMode]);

    useEffect(() => {
        if (viewMode === 'reubicados') load();
    }, [load, viewMode]);

    /** Aplicar filtros enviados desde el dashboard (u otro módulo) al cambiar `seq`. */
    useEffect(() => {
        const seq = Number(navIntent?.seq || 0);
        if (!seq) return;
        if (navIntent?.reset) {
            setFechaFinDesde('');
            setFechaFinHasta('');
            setEstadoFiltro('');
            setAppliedQ('');
            setQ('');
            setPage(1);
            return;
        }
        setFechaFinDesde(navIntent?.fechaFinDesde != null ? String(navIntent.fechaFinDesde) : '');
        setFechaFinHasta(navIntent?.fechaFinHasta != null ? String(navIntent.fechaFinHasta) : '');
        setEstadoFiltro(navIntent?.estado != null ? String(navIntent.estado) : '');
        setAppliedFechaFinDesde(navIntent?.fechaFinDesde != null ? String(navIntent.fechaFinDesde) : '');
        setAppliedFechaFinHasta(navIntent?.fechaFinHasta != null ? String(navIntent.fechaFinHasta) : '');
        setAppliedEstadoFiltro(navIntent?.estado != null ? String(navIntent.estado) : '');
        setPage(1);
    }, [navIntent?.seq]);

    const flash = useCallback((text, ok = true) => {
        setMsg({ text, ok });
        setTimeout(() => setMsg(null), 5000);
    }, []);

    const submitCreate = async (e) => {
        e.preventDefault();
        setCreateSaving(true);
        try {
            const res = await fetch('/api/directorio/reubicaciones-pipeline', {
                method: 'POST',
                credentials: 'include',
                headers: authHeaders(token),
                body: JSON.stringify({
                    cedula: createForm.cedula,
                    fecha_fin: createForm.fecha_fin,
                    cliente_destino: createForm.cliente_destino || null,
                    causal: createForm.causal || null
                })
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
            flash('Registro creado.');
            setCreateOpen(false);
            setCreateForm(emptyForm());
            await load();
        } catch (err) {
            flash(err.message || 'Error al crear.', false);
        } finally {
            setCreateSaving(false);
        }
    };

    const openDetail = (row) => {
        setDetailRow(row);
        setDetailOpen(true);
    };

    const toolbarBtn =
        'px-4 py-2 rounded-md bg-[#2F7BB8] text-white text-sm font-semibold hover:bg-[#25649a] disabled:opacity-50';

    const modalShell = useMemo(
        () =>
            `fixed inset-0 z-50 flex items-center justify-center p-4 ${
                isLight ? 'bg-black/30' : 'bg-black/60'
            }`,
        [isLight]
    );

    const Th = SortTh;
    const rangeFrom = !total ? 0 : offset + 1;
    const rangeTo = Math.min(Number(total) || 0, offset + items.length);

    return (
        <div className={dash.moduleTabShellFull}>
            {msg ? (
                <div
                    className={`rounded-lg px-3 py-2 text-sm ${
                        msg.ok ? 'bg-emerald-900/40 text-emerald-200' : 'bg-red-900/40 text-red-200'
                    }`}
                >
                    {msg.text}
                </div>
            ) : null}

            <ModuleFiltersToolbar
                chipLabel={chipLabel}
                filtersPanelOpen={filtersPanelOpen}
                onToggleFilters={() => setFiltersPanelOpen((o) => !o)}
                toggleId="reubicaciones-filtros-toggle"
                panelId="reubicaciones-filtros-panel"
                dash={dash}
            >
                <div className="flex items-center gap-1 rounded-md border border-slate-200 p-1 dark:border-slate-700">
                    <button
                        type="button"
                        onClick={() => { setViewMode('reubicados'); setPage(1); }}
                        className={`rounded px-3 py-1.5 text-xs font-semibold ${viewMode === 'reubicados' ? 'bg-[#2F7BB8] text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                    >
                        Reubicados
                    </button>
                    <button
                        type="button"
                        onClick={() => { setViewMode('historico'); setPage(1); }}
                        className={`rounded px-3 py-1.5 text-xs font-semibold ${viewMode === 'historico' ? 'bg-[#2F7BB8] text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
                    >
                        Histórico
                    </button>
                </div>
            </ModuleFiltersToolbar>

            {viewMode === 'historico' ? (
                <div className={`${dash.cardFlex} min-h-0 flex-1`}>
                    <ReubicacionesHistorialGlobal
                        token={token}
                        auth={auth}
                        searchQuery={appliedQ}
                        filterApto={appliedAptoFiltro}
                        estadoFiltro={appliedEstadoFiltro}
                        fechaFinDesde={appliedFechaFinDesde}
                        fechaFinHasta={appliedFechaFinHasta}
                        tipoEvento={appliedTipoEventoFiltro}
                        actor={appliedActorFiltro}
                    />
                </div>
            ) : (
            <div className={`${dash.cardFlex} min-h-0 flex-1`}>
                <div className={dash.tableWrap}>
                    <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
                        <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
                            <thead>
                                <tr className={dash.thead}>
                                    <Th colKey="cedula" label="Cédula" />
                                    <Th colKey="consultor" label="Consultor" />
                                    <Th colKey="cliente_actual" label="Cliente actual" />
                                    <Th colKey="cliente_destino" label="Cliente destino" />
                                    <Th colKey="tipo_ficha" label="Tipo ficha" />
                                    <Th colKey="fecha_fin" label="Fecha fin" />
                                    <Th colKey="estado" label="Estado" />
                                    <Th colKey="puesto" label="Puesto" />
                                    <Th colKey="salario" label="Salario" />
                                    <Th colKey="auxilios" label="Auxilios" />
                                </tr>
                            </thead>
                            <tbody className={dash.tbody}>
                                {loading ? (
                                    <tr>
                                        <td colSpan={10} className={`p-12 text-center font-medium ${dash.muted}`}>
                                            Cargando…
                                        </td>
                                    </tr>
                                ) : items.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} className={`p-12 text-center font-medium ${dash.muted}`}>
                                            Sin registros en el pipeline de Reubicaciones.
                                        </td>
                                    </tr>
                                ) : (
                                    items.map((row) => (
                                        <tr key={row.id} className={dash.trHover}>
                                            <td className={`${dash.tdCell} whitespace-nowrap`}>{row.cedula}</td>
                                            <td className={`${dash.tdName} whitespace-nowrap`}>
                                                {row.consultor ? (
                                                    <button
                                                        type="button"
                                                        className="cursor-pointer border-0 bg-transparent p-0 text-left font-inherit text-inherit hover:text-[#65BCF7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#65BCF7]"
                                                        onClick={() => openDetail(row)}
                                                        aria-label={`Ver detalle de ${row.consultor}`}
                                                    >
                                                        {row.consultor}
                                                    </button>
                                                ) : '—'}
                                            </td>
                                            <td className={`${dash.tdCell} whitespace-nowrap`}>{row.cliente_actual || '—'}</td>
                                            <td className={`${dash.tdCell} whitespace-nowrap`}>{row.cliente_destino || '—'}</td>
                                            <td className={`${dash.tdCell} whitespace-nowrap`}>
                                                {row.tipo_ficha
                                                    ? <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                                                        row.tipo_ficha === 'SALIDA'
                                                            ? (isLight ? 'bg-red-100 text-red-800' : 'bg-red-900/40 text-red-200')
                                                            : (isLight ? 'bg-blue-100 text-blue-800' : 'bg-blue-900/40 text-blue-200')
                                                    }`}>{row.tipo_ficha}</span>
                                                    : '—'}
                                            </td>
                                            <td className={`${dash.tdCell} whitespace-nowrap`}>
                                                {String(row.fecha_fin || '').slice(0, 10) || '—'}
                                            </td>
                                            <td className="p-4 whitespace-nowrap">
                                                <EstadoBadge estado={row.estado} dias_transcurridos={row.dias_transcurridos} isLight={isLight} />
                                            </td>
                                            <td className={`${dash.tdCell} max-w-[180px] truncate`} title={row.puesto || ''}>
                                                {row.puesto || '—'}
                                            </td>
                                            <td className={`${dash.tdCell} whitespace-nowrap text-right`}>
                                                {row.salario != null ? `$ ${formatMoneyAmountOnly(Number(row.salario), 'COP')}` : '—'}
                                            </td>
                                            <td className={`${dash.tdCell} whitespace-nowrap text-right`}>
                                                {row.auxilios != null && Number(row.auxilios) > 0
                                                    ? `$ ${formatMoneyAmountOnly(Number(row.auxilios), 'COP')}`
                                                    : '—'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    {!loading && total > 0 ? (
                        <div className={dash.footerBar}>
                            <span>
                                Mostrando {rangeFrom}–{rangeTo} de {total} · Página {safePage} de {totalPages}
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={safePage <= 1}
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    className={dash.compactBtn}
                                >
                                    Anterior
                                </button>
                                <button
                                    type="button"
                                    disabled={safePage >= totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    className={dash.compactBtn}
                                >
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
            )}

            <ModuleFiltersDrawer
                open={filtersPanelOpen}
                onClose={() => setFiltersPanelOpen(false)}
                onClear={clearFilters}
                onApply={applyDrawerFilters}
                dash={dash}
                panelId="reubicaciones-filtros-panel"
                titleId="reubicaciones-filtros-drawer-title"
            >
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="reubicaciones-drawer-q" className={dash.filtrosDrawerLabel}>
                        Buscar
                    </label>
                    <input
                        id="reubicaciones-drawer-q"
                        className={`${field} w-full text-sm`}
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Cédula, nombre, destino o causal"
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="reubicaciones-drawer-desde" className={dash.filtrosDrawerLabel}>
                        Fecha fin desde
                    </label>
                    <input
                        {...nativeCalendarOnlyInputProps}
                        id="reubicaciones-drawer-desde"
                        type="date"
                        className={`${field} w-full text-sm`}
                        value={fechaFinDesde}
                        onChange={(e) => setFechaFinDesde(e.target.value)}
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="reubicaciones-drawer-hasta" className={dash.filtrosDrawerLabel}>
                        Fecha fin hasta
                    </label>
                    <input
                        {...nativeCalendarOnlyInputProps}
                        id="reubicaciones-drawer-hasta"
                        type="date"
                        className={`${field} w-full text-sm`}
                        value={fechaFinHasta}
                        onChange={(e) => setFechaFinHasta(e.target.value)}
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="reubicaciones-drawer-estado" className={dash.filtrosDrawerLabel}>
                        Estado
                    </label>
                    <select
                        id="reubicaciones-drawer-estado"
                        className={`${field} w-full text-sm`}
                        value={estadoFiltro}
                        onChange={(e) => setEstadoFiltro(e.target.value)}
                    >
                        <option value="">Todos</option>
                        {ESTADO_CODES.map((code) => (
                            <option key={code} value={code}>
                                {ESTADO_LABELS[code]}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="reubicaciones-drawer-tipo-ficha" className={dash.filtrosDrawerLabel}>
                        Tipo de ficha
                    </label>
                    <select
                        id="reubicaciones-drawer-tipo-ficha"
                        className={`${field} w-full text-sm`}
                        value={tipoFichaFiltro}
                        onChange={(e) => setTipoFichaFiltro(e.target.value)}
                    >
                        <option value="">Todos</option>
                        <option value="SALIDA">SALIDA</option>
                        <option value="EXTENSION">EXTENSION</option>
                    </select>
                </div>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="reubicaciones-drawer-apto" className={dash.filtrosDrawerLabel}>
                        Decisión
                    </label>
                    <select
                        id="reubicaciones-drawer-apto"
                        className={`${field} w-full text-sm`}
                        value={aptoFiltro}
                        onChange={(e) => setAptoFiltro(e.target.value)}
                    >
                        <option value="">Todas</option>
                        <option value="APTO">APTO</option>
                        <option value="NO_APTO">NO APTO</option>
                        <option value="SIN_DECISION">SIN DECISIÓN</option>
                    </select>
                </div>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="reubicaciones-drawer-cliente" className={dash.filtrosDrawerLabel}>Cliente</label>
                    <select
                        id="reubicaciones-drawer-cliente"
                        className={`${field} w-full text-sm`}
                        value={clienteFiltro}
                        onChange={(e) => setClienteFiltro(e.target.value)}
                    >
                        <option value="">Todos</option>
                        {clienteOptions.map((item) => (
                            <option key={item.cliente} value={item.cliente}>{item.cliente}</option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="reubicaciones-drawer-gp" className={dash.filtrosDrawerLabel}>GP</label>
                    <select
                        id="reubicaciones-drawer-gp"
                        className={`${field} w-full text-sm`}
                        value={gpFiltro}
                        onChange={(e) => setGpFiltro(e.target.value)}
                    >
                        <option value="">Todos</option>
                        {gpOptions.map((item) => (
                            <option key={item.id} value={item.id}>{item.full_name || item.email}</option>
                        ))}
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="reubicaciones-drawer-dias-desde" className={dash.filtrosDrawerLabel}>Días restantes desde</label>
                        <input id="reubicaciones-drawer-dias-desde" type="number" min="0" className={`${field} w-full text-sm`} value={diasRestantesDesde} onChange={(e) => setDiasRestantesDesde(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="reubicaciones-drawer-dias-hasta" className={dash.filtrosDrawerLabel}>Días restantes hasta</label>
                        <input id="reubicaciones-drawer-dias-hasta" type="number" min="0" className={`${field} w-full text-sm`} value={diasRestantesHasta} onChange={(e) => setDiasRestantesHasta(e.target.value)} />
                    </div>
                </div>
                {viewMode === 'historico' ? (
                    <>
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="reubicaciones-drawer-tipo-evento" className={dash.filtrosDrawerLabel}>
                                Tipo de evento
                            </label>
                            <select
                                id="reubicaciones-drawer-tipo-evento"
                                className={`${field} w-full text-sm`}
                                value={tipoEventoFiltro}
                                onChange={(e) => setTipoEventoFiltro(e.target.value)}
                            >
                                <option value="">Todos</option>
                                <option value="ficha_recibida">Ficha recibida</option>
                                <option value="ficha_actualizada">Ficha actualizada</option>
                                <option value="cambio_estado">Cambio de estado</option>
                                <option value="modificacion_manual">Edición manual</option>
                                <option value="observacion_agregada">Observación</option>
                                <option value="decision_agregada">Decisión</option>
                                <option value="reubicacion">Reubicación</option>
                                <option value="salida">Salida</option>
                                <option value="transicion_automatica">Transición automática</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="reubicaciones-drawer-actor" className={dash.filtrosDrawerLabel}>
                                Actor
                            </label>
                            <input
                                id="reubicaciones-drawer-actor"
                                className={`${field} w-full text-sm`}
                                value={actorFiltro}
                                onChange={(e) => setActorFiltro(e.target.value)}
                                placeholder="Nombre del actor"
                            />
                        </div>
                    </>
                ) : null}
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="reubicaciones-drawer-pagesize" className={dash.filtrosDrawerLabel}>
                        Mostrar por página
                    </label>
                    <select
                        id="reubicaciones-drawer-pagesize"
                        className={`${field} w-full text-sm`}
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                    >
                        <option value={10}>10 por página</option>
                        <option value={20}>20 por página</option>
                        <option value={50}>50 por página</option>
                    </select>
                </div>
            </ModuleFiltersDrawer>

            {createOpen ? (
                <div className={modalShell}>
                    <div
                        className={`relative w-full max-w-lg rounded-2xl border p-6 shadow-xl ${
                            isLight ? 'border-slate-200 bg-white' : 'border-[var(--border)] bg-[var(--surface)]'
                        }`}
                    >
                        <h2 className={`text-lg font-heading font-bold mb-4 ${headingAccent}`}>Nuevo seguimiento</h2>
                        <form onSubmit={submitCreate} className="space-y-3">
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>Cédula *</label>
                                <input
                                    className={`w-full ${field}`}
                                    value={createForm.cedula}
                                    onChange={(e) => setCreateForm((f) => ({ ...f, cedula: e.target.value }))}
                                    required
                                    placeholder="Debe existir en Consultores / Staff"
                                />
                            </div>
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>Fecha fin *</label>
                                <input
                                    {...nativeCalendarOnlyInputProps}
                                    type="date"
                                    className={`w-full ${field}`}
                                    value={createForm.fecha_fin}
                                    onChange={(e) => setCreateForm((f) => ({ ...f, fecha_fin: e.target.value }))}
                                    required
                                />
                            </div>
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>Cliente destino</label>
                                <input
                                    className={`w-full ${field}`}
                                    value={createForm.cliente_destino}
                                    onChange={(e) => setCreateForm((f) => ({ ...f, cliente_destino: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>Causal</label>
                                <input
                                    className={`w-full ${field}`}
                                    value={createForm.causal}
                                    onChange={(e) => setCreateForm((f) => ({ ...f, causal: e.target.value }))}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" className={dash.compactBtn} onClick={() => setCreateOpen(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={createSaving} className={toolbarBtn}>
                                    {createSaving ? 'Guardando…' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {detailOpen && detailRow ? (
                <ReubicacionesDetalleModal
                    isOpen={detailOpen}
                    onClose={() => {
                        setDetailOpen(false);
                        setDetailRow(null);
                    }}
                    row={detailRow}
                    token={token}
                    auth={auth}
                    onUpdateInline={(field, value) => {
                        setDetailRow(prev => prev ? { ...prev, [field]: value } : prev);
                        load();
                    }}
                />
            ) : null}
        </div>
    );
}
