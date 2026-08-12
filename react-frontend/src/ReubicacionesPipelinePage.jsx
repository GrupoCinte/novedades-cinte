import { ReubicacionDetalleModal } from './ReubicacionDetalleModal.jsx';
import { Component, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Pencil, Trash2 } from 'lucide-react';
import { useModuleTheme } from './moduleTheme.js';
import { buildGestionTableDash } from './gestionTableDashTheme.js';
import GestionModalShell from './shared/modals/GestionModalShell.jsx';
import ModuleFiltersToolbar from './shared/filters/ModuleFiltersToolbar.jsx';
import ModuleFiltersDrawer from './shared/filters/ModuleFiltersDrawer.jsx';
import {
    buildReubicacionesChipLabel,
    REUBICACIONES_FILTER_DEFAULTS
} from './admin/directorioFilters.js';
import onboardingApi from './onboarding/api.js';
import { nativeCalendarOnlyInputProps } from './nativeCalendarOnlyInputProps.js';
import { currencyNarrowSymbol, formatMoneyAmountOnly } from './multiCurrencyMoney.js';

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

async function fetchClientes() {
    try {
        const res = await fetch('/api/catalogos/clientes', {
            credentials: 'include'
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return [];
        return Array.isArray(data.items) ? data.items : [];
    } catch {
        return [];
    }
}

function formatTarifaDisplay(row) {
    const key = 'tarifa_cliente';
    const n = row.tarifa_cliente;
    if (n == null || n === '') return '—';
    const ccy = row.montos_divisa?.[key] || 'COP';
    const num = Number(n);
    if (!Number.isFinite(num)) return '—';
    return `${formatMoneyAmountOnly(num, ccy)}\u00A0${currencyNarrowSymbol(ccy)}`;
}

function formatMontoDisplay(value, currencyCode, defaultCurrency = 'COP') {
    if (value == null || value === '') return '—';
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    const code = String(currencyCode || defaultCurrency).trim().toUpperCase();
    return `${formatMoneyAmountOnly(num, code)}\u00A0${currencyNarrowSymbol(code)}`;
}

// ✅ NUEVO COMPONENTE
function EstadoBadge({ estado, semaforo, isLight }) {
        const s = String(estado || '').trim();
        const sem = String(semaforo || '').trim();

        if (s === 'Con novedad') {
            return (
                <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${isLight ? 'bg-red-200/95 text-red-950' : 'bg-red-950/50 text-red-100'
                        }`}
                >
                    Con novedad
                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                </span>
            );
        }

        if (s === 'En proceso') {
            return (
                <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${isLight ? 'bg-emerald-100 text-emerald-900' : 'bg-emerald-900/45 text-emerald-100'
                        }`}
                >
                    En proceso
                </span>
            );
        }

        if (s === 'Pendiente') {
            return (
                <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${isLight ? 'bg-amber-100 text-amber-900' : 'bg-amber-900/45 text-amber-100'
                        }`}
                >
                    Pendiente
                </span>
            );
        }

        if (sem === 'Vencido') {
            return (
                <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${isLight ? 'bg-red-200/95 text-red-950' : 'bg-red-950/50 text-red-100'
                        }`}
                >
                    Con novedad
                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                </span>
            );
        }

    return <span className="text-xs">—</span>;
}


//COMPONENTE TIPO FICHA BADGE (igual que en Ficha Novedades)
function TipoFichaBadge({ value, isLight }) {
    const label = value || '—';
    
    // Si no hay valor, mostrar guión sin badge
    if (!value) {
        return <span className="text-xs text-slate-400">—</span>;
    }
    
    // Mismo estilo que TipoBadge en Ficha Novedades
    const cls = isLight
        ? 'bg-sky-100 text-sky-800 border border-sky-200'
        : 'bg-sky-900/40 text-sky-200 border border-sky-700/50';
    
    return (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
            {label}
        </span>
    );
}


