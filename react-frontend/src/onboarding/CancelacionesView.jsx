import { useCallback, useEffect, useMemo, useState } from 'react';
import useMonitorData from '../contratacion/hooks/useMonitorData.js';
import { userHasContratacionPanel } from '../contratacion/contratacionAccess.js';
import SortableGestionDataTable from './SortableGestionDataTable.jsx';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';
import { CANCELACIONES_DEFAULT_SORT, toggleSort } from './onboardingSortDefaults.js';
import { fmtFecha } from './views.jsx';
import { isMonitorCancellation, mapCancellationRow, mapManualCanceladoRow } from './cancelacionesFilter.js';
import { compareCancellationRows } from './cancelacionesSort.js';
import { buildMonitorGlassModalTheme, monitorGlassModalSizeCls } from '../shared/modals/monitorGlassModalTheme.js';
import { onboardingApi } from './api.js';

const SORT_KEYS = ['cedula', 'nombre', 'cliente', 'puesto', 'status', 'origen', 'fecha_inicio', 'fecha_evento'];

function ObservacionCell({ text, isLight }) {
    const value = String(text || '').trim();
    if (!value) return <span className={isLight ? 'text-slate-400' : 'text-slate-500'}>—</span>;
    return (
        <span
            className="block max-w-md whitespace-normal break-words text-left text-xs leading-snug"
            title={value}
        >
            {value}
        </span>
    );
}

