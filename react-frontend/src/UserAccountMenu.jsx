import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
    Bell,
    KeyRound,
    LogOut,
    Menu,
    Moon,
    Settings,
    Sun,
    User
} from 'lucide-react';
import { userHasNovedadesAdminAccess } from './comercialAccess';
import { useUiTheme } from './UiThemeContext.jsx';

function initials(auth) {
    const u = auth?.user && typeof auth.user === 'object' ? auth.user : {};
    const c = auth?.claims && typeof auth.claims === 'object' ? auth.claims : {};
    const n = String(u.name || c.name || '').trim();
    if (n) {
        const parts = n.split(/\s+/).filter(Boolean);
        const a = (parts[0]?.[0] || '').toUpperCase();
        const b = (parts[1]?.[0] || parts[0]?.[1] || '').toUpperCase();
        return (a + b).slice(0, 2) || 'U';
    }
    const mail = String(u.email || c.email || '').trim();
    if (mail.length >= 2) return mail.slice(0, 2).toUpperCase();
    return 'U';
}

/**
 * Campana (placeholder), menú usuario estilo tarjeta y toggle tema.
 * `surface`: "banner" (sobre imagen) | "header" (barra App) | "sidebar" (pie del panel lateral; menú hacia arriba vía portal).
 * `collapseToolbarOnMobile`: en &lt; md un solo botón abre panel con cuenta, tema y alertas (evita barra apretada en móvil).
 */
