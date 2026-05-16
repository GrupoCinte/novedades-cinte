import { useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import Layout from './contratacion/components/Layout';
import ActiveCandidates from './contratacion/components/ActiveCandidates';
import HistoryCandidates from './contratacion/components/HistoryCandidates';
import MetricsDashboard from './contratacion/components/MetricsDashboard';
import ChatWidget from './ChatWidget';
import useMonitorData from './contratacion/hooks/useMonitorData';
import { getContratacionPermissions } from './contratacion/contratacionAccess';
import { useModuleTheme } from './moduleTheme.js';
import { Users, History, BarChart3, ChevronRight, ChevronLeft, Home } from 'lucide-react';
import AdminModuleSidebarBrand from './AdminModuleSidebarBrand.jsx';
import UserAccountMenu from './UserAccountMenu.jsx';

export { userHasContratacionPanel } from './contratacion/contratacionAccess';

function ContratacionDashboard({ auth, currentView, onNavigate, isLight }) {
    const { canEliminarCandidato } = useMemo(() => getContratacionPermissions(auth), [auth]);
    const data = useMonitorData(auth);

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col font-body">
            <Layout
                currentView={currentView}
                onNavigate={onNavigate}
                isConnected={data.isConnected}
                lastUpdate={data.lastUpdate}
                activeCount={data.activeExecutions.length}
                historyCount={data.historyExecutions.length}
                hideTabNav
                isLight={isLight}
            >
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentView}
                        initial={{ opacity: 0, scale: 0.98, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, y: -10 }}
                        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                        className="min-h-0"
                    >
                        {currentView === 'active' && (
                            <ActiveCandidates
                                executions={data.activeExecutions}
                                totalMonitorCount={data.executions.length}
                                metrics={data.metrics}
                                loading={data.loading}
                                error={data.error}
                                isConnected={data.isConnected}
                                refetch={data.refetch}
                                authToken={auth?.token || ''}
                                canEliminarCandidato={canEliminarCandidato}
                                dynamoConfigured={data.dynamoConfigured}
                            />
                        )}
                        {currentView === 'history' && (
                            <HistoryCandidates executions={data.historyExecutions} metrics={data.metrics} loading={data.loading} />
                        )}
                        {currentView === 'metrics' && (
                            <MetricsDashboard metrics={data.metrics} loading={data.loading} executions={data.activeExecutions} />
                        )}
                    </motion.div>
                </AnimatePresence>
            </Layout>
        </div>
    );
}

export default function ContratacionModule({ auth }) {
    const mt = useModuleTheme();
    const { isLight, shell } = mt;
    const [navView, setNavView] = useState('active');
    const [aiOpen, setAiOpen] = useState(false);
    const chatRef = useRef(null);

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
        } catch { /* ignore */ }
        window.location.href = '/admin';
    };

    const currentRole = String(auth?.user?.role || auth?.claims?.role || 'ADMIN').toLowerCase();
    const currentEmail = String(auth?.user?.email || auth?.claims?.email || 'usuario@cinte.com').toLowerCase();

    const [sidebarOpen, setSidebarOpen] = useState(false);

    const navItems = [
        { id: 'active', label: 'Activos', icon: Users },
        { id: 'history', label: 'Historial', icon: History },
        { id: 'metrics', label: 'Métricas', icon: BarChart3 }
    ];

    return (
        <div className={`${shell} flex-col h-screen overflow-hidden bg-[#0b0f19]`}>
            {/* Fondo decorativo inspirado en prueba.html */}
            <div className="absolute inset-0 z-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 15% 50%, rgba(20, 255, 236, 0.04), transparent 25%), radial-gradient(circle at 85% 30%, rgba(255, 179, 71, 0.04), transparent 25%)' }} />

            {/* AI Widget integration (hidden trigger handled externally or via floating button) */}
            <ChatWidget ctx={{ role: currentRole }} forceOpen={aiOpen} setForceOpen={setAiOpen} />

            <section className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden z-10">
                {/* ───────── HOVERABLE SIDEBAR ───────── */}
                <aside
                    onMouseEnter={() => setSidebarOpen(true)}
                    onMouseLeave={() => setSidebarOpen(false)}
                    className={`
                        flex-shrink-0 flex-col hidden md:flex h-full shadow-2xl relative z-20 font-body
                        transition-all duration-300 ease-in-out
                        ${isLight ? 'bg-white/70 backdrop-blur-xl border-r border-white/40' : 'bg-[#0a1520]/70 backdrop-blur-xl border-r border-white/10'}
                        ${sidebarOpen ? 'w-64' : 'w-16'}
                    `}
                >
                    <AdminModuleSidebarBrand
                        variant={sidebarOpen ? 'rail-expanded' : 'rail-collapsed'}
                        isLight={isLight}
                        asideHeaderBorder={isLight ? 'border-b border-slate-200/50' : 'border-b border-white/5'}
                        moduleContext={(
                            <>
                                <p className="whitespace-nowrap text-[10px] font-heading font-black uppercase leading-tight tracking-widest text-[#65BCF7]">
                                    Capital Humano
                                </p>
                                <p className="whitespace-nowrap text-[10px] font-body font-bold uppercase leading-tight tracking-widest text-slate-400">
                                    System Core
                                </p>
                            </>
                        )}
                        endAction={null}
                    />

                    <nav className="flex flex-col gap-2 p-2 flex-1 mt-2">
                        {navItems.map(item => {
                            const Icon = item.icon;
                            const active = navView === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => setNavView(item.id)}
                                    title={!sidebarOpen ? item.label : undefined}
                                    className={`
                                        flex items-center gap-3 rounded-xl transition-all font-body font-medium text-sm text-left
                                        ${sidebarOpen ? 'px-4 py-3' : 'px-0 py-3 justify-center'}
                                        ${active
                                            ? 'bg-gradient-to-r from-[#2F7BB8] to-[#65BCF7] shadow-[0_4px_15px_rgba(47,123,184,0.3)] text-white'
                                            : isLight ? 'text-slate-600 hover:bg-slate-200/50' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                                        }
                                    `}
                                >
                                    <Icon size={18} className={`flex-shrink-0 ${active ? 'text-white' : isLight ? 'text-slate-500' : 'text-slate-400'}`} />
                                    {sidebarOpen && (
                                        <span className="truncate whitespace-nowrap overflow-hidden transition-all duration-300">
                                            {item.label}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    <div className={`border-t flex justify-center p-3 overflow-hidden ${isLight ? 'border-slate-200/50' : 'border-white/5'}`}>
                        <div className={sidebarOpen ? 'w-full flex justify-center' : 'scale-90 origin-bottom'}>
                            <UserAccountMenu 
                                auth={auth} 
                                onLogout={handleLogout} 
                                surface="sidebar-footer" 
                            />
                        </div>
                    </div>
                </aside>

                <div className="flex-1 flex flex-col min-w-0 min-h-0 relative z-10">
                    <ContratacionDashboard 
                        auth={auth} 
                        currentView={navView} 
                        onNavigate={setNavView} 
                        isLight={isLight} 
                    />
                </div>
            </section>
        </div>
    );
}
