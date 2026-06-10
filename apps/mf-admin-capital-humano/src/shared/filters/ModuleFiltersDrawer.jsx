import { X } from 'lucide-react';

export default function ModuleFiltersDrawer({
    open,
    onClose,
    onClear,
    onApply,
    dash,
    panelId = 'module-filtros-panel',
    titleId = 'module-filtros-drawer-title',
    title = 'Filtros avanzados',
    children
}) {
    if (!open) return null;

    const handleApply = onApply || onClose;

    return (
        <>
            <div className={dash.filtrosDrawerBackdrop} onClick={onClose} aria-hidden="true" />
            <aside
                id={panelId}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={dash.filtrosDrawerPanel}
            >
                <header className={dash.filtrosDrawerHeader}>
                    <h3 id={titleId} className={dash.titleLg}>
                        {title}
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Cerrar filtros avanzados"
                        className={dash.modalClose}
                    >
                        <X size={18} />
                    </button>
                </header>
                <div className={dash.filtrosDrawerBody}>{children}</div>
                <footer className={dash.filtrosDrawerFooter}>
                    <button type="button" onClick={onClear} className={dash.borrarFiltros}>
                        Borrar filtros
                    </button>
                    <button type="button" onClick={handleApply} className={dash.filtrosDrawerCta}>
                        Aplicar filtros
                    </button>
                </footer>
            </aside>
        </>
    );
}
