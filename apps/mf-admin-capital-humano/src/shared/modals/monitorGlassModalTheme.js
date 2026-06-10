/** Clases compartidas del estilo glass/cyber de modales En ingreso (Capital Humano monitor). */
export function buildMonitorGlassModalTheme(isLight) {
    const L = Boolean(isLight);
    return {
        overlayCls: L ? 'bg-slate-900/40 backdrop-blur-sm' : 'bg-black/60 backdrop-blur-md',
        modalCls: L
            ? 'bg-white/95 backdrop-blur-xl border border-slate-200 shadow-2xl'
            : 'bg-[#0a1520]/95 backdrop-blur-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)]',
        headerCls: L ? 'border-b border-slate-200/60 bg-slate-50/50' : 'border-b border-white/5 bg-white/[0.02]',
        heroCls: L ? 'border-slate-200/60 bg-slate-100/50' : 'border-white/5 bg-black/20',
        textCls: L ? 'text-slate-800' : 'text-slate-100',
        textMuted: L ? 'text-slate-500' : 'text-slate-400',
        cardCls: L
            ? 'bg-white/80 border border-slate-200 hover:border-blue-400/50 hover:bg-blue-50'
            : 'bg-white/[0.03] border border-white/5 hover:border-[#14ffec]/30 hover:bg-[#14ffec]/[0.02]',
        closeBtnCls: L
            ? 'rounded-full p-2 transition-all hover:bg-slate-200 text-slate-500'
            : 'rounded-full p-2 transition-all hover:bg-white/10 text-slate-400',
        footerCls: L ? 'border-t border-slate-200/60 bg-slate-50/30' : 'border-t border-white/5 bg-black/10',
        cancelBtnCls:
            'rounded-xl border border-[var(--border)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text)] disabled:opacity-50',
        labelUpperCls: L ? 'text-[10px] font-bold uppercase tracking-widest text-slate-400' : 'text-[10px] font-bold uppercase tracking-widest text-slate-500'
    };
}

export function monitorGlassModalSizeCls(size) {
    return size === 'md' ? 'max-w-md' : 'max-w-4xl';
}
