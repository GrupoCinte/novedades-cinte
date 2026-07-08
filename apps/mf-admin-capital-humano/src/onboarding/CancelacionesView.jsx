import { useCallback, useMemo, useState } from 'react';
import useMonitorData from '../contratacion/hooks/useMonitorData.js';
import { userHasContratacionPanel } from '../contratacion/contratacionAccess.js';
import SortableGestionDataTable from './SortableGestionDataTable.jsx';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';
import { CANCELACIONES_DEFAULT_SORT, toggleSort } from './onboardingSortDefaults.js';
import { fmtFecha } from './views.jsx';
import {
    isMonitorCancellation,
    mapCancellationRow
} from './cancelacionesFilter.js';

const SORT_KEYS = ['cedula', 'nombre', 'cliente', 'puesto', 'status', 'fecha_inicio', 'fecha_evento'];

function compareRows(a, b, key, dir) {
    const mul = dir === 'desc' ? -1 : 1;
    if (key === 'fecha_evento') {
        return (a._eventMs - b._eventMs) * mul;
    }
    if (key === 'fecha_inicio') {
        const av = a.fecha_inicio || '';
        const bv = b.fecha_inicio || '';
        return av.localeCompare(bv, 'es') * mul;
    }
    const av = String(a[key] ?? '');
    const bv = String(b[key] ?? '');
    return av.localeCompare(bv, 'es', { sensitivity: 'base' }) * mul;
}

export default function CancelacionesView({ auth, isLight }) {
    const G = buildGestionTableDash(Boolean(isLight));
    const canMonitor = userHasContratacionPanel(auth);
    const { executions, loading, error } = useMonitorData(canMonitor ? auth : null);
    const [sort, setSort] = useState(CANCELACIONES_DEFAULT_SORT);
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(50);

    const rows = useMemo(() => {
        const mapped = executions.filter(isMonitorCancellation).map(mapCancellationRow);
        return [...mapped].sort((a, b) => {
            const cmp = compareRows(a, b, sort.key, sort.dir);
            if (cmp !== 0) return cmp;
            return compareRows(a, b, 'fecha_evento', 'asc');
        });
    }, [executions, sort]);

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
        { key: 'fecha_inicio', label: 'F. inicio proceso', render: (r) => fmtFecha(r.fecha_inicio) },
        { key: 'fecha_evento', label: 'F. eliminación / rechazo', render: (r) => fmtFecha(r.fecha_evento) },
        { key: 'obs_eliminacion', label: 'Observación', sortable: false }
    ];

    if (!canMonitor) {
        return (
            <div className="flex flex-col gap-4">
                <header>
                    <h2 className={G.titleXl}>Cancelaciones / eliminaciones</h2>
                    <p className={G.mutedSm}>
                        Necesitas acceso al panel Contratación (monitor n8n) para consultar candidatos rechazados o eliminados.
                    </p>
                </header>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <header>
                <h2 className={G.titleXl}>Cancelaciones / eliminaciones</h2>
                <p className={G.mutedSm}>
                    Candidatos del monitor n8n con status eliminado o rechazado (no incluye ingresos finalizados ni bajas del maestro).
                </p>
            </header>

            {error ? (
                <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {error}
                </div>
            ) : null}

            <SortableGestionDataTable
                columns={columns}
                rows={visible}
                isLight={isLight}
                sort={sort}
                onSort={handleSort}
                sortableKeys={SORT_KEYS}
                emptyText={loading ? 'Cargando…' : 'Sin cancelaciones o eliminaciones en el monitor.'}
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
        </div>
    );
}
