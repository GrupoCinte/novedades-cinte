import { useCallback, useEffect, useState, useMemo } from 'react';
import { X, Plus, Search, Filter, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash, GESTION_TOOLBAR_PRIMARY_BTN, withNovedadesTabShellAliases } from '../gestionTableDashTheme.js';
import { CONCILIACIONES_FACTURACION_PAGE, CONCILIACIONES_FACTURACION_SHELL } from './conciliacionesLayout.js';
import ConciliacionesServiciosList from './components/ConciliacionesServiciosList.jsx';
import ConciliacionCrearServicioModal from './components/ConciliacionCrearServicioModal.jsx';
import ConciliacionDetalleServicioModal from './components/ConciliacionDetalleServicioModal.jsx';
import { fetchServicios, fetchConciliacionesClientes, deleteServicio } from './conciliacionesApi.js';
import { mergeServicioInList } from './facturacionLogic.js';

export default function ConciliacionesServiciosPage({ token }) {
    const mt = useModuleTheme();
    const { isLight, headingAccent, labelMuted, field } = mt;

    const dash = useMemo(() => {
        const g = withNovedadesTabShellAliases(buildGestionTableDash(isLight));
        return { ...g, isLight };
    }, [isLight]);

    const [clientes, setClientes] = useState([]);
    const [servicios, setServicios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [fCliente, setFCliente] = useState('TODOS');
    const [fSearch, setFSearch] = useState('');
    const [fModoFacturacion, setFModoFacturacion] = useState('TODOS');
    const [fTipoFacturacion, setFTipoFacturacion] = useState('TODOS');
    const [fFechaInicio, setFFechaInicio] = useState('');
    const [filtrosAvanzadosOpen, setFiltrosAvanzadosOpen] = useState(false);

    const [crearOpen, setCrearOpen] = useState(false);
    const [servicioToEdit, setServicioToEdit] = useState(null);
    const [confirmDeleteServicio, setConfirmDeleteServicio] = useState(null);

    const [detalleOpen, setDetalleOpen] = useState(false);
    const [servicioToDetalle, setServicioToDetalle] = useState(null);

    const loadData = useCallback(async (options = {}) => {
        const { silent = false } = options;
        const hasRows = servicios.length > 0;
        if (silent && hasRows) {
            setRefreshing(true);
        } else {
            setLoading(true);
        }
        setError('');
        try {
            const [clientesList, serviciosList] = await Promise.all([
                fetchConciliacionesClientes(token),
                fetchServicios(token)
            ]);
            setClientes(clientesList || []);
            setServicios(serviciosList || []);
        } catch (e) {
            if (!silent || !hasRows) {
                setError(e.message || 'Error al cargar los datos');
            }
        } finally {
            if (silent && hasRows) {
                setRefreshing(false);
            } else {
                setLoading(false);
            }
        }
    }, [token, servicios.length]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleVerDetalles = useCallback((servicio) => {
        setServicioToDetalle(servicio);
        setDetalleOpen(true);
    }, []);

    const handleEditServicio = useCallback((servicio) => {
        setServicioToEdit(servicio);
        setCrearOpen(true);
    }, []);

    const handleDeleteServicio = useCallback(async (servicio) => {
        if (!servicio?.id) return;
        setError('');
        setSuccess('');
        try {
            await deleteServicio(token, servicio.id);
            setSuccess(`Servicio "${servicio.serviceName}" eliminado correctamente`);
            setConfirmDeleteServicio(null);
            setServicios((prev) => mergeServicioInList(prev, null, { removedId: servicio.id }));
        } catch (e) {
            setError(e.message || 'Error al eliminar el servicio');
        }
    }, [token]);

    const filteredServicios = useMemo(() => {
        return servicios.filter(s => {
            if (fCliente !== 'TODOS' && s.cliente !== fCliente) return false;
            if (fModoFacturacion !== 'TODOS' && s.billingMode !== fModoFacturacion) return false;
            if (fTipoFacturacion !== 'TODOS' && s.billingType !== fTipoFacturacion) return false;
            if (fFechaInicio && s.initDate !== fFechaInicio) return false;
            if (fSearch) {
                const searchLower = fSearch.toLowerCase();
                const text = `${s.client} ${s.serviceName}`.toLowerCase();
                if (!text.includes(searchLower)) return false;
            }
            return true;
        });
    }, [servicios, fCliente, fSearch, fModoFacturacion, fTipoFacturacion, fFechaInicio]);

    const drawerExtrasCount = useMemo(() => {
        let c = 0;
        if (fCliente !== 'TODOS') c += 1;
        if (fModoFacturacion !== 'TODOS') c += 1;
        if (fTipoFacturacion !== 'TODOS') c += 1;
        if (fFechaInicio) c += 1;
        if (fSearch) c += 1;
        return c;
    }, [fCliente, fModoFacturacion, fTipoFacturacion, fFechaInicio, fSearch]);

    const successBannerClass = isLight
        ? 'rounded-lg border border-emerald-500/50 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
        : 'rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100';

    const errorBannerClass = isLight
        ? 'mb-4 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900'
        : 'mb-4 flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-400';

    return (
        <div className={CONCILIACIONES_FACTURACION_PAGE}>
            <div className={CONCILIACIONES_FACTURACION_SHELL}>
                {error ? (
                    <div className={`${errorBannerClass} items-start justify-between gap-2`}>
                        <span className="min-w-0 flex-1">{error}</span>
                        <button
                            type="button"
                            className={isLight ? 'ml-auto shrink-0 text-rose-700 hover:text-rose-900' : 'ml-auto shrink-0 text-rose-400 hover:text-rose-300'}
                            aria-label="Cerrar mensaje de error"
                            onClick={() => setError('')}
                        >
                            <X size={14} />
                        </button>
                    </div>
                ) : null}

                {success ? (
                    <div className={`mb-4 flex items-start justify-between gap-2 ${successBannerClass}`}>
                        <span className="min-w-0 flex-1">{success}</span>
                        <button
                            type="button"
                            className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
                            aria-label="Cerrar mensaje de éxito"
                            onClick={() => setSuccess('')}
                        >
                            <X size={16} />
                        </button>
                    </div>
                ) : null}

                <div className={`${dash.toolbar} flex flex-wrap items-center justify-between gap-4 p-4`}>
                    <div className="flex flex-wrap items-center gap-4 flex-1">
                        <button
                            type="button"
                            aria-expanded={filtrosAvanzadosOpen}
                            aria-controls="servicios-filtros-avanzados-panel"
                            onClick={() => setFiltrosAvanzadosOpen(o => !o)}
                            className={dash.filtrosAvanzadosBtn}
                        >
                            <Filter size={16} className="shrink-0 opacity-90" aria-hidden />
                            <span className="sr-only sm:not-sr-only sm:inline">Filtros de búsqueda</span>
                            {drawerExtrasCount > 0 ? (
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#2F7BB8] text-[10px] font-bold text-white">
                                    {drawerExtrasCount}
                                </span>
                            ) : null}
                            {filtrosAvanzadosOpen ? (
                                <ChevronUp size={18} className="shrink-0 opacity-90" aria-hidden />
                            ) : (
                                <ChevronDown size={18} className="shrink-0 opacity-90" aria-hidden />
                            )}
                        </button>
                    </div>

                    <div className="flex gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => {
                                setServicioToEdit(null);
                                setCrearOpen(true);
                            }}
                            className={`${GESTION_TOOLBAR_PRIMARY_BTN} flex items-center gap-2`}
                            title="Crear Servicio"
                        >
                            <Plus size={16} />
                            <span>Crear Servicio</span>
                        </button>
                    </div>
                </div>

                <div className={`${dash.cardFlex} min-h-0 flex-1 mt-4`}>
                    <div className={dash.tableWrap}>
                        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
                            <ConciliacionesServiciosList
                                rows={filteredServicios}
                                loading={loading && servicios.length === 0}
                                onVerDetalles={handleVerDetalles}
                                headingAccent={headingAccent}
                                labelMuted={labelMuted}
                                isLight={isLight}
                            />
                        </div>
                        {filteredServicios.length > 0 || servicios.length > 0 ? (
                            <div className={dash.footerBar}>
                                <span>
                                    Mostrando {filteredServicios.length} de {servicios.length} servicios
                                    {refreshing ? ' · actualizando…' : ''}
                                </span>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            <ConciliacionCrearServicioModal
                open={crearOpen}
                onClose={() => {
                    setCrearOpen(false);
                    setServicioToEdit(null);
                }}
                token={token}
                clientes={clientes}
                isLight={isLight}
                servicio={servicioToEdit}
                onSuccess={(saved) => {
                    setCrearOpen(false);
                    setSuccess(servicioToEdit ? 'Servicio actualizado correctamente' : 'Servicio creado correctamente');
                    if (saved) {
                        setServicios((prev) => mergeServicioInList(prev, saved));
                    } else {
                        void loadData({ silent: true });
                    }
                    setServicioToEdit(null);
                }}
            />

            <ConciliacionDetalleServicioModal
                open={detalleOpen}
                onClose={() => {
                    setDetalleOpen(false);
                    setServicioToDetalle(null);
                }}
                servicio={servicioToDetalle}
                onDelete={setConfirmDeleteServicio}
                onSuccess={(saved) => {
                    setSuccess('Servicio actualizado correctamente');
                    if (saved) {
                        setServicios((prev) => mergeServicioInList(prev, saved));
                        setServicioToDetalle((prev) =>
                            prev && saved?.id && prev.id === saved.id ? { ...prev, ...saved } : prev
                        );
                    } else {
                        void loadData({ silent: true });
                    }
                }}
                clientes={clientes}
                isLight={isLight}
                token={token}
            />

            {confirmDeleteServicio && (
                <>
                    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm" onClick={() => setConfirmDeleteServicio(null)} aria-hidden="true" />
                    <div role="dialog" aria-modal="true" className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800">
                        <h3 className="mb-2 text-lg font-bold text-slate-900 dark:text-white">¿Eliminar servicio?</h3>
                        <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
                            ¿Estás seguro de eliminar el servicio <strong>{confirmDeleteServicio.serviceName}</strong>? 
                            <br/><br/>
                            <span className="font-medium text-rose-600 dark:text-rose-400">Esta acción no se puede deshacer y desasociará a todos los consultores.</span>
                        </p>
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setConfirmDeleteServicio(null)} className={dash.compactBtn}>
                                Cancelar
                            </button>
                            <button type="button" onClick={() => handleDeleteServicio(confirmDeleteServicio)} className="inline-flex items-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-500">
                                Sí, eliminar
                            </button>
                        </div>
                    </div>
                </>
            )}

            {filtrosAvanzadosOpen && (
                <>
                    <div className={dash.filtrosDrawerBackdrop} onClick={() => setFiltrosAvanzadosOpen(false)} aria-hidden="true" />
                    <aside
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="servicios-filtros-drawer-title"
                        className={dash.filtrosDrawerPanel}
                        id="servicios-filtros-avanzados-panel"
                    >
                        <header className={dash.filtrosDrawerHeader}>
                            <h3 id="servicios-filtros-drawer-title" className={dash.titleLg}>
                                Filtros avanzados
                            </h3>
                            <button type="button" onClick={() => setFiltrosAvanzadosOpen(false)} aria-label="Cerrar filtros avanzados" className={dash.modalClose}>
                                <X size={18} />
                            </button>
                        </header>

                        <div className={dash.filtrosDrawerBody}>
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="drawer-search" className={dash.filtrosDrawerLabel}>
                                    Buscar por nombre
                                </label>
                                <div className="relative">
                                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                                        <Search size={16} />
                                    </div>
                                    <input
                                        id="drawer-search"
                                        type="text"
                                        value={fSearch}
                                        onChange={(e) => setFSearch(e.target.value)}
                                        className={`${field} pl-10 w-full text-sm`}
                                        placeholder="Buscar..."
                                    />
                                </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="drawer-cliente" className={dash.filtrosDrawerLabel}>
                                    Cliente
                                </label>
                                <select
                                    id="drawer-cliente"
                                    value={fCliente}
                                    onChange={(e) => setFCliente(e.target.value)}
                                    className={`${field} w-full text-sm`}
                                >
                                    <option value="TODOS">Todos los clientes</option>
                                    {clientes.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="drawer-fecha" className={dash.filtrosDrawerLabel}>
                                    Fecha de conciliación
                                </label>
                                <input
                                    id="drawer-fecha"
                                    type="date"
                                    value={fFechaInicio}
                                    onChange={(e) => setFFechaInicio(e.target.value)}
                                    className={`${field} w-full text-sm`}
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="drawer-modo-facturacion" className={dash.filtrosDrawerLabel}>
                                    Modo de facturación
                                </label>
                                <select
                                    id="drawer-modo-facturacion"
                                    className={`${field} w-full text-sm`}
                                    value={fModoFacturacion}
                                    onChange={(e) => setFModoFacturacion(e.target.value)}
                                >
                                    <option value="TODOS">Todos los modos</option>
                                    <option value="HOURS">Horas</option>
                                    <option value="CALENDAR_DAYS">Días calendario</option>
                                    <option value="BUSINESS_DAYS">Días hábiles</option>
                                </select>
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="drawer-tipo-facturacion" className={dash.filtrosDrawerLabel}>
                                    Tipo de facturación
                                </label>
                                <select
                                    id="drawer-tipo-facturacion"
                                    className={`${field} w-full text-sm`}
                                    value={fTipoFacturacion}
                                    onChange={(e) => setFTipoFacturacion(e.target.value)}
                                >
                                    <option value="TODOS">Todos los tipos</option>
                                    <option value="EXPIRED_MONTH">Mes vencido</option>
                                    <option value="ADVANCE_MONTH">Mes anticipado</option>
                                </select>
                            </div>
                        </div>

                        <footer className={dash.filtrosDrawerFooter}>
                            {drawerExtrasCount > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setFCliente('TODOS');
                                        setFSearch('');
                                        setFModoFacturacion('TODOS');
                                        setFTipoFacturacion('TODOS');
                                        setFFechaInicio('');
                                    }}
                                    className={`${dash.borrarFiltros} inline-flex items-center gap-1.5`}
                                >
                                    <RefreshCw size={14} aria-hidden />
                                    Limpiar todos
                                </button>
                            ) : (
                                <span />
                            )}
                            <button type="button" onClick={() => setFiltrosAvanzadosOpen(false)} className={dash.filtrosDrawerCta}>
                                Aplicar filtros
                            </button>
                        </footer>
                    </aside>
                </>
            )}
        </div>
    );
}
