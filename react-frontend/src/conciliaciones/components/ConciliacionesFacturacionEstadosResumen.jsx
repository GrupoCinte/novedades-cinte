import { ESTADOS_FACTURACION_META } from '../facturacionLogic.js';

function CheckIcon() {
    return (
        <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
            <path
                d="M8.5 2.5L4 7 1.5 4.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
            />
        </svg>
    );
}

function resolveStepState(index, key, estados) {
    const count = estados[key] ?? 0;
    const maxActiveIndex = ESTADOS_FACTURACION_META.reduce(
        (max, step, stepIndex) => ((estados[step.key] ?? 0) > 0 ? stepIndex : max),
        -1
    );
    const current = count > 0;
    const done = maxActiveIndex >= 0 && index < maxActiveIndex && count === 0;
    return { count, done, current, pending: !done && !current };
}

function stepCircleClass({ done, current, filtered, isLight }) {
    if (done) {
        return isLight
            ? 'border-[#2F7BB8] bg-[#2F7BB8] text-white shadow-[0_0_6px_rgba(47,123,184,0.45)]'
            : 'border-[#65BCF7] bg-[#2F7BB8] text-white shadow-[0_0_6px_rgba(101,188,247,0.35)]';
    }
    if (current) {
        const pulse = filtered ? '' : 'animate-pulse';
        return isLight
            ? `border-[#65BCF7] bg-[#2F7BB8]/10 text-[#2F7BB8] ${pulse}`
            : `border-[#65BCF7]/60 bg-[#2F7BB8]/20 text-[#65BCF7] ${pulse}`;
    }
    return isLight ? 'border-slate-300 bg-white text-slate-400' : 'border-slate-700 bg-transparent text-slate-600';
}

function connectorClass(done, isLight) {
    return done
        ? isLight
            ? 'bg-[#2F7BB8]'
            : 'bg-[#65BCF7]/60'
        : isLight
          ? 'bg-slate-200'
          : 'bg-slate-700/50';
}

/**
 * Stepper con chulos (✓) estilo En ingreso / TaskProgressCompact.
 * Cada paso = un estado de conciliación; clic filtra si `onEstadoClick` está definido.
 */
export default function ConciliacionesFacturacionEstadosResumen({
    estados,
    activeEstado = '',
    onEstadoClick = null,
    variant = 'inline',
    hideZeroCounts: _hideZeroCounts = false,
    isLight,
    showLabels = false
}) {
    if (!estados) return null;

    const borderMuted = isLight ? 'border-slate-200' : 'border-slate-700/50';
    const clickable = Boolean(onEstadoClick);
    const steps = ESTADOS_FACTURACION_META;

    if (variant === 'chulos') {
        return (
            <div role="group" aria-label="Resumen de estados">
                <div className="flex items-center gap-1">
                    {steps.map(({ key, label, shortLabel }, index) => {
                        const stepNum = index + 1;
                        const visual = resolveStepState(index, key, estados);
                        const filtered = activeEstado === key;
                        const circleCls = stepCircleClass({ ...visual, filtered, isLight });
                        const title = `${label}: ${visual.count}`;

                        const circle = (
                            <div
                                className={`relative flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold transition-all duration-300 ${circleCls} ${
                                    filtered ? 'ring-2 ring-[#65BCF7] ring-offset-1 ring-offset-transparent' : ''
                                }`}
                            >
                                {visual.done ? (
                                    <CheckIcon />
                                ) : visual.current ? (
                                    visual.count
                                ) : (
                                    stepNum
                                )}
                            </div>
                        );

                        return (
                            <div key={key} className="flex items-center">
                                {clickable ? (
                                    <button
                                        type="button"
                                        className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-[#65BCF7]"
                                        title={filtered ? `Quitar filtro (${label})` : `Filtrar por ${label}`}
                                        aria-label={title}
                                        aria-pressed={filtered}
                                        onClick={() => onEstadoClick(key)}
                                    >
                                        {circle}
                                    </button>
                                ) : (
                                    <span title={title} aria-label={title}>
                                        {circle}
                                    </span>
                                )}
                                {index < steps.length - 1 ? (
                                    <div
                                        className={`h-px w-3 transition-all duration-300 ${connectorClass(visual.done, isLight)}`}
                                        aria-hidden
                                    />
                                ) : null}
                            </div>
                        );
                    })}
                </div>
                {showLabels ? (
                    <div className="mt-1 flex items-start gap-1">
                        {steps.map(({ key, shortLabel }, index) => (
                            <div key={key} className="flex items-center">
                                <span
                                    className={`w-5 shrink-0 text-center text-[9px] font-semibold uppercase tracking-wide ${
                                        activeEstado === key
                                            ? isLight
                                                ? 'text-[#2F7BB8]'
                                                : 'text-[#65BCF7]'
                                            : 'text-slate-500'
                                    }`}
                                    title={ESTADOS_FACTURACION_META[index].label}
                                >
                                    {shortLabel}
                                </span>
                                {index < steps.length - 1 ? <span className="w-3 shrink-0" aria-hidden /> : null}
                            </div>
                        ))}
                    </div>
                ) : null}
            </div>
        );
    }

    if (variant === 'inline') {
        return (
            <div className="mb-2 flex flex-wrap items-center gap-2" role="list" aria-label="Resumen de estados">
                {ESTADOS_FACTURACION_META.map(({ key, label, pill }) => {
                    const active = activeEstado === key;
                    const count = estados[key] ?? 0;
                    const className = `inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-body text-xs font-medium tabular-nums transition-all ${pill} ${
                        active ? 'ring-2 ring-[#65BCF7] ring-offset-1 ring-offset-transparent' : ''
                    } ${clickable ? 'cursor-pointer hover:brightness-110' : ''}`;

                    if (clickable) {
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
