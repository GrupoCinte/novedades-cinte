import { conciliacionEstadoChipClass, conciliacionEstadoDotClass } from '../facturacionLogic.js';

/**
 * Indicador del estado de conciliación del cliente (misma línea gráfica que Gestión de Novedades).
 */
export default function ConciliacionesClienteEstadoIndicador({
    snapshot,
    monthLabel = '',
    loading = false,
    dash
}) {
    if (!snapshot && !loading) return null;
    if (!dash) return null;

    if (loading && !snapshot) {
        return (
            <div
                className="mb-2 flex flex-col gap-2 md:gap-3"
                role="status"
                aria-live="polite"
                aria-busy="true"
            >
                <div className="flex flex-wrap gap-2" aria-hidden>
                    {Array.from({ length: 5 }).map((_, i) => (
                        <span
                            key={i}
                            className={`h-[1.625rem] w-[4.5rem] animate-pulse rounded-md border px-2.5 py-1 ${
                                dash.isLight ? 'border-slate-200 bg-slate-100' : 'border-slate-700/50 bg-slate-800/40'
                            }`}
                        />
                    ))}
                </div>
                <span className={dash.mutedSm}>Cargando conciliación…</span>
            </div>
        );
    }

    if (!snapshot) return null;

    const estadoSlots = snapshot.estadoSlots || [];
    const ariaLabel = [
        snapshot.clienteLabel,
        monthLabel,
        snapshot.detail,
        ...estadoSlots.filter((s) => s.active).map((s) => s.label)
    ]
        .filter(Boolean)
        .join(' · ');

    return (
        <div className="mb-2 flex flex-col gap-2 md:gap-3" aria-label={ariaLabel}>
            <div className="flex min-w-0 flex-wrap items-baseline gap-2">
                <span className={`truncate font-heading ${dash.titleXl}`}>{snapshot.clienteLabel}</span>
                {monthLabel ? <span className={dash.mutedSm}>{monthLabel}</span> : null}
                <span className={`${dash.mutedSm} tabular-nums`}>{snapshot.detail}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2" role="list" aria-label="Estados de conciliación">
                {estadoSlots.map((slot) => {
                    const chipClass = conciliacionEstadoChipClass(slot.active, slot.pill, dash.isLight);
                    const dotClass = slot.active
                        ? conciliacionEstadoDotClass(slot.key)
                        : dash.isLight
                          ? 'bg-slate-300/80'
                          : 'bg-slate-600/50';

                    return (
                        <span
                            key={slot.key}
                            role="listitem"
                            className={chipClass}
                            title={slot.label}
                            aria-current={slot.active ? 'true' : undefined}
                        >
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} aria-hidden />
                            {slot.label}
                        </span>
                    );
                })}
            </div>
        </div>
    );
}