export default function UserAccountMenu({
    auth,
    onLogout,
    surface = 'banner',
    notificationCount = 0,
    collapseToolbarOnMobile = false,
    assistantSlot = null,
    /** En `surface="sidebar"`: rail colapsado → un solo botón con menú completo. */
    sidebarCompact = false
}) {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useUiTheme();
    const isLight = theme === 'light';
    const [open, setOpen] = useState(false);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [sidebarPanelPos, setSidebarPanelPos] = useState(null);
    const wrapRef = useRef(null);
    const triggerRef = useRef(null);
    const sidebarPanelRef = useRef(null);

    const ini = initials(auth);
    const isBanner = surface === 'banner';
    const isSidebar = surface === 'sidebar';
    const menuOpen = isSidebar ? open : open || sheetOpen;

    const updateSidebarPanelPos = useCallback(() => {
        const el = triggerRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const panelWidth = 256;
        const margin = 8;
        let left = rect.left;
        if (left + panelWidth > window.innerWidth - margin) {
            left = window.innerWidth - panelWidth - margin;
        }
        left = Math.max(margin, left);
        setSidebarPanelPos({
            left,
            width: panelWidth,
            bottom: window.innerHeight - rect.top + margin
        });
    }, []);

    useLayoutEffect(() => {
        if (!isSidebar || !open) return;
        updateSidebarPanelPos();
        const onReflow = () => updateSidebarPanelPos();
        window.addEventListener('resize', onReflow);
        window.addEventListener('scroll', onReflow, true);
        return () => {
            window.removeEventListener('resize', onReflow);
            window.removeEventListener('scroll', onReflow, true);
        };
    }, [isSidebar, open, updateSidebarPanelPos]);

    useEffect(() => {
        if (!menuOpen) return;
        const onDoc = (e) => {
            const t = e.target;
            if (wrapRef.current?.contains(t) || sidebarPanelRef.current?.contains(t)) return;
            setOpen(false);
            setSheetOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [menuOpen]);

    useEffect(() => {
        if (!isSidebar || !open) return;
        const onKey = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isSidebar, open]);

    const isEntraConsultor =
        auth?.user?.authProvider === 'entra_consultor' &&
        String(auth?.user?.role || '').toLowerCase() === 'consultor';

    const bannerLight = isBanner && isLight;

    const panelClass = bannerLight
        ? 'border border-slate-200 bg-white text-slate-800 shadow-xl'
        : isBanner
          ? 'border border-white/15 bg-[#0c1824]/95 text-slate-100 shadow-2xl backdrop-blur-md'
          : isLight
            ? 'border border-slate-200 bg-white text-slate-800 shadow-xl'
            : 'border border-[#1a3a56] bg-[#0b1e30] text-slate-100 shadow-xl';

    const itemClass = bannerLight
        ? 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100'
        : isBanner
          ? 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-100 hover:bg-white/10'
          : isLight
            ? 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-100'
            : 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-200 hover:bg-[#0f2942]';

    const itemDanger = bannerLight
        ? 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-rose-700 hover:bg-rose-50'
        : isBanner
          ? 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-rose-200 hover:bg-rose-500/15'
          : isLight
            ? 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-rose-700 hover:bg-rose-50'
            : 'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-rose-300 hover:bg-rose-500/10';

    /**
     * Misma caja para iniciales, tema y alertas.
     * En banner + tema claro: sin backdrop-blur (evita que el filtro claro del hub “lave” el icono);
     * fondo casi opaco para que no herede el blanco del hero.
     */
    const tileClass = bannerLight
        ? 'relative z-[1] inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#004D87]/45 bg-white/98 text-[#004D87] shadow-md transition-colors hover:border-[#004D87]/60 hover:bg-white sm:h-11 sm:w-11'
        : isBanner
          ? 'relative z-[1] inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-[#04141E]/88 text-white shadow-lg transition-colors hover:border-white/35 hover:bg-[#04141E]/95 sm:h-11 sm:w-11'
          : isLight
            ? 'relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-100 sm:h-11 sm:w-11'
            : 'relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#1a3a56] bg-[#0b1e30] text-[#65BCF7] shadow-md transition-colors hover:bg-[#0f2942] sm:h-11 sm:w-11';

    const themeIconClass = bannerLight ? 'text-[#088DC6]' : isBanner ? 'text-[#65BCF7]' : '';

    const go = (path) => {
        setOpen(false);
        setSheetOpen(false);
        navigate(path);
    };

    const novedades = userHasNovedadesAdminAccess(auth);

    const accountProfileMenuItems = (
        <>
            <button
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => go(isEntraConsultor ? '/consultor' : '/admin')}
            >
                <User size={18} className="opacity-80" />
                {isEntraConsultor ? 'Inicio portal' : 'Mi perfil'}
            </button>
            {!isEntraConsultor ? (
                <>
                    <button
                        type="button"
                        role="menuitem"
                        className={itemClass}
                        onClick={() => go(novedades ? '/admin/novedades' : '/admin')}
                    >
                        <Settings size={18} className="opacity-80" />
                        Configuración
                    </button>
                    <button
                        type="button"
                        role="menuitem"
                        className={itemClass}
                        onClick={() => go('/perfil/cambiar-clave')}
                    >
                        <KeyRound size={18} className="opacity-80" />
                        Cambiar contraseña
                    </button>
                </>
            ) : null}
            <div className={`my-1.5 h-px ${bannerLight ? 'bg-slate-200' : isBanner ? 'bg-white/10' : isLight ? 'bg-slate-200' : 'bg-[#1a3a56]'}`} />
            <button
                type="button"
                role="menuitem"
                className={itemDanger}
                onClick={() => {
                    setOpen(false);
                    setSheetOpen(false);
                    onLogout?.();
                }}
            >
                <LogOut size={18} />
                Cerrar sesión
            </button>
        </>
    );

    const accountMenuPanel =
        !isSidebar && open ? (
            <div
                className={`absolute right-0 top-[calc(100%+8px)] z-[80] w-64 overflow-hidden rounded-xl py-1.5 ${panelClass}`}
                role="menu"
            >
                {accountProfileMenuItems}
            </div>
        ) : null;

    const toggleAccountMenu = () => {
        setSheetOpen(false);
        setOpen((o) => {
            const next = !o;
            if (next && isSidebar) updateSidebarPanelPos();
            return next;
        });
    };

    const toolbarTiles = (
        <>
            {assistantSlot ? (
                <div className="relative inline-flex">
                    {assistantSlot}
                </div>
            ) : null}
            <div className="relative">
                <button
                    ref={isSidebar ? triggerRef : undefined}
                    type="button"
                    onClick={toggleAccountMenu}
                    aria-expanded={open}
                    aria-haspopup="menu"
                    title="Menú de cuenta"
                    className={`${tileClass} font-heading text-sm font-bold tracking-tight sm:text-[15px] ${
                        bannerLight
                            ? ''
                            : isBanner
                              ? 'text-[#d4efff]'
                              : isLight
                                ? 'text-[#0c4a6e]'
                                : 'text-[#c5e6ff]'
                    }`}
                >
                    {ini}
                </button>
                {accountMenuPanel}
            </div>

            <button
                type="button"
                onClick={toggleTheme}
                aria-pressed={isLight}
                aria-label={isLight ? 'Activar modo oscuro' : 'Activar modo claro'}
                title={isLight ? 'Modo oscuro' : 'Modo claro'}
                className={tileClass}
            >
                {isLight ? (
                    <Moon size={20} strokeWidth={2} className={themeIconClass} />
                ) : (
                    <Sun size={20} strokeWidth={2} className={themeIconClass} />
                )}
            </button>

            <span className="inline-flex" title="Notificaciones: no disponible por el momento">
                <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    aria-label="Notificaciones no disponibles temporalmente"
                    className={`${tileClass} cursor-not-allowed opacity-45`}
                >
                    <Bell size={20} strokeWidth={2} className={bannerLight ? 'text-[#004D87]' : isBanner ? 'text-white' : ''} />
                </button>
            </span>
        </>
    );

    const accountExtrasPanel = (
        <>
            <div className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide ${bannerLight ? 'text-slate-500' : isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Cuenta ({ini})
            </div>
            <button type="button" role="menuitem" className={itemClass} onClick={() => go(isEntraConsultor ? '/consultor' : '/admin')}>
                <User size={18} className="opacity-80" />
                {isEntraConsultor ? 'Inicio portal' : 'Mi perfil'}
            </button>
            {!isEntraConsultor ? (
                <>
                    <button type="button" role="menuitem" className={itemClass} onClick={() => go(novedades ? '/admin/novedades' : '/admin')}>
                        <Settings size={18} className="opacity-80" />
                        Configuración
                    </button>
                    <button type="button" role="menuitem" className={itemClass} onClick={() => go('/perfil/cambiar-clave')}>
                        <KeyRound size={18} className="opacity-80" />
                        Cambiar contraseña
                    </button>
                </>
            ) : null}
            <div className={`my-1.5 h-px ${bannerLight ? 'bg-slate-200' : isBanner ? 'bg-white/10' : isLight ? 'bg-slate-200' : 'bg-[#1a3a56]'}`} />
            <button
                type="button"
                role="menuitem"
                className={itemClass}
                onClick={() => {
                    toggleTheme();
                    setOpen(false);
                    setSheetOpen(false);
                }}
            >
                {isLight ? <Moon size={18} className="opacity-80" /> : <Sun size={18} className="opacity-80" />}
                {isLight ? 'Modo oscuro' : 'Modo claro'}
            </button>
            <span className="block w-full" title="Notificaciones: no disponible por el momento">
                <button
                    type="button"
                    disabled
                    className={`flex w-full cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium opacity-45 ${bannerLight ? 'text-slate-600' : isLight ? 'text-slate-600' : 'text-slate-300'}`}
                    aria-label="Notificaciones no disponibles temporalmente"
                >
                    <Bell size={18} />
                    Notificaciones (pronto)
                </button>
            </span>
            <div className={`my-1.5 h-px ${bannerLight ? 'bg-slate-200' : isBanner ? 'bg-white/10' : isLight ? 'bg-slate-200' : 'bg-[#1a3a56]'}`} />
            <button
                type="button"
                role="menuitem"
                className={itemDanger}
                onClick={() => {
                    setOpen(false);
                    setSheetOpen(false);
                    onLogout?.();
                }}
            >
                <LogOut size={18} />
                Cerrar sesión
            </button>
        </>
    );

    const sidebarMenuPortal =
        isSidebar && open && sidebarPanelPos
            ? createPortal(
                  <div
                      ref={sidebarPanelRef}
                      className={`fixed z-[200] overflow-hidden rounded-xl py-1.5 ${panelClass}`}
                      style={{
                          left: sidebarPanelPos.left,
                          width: sidebarPanelPos.width,
                          bottom: sidebarPanelPos.bottom
                      }}
                      role="menu"
                      aria-label="Menú de cuenta"
                  >
                      {sidebarCompact ? accountExtrasPanel : accountProfileMenuItems}
                  </div>,
                  document.body
              )
            : null;

    const mobileSheet = sheetOpen ? (
        <div
            className={`absolute right-0 top-[calc(100%+8px)] z-[90] w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-xl py-1.5 ${panelClass}`}
            role="menu"
            aria-label="Acciones de cuenta y preferencias"
        >
            {accountExtrasPanel}
        </div>
    ) : null;

    const sidebarToolbar = (
        <div ref={wrapRef} className="relative z-[60] shrink-0 font-body">
            <button
                ref={triggerRef}
                type="button"
                onClick={() => {
                    setSheetOpen(false);
                    setOpen((o) => {
                        const next = !o;
                        if (next) updateSidebarPanelPos();
                        return next;
                    });
                }}
                aria-expanded={open}
                aria-haspopup="menu"
                title="Menú de cuenta"
                className={`${tileClass} font-heading text-sm font-bold tracking-tight ${
                    isLight ? 'text-[#0c4a6e]' : 'text-[#c5e6ff]'
                }`}
            >
                {ini}
            </button>
            {sidebarMenuPortal}
        </div>
    );

    if (isSidebar && sidebarCompact) {
        return sidebarToolbar;
    }

    if (isSidebar) {
        return (
            <div ref={wrapRef} className="relative z-[60] flex shrink-0 items-center justify-end gap-1.5 font-body">
                {toolbarTiles}
                {sidebarMenuPortal}
            </div>
        );
    }

    return (
        <div
            ref={wrapRef}
            className={`relative flex flex-wrap items-center justify-end gap-2 font-body sm:gap-2.5 ${isBanner ? 'z-[25] isolate' : ''}`}
        >
            {collapseToolbarOnMobile ? (
                <>
                    <div className="relative md:hidden">
                        <button
                            type="button"
                            onClick={() => {
                                setOpen(false);
                                setSheetOpen((s) => !s);
                            }}
                            aria-expanded={sheetOpen}
                            aria-haspopup="menu"
                            title="Menú de cuenta y opciones"
                            className={tileClass}
                            aria-label="Abrir menú de cuenta y opciones"
                        >
                            <Menu
                                size={22}
                                strokeWidth={2}
                                className={bannerLight ? 'text-[#004D87]' : isBanner ? 'text-[#d4efff]' : themeIconClass || ''}
                            />
                        </button>
                        {mobileSheet}
                    </div>
                    <div className={`hidden md:flex flex-wrap items-center justify-end gap-2 sm:gap-2.5 ${isBanner ? 'isolate' : ''}`}>
                        {toolbarTiles}
                    </div>
                </>
            ) : (
                toolbarTiles
            )}
        </div>
    );
}
