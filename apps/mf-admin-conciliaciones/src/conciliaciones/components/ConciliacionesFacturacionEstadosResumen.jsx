import { ESTADOS_FACTURACION_META } from '../facturacionLogic.js';

/**
 * Pills de resumen por estado. Si `onEstadoClick` está definido, filtran la tabla al pulsar.
 */
export default function ConciliacionesFacturacionEstadosResumen({
    estados,
    activeEstado = '',
    onEstadoClick = null,
    variant = 'inline',
    isLight
}) {
    if (!estados) return null;

    const borderMuted = isLight ? 'border-slate-200' : 'border-slate-700/50';

    if (variant === 'inline') {
        return (
            <div className="mb-2 flex flex-wrap items-center gap-2" role="list" aria-label="Resumen de estados">
                {ESTADOS_FACTURACION_META.map(({ key, label, pill }) => {
                    const active = activeEstado === key;
                    const count = estados[key] ?? 0;
                    const className = `inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-body text-xs font-medium tabular-nums transition-all ${pill} ${
                        active ? 'ring-2 ring-[#65BCF7] ring-offset-1 ring-offset-transparent' : ''
                    } ${onEstadoClick ? 'cursor-pointer hover:brightness-110' : ''}`;

                    if (onEstadoClick) {
                        return (
                            <button
                                key={key}
                                type="button"
                                role="listitem"
                                className={className}
                                title={active ? `Quitar filtro (${label})` : `Filtrar por ${label}`}
                                aria-pressed={active}
                                onClick={() => onEstadoClick(key)}
                            >
                                <span className="font-medium opacity-80">{label}</span>
                                <span>{count}</span>
                            </button>
                        );
                    }

                    return (
                        <span key={key} role="listitem" className={className} title={`${label}: ${count}`}>
                            <span className="font-medium opacity-80">{label}</span>
                            <span>{count}</span>
                        </span>
                    );
                })}
            </div>
        );
    }

    return (
        <div className={`mt-3 grid grid-cols-2 gap-2 border-t pt-3 sm:grid-cols-3 xl:grid-cols-5 ${borderMuted}`}>
            {ESTADOS_FACTURACION_META.map(({ key, label, pill }) => (
                <div
                    key={key}
                    className={`rounded-lg border px-3 py-2 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700/50 bg-slate-800/40'}`}
                >
                    <span className={`text-[10px] font-heading font-bold uppercase tracking-wider ${pill.split(' ')[0]}`}>
                        {label}
                    </span>
                    <div className={`mt-0.5 font-heading text-lg font-extrabold tabular-nums ${pill.split(' ')[0]}`}>
                        {estados[key] ?? 0}
                    </div>
                </div>
            ))}
        </div>
    );
}
