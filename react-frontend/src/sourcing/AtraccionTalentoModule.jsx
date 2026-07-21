import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Database, Home, Link2, Megaphone, Menu, Search, Sparkles, X } from 'lucide-react';
import { useModuleTheme } from '../moduleTheme.js';
import AdminModuleSidebarBrand from '../AdminModuleSidebarBrand.jsx';
import AdminModuleSidebarFooter from '../AdminModuleSidebarFooter.jsx';
import AdminModuleSidebarUser from '../AdminModuleSidebarUser.jsx';
import { ATRACCION_SIDEBAR_BRAND } from './atraccionLayout.js';
import { AtraccionJobProvider } from './AtraccionJobContext.jsx';
import AtraccionJobLiveBanner from './AtraccionJobLiveBanner.jsx';

function AtraccionTalentoShell({ auth, onLogout }) {
    const navigate = useNavigate();
    const location = useLocation();
    const mt = useModuleTheme();
    const {
        shell,
        aside,
        asideHeaderBorder,
        scrim,
        menuFab,
        sidebarIconBtn,
        navOutline,
        navInactive,
        email,
        borderSubtle,
        mainCanvas,
        isLight
    } = mt;
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const path = location.pathname || '';
    const onVacante = path.includes('/admin/atraccion-talento/vacante') || path.endsWith('/atraccion-talento');
    const onBusqueda = path.includes('/admin/atraccion-talento/shortlist') || path.includes('/admin/atraccion-talento/busqueda');
    const onCaptura = path.includes('/admin/atraccion-talento/captura');
    const onCampanas = path.includes('/admin/atraccion-talento/campanas');
    const onIntegraciones = path.includes('/admin/atraccion-talento/integraciones');

    const currentEmail = String(auth?.user?.email || auth?.claims?.email || 'sin-correo').toLowerCase();
    const currentRoleLabel = String(auth?.user?.role || auth?.claims?.role || 'sin_rol').replace(/_/g, ' ').toUpperCase();

    const navItemClass = (active) =>
        `flex items-center gap-3 rounded-xl text-sm font-body font-semibold transition-all ${
            active ? 'bg-[#2F7BB8] shadow-[0_4px_12px_rgba(47,123,184,0.3)] text-white' : navInactive
        }`;

    const navIconClass = (active) =>
        `flex-shrink-0 ${active ? 'text-white' : isLight ? 'text-slate-600' : 'text-slate-500'}`;

    const closeMobile = () => setMobileMenuOpen(false);

    const moduleContext = (
        <>
            <p className="whitespace-nowrap text-[10px] font-heading font-black uppercase leading-tight tracking-widest text-[#65BCF7]">
                {ATRACCION_SIDEBAR_BRAND.line1}
            </p>
            <p className="whitespace-nowrap text-[10px] font-body font-bold uppercase leading-tight tracking-widest text-slate-400">
                {ATRACCION_SIDEBAR_BRAND.line2}
            </p>
        </>
    );

    const navButtons = (expanded) => (
        <>
            <button
                type="button"
                onClick={() => { navigate('/admin'); closeMobile(); }}
                title={!expanded ? 'Inicio portal' : undefined}
                className={`flex items-center gap-3 rounded-xl text-left text-sm font-body font-medium transition-all ${navOutline} ${
                    expanded ? 'px-4 py-3' : 'justify-center px-0 py-3'
                }`}
            >
                <Home size={18} className={`flex-shrink-0 ${isLight ? 'text-slate-600' : 'text-slate-500'}`} />
                {expanded ? <span className="truncate">Inicio portal</span> : null}
            </button>
            <button
                type="button"
                onClick={() => { navigate('/admin/atraccion-talento/vacante'); closeMobile(); }}
                title={!expanded ? 'Vacante' : undefined}
                className={`${navItemClass(onVacante)} ${expanded ? 'px-4 py-3' : 'justify-center px-0 py-3'}`}
            >
                <Sparkles size={18} className={navIconClass(onVacante)} />
                {expanded ? <span className="truncate">Vacante</span> : null}
            </button>
            <button
                type="button"
                onClick={() => { navigate('/admin/atraccion-talento/shortlist'); closeMobile(); }}
                title={!expanded ? 'Shortlist' : undefined}
                className={`${navItemClass(onBusqueda)} ${expanded ? 'px-4 py-3' : 'justify-center px-0 py-3'}`}
            >
                <Search size={18} className={navIconClass(onBusqueda)} />
                {expanded ? <span className="truncate">Shortlist</span> : null}
            </button>
            <button
                type="button"
                onClick={() => { navigate('/admin/atraccion-talento/captura'); closeMobile(); }}
                title={!expanded ? 'Base de captura' : undefined}
                className={`${navItemClass(onCaptura)} ${expanded ? 'px-4 py-3' : 'justify-center px-0 py-3'}`}
            >
                <Database size={18} className={navIconClass(onCaptura)} />
                {expanded ? <span className="truncate">Base de captura</span> : null}
            </button>
            <button
                type="button"
                onClick={() => { navigate('/admin/atraccion-talento/campanas'); closeMobile(); }}
                title={!expanded ? 'Campañas' : undefined}
                className={`${navItemClass(onCampanas)} ${expanded ? 'px-4 py-3' : 'justify-center px-0 py-3'}`}
            >
                <Megaphone size={18} className={navIconClass(onCampanas)} />
                {expanded ? <span className="truncate">Campañas</span> : null}
            </button>
            <button
                type="button"
                onClick={() => { navigate('/admin/atraccion-talento/integraciones'); closeMobile(); }}
                title={!expanded ? 'Integraciones' : undefined}
                className={`${navItemClass(onIntegraciones)} ${expanded ? 'px-4 py-3' : 'justify-center px-0 py-3'}`}
            >
                <Link2 size={18} className={navIconClass(onIntegraciones)} />
                {expanded ? <span className="truncate">Integraciones</span> : null}
            </button>
        </>
    );

    return (
        <div className={shell}>
            <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className={`md:hidden fixed top-4 left-4 z-40 flex h-10 w-10 items-center justify-center shadow-lg ${menuFab}`}
                aria-label="Abrir menú atracción de talento"
            >
                <Menu size={18} />
            </button>
            {mobileMenuOpen ? (
                <button type="button" className={`md:hidden fixed inset-0 z-40 ${scrim}`} aria-label="Cerrar menú" onClick={closeMobile} />
            ) : null}

            <aside
                className={`md:hidden fixed top-0 left-0 z-50 flex h-full w-72 flex-col transform font-body shadow-2xl transition-transform duration-300 ${aside} ${
                    mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                <AdminModuleSidebarBrand
                    variant="drawer"
                    isLight={isLight}
                    asideHeaderBorder={asideHeaderBorder}
                    moduleContext={moduleContext}
                    endAction={(
                        <button type="button" onClick={closeMobile} className={`flex h-8 w-8 items-center justify-center ${sidebarIconBtn}`} aria-label="Cerrar">
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
                <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">{navButtons(true)}</nav>
                <AdminModuleSidebarFooter auth={auth} onLogout={onLogout} sidebarOpen borderSubtle={borderSubtle} isLight={isLight} />
            </aside>

            <aside
                className={`relative z-10 hidden h-full flex-shrink-0 flex-col overflow-x-hidden font-body shadow-2xl transition-all duration-300 ease-in-out md:flex ${
                    sidebarOpen ? 'w-64' : 'w-16'
                } ${aside}`}
            >
                <AdminModuleSidebarBrand
                    variant={sidebarOpen ? 'rail-expanded' : 'rail-collapsed'}
                    isLight={isLight}
                    asideHeaderBorder={asideHeaderBorder}
                    moduleContext={sidebarOpen ? moduleContext : null}
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
                <nav className="mt-1 flex flex-1 flex-col gap-1 overflow-y-auto p-2">{navButtons(sidebarOpen)}</nav>
                <AdminModuleSidebarFooter auth={auth} onLogout={onLogout} sidebarOpen={sidebarOpen} borderSubtle={borderSubtle} isLight={isLight} />
            </aside>

            <div className={`flex min-w-0 flex-1 flex-col ${mainCanvas}`}>
                <AtraccionJobLiveBanner />
                <Outlet context={{ auth, token: auth?.token || '' }} />
            </div>
        </div>
    );
}

export default function AtraccionTalentoModule({ auth, onLogout }) {
    return (
        <AtraccionJobProvider token={auth?.token || ''}>
            <AtraccionTalentoShell auth={auth} onLogout={onLogout} />
        </AtraccionJobProvider>
    );
}
