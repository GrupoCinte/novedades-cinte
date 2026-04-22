import { formatTimestamp } from '../hooks/useMonitorData';

export default function Layout({ currentView, onNavigate, isConnected, lastUpdate, activeCount, historyCount, children, hideTabNav }) {
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

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0f172a] text-[var(--text)]">
            <main className="flex min-h-0 flex-1 flex-col bg-[#0f172a]">
                <header className="relative z-50 flex-shrink-0 border-b border-[var(--border)] bg-[#0f172a]/95 px-6 py-4 backdrop-blur">
                    <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-semibold tracking-tight text-[var(--text)]">{viewTitles[currentView]}</h2>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/40 px-3 py-1.5">
                                <div className="relative">
                                    <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-[var(--ok)]' : 'bg-[var(--error)]'}`} />
                                    {isConnected && <div className="absolute inset-0 h-2 w-2 rounded-full bg-[var(--ok)] animate-ping opacity-75" />}
                                </div>
                                <span
                                    className="text-xs font-semibold text-[var(--text)]"
                                    title={
                                        isConnected
                                            ? 'WebSocket conectado: actualizaciones en tiempo real.'
                                            : 'WebSocket sin conexión: la lista se cargó por API; puede reconectar solo. No indica fallo de DynamoDB.'
                                    }
                                >
                                    {isConnected ? 'En vivo (WS)' : 'Sin WS en vivo'}
                                </span>
                            </div>
                            {lastUpdate && (
                                <span className="font-mono text-xs text-[rgba(159,179,200,0.9)]">
                                    {formatTimestamp(lastUpdate)}
                                </span>
                            )}
                        </div>
                    </div>

                    {!hideTabNav ? (
                    <div className="mx-auto mt-4 flex max-w-7xl items-center gap-2">
                        {navItems.map((item) => {
                            const active = currentView === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => onNavigate(item.id)}
                                    className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                                        active
                                            ? 'bg-[rgba(42,144,255,0.18)] text-white border border-[rgba(42,144,255,0.35)]'
                                            : 'bg-[rgba(22,42,61,0.45)] text-[rgba(159,179,200,0.95)] hover:bg-[rgba(22,42,61,0.65)]'
                                    }`}
                                >
                                    {item.label}
                                    {typeof item.badge === 'number' && item.badge > 0 && (
                                        <span className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                            active ? 'bg-[rgba(42,144,255,0.35)] text-white' : 'bg-[rgba(33,64,95,0.6)] text-[rgba(159,179,200,0.95)]'
                                        }`}>
                                            {item.badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    ) : null}
                </header>

                <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col overflow-y-auto overflow-x-hidden px-6 py-6 md:px-8 md:py-8 min-h-0">
                    {children}
                </div>
            </main>
        </div>
    );
}
