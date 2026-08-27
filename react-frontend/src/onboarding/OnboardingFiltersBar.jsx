import { ChevronDown, ChevronUp, Filter, X } from 'lucide-react';

/**
 * Barra de filtros del módulo Onboarding.
 *
 * compact (CH listados): sin chip vacío, botón «Filtros», buscador flexible
 * y chips quitables debajo.
 */
export default function OnboardingFiltersBar({
    chipLabel,
    panelOpen,
    onToggle,
    search,
    onSearchChange,
    searchPlaceholder = 'Buscar…',
    isLight = false,
    rightSlot = null,
    compact = false,
    chips = [],
    buttonLabel
}) {
    const label = buttonLabel || (compact ? 'Filtros' : 'Filtros avanzados');
    const chipCls = isLight
        ? 'inline-flex max-w-[min(100%,18rem)] items-center truncate rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700'
        : 'inline-flex max-w-[min(100%,18rem)] items-center truncate rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300';
    const pillCls = isLight
        ? 'inline-flex max-w-[min(100%,18rem)] items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium text-slate-700 shadow-sm'
        : 'inline-flex max-w-[min(100%,18rem)] items-center gap-1 rounded-full border border-slate-600 bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-200 shadow-sm';
    const btnCls = isLight
        ? 'inline-flex shrink-0 items-center gap-2 rounded-xl border border-cyan-600/35 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-900 shadow-sm transition-all hover:bg-cyan-100'
        : 'inline-flex shrink-0 items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 shadow-sm transition-all hover:bg-cyan-500/20';
    const inputCls = compact
        ? isLight
            ? 'min-w-[10rem] flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none'
            : 'min-w-[10rem] flex-1 rounded-md border border-slate-600 bg-slate-900/40 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none'
        : isLight
          ? 'w-[min(100%,16rem)] max-w-[20rem] shrink-0 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none'
          : 'w-[min(100%,16rem)] max-w-[20rem] shrink-0 rounded-md border border-slate-600 bg-slate-900/40 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none';

    const showSummaryChip = !compact && chipLabel;

    return (
        <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
                {showSummaryChip ? (
                    <span className={chipCls} title={chipLabel}>
                        {chipLabel}
                    </span>
                ) : null}
                <button
                    type="button"
                    aria-expanded={Boolean(panelOpen)}
                    onClick={onToggle}
                    className={btnCls}
                >
                    <Filter size={16} className="shrink-0 opacity-90" aria-hidden />
                    <span>{label}</span>
                    {panelOpen ? (
                        <ChevronUp size={18} className="shrink-0 opacity-90" aria-hidden />
                    ) : (
                        <ChevronDown size={18} className="shrink-0 opacity-90" aria-hidden />
                    )}
                </button>
                {typeof onSearchChange === 'function' ? (
                    <input
                        type="search"
                        enterKeyHint="search"
                        value={search || ''}
                        onChange={(e) => onSearchChange(e.target.value)}
                        placeholder={searchPlaceholder}
                        className={inputCls}
                    />
                ) : null}
                {rightSlot}
            </div>
            {compact && chips.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                    {chips.map((chip) => (
                        <span key={chip.id} className={pillCls} title={chip.label}>
                            <span className="truncate">{chip.label}</span>
                            {typeof chip.onRemove === 'function' ? (
                                <button
                                    type="button"
                                    onClick={chip.onRemove}
                                    className="inline-flex shrink-0 rounded-full p-0.5 opacity-70 hover:opacity-100"
                                    aria-label={`Quitar ${chip.label}`}
                                >
                                    <X size={12} aria-hidden />
                                </button>
                            ) : null}
                        </span>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

/** Construye el label del chip resumen a partir de un array de pares [activo, label]. */
export function buildChipLabel(pairs) {
    const parts = [];
    let n = 0;
    for (const [active, label] of pairs || []) {
        if (active) {
            n += 1;
            if (label) parts.push(label);
        }
    }
    if (n === 0) return 'Sin filtros activos';
    const head = parts.slice(0, 2).join(', ');
    const more = parts.length > 2 ? '…' : '';
    return `${n} filtro${n === 1 ? '' : 's'} activo${n === 1 ? '' : 's'}${head ? ` (${head}${more})` : ''}`;
}
