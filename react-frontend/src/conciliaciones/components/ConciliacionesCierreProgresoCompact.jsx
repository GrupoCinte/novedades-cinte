import { ESTADOS_FACTURACION_META } from '../facturacionLogic.js';

function formatCount(count) {
    const n = Number(count) || 0;
    if (n > 99) return '99+';
    return String(n);
}

/**
 * Mini stepper de estados de facturación por cliente (estilo TaskProgressCompact / En ingreso).
 */
export default function ConciliacionesCierreProgresoCompact({ estados, isLight = true }) {
    if (!estados) {
        return <span className={`text-xs ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>—</span>;
    }

    return (
        <div className="flex items-center gap-0.5" aria-label="Progreso por estado de conciliación">
            {ESTADOS_FACTURACION_META.map((meta, idx) => {
                const count = Number(estados[meta.key]) || 0;
                const hasCount = count > 0;
                const done = hasCount;
                return (
                    <div key={meta.key} className="flex items-center">
                        <div
                            title={`${meta.label}: ${count}`}
                            className={`
                                relative flex h-5 w-5 shrink-0 items-center justify-center
                                rounded-full border text-[8px] font-bold tabular-nums transition-all
                                ${
                                    done
                                        ? isLight
                                            ? 'border-blue-500 bg-blue-500 text-white shadow-[0_0_4px_rgba(59,130,246,0.45)]'
                                            : 'border-blue-400 bg-blue-500/80 text-white'
                                        : isLight
                                          ? 'border-slate-300 bg-white text-slate-400'
                                          : 'border-slate-700 bg-transparent text-slate-600'
                                }
                            `}
                        >
                            {hasCount ? formatCount(count) : idx + 1}
                        </div>
                        {idx < ESTADOS_FACTURACION_META.length - 1 ? (
                            <div
                                className={`h-px w-2 ${
                                    done
                                        ? isLight
                                            ? 'bg-blue-400'
                                            : 'bg-blue-500/60'
                                        : isLight
                                          ? 'bg-slate-200'
                                          : 'bg-slate-700/50'
                                }`}
                                aria-hidden
                            />
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}
