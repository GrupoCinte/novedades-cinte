import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ChevronLeft,
    ChevronRight,
    Code2,
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
import useMonitorData from './contratacion/hooks/useMonitorData';
import { getContratacionPermissions } from './contratacion/contratacionAccess';
import { useModuleTheme } from './moduleTheme.js';
import AdminModuleSidebarBrand from './AdminModuleSidebarBrand.jsx';

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
                        initial={{ opacity: 0, y: 14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.22 }}
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
    const navigate = useNavigate();
    const mt = useModuleTheme();
    const { isLight, shell, aside, asideHeaderBorder, asideFooterBorder, scrim, menuFab, sidebarIconBtn, navOutline, email, borderSubtle } = mt;
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [navView, setNavView] = useState('active');

    // CRIT-002: Derivar de la prop auth (cookie HttpOnly), sin leer localStorage
    const currentEmail = String(auth?.user?.email || auth?.claims?.email || 'sin-correo').toLowerCase();
    const currentRoleLabel = String(auth?.user?.role || auth?.claims?.role || 'sin_rol').replace(/_/g, ' ').toUpperCase();

    const sidebarNav = [
        { id: 'active', label: 'Activos', icon: Users },
        { id: 'history', label: 'Historial', icon: History },
        { id: 'metrics', label: 'Métricas', icon: BarChart3 }
    ];

    return (
        <div className={shell}>
            <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className={`fixed left-4 top-16 z-40 flex h-10 w-10 items-center justify-center shadow-lg md:hidden ${menuFab}`}
                aria-label="Abrir menú contratación"
            >
                <Menu size={18} />
            </button>
            {mobileMenuOpen ? (
                <div className={`fixed inset-0 z-40 md:hidden ${scrim}`} onClick={() => setMobileMenuOpen(false)} />
            ) : null}

            <aside
                className={`fixed left-0 top-0 z-50 h-full w-72 shadow-2xl transition-transform duration-300 font-body md:hidden ${aside} ${
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
                <nav className="flex flex-col gap-2 p-3">
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
                <div className={`mt-auto p-4 ${asideFooterBorder}`}>
                    <p className={`truncate text-[10px] font-body font-black ${email}`}>{currentEmail}</p>
                    <p className="text-[10px] font-body font-semibold uppercase text-[#65BCF7]">{currentRoleLabel}</p>
                </div>
            </aside>

            <aside
                className={`relative z-10 hidden h-full flex-shrink-0 flex-col overflow-hidden shadow-2xl transition-all duration-300 ease-in-out font-body md:flex ${aside} ${
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

                <nav className="mt-1 flex flex-1 flex-col gap-1 p-2">
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

                <div className={`border-t ${borderSubtle} ${sidebarOpen ? 'p-4' : 'p-2'}`}>
                    {sidebarOpen ? (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-[#2F7BB8]/30 bg-[#2F7BB8]/20">
                                    <Code2 size={13} className="text-[#65BCF7]" />
                                </div>
                                <div className="min-w-0 overflow-hidden">
                                    <p className={`truncate text-[10px] font-body font-black leading-tight ${email}`}>{currentEmail}</p>
                                    <p className="truncate text-[9px] font-body font-semibold leading-tight text-[#65BCF7]">{currentRoleLabel}</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 py-1">
                            <div className="flex justify-center" title={`${currentEmail} · ${currentRoleLabel}`}>
                                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-[#2F7BB8]/30 bg-[#2F7BB8]/20">
                                    <Code2 size={13} className="text-[#65BCF7]" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <ContratacionDashboard auth={auth} currentView={navView} onNavigate={setNavView} isLight={isLight} />
            </section>
        </div>
    );
}