function DetalleCancelacionModal({ row, isLight, onClose }) {
    const G = buildMonitorGlassModalTheme(Boolean(isLight));
    if (!row) return null;
    return (
        <div className={`fixed inset-0 z-[70] flex items-center justify-center p-4 ${G.overlayCls}`} role="dialog" aria-modal="true">
            <div className={`w-full ${monitorGlassModalSizeCls('md')} flex max-h-[85vh] flex-col overflow-hidden rounded-2xl ${G.modalCls}`}>
                <header className={`flex items-center justify-between gap-3 px-5 py-4 ${G.headerCls}`}>
                    <h3 className={`text-lg font-semibold ${G.textCls}`}>Detalle cancelación</h3>
                    <button type="button" onClick={onClose} className={G.closeBtnCls} aria-label="Cerrar">
                        ✕
                    </button>
                </header>
                <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
                    <dl className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <dt className="text-xs font-bold uppercase opacity-60">Nombre</dt>
                            <dd>{row.nombre || '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-xs font-bold uppercase opacity-60">Cliente</dt>
                            <dd>{row.cliente || '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-xs font-bold uppercase opacity-60">Status</dt>
                            <dd>{row.status || '—'}</dd>
                        </div>
                        <div>
                            <dt className="text-xs font-bold uppercase opacity-60">Origen</dt>
                            <dd>{row.origen === 'manual' ? 'Cancelado a mano' : 'Proceso de ingreso'}</dd>
                        </div>
                        <div>
                            <dt className="text-xs font-bold uppercase opacity-60">F. eliminación / rechazo</dt>
                            <dd>{fmtFecha(row.fecha_evento)}</dd>
                        </div>
                        <div className="sm:col-span-2">
                            <dt className="text-xs font-bold uppercase opacity-60">Observación</dt>
                            <dd className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/10 p-3 text-xs">
                                {row.obs_eliminacion || '—'}
                            </dd>
                        </div>
                    </dl>
                </div>
            </div>
        </div>
    );
}

export default function CancelacionesView({ auth, isLight }) {
    const G = buildGestionTableDash(Boolean(isLight));
    const canMonitor = userHasContratacionPanel(auth);
    const { executions, loading, error } = useMonitorData(canMonitor ? auth : null);
    const [sort, setSort] = useState(CANCELACIONES_DEFAULT_SORT);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);
    const [detalleRow, setDetalleRow] = useState(null);
    const [manualItems, setManualItems] = useState([]);
    const [manualLoading, setManualLoading] = useState(true);
    const [manualError, setManualError] = useState('');

    useEffect(() => {
        let alive = true;
        setManualLoading(true);
        setManualError('');
        onboardingApi
            .listCancelados(auth?.token || '', { limit: 2000, offset: 0 })
            .then((r) => {
                if (!alive) return;
                setManualItems(Array.isArray(r?.items) ? r.items : []);
            })
            .catch((e) => {
                if (!alive) return;
                setManualError(e?.response?.data?.error || e.message || 'No se pudieron cargar los cancelados.');
            })
            .finally(() => {
                if (alive) setManualLoading(false);
            });
        return () => {
            alive = false;
        };
    }, [auth?.token]);

    const rows = useMemo(() => {
        const monitorRows = canMonitor
            ? executions.filter(isMonitorCancellation).map(mapCancellationRow)
            : [];
        const manualRows = manualItems.map(mapManualCanceladoRow);
        const mapped = [...manualRows, ...monitorRows];
        return [...mapped].sort((a, b) => {
            const cmp = compareCancellationRows(a, b, sort.key, sort.dir);
            if (cmp !== 0) return cmp;
            return compareCancellationRows(a, b, 'fecha_evento', 'asc');
        });
    }, [canMonitor, executions, manualItems, sort]);

    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    const safePage = Math.min(page, totalPages - 1);
    const visible = rows.slice(safePage * pageSize, safePage * pageSize + pageSize);

    const handleSort = useCallback((columnKey) => {
        setSort((cur) => toggleSort(cur, columnKey));
        setPage(0);
    }, []);

    const columns = [
        { key: 'cedula', label: 'Cédula' },
        { key: 'nombre', label: 'Nombre' },
        { key: 'cliente', label: 'Cliente' },
        { key: 'puesto', label: 'Puesto' },
        { key: 'status', label: 'Status' },
        {
            key: 'origen',
            label: 'Origen',
            render: (r) => (r.origen === 'manual' ? 'Cancelado a mano' : 'Proceso de ingreso')
        },
        { key: 'fecha_inicio', label: 'F. inicio proceso', render: (r) => fmtFecha(r.fecha_inicio) },
        { key: 'fecha_evento', label: 'F. eliminación / rechazo', render: (r) => fmtFecha(r.fecha_evento) },
        {
            key: 'obs_eliminacion',
            label: 'Observación',
            sortable: false,
            cellClassName: 'max-w-md align-top',
            render: (r) => <ObservacionCell text={r.obs_eliminacion} isLight={isLight} />
        }
    ];

    const combinedError = manualError || (canMonitor ? error : '');
    const combinedLoading = manualLoading || (canMonitor && loading);

    return (
        <div className="flex flex-col gap-4">
            {combinedError ? (
                <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {combinedError}
                </div>
            ) : null}

            <SortableGestionDataTable
                columns={columns}
                rows={visible}
                isLight={isLight}
                sort={sort}
                onSort={handleSort}
                sortableKeys={SORT_KEYS}
                // Clave estable por ejecución: cédula/CARGANDO se repiten y rompían el reorden visual (AUT-545).
                rowKey={(r) => r.executionId || `${r.cedula || 'x'}-${r.fecha_evento || ''}-${r._eventMs || 0}`}
                emptyText={combinedLoading ? 'Cargando…' : 'Sin cancelaciones.'}
                onRowClick={setDetalleRow}
            />

            <div className={G.footerBar}>
                <div className="flex items-center gap-2">
                    <span>
                        {visible.length} de {rows.length} registros
                    </span>
                    <select
                        value={pageSize}
                        onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setPage(0);
                        }}
                        className={`rounded border px-2 py-1 text-xs ${isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-800'}`}
                        aria-label="Mostrar por página"
                    >
                        {[10, 20, 50, 100].map((n) => (
                            <option key={n} value={n}>
                                {n} por página
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        disabled={safePage === 0}
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        className={G.compactBtn}
                    >
                        ← Anterior
                    </button>
                    <span>
                        Página {safePage + 1} de {totalPages}
                    </span>
                    <button
                        type="button"
                        disabled={safePage >= totalPages - 1}
                        onClick={() => setPage((p) => p + 1)}
                        className={G.compactBtn}
                    >
                        Siguiente →
                    </button>
                </div>
            </div>

            <DetalleCancelacionModal row={detalleRow} isLight={isLight} onClose={() => setDetalleRow(null)} />
        </div>
    );
}
