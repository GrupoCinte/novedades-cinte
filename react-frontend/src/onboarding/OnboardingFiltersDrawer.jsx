import { useEffect } from 'react';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';
import ModuleFiltersDrawer from '../shared/filters/ModuleFiltersDrawer.jsx';

/**
 * Drawer lateral de filtros onboarding — delega en ModuleFiltersDrawer + dash.filtrosDrawer*.
 */
export default function OnboardingFiltersDrawer({
    open,
    onClose,
    onClear,
    onApply,
    children,
    isLight = false,
    title = 'Filtros avanzados'
}) {
    const dash = buildGestionTableDash(Boolean(isLight));

    useEffect(() => {
        if (!open) return undefined;
        const handler = (e) => {
            if (e.key === 'Escape' && typeof onClose === 'function') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    return (
        <ModuleFiltersDrawer
            open={open}
            onClose={onClose}
            onClear={onClear}
            onApply={onApply}
            dash={dash}
            title={title}
        >
            {children}
        </ModuleFiltersDrawer>
    );
}

/** Helpers visuales para uso uniforme en los formularios del drawer. */
export function drawerLabelCls(isLight) {
    return buildGestionTableDash(Boolean(isLight)).filtrosDrawerLabel;
}

export function drawerFieldCls(isLight) {
    const L = Boolean(isLight);
    return L
        ? 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:border-sky-400 focus:outline-none'
        : 'w-full rounded-md border border-slate-600 bg-slate-900/40 px-3 py-2 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none';
}
