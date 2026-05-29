/** Shell de altura completa del tab Gestión (Dashboard) y vistas equivalentes. */
export const GESTION_TAB_SHELL_FULL =
    'flex flex-col gap-4 animate-in fade-in slide-in-from-right-8 duration-300 min-h-0 -mb-4 md:-mb-6 h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-3rem)]';

/** Padding del lienzo con menú móvil (Conciliaciones / módulos sin barra propia). */
export const GESTION_MODULE_PAGE_PADDING =
    'p-4 pt-12 md:p-6 md:pt-6 flex flex-col flex-1 min-h-0 animate-in fade-in slide-in-from-right-8 duration-300';

/** Botón primario CINTE en toolbar de Gestión. */
export const GESTION_TOOLBAR_PRIMARY_BTN =
    'inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#2F7BB8] px-3 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#004D87] sm:px-4 font-body disabled:opacity-50';

/** Sufijo de ancho para búsqueda por nombre (Gestión). */
export const GESTION_SEARCH_FIELD_WIDTH = 'w-[min(100%,11rem)] max-w-[13rem] shrink-0 text-sm';

/**
 * Mismas clases de tabla / filtros que el bloque «Gestión Operativa de Novedades» en Dashboard.jsx
 * para reutilizar la línea gráfica en otros módulos (p. ej. Catálogo roles TI).
 */
