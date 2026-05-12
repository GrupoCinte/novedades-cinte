import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useModuleTheme } from '../moduleTheme.js';
import ClienteMesSelectors from './components/ClienteMesSelectors.jsx';
import ConciliacionesMetricCards from './components/ConciliacionesMetricCards.jsx';
import ConciliacionesTabla from './components/ConciliacionesTabla.jsx';
import ConciliacionesDetalleModal from './components/ConciliacionesDetalleModal.jsx';
import { fetchConciliacionesClientes, fetchConciliacionPorCliente, fetchConciliacionNovedadesDetalle } from './conciliacionesApi.js';

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
    const {
        topBar,
        headingAccent,
        labelMuted,
        field,
        cardPanel,
        subPanel,
        tableSurface,
        tableThead,
        tableRowBorder,
        navOutline
    } = mt;

    const [clientes, setClientes] = useState([]);
    const [cliente, setCliente] = useState('');
    const [monthValue, setMonthValue] = useState(currentMonthValue);
    const [rows, setRows] = useState([]);
    const [totales, setTotales] = useState(null);
    const [loadingList, setLoadingList] = useState(true);
    const [loadingResumen, setLoadingResumen] = useState(false);
    const [error, setError] = useState('');

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
            return;
        }
        setCliente((prev) => (prev && clientes.includes(prev) ? prev : clientes[0] || ''));
    }, [clientes, clienteQuery]);

    const loadResumen = useCallback(async () => {
        if (!cliente || !ym.year || !ym.month) {
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
            if (!row?.novedadesCount || !cliente || !ym.year || !ym.month) return;
            setModalRow(row);
            setModalOpen(true);
            setModalLoading(true);
            setModalItems([]);
            try {
                const items = await fetchConciliacionNovedadesDetalle(token, {
                    cliente,
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

    return (
        <div className="min-h-0 flex-1 space-y-5 p-4 sm:p-6">
            <header className={`${topBar} px-4 py-4 sm:px-6`}>
                <div>
                    <h1 className={`font-heading text-xl font-extrabold tracking-tight sm:text-2xl ${headingAccent}`}>Conciliaciones</h1>
                    <p className={`mt-1 max-w-2xl text-sm ${labelMuted}`}>
                        Tarifa de colaborador menos suma de novedades <strong className="text-inherit">aprobadas</strong> en el mes (fecha efectiva
                        Bogotá: inicio, fecha o creación).
                    </p>
                </div>
            </header>

            {error ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{error}</div>
            ) : null}

            <ClienteMesSelectors
                clientes={clientes}
                clienteValue={cliente}
                onClienteChange={setCliente}
                monthValue={monthValue}
                onMonthChange={setMonthValue}
                field={field}
                labelMuted={labelMuted}
                cardPanel={cardPanel}
            />

            {loadingList ? (
                <p className={`text-sm ${labelMuted}`}>Cargando catálogo de clientes…</p>
            ) : null}

            {loadingResumen && cliente ? (
                <p className={`text-sm ${labelMuted}`}>Cargando datos del mes…</p>
            ) : null}

            {totales ? <ConciliacionesMetricCards totales={totales} cardPanel={cardPanel} subPanel={subPanel} headingAccent={headingAccent} labelMuted={labelMuted} /> : null}

            <ConciliacionesTabla
                rows={rows}
                onVerDetalle={openDetalle}
                tableSurface={tableSurface}
                tableThead={tableThead}
                tableRowBorder={tableRowBorder}
                headingAccent={headingAccent}
                labelMuted={labelMuted}
                navOutline={navOutline}
            />

            <ConciliacionesDetalleModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                loading={modalLoading}
                items={modalItems}
                colaboradorLabel={modalLabel}
                cardPanel={cardPanel}
                tableSurface={tableSurface}
                tableThead={tableThead}
                tableRowBorder={tableRowBorder}
                headingAccent={headingAccent}
                labelMuted={labelMuted}
                navOutline={navOutline}
            />
        </div>
    );
}
