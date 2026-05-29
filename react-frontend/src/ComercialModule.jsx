import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Home, Menu, X, Calculator } from 'lucide-react';
import CotizadorPage from './cotizador/CotizadorPage';
import { useModuleTheme } from './moduleTheme.js';
import AdminModuleSidebarBrand from './AdminModuleSidebarBrand.jsx';
import AdminModuleSidebarFooter from './AdminModuleSidebarFooter.jsx';
import AdminModuleSidebarUser from './AdminModuleSidebarUser.jsx';

export default function ComercialModule({ token, auth, onLogout }) {
    const navigate = useNavigate();
    const location = useLocation();
    const mt = useModuleTheme();
    const { shell, aside, asideHeaderBorder, scrim, menuFab, sidebarIconBtn, navOutline, email, borderSubtle, mainCanvas, isLight } = mt;
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const path = location.pathname || '';
    const onCotizador = path === '/admin/comercial' || path === '/admin/comercial/';

    const currentEmail = String(auth?.user?.email || auth?.claims?.email || 'sin-correo').toLowerCase();
    const currentRoleLabel = String(auth?.user?.role || auth?.claims?.role || 'sin_rol').replace(/_/g, ' ').toUpperCase();

    const navCotizadorClass = (active) =>
        `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-body font-semibold transition-all ${
            active
                ? 'bg-[#088DC6] shadow-[0_4px_12px_rgba(8,141,198,0.3)] text-white'
                : navOutline
        }`;

    const userAccent = {
        accentClass: 'text-[#088DC6]',
        accentBgClass: 'bg-[#088DC6]/20 border-[#088DC6]/30'
    };

    return (
        <div className={shell}>
            <button
                onClick={() => setMobileMenuOpen(true)}
                className={`md:hidden fixed top-4 left-4 z-40 w-10 h-10 flex items-center justify-center shadow-lg ${menuFab}`}
                aria-label="Abrir menú comercial"
            >
                <Menu size={18} />
            </button>
            {mobileMenuOpen && (
                <div className={`md:hidden fixed inset-0 z-40 ${scrim}`} onClick={() => setMobileMenuOpen(false)} />
            )}
            <aside
                className={`md:hidden fixed top-0 left-0 z-50 flex h-full w-72 flex-col font-body shadow-2xl transform transition-transform duration-300 ${aside} ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                <AdminModuleSidebarBrand
                    variant="drawer"
                    isLight={isLight}
                    asideHeaderBorder={asideHeaderBorder}
                    moduleContext={(
                        <>
                            <p className="text-[10px] font-heading font-black text-[#088DC6] uppercase tracking-widest leading-tight">Módulo Comercial</p>
                            <p className="text-[10px] font-body font-bold text-slate-400 uppercase tracking-widest leading-tight">Cotizador CINTE</p>
                        </>
                    )}
                    endAction={(
                        <button type="button" onClick={() => setMobileMenuOpen(false)} className={`flex h-8 w-8 flex-shrink-0 items-center justify-center ${sidebarIconBtn}`} aria-label="Cerrar menú">
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
                    {...userAccent}
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
                    <button
                        type="button"
                        onClick={() => {
                            navigate('/admin/comercial');
                            setMobileMenuOpen(false);
                        }}
                        className={navCotizadorClass(onCotizador)}
                    >
                        <Calculator size={17} />
                        <span>Cotizador</span>
                    </button>
                </nav>
                <AdminModuleSidebarFooter auth={auth} onLogout={onLogout} sidebarOpen borderSubtle={borderSubtle} isLight={isLight} />
            </aside>

            <aside
                className={`relative z-10 hidden h-full flex-shrink-0 flex-col overflow-x-hidden font-body shadow-2xl transition-all duration-300 ease-in-out md:flex ${aside} ${sidebarOpen ? 'w-64' : 'w-16'}`}
            >
                <AdminModuleSidebarBrand
                    variant={sidebarOpen ? 'rail-expanded' : 'rail-collapsed'}
                    isLight={isLight}
                    asideHeaderBorder={asideHeaderBorder}
                    moduleContext={(
                        <>
                            <p className="text-[10px] font-heading font-black text-[#088DC6] uppercase tracking-widest whitespace-nowrap leading-tight">Módulo Comercial</p>
                            <p className="text-[10px] font-body font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap leading-tight">Cotizador CINTE</p>
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
                    {...userAccent}
                />

                <nav className="mt-1 flex flex-1 flex-col gap-1 overflow-y-auto p-2">
                    <button
                        type="button"
                        onClick={() => navigate('/admin')}
                        title={!sidebarOpen ? 'Inicio portal' : undefined}
                        className={`flex items-center gap-3 rounded-xl transition-all font-body font-medium text-sm text-left ${navOutline} ${sidebarOpen ? 'px-4 py-3' : 'px-0 py-3 justify-center'}`}
                    >
                        <Home size={18} className="flex-shrink-0 text-slate-500" />
                        {sidebarOpen && <span className="truncate whitespace-nowrap overflow-hidden transition-all duration-300">Inicio portal</span>}
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate('/admin/comercial')}
                        title={!sidebarOpen ? 'Cotizador' : undefined}
                        className={`flex items-center gap-3 rounded-xl transition-all font-body font-medium text-sm text-left ${sidebarOpen ? 'px-4 py-3' : 'px-0 py-3 justify-center'} ${onCotizador ? 'bg-[#088DC6] shadow-[0_4px_12px_rgba(8,141,198,0.3)] text-white' : navOutline}`}
                    >
                        <Calculator size={18} className={`flex-shrink-0 ${onCotizador ? 'text-white' : 'text-slate-500'}`} />
                        {sidebarOpen && <span className="truncate whitespace-nowrap overflow-hidden transition-all duration-300">Cotizador</span>}
                    </button>
                </nav>

                <AdminModuleSidebarFooter
                    auth={auth}
                    onLogout={onLogout}
                    sidebarOpen={sidebarOpen}
                    borderSubtle={borderSubtle}
                    isLight={isLight}
                />
            </aside>

            <section className={`flex-1 min-w-0 min-h-0 h-full overflow-y-auto ${mainCanvas}`}>
                <CotizadorPage token={token} embedded />
            </section>
        </div>
    );
}
