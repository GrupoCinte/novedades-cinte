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
            ? 'fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-900/40 p-4 backdrop-blur fade-in duration-200'
            : 'fixed inset-0 z-50 flex animate-in items-center justify-center bg-[#0f172a]/90 p-4 backdrop-blur fade-in duration-200',
        modalCardWide: L
            ? 'relative flex w-full max-w-5xl flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200 md:max-h-[90vh]'
            : 'relative flex w-full max-w-5xl flex-col rounded-2xl border border-slate-700 bg-[#1e293b] p-6 shadow-2xl animate-in zoom-in-95 duration-200 md:max-h-[90vh]',
        modalHeadBorder: L ? 'mb-4 flex items-start justify-between gap-3 border-b border-slate-200 pb-4' : 'mb-4 flex items-start justify-between gap-3 border-b border-slate-700/50 pb-4',
        modalClose: L
            ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition-all hover:border-rose-400 hover:bg-rose-50 hover:text-rose-600'
            : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 transition-all hover:border-rose-500/50 hover:bg-rose-500/20 hover:text-rose-500',
        modalMuted: L ? 'text-slate-500' : 'text-slate-400',
        modalGrid: L
            ? 'grid grid-cols-1 gap-4 overflow-y-auto pr-1 text-sm text-slate-800 md:grid-cols-2'
            : 'grid grid-cols-1 gap-4 overflow-y-auto pr-1 text-sm text-slate-200 md:grid-cols-2',
        modalFooter: L ? 'mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4' : 'mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700/50 pt-4',
        btnPrimaryCinte: L
            ? 'inline-flex items-center justify-center rounded-lg bg-[#2F7BB8] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#004D87] disabled:opacity-50'
            : 'inline-flex items-center justify-center rounded-lg bg-[#2F7BB8] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#65BCF7]/90 disabled:opacity-50'
    };
}
