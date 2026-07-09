/** Textos de marca del sidebar, alineados con Dashboard (Sistema Análisis + subtítulo del módulo). */
export const CONCILIACIONES_SIDEBAR_BRAND = {
    line1: 'Sistema Análisis',
    line2: 'Conciliaciones CINTE'
};

/** Clases de contenedor principal alineadas con `<main>` de Dashboard.jsx (Novedades). */
export const CONCILIACIONES_PAGE_MAIN =
    'flex-1 overflow-y-auto scroll-smooth p-4 pt-12 md:pt-6 md:p-6 animate-in fade-in duration-300 min-h-0 space-y-5';

/** Padding + shell alineados con el tab Gestión de Novedades (Dashboard). */
export { GESTION_MODULE_PAGE_PADDING as CONCILIACIONES_FACTURACION_PAGE } from '../gestionTableDashTheme.js';
export { GESTION_TAB_SHELL_FULL as CONCILIACIONES_FACTURACION_SHELL } from '../gestionTableDashTheme.js';

/** Banner de error coherente con alertas del portal admin (light/dark). */
export function conciliacionesErrorBannerClass(isLight) {
    return isLight
        ? 'rounded-lg border border-amber-500/50 bg-amber-50 px-4 py-3 text-sm text-amber-900'
        : 'rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100';
}
