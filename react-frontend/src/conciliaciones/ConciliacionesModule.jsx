import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Home, LayoutDashboard, Menu, Scale, X } from 'lucide-react';
import { useModuleTheme } from '../moduleTheme.js';
import AdminModuleSidebarBrand from '../AdminModuleSidebarBrand.jsx';

export default function ConciliacionesModule({ auth }) {
    const navigate = useNavigate();
    const location = useLocation();
    const mt = useModuleTheme();
    const {
        shell,
        aside,
        asideHeaderBorder,
        asideFooterBorder,
        scrim,
        menuFab,
        sidebarIconBtn,
        navOutline,
        email,
        borderSubtle,
        mainCanvas,
        isLight
    } = mt;
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const path = location.pathname || '';
    const onDashboard = path.includes('/admin/conciliaciones/dashboard');
    const onResumen = path.includes('/admin/conciliaciones/resumen');

    const currentEmail = String(auth?.user?.email || auth?.claims?.email || 'sin-correo').toLowerCase();
    const currentRoleLabel = String(auth?.user?.role || auth?.claims?.role || 'sin_rol').replace(/_/g, ' ').toUpperCase();

    const navItemClass = (active) =>
        `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-body font-semibold transition-all ${
            active ? 'bg-[#2F7BB8] shadow-[0_4px_12px_rgba(47,123,184,0.3)] text-white' : navOutline
        }`;

    const closeMobile = () => setMobileMenuOpen(false);

    return (
        <div className={shell}>
            <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className={`md:hidden fixed top-16 left-4 z-40 flex h-10 w-10 items-center justify-center shadow-lg ${menuFab}`}
                aria-label="Abrir menú conciliaciones"
            >
                <Menu size={18} />
            </button>
            {mobileMenuOpen ? (
                <button type="button" className={`md:hidden fixed inset-0 z-40 ${scrim}`} aria-label="Cerrar menú" onClick={closeMobile} />
            ) : null}
            <aside
                className={`md:hidden fixed top-0 left-0 z-50 h-full w-72 transform font-body shadow-2xl transition-transform duration-300 ${aside} ${
                    mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                <AdminModuleSidebarBrand
                    variant="drawer"
                    isLight={isLight}
                    asideHeaderBorder={asideHeaderBorder}
                    moduleContext={(
                        <>
                            <p className="text-[10px] font-heading font-black uppercase leading-tight tracking-widest text-[#65BCF7]">Conciliaciones</p>
                            <p className="text-[10px] font-body font-bold uppercase leading-tight tracking-widest text-slate-400">Facturación vs novedades</p>
                        </>
                    )}
                    endAction={(
                        <button
                            type="button"
                            onClick={closeMobile}
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
                            closeMobile();
                        }}
                        className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-body font-semibold transition-all ${navOutline}`}
                    >
                        <Home size={17} />
                        <span>Inicio portal</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            navigate('/admin/conciliaciones/dashboard');
                            closeMobile();
                        }}
                        className={navItemClass(onDashboard)}
                    >
                        <LayoutDashboard size={17} />
                        <span>Dashboard</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            navigate('/admin/conciliaciones/resumen');
                            closeMobile();
                        }}
                        className={navItemClass(onResumen)}
                    >
                        <Scale size={17} />
                        <span>Resumen por cliente</span>
                    </button>
                </nav>
                <div className={`mt-auto p-4 ${asideFooterBorder}`}>
                    <p className={`truncate text-[10px] font-body font-black ${email}`}>{currentEmail}</p>
                    <p className="text-[10px] font-body font-semibold uppercase text-[#65BCF7]">{currentRoleLabel}</p>
                </div>
            </aside>

            <aside
                className={`relative z-10 hidden h-full flex-shrink-0 flex-col overflow-hidden font-body shadow-2xl transition-all duration-300 ease-in-out md:flex ${
                    sidebarOpen ? 'w-64' : 'w-16'
                } ${aside}`}
            >
                <AdminModuleSidebarBrand
                    variant={sidebarOpen ? 'rail-expanded' : 'rail-collapsed'}
                    isLight={isLight}
                    asideHeaderBorder={asideHeaderBorder}
                    moduleContext={(
                        <>
                            <p className="whitespace-nowrap text-[10px] font-heading font-black uppercase leading-tight tracking-widest text-[#65BCF7]">
                                Conciliaciones
                            </p>
                            <p className="whitespace-nowrap text-[10px] font-body font-bold uppercase leading-tight tracking-widest text-slate-400">
                                Facturación vs novedades
                            </p>
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
                        <Home size={18} className="flex-shrink-0 text-slate-500" />
                        {sidebarOpen ? <span className="truncate whitespace-nowrap">Inicio portal</span> : null}
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/admin/conciliaciones/dashboard')}
                        title={!sidebarOpen ? 'Dashboard' : undefined}
                        className={`flex items-center gap-3 rounded-xl text-left text-sm font-body font-medium transition-all ${
                            sidebarOpen ? 'px-4 py-3' : 'justify-center px-0 py-3'
                        } ${onDashboard ? 'bg-[#2F7BB8] text-white shadow-[0_4px_12px_rgba(47,123,184,0.3)]' : navOutline}`}
                    >
                        <LayoutDashboard size={18} className={`flex-shrink-0 ${onDashboard ? 'text-white' : 'text-slate-500'}`} />
                        {sidebarOpen ? <span className="truncate whitespace-nowrap">Dashboard</span> : null}
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/admin/conciliaciones/resumen')}
                        title={!sidebarOpen ? 'Resumen' : undefined}
                        className={`flex items-center gap-3 rounded-xl text-left text-sm font-body font-medium transition-all ${
                            sidebarOpen ? 'px-4 py-3' : 'justify-center px-0 py-3'
                        } ${onResumen ? 'bg-[#2F7BB8] text-white shadow-[0_4px_12px_rgba(47,123,184,0.3)]' : navOutline}`}
                    >
                        <Scale size={18} className={`flex-shrink-0 ${onResumen ? 'text-white' : 'text-slate-500'}`} />
                        {sidebarOpen ? <span className="truncate whitespace-nowrap">Resumen por cliente</span> : null}
                    </button>
                </nav>

                <div className={`border-t ${borderSubtle} ${sidebarOpen ? 'p-4' : 'p-2'}`}>
                    {sidebarOpen ? (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-[#65BCF7]/30 bg-[#2F7BB8]/20">
                                    <LayoutDashboard size={13} className="text-[#65BCF7]" />
                                </div>
                                <div className="min-w-0 overflow-hidden">
                                    <p className={`truncate text-[10px] font-body font-black leading-tight whitespace-nowrap ${email}`}>{currentEmail}</p>
                                    <p className="truncate text-[9px] font-body font-semibold leading-tight whitespace-nowrap text-[#65BCF7]">{currentRoleLabel}</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 py-1" title={`${currentEmail} · ${currentRoleLabel}`}>
                            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#65BCF7]/30 bg-[#2F7BB8]/20">
                                <LayoutDashboard size={13} className="text-[#65BCF7]" />
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            <section className={`flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${mainCanvas}`}>
                <Outlet />
            </section>
        </div>
    );
}
