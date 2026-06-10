/** Textos de marca del sidebar (paridad con rama `testing`). */
export const CONCILIACIONES_SIDEBAR_BRAND = {
    line1: 'Conciliaciones',
    line2: 'Facturación vs novedades'
};

/** Contenedor principal de subrutas (paridad con rama `testing`). */
export const CONCILIACIONES_PAGE_MAIN = 'min-h-0 flex-1 space-y-5 p-4 sm:p-6';

/** Padding + shell alineados con el tab Gestión de Novedades (Dashboard). */
export { GESTION_MODULE_PAGE_PADDING as CONCILIACIONES_FACTURACION_PAGE } from '../gestionTableDashTheme.js';
export { GESTION_TAB_SHELL_FULL as CONCILIACIONES_FACTURACION_SHELL } from '../gestionTableDashTheme.js';

/** Banner de error coherente con alertas del portal admin (light/dark). */
export function conciliacionesErrorBannerClass(isLight) {
    return isLight
        ? 'rounded-lg border border-amber-500/50 bg-amber-50 px-4 py-3 text-sm text-amber-900'
        : 'rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100';
}
