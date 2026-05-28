import { Filter, ChevronDown, ChevronUp } from 'lucide-react';

export default function ModuleFiltersToolbar({
    chipLabel,
    filtersPanelOpen,
    onToggleFilters,
    toggleId = 'module-filtros-toggle',
    panelId = 'module-filtros-panel',
    dash,
    children
}) {
    return (
        <div className="mb-2 flex flex-col gap-2 md:gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className={dash.filtrosChip} title={chipLabel}>
                    {chipLabel}
                </span>
                <button
                    type="button"
                    id={toggleId}
                    aria-expanded={filtersPanelOpen}
                    aria-controls={panelId}
                    onClick={onToggleFilters}
                    className={dash.filtrosAvanzadosBtn}
                >
                    <Filter size={16} className="shrink-0 opacity-90" aria-hidden />
                    <span>Filtros avanzados</span>
                    {filtersPanelOpen ? (
                        <ChevronUp size={18} className="shrink-0 opacity-90" aria-hidden />
                    ) : (
                        <ChevronDown size={18} className="shrink-0 opacity-90" aria-hidden />
                    )}
                </button>
                {children}
            </div>
        </div>
    );
}
