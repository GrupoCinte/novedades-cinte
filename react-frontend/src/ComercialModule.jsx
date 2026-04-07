import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Code2, KeyRound, LogOut, Menu, X, Calculator } from 'lucide-react';
import CotizadorPage from './cotizador/CotizadorPage';

export default function ComercialModule({ token, onLogout }) {
    const navigate = useNavigate();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const authFromStorage = (() => {
        try {
            return JSON.parse(localStorage.getItem('cinteAuth') || 'null');
        } catch {
            return null;
        }
    })();
    const currentEmail = String(authFromStorage?.user?.email || authFromStorage?.claims?.email || 'sin-correo').toLowerCase();
    const currentRoleLabel = String(authFromStorage?.user?.role || authFromStorage?.claims?.role || 'sin_rol').replace(/_/g, ' ').toUpperCase();

    const handleSidebarLogout = () => {
        if (onLogout) {
            onLogout();
            return;
        }
        localStorage.removeItem('cinteAuth');
        navigate('/admin', { replace: true });
    };

    return (
        <div className="flex h-full w-full bg-[#0f172a] text-slate-200 overflow-hidden font-sans">
            <button
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden fixed top-24 left-4 z-40 w-10 h-10 rounded-lg bg-[#1e293b] border border-slate-700 text-slate-200 flex items-center justify-center shadow-lg"
                aria-label="Abrir menú comercial"
            >
                <Menu size={18} />
            </button>
            {mobileMenuOpen && (
                <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileMenuOpen(false)} />
            )}
            <aside className={`md:hidden fixed top-0 left-0 h-full w-72 bg-[#1e293b] border-r border-slate-700/50 z-50 shadow-2xl transform transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Módulo Comercial</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cotizador CINTE</p>
                    </div>
                    <button onClick={() => setMobileMenuOpen(false)} className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center" aria-label="Cerrar menú">
                        <X size={16} />
                    </button>
                </div>
                <nav className="p-3 flex flex-col gap-2">
                    <button className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold bg-emerald-600 text-white">
                        <Calculator size={17} />
                        <span>Cotizador</span>
                    </button>
                </nav>
                <div className="mt-auto p-4 border-t border-slate-700/50">
                    <p className="text-[10px] font-black text-slate-300 truncate">{currentEmail}</p>
                    <p className="text-[10px] text-emerald-400 font-semibold uppercase">{currentRoleLabel}</p>
                    <div className="mt-3 flex flex-col gap-2">
                        <button onClick={() => navigate('/perfil/cambiar-clave')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-700/60 transition-all text-xs font-semibold">
                            <KeyRound size={14} />
                            Cambiar contraseña
                        </button>
                        <button onClick={handleSidebarLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-all text-xs font-semibold">
                            <LogOut size={14} />
                            Cerrar sesión
                        </button>
                    </div>
                </div>
            </aside>

            <aside className={`bg-[#1e293b] flex-shrink-0 flex-col hidden md:flex h-full shadow-2xl relative z-10 transition-all duration-300 ease-in-out overflow-hidden ${sidebarOpen ? 'w-64' : 'w-16'}`}>
                <div className={`border-b border-slate-700/50 flex items-center ${sidebarOpen ? 'px-5 py-4 justify-between' : 'px-0 py-4 justify-center'}`}>
                    {sidebarOpen && (
                        <div className="overflow-hidden">
                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest whitespace-nowrap leading-tight">Módulo Comercial</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap leading-tight">Cotizador CINTE</p>
                        </div>
                    )}
                    <button
                        onClick={() => setSidebarOpen((o) => !o)}
                        title={sidebarOpen ? 'Colapsar menú' : 'Expandir menú'}
                        className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-800 hover:bg-emerald-600/20 border border-slate-700 hover:border-emerald-500/50 text-slate-400 hover:text-emerald-400 transition-all flex-shrink-0"
                    >
                        {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                    </button>
                </div>

                <nav className="flex flex-col gap-1 p-2 flex-1 mt-1">
                    <button
                        title={!sidebarOpen ? 'Cotizador' : undefined}
                        className={`flex items-center gap-3 rounded-xl transition-all font-medium text-sm text-left ${sidebarOpen ? 'px-4 py-3' : 'px-0 py-3 justify-center'} bg-emerald-600 shadow-[0_4px_12px_rgba(16,185,129,0.3)] text-white`}
                    >
                        <Calculator size={18} className="flex-shrink-0 text-white" />
                        {sidebarOpen && <span className="truncate whitespace-nowrap overflow-hidden transition-all duration-300">Cotizador</span>}
                    </button>
                </nav>

                <div className={`border-t border-slate-700/50 ${sidebarOpen ? 'p-4' : 'p-2'}`}>
                    {sidebarOpen ? (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                                    <Code2 size={13} className="text-emerald-400" />
                                </div>
                                <div className="overflow-hidden">
                                    <p className="text-[10px] font-black text-slate-300 whitespace-nowrap leading-tight truncate">{currentEmail}</p>
                                    <p className="text-[9px] text-emerald-400 font-semibold whitespace-nowrap leading-tight">{currentRoleLabel}</p>
                                </div>
                            </div>
                            <div className="border-t border-slate-700/50 pt-2 flex flex-col gap-2">
                                <button onClick={() => navigate('/perfil/cambiar-clave')} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700/60 transition-all text-xs font-semibold">
                                    <KeyRound size={14} />
                                    Cambiar contraseña
                                </button>
                                <button onClick={handleSidebarLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-500/30 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all text-xs font-semibold">
                                    <LogOut size={14} />
                                    Cerrar sesión
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <button onClick={() => navigate('/perfil/cambiar-clave')} title="Cambiar contraseña" className="w-7 h-7 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700/60 flex items-center justify-center transition-all">
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