function emptyForm() {
    return { cedula: '', fecha_fin: '', cliente_destino: '', causal: '' };
}

/**
 * @typedef {{ seq: number, reset?: boolean, fechaFinDesde?: string, fechaFinHasta?: string, semaforo?: string }} PipelineNavIntent
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

function ReubicacionesPipelinePageInner({ token, navIntent, auth }) {
    const { isLight, field, labelMuted, headingAccent } = useModuleTheme();
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedRow, setSelectedRow] = useState(null);
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
    /** '' = todos; valor API: Verde | Amarillo | Rojo | Vencido */
    const [estadoFiltro, setEstadoFiltro] = useState('');
    const [tipoFichaFiltro, setTipoFichaFiltro] = useState('');
    const [catTipoFicha, setCatTipoFicha] = useState([]);
    const [clienteFiltro, setClienteFiltro] = useState('');
    const [gpFiltro, setGpFiltro] = useState('');
    const [diasDesde, setDiasDesde] = useState('');
    const [diasHasta, setDiasHasta] = useState('');
    const [catClientes, setCatClientes] = useState([]);
    const userRole = auth?.user?.role;
    const userCliente = auth?.user?.cliente;
    const [catGps, setCatGps] = useState([]);

    const [sort, setSort] = useState({ key: null, dir: 'asc' });

    const [createOpen, setCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState(emptyForm);
    const [createSaving, setCreateSaving] = useState(false);

    const [editOpen, setEditOpen] = useState(false);
    const [editRow, setEditRow] = useState(null);
    const [editForm, setEditForm] = useState(emptyForm);
    const [editSaving, setEditSaving] = useState(false);

    const [confirmDeleteRow, setConfirmDeleteRow] = useState(null);

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
                fechaFinDesde,
                fechaFinHasta,
                estado: estadoFiltro,
                tipoFicha: tipoFichaFiltro,
                cliente: clienteFiltro,
                gp: gpFiltro,
                diasDesde,
                diasHasta,
                pageSize
            }),
        [
            appliedQ,
            fechaFinDesde,
            fechaFinHasta,
            estadoFiltro,
            tipoFichaFiltro,
            clienteFiltro,
            gpFiltro,
            diasDesde,
            diasHasta,
            pageSize
        ]
    );

    const clearFilters = useCallback(() => {
        setQ(REUBICACIONES_FILTER_DEFAULTS.q);
        setAppliedQ(REUBICACIONES_FILTER_DEFAULTS.q);
        setFechaFinDesde(REUBICACIONES_FILTER_DEFAULTS.fechaFinDesde);
        setFechaFinHasta(REUBICACIONES_FILTER_DEFAULTS.fechaFinHasta);
        setEstadoFiltro(REUBICACIONES_FILTER_DEFAULTS.estado);
        setTipoFichaFiltro(REUBICACIONES_FILTER_DEFAULTS.tipoFicha);
        if (userRole === 'gp' && userCliente) {
            setClienteFiltro(userCliente);
        } else {
            setClienteFiltro(REUBICACIONES_FILTER_DEFAULTS.cliente);
        }
        setGpFiltro(REUBICACIONES_FILTER_DEFAULTS.gp);
        setDiasDesde(REUBICACIONES_FILTER_DEFAULTS.diasDesde);
        setDiasHasta(REUBICACIONES_FILTER_DEFAULTS.diasHasta);
        setPageSize(REUBICACIONES_FILTER_DEFAULTS.pageSize);
        setPage(1);
    }, [userRole, userCliente]);

    const applyDrawerFilters = useCallback(() => {
        setAppliedQ(q);
        setPage(1);
        setFiltersPanelOpen(false);
    }, [q]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const u = new URLSearchParams({
                limit: String(pageSize),
                offset: String(offset)
            });
            const qq = String(appliedQ || '').trim();
            if (qq) u.set('q', qq);
            if (fechaFinDesde) u.set('fecha_fin_desde', fechaFinDesde);
            if (fechaFinHasta) u.set('fecha_fin_hasta', fechaFinHasta);
            if (estadoFiltro) u.set('estado', estadoFiltro);
            if (tipoFichaFiltro) u.set('tipo_ficha', tipoFichaFiltro);
            if (userRole === 'gp' && userCliente) {
                u.set('cliente', userCliente);
            } else if (clienteFiltro) {
                u.set('cliente', clienteFiltro);
            }
            if (gpFiltro) u.set('gp', gpFiltro);
            if (diasDesde) u.set('dias_desde', diasDesde);
            if (diasHasta) u.set('dias_hasta', diasHasta);
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
    }, [
        token,
        pageSize,
        offset,
        appliedQ,
        fechaFinDesde,
        fechaFinHasta,
        estadoFiltro,
        tipoFichaFiltro,
        clienteFiltro,
        gpFiltro,
        diasDesde,
        diasHasta,
        sort,
        userRole,
        userCliente
    ]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/directorio/reubicaciones-pipeline/tipo-ficha-opciones', {
                    credentials: 'include',
                    headers: authHeaders(token)
                });
                const data = await res.json().catch(() => ({}));
                if (cancelled) return;
                setCatTipoFicha(Array.isArray(data?.items) ? data.items : []);
            } catch {
                if (!cancelled) setCatTipoFicha([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                let items = await fetchClientes();

                //Si es GP, solo ver su cliente
                if (userRole === 'gp' && userCliente) {
                    items = items.filter(c => c === userCliente);
                }

                if (!cancelled) setCatClientes(items);
            } catch {
                if (!cancelled) setCatClientes([]);
            }
        })();
        return () => { cancelled = true; };
    }, [token, userRole, userCliente]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/directorio/gp', {
                    credentials: 'include',
                    headers: authHeaders(token)
                });
                const data = await res.json().catch(() => ({}));
                if (!cancelled && res.ok) {
                    const gps = (data.items || []).map(gp => gp.full_name || gp.email);
                    setCatGps(gps);
                }
            } catch {
                if (!cancelled) setCatGps([]);
            }
        })();
        return () => { cancelled = true; };
    }, [token]);


    useEffect(() => {
        load();
    }, [load]);

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

    const openEdit = (row) => {
        setEditRow(row);
        setEditForm({
            cedula: row.cedula,
            fecha_fin: String(row.fecha_fin || '').slice(0, 10),
            cliente_destino: row.cliente_destino || '',
            causal: row.causal || ''
        });
        setEditOpen(true);
    };

    const submitEdit = async (e) => {
        e.preventDefault();
        if (!editRow?.id) return;
        setEditSaving(true);
        try {
            const res = await fetch(`/api/directorio/reubicaciones-pipeline/${editRow.id}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: authHeaders(token),
                body: JSON.stringify({
                    fecha_fin: editForm.fecha_fin,
                    cliente_destino: editForm.cliente_destino || null,
                    causal: editForm.causal || null
                })
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
            flash('Cambios guardados.');
            setEditOpen(false);
            setEditRow(null);
            await load();
        } catch (err) {
            flash(err.message || 'Error al guardar.', false);
        } finally {
            setEditSaving(false);
        }
    };

    const deleteRow = async (row) => {
        if (!row?.id) return;
        try {
            const res = await fetch(`/api/directorio/reubicaciones-pipeline/${row.id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: authHeaders(token)
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
            flash('Registro eliminado.');
            setConfirmDeleteRow(null);
            await load();
        } catch (err) {
            flash(err.message || 'No se pudo eliminar.', false);
        }
    };

    const toolbarBtn =
        'px-4 py-2 rounded-md bg-[#2F7BB8] text-white text-sm font-semibold hover:bg-[#25649a] disabled:opacity-50';

    const modalShell = useMemo(
        () =>
            `fixed inset-0 z-50 flex items-center justify-center p-4 ${isLight ? 'bg-black/30' : 'bg-black/60'
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
                    className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-900/40 text-emerald-200' : 'bg-red-900/40 text-red-200'
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
                <button type="button" onClick={() => setCreateOpen(true)} className={dash.toolbarBtn}>
                    <span className="inline-flex items-center gap-2">
                        <Plus size={16} /> Nuevo registro
                    </span>
                </button>
                <button type="button" onClick={load} className={dash.compactBtn}>
                    Refrescar
                </button>
            </ModuleFiltersToolbar>

            <div className={`${dash.cardFlex} min-h-0 flex-1`}>
                <div className={dash.tableWrap}>
                    <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
                        <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                            <thead>
                                <tr className={dash.thead}>
                                    <Th colKey="cedula" label="Cédula" />
                                    <Th colKey="consultor" label="Consultor" />
                                    <Th colKey="tipo_contrato" label="Tipo contrato" />
                                    <Th colKey="cliente_actual" label="Cliente actual" />
                                    <Th colKey="cliente_destino" label="Cliente destino" />
                                    <Th colKey="puesto" label="Puesto" />
                                    <Th colKey="salario" label="Salario" />
                                    <Th colKey="auxilios" label="Auxilios" />
                                    <Th colKey="tipo_ficha" label="Tipo ficha" />
                                    <Th colKey="fecha_fin" label="Fecha fin" />
                                    <Th colKey="dias_restantes" label="Días rest." align="right" />
                                    <Th colKey="estado" label="Estado" />
                                    <Th colKey="tarifa" label="Tarifa actual" />
                                </tr>
                            </thead>
                            <tbody className={dash.tbody}>
                                {loading ? (
                                    <tr>
                                        <td colSpan={11} className={`p-12 text-center font-medium ${dash.muted}`}>
                                            Cargando…
                                        </td>
                                    </tr>
                                ) : items.length === 0 ? (
                                    <tr>
                                        <td colSpan={11} className={`p-12 text-center font-medium ${dash.muted}`}>
                                            Sin registros. Cree uno con «Nuevo registro» (la cédula debe existir en Consultores).
                                        </td>
                                    </tr>
                                ) : (
                                    items.map((row) => (
                                        <tr key={row.id} className={dash.trHover}>
                                            <td className={`${dash.tdCell} whitespace-nowrap`}>{row.cedula}</td>
                                            <td
                                                className={`cursor-pointer hover:text-[#65BCF7]`}
                                                onClick={() => {
                                                    setSelectedRow(row);
                                                    setModalOpen(true);
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        setSelectedRow(row);
                                                        setModalOpen(true);
                                                    }
                                                }}
                                                role="button"
                                                tabIndex={0}
                                            >
                                                {row.consultor || '—'}
                                            </td>
                                            <td className={dash.tdCell}>{row.tipo_contrato || '—'}</td>
                                            <td className={dash.tdCell}>{row.cliente_actual || '—'}</td>
                                            <td className={dash.tdCell}>{row.cliente_destino || '—'}</td>
                                            <td className={dash.tdCell}>{row.puesto || '—'}</td>
                                            <td className={dash.tdCell}>{formatMontoDisplay(row.salario, row.montos_divisa?.salario || 'COP')}</td>
                                            <td className={dash.tdCell}>{formatMontoDisplay(row.auxilios, row.montos_divisa?.auxilios || 'COP')}</td>
                                            <td className={dash.tdCell}>
                                            <TipoFichaBadge value={row.tipo_ficha} isLight={isLight} /></td>
                                            <td className={`${dash.tdCell} whitespace-nowrap`}>
                                                {String(row.fecha_fin || '').slice(0, 10)}
                                            </td>
                                            <td className={`${dash.tdMuted} text-right whitespace-nowrap`}>
                                                {row.dias_restantes != null ? row.dias_restantes : '—'}
                                            </td>
                                            <td className="p-4 whitespace-nowrap">
                                                <EstadoBadge estado={row.estado} semaforo={row.semaforo} isLight={isLight} />
                                            </td>
                                            <td className={`${dash.tdCell} whitespace-nowrap`}>
                                                {formatTarifaDisplay(row)}
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
                        <option value="Pendiente">Pendiente</option>
                        <option value="En proceso">En proceso</option>
                        <option value="Con novedad">Con novedad</option>
                    </select>
                </div>

                {/* 3. Tipo ficha - NUEVO */}
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="reubicaciones-drawer-tipo-ficha" className={dash.filtrosDrawerLabel}>
                        Tipo ficha
                    </label>
                    <select
                        id="reubicaciones-drawer-tipo-ficha"
                        className={`${field} w-full text-sm`}
                        value={tipoFichaFiltro}
                        onChange={(e) => setTipoFichaFiltro(e.target.value)}
                    >
                        <option value="">Todos</option>
                        {catTipoFicha.map((item) => (
                            <option key={item} value={item}>
                                {item}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 4. Cliente - SELECT con permisos */}
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="reubicaciones-drawer-cliente" className={dash.filtrosDrawerLabel}>
                        Cliente
                    </label>
                    <select
                        id="reubicaciones-drawer-cliente"
                        className={`${field} w-full text-sm`}
                        value={clienteFiltro}
                        onChange={(e) => setClienteFiltro(e.target.value)}
                        disabled={userRole === 'gp'}
                    >
                        <option value="">
                            {userRole === 'gp' ? 'Tu cliente asignado' : 'Todos los clientes'}
                        </option>
                        {catClientes.map((cliente) => (
                            <option key={cliente} value={cliente}>
                                {cliente}
                            </option>
                        ))}
                    </select>
                    {userRole === 'gp' && (
                        <p className="text-xs text-slate-400">
                            Como GP, solo puedes ver reubicaciones de tu cliente asignado.
                        </p>
                    )}
                </div>

                {/* 5. GP - SELECT en lugar de input */}
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="reubicaciones-drawer-gp" className={dash.filtrosDrawerLabel}>
                        GP (Gerente de Proyecto)
                    </label>
                    <select
                        id="reubicaciones-drawer-gp"
                        className={`${field} w-full text-sm`}
                        value={gpFiltro}
                        onChange={(e) => setGpFiltro(e.target.value)}
                        disabled={userRole === 'gp'}
                    >
                        <option value="">
                            {userRole === 'gp' ? 'Tu GP asignado' : 'Todos los GPs'}
                        </option>
                        {catGps.map((gp) => (
                            <option key={gp} value={gp}>
                                {gp}
                            </option>
                        ))}
                    </select>
                    {userRole === 'gp' && (
                        <p className="text-xs text-slate-400">
                            Como GP, solo puedes ver reubicaciones de tu cliente asignado.
                        </p>
                    )}
                </div>

                {/* 8. Días restantes - NUEVO */}
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="reubicaciones-drawer-dias-restantes" className={dash.filtrosDrawerLabel}>
                        Días restantes
                    </label>
                    <div className="flex gap-2">
                        <input
                            type="number"
                            min="0"
                            className={`${field} w-1/2 text-sm`}
                            value={diasDesde}
                            onChange={(e) => setDiasDesde(e.target.value)}
                            placeholder="Desde"
                        />
                        <input
                            type="number"
                            min="0"
                            className={`${field} w-1/2 text-sm`}
                            value={diasHasta}
                            onChange={(e) => setDiasHasta(e.target.value)}
                            placeholder="Hasta"
                        />
                    </div>
                </div>
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

            <GestionModalShell
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                title="Nuevo seguimiento"
                subtitle="Crear registro de seguimiento de reubicación"
                size="md"
            >
                <form onSubmit={submitCreate} className="space-y-3 font-body">
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
                    <div className="flex justify-end gap-2 pt-4 border-t border-slate-200/50 dark:border-slate-700/50">
                        <button type="button" className={dash.compactBtn} onClick={() => setCreateOpen(false)}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={createSaving} className={toolbarBtn}>
                            {createSaving ? 'Guardando…' : 'Guardar'}
                        </button>
                    </div>
                </form>
            </GestionModalShell>

            <GestionModalShell
                open={Boolean(editOpen && editRow)}
                onClose={() => {
                    setEditOpen(false);
                    setEditRow(null);
                }}
                title="Editar seguimiento"
                subtitle={editRow ? `Cédula ${editForm.cedula} · ${editRow.consultor || 'Consultor'}` : ''}
                size="md"
            >
                <form onSubmit={submitEdit} className="space-y-3 font-body">
                    <div>
                        <label className={`block text-xs ${labelMuted} mb-1`}>Fecha fin *</label>
                        <input
                            {...nativeCalendarOnlyInputProps}
                            type="date"
                            className={`w-full ${field}`}
                            value={editForm.fecha_fin}
                            onChange={(e) => setEditForm((f) => ({ ...f, fecha_fin: e.target.value }))}
                            required
                        />
                    </div>
                    <div>
                        <label className={`block text-xs ${labelMuted} mb-1`}>Cliente destino</label>
                        <input
                            className={`w-full ${field}`}
                            value={editForm.cliente_destino}
                            onChange={(e) => setEditForm((f) => ({ ...f, cliente_destino: e.target.value }))}
                        />
                    </div>
                    <div>
                        <label className={`block text-xs ${labelMuted} mb-1`}>Causal</label>
                        <input
                            className={`w-full ${field}`}
                            value={editForm.causal}
                            onChange={(e) => setEditForm((f) => ({ ...f, causal: e.target.value }))}
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-4 border-t border-slate-200/50 dark:border-slate-700/50">
                        <button
                            type="button"
                            className={dash.compactBtn}
                            onClick={() => {
                                setEditOpen(false);
                                setEditRow(null);
                            }}
                        >
                            Cancelar
                        </button>
                        <button type="submit" disabled={editSaving} className={toolbarBtn}>
                            {editSaving ? 'Guardando…' : 'Guardar'}
                        </button>
                    </div>
                </form>
            </GestionModalShell>

            <GestionModalShell
                open={Boolean(confirmDeleteRow)}
                onClose={() => setConfirmDeleteRow(null)}
                title="Confirmar eliminación"
                subtitle="¿Está seguro de realizar esta acción?"
                size="md"
                zClass="z-[260]"
            >
                <div className="font-body space-y-4">
                    <p className={`text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        ¿Eliminar el seguimiento de reubicación para la cédula{' '}
                        <strong className="font-semibold text-rose-500">{confirmDeleteRow?.cedula}</strong>?
                    </p>
                    <div className="flex justify-end gap-2 pt-4 border-t border-slate-200/50 dark:border-slate-700/50">
                        <button type="button" className={dash.compactBtn} onClick={() => setConfirmDeleteRow(null)}>
                            Cancelar
                        </button>
                        <button
                            type="button"
                            className="px-4 py-2 rounded-md bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 transition-colors"
                            onClick={() => deleteRow(confirmDeleteRow)}
                        >
                            Eliminar
                        </button>
                    </div>
                </div>
            </GestionModalShell>

            <ReubicacionDetalleModal
                isOpen={modalOpen}
                onClose={() => {
                    setModalOpen(false);
                    setSelectedRow(null);
                }}
                row={selectedRow}
                token={token}
                auth={auth}
                onEdit={(row) => {
                    setModalOpen(false);
                    openEdit(row);
                }}
                onDelete={(row) => {
                    setModalOpen(false);
                    setConfirmDeleteRow(row);
                }}
            />
        </div>
    );
}