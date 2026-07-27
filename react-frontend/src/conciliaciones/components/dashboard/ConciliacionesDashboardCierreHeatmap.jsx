import { Fragment } from 'react';
import { CINTE_HEADING } from '../../conciliacionesLayout.js';

function formatCop(n) {
    const x = Number(n) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}

function formatCopShort(n) {
    const x = Number(n) || 0;
    if (x >= 1_000_000) return `${Math.round(x / 1_000_000)}M`;
    if (x >= 1_000) return `${Math.round(x / 1_000)}K`;
    return String(x);
}

/** Opacidad de celda según intensidad (0–1). */
function cellIntensity(value, maxValue) {
    if (!value || !maxValue) return 0;
    return Math.max(0.12, Math.min(1, value / maxValue));
}

function cellBg(intensity, isLight) {
    if (isLight) {
        return `rgba(47, 123, 184, ${intensity})`;
    }
    return `rgba(101, 188, 247, ${intensity * 0.85})`;
}

export default function ConciliacionesDashboardCierreHeatmap({
    heatmap,
    dash,
    isLight,
    labelMuted,
    onOpenCliente
}) {
    const days = heatmap?.days || [];
    const rows = heatmap?.rows || [];
    const maxValue = heatmap?.maxValue || 0;

    if (!rows.length || !days.length) {
        return (
            <div className={`${dash.card} p-4 sm:p-5`}>
                <h2 className={`font-heading text-sm font-bold ${CINTE_HEADING}`}>Calendario de cierre por cliente</h2>
                <p className={`py-8 text-center text-sm ${labelMuted}`}>Sin datos de día de cierre</p>
            </div>
        );
    }

    return (
        <div className={`${dash.card} p-4 sm:p-5`}>
            <h2 className={`font-heading text-sm font-bold ${CINTE_HEADING}`}>Calendario de cierre por cliente</h2>
            <p className={`mt-1 text-xs ${labelMuted}`}>
                Intensidad = factura neta por día de cierre · top {rows.length} clientes
            </p>

            <div className="mt-4 overflow-x-auto">
                <div
                    className="inline-grid min-w-full gap-px text-[10px]"
                    style={{
                        gridTemplateColumns: `minmax(88px, 120px) repeat(${days.length}, minmax(28px, 1fr))`
                    }}
                >
                    <div className={`sticky left-0 z-10 px-1 py-1 font-semibold uppercase ${labelMuted}`}>Cliente</div>
                    {days.map((d) => (
                        <div key={`h-${d}`} className={`px-0.5 py-1 text-center font-semibold tabular-nums ${labelMuted}`}>
                            D{d}
                        </div>
                    ))}

                    {rows.map((row) => (
                        <Fragment key={row.cliente}>
                            <button
                                type="button"
                                className={`sticky left-0 z-10 truncate px-1 py-1 text-left font-medium transition-colors ${
                                    isLight
                                        ? 'bg-white hover:text-[#2F7BB8]'
                                        : 'bg-[#0A1F30] hover:text-[#65BCF7]'
                                }`}
                                title={row.cliente}
                                onClick={() => onOpenCliente?.(row.cliente)}
                            >
                                {row.clienteShort}
                            </button>
                            {row.cells.map((cell) => {
                                const intensity = cellIntensity(cell.value, maxValue);
                                const hasValue = cell.value > 0;
                                return (
                                    <div
                                        key={`${row.cliente}-${cell.day}`}
                                        className={`flex min-h-[28px] items-center justify-center rounded-sm tabular-nums ${
                                            hasValue ? 'cursor-default' : ''
                                        } ${!hasValue && (isLight ? 'bg-slate-50' : 'bg-slate-900/30')}`}
                                        style={hasValue ? { background: cellBg(intensity, isLight) } : undefined}
                                        title={
                                            hasValue
                                                ? `${row.cliente} · día ${cell.day}: ${formatCop(cell.value)}`
                                                : undefined
                                        }
                                    >
                                        {hasValue ? (
                                            <span className={intensity > 0.55 && !isLight ? 'text-slate-900' : isLight && intensity > 0.5 ? 'text-white' : ''}>
                                                {formatCopShort(cell.value)}
                                            </span>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </Fragment>
                    ))}
                </div>
            </div>

            <div className={`mt-3 flex items-center gap-2 text-[10px] ${labelMuted}`}>
                <span>Baja</span>
                <div
                    className="h-2 flex-1 max-w-[120px] rounded-full"
                    style={{
                        background: isLight
                            ? 'linear-gradient(to right, rgba(47,123,184,0.12), rgba(47,123,184,1))'
                            : 'linear-gradient(to right, rgba(101,188,247,0.12), rgba(101,188,247,0.9))'
                    }}
                    aria-hidden
                />
                <span>Alta factura</span>
            </div>
        </div>
    );
}
