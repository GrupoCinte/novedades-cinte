import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import ConciliacionesAjusteAnticipoModal from './ConciliacionesAjusteAnticipoModal.jsx';
import { formatSaldoAnticipoLabel } from '../facturacionLogic.js';

function formatCop(n) {
    const x = Number(n) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}

/**
 * KPIs de conciliación — misma línea gráfica que Dashboard conciliaciones (`dash.card`).
 */
export default function ConciliacionesMetricCards({
    totales,
    detailRows = [],
    cardClass = '',
    headingAccent,
    labelMuted,
    isLight,
    compact = false
}) {
    const [ajusteModalOpen, setAjusteModalOpen] = useState(false);
    const t = totales || {};

    const aFavor = Math.round(Number(t.ajusteAnticipoSuma) || 0);
    const enContra = Math.round(Number(t.ajusteAnticipoSum) || 0);
    const hasAdvanceAjuste = aFavor > 0 || enContra > 0;
    const neto = Math.round(Number(t.saldoAnticipoNetCop) ?? aFavor - enContra);
    const saldoTipo = t.saldoAnticipoTipo ?? (neto > 0 ? 'contra' : neto < 0 ? 'favor' : null);

    const saldoHintCls =
        saldoTipo === 'favor'
            ? 'text-emerald-600 dark:text-emerald-400'
            : saldoTipo === 'contra'
              ? 'text-amber-600 dark:text-amber-400'
              : labelMuted;

    const staticItems = [
        { key: 'tarifa', label: 'Tarifa', value: formatCop(t.tarifaSum), tabular: true },
        { key: 'incrementos', label: 'Incrementos (novedades)', value: formatCop(t.incrementoSum), tabular: true },
        { key: 'deducciones', label: 'Deducciones (novedades)', value: formatCop(t.deduccionSum), tabular: true }
    ];

    const totalItem = { key: 'total', label: 'Total factura', value: formatCop(t.facturaSum), tabular: true, highlight: true };

    const shell = cardClass || (isLight != null
        ? isLight
            ? 'rounded-2xl border border-slate-200 bg-white shadow-md'
            : 'rounded-2xl border border-slate-700/50 bg-[#1e293b] shadow-lg'
        : '');

    const pad = compact ? 'p-3' : 'p-4';
    const labelCls = `text-[10px] font-heading font-bold uppercase tracking-wider ${labelMuted}`;
    const valueCls = compact
        ? `mt-1 truncate font-heading text-sm font-extrabold sm:text-base ${headingAccent}`
        : `mt-2 font-heading text-lg font-extrabold sm:text-xl ${headingAccent}`;
    const hover =
        shell && isLight != null
            ? isLight
                ? 'transition-shadow hover:shadow-lg'
                : 'transition-shadow hover:shadow-xl hover:shadow-[#2F7BB8]/10'
            : '';

    const gridCols = hasAdvanceAjuste
        ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-5'
        : 'grid-cols-2 sm:grid-cols-2 xl:grid-cols-4';

    function renderStaticCard({ key, label, value, tabular, highlight }) {
        const highlightShell = highlight
            ? isLight
                ? 'border-[#2F7BB8]/30 bg-[#2F7BB8]/5'
                : 'border-[#65BCF7]/25 bg-[#2F7BB8]/10'
            : '';
        return (
            <div key={key} className={`min-w-0 ${shell ? `${shell} ${pad} ${hover} ${highlightShell}` : ''}`}>
                <p className={labelCls}>{label}</p>
                <p className={`${valueCls}${tabular ? ' tabular-nums' : ''}`}>{value}</p>
            </div>
        );
    }

    return (
        <>
            <div className={`grid ${gridCols} gap-2 ${compact ? 'gap-2' : 'gap-3'}`}>
                {staticItems.map(renderStaticCard)}

                {hasAdvanceAjuste ? (
                    <button
                        type="button"
                        onClick={() => setAjusteModalOpen(true)}
                        className={`min-w-0 text-left ${shell ? `${shell} ${pad} ${hover}` : ''} group cursor-pointer border-dashed ${
                            isLight ? 'border-[#2F7BB8]/40 hover:border-[#2F7BB8]/60' : 'border-[#65BCF7]/30 hover:border-[#65BCF7]/50'
                        }`}
                        aria-label="Ver detalle del ajuste mes anticipado"
                    >
                        <div className="flex items-start justify-between gap-1">
                            <p className={labelCls}>Ajuste anticipo</p>
                            <ChevronRight
                                size={14}
                                className={`mt-0.5 shrink-0 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100 ${labelMuted}`}
                                aria-hidden
                            />
                        </div>
                        <p className={`${valueCls} tabular-nums`}>{formatCop(Math.abs(neto))}</p>
                        {saldoTipo ? (
                            <p className={`mt-0.5 truncate text-[10px] font-bold uppercase tracking-wide ${saldoHintCls}`}>
                                {formatSaldoAnticipoLabel(saldoTipo, t.ajusteAnticipoMesLabel)}
                            </p>
                        ) : (
                            <p className={`mt-0.5 text-[10px] ${labelMuted}`}>Ver detalle</p>
                        )}
                    </button>
                ) : null}

                {renderStaticCard(totalItem)}
            </div>

            <ConciliacionesAjusteAnticipoModal
                open={ajusteModalOpen}
                onClose={() => setAjusteModalOpen(false)}
                totales={t}
                detailRows={detailRows}
                isLight={isLight}
            />
        </>
    );
}
