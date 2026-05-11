import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Code2, KeyRound, LogOut, Menu, X, Calculator } from 'lucide-react';
import CotizadorPage from './cotizador/CotizadorPage';

export default function ComercialModule({ token, auth, onLogout }) {
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // CRIT-002: Derivar de la prop auth (cookie HttpOnly), sin leer localStorage
    const currentEmail = String(auth?.user?.email || auth?.claims?.email || 'sin-correo').toLowerCase();
    const currentRoleLabel = String(auth?.user?.role || auth?.claims?.role || 'sin_rol').replace(/_/g, ' ').toUpperCase();

    const handleSidebarLogout = () => {
        if (onLogout) {
            onLogout();
            return;
        }
        navigate('/admin', { replace: true });
    };

    return (
        <div className="flex h-full w-full bg-[#04141E] text-slate-200 overflow-hidden font-body">
            <button
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden fixed top-24 left-4 z-40 w-10 h-10 rounded-lg bg-[#0b1e30] border border-[#1a3a56] text-slate-200 flex items-center justify-center shadow-lg"
                aria-label="Abrir menú comercial"
            >
                <Menu size={18} />
            </button>
            {mobileMenuOpen && (
                <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileMenuOpen(false)} />
            )}
            <aside className={`md:hidden fixed top-0 left-0 h-full w-72 bg-[#0b1e30] border-r border-[#1a3a56]/50 z-50 shadow-2xl transform transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="p-4 border-b border-[#1a3a56]/50 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-heading font-black text-[#088DC6] uppercase tracking-widest">Módulo Comercial</p>
                        <p className="text-[10px] font-body font-bold text-slate-400 uppercase tracking-widest">Cotizador CINTE</p>
                    </div>
                    <button onClick={() => setMobileMenuOpen(false)} className="w-8 h-8 rounded-lg bg-[#04141E] border border-[#1a3a56] text-slate-300 flex items-center justify-center" aria-label="Cerrar menú">
                        <X size={16} />
                    </button>
                </div>
                <nav className="p-3 flex flex-col gap-2">
                    <button className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-body font-semibold bg-[#088DC6] text-white">
                        <Calculator size={17} />
                        <span>Cotizador</span>
                    </button>
                </nav>
                <div className="mt-auto p-4 border-t border-[#1a3a56]/50">
                    <p className="text-[10px] font-body font-black text-slate-300 truncate">{currentEmail}</p>
                    <p className="text-[10px] text-[#088DC6] font-body font-semibold uppercase">{currentRoleLabel}</p>
                    <div className="mt-3 flex flex-col gap-2">
                        <button onClick={() => navigate('/perfil/cambiar-clave')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-[#1a3a56] text-slate-200 hover:bg-[#0f2942]/60 transition-all text-xs font-body font-semibold">
                            <KeyRound size={14} />
                            Cambiar contraseña
                        </button>
                        <button onClick={handleSidebarLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-all text-xs font-body font-semibold">
                            <LogOut size={14} />
                            Cerrar sesión
                        </button>
                    </div>
                </div>
            </aside>

            <aside className={`bg-[#0b1e30] flex-shrink-0 flex-col hidden md:flex h-full shadow-2xl relative z-10 transition-all duration-300 ease-in-out overflow-hidden ${sidebarOpen ? 'w-64' : 'w-16'}`}>
                <div className={`border-b border-[#1a3a56]/50 flex items-center ${sidebarOpen ? 'px-5 py-4 justify-between' : 'px-0 py-4 justify-center'}`}>
                    {sidebarOpen && (
                        <div className="overflow-hidden">
                            <p className="text-[10px] font-heading font-black text-[#088DC6] uppercase tracking-widest whitespace-nowrap leading-tight">Módulo Comercial</p>
                            <p className="text-[10px] font-body font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap leading-tight">Cotizador CINTE</p>
                        </div>
                    )}
                    <button
                        onClick={() => setSidebarOpen((o) => !o)}
                        title={sidebarOpen ? 'Colapsar menú' : 'Expandir menú'}
                        className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#04141E] hover:bg-[#088DC6]/20 border border-[#1a3a56] hover:border-[#088DC6]/50 text-slate-400 hover:text-[#088DC6] transition-all flex-shrink-0"
                    >
                        {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                    </button>
                </div>

                <nav className="flex flex-col gap-1 p-2 flex-1 mt-1">
                    <button
                        title={!sidebarOpen ? 'Cotizador' : undefined}
                        className={`flex items-center gap-3 rounded-xl transition-all font-body font-medium text-sm text-left ${sidebarOpen ? 'px-4 py-3' : 'px-0 py-3 justify-center'} bg-[#088DC6] shadow-[0_4px_12px_rgba(8,141,198,0.3)] text-white`}
                    >
                        <Calculator size={18} className="flex-shrink-0 text-white" />
                        {sidebarOpen && <span className="truncate whitespace-nowrap overflow-hidden transition-all duration-300">Cotizador</span>}
                    </button>
                </nav>

                <div className={`border-t border-[#1a3a56]/50 ${sidebarOpen ? 'p-4' : 'p-2'}`}>
                    {sidebarOpen ? (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-[#088DC6]/20 border border-[#088DC6]/30 flex items-center justify-center flex-shrink-0">
                                    <Code2 size={13} className="text-[#088DC6]" />
                                </div>
                                <div className="overflow-hidden">
                                    <p className="text-[10px] font-body font-black text-slate-300 whitespace-nowrap leading-tight truncate">{currentEmail}</p>
                                    <p className="text-[9px] text-[#088DC6] font-body font-semibold whitespace-nowrap leading-tight">{currentRoleLabel}</p>
                                </div>
                            </div>
                            <div className="border-t border-[#1a3a56]/50 pt-2 flex flex-col gap-2">
                                <button onClick={() => navigate('/perfil/cambiar-clave')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-[#1a3a56] text-slate-300 hover:text-white hover:bg-[#0f2942]/60 transition-all text-xs font-body font-semibold">
                                    <KeyRound size={14} />
                                    Cambiar contraseña
                                </button>
                                <button onClick={handleSidebarLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-500/30 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all text-xs font-body font-semibold">
                                    <LogOut size={14} />
                                    Cerrar sesión
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <button onClick={() => navigate('/perfil/cambiar-clave')} title="Cambiar contraseña" className="w-7 h-7 rounded-lg border border-[#1a3a56] text-slate-300 hover:text-white hover:bg-[#0f2942]/60 flex items-center justify-center transition-all">
                                <KeyRound size={13} />
                            </button>
                            <button onClick={handleSidebarLogout} title="Cerrar sesión" className="w-7 h-7 rounded-lg border border-rose-500/40 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center justify-center transition-all">
                                <LogOut size={13} />
                            </button>
                        </div>
                    )}
                </div>
            </aside>

            <section className="flex-1 min-w-0 h-full overflow-y-auto">
                <CotizadorPage token={token} embedded />
            </section>
        </div>
    );
}

