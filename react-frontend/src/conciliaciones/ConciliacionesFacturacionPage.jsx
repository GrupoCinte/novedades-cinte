import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X, ArrowLeft, CheckCircle2, Download } from 'lucide-react';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash, withNovedadesTabShellAliases, GESTION_TOOLBAR_PRIMARY_BTN } from '../gestionTableDashTheme.js';
import { CONCILIACIONES_FACTURACION_PAGE, CONCILIACIONES_FACTURACION_SHELL } from './conciliacionesLayout.js';
import ClienteMesSelectors from './components/ClienteMesSelectors.jsx';
import ConciliacionesColaCierres from './components/ConciliacionesColaCierres.jsx';
import ConciliacionesAccionMasivaModal from './components/ConciliacionesAccionMasivaModal.jsx';
import { formatConciliacionesMonthLabel } from './conciliacionesFiltrosResumen.js';
import ConciliacionesTabla from './components/ConciliacionesTabla.jsx';
import ConciliacionesFacturacionModal from './components/ConciliacionesFacturacionModal.jsx';
import ConciliacionesServicioResumenCard from './components/ConciliacionesServicioResumenCard.jsx';
import {
    fetchConciliacionesClientes,
    fetchConciliacionPorCliente,
    fetchConciliacionNovedadesDetalle,
    postFacturacionRevision,
    postFacturacionRevisionMasiva,
    postFacturacionAjustes,
    fetchFacturacionHistorial,
    deleteConciliacionFacturacion,
    downloadConciliacionExportExcel,
    postMarcarServicioConciliada,
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
    filterMasivaEligibleRows,
    isServicioCompletoFinanzas,
    canRevertConciliacionCierre,
    canExportServicioCompleto,
    canMarcarServicioConciliada,
    isServicioCierreReadonly,
    resolveDiasBaseMesDisplay,
    patchColaItemEstadoServicio,
    patchFacturacionRowEstado,
    patchFacturacionRowsMasivaAprobar,
    resolveRefreshTargets,
    resolveEstadoTrasRevisionIndividual,
    shouldShowTablaInitialLoading,
    extractSalidasMesRows
} from './facturacionLogic.js';
import { mergeConciliacionServicioRows } from './facturacionAggregate.js';

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

function cedulasFromColaItem(colaItem) {
    const raw = colaItem?.consultoresCedulas;
    if (!Array.isArray(raw)) return [];
    return raw.map((c) => String(c || '').trim()).filter(Boolean);
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
        billingType: item.billingType,
        baseHours: item.baseHours,
        estadoServicio: item.estadoServicio,
        enviadaAt: item.enviadaAt,
        conciliadaAt: item.conciliadaAt
    };
}

