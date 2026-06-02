import { useEffect, useState } from 'react';
import { resolveCandidateWaitMs, resolveFlowProcessingMs } from '../utils/durationMetrics.js';
import FlipClockDuration from './FlipClockDuration.jsx';

/** Dos relojes flip en vivo: tiempo de flujo (procesamiento) y espera del candidato. */
export default function CandidateDurationClocks({ execution, isLight }) {
    const [nowTs, setNowTs] = useState(Date.now());

    useEffect(() => {
        const id = setInterval(() => setNowTs(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    if (!execution) return null;

    const flowMs = resolveFlowProcessingMs(execution, nowTs);
    const waitMs = resolveCandidateWaitMs(execution, nowTs);

    return (
        <div
            className={`mb-5 flex flex-col items-stretch justify-center gap-4 rounded-2xl border px-4 py-5 sm:flex-row sm:items-center sm:justify-around sm:gap-6 ${
                isLight ? 'border-slate-200/80 bg-slate-50/90' : 'border-white/10 bg-white/[0.04]'
            }`}
        >
            <FlipClockDuration totalMs={flowMs} label="Tiempo de flujo" isLight={isLight} accent="flow" />
            <div className={`hidden h-16 w-px sm:block ${isLight ? 'bg-slate-300' : 'bg-white/15'}`} aria-hidden />
            <FlipClockDuration totalMs={waitMs} label="Espera del candidato" isLight={isLight} accent="wait" />
        </div>
    );
}
