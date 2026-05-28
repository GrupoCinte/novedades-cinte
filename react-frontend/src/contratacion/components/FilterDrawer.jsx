import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useModuleTheme } from '../../moduleTheme.js';
import { SlidersHorizontal, X } from 'lucide-react';

/**
 * FilterDrawer — panel lateral de filtros.
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - activeCount: number  (cuántos filtros están activos)
 *  - onClear: () => void
 *  - children: contenido del drawer (controles)
 */
export function FilterDrawerTrigger({ onClick, activeCount, isLight }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`
                relative flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold
                transition-all duration-200 cursor-pointer select-none
                ${isLight
                    ? 'bg-white/80 border-slate-200 text-slate-700 hover:border-[var(--color-cinte-primary)] hover:text-[var(--color-cinte-primary)] shadow-sm'
                    : 'bg-white/[0.05] border-white/10 text-slate-300 hover:border-[var(--color-cinte-cyan)]/60 hover:text-[var(--color-cinte-cyan)] hover:bg-[var(--color-cinte-cyan)]/5'
                }
            `}
        >
            <SlidersHorizontal size={16} className="shrink-0" />
            <span>Filtros</span>
            {activeCount > 0 && (
                <span className={`
                    absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center
                    rounded-full text-[10px] font-bold text-white
                    bg-[var(--color-cinte-primary)]
                    shadow-[0_0_8px_rgba(0,77,135,0.5)]
                `}>
                    {activeCount}
                </span>
            )}
        </button>
    );
}

export default function FilterDrawer({ open, onClose, activeCount = 0, onClear, children }) {
    const { isLight } = useModuleTheme();

    // Cerrar con Escape
    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    // Bloquear scroll del body mientras está abierto
    useEffect(() => {
        document.body.style.overflow = open ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [open]);

    const drawerBg = isLight
        ? 'bg-white/95 backdrop-blur-2xl border-l border-slate-200/60 shadow-2xl'
        : 'bg-[#0b1a2a]/95 backdrop-blur-2xl border-l border-white/10 shadow-[0_0_60px_rgba(0,0,0,0.6)]';

    const headerBg = isLight
        ? 'border-b border-slate-200/60 bg-slate-50/80'
        : 'border-b border-white/5 bg-white/[0.02]';

    const textCls = isLight ? 'text-slate-800' : 'text-slate-100';
    const textMuted = isLight ? 'text-slate-500' : 'text-slate-400';

    const clearBtn = isLight
        ? 'flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-100'
        : 'flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-400 transition hover:bg-rose-500/15';

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop con blur */}
                    <motion.div
                        key="fd-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[200] bg-black/30 backdrop-blur-[3px]"
                        aria-hidden="true"
                    />

                    {/* Panel lateral */}
                    <motion.aside
                        key="fd-panel"
                        initial={{ x: '100%', opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: '100%', opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 340, damping: 34, mass: 0.8 }}
                        className={`fixed right-0 top-0 bottom-0 z-[210] flex w-[340px] max-w-[90vw] flex-col ${drawerBg}`}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Panel de filtros"
                    >
                        {/* Header del drawer */}
                        <div className={`flex items-center justify-between px-5 py-4 ${headerBg}`}>
                            <div className="flex items-center gap-3">
                                <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-cinte-primary)]/10`}>
                                    <SlidersHorizontal size={16} className="text-[var(--color-cinte-turquesa)]" />
                                </div>
                                <div>
                                    <h3 className={`text-sm font-bold ${textCls} font-heading`}>
                                        Filtros
                                    </h3>
                                    {activeCount > 0 && (
                                        <p className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? 'text-[var(--color-cinte-turquesa)]' : 'text-[var(--color-cinte-cyan)]'}`}>
                                            {activeCount} activo{activeCount > 1 ? 's' : ''}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {activeCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={onClear}
                                        className={clearBtn}
                                    >
                                        <X size={12} />
                                        Limpiar
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className={`rounded-lg p-1.5 transition ${isLight ? 'text-slate-500 hover:bg-slate-200 hover:text-slate-800' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
                                    aria-label="Cerrar filtros"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Separador decorativo */}
                        <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--color-cinte-turquesa)]/30 to-transparent" />

                        {/* Cuerpo con scroll */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-6">
                            {children}
                        </div>

                        {/* Footer del drawer */}
                        <div className={`px-5 py-4 border-t ${isLight ? 'border-slate-200/60 bg-slate-50/60' : 'border-white/5 bg-black/20'}`}>
                            <p className={`text-center text-[10px] uppercase tracking-widest font-semibold ${textMuted}`}>
                                Capital Humano · Contratación
                            </p>
                        </div>
                    </motion.aside>
                </>
            )}
        </AnimatePresence>
    );
}

/**
 * Sección de grupo de filtros dentro del drawer.
 */
export function FilterSection({ title, children, isLight }) {
    return (
        <div className="space-y-3">
            <p className={`text-[10px] font-bold uppercase tracking-widest ${isLight ? 'text-[var(--color-cinte-turquesa)]' : 'text-[var(--color-cinte-cyan)]'}`}>
                {title}
            </p>
            {children}
        </div>
    );
}
