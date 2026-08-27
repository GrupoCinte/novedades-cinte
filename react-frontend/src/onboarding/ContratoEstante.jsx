import { contratosFromFicha } from './contratoEstanteMap.js';
import { alertaPastilla } from './contratoVencimiento.js';

export { contratosFromFicha };

function toneAlerta(kind, isLight) {
    if (kind === 'T5') {
        return isLight
            ? 'border-rose-400 bg-rose-50 text-rose-900'
            : 'border-rose-400/50 bg-rose-500/15 text-rose-100';
    }
    if (kind === 'T15') {
        return isLight
            ? 'border-orange-400 bg-orange-50 text-orange-950'
            : 'border-orange-400/50 bg-orange-500/15 text-orange-100';
    }
    if (kind === 'T30') {
        return isLight
            ? 'border-amber-400 bg-amber-50 text-amber-950'
            : 'border-amber-400/50 bg-amber-500/15 text-amber-100';
    }
    return null;
}

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

function labelPastilla(c, alerta) {
    const bits = [c.cliente];
    if (c.tipo) bits.push(c.tipo);
    if (c.fechaTermino) bits.push(c.vigente ? `vence ${c.fechaTermino}` : `cerró ${c.fechaTermino}`);
    if (c.vigente && alerta?.kind && alerta.dias != null) {
        bits.push(alerta.dias === 1 ? 'falta 1 día' : `faltan ${alerta.dias} días`);
    }
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
                    const alerta = alertaPastilla(c);
                    const active = c.id === selectedId;
                    const alertaTone = !active && c.vigente ? toneAlerta(alerta.kind, isLight) : null;
                    const tone = active
                        ? isLight
                            ? 'border-[#2F7BB8] bg-[#E8F3FB] text-[#004D87]'
                            : 'border-[#65BCF7] bg-[#65BCF7]/15 text-[#E8F3FB]'
                        : alertaTone
                          ? alertaTone
                          : c.vigente
                            ? isLight
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                            : isLight
                              ? 'border-slate-300 bg-slate-100 text-slate-600'
                              : 'border-white/15 bg-white/5 text-slate-300';
                    const label = labelPastilla(c, alerta);
                    return (
                        <button
                            key={c.id}
                            type="button"
                            onClick={() => onSelect && onSelect(c.id)}
                            className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-left text-[11px] font-semibold leading-none ${tone}`}
                            title={label}
                        >
                            {label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
