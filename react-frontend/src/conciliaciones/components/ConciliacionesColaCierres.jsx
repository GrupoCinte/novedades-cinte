import { Link } from 'react-router-dom';
import { Receipt, Filter, ChevronDown, ChevronUp, X, RefreshCw } from 'lucide-react';
import { COLA_ESTADO_LABELS, filterColaCierresByEstado } from '../facturacionAggregate.js';
import ConciliacionesColaCierresCard from './ConciliacionesColaCierresCard.jsx';
import { CINTE_BTN_PRIMARY } from '../conciliacionesLayout.js';

export default function ConciliacionesColaCierres({
    items,
    loading,
    monthLabel,
    fEstadoCola,
    onEstadoColaChange,
    filtrosColaOpen,
    onToggleFiltrosCola,
    onAbrirCierre,
    headingAccent,
    labelMuted,
    isLight,
    dash,
    field
}) {
    const filtered = filterColaCierresByEstado(items, fEstadoCola);
    const hasFiltro = fEstadoCola && fEstadoCola !== 'TODOS';

    if (loading) {
        return (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div
                        key={i}
                        className={`h-64 animate-pulse rounded-xl border ${isLight ? 'border-slate-200 bg-slate-100' : 'border-slate-700/50 bg-slate-800/40'}`}
                        aria-hidden
                    />
                ))}
                <span className={`sr-only ${labelMuted}`}>Cargando cola de cierres…</span>
            </div>
        );
    }

    return (
        <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Receipt size={18} className="text-[#65BCF7]" aria-hidden />
                    <div>
                        <p className={`text-sm font-semibold ${headingAccent}`}>Cola de cierres — {monthLabel}</p>
                        <p className={`text-xs ${labelMuted}`}>
                            {filtered.length} servicio{filtered.length === 1 ? '' : 's'}
                            {hasFiltro ? ' (filtrado)' : ''}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    aria-expanded={filtrosColaOpen}
                    onClick={onToggleFiltrosCola}
                    className={dash?.filtrosAvanzadosBtn || 'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm'}
                >
                    <Filter size={16} aria-hidden />
                    <span className="hidden sm:inline">Filtrar cola</span>
                    {hasFiltro ? (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#2F7BB8] text-[10px] font-bold text-white">
                            1
                        </span>
                    ) : null}
                    {filtrosColaOpen ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
                </button>
            </div>

            {filtrosColaOpen ? (
                <div
                    className={`mb-4 flex flex-wrap items-end gap-3 rounded-xl border p-4 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700/50 bg-slate-800/30'}`}
                >
                    <div className="flex min-w-[12rem] flex-col gap-1.5">
                        <label htmlFor="cola-estado-filter" className={`text-xs font-bold ${labelMuted}`}>
                            Estado del cierre
                        </label>
                        <select
                            id="cola-estado-filter"
                            value={fEstadoCola || 'TODOS'}
                            onChange={(e) => onEstadoColaChange(e.target.value)}
                            className={`${field} w-full text-sm`}
                        >
                            <option value="TODOS">Todos</option>
                            {Object.entries(COLA_ESTADO_LABELS).map(([key, label]) => (
                                <option key={key} value={key}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </div>
                    {hasFiltro ? (
                        <button
                            type="button"
                            onClick={() => onEstadoColaChange('TODOS')}
                            className={`${dash?.borrarFiltros || ''} inline-flex items-center gap-1.5 text-sm`}
                        >
                            <RefreshCw size={14} aria-hidden />
                            Limpiar
                        </button>
                    ) : null}
                    <button type="button" onClick={onToggleFiltrosCola} className={dash?.compactBtn || 'text-sm'} aria-label="Cerrar filtros">
                        <X size={16} />
                    </button>
                </div>
            ) : null}

            {!filtered.length ? (
                <div
                    className={`flex flex-col items-center justify-center rounded-xl border px-6 py-16 text-center ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700/50 bg-slate-800/20'}`}
                >
                    <Receipt size={40} className={`mb-3 opacity-40 ${labelMuted}`} aria-hidden />
                    <p className={`text-sm font-semibold ${headingAccent}`}>
                        {items?.length ? 'Ningún servicio coincide con el filtro' : 'No hay servicios en la cola de cierres'}
                    </p>
                    <p className={`mt-1 max-w-md text-xs ${labelMuted}`}>
                        {items?.length
                            ? 'Prueba otro estado o limpia los filtros.'
                            : 'Crea servicios y asocia consultores en el módulo Servicios para comenzar a conciliar.'}
                    </p>
                    {!items?.length ? (
                        <Link to="/admin/conciliaciones/servicios" className={`${CINTE_BTN_PRIMARY} mt-4`}>
                            Ir a Servicios
                        </Link>
                    ) : null}
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filtered.map((item) => (
                        <ConciliacionesColaCierresCard
                            key={item.servicioId}
                            item={item}
                            onAbrirCierre={onAbrirCierre}
                            headingAccent={headingAccent}
                            labelMuted={labelMuted}
                            isLight={isLight}
                        />
                    ))}
                </div>
            )}
        </>
    );
}
