import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';
import { CONCILIACIONES_PAGE_MAIN, conciliacionesErrorBannerClass } from './conciliacionesLayout.js';
import ConciliacionesGestionShell from './components/ConciliacionesGestionShell.jsx';
import ClienteMesSelectors from './components/ClienteMesSelectors.jsx';
import ConciliacionesMetricCards from './components/ConciliacionesMetricCards.jsx';
import ConciliacionesTabla from './components/ConciliacionesTabla.jsx';
import ConciliacionesDetalleModal from './components/ConciliacionesDetalleModal.jsx';
import ConciliacionesFacturacionEstadosResumen from './components/ConciliacionesFacturacionEstadosResumen.jsx';
import { fetchConciliacionesClientes, fetchConciliacionPorCliente, fetchConciliacionNovedadesDetalle } from './conciliacionesApi.js';
import {
    filterFacturacionRows,
    buildFacturacionTotales,
    toggleFacturacionEstadoFilter,
    shouldShowFacturacionEstadosResumen
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

export default function ConciliacionesPage({ token }) {
    const [searchParams] = useSearchParams();
    const clienteQuery = useMemo(() => String(searchParams.get('cliente') || '').trim(), [searchParams]);

    const mt = useModuleTheme();
    const { isLight, headingAccent, labelMuted, field } = mt;

    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);

    const [clientes, setClientes] = useState([]);
    const [cliente, setCliente] = useState('');
    const [monthValue, setMonthValue] = useState(currentMonthValue);
    const [rows, setRows] = useState([]);
    const [totales, setTotales] = useState(null);
    const [loadingList, setLoadingList] = useState(true);
    const [loadingResumen, setLoadingResumen] = useState(false);
    const [error, setError] = useState('');

    const [fSearch, setFSearch] = useState('');
    const [fEstado, setFEstado] = useState('');
    const [fCerrado, setFCerrado] = useState('TODOS');
    const [fProyecto, setFProyecto] = useState('');
    const [fNovedades, setFNovedades] = useState('TODOS');

    const facturacionFilters = useMemo(
        () => ({ fSearch, fEstado, fCerrado, fProyecto, fNovedades }),
        [fSearch, fEstado, fCerrado, fProyecto, fNovedades]
    );

    const handleResetFilters = useCallback(() => {
        setFSearch('');
        setFEstado('');
        setFCerrado('TODOS');
        setFProyecto('');
        setFNovedades('TODOS');
    }, []);

    const handleEstadoPillClick = useCallback((estadoKey) => {
        setFEstado((prev) => toggleFacturacionEstadoFilter(prev, estadoKey));
    }, []);

    const handleClienteChange = useCallback(
        (nextCliente) => {
            const v = String(nextCliente || '').trim();
            setCliente(v);
            if (v) handleResetFilters();
        },
        [handleResetFilters]
    );

    const ym = useMemo(() => parseMonthValue(monthValue), [monthValue]);
    const isTodosClientes = !String(cliente || '').trim();

    const filteredRows = useMemo(
        () => filterFacturacionRows(rows, facturacionFilters),
        [rows, facturacionFilters]
    );

    const facturacionTotales = useMemo(
        () => buildFacturacionTotales(rows, totales),
        [rows, totales]
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
        if (!clientes.length) return;
        if (clienteQuery) {
            const hit = clientes.find((c) => c.toLowerCase() === clienteQuery.toLowerCase());
            if (hit) setCliente(hit);
            return;
        }
        setCliente((prev) => (prev && clientes.includes(prev) ? prev : clientes[0] || ''));
    }, [clientes, clienteQuery]);

    const loadResumen = useCallback(async () => {
        if (!ym.year || !ym.month) {
            setRows([]);
            setTotales(null);
            return;
        }
        setLoadingResumen(true);
        setError('');
        try {
            const data = await fetchConciliacionPorCliente(token, { cliente, year: ym.year, month: ym.month });
            setRows(Array.isArray(data.rows) ? data.rows : []);
            setTotales(data.totales || null);
        } catch (e) {
            setError(e.message || 'Error al cargar el resumen');
            setRows([]);
            setTotales(null);
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
            if (!row?.novedadesCount || !clienteRow || !ym.year || !ym.month) return;
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

    const modalLabel = modalRow ? `${modalRow.nombre} · ${modalRow.cedula}` : '';

    const tableLoading = loadingList || loadingResumen;

    return (
        <div className={`${CONCILIACIONES_PAGE_MAIN} pb-2`}>
            {error ? (
                <div className={conciliacionesErrorBannerClass(isLight)}>{error}</div>
            ) : null}

            <div className="animate-in fade-in slide-in-from-right-8 flex h-[calc(100vh-8.5rem)] flex-col duration-300 md:h-[calc(100vh-7.5rem)]">
                <ConciliacionesGestionShell
                    isLight={isLight}
                    className="h-full"
                    title="Resumen por cliente"
                    subtitle="Tarifa de colaborador menos novedades aprobadas en el mes (fecha efectiva Bogotá: inicio, fecha o creación)."
                    toolbar={(
                        <ClienteMesSelectors
                            variant="gestion"
                            clientes={clientes}
                            clienteValue={cliente}
                            onClienteChange={handleClienteChange}
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
                        />
                    )}
                    headerExtra={
                        totales ? (
                            <div className={`mt-3 border-t pt-3 ${isLight ? 'border-slate-200' : 'border-slate-700/50'}`}>
                                <ConciliacionesMetricCards
                                    totales={totales}
                                    cardClass=""
                                    headingAccent={headingAccent}
                                    labelMuted={labelMuted}
                                    compact
                                />
                            </div>
                        ) : null
                    }
                    footer={
                        rows.length > 0 ? (
                            <div className={dash.footerBar}>
                                <span>Mostrando {filteredRows.length} de {rows.length} registros</span>
                            </div>
                        ) : null
                    }
                >
                    {shouldShowFacturacionEstadosResumen(isTodosClientes) && facturacionTotales?.estados && !loadingResumen ? (
                        <div className="px-4 pt-3 pb-1">
                            <ConciliacionesFacturacionEstadosResumen
                                variant="inline"
                                estados={facturacionTotales.estados}
                                activeEstado={fEstado}
                                onEstadoClick={handleEstadoPillClick}
                                isLight={isLight}
                            />
                        </div>
                    ) : null}
                    <ConciliacionesTabla
                        embedded
                        rows={filteredRows}
                        showClienteColumn={!cliente}
                        onVerDetalle={openDetalle}
                        headingAccent={headingAccent}
                        labelMuted={labelMuted}
                        loading={tableLoading}
                        loadingMessage={loadingList ? 'Cargando catálogo de clientes…' : 'Cargando datos del mes…'}
                    />
                </ConciliacionesGestionShell>
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
        </div>
    );
}
