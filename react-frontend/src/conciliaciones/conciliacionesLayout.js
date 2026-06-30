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

/** Azules corporativos CINTE (gestionTableDashTheme / moduleTheme). */
export const CINTE_PRIMARY = '#2F7BB8';
export const CINTE_PRIMARY_HOVER = '#004D87';
export const CINTE_ACCENT = '#65BCF7';
export const CINTE_HEADING = 'text-[#2F7BB8]';
export const CINTE_BTN_PRIMARY =
    'inline-flex items-center justify-center gap-2 rounded-lg bg-[#2F7BB8] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#004D87] disabled:cursor-not-allowed disabled:opacity-50 font-body';

/** Relleno estándar de barras de progreso en conciliaciones. */
export const CINTE_PROGRESS_FILL = 'h-full rounded-full bg-[#2F7BB8] transition-all';

/** Badge/chip azul corporativo (estado en revisión, analista, etc.). */
export const CINTE_CHIP_BLUE = 'text-[#2F7BB8] border-[#2F7BB8]/30 bg-[#2F7BB8]/10';
export const CINTE_CHIP_BLUE_DARK = 'text-[#65BCF7] border-[#65BCF7]/30 bg-[#65BCF7]/10';
