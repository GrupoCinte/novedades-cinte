import { scoreColor } from './scoreRingUtils.js';

export { lerpColor, scoreColor } from './scoreRingUtils.js';

export default function ScoreRing({ score, size = 56, pending = false, partial = false, isLight = true }) {
    const stroke = 4;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const hasScore = score != null && !Number.isNaN(Number(score));
    const numeric = hasScore ? Math.min(100, Math.max(0, Math.round(Number(score)))) : 0;
    const progress = hasScore ? (numeric / 100) * circumference : 0;
    const color = hasScore ? scoreColor(numeric) : isLight ? '#94a3b8' : '#64748b';
    const track = isLight ? '#e2e8f0' : '#334155';

    let label = '—';
    if (pending && !hasScore) label = '…';
    else if (hasScore) label = String(numeric);

    return (
        <div
            className={`relative shrink-0 ${pending && !hasScore ? 'animate-pulse' : ''}`}
            style={{ width: size, height: size }}
            title={
                hasScore
                    ? `Score ${numeric}${partial ? ' (evaluación limitada)' : ''}`
                    : pending
                      ? 'Evaluando…'
                      : 'Sin evaluar'
            }
        >
            <svg width={size} height={size} className="-rotate-90" aria-hidden>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={track}
                    strokeWidth={stroke}
                    strokeDasharray={pending && !hasScore ? '4 4' : undefined}
                />
                {hasScore ? (
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke={color}
                        strokeWidth={stroke}
                        strokeLinecap="round"
                        strokeDasharray={`${progress} ${circumference - progress}`}
                    />
                ) : null}
            </svg>
            <span
                className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${
                    isLight ? 'text-slate-800' : 'text-slate-100'
                }`}
                style={hasScore ? { color } : undefined}
            >
                {label}
            </span>
        </div>
    );
}
