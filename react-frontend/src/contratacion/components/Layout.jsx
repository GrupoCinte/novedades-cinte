import { formatTimestamp } from '../hooks/useMonitorData';

export default function Layout({
    currentView,
    onNavigate,
    isConnected,
    lastUpdate,
    activeCount,
    historyCount,
    children,
    hideTabNav,
    isLight = false
}) {
    const viewTitles = {
        active: 'Seguimiento de candidatos',
        history: 'Histórico',
        metrics: 'Métricas de Firma',
    };
    const navItems = [
        { id: 'active', label: 'Activos', badge: activeCount },
        { id: 'history', label: 'Historico', badge: historyCount },
        { id: 'metrics', label: 'Métricas', badge: null },
    ];

    const shell = isLight
        ? 'flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-100 text-slate-800 font-body'
        : 'flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0f172a] text-[var(--text)] font-body';
    const mainBg = isLight ? 'bg-slate-100' : 'bg-[#0f172a]';
    const headerBg = isLight ? 'border-b border-slate-200 bg-white/95' : 'border-b border-[var(--border)] bg-[#0f172a]/95';
    const titleCls = isLight ? 'text-lg font-semibold tracking-tight text-slate-900 font-heading' : 'text-lg font-semibold tracking-tight text-[var(--text)] font-heading';
    const wsWrap = isLight
        ? 'flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5'
        : 'flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/40 px-3 py-1.5';
    const wsText = isLight ? 'text-xs font-semibold text-slate-800' : 'text-xs font-semibold text-[var(--text)]';
    const tsMono = isLight ? 'font-mono text-xs text-slate-600' : 'font-mono text-xs text-[rgba(159,179,200,0.9)]';
    const tabInactive = isLight
        ? 'rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-100'
        : 'rounded-xl bg-[rgba(22,42,61,0.45)] px-3 py-2 text-xs font-semibold text-[rgba(159,179,200,0.95)] transition-all hover:bg-[rgba(22,42,61,0.65)]';
    const tabActive = isLight
        ? 'rounded-xl border border-[#2F7BB8]/50 bg-sky-100 px-3 py-2 text-xs font-semibold text-[#004D87] transition-all'
        : 'rounded-xl border border-[rgba(42,144,255,0.35)] bg-[rgba(42,144,255,0.18)] px-3 py-2 text-xs font-semibold text-white transition-all';
    const tabBadgeInactive = isLight
        ? 'ml-2 inline-flex items-center rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700'
        : 'ml-2 inline-flex items-center rounded-full bg-[rgba(33,64,95,0.6)] px-2 py-0.5 text-[10px] font-bold text-[rgba(159,179,200,0.95)]';
    const tabBadgeActive = isLight
        ? 'ml-2 inline-flex items-center rounded-full bg-[#2F7BB8]/20 px-2 py-0.5 text-[10px] font-bold text-[#004D87]'
        : 'ml-2 inline-flex items-center rounded-full bg-[rgba(42,144,255,0.35)] px-2 py-0.5 text-[10px] font-bold text-white';
    const contentPad = isLight ? 'bg-slate-50' : '';

    return (
        <div className={shell}>
            <main className={`flex min-h-0 flex-1 flex-col font-body ${mainBg}`}>
                <header className={`relative z-50 flex-shrink-0 px-4 py-4 backdrop-blur sm:px-6 md:px-8 ${headerBg}`}>
                    <div className="flex w-full min-w-0 items-center justify-between gap-4">
                        <div>
                            <h2 className={titleCls}>{viewTitles[currentView]}</h2>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className={wsWrap}>
                                <div className="relative">
                                    <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-[var(--ok)]' : 'bg-[var(--error)]'}`} />
                                    {isConnected && <div className="absolute inset-0 h-2 w-2 rounded-full bg-[var(--ok)] animate-ping opacity-75" />}
                                </div>
                                <span
                                    className={wsText}
                                    title={
                                        isConnected
                                            ? 'WebSocket conectado: actualizaciones en tiempo real.'
                                            : 'WebSocket sin conexión: la lista se cargó por API; puede reconectar solo. No indica fallo de DynamoDB.'
                                    }
                                >
                                    {isConnected ? 'En vivo (WS)' : 'Sin WS en vivo'}
                                </span>
                            </div>
                            {lastUpdate && <span className={tsMono}>{formatTimestamp(lastUpdate)}</span>}
                        </div>
                    </div>

                    {!hideTabNav ? (
                    <div className="mt-4 flex w-full min-w-0 flex-wrap items-center gap-2">
                        {navItems.map((item) => {
                            const active = currentView === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => onNavigate(item.id)}
                                    className={active ? tabActive : tabInactive}
                                >
                                    {item.label}
                                    {typeof item.badge === 'number' && item.badge > 0 && (
                                        <span className={active ? tabBadgeActive : tabBadgeInactive}>
                                            {item.badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    ) : null}
                </header>

                <div className={`flex w-full min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 py-6 sm:px-6 md:px-8 md:py-8 min-h-0 ${contentPad}`}>
                    {children}
                </div>
            </main>
        </div>
    );
}
