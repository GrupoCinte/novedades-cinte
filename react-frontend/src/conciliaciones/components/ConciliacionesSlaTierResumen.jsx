import {
    SLA_TIER_META,
    slaTierStepCircleClass,
    slaTierStepConnectorClass,
    slaTierStepLabelClass
} from '../conciliacionesCierreVisual.js';

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
 * Stepper horizontal de tiers SLA (filtro global del dashboard de cierres).
 */
export default function ConciliacionesSlaTierResumen({
    counts,
    activeTier = '',
    onTierClick = null,
    isLight = true,
    loading = false
}) {
    if (loading) {
        return (
            <div className="mb-4 flex w-full justify-center px-2" role="status" aria-busy="true">
                <div
                    className={`h-16 w-full max-w-3xl animate-pulse rounded-xl ${
                        isLight ? 'bg-slate-100' : 'bg-slate-800/40'
                    }`}
                />
            </div>
        );
    }

    return (
        <div className="mb-4 flex w-full justify-center overflow-x-auto px-2">
            <div className="flex items-start" role="list" aria-label="Resumen de estados SLA por cierre">
                {SLA_TIER_META.map((meta, idx) => {
                    const { key, label } = meta;
                    const count = counts?.[key] ?? 0;
                    const hasCount = count > 0;
                    const active = activeTier === key;
                    const circleClass = slaTierStepCircleClass(key, isLight, { activeFilter: active, hasCount });
                    const labelClass = slaTierStepLabelClass(key, isLight, { activeFilter: active, hasCount });
                    const interactive = Boolean(onTierClick);
                    const stepBody = (
                        <>
                            <div className={circleClass}>
                                {hasCount ? (
                                    <span className={countFontClass(count)}>{formatStepCount(count)}</span>
                                ) : (
                                    idx + 1
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
                                    onClick={() => onTierClick(key)}
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
                            {idx < SLA_TIER_META.length - 1 ? (
                                <div
                                    aria-hidden
                                    className={slaTierStepConnectorClass(key, isLight, hasCount)}
                                />
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
