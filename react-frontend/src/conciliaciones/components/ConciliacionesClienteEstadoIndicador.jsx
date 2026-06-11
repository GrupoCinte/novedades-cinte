import ConciliacionesFacturacionEstadosResumen from './ConciliacionesFacturacionEstadosResumen.jsx';

/**
 * Cabecera del cliente + visor de estados centrado (badges con conteo).
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
            <div className="mb-2 flex flex-col gap-3" role="status" aria-live="polite" aria-busy="true">
                <div
                    className={`h-7 w-48 animate-pulse rounded-md ${
                        dash.isLight ? 'bg-slate-100' : 'bg-slate-800/40'
                    }`}
                    aria-hidden
                />
                <ConciliacionesFacturacionEstadosResumen loading isLight={dash.isLight} estados={null} />
            </div>
        );
    }

    if (!snapshot) return null;

    const ariaLabel = [snapshot.clienteLabel, monthLabel, snapshot.detail].filter(Boolean).join(' · ');

    return (
        <div className="mb-2 flex flex-col gap-3" aria-label={ariaLabel}>
            <div className="flex min-w-0 flex-wrap items-baseline justify-center gap-2 text-center sm:justify-start sm:text-left">
                <span className={`truncate font-heading ${dash.titleXl}`}>{snapshot.clienteLabel}</span>
                {monthLabel ? <span className={dash.mutedSm}>{monthLabel}</span> : null}
                <span className={`${dash.mutedSm} tabular-nums`}>{snapshot.detail}</span>
            </div>

            <ConciliacionesFacturacionEstadosResumen estados={snapshot.estados} isLight={dash.isLight} />
        </div>
    );
}