function novedadesDetalleFromApi(value) {
    if (!value) return null;
    return {
        tarifaCliente: value.tarifaCliente,
        tarifaMaestro: value.tarifaMaestro,
        tarifaAjustada: value.tarifaAjustada,
        facturaCop: value.facturaCop,
        billingMode: value.billingMode ?? null,
        baseHours: value.baseHours ?? null,
        horasBaseMes: value.horasBaseMes ?? null,
        tarifaValorHora: value.tarifaValorHora ?? null,
        diasBaseMes: value.diasBaseMes ?? null,
        diasBaseLabel: value.diasBaseLabel ?? null,
        festivosAplicados: value.festivosAplicados ?? false
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
    const [refreshingResumen, setRefreshingResumen] = useState(false);
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
    const [revertObservacion, setRevertObservacion] = useState('');
    const [eliminando, setEliminando] = useState(false);
    const [exportandoExcel, setExportandoExcel] = useState(false);
    const [exportandoColaId, setExportandoColaId] = useState('');
    const [conciliandoColaId, setConciliandoColaId] = useState('');
    const [conciliandoServicio, setConciliandoServicio] = useState(false);
    const [festivosSet, setFestivosSet] = useState(() => new Set());
    const [festivosLoaded, setFestivosLoaded] = useState(false);
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
        fetch('/api/festivos', { credentials: 'include' })
            .then((r) => r.json())
            .then((data) => {
                if (cancelled) return;
                if (data?.ok && Array.isArray(data.festivos)) {
                    setFestivosSet(new Set(data.festivos));
                }
                setFestivosLoaded(true);
            })
            .catch(() => {
                if (!cancelled) setFestivosLoaded(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

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

    const loadCola = useCallback(async (options = {}) => {
        const { background = false } = options;
        if (!ym.year || !ym.month) {
            setColaItems([]);
            return;
        }
        if (!background) setLoadingCola(true);
        try {
            const data = await fetchColaCierres(token, {
                year: ym.year,
                month: ym.month,
                cliente: cliente || undefined
            });
            setColaItems(Array.isArray(data.items) ? data.items : []);
        } catch (e) {
            if (!background) {
                setError((prev) => prev || e.message || 'No se pudo cargar la cola de cierres');
                setColaItems([]);
            }
        } finally {
            if (!background) setLoadingCola(false);
        }
    }, [token, ym.year, ym.month, cliente]);

    useEffect(() => {
        loadCola({ background: Boolean(servicioSel) });
    }, [loadCola, servicioSel]);

    useEffect(() => {
        if (!servicioSel?.id || !colaItems.length) return;
        const match = colaItems.find((i) => i.servicioId === servicioSel.id);
        if (!match) return;
        if (
            match.estadoServicio !== servicioSel.estadoServicio ||
            match.enviadaAt !== servicioSel.enviadaAt ||
            match.conciliadaAt !== servicioSel.conciliadaAt
        ) {
            setServicioSel((prev) =>
                prev
                    ? {
                          ...prev,
                          estadoServicio: match.estadoServicio,
                          enviadaAt: match.enviadaAt,
                          conciliadaAt: match.conciliadaAt
                      }
                    : prev
            );
        }
    }, [colaItems, servicioSel?.id, servicioSel?.estadoServicio, servicioSel?.enviadaAt, servicioSel?.conciliadaAt]);

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

    const resumenCliente = servicioSel ? String(servicioSel.client || '').trim() : '';
    const clienteServicio = resumenCliente;
    const billingTypeServicio = servicioSel ? String(servicioSel.billingType || '').trim() : '';
    const billingModeServicio = servicioSel ? String(servicioSel.billingMode || '').trim() : '';
    const baseHoursServicio = servicioSel?.baseHours;

    const billingQueryParams = useMemo(
        () => ({
            billingType: billingTypeServicio || undefined,
            billingMode: billingModeServicio || undefined,
            baseHours: baseHoursServicio ?? undefined
        }),
        [billingTypeServicio, billingModeServicio, baseHoursServicio]
    );

    const loadResumen = useCallback(async (options = {}) => {
        const { silent = false } = options;
        if (!resumenCliente || !ym.year || !ym.month) {
            setRows([]);
            setTotales(null);
            return null;
        }
        if (silent) {
            setRefreshingResumen(true);
        } else {
            setLoadingResumen(true);
        }
        setError('');
        try {
            const data = await fetchConciliacionPorCliente(token, {
                cliente: clienteServicio,
                year: ym.year,
                month: ym.month,
                servicioId: servicioSel?.id,
                ...billingQueryParams
            });
            setRows(Array.isArray(data.rows) ? data.rows : []);
            setTotales(data.totales || null);
            return data;
        } catch (e) {
            if (!silent) {
                setError(e.message || 'Error al cargar el resumen');
                setRows([]);
                setTotales(null);
            }
            return null;
        } finally {
            if (silent) {
                setRefreshingResumen(false);
            } else {
                setLoadingResumen(false);
            }
        }
    }, [token, resumenCliente, billingQueryParams, ym.year, ym.month, servicioSel?.id]);

    useEffect(() => {
        loadResumen();
    }, [loadResumen]);

    const handleSelectServicio = useCallback(
        async (colaItem) => {
            const servicio = colaItemToServicio(colaItem);
            if (!servicio?.id) return;

            const cedulasCola = cedulasFromColaItem(colaItem);
            setServicioSel(servicio);
            handleResetFilters();

            if (cedulasCola.length) {
                setServicioCedulas(cedulasCola);
                return;
            }

            setServicioCedulas([]);
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

    /** Asociados + salidas del mes: base para totales, masiva, cierre y métricas. */
    const rowsConciliacion = useMemo(() => {
        if (!servicioSel) return [];
        return mergeConciliacionServicioRows(rows, servicioCedulas);
    }, [servicioSel, rows, servicioCedulas]);

    const rowsSalidas = useMemo(() => {
        if (!servicioSel) return [];
        return extractSalidasMesRows(rows, servicioCedulas);
    }, [servicioSel, rows, servicioCedulas]);

    const filteredRows = useMemo(
        () => filterFacturacionRows(rowsDelServicio, facturacionFilters),
        [rowsDelServicio, facturacionFilters]
    );

    const filteredRowsConciliacion = useMemo(
        () => filterFacturacionRows(rowsConciliacion, facturacionFilters),
        [rowsConciliacion, facturacionFilters]
    );

    const filteredSalidasRows = useMemo(
        () => filterFacturacionRows(rowsSalidas, facturacionFilters),
        [rowsSalidas, facturacionFilters]
    );

    const [facturacionOpen, setFacturacionOpen] = useState(false);
    const [facturacionRow, setFacturacionRow] = useState(null);
    const [novedadesItems, setNovedadesItems] = useState([]);
    const [novedadesDetalle, setNovedadesDetalle] = useState(null);
    const [novedadesLoading, setNovedadesLoading] = useState(false);
    const [historialItems, setHistorialItems] = useState([]);
    const [historialLoading, setHistorialLoading] = useState(false);

    const userRole = auth?.user?.role || auth?.claims?.role || '';

    const servicioCompleto = useMemo(
        () => isServicioCompletoFinanzas(rows, servicioCedulas),
        [rows, servicioCedulas]
    );

    const servicioCierreReadonly = useMemo(
        () => isServicioCierreReadonly(servicioSel?.estadoServicio),
        [servicioSel?.estadoServicio]
    );

    const workspaceReadonly = servicioCompleto || servicioCierreReadonly;

    const diasBaseServicio = useMemo(
        () =>
            resolveDiasBaseMesDisplay({
                billingMode: billingModeServicio,
                year: ym.year,
                month: ym.month,
                festivosSet,
                festivosLoaded
            }),
        [billingModeServicio, ym.year, ym.month, festivosSet, festivosLoaded]
    );

    const canRevertCurrentRow = useMemo(() => {
        if (!facturacionRow || workspaceReadonly) return false;
        return canRevertConciliacionCierre(userRole, facturacionRow.estado, facturacionRow.cerrado);
    }, [facturacionRow, workspaceReadonly, userRole]);

    const showExportExcelBtn =
        Boolean(servicioSel) &&
        servicioCompleto &&
        canExportServicioCompleto(userRole) &&
        !servicioCierreReadonly &&
        ym.year &&
        ym.month;

    const showMarcarConciliadaBtn =
        Boolean(servicioSel) &&
        canMarcarServicioConciliada(userRole, servicioSel?.estadoServicio) &&
        ym.year &&
        ym.month;

    const openRevision = useCallback(
        async (row) => {
            const clienteRow = String(row?.cliente || clienteServicio || '').trim();
            if (!clienteRow || !ym.year || !ym.month) return;
            setFacturacionRow(row);
            setFacturacionOpen(true);
            setNovedadesLoading(true);
            setHistorialLoading(true);
            setNovedadesItems([]);
            setNovedadesDetalle(null);
            setHistorialItems([]);
            try {
                const novedadesPromise = fetchConciliacionNovedadesDetalle(token, {
                    cliente: clienteRow,
                    cedula: row.cedula,
                    year: ym.year,
                    month: ym.month,
                    ...billingQueryParams
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
                    setNovedadesItems(novedadesResult.value.items || []);
                    setNovedadesDetalle(novedadesDetalleFromApi(novedadesResult.value));
                } else {
                    setNovedadesItems([]);
                    setNovedadesDetalle(null);
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
        [token, clienteServicio, billingQueryParams, ym.year, ym.month]
    );

    const handleEliminarFromRevision = useCallback((row) => {
        setFacturacionOpen(false);
        setRevertObservacion('');
        setConfirmEliminar(row);
    }, []);

    const refreshAfterMutation = useCallback(
        async (mutationKind) => {
            const targets = resolveRefreshTargets({
                hasServicioSel: Boolean(servicioSel),
                mutationKind
            });
            let resumen = null;
            const tasks = [];
            if (targets.resumen) {
                tasks.push(
                    loadResumen({ silent: targets.resumenSilent }).then((data) => {
                        resumen = data;
                    })
                );
            }
            if (targets.cola) {
                tasks.push(loadCola({ background: targets.colaBackground }));
            }
            if (tasks.length) await Promise.all(tasks);
            return resumen;
        },
        [loadResumen, loadCola, servicioSel]
    );

    const reloadRevisionData = useCallback(
        async (row) => {
            const clienteRow = String(row?.cliente || clienteServicio || '').trim();
            if (!clienteRow || !row?.cedula) return;
            setNovedadesLoading(true);
            setHistorialLoading(true);
            try {
                const [novedadesResult, historialResult] = await Promise.allSettled([
                    fetchConciliacionNovedadesDetalle(token, {
                        cliente: clienteRow,
                        cedula: row.cedula,
                        year: ym.year,
                        month: ym.month,
                        ...billingQueryParams
                    }),
                    fetchFacturacionHistorial(token, {
                        cedula: row.cedula,
                        anio: ym.year,
                        mes: ym.month
                    })
                ]);
                if (novedadesResult.status === 'fulfilled') {
                    setNovedadesItems(novedadesResult.value.items || []);
                    setNovedadesDetalle(novedadesDetalleFromApi(novedadesResult.value));
                }
                if (historialResult.status === 'fulfilled') {
                    setHistorialItems(historialResult.value);
                }
            } finally {
                setNovedadesLoading(false);
                setHistorialLoading(false);
            }
        },
        [token, clienteServicio, billingQueryParams, ym.year, ym.month]
    );

    const handleSaveAjustes = useCallback(
        async (data) => {
            setSavingFacturacion(true);
            setError('');
            setSuccess('');
            try {
                await postFacturacionAjustes(token, {
                    ...data,
                    anio: ym.year,
                    mes: ym.month,
                    ...billingQueryParams
                });
                const resumen = await refreshAfterMutation('ajustes');
                const cedNorm = normalizeCedula(data.cedula);
                const freshRow = (resumen?.rows || []).find((r) => normalizeCedula(r.cedula) === cedNorm);
                if (freshRow) setFacturacionRow(freshRow);
                await reloadRevisionData(freshRow || facturacionRow);
                setSuccess(
                    facturacionSuccessMessage('ajustes', {
                        nombre: facturacionRow?.nombre,
                        cedula: data.cedula
                    })
                );
            } catch (e) {
                throw new Error(e.message || 'No se pudieron guardar los ajustes');
            } finally {
                setSavingFacturacion(false);
            }
        },
        [token, ym.year, ym.month, refreshAfterMutation, reloadRevisionData, facturacionRow, billingQueryParams]
    );

    const handleNovedadManualCreada = useCallback(
        async () => {
            setSavingFacturacion(true);
            setError('');
            setSuccess('');
            try {
                const resumen = await refreshAfterMutation('ajustes');
                const cedNorm = normalizeCedula(facturacionRow?.cedula);
                const freshRow = (resumen?.rows || []).find((r) => normalizeCedula(r.cedula) === cedNorm);
                if (freshRow) setFacturacionRow(freshRow);
                await reloadRevisionData(freshRow || facturacionRow);
                setSuccess('Vacaciones en tiempo registradas correctamente.');
            } catch (e) {
                setError(e.message || 'No se pudo actualizar el desglose de novedades');
            } finally {
                setSavingFacturacion(false);
            }
        },
        [refreshAfterMutation, reloadRevisionData, facturacionRow]
    );

    const handleSaveFacturacion = useCallback(
        async (data) => {
            setSavingFacturacion(true);
            setError('');
            setSuccess('');
            const revisionAccion = data._revisionAccion;
            const payload = { ...data };
            delete payload._revisionAccion;
            const prevEst = facturacionRow?.estado || 'PENDIENTE';
            try {
                await postFacturacionRevision(token, {
                    ...payload,
                    anio: ym.year,
                    mes: ym.month,
                    servicioId: servicioSel?.id || undefined
                });
                const nextEst = resolveEstadoTrasRevisionIndividual(prevEst, revisionAccion);
                setRows((prev) => patchFacturacionRowEstado(prev, payload.cedula, nextEst));
                if (facturacionRow && normalizeCedula(facturacionRow.cedula) === normalizeCedula(payload.cedula)) {
                    setFacturacionRow((prev) => (prev ? { ...prev, estado: nextEst } : prev));
                }
                await refreshAfterMutation('revision');
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
        [token, ym.year, ym.month, facturacionRow, servicioSel?.id, refreshAfterMutation]
    );

    const handleSaveMasiva = useCallback(
        async (form) => {
            setSavingMasiva(true);
            setError('');
            setSuccess('');
            try {
                const scopeRows =
                    form.applyToFiltered && hasEstadoFilter ? filteredRowsConciliacion : rowsConciliacion;
                const etapaObjetivo = form.etapaObjetivo;
                const eligibleRows = filterMasivaEligibleRows(userRole, scopeRows, form.accion, etapaObjetivo);
                if (!eligibleRows.length) {
                    throw new Error('No hay consultores elegibles para esta etapa');
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
                        cedulas: eligibleRows.map((r) => r.cedula),
                        servicioId: servicioSel?.id,
                        etapaObjetivo
                    }
                );
                if (!built.ok) throw new Error(built.error);
                const result = await postFacturacionRevisionMasiva(token, built.data);
                setRows((prev) =>
                    patchFacturacionRowsMasivaAprobar(
                        prev,
                        eligibleRows.map((r) => r.cedula),
                        etapaObjetivo
                    )
                );
                await refreshAfterMutation('masiva');
                setSuccess(
                    facturacionSuccessMessage('masiva', {
                        updated: result?.updated ?? eligibleRows.length,
                        skipped: result?.skipped ?? 0
                    })
                );
            } catch (e) {
                throw new Error(e.message || 'No se pudo aplicar la aprobación masiva');
            } finally {
                setSavingMasiva(false);
            }
        },
        [token, ym.year, ym.month, clienteServicio, filteredRowsConciliacion, rowsConciliacion, hasEstadoFilter, userRole, servicioSel?.id, refreshAfterMutation]
    );

    const handleOpenMasiva = useCallback(() => {
        setMasivaOpen(true);
    }, []);

    const handleConfirmEliminar = useCallback(async () => {
        if (!confirmEliminar?.cedula || !ym.year || !ym.month) return;
        const obs = String(revertObservacion || '').trim();
        if (!obs) {
            setError('La observación es obligatoria para revertir el cierre.');
            return;
        }
        setEliminando(true);
        setError('');
        setSuccess('');
        try {
            await deleteConciliacionFacturacion(token, {
                cedula: confirmEliminar.cedula,
                anio: ym.year,
                mes: ym.month,
                observacion: obs
            });
            setRows((prev) => patchFacturacionRowEstado(prev, confirmEliminar.cedula, 'PENDIENTE'));
            await refreshAfterMutation('revert');
            setSuccess(
                `Cierre de ${confirmEliminar.nombre || confirmEliminar.cedula} revertido. Vuelve a estado Pendiente.`
            );
            setConfirmEliminar(null);
            setRevertObservacion('');
        } catch (e) {
            setError(e.message || 'No se pudo revertir el cierre');
        } finally {
            setEliminando(false);
        }
    }, [token, confirmEliminar, revertObservacion, ym.year, ym.month, refreshAfterMutation]);

    const handleExportExcel = useCallback(async () => {
        if (!servicioSel?.id || !ym.year || !ym.month) return;
        setExportandoExcel(true);
        setError('');
        try {
            await downloadConciliacionExportExcel(token, {
                servicioId: servicioSel.id,
                year: ym.year,
                month: ym.month
            });
            setColaItems((prev) => patchColaItemEstadoServicio(prev, servicioSel.id, 'ENVIADA'));
            setServicioSel((prev) => (prev ? { ...prev, estadoServicio: 'ENVIADA' } : prev));
            void loadCola({ background: true });
            setSuccess('Excel descargado. El servicio quedó marcado como Enviada.');
        } catch (e) {
            setError(e.message || 'No se pudo descargar el Excel');
        } finally {
            setExportandoExcel(false);
        }
    }, [token, servicioSel?.id, ym.year, ym.month, loadCola]);

    const handleColaExportExcel = useCallback(
        async (item) => {
            if (!item?.servicioId || !ym.year || !ym.month) return;
            setExportandoColaId(item.servicioId);
            setError('');
            try {
                await downloadConciliacionExportExcel(token, {
                    servicioId: item.servicioId,
                    year: ym.year,
                    month: ym.month
                });
                setColaItems((prev) => patchColaItemEstadoServicio(prev, item.servicioId, 'ENVIADA'));
                if (servicioSel?.id === item.servicioId) {
                    setServicioSel((prev) => (prev ? { ...prev, estadoServicio: 'ENVIADA' } : prev));
                }
                void loadCola({ background: true });
                setSuccess('Excel descargado. El servicio quedó marcado como Enviada.');
            } catch (e) {
                setError(e.message || 'No se pudo descargar el Excel');
            } finally {
                setExportandoColaId('');
            }
        },
        [token, ym.year, ym.month, loadCola, servicioSel?.id]
    );

    const handleMarcarConciliada = useCallback(
        async (servicioId) => {
            const sid = String(servicioId || servicioSel?.id || '').trim();
            if (!sid || !ym.year || !ym.month) return;
            setConciliandoServicio(true);
            setConciliandoColaId(sid);
            setError('');
            try {
                await postMarcarServicioConciliada(token, { servicioId: sid, anio: ym.year, mes: ym.month });
                setColaItems((prev) => patchColaItemEstadoServicio(prev, sid, 'CONCILIADA'));
                void loadCola({ background: true });
                if (servicioSel?.id === sid) {
                    setServicioSel((prev) => (prev ? { ...prev, estadoServicio: 'CONCILIADA' } : prev));
                }
                setSuccess('Servicio marcado como Conciliada.');
            } catch (e) {
                setError(e.message || 'No se pudo marcar como conciliada');
            } finally {
                setConciliandoServicio(false);
                setConciliandoColaId('');
            }
        },
        [token, ym.year, ym.month, loadCola, servicioSel?.id]
    );

    const masivaEligibleCount = useMemo(() => {
        const scope = hasEstadoFilter ? filteredRowsConciliacion : rowsConciliacion;
        return filterMasivaEligibleRows(userRole, scope, 'aprobar').length;
    }, [userRole, hasEstadoFilter, filteredRowsConciliacion, rowsConciliacion]);

    const showMasivaBtn =
        Boolean(servicioSel) &&
        !workspaceReadonly &&
        canUserPerformMasivaRevision(userRole) &&
        rowsConciliacion.length > 0 &&
        masivaEligibleCount > 0;

    const facturacionTotales = useMemo(
        () => buildFacturacionTotales(rows, totales, servicioCedulas),
        [rows, totales, servicioCedulas]
    );

    const monthLabel = useMemo(() => formatConciliacionesMonthLabel(monthValue), [monthValue]);

    const tablaInitialLoading = shouldShowTablaInitialLoading({
        loadingResumen,
        refreshingResumen,
        rowCount: rowsConciliacion.length
    });
    const detalleLoading = loadingCedulas || tablaInitialLoading;
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
                        showMasivaBtn || showExportExcelBtn || showMarcarConciliadaBtn ? (
                            <div className="flex flex-wrap items-center gap-2">
                                {showExportExcelBtn ? (
                                    <button
                                        type="button"
                                        onClick={handleExportExcel}
                                        disabled={exportandoExcel}
                                        className={`${GESTION_TOOLBAR_PRIMARY_BTN} inline-flex items-center gap-2`}
                                        title="Descargar Excel desagregado a facturar"
                                    >
                                        <Download size={16} aria-hidden />
                                        {exportandoExcel ? 'Generando Excel…' : 'Descargar Excel a facturar'}
                                    </button>
                                ) : null}
                                {showMarcarConciliadaBtn ? (
                                    <button
                                        type="button"
                                        onClick={() => handleMarcarConciliada(servicioSel.id)}
                                        disabled={conciliandoServicio}
                                        className={`${GESTION_TOOLBAR_PRIMARY_BTN} inline-flex items-center gap-2`}
                                        title="Confirmar cierre definitivo del servicio"
                                    >
                                        <CheckCircle2 size={16} aria-hidden />
                                        {conciliandoServicio ? 'Marcando…' : 'Marcar conciliada'}
                                    </button>
                                ) : null}
                                {showMasivaBtn ? (
                                    <button
                                        type="button"
                                        onClick={handleOpenMasiva}
                                        className={`${GESTION_TOOLBAR_PRIMARY_BTN} inline-flex items-center gap-2`}
                                        title={`Aprobación masiva (${masivaEligibleCount} consultor(es) elegibles)`}
                                    >
                                        <CheckCircle2 size={16} aria-hidden />
                                        Aprobación masiva
                                    </button>
                                ) : null}
                            </div>
                        ) : null
                    }
                />

                {!servicioSel ? (
                    <ConciliacionesColaCierres
                        items={colaItems}
                        loading={loadingCola || loadingList}
                        monthLabel={monthLabel}
                        year={ym.year}
                        month={ym.month}
                        userRole={userRole}
                        fEstadoCola={fEstadoCola}
                        onEstadoColaChange={setFEstadoCola}
                        filtrosColaOpen={filtrosColaOpen}
                        onToggleFiltrosCola={() => setFiltrosColaOpen((o) => !o)}
                        onAbrirCierre={handleSelectServicio}
                        onExportExcel={handleColaExportExcel}
                        onMarcarConciliada={(item) => handleMarcarConciliada(item.servicioId)}
                        exportandoId={exportandoColaId}
                        conciliandoId={conciliandoColaId}
                        headingAccent={headingAccent}
                        labelMuted={labelMuted}
                        isLight={isLight}
                        dash={dash}
                        field={field}
                    />
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-2">
                        <ConciliacionesServicioResumenCard
                            servicio={servicioSel}
                            monthLabel={monthLabel}
                            consultoresCount={rowsConciliacion.length}
                            servicioCompleto={workspaceReadonly}
                            estadoServicio={servicioSel?.estadoServicio}
                            diasBaseMes={diasBaseServicio.diasBaseMes}
                            diasBaseLabel={diasBaseServicio.diasBaseLabel}
                            festivosAplicados={diasBaseServicio.festivosAplicados}
                            cardClass={dash.card}
                            headingAccent={headingAccent}
                            labelMuted={labelMuted}
                            isLight={isLight}
                            facturacionTotales={
                                facturacionTotales && !tablaInitialLoading && !loadingCedulas ? facturacionTotales : null
                            }
                            metricDetailRows={rowsConciliacion}
                        />

                        <div className={`shrink-0 overflow-hidden ${dash.card}`}>
                            <div
                                className={`border-b px-4 py-3 ${isLight ? 'border-slate-200 bg-slate-50/80' : 'border-slate-700/50 bg-slate-800/40'}`}
                            >
                                <p className={`text-sm font-semibold ${headingAccent}`}>Consultores asociados</p>
                                <p className={`mt-0.5 text-xs ${labelMuted}`}>
                                    Vinculados a este servicio en Dynamo para {monthLabel}.
                                </p>
                            </div>
                            <div className={isLight ? 'bg-slate-50' : 'bg-[#0f172a]/50'}>
                                <div className="overflow-x-auto">
                                    <ConciliacionesTabla
                                        embedded
                                        rows={filteredRows}
                                        estadoServicio={servicioSel?.estadoServicio}
                                        showClienteColumn={false}
                                        onVerDetalle={openRevision}
                                        onRowClick={openRevision}
                                        headingAccent={headingAccent}
                                        labelMuted={labelMuted}
                                        loading={tablaInitialLoading || loadingCedulas}
                                        loadingMessage={
                                            loadingCedulas
                                                ? 'Cargando consultores del servicio…'
                                                : 'Cargando datos del mes…'
                                        }
                                        refreshing={refreshingResumen}
                                    />
                                </div>
                                <div className={dash.footerBar}>
                                    <span>
                                        {rowsDelServicio.length === 0 && !tablaInitialLoading && !loadingCedulas
                                            ? 'Sin consultores asociados a este servicio'
                                            : `Mostrando ${filteredRows.length} de ${rowsDelServicio.length} consultores`}
                                        {refreshingResumen ? ' · actualizando…' : ''}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className={`shrink-0 overflow-hidden ${dash.card}`}>
                            <div
                                className={`border-b px-4 py-3 ${isLight ? 'border-slate-200 bg-slate-50/80' : 'border-slate-700/50 bg-slate-800/40'}`}
                            >
                                <p className={`text-sm font-semibold ${headingAccent}`}>Salidas</p>
                                <p className={`mt-0.5 text-xs ${labelMuted}`}>
                                    Consultores con baja efectiva en {monthLabel} del cliente, fuera de la asociación
                                    de este servicio.
                                </p>
                            </div>
                            <div className={isLight ? 'bg-slate-50' : 'bg-[#0f172a]/50'}>
                                <div className="overflow-x-auto">
                                    <ConciliacionesTabla
                                        embedded
                                        dense
                                        rows={filteredSalidasRows.map((r) => ({ ...r, salidaMes: true }))}
                                        estadoServicio={servicioSel?.estadoServicio}
                                        showClienteColumn={false}
                                        onVerDetalle={openRevision}
                                        onRowClick={openRevision}
                                        headingAccent={headingAccent}
                                        labelMuted={labelMuted}
                                        loading={tablaInitialLoading}
                                        loadingMessage="Cargando salidas del mes…"
                                        refreshing={refreshingResumen}
                                    />
                                </div>
                                <div className={dash.footerBar}>
                                    <span>
                                        {filteredSalidasRows.length === 0
                                            ? `Sin salidas en ${monthLabel} fuera de este servicio`
                                            : `${filteredSalidasRows.length} salida${filteredSalidasRows.length === 1 ? '' : 's'} en ${monthLabel}`}
                                        {refreshingResumen ? ' · actualizando…' : ''}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {facturacionOpen ? (
                <ConciliacionesFacturacionModal
                    open={facturacionOpen}
                    onClose={() => setFacturacionOpen(false)}
                    onSave={handleSaveFacturacion}
                    onSaveAjustes={workspaceReadonly ? null : handleSaveAjustes}
                    onNovedadManualCreada={workspaceReadonly ? null : handleNovedadManualCreada}
                    onEliminar={canRevertCurrentRow ? handleEliminarFromRevision : null}
                    colaborador={facturacionRow}
                    servicioNombre={servicioSel?.serviceName || ''}
                    servicioId={servicioSel?.id || ''}
                    auth={auth}
                    servicioCompleto={workspaceReadonly}
                    novedadesItems={novedadesItems}
                    novedadesLoading={novedadesLoading}
                    tarifaDetalle={novedadesDetalle}
                    billingMode={novedadesDetalle?.billingMode ?? billingModeServicio ?? null}
                    baseHours={novedadesDetalle?.baseHours ?? baseHoursServicio ?? null}
                    horasBaseMes={novedadesDetalle?.horasBaseMes ?? null}
                    tarifaValorHora={novedadesDetalle?.tarifaValorHora ?? null}
                    diasBaseMes={novedadesDetalle?.diasBaseMes ?? diasBaseServicio.diasBaseMes}
                    diasBaseLabel={novedadesDetalle?.diasBaseLabel ?? diasBaseServicio.diasBaseLabel}
                    festivosAplicados={novedadesDetalle?.festivosAplicados ?? diasBaseServicio.festivosAplicados}
                    festivosSet={festivosSet}
                    billingQueryParams={billingQueryParams}
                    revisionAnio={ym.year}
                    revisionMes={ym.month}
                    revisionCliente={clienteServicio}
                    monthLabel={monthLabel}
                    historial={historialItems}
                    historialLoading={historialLoading}
                    saving={savingFacturacion}
                    isLight={isLight}
                />
            ) : null}

            {masivaOpen ? (
                <ConciliacionesAccionMasivaModal
                    open={masivaOpen}
                    onClose={() => setMasivaOpen(false)}
                    onSave={handleSaveMasiva}
                    userRole={userRole}
                    serviceRows={rowsConciliacion}
                    filteredRows={filteredRowsConciliacion}
                    cliente={servicioSel?.serviceName || clienteServicio}
                    hasActiveFilters={hasEstadoFilter}
                    saving={savingMasiva}
                    isLight={isLight}
                />
            ) : null}

            {confirmEliminar ? (
                <>
                    <div
                        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
                        onClick={() => {
                            setConfirmEliminar(null);
                            setRevertObservacion('');
                        }}
                        aria-hidden="true"
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800"
                    >
                        <h3 className="mb-2 text-lg font-bold text-slate-900 dark:text-white">¿Revertir cierre?</h3>
                        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
                            Se revertirá el cierre de <strong>{confirmEliminar.nombre || confirmEliminar.cedula}</strong> para{' '}
                            {monthLabel}. El consultor volverá a <strong>Pendiente</strong> y se conservará el historial.
                        </p>
                        <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Observación (obligatoria)
                        </label>
                        <textarea
                            value={revertObservacion}
                            onChange={(e) => setRevertObservacion(e.target.value)}
                            rows={3}
                            maxLength={1000}
                            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                            placeholder="Motivo de la reversión…"
                        />
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setConfirmEliminar(null);
                                    setRevertObservacion('');
                                }}
                                className={dash.compactBtn}
                                disabled={eliminando}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmEliminar}
                                disabled={eliminando || !String(revertObservacion || '').trim()}
                                className="inline-flex items-center rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-500 disabled:opacity-50"
                            >
                                {eliminando ? 'Revirtiendo…' : 'Sí, revertir cierre'}
                            </button>
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}
