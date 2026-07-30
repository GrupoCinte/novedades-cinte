import { PREENTREVISTA_FASES, faseNumero } from './preentrevistaFases.js';

export default function PreentrevistaFaseStepper({ fase, estado, isLight }) {
    const currentIdx = faseNumero(fase);
    const terminal = estado === 'descartada' || estado === 'no_disponible';
    const allDone = estado === 'completada';

    return (
        <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max items-start gap-0">
                {PREENTREVISTA_FASES.map((step, i) => {
                    const stepNum = i + 1;
                    let visual = 'pending';
                    if (allDone || stepNum < currentIdx) visual = 'done';
                    else if (stepNum === currentIdx) {
                        if (allDone) visual = 'done';
                        else if (terminal) visual = 'terminal';
                        else visual = 'current';
                    }

                    const circleBase = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold transition-all';
                    let circleCls = isLight
                        ? 'border-slate-300 bg-white text-slate-400'
                        : 'border-slate-700 bg-transparent text-slate-600';
                    if (visual === 'done') {
                        circleCls = isLight
                            ? 'border-blue-500 bg-blue-500 text-white shadow-sm'
                            : 'border-blue-400 bg-blue-500/80 text-white';
                    } else if (visual === 'current') {
                        circleCls = isLight
                            ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200 animate-pulse'
                            : 'border-blue-400 bg-blue-500/15 text-blue-300 ring-2 ring-blue-500/30 animate-pulse';
                    } else if (visual === 'terminal') {
                        circleCls = isLight
                            ? 'border-red-400 bg-red-50 text-red-700 ring-2 ring-red-200'
                            : 'border-red-500/50 bg-red-500/10 text-red-300 ring-2 ring-red-500/30';
                    }

                    const labelCls = visual === 'current' || visual === 'terminal'
                        ? (isLight ? 'font-bold text-slate-800' : 'font-bold text-slate-100')
                        : visual === 'done'
                            ? (isLight ? 'font-medium text-blue-700' : 'font-medium text-blue-300')
                            : (isLight ? 'text-slate-500' : 'text-slate-500');

                    return (
                        <div key={step.key} className="flex items-start">
                            <div className="flex w-[4.5rem] flex-col items-center gap-1">
                                <div className={`${circleBase} ${circleCls}`}>
                                    {visual === 'done' ? (
                                        <svg className="h-3 w-3" viewBox="0 0 10 10" fill="none" aria-hidden>
                                            <path d="M8.5 2.5L4 7 1.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    ) : (
                                        stepNum
                                    )}
                                </div>
                                <span className={`max-w-[4.5rem] text-center text-[9px] leading-tight ${labelCls}`}>
                                    {step.label}
                                </span>
                            </div>
                            {i < PREENTREVISTA_FASES.length - 1 ? (
                                <div
                                    className={`mt-3 h-px w-2 shrink-0 ${
                                        stepNum < currentIdx || allDone
                                            ? (isLight ? 'bg-blue-400' : 'bg-blue-500/60')
                                            : (isLight ? 'bg-slate-200' : 'bg-slate-700/50')
                                    }`}
                                    aria-hidden
                                />
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
