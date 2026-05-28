import { formatTimestamp } from '../hooks/useMonitorData';
import { useModuleTheme } from '../../moduleTheme.js';

export default function Layout({
    children,
    currentView,
    onNavigate,
    isConnected,
    lastUpdate,
    activeCount,
    historyCount,
    hideTabNav,
    isLight
}) {
    const { shell, labelMuted } = useModuleTheme();

    const headerBg = isLight ? 'bg-white/40 border-slate-200/60' : 'bg-transparent border-white/5';
    const mainBg = isLight ? 'bg-slate-50' : 'bg-transparent';
    
    // Grid cibernético opcional
    const gridOverlay = isLight 
        ? 'bg-[linear-gradient(to_right,#cbd5e1_1px,transparent_1px),linear-gradient(to_bottom,#cbd5e1_1px,transparent_1px)] bg-[size:40px_40px] opacity-[0.2]'
        : '';

    return (
        <div className={`relative flex min-h-0 flex-1 flex-col overflow-hidden ${isLight ? 'bg-slate-50' : 'bg-transparent'}`}>
            {/* Cyber Grid Background */}
            <div className={`absolute inset-0 z-0 pointer-events-none ${gridOverlay}`} />

            <main className={`flex min-h-0 flex-1 flex-col font-body ${mainBg} relative z-10 overflow-hidden`}>
                {/* Header Integrado */}
                <header className={`relative z-40 flex-shrink-0 px-4 py-3 backdrop-blur-md border-b ${headerBg}`}>
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            {/* Títulos eliminados a petición del usuario */}
                        </div>

                        <div className="flex items-center gap-4">

                        {!hideTabNav && (
                            <div className="flex items-center gap-1 rounded-xl bg-black/5 p-1 dark:bg-white/5 border border-white/5">
                                <button
                                    onClick={() => onNavigate('active')}
                                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all ${
                                        currentView === 'active'
                                            ? 'bg-white text-slate-900 shadow-sm dark:bg-[#2F7BB8] dark:text-white dark:shadow-[0_0_10px_rgba(47,123,184,0.4)]'
                                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5'
                                    }`}
                                >
                                    Activos
                                    <span className={`rounded-md px-1.5 py-0.5 text-[9px] ${currentView === 'active' ? 'bg-slate-100 text-slate-800 dark:bg-blue-900 dark:text-blue-100' : 'bg-slate-200 dark:bg-slate-800'}`}>
                                        {activeCount}
                                    </span>
                                </button>
                                <button
                                    onClick={() => onNavigate('history')}
                                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all ${
                                        currentView === 'history'
                                            ? 'bg-white text-slate-900 shadow-sm dark:bg-[#2F7BB8] dark:text-white dark:shadow-[0_0_10px_rgba(47,123,184,0.4)]'
                                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5'
                                    }`}
                                >
                                    Historial
                                    <span className={`rounded-md px-1.5 py-0.5 text-[9px] ${currentView === 'history' ? 'bg-slate-100 text-slate-800 dark:bg-blue-900 dark:text-blue-100' : 'bg-slate-200 dark:bg-slate-800'}`}>
                                        {historyCount}
                                    </span>
                                </button>
                            </div>
                        )}
                    </div>
                    </div>
                </header>

                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden">
                    <div className="px-4 py-6 sm:px-6 md:px-8">
                        {children}
                    </div>
                </div>
            </main>
        </div>
    );
}
