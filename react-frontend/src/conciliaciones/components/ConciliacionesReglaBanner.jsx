import { Info } from 'lucide-react';
import { REGLA_DISPLAY, formatPeriodoRangeEs } from '../conciliacionesCiclos.js';

export default function ConciliacionesReglaBanner({ regla, periodo, cliente, isLight }) {
    if (!regla && !periodo) return null;

    const tipo = regla?.tipo || 'MES_CALENDARIO';
    const display = regla?.display || REGLA_DISPLAY[tipo] || tipo;
    const detalle = String(regla?.detalle || '').trim();
    const periodoTxt = formatPeriodoRangeEs(periodo);
    const corteTxt = regla?.diaCorte ? ` (corte día ${regla.diaCorte})` : '';

    const shell = isLight
        ? 'border-cyan-200 bg-gradient-to-r from-cyan-50 to-sky-50 text-slate-800'
        : 'border-cyan-500/30 bg-gradient-to-r from-cyan-950/50 to-[#04141E] text-cyan-50';

    return (
        <div className={`mb-4 flex gap-3 rounded-xl border px-4 py-3 ${shell}`}>
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600 dark:text-cyan-400" aria-hidden />
            <div className="min-w-0 space-y-1">
                {cliente ? (
                    <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{cliente}</p>
                ) : null}
                <p className="text-sm font-bold">
                    Facturación: {display}
                    {detalle ? ` — ${detalle}` : ''}
                </p>
                {periodoTxt ? (
                    <p className="text-xs opacity-85">
                        Periodo del ciclo: {periodoTxt}
                        {corteTxt}
                    </p>
                ) : null}
            </div>
        </div>
    );
}
