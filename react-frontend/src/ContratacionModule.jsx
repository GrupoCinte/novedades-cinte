import { useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ChevronLeft,
    ChevronRight,
    Home,
    Menu,
    X,
    Users,
    History,
    BarChart3
} from 'lucide-react';
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
import AdminModuleSidebarFooter from './AdminModuleSidebarFooter.jsx';
import AdminModuleSidebarUser from './AdminModuleSidebarUser.jsx';

export { userHasContratacionPanel } from './contratacion/contratacionAccess';

function ContratacionDashboard({ auth, currentView, onNavigate, isLight }) {
    const { canEliminarCandidato } = useMemo(() => getContratacionPermissions(auth), [auth]);
    const data = useMonitorData(auth);

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col font-body">
            <Layout isConnected={data.isConnected} lastUpdate={data.lastUpdate} isLight={isLight}>
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

export default function ContratacionModule({ auth, onLogout }) {
    const navigate = useNavigate();
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
        { id: 'active', label: 'Onboarding', icon: Users },
        { id: 'history', label: 'Historial', icon: History },
        { id: 'metrics', label: 'Dashboard General', icon: BarChart3 }
    ];

    return (
        <div className={shell}>
            <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className={`fixed left-4 top-4 z-40 flex h-10 w-10 items-center justify-center shadow-lg md:hidden ${menuFab}`}
                aria-label="Abrir menú contratación"
            >
                <Menu size={18} />
            </button>
            {mobileMenuOpen ? (
                <div className={`fixed inset-0 z-40 md:hidden ${scrim}`} onClick={() => setMobileMenuOpen(false)} />
            ) : null}

            <aside
                className={`fixed left-0 top-0 z-50 flex h-full w-72 flex-col shadow-2xl transition-transform duration-300 font-body md:hidden ${aside} ${
                    mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                <AdminModuleSidebarBrand
                    variant="drawer"
                    isLight={isLight}
                    asideHeaderBorder={asideHeaderBorder}
                    moduleContext={(
                        <>
                            <p className="text-[10px] font-heading font-black uppercase leading-tight tracking-widest text-[#65BCF7]">Módulo de Capital Humano</p>
                            <p className="text-[10px] font-body font-bold uppercase leading-tight tracking-widest text-slate-400">Onboarding</p>
                        </>
                    )}
                    endAction={(
                        <button
                            type="button"
                            onClick={() => setMobileMenuOpen(false)}
                            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center ${sidebarIconBtn}`}
                            aria-label="Cerrar menú"
                        >
                            <X size={16} />
                        </button>
                    )}
                />
                <AdminModuleSidebarUser
                    sidebarOpen
                    currentEmail={currentEmail}
                    currentRoleLabel={currentRoleLabel}
                    emailClass={email}
                    borderSubtle={borderSubtle}
                    isLight={isLight}
                />
                <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
                    <button
                        type="button"
                        onClick={() => {
                            navigate('/admin');
                            setMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-body font-semibold transition-all ${navOutline}`}
                    >
                        <Home size={17} />
                        <span>Inicio portal</span>
                    </button>
                    {sidebarNav.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => {
                                setNavView(id);
                                setMobileMenuOpen(false);
                            }}
                            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-body font-semibold transition-all ${
                                navView === id ? 'bg-[#2F7BB8] text-white' : mt.navInactive
                            }`}
                        >
                            <Icon size={17} />
                            <span>{label}</span>
                        </button>
                    ))}
                </nav>
                <AdminModuleSidebarFooter auth={auth} onLogout={onLogout} sidebarOpen borderSubtle={borderSubtle} isLight={isLight} />
            </aside>

            <aside
                className={`relative z-10 hidden h-full flex-shrink-0 flex-col overflow-x-hidden shadow-2xl transition-all duration-300 ease-in-out font-body md:flex ${aside} ${
                    sidebarOpen ? 'w-64' : 'w-16'
                }`}
            >
                <AdminModuleSidebarBrand
                    variant={sidebarOpen ? 'rail-expanded' : 'rail-collapsed'}
                    isLight={isLight}
                    asideHeaderBorder={asideHeaderBorder}
                    moduleContext={(
                        <>
                            <p className="whitespace-nowrap text-[10px] font-heading font-black uppercase leading-tight tracking-widest text-[#65BCF7]">Módulo de Capital Humano</p>
                            <p className="whitespace-nowrap text-[10px] font-body font-bold uppercase leading-tight tracking-widest text-slate-400">Onboarding</p>
                        </>
                    )}
                    endAction={(
                        <button
                            type="button"
                            onClick={() => setSidebarOpen((o) => !o)}
                            title={sidebarOpen ? 'Colapsar menú' : 'Expandir menú'}
                            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center ${sidebarIconBtn}`}
                        >
                            {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                        </button>
                    )}
                />
                <AdminModuleSidebarUser
                    sidebarOpen={sidebarOpen}
                    currentEmail={currentEmail}
                    currentRoleLabel={currentRoleLabel}
                    emailClass={email}
                    borderSubtle={borderSubtle}
                    isLight={isLight}
                />

                <nav className="mt-1 flex flex-1 flex-col gap-1 overflow-y-auto p-2">
                    <button
                        type="button"
                        onClick={() => navigate('/admin')}
                        title={!sidebarOpen ? 'Inicio portal' : undefined}
                        className={`flex items-center gap-3 rounded-xl text-left text-sm font-body font-medium transition-all ${navOutline} ${
                            sidebarOpen ? 'px-4 py-3' : 'justify-center px-0 py-3'
                        }`}
                    >
                        <Home size={18} className="flex-shrink-0" />
                        {sidebarOpen ? <span className="truncate">Inicio portal</span> : null}
                    </button>
                    {sidebarNav.map(({ id, label, icon: Icon }) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setNavView(id)}
                            title={!sidebarOpen ? label : undefined}
                            className={`flex items-center gap-3 rounded-xl text-left text-sm font-body font-medium transition-all ${
                                sidebarOpen ? 'px-4 py-3' : 'justify-center px-0 py-3'
                            } ${
                                navView === id
                                    ? 'bg-[#2F7BB8] text-white shadow-[0_4px_12px_rgba(47,123,184,0.35)]'
                                    : mt.navInactive
                            }`}
                        >
                            <Icon size={18} className="flex-shrink-0" />
                            {sidebarOpen ? <span className="truncate">{label}</span> : null}
                        </button>
                    ))}
                </nav>

                <AdminModuleSidebarFooter
                    auth={auth}
                    onLogout={onLogout}
                    sidebarOpen={sidebarOpen}
                    borderSubtle={borderSubtle}
                    isLight={isLight}
                />
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
