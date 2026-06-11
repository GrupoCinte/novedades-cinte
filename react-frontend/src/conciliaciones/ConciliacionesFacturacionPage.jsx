import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, X } from 'lucide-react';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash, GESTION_TOOLBAR_PRIMARY_BTN, withNovedadesTabShellAliases } from '../gestionTableDashTheme.js';
import { CONCILIACIONES_FACTURACION_PAGE, CONCILIACIONES_FACTURACION_SHELL } from './conciliacionesLayout.js';
import ClienteMesSelectors from './components/ClienteMesSelectors.jsx';
import ConciliacionesClienteEstadoIndicador from './components/ConciliacionesClienteEstadoIndicador.jsx';
import ConciliacionesReglaBanner from './components/ConciliacionesReglaBanner.jsx';
import { formatConciliacionesMonthLabel } from './conciliacionesFiltrosResumen.js';
import ConciliacionesTabla from './components/ConciliacionesTabla.jsx';
import ConciliacionesDetalleModal from './components/ConciliacionesDetalleModal.jsx';
import ConciliacionesFacturacionModal from './components/ConciliacionesFacturacionModal.jsx';
import ConciliacionesAccionMasivaModal from './components/ConciliacionesAccionMasivaModal.jsx';
import {
    fetchConciliacionesClientes,
    fetchConciliacionPorCliente,
    fetchConciliacionNovedadesDetalle,
    saveConciliacionFacturacion,
    saveConciliacionFacturacionMasiva
} from './conciliacionesApi.js';
import {
    filterFacturacionRows,
    buildFacturacionMasivaPayload,
    facturacionSuccessMessage,
    hasFacturacionAdvancedFilters,
    planSuccessBannerDismiss,
    shouldShowFacturacionAccionGrupal,
    shouldShowClienteConciliacionIndicador,
    computeClienteConciliacionSnapshot
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

export default function ConciliacionesFacturacionPage({ token }) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const clienteQuery = useMemo(() => String(searchParams.get('cliente') || '').trim(), [searchParams]);
    const yearQuery = useMemo(() => String(searchParams.get('year') || '').trim(), [searchParams]);
    const monthQuery = useMemo(() => String(searchParams.get('month') || '').trim(), [searchParams]);

    const mt = useModuleTheme();
    const { isLight, headingAccent, labelMuted, field } = mt;

    const dash = useMemo(() => {
        const g = withNovedadesTabShellAliases(buildGestionTableDash(isLight));
        return { ...g, isLight };
    }, [isLight]);

    const [clientes, setClientes] = useState([]);
    const [cliente, setCliente] = useState('');
    const [monthValue, setMonthValue] = useState(() => {
        if (yearQuery && monthQuery) {
            const m = String(monthQuery).padStart(2, '0');
            return `${yearQuery}-${m}`;
        }
        return currentMonthValue();
    });
    const [rows, setRows] = useState([]);
    const [totales, setTotales] = useState(null);
    const [regla, setRegla] = useState(null);
    const [periodo, setPeriodo] = useState(null);
    const [loadingList, setLoadingList] = useState(true);
    const [loadingResumen, setLoadingResumen] = useState(false);
    const [savingFacturacion, setSavingFacturacion] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [fSearch, setFSearch] = useState('');
    const [fEstado, setFEstado] = useState('');
    const [fCerrado, setFCerrado] = useState('TODOS');
    const [fProyecto, setFProyecto] = useState('');
    const [fNovedades, setFNovedades] = useState('TODOS');

    const facturacionFilters = useMemo(
        () => ({ fSearch, fEstado, fCerrado, fProyecto, fNovedades }),
        [fSearch, fEstado, fCerrado, fProyecto, fNovedades]
    );

    const hasActiveFilters = useMemo(
        () => hasFacturacionAdvancedFilters(facturacionFilters),
        [facturacionFilters]
    );

    const handleResetFilters = useCallback(() => {
        setFSearch('');
        setFEstado('');
        setFCerrado('TODOS');
        setFProyecto('');
        setFNovedades('TODOS');
    }, []);

    useEffect(() => {
        if (!success) return undefined;
        return planSuccessBannerDismiss(() => setSuccess(''));
    }, [success]);

    const ym = useMemo(() => parseMonthValue(monthValue), [monthValue]);
    const isTodosClientes = false;

    const filteredRows = useMemo(
        () => filterFacturacionRows(rows, facturacionFilters),
        [rows, facturacionFilters]
    );

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
        if (!clienteQuery) {
            navigate('/admin/conciliaciones/dashboard', { replace: true });
            return;
        }
        if (!clientes.length) return;
        const hit = clientes.find((c) => c.toLowerCase() === clienteQuery.toLowerCase());
        if (hit) setCliente(hit);
        else setCliente(clienteQuery);
    }, [clientes, clienteQuery, navigate]);

    useEffect(() => {
        if (yearQuery && monthQuery) {
            const m = String(monthQuery).padStart(2, '0');
            setMonthValue(`${yearQuery}-${m}`);
        }
    }, [yearQuery, monthQuery]);

    const handleClienteChange = useCallback(
        (nextCliente) => {
            const v = String(nextCliente || '').trim();
            setCliente(v);
            if (v) handleResetFilters();
        },
        [handleResetFilters]
    );

    const loadResumen = useCallback(async () => {
        if (!ym.year || !ym.month || !cliente.trim()) {
            setRows([]);
            setTotales(null);
            setRegla(null);
            setPeriodo(null);
            return;
        }
        setLoadingResumen(true);
        setError('');
        try {
            const data = await fetchConciliacionPorCliente(token, {
                cliente,
                year: ym.year,
                month: ym.month
            });
            setRows(Array.isArray(data.rows) ? data.rows : []);
            setTotales(data.totales || null);
            setRegla(data.regla || null);
            setPeriodo(data.periodo || null);
        } catch (e) {
            setError(e.message || 'Error al cargar el resumen');
            setRows([]);
            setTotales(null);
            setRegla(null);
            setPeriodo(null);
        } finally {
            setLoadingResumen(false);
        }
    }, [token, cliente, ym.year, ym.month]);

    useEffect(() => {
        loadResumen();
    }, [loadResumen]);

    const [modalOpen, setModalOpen] = useState(false);
    const [modalRow, setModalRow] = useState(null);
    const [modalItems, setModalItems] = useState([]);
    const [modalLoading, setModalLoading] = useState(false);

    const openDetalle = useCallback(
        async (row) => {
            const clienteRow = String(row?.cliente || cliente || '').trim();
            if (!clienteRow || !ym.year || !ym.month) return;
            setModalRow(row);
            setModalOpen(true);
            setModalLoading(true);
            setModalItems([]);
            try {
                const items = await fetchConciliacionNovedadesDetalle(token, {
                    cliente: clienteRow,
                    cedula: row.cedula,
                    year: ym.year,
                    month: ym.month
                });
                setModalItems(items);
            } catch (e) {
                setModalItems([]);
                setError(e.message || 'Error al cargar detalle');
            } finally {
                setModalLoading(false);
            }
        },
        [token, cliente, ym.year, ym.month]
    );

    const [facturacionOpen, setFacturacionOpen] = useState(false);
    const [facturacionRow, setFacturacionRow] = useState(null);

    const openFacturacion = useCallback((row) => {
        setFacturacionRow(row);
        setFacturacionOpen(true);
    }, []);

    const handleSaveFacturacion = useCallback(
        async (data) => {
            setSavingFacturacion(true);
            setError('');
            setSuccess('');
            try {
                await saveConciliacionFacturacion(token, {
                    ...data,
                    anio: ym.year,
                    mes: ym.month
                });
                await loadResumen();
                setSuccess(
                    facturacionSuccessMessage('individual', {
                        nombre: facturacionRow?.nombre,
                        cedula: data.cedula
                    })
                );
            } catch (e) {
                throw new Error(e.message || 'No se pudo guardar el cierre de facturación');
            } finally {
                setSavingFacturacion(false);
            }
        },
        [token, ym.year, ym.month, loadResumen, facturacionRow]
    );

    const [masivaOpen, setMasivaOpen] = useState(false);
    const [savingMasiva, setSavingMasiva] = useState(false);

    const handleSaveMasiva = useCallback(
        async (form) => {
            setSavingMasiva(true);
            setError('');
            setSuccess('');

            const cedulas =
                form.applyToFiltered && hasActiveFilters
                    ? filteredRows.map((r) => r.cedula).filter(Boolean)
                    : undefined;

            const built = buildFacturacionMasivaPayload(
                {
                    estado: form.estado,
                    facturaFv: form.facturaFv,
                    fechaRadicacion: form.fechaRadicacion,
                    motivoDevolucion: form.motivoDevolucion,
                    observaciones: form.observaciones
                },
                { cliente, anio: ym.year, mes: ym.month, cedulas }
            );

            if (!built.ok) {
                setSavingMasiva(false);
                throw new Error(built.error);
            }

            try {
                const result = await saveConciliacionFacturacionMasiva(token, built.data);
                await loadResumen();
                setSuccess(facturacionSuccessMessage('masiva', { updated: result?.updated ?? 0 }));
            } catch (e) {
                throw new Error(e.message || 'No se pudo procesar la acción masiva');
            } finally {
                setSavingMasiva(false);
            }
        },
        [token, cliente, ym.year, ym.month, hasActiveFilters, filteredRows, loadResumen]
    );

    const modalLabel = modalRow ? `${modalRow.nombre} · ${modalRow.cedula}` : '';

    const monthLabel = useMemo(() => formatConciliacionesMonthLabel(monthValue), [monthValue]);

    const conciliacionSnapshot = useMemo(() => {
        if (isTodosClientes) return null;
        return computeClienteConciliacionSnapshot(rows, { cliente });
    }, [rows, cliente, isTodosClientes]);

    const tableLoading = loadingList || loadingResumen;

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

                <ConciliacionesReglaBanner regla={regla} periodo={periodo} cliente={cliente} isLight={isLight} />

                {shouldShowClienteConciliacionIndicador(isTodosClientes) ? (
                    <ConciliacionesClienteEstadoIndicador
                        snapshot={conciliacionSnapshot}
                        monthLabel={monthLabel}
                        loading={loadingResumen && !conciliacionSnapshot}
                        dash={dash}
                    />
                ) : null}

                <ClienteMesSelectors
                    variant="gestion"
                    clientes={clientes}
                    clienteValue={cliente}
                    onClienteChange={handleClienteChange}
                    clienteLocked
                    clienteDisplayLabel={cliente}
                    monthValue={monthValue}
                    onMonthChange={setMonthValue}
                    field={field}
                    labelMuted={labelMuted}
                    isFacturacion={true}
                    fSearch={fSearch}
                    onSearchChange={setFSearch}
                    fEstado={fEstado}
                    onEstadoChange={setFEstado}
                    fCerrado={fCerrado}
                    onCerradoChange={setFCerrado}
                    fProyecto={fProyecto}
                    onProyectoChange={setFProyecto}
                    fNovedades={fNovedades}
                    onNovedadesChange={setFNovedades}
                    onResetFilters={handleResetFilters}
                    trailingActions={(
                        <>
                            <button
                                type="button"
                                onClick={() => navigate('/admin/conciliaciones/dashboard')}
                                className={GESTION_TOOLBAR_PRIMARY_BTN}
                            >
                                <ArrowLeft size={16} className="mr-1.5 inline" aria-hidden />
                                Volver a cierres
                            </button>
                            {shouldShowFacturacionAccionGrupal(isTodosClientes) ? (
                                <button
                                    type="button"
                                    onClick={() => setMasivaOpen(true)}
                                    disabled={!filteredRows.length || tableLoading}
                                    className={GESTION_TOOLBAR_PRIMARY_BTN}
                                >
                                    Acción grupal
                                </button>
                            ) : null}
                        </>
                    )}
                />

                <div className={`${dash.cardFlex} min-h-0 flex-1`}>
                    <div className={dash.tableWrap}>
                        <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
                            <ConciliacionesTabla
                                embedded
                                rows={filteredRows}
                                showClienteColumn={isTodosClientes}
                                onVerDetalle={openDetalle}
                                onFacturar={isTodosClientes ? undefined : openFacturacion}
                                headingAccent={headingAccent}
                                labelMuted={labelMuted}
                                loading={tableLoading}
                                loadingMessage={
                                    loadingList
                                        ? 'Cargando catálogo de clientes…'
                                        : isTodosClientes
                                          ? 'Cargando colaboradores de todos los clientes…'
                                          : 'Cargando datos del mes…'
                                }
                            />
                        </div>
                        {filteredRows.length > 0 || rows.length > 0 ? (
                            <div className={dash.footerBar}>
                                <span>
                                    Mostrando {filteredRows.length} de {rows.length} registros
                                </span>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            <ConciliacionesDetalleModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                loading={modalLoading}
                items={modalItems}
                colaboradorLabel={modalLabel}
                colaboradorData={modalRow}
                isLight={isLight}
            />

            <ConciliacionesFacturacionModal
                open={facturacionOpen}
                onClose={() => setFacturacionOpen(false)}
                onSave={handleSaveFacturacion}
                colaborador={facturacionRow}
                saving={savingFacturacion}
                isLight={isLight}
                reglaTipo={regla?.tipo || 'MES_CALENDARIO'}
            />

            <ConciliacionesAccionMasivaModal
                open={masivaOpen}
                onClose={() => setMasivaOpen(false)}
                onSave={handleSaveMasiva}
                cliente={cliente}
                totalCount={rows.length}
                filteredCount={filteredRows.length}
                hasActiveFilters={hasActiveFilters}
                saving={savingMasiva}
                isLight={isLight}
            />
        </div>
    );
}
