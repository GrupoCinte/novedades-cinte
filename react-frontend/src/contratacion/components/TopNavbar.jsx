import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Home, Users, History, BarChart3, 
    ChevronDown, User, LogOut, Settings, 
    Sun, Moon, Bot, Sparkles, Cpu, Zap
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUiTheme } from '../../UiThemeContext.jsx';
import CyberNavButton from './CyberNavButton';

export default function TopNavbar({ auth, onLogout, currentView, onNavigate, onOpenAi }) {
    const navigate = useNavigate();
    const { theme, toggleTheme } = useUiTheme();
    const isLight = theme === 'light';
    const [hoveredTab, setHoveredTab] = useState(null);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 10);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);



    const currentEmail = String(auth?.user?.email || auth?.claims?.email || 'usuario@cinte.com').toLowerCase();
    const currentRole = String(auth?.user?.role || auth?.claims?.role || 'ADMIN').replace(/_/g, ' ').toUpperCase();

    const glassClass = isLight
        ? 'bg-white/90 border-slate-200/80 text-slate-800'
        : 'bg-[#04141E]/90 border-blue-500/20 text-slate-100';

    const tabInactiveClass = isLight ? 'text-slate-500 hover:text-slate-900' : 'text-slate-400 hover:text-white';

    return (
        <nav className={`sticky top-0 z-50 flex h-14 w-full items-center justify-between px-6 border-b backdrop-blur-3xl transition-all duration-700 ${glassClass} ${scrolled ? 'shadow-2xl' : ''}`}>
            {/* Cyber Glow Effect */}
            {!isLight && (
                <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
                    <motion.div 
                        animate={{ 
                            x: [0, 10, 0],
                            opacity: [0.3, 0.6, 0.3]
                        }}
                        transition={{ duration: 5, repeat: Infinity }}
                        className="absolute -top-[100%] left-[20%] h-[200%] w-[1px] bg-gradient-to-b from-transparent via-blue-500/40 to-transparent rotate-45" 
                    />
                    <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-400/30 to-transparent" />
                </div>
            )}

            {/* Logo y Branding */}
            <div className="flex items-center gap-6">
                <div className="flex items-center gap-3 cursor-pointer group" onClick={() => navigate('/admin')}>
                    <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#2F7BB8] to-[#65BCF7] shadow-[0_0_15px_rgba(47,123,184,0.4)] group-hover:scale-110 transition-transform duration-300">
                        <Zap size={16} className="text-white fill-white/20" />
                    </div>
                    <div className="hidden md:block">
                        <h1 className="text-[9px] font-heading font-black uppercase tracking-[0.3em] text-[#2F7BB8] dark:text-[#65BCF7] flex items-center gap-2">
                            <span>Capital Humano</span>
                            <span className="h-1 w-1 rounded-full bg-emerald-500 animate-pulse" />
                        </h1>
                        <p className="text-[8px] font-body font-bold opacity-40 uppercase tracking-tighter">System Core v2.5</p>
                    </div>
                </div>

                <div className="h-4 w-[1px] bg-slate-500/20 mx-1 hidden lg:block" />
            </div>

            {/* Acciones Derecha */}
            <div className="flex items-center gap-3">
                {/* AI Button - Neural Pulse Effect */}
                <button
                    onClick={onOpenAi}
                    className={`group relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-500 ${
                        isLight ? 'bg-white border-slate-200 text-slate-600 hover:border-sky-400 hover:text-sky-600 shadow-sm' 
                                : 'bg-[#0B1E30]/60 border-blue-500/30 text-[#65BCF7] hover:border-blue-400 hover:shadow-[0_0_20px_rgba(101,188,247,0.3)]'
                    }`}
                >
                    <Bot size={18} className="group-hover:scale-110 transition-transform" />
                    <div className="absolute inset-0 rounded-xl border border-sky-400/0 group-hover:border-sky-400/50 group-hover:animate-pulse" />
                </button>

                {/* Theme Toggle - Solaris style */}
                <button
                    onClick={toggleTheme}
                    className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-300 ${
                        isLight ? 'bg-white border-slate-200 text-amber-500 hover:bg-slate-50' 
                                : 'bg-[#0B1E30]/60 border-blue-500/30 text-blue-300 hover:text-white hover:bg-blue-500/10'
                    }`}
                >
                    {isLight ? <Moon size={18} /> : <Sun size={18} />}
                </button>

                <div className="h-6 w-[1px] bg-slate-500/20 mx-1" />

                {/* Perfil de Usuario - BioMetric style */}
                <div className="relative">
                    <button
                        onClick={() => setUserMenuOpen(!userMenuOpen)}
                        className={`flex items-center gap-3 p-1 rounded-lg border transition-all duration-300 ${
                            isLight ? 'bg-slate-50 border-slate-200 hover:bg-white' : 'bg-[#0B1E30]/60 border-blue-500/20 hover:border-blue-500/40'
                        }`}
                    >
                        <div className="text-right hidden xl:block pl-2">
                            <p className="text-[10px] font-black leading-tight truncate max-w-[90px] tracking-tight">{currentEmail}</p>
                            <div className="flex items-center justify-end gap-1">
                                <span className="h-1 w-1 rounded-full bg-blue-500" />
                                <p className="text-[8px] font-black uppercase text-[#2F7BB8] dark:text-[#65BCF7]">{currentRole}</p>
                            </div>
                        </div>
                        <div className="relative flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-slate-500/10 to-transparent border border-white/5">
                            <User size={16} className="text-slate-400 group-hover:text-white transition-colors" />
                            <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500 border-2 border-[#04141E]" />
                        </div>
                    </button>

                    <AnimatePresence>
                        {userMenuOpen && (
                            <motion.div
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                className={`absolute right-0 top-full mt-2 w-48 rounded-xl border p-1.5 shadow-2xl backdrop-blur-3xl overflow-hidden ${
                                    isLight ? 'bg-white/95 border-slate-200' : 'bg-[#04141E]/95 border-blue-500/20 text-white'
                                }`}
                            >
                                <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
                                <div className="px-3 py-1.5 mb-1 opacity-40">
                                    <p className="text-[8px] font-black uppercase tracking-[0.2em]">Access Level</p>
                                </div>
                                <button className="flex w-full items-center gap-3 px-3 py-2 text-[11px] font-bold rounded-lg hover:bg-white/5 transition-all group">
                                    <Settings size={13} className="group-hover:rotate-90 transition-transform duration-500 opacity-60" />
                                    <span>System Config</span>
                                </button>
                                <div className="h-[1px] bg-white/5 my-1" />
                                <button 
                                    onClick={onLogout}
                                    className="flex w-full items-center gap-3 px-3 py-2 text-[11px] font-bold rounded-lg text-rose-400 hover:bg-rose-500/10 transition-all"
                                >
                                    <LogOut size={13} />
                                    <span>Terminate Session</span>
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Glowing Bottom Line */}
            <motion.div 
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" 
            />
        </nav>
    );
}
