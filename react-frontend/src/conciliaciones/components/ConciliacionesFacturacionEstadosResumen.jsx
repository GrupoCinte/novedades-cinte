import {
    ESTADOS_FACTURACION_META,
    conciliacionEstadoStepCircleClass,
    conciliacionEstadoStepConnectorClass,
    conciliacionEstadoStepLabelClass
} from '../facturacionLogic.js';

function formatStepCount(count) {
    const n = Number(count) || 0;
    if (n > 999) return '999+';
    return String(n);
}

function countFontClass(count) {
    const n = Number(count) || 0;
    if (n >= 100) return 'text-[9px] sm:text-[10px]';
    return '';
}

/**
 * Stepper horizontal de estados (misma línea que En ingreso / TaskProgressCompact).
 * Centrado, círculos con conectores, etiqueta y conteo por estado.
 */
export default function ConciliacionesFacturacionEstadosResumen({
    estados,
    activeEstado = '',
    onEstadoClick = null,
    isLight = true,
    loading = false
}) {
    if (!estados && !loading) return null;

    if (loading) {
        return (
            <div
                className="mb-4 flex w-full justify-center overflow-x-auto px-2"
                role="status"
                aria-live="polite"
                aria-busy="true"
                aria-label="Cargando estados"
            >
                <div className="flex items-start gap-0">
                    {ESTADOS_FACTURACION_META.map(({ key }, idx) => (
                        <div key={key} className="flex items-start">
                            <div className="flex min-w-[4.25rem] flex-col items-center sm:min-w-[5rem]">
                                <span
                                    aria-hidden
                                    className={`h-9 w-9 animate-pulse rounded-full sm:h-10 sm:w-10 ${
                                        isLight ? 'bg-slate-100' : 'bg-slate-800/50'
                                    }`}
                                />
                                <span
                                    aria-hidden
                                    className={`mt-2 h-3 w-12 animate-pulse rounded ${
                                        isLight ? 'bg-slate-100' : 'bg-slate-800/40'
                                    }`}
                                />
                            </div>
                            {idx < ESTADOS_FACTURACION_META.length - 1 ? (
                                <span
                                    aria-hidden
                                    className={`mt-[1.125rem] h-0.5 w-6 animate-pulse sm:mt-5 sm:w-10 md:w-14 ${
                                        isLight ? 'bg-slate-100' : 'bg-slate-800/40'
                                    }`}
                                />
                            ) : null}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="mb-4 flex w-full justify-center overflow-x-auto px-2">
            <div className="flex items-start" role="list" aria-label="Resumen de estados de conciliación">
                {ESTADOS_FACTURACION_META.map((meta, idx) => {
                    const { key, label } = meta;
                    const count = estados[key] ?? 0;
                    const hasCount = count > 0;
                    const active = activeEstado === key;
                    const stepNum = idx + 1;
                    const circleClass = conciliacionEstadoStepCircleClass(meta, isLight, {
                        activeFilter: active,
                        hasCount
                    });
                    const labelClass = conciliacionEstadoStepLabelClass(meta, isLight, {
                        activeFilter: active,
                        hasCount
                    });
                    const interactive = Boolean(onEstadoClick);
                    const stepBody = (
                        <>
                            <div className={circleClass}>
                                {hasCount ? (
                                    <span className={countFontClass(count)}>{formatStepCount(count)}</span>
                                ) : (
                                    stepNum
                                )}
                            </div>
                            <span className={labelClass}>{label}</span>
                        </>
                    );

                    return (
                        <div key={key} className="flex items-start">
                            {interactive ? (
                                <button
                                    type="button"
                                    role="listitem"
                                    className="flex min-w-[4.25rem] flex-col items-center rounded-lg px-0.5 py-1 transition-opacity hover:opacity-90 sm:min-w-[5rem]"
                                    title={active ? `Quitar filtro (${label})` : `Filtrar por ${label}`}
                                    aria-pressed={active}
                                    onClick={() => onEstadoClick(key)}
                                >
                                    {stepBody}
                                </button>
                            ) : (
                                <div
                                    role="listitem"
                                    className="flex min-w-[4.25rem] flex-col items-center px-0.5 py-1 sm:min-w-[5rem]"
                                    title={`${label}: ${count}`}
                                >
                                    {stepBody}
                                </div>
                            )}
                            {idx < ESTADOS_FACTURACION_META.length - 1 ? (
                                <div
                                    aria-hidden
                                    className={conciliacionEstadoStepConnectorClass(meta, isLight, hasCount)}
                                />
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
