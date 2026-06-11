import { useEffect, useMemo, useState } from 'react';
import { gestionTableHeadCellCls, gestionTableHeadRowCls } from '../../gestionTableDashTheme.js';
import {
    cierreFechaCorteLabel,
    cierreProgressPct,
    cierreReglaLabel,
    cierreVisualState,
    slaTierBadgeClass,
    slaTierLabel,
    slaTierOrder
} from '../conciliacionesCierreVisual.js';
import ConciliacionesCierreProgresoCompact from './ConciliacionesCierreProgresoCompact.jsx';

const GRID_COLS =
    'grid-cols-[minmax(10rem,1.6fr)_minmax(6rem,0.9fr)_minmax(6rem,0.85fr)_minmax(5rem,0.7fr)_minmax(9rem,1.1fr)_minmax(7rem,0.9fr)_minmax(7rem,0.85fr)]';

function parseSortDays(cierre) {
    const d = Number(cierre?.daysUntil);
    return Number.isFinite(d) ? d : 9999;
}

export default function ConciliacionesCierresTable({
    rows = [],
    isLight,
    pageSize = 20,
    onVerConciliacion,
    emptyText = 'No hay clientes para mostrar.'
}) {
    const [sortBy, setSortBy] = useState('days');
    const [sortDir, setSortDir] = useState('asc');
    const [page, setPage] = useState(1);

    const headCellCls = gestionTableHeadCellCls(isLight);

    useEffect(() => {
        setPage(1);
    }, [rows.length, pageSize, sortBy, sortDir]);

    const sorted = useMemo(() => {
        const list = [...rows];
        list.sort((a, b) => {
            let cmp = 0;
            if (sortBy === 'cliente') {
                cmp = String(a.cliente || '').localeCompare(String(b.cliente || ''), 'es', { sensitivity: 'base' });
            } else if (sortBy === 'sla') {
                cmp = slaTierOrder(cierreVisualState(a)) - slaTierOrder(cierreVisualState(b));
            } else if (sortBy === 'corte') {
                cmp = String(a.periodo?.end || '').localeCompare(String(b.periodo?.end || ''));
            } else if (sortBy === 'days') {
                cmp = parseSortDays(a) - parseSortDays(b);
            } else if (sortBy === 'progress') {
                cmp = cierreProgressPct(a) - cierreProgressPct(b);
            }
            if (cmp !== 0) return sortDir === 'desc' ? -cmp : cmp;
            return String(a.cliente || '').localeCompare(String(b.cliente || ''), 'es', { sensitivity: 'base' });
        });
        return list;
    }, [rows, sortBy, sortDir]);

    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const currentPage = Math.min(page, totalPages);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const pageStart = (currentPage - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, sorted.length);
    const visible = sorted.slice(pageStart, pageStart + pageSize);

    function toggleSort(key) {
        setSortBy((cur) => {
            if (cur === key) {
                setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
                return cur;
            }
            setSortDir(key === 'cliente' ? 'asc' : key === 'days' ? 'asc' : 'desc');
            return key;
        });
    }

    function sortMark(key) {
        if (sortBy !== key) return null;
        return <span className="text-[10px] opacity-70">{sortDir === 'desc' ? '▼' : '▲'}</span>;
    }

    if (!rows.length) {
        return <p className={`py-12 text-center text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{emptyText}</p>;
    }

    return (
        <div
            className={
                isLight
                    ? 'flex min-h-0 flex-col overflow-hidden rounded-2xl border backdrop-blur-xl border-white/40 bg-white/80 shadow-xl'
                    : 'glass-card flex min-h-0 w-full flex-col p-0'
            }
        >
            <div className={`grid ${GRID_COLS} items-center gap-3 ${gestionTableHeadRowCls(isLight)}`}>
                <button type="button" className={`${headCellCls} flex items-center gap-2 text-left`} onClick={() => toggleSort('cliente')}>
                    Cliente {sortMark('cliente')}
                </button>
                <button type="button" className={`${headCellCls} flex items-center gap-2 text-left`} onClick={() => toggleSort('sla')}>
                    Estado SLA {sortMark('sla')}
                </button>
                <button type="button" className={`${headCellCls} flex items-center gap-2 text-left`} onClick={() => toggleSort('corte')}>
                    Fecha corte {sortMark('corte')}
                </button>
                <button type="button" className={`${headCellCls} flex items-center gap-2 text-left`} onClick={() => toggleSort('days')}>
                    Días {sortMark('days')}
                </button>
                <button type="button" className={`${headCellCls} flex items-center gap-2 text-left`} onClick={() => toggleSort('progress')}>
                    Progreso {sortMark('progress')}
                </button>
                <span className={headCellCls}>Regla</span>
                <span className={`${headCellCls} text-right`}>Acciones</span>
            </div>

            <div className="min-h-0 flex-1 divide-y divide-[var(--border)] overflow-y-auto">
                {visible.map((cierre) => {
                    const tier = cierreVisualState(cierre);
                    const badgeCls = slaTierBadgeClass(tier, isLight);
                    const regla = cierreReglaLabel(cierre);
                    const diaCorte = cierre.diaCorte != null ? ` · día ${cierre.diaCorte}` : '';

                    return (
                        <div
                            key={cierre.cliente}
                            role="button"
                            tabIndex={0}
                            onClick={() => onVerConciliacion?.(cierre)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onVerConciliacion?.(cierre);
                                }
                            }}
                            className={`grid w-full cursor-pointer ${GRID_COLS} items-center gap-3 px-4 py-3 transition-colors ${
                                isLight ? 'hover:bg-white/60' : 'hover:bg-white/5'
                            }`}
                        >
                            <div className="min-w-0">
                                <p className={`truncate text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                                    {cierre.cliente}
                                </p>
                                <p className={`truncate text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                    {cierre.estadoTarjetaLabel || '—'}
                                </p>
                            </div>
                            <div className="min-w-0 flex items-center">
                                <span
                                    className={`inline-flex max-w-full truncate rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${badgeCls}`}
                                >
                                    {slaTierLabel(tier)}
                                </span>
                            </div>
                            <div className={`text-xs font-medium tabular-nums ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                                {cierreFechaCorteLabel(cierre)}
                            </div>
                            <div className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                                {cierre.cutoffLabel || (Number.isFinite(cierre.daysUntil) ? String(cierre.daysUntil) : '—')}
                            </div>
                            <div className="min-w-0">
                                <ConciliacionesCierreProgresoCompact estados={cierre.estados} isLight={isLight} />
                            </div>
                            <div className={`text-xs truncate ${isLight ? 'text-slate-600' : 'text-slate-400'}`} title={`${regla}${diaCorte}`}>
                                {regla}
                                {diaCorte}
                            </div>
                            <div className="flex shrink-0 items-center justify-end" onClick={(e) => e.stopPropagation()}>
                                <button
                                    type="button"
                                    onClick={() => onVerConciliacion?.(cierre)}
                                    className="rounded-md border border-[#2F7BB8]/65 bg-transparent px-2 py-1 text-[10px] font-semibold text-[#2F7BB8] transition hover:bg-[rgba(47,123,184,0.08)] dark:text-[#65BCF7] dark:border-[#65BCF7]/50"
                                >
                                    Ver conciliación
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div
                className={`flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 ${
                    isLight ? 'border-slate-200/50 bg-slate-50/50' : 'border-white/5 bg-transparent'
                }`}
            >
                <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    {sorted.length === 0
                        ? 'Sin resultados'
                        : `Mostrando ${pageStart + 1}–${pageEnd} de ${sorted.length} cliente${sorted.length === 1 ? '' : 's'}`}
                </p>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        disabled={currentPage <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                            isLight
                                ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                : 'border-slate-600 bg-slate-800/60 text-slate-200 hover:bg-slate-700/50'
                        }`}
                    >
                        Anterior
                    </button>
                    <span className={`text-xs tabular-nums ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        {currentPage} / {totalPages}
                    </span>
                    <button
                        type="button"
                        disabled={currentPage >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                            isLight
                                ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                                : 'border-slate-600 bg-slate-800/60 text-slate-200 hover:bg-slate-700/50'
                        }`}
                    >
                        Siguiente
                    </button>
                </div>
            </div>
        </div>
    );
}
