import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash, withNovedadesTabShellAliases, GESTION_TOOLBAR_PRIMARY_BTN } from '../gestionTableDashTheme.js';
import { CONCILIACIONES_FACTURACION_PAGE, CONCILIACIONES_FACTURACION_SHELL } from './conciliacionesLayout.js';
import ClienteMesSelectors from './components/ClienteMesSelectors.jsx';
import ConciliacionesColaCierres from './components/ConciliacionesColaCierres.jsx';
import ConciliacionesMetricCards from './components/ConciliacionesMetricCards.jsx';
import ConciliacionesAccionMasivaModal from './components/ConciliacionesAccionMasivaModal.jsx';
import { formatConciliacionesMonthLabel } from './conciliacionesFiltrosResumen.js';
import ConciliacionesTabla from './components/ConciliacionesTabla.jsx';
import ConciliacionesFacturacionModal from './components/ConciliacionesFacturacionModal.jsx';
import {
    fetchConciliacionesClientes,
    fetchConciliacionPorCliente,
    fetchConciliacionNovedadesDetalle,
    postFacturacionRevision,
    postFacturacionRevisionMasiva,
    fetchFacturacionHistorial,
    deleteConciliacionFacturacion,
    fetchColaCierres,
    fetchServicioConsultores
} from './conciliacionesApi.js';
import {
    filterFacturacionRows,
    buildFacturacionTotales,
    buildFacturacionRevisionMasivaPayload,
    facturacionSuccessMessage,
    planSuccessBannerDismiss,
    canUserPerformMasivaRevision,
    filterMasivaEligibleRows
} from './facturacionLogic.js';

function currentMonthValue() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function parseMonthValue(v) {
    const s = String(v || '').trim();
    const m = /^(\d{4})-(\d{2})$/.exec(s);
    if (!m) return { year: null, month: null };
    return { year: Number(m[1]), month: Number(m[2]) };
}

function normalizeCedula(value) {
    return String(value || '').replace(/\D/g, '');
}

function colaItemToServicio(item) {
    if (!item?.servicioId) return null;
    return {
        id: item.servicioId,
        client: item.client,
        serviceName: item.serviceName,
        initDate: item.initDate,
        closingDay: item.closingDay,
        billingMode: item.billingMode,
        billingType: item.billingType
    };
}

