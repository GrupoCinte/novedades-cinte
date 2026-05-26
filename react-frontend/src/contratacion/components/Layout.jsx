import { formatTimestamp } from '../hooks/useMonitorData';

export default function Layout({
    isConnected,
    lastUpdate,
    children,
    isLight = false
}) {
    const shell = isLight
        ? 'flex min-h-0 flex-1 flex-col overflow-hidden bg-slate-100 text-slate-800 font-body'
        : 'flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0f172a] text-[var(--text)] font-body';
    const mainBg = isLight ? 'bg-slate-100' : 'bg-[#0f172a]';
    const wsWrap = isLight
        ? 'flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5'
        : 'flex items-center gap-2 rounded-full border border-slate-700/80 bg-slate-900/40 px-3 py-1.5';
    const wsText = isLight ? 'text-xs font-semibold text-slate-800' : 'text-xs font-semibold text-[var(--text)]';
    const tsMono = isLight ? 'font-mono text-xs text-slate-600' : 'font-mono text-xs text-[rgba(159,179,200,0.9)]';
    const contentPad = isLight ? 'bg-slate-50' : '';

    return (
        <div className={shell}>
            <main className={`flex min-h-0 flex-1 flex-col font-body ${mainBg}`}>
                <div className={`flex w-full min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6 md:px-8 md:py-6 min-h-0 ${contentPad}`}>
                    <div className="mb-4 flex w-full min-w-0 flex-wrap items-center justify-end gap-3">
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
                        {lastUpdate ? <span className={tsMono}>{formatTimestamp(lastUpdate)}</span> : null}
                    </div>
                    {children}
                </div>
            </main>
        </div>
    );
}