export function buildGestionTableDash(isLight) {
    const L = Boolean(isLight);
    const card = L
        ? 'rounded-2xl border border-slate-200 bg-white shadow-md'
        : 'rounded-2xl border border-slate-700/50 bg-[#1e293b] shadow-lg';
    return {
        card,
        cardFlex: `${card} flex flex-col h-full overflow-hidden`,
        filterBar: L
            ? 'flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-md'
            : 'flex flex-col gap-3 rounded-2xl border border-slate-700/50 bg-[#1e293b] px-5 py-4 shadow-lg',
        titleXl: L ? 'text-xl font-bold text-slate-900' : 'text-xl font-bold text-white',
        titleLg: L ? 'text-lg font-bold text-slate-900' : 'text-lg font-bold text-white',
        muted: L ? 'text-slate-600' : 'text-slate-400',
        mutedSm: L ? 'text-sm text-slate-600' : 'text-sm text-slate-400',
        labelUpper: L ? 'text-xs font-bold uppercase tracking-widest text-slate-500' : 'text-xs font-bold uppercase tracking-widest text-slate-400',
        labelFilter: L ? 'text-xs font-semibold uppercase tracking-wider text-slate-600' : 'text-xs font-semibold uppercase tracking-wider text-slate-500',
        divider: L ? 'h-px flex-1 min-w-[1rem] bg-slate-200' : 'h-px flex-1 min-w-[1rem] bg-slate-700/50',
        borrarFiltros: L
            ? 'rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition-all hover:bg-slate-100'
            : 'rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 transition-all hover:bg-slate-700/60',
        /** Panel móvil Gestión (Dashboard): botón «Filtros avanzados», panel y chip de resumen. */
        filtrosAvanzadosBtn: L
            ? 'inline-flex shrink-0 items-center gap-2 rounded-xl border border-cyan-600/35 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-900 shadow-sm transition-all hover:bg-cyan-100'
            : 'inline-flex shrink-0 items-center gap-2 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 py-2 text-sm font-semibold text-cyan-100 shadow-sm transition-all hover:bg-cyan-500/20',
        filtrosPanelMobile: L
            ? 'grid max-h-[min(70vh,28rem)] grid-cols-1 gap-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-inner md:max-h-none md:grid-cols-2 md:overflow-visible xl:grid-cols-3'
            : 'grid max-h-[min(70vh,28rem)] grid-cols-1 gap-3 overflow-y-auto rounded-xl border border-slate-600 bg-slate-900/40 p-3 shadow-inner md:max-h-none md:grid-cols-2 md:overflow-visible xl:grid-cols-3',
        filtrosChip: L
            ? 'inline-flex max-w-[min(100%,14rem)] items-center truncate rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700'
            : 'inline-flex max-w-[min(100%,14rem)] items-center truncate rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300',
        filtrosDrawerBackdrop: L
            ? 'fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200'
            : 'fixed inset-0 z-40 bg-[#0f172a]/70 backdrop-blur-sm animate-in fade-in duration-200',
        filtrosDrawerPanel: L
            ? 'fixed inset-y-0 right-0 z-50 flex h-full max-h-[100dvh] min-h-0 w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-2xl animate-in slide-in-from-right duration-200'
            : 'fixed inset-y-0 right-0 z-50 flex h-full max-h-[100dvh] min-h-0 w-full max-w-sm flex-col border-l border-slate-700 bg-[#1e293b] shadow-2xl animate-in slide-in-from-right duration-200',
        filtrosDrawerHeader: L
            ? 'flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-5 py-4'
            : 'flex shrink-0 items-center justify-between gap-3 border-b border-slate-700/60 px-5 py-4',
        filtrosDrawerBody: 'flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-4',
        filtrosDrawerFooter: L
            ? 'flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 px-5 py-4'
            : 'flex shrink-0 items-center justify-between gap-3 border-t border-slate-700/60 px-5 py-4',
        filtrosDrawerLabel: L
            ? 'text-xs font-semibold uppercase tracking-wider text-slate-600'
            : 'text-xs font-semibold uppercase tracking-wider text-slate-300',
        filtrosDrawerCta: L
            ? 'rounded-lg bg-[#2F7BB8] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#004D87]'
            : 'rounded-lg bg-[#2F7BB8] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#004D87]',
        gestionHead: L ? 'border-b border-slate-200 bg-white' : 'border-b border-slate-700/50 bg-[#1e293b]',
        tableWrap: L ? 'flex w-full min-h-0 flex-1 flex-col bg-slate-50' : 'flex w-full min-h-0 flex-1 flex-col bg-[#0f172a]/50',
        thead: L
            ? 'sticky top-0 z-10 border-b border-slate-200 bg-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-600 shadow-sm'
            : 'sticky top-0 z-10 border-b border-slate-700/50 bg-[#1e293b] text-xs font-semibold uppercase tracking-wider text-slate-400 shadow-sm',
        tbody: L ? 'divide-y divide-slate-200 text-sm text-slate-800' : 'divide-y divide-slate-700/50 text-sm',
        trHover: L ? 'transition-colors hover:bg-slate-100' : 'transition-colors hover:bg-slate-800/80',
        /** Misma celda que Gestión de Novedades en Dashboard (padding p-4). */
        tdDate: L ? 'p-4 pl-6 text-slate-500' : 'p-4 pl-6 text-slate-400',
        tdName: L ? 'p-4 font-semibold text-slate-900' : 'p-4 font-semibold text-slate-200',
        tdCell: L ? 'p-4 text-slate-700 max-w-[16rem] truncate' : 'p-4 text-slate-300 max-w-[16rem] truncate',
        tdMuted: L ? 'p-4 text-slate-500' : 'p-4 text-slate-400',
        tdSmall: L ? 'text-xs text-slate-500' : 'text-xs text-slate-500',
        actionBtn: L
            ? 'flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm transition-all hover:border-sky-400 hover:bg-sky-50 hover:text-sky-800'
            : 'flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 shadow-sm transition-all hover:border-blue-500/50 hover:bg-blue-600/20 hover:text-blue-400',
        footerBar: L
            ? 'flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-600'
            : 'flex items-center justify-between border-t border-slate-700/50 bg-[#1e293b] px-4 py-3 text-xs text-slate-300',
        compactBtn: L
            ? 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 disabled:opacity-40'
            : 'rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 disabled:opacity-40',
        toolbarBtn: L
            ? 'rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-100'
            : 'rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700',
        /** Modal detalle — mismas clases que Dashboard (Gestión de novedades). */
        title2xl: L ? 'text-2xl font-bold text-slate-900' : 'text-2xl font-bold text-white',
        modalBackdrop: L
            ? 'fixed inset-0 z-50 flex min-h-full animate-in items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur fade-in duration-200 sm:items-center'
            : 'fixed inset-0 z-50 flex min-h-full animate-in items-start justify-center overflow-y-auto bg-[#0f172a]/90 p-4 backdrop-blur fade-in duration-200 sm:items-center',
        modalCardWide: L
            ? 'relative my-auto flex w-full min-h-0 max-h-[min(calc(100dvh-2rem),90vh)] max-w-5xl flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl animate-in zoom-in-95 duration-200 sm:p-6'
            : 'relative my-auto flex w-full min-h-0 max-h-[min(calc(100dvh-2rem),90vh)] max-w-5xl flex-col rounded-2xl border border-slate-700 bg-[#1e293b] p-4 shadow-2xl animate-in zoom-in-95 duration-200 sm:p-6',
        modalHeadBorder: L
            ? 'mb-4 flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 pb-4'
            : 'mb-4 flex shrink-0 items-start justify-between gap-3 border-b border-slate-700/50 pb-4',
        modalBodyScroll: 'min-h-0 flex-1 overflow-y-auto overscroll-contain',
        /** Tarjeta de solo lectura en modales: scroll en móvil si el grid es alto. */
        modalInfoGrid: 'max-h-[min(50vh,24rem)] overflow-y-auto overscroll-contain sm:max-h-none sm:overflow-visible',
        modalClose: L
            ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition-all hover:border-rose-400 hover:bg-rose-50 hover:text-rose-600'
            : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 transition-all hover:border-rose-500/50 hover:bg-rose-500/20 hover:text-rose-500',
        modalMuted: L ? 'text-slate-500' : 'text-slate-400',
        modalGrid: L
            ? 'grid grid-cols-1 gap-4 overflow-y-auto pr-1 text-sm text-slate-800 md:grid-cols-2'
            : 'grid grid-cols-1 gap-4 overflow-y-auto pr-1 text-sm text-slate-200 md:grid-cols-2',
        modalFooter: L
            ? 'mt-6 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4'
            : 'mt-6 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-700/50 pt-4',
        btnPrimaryCinte: L
            ? 'inline-flex items-center justify-center rounded-lg bg-[#2F7BB8] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#004D87] disabled:opacity-50'
            : 'inline-flex items-center justify-center rounded-lg bg-[#2F7BB8] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#65BCF7]/90 disabled:opacity-50',
        titleLg: L ? 'text-lg font-bold text-slate-900' : 'text-lg font-bold text-white',
        kpiSub: L ? 'text-sm font-medium uppercase tracking-wide text-slate-600' : 'text-sm font-medium uppercase tracking-wide text-slate-400',
        moduleTabShell: 'flex flex-col gap-5 animate-in fade-in duration-300 min-h-[calc(100vh-9.5rem)]',
        moduleTabShellFull: GESTION_TAB_SHELL_FULL
    };
}

/** Alias históricos usados en Novedades (Dashboard.jsx). */
export function withNovedadesTabShellAliases(dash) {
    return {
        ...dash,
        novedadesTabShell: dash.moduleTabShell,
        novedadesTabShellFull: dash.moduleTabShellFull
    };
}