export default function ConciliacionesFacturacionPage({ token, auth }) {
    const [searchParams] = useSearchParams();
    const clienteQuery = useMemo(() => String(searchParams.get('cliente') || '').trim(), [searchParams]);

    const mt = useModuleTheme();
    const { isLight, headingAccent, labelMuted, field } = mt;

    const dash = useMemo(() => {
        const g = withNovedadesTabShellAliases(buildGestionTableDash(isLight));
        return { ...g, isLight };
    }, [isLight]);

    const [clientes, setClientes] = useState([]);
    const [cliente, setCliente] = useState('');
    const [monthValue, setMonthValue] = useState(currentMonthValue);
    const [rows, setRows] = useState([]);
    const [totales, setTotales] = useState(null);
    const [loadingList, setLoadingList] = useState(true);
    const [loadingResumen, setLoadingResumen] = useState(false);
    const [savingFacturacion, setSavingFacturacion] = useState(false);
    const [savingMasiva, setSavingMasiva] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [colaItems, setColaItems] = useState([]);
    const [loadingCola, setLoadingCola] = useState(true);
    const [fEstadoCola, setFEstadoCola] = useState('TODOS');
    const [filtrosColaOpen, setFiltrosColaOpen] = useState(false);

    const [servicioSel, setServicioSel] = useState(null);
    const [servicioCedulas, setServicioCedulas] = useState([]);
    const [loadingCedulas, setLoadingCedulas] = useState(false);

    const [fEstado, setFEstado] = useState('');

    const [confirmEliminar, setConfirmEliminar] = useState(null);
    const [eliminando, setEliminando] = useState(false);
    const [masivaOpen, setMasivaOpen] = useState(false);

    const facturacionFilters = useMemo(() => ({ fEstado }), [fEstado]);

    const handleResetFilters = useCallback(() => {
        setFEstado('');
    }, []);

    const hasEstadoFilter = Boolean(String(fEstado || '').trim());

    useEffect(() => {
        if (!success) return undefined;
        return planSuccessBannerDismiss(() => setSuccess(''));
    }, [success]);

    const ym = useMemo(() => parseMonthValue(monthValue), [monthValue]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoadingList(true);
            setError('');
            try {
                const list = await fetchConciliacionesClientes(token);
                if (cancelled) return;
                setClientes(list);
            } catch (e) {
                if (!cancelled) setError(e.message || 'No se pudieron cargar los clientes');
            } finally {
                if (!cancelled) setLoadingList(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token]);

    useEffect(() => {
        if (!clientes.length) return;
        if (clienteQuery) {
            const hit = clientes.find((c) => c.toLowerCase() === clienteQuery.toLowerCase());
            if (hit) setCliente(hit);
        }
    }, [clientes, clienteQuery]);

    const loadCola = useCallback(async () => {
        if (!ym.year || !ym.month) {
            setColaItems([]);
            return;
        }
        setLoadingCola(true);
        try {
            const data = await fetchColaCierres(token, {
                year: ym.year,
                month: ym.month,
                cliente: cliente || undefined
            });
            setColaItems(Array.isArray(data.items) ? data.items : []);
        } catch (e) {
            setError((prev) => prev || e.message || 'No se pudo cargar la cola de cierres');
            setColaItems([]);
        } finally {
            setLoadingCola(false);
        }
    }, [token, ym.year, ym.month, cliente]);

    useEffect(() => {
        if (servicioSel) return;
        loadCola();
    }, [loadCola, servicioSel]);

    const handleClienteChange = useCallback(
        (nextCliente) => {
            const v = String(nextCliente || '').trim();
            setCliente(v);
            setServicioSel(null);
            setServicioCedulas([]);
            handleResetFilters();
        },
        [handleResetFilters]
    );

    const clienteServicio = servicioSel ? String(servicioSel.client || '').trim() : '';
    const billingTypeServicio = servicioSel ? String(servicioSel.billingType || '').trim() : '';

    const loadResumen = useCallback(async () => {
        if (!clienteServicio || !ym.year || !ym.month) {
            setRows([]);
            setTotales(null);
            return;
        }
        setLoadingResumen(true);
        setError('');
        try {
            const data = await fetchConciliacionPorCliente(token, {
                cliente: clienteServicio,
                year: ym.year,
                month: ym.month,
                billingType: billingTypeServicio || undefined
            });
            setRows(Array.isArray(data.rows) ? data.rows : []);
            setTotales(data.totales || null);
        } catch (e) {
            setError(e.message || 'Error al cargar el resumen');
            setRows([]);
            setTotales(null);
        } finally {
            setLoadingResumen(false);
        }
    }, [token, clienteServicio, billingTypeServicio, ym.year, ym.month]);

    useEffect(() => {
        loadResumen();
    }, [loadResumen]);

    const handleSelectServicio = useCallback(
        async (colaItem) => {
            const servicio = colaItemToServicio(colaItem);
            if (!servicio?.id) return;
            setServicioSel(servicio);
            setServicioCedulas([]);
            handleResetFilters();
            setLoadingCedulas(true);
            try {
                const consultores = await fetchServicioConsultores(token, servicio.id);
                const asociados = (Array.isArray(consultores) ? consultores : []).filter((c) => c.asociado);
                setServicioCedulas(asociados.map((c) => c.cedula));
            } catch (e) {
                setError(e.message || 'No se pudieron cargar los consultores del servicio');
                setServicioCedulas([]);
            } finally {
                setLoadingCedulas(false);
            }
        },
        [token, handleResetFilters]
    );

    const handleVolver = useCallback(() => {
        setServicioSel(null);
        setServicioCedulas([]);
        handleResetFilters();
        loadCola();
    }, [handleResetFilters, loadCola]);

    const rowsDelServicio = useMemo(() => {
        if (!servicioSel) return [];
        const set = new Set(servicioCedulas.map(normalizeCedula).filter(Boolean));
        if (!set.size) return [];
        return rows.filter((r) => set.has(normalizeCedula(r.cedula)));
    }, [servicioSel, servicioCedulas, rows]);

    const filteredRows = useMemo(
        () => filterFacturacionRows(rowsDelServicio, facturacionFilters),
        [rowsDelServicio, facturacionFilters]
    );

    const [facturacionOpen, setFacturacionOpen] = useState(false);
    const [facturacionRow, setFacturacionRow] = useState(null);
    const [novedadesItems, setNovedadesItems] = useState([]);
    const [novedadesLoading, setNovedadesLoading] = useState(false);
    const [historialItems, setHistorialItems] = useState([]);
    const [historialLoading, setHistorialLoading] = useState(false);

    const userRole = auth?.user?.role || auth?.claims?.role || '';

    const openRevision = useCallback(
        async (row) => {
            const clienteRow = String(row?.cliente || clienteServicio || '').trim();
            if (!clienteRow || !ym.year || !ym.month) return;
            setFacturacionRow(row);
            setFacturacionOpen(true);
            setNovedadesLoading(true);
            setHistorialLoading(true);
            setNovedadesItems([]);
            setHistorialItems([]);
            try {
                const novedadesPromise = fetchConciliacionNovedadesDetalle(token, {
                    cliente: clienteRow,
                    cedula: row.cedula,
                    year: ym.year,
                    month: ym.month,
                    billingType: billingTypeServicio || undefined
                });
                const historialPromise = fetchFacturacionHistorial(token, {
                    cedula: row.cedula,
                    anio: ym.year,
                    mes: ym.month
                });
                const [novedadesResult, historialResult] = await Promise.allSettled([
                    novedadesPromise,
                    historialPromise
                ]);
                const partialErrors = [];
                if (novedadesResult.status === 'fulfilled') {
                    setNovedadesItems(novedadesResult.value);
                } else {
                    setNovedadesItems([]);
                    partialErrors.push(novedadesResult.reason?.message || 'Error al cargar novedades');
                }
                if (historialResult.status === 'fulfilled') {
                    setHistorialItems(historialResult.value);
                } else {
                    setHistorialItems([]);
                    partialErrors.push(historialResult.reason?.message || 'Error al cargar historial');
                }
                if (partialErrors.length) {
                    setError(partialErrors.join(' · '));
                }
            } finally {
                setNovedadesLoading(false);
                setHistorialLoading(false);
            }
        },
        [token, clienteServicio, billingTypeServicio, ym.year, ym.month]
    );

    const handleEliminarFromRevision = useCallback((row) => {
        setFacturacionOpen(false);
        setConfirmEliminar(row);
    }, []);

    const refreshAfterMutation = useCallback(async () => {
        await loadResumen();
        await loadCola();
    }, [loadResumen, loadCola]);

    const handleSaveFacturacion = useCallback(
        async (data) => {
            setSavingFacturacion(true);
            setError('');
            setSuccess('');
            const revisionAccion = data._revisionAccion;
            const payload = { ...data };
            delete payload._revisionAccion;
            try {
                await postFacturacionRevision(token, {
                    ...payload,
                    anio: ym.year,
                    mes: ym.month
                });
                await refreshAfterMutation();
                const msgKind =
                    revisionAccion === 'aprobar'
                        ? 'revision_aprobada'
                        : revisionAccion === 'rechazar'
                          ? 'revision_rechazada'
                          : 'individual';
                setSuccess(
                    facturacionSuccessMessage(msgKind, {
                        nombre: facturacionRow?.nombre,
                        cedula: payload.cedula
                    })
                );
            } catch (e) {
                throw new Error(e.message || 'No se pudo guardar el cierre de facturación');
            } finally {
                setSavingFacturacion(false);
            }
        },
        [token, ym.year, ym.month, refreshAfterMutation, facturacionRow]
    );

    const handleSaveMasiva = useCallback(
        async (form) => {
            setSavingMasiva(true);
            setError('');
            setSuccess('');
            try {
                const scopeRows = form.applyToFiltered && hasEstadoFilter ? filteredRows : rowsDelServicio;
                const eligibleRows = filterMasivaEligibleRows(userRole, scopeRows, form.accion);
                if (!eligibleRows.length) {
                    throw new Error('No hay consultores elegibles para esta acción');
                }
                const built = buildFacturacionRevisionMasivaPayload(
                    {
                        accion: form.accion,
                        observacion: form.observaciones
                    },
                    {
                        cliente: clienteServicio,
                        anio: ym.year,
                        mes: ym.month,
                        cedulas: eligibleRows.map((r) => r.cedula)
                    }
                );
                if (!built.ok) throw new Error(built.error);
                const result = await postFacturacionRevisionMasiva(token, built.data);
                await refreshAfterMutation();
                setSuccess(
                    facturacionSuccessMessage('masiva', {
                        updated: result?.updated ?? eligibleRows.length
                    })
                );
            } catch (e) {
                throw new Error(e.message || 'No se pudo aplicar la aprobación masiva');
            } finally {
                setSavingMasiva(false);
            }
        },
        [token, ym.year, ym.month, clienteServicio, filteredRows, rowsDelServicio, hasEstadoFilter, refreshAfterMutation, userRole]
    );

    const handleConfirmEliminar = useCallback(async () => {
        if (!confirmEliminar?.cedula || !ym.year || !ym.month) return;
        setEliminando(true);
        setError('');
        setSuccess('');
        try {
            await deleteConciliacionFacturacion(token, {
                cedula: confirmEliminar.cedula,
                anio: ym.year,
                mes: ym.month
            });
            await refreshAfterMutation();
            setSuccess(`Facturación de ${confirmEliminar.nombre || confirmEliminar.cedula} eliminada. Vuelve a estado Pendiente.`);
            setConfirmEliminar(null);
        } catch (e) {
            setError(e.message || 'No se pudo eliminar la facturación');
        } finally {
            setEliminando(false);
        }
    }, [token, confirmEliminar, ym.year, ym.month, refreshAfterMutation]);

    const masivaEligibleCount = useMemo(() => {
        const scope = hasEstadoFilter ? filteredRows : rowsDelServicio;
        return filterMasivaEligibleRows(userRole, scope, 'aprobar').length;
    }, [userRole, hasEstadoFilter, filteredRows, rowsDelServicio]);

    const showMasivaBtn =
        Boolean(servicioSel) &&
        canUserPerformMasivaRevision(userRole) &&
        rowsDelServicio.length > 0 &&
        masivaEligibleCount > 0;

    const facturacionTotales = useMemo(
        () => buildFacturacionTotales(rowsDelServicio, totales),
        [rowsDelServicio, totales]
    );

    const monthLabel = useMemo(() => formatConciliacionesMonthLabel(monthValue), [monthValue]);

    const detalleLoading = loadingResumen || loadingCedulas;
    const defaultProyecto = servicioSel?.serviceName || '';
    const workspaceToolbarLabel = servicioSel
        ? `${String(servicioSel.client || '').trim()}-${String(servicioSel.serviceName || '').trim()}`.toUpperCase()
        : '';

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

                <ClienteMesSelectors
                    variant="gestion"
                    clientes={clientes}
                    clienteValue={cliente}
                    onClienteChange={handleClienteChange}
                    monthValue={monthValue}
                    onMonthChange={setMonthValue}
                    field={field}
                    labelMuted={labelMuted}
                    allowTodos={!servicioSel}
                    hideClienteSelector={Boolean(servicioSel)}
                    showMonthInline
                    leadingContent={
                        servicioSel ? (
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 sm:gap-x-3">
                                <button
                                    type="button"
                                    onClick={handleVolver}
                                    className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold transition-colors ${
                                        isLight
                                            ? 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                                            : 'border-slate-600/50 text-slate-400 hover:border-slate-500/60 hover:bg-slate-800/50'
                                    }`}
                                    title="Volver a cola de cierres"
                                >
                                    <ArrowLeft size={12} aria-hidden />
                                    Regresar
                                </button>
                                <span
                                    className={`max-w-[min(100%,20rem)] truncate font-heading text-base font-bold uppercase tracking-wide sm:max-w-[28rem] sm:text-lg ${headingAccent}`}
                                    title={workspaceToolbarLabel}
                                >
                                    {workspaceToolbarLabel}
                                </span>
                            </div>
                        ) : null
                    }
                    trailingActions={
                        showMasivaBtn ? (
                            <button
                                type="button"
                                onClick={() => setMasivaOpen(true)}
                                className={`${GESTION_TOOLBAR_PRIMARY_BTN} inline-flex items-center gap-2`}
                                title={`Aprobación masiva (${masivaEligibleCount} consultor(es) elegibles)`}
                            >
                                <CheckCircle2 size={16} aria-hidden />
                                Aprobación masiva
                            </button>
                        ) : null
                    }
                />

                {!servicioSel ? (
                    <ConciliacionesColaCierres
                        items={colaItems}
                        loading={loadingCola || loadingList}
                        monthLabel={monthLabel}
                        fEstadoCola={fEstadoCola}
                        onEstadoColaChange={setFEstadoCola}
                        filtrosColaOpen={filtrosColaOpen}
                        onToggleFiltrosCola={() => setFiltrosColaOpen((o) => !o)}
                        onAbrirCierre={handleSelectServicio}
                        headingAccent={headingAccent}
                        labelMuted={labelMuted}
                        isLight={isLight}
                        dash={dash}
                        field={field}
                    />
                ) : (
                    <>
                        {facturacionTotales && !detalleLoading ? (
                            <div className="mb-3">
                                <ConciliacionesMetricCards
                                    totales={facturacionTotales}
                                    cardClass={dash.card}
                                    headingAccent={headingAccent}
                                    labelMuted={labelMuted}
                                    isLight={isLight}
                                    compact
                                />
                            </div>
                        ) : null}

                        <div className={`${dash.cardFlex} min-h-0 flex-1`}>
                            <div className={dash.tableWrap}>
                                <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
                                    <ConciliacionesTabla
                                        embedded
                                        rows={filteredRows}
                                        showClienteColumn={false}
                                        onVerDetalle={openRevision}
                                        onRowClick={openRevision}
                                        headingAccent={headingAccent}
                                        labelMuted={labelMuted}
                                        loading={detalleLoading}
                                        loadingMessage={
                                            loadingCedulas ? 'Cargando consultores del servicio…' : 'Cargando datos del mes…'
                                        }
                                    />
                                </div>
                                {filteredRows.length > 0 || rowsDelServicio.length > 0 ? (
                                    <div className={dash.footerBar}>
                                        <span>
                                            Mostrando {filteredRows.length} de {rowsDelServicio.length} consultores
                                        </span>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </>
                )}
            </div>

            <ConciliacionesFacturacionModal
                open={facturacionOpen}
                onClose={() => setFacturacionOpen(false)}
                onSave={handleSaveFacturacion}
                onEliminar={handleEliminarFromRevision}
                colaborador={facturacionRow}
                auth={auth}
                novedadesItems={novedadesItems}
                novedadesLoading={novedadesLoading}
                historial={historialItems}
                historialLoading={historialLoading}
                saving={savingFacturacion}
                isLight={isLight}
            />

            <ConciliacionesAccionMasivaModal
                open={masivaOpen}
                onClose={() => setMasivaOpen(false)}
                onSave={handleSaveMasiva}
                userRole={userRole}
                serviceRows={rowsDelServicio}
                filteredRows={filteredRows}
                cliente={servicioSel?.serviceName || clienteServicio}
                hasActiveFilters={hasEstadoFilter}
                saving={savingMasiva}
                isLight={isLight}
            />

            {confirmEliminar ? (
                <>
                    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm" onClick={() => setConfirmEliminar(null)} aria-hidden="true" />
                    <div role="dialog" aria-modal="true" className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800">
                        <h3 className="mb-2 text-lg font-bold text-slate-900 dark:text-white">¿Eliminar facturación?</h3>
                        <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
                            Se eliminará el registro de facturación de <strong>{confirmEliminar.nombre || confirmEliminar.cedula}</strong> para {monthLabel}.
                            <br /><br />
                            <span className="font-medium text-rose-600 dark:text-rose-400">El consultor volverá al estado Pendiente.</span>
                        </p>
                        <div className="flex justify-end gap-3">
                            <button type="button" onClick={() => setConfirmEliminar(null)} className={dash.compactBtn} disabled={eliminando}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmEliminar}
                                disabled={eliminando}
                                className="inline-flex items-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-500 disabled:opacity-50"
                            >
                                {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
                            </button>
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}
