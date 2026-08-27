import { contratosFromFicha } from './contratoEstanteMap.js';

export { contratosFromFicha };

export function ContratosExtraBadge({ extra, isLight = false }) {
    const n = Number(extra) || 0;
    if (n <= 0) return null;
    return (
        <span
            className={`inline-flex shrink-0 items-center rounded-full border px-1.5 py-0 text-[10px] font-bold tabular-nums ${
                isLight
                    ? 'border-[#2F7BB8]/40 bg-[#2F7BB8]/10 text-[#004D87]'
                    : 'border-[#65BCF7]/40 bg-[#65BCF7]/15 text-[#65BCF7]'
            }`}
            title={`${n + 1} contratos vigentes. Abrir la ficha para verlos.`}
        >
            +{n}
        </span>
    );
}

function labelPastilla(c) {
    const bits = [c.cliente];
    if (c.tipo) bits.push(c.tipo);
    if (c.fechaTermino) bits.push(c.vigente ? `vence ${c.fechaTermino}` : `cerró ${c.fechaTermino}`);
    return bits.join(' · ');
}

export default function ContratoEstante({
    contratos = [],
    selectedId,
    onSelect,
    isLight = false
}) {
    if (!Array.isArray(contratos) || contratos.length === 0) return null;

    return (
        <div className="min-w-0" aria-label="Contratos">
            <div className="flex gap-2 overflow-x-auto px-0.5 py-1 custom-scrollbar">
                {contratos.map((c) => {
                    const active = c.id === selectedId;
                    const tone = active
                        ? isLight
                            ? 'border-[#2F7BB8] bg-[#E8F3FB] text-[#004D87]'
                            : 'border-[#65BCF7] bg-[#65BCF7]/15 text-[#E8F3FB]'
                        : c.vigente
                          ? isLight
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                          : isLight
                            ? 'border-slate-300 bg-slate-100 text-slate-600'
                            : 'border-white/15 bg-white/5 text-slate-300';
                    return (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => onSelect && onSelect(c.id)}
                            className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-left text-[11px] font-semibold leading-none ${tone}`}
                            title={labelPastilla(c)}
                        >
                            {labelPastilla(c)}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
