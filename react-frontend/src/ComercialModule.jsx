import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Code2, Home, Menu, X, Calculator } from 'lucide-react';
import CotizadorPage from './cotizador/CotizadorPage';
import { useModuleTheme } from './moduleTheme.js';
import AdminModuleSidebarBrand from './AdminModuleSidebarBrand.jsx';

export default function ComercialModule({ token, auth }) {
    const navigate = useNavigate();
    const mt = useModuleTheme();
    const { shell, aside, asideHeaderBorder, asideFooterBorder, scrim, menuFab, sidebarIconBtn, navOutline, email, borderSubtle, mainCanvas, isLight } = mt;
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // CRIT-002: Derivar de la prop auth (cookie HttpOnly), sin leer localStorage
    const currentEmail = String(auth?.user?.email || auth?.claims?.email || 'sin-correo').toLowerCase();
    const currentRoleLabel = String(auth?.user?.role || auth?.claims?.role || 'sin_rol').replace(/_/g, ' ').toUpperCase();

    return (
        <div className={shell}>
            <button
                onClick={() => setMobileMenuOpen(true)}
                className={`md:hidden fixed top-16 left-4 z-40 w-10 h-10 flex items-center justify-center shadow-lg ${menuFab}`}
                aria-label="Abrir menú comercial"
            >
                <Menu size={18} />
            </button>
            {mobileMenuOpen && (
                <div className={`md:hidden fixed inset-0 z-40 ${scrim}`} onClick={() => setMobileMenuOpen(false)} />
            )}
            <aside className={`md:hidden fixed top-0 left-0 h-full w-72 z-50 shadow-2xl transform transition-transform duration-300 font-body ${aside} ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
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
                <nav className="p-3 flex flex-col gap-2">
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
                    <button type="button" className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-body font-semibold bg-[#088DC6] text-white">
                        <Calculator size={17} />
                        <span>Cotizador</span>
                    </button>
                </nav>
                <div className={`mt-auto p-4 ${asideFooterBorder}`}>
                    <p className={`text-[10px] font-body font-black truncate ${email}`}>{currentEmail}</p>
                    <p className="text-[10px] text-[#088DC6] font-body font-semibold uppercase">{currentRoleLabel}</p>
                </div>
            </aside>

            <aside className={`flex-shrink-0 flex-col hidden md:flex h-full shadow-2xl relative z-10 transition-all duration-300 ease-in-out overflow-hidden font-body ${aside} ${sidebarOpen ? 'w-64' : 'w-16'}`}>
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

                <nav className="flex flex-col gap-1 p-2 flex-1 mt-1">
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
                        title={!sidebarOpen ? 'Cotizador' : undefined}
                        className={`flex items-center gap-3 rounded-xl transition-all font-body font-medium text-sm text-left ${sidebarOpen ? 'px-4 py-3' : 'px-0 py-3 justify-center'} bg-[#088DC6] shadow-[0_4px_12px_rgba(8,141,198,0.3)] text-white`}
                    >
                        <Calculator size={18} className="flex-shrink-0 text-white" />
                        {sidebarOpen && <span className="truncate whitespace-nowrap overflow-hidden transition-all duration-300">Cotizador</span>}
                    </button>
                </nav>

                <div className={`border-t ${borderSubtle} ${sidebarOpen ? 'p-4' : 'p-2'}`}>
                    {sidebarOpen ? (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-[#088DC6]/20 border border-[#088DC6]/30 flex items-center justify-center flex-shrink-0">
                                    <Code2 size={13} className="text-[#088DC6]" />
                                </div>
                                <div className="overflow-hidden">
                                    <p className={`text-[10px] font-body font-black whitespace-nowrap leading-tight truncate ${email}`}>{currentEmail}</p>
                                    <p className="text-[9px] text-[#088DC6] font-body font-semibold whitespace-nowrap leading-tight">{currentRoleLabel}</p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 py-1">
                            <div className="flex justify-center" title={`${currentEmail} · ${currentRoleLabel}`}>
                                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-[#088DC6]/30 bg-[#088DC6]/20">
                                    <Code2 size={13} className="text-[#088DC6]" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            <section className={`flex-1 min-w-0 min-h-0 h-full overflow-y-auto ${mainCanvas}`}>
                <CotizadorPage token={token} embedded />
            </section>
        </div>
    );
}

