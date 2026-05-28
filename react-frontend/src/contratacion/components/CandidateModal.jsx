import { useModuleTheme } from '../../moduleTheme.js';
import { normalizeStatus } from '../hooks/useMonitorData';
import { motion, AnimatePresence } from 'framer-motion';

/** Si VITE_MASK_SENSITIVE_UI=true, enmascara email/tel/salario en pantalla (mismo modelo de datos). */
function formatDetailDisplay(key, value) {
    const mask = import.meta.env.VITE_MASK_SENSITIVE_UI === 'true';
    const raw = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
    if (!mask) return raw;
    const lk = String(key).toLowerCase();
    if (lk.includes('email')) {
        const at = raw.indexOf('@');
        if (at <= 1) return '••••';
        return `${raw[0]}•••••${raw.slice(at)}`;
    }
    if (lk.includes('telefono') || lk.includes('whatsapp') || lk.includes('celular') || lk.includes('phone') || lk.includes('numerico')) {
        const d = raw.replace(/\D/g, '');
        if (d.length < 4) return '••••';
        return `••••${d.slice(-4)}`;
    }
    if (lk.includes('salario') || lk.includes('direccion') || lk.includes('dirección')) return '••••';
    return raw;
}

export default function CandidateModal({ selectedUser, onClose }) {
    const { isLight } = useModuleTheme();

    if (!selectedUser) return null;

    const obsElim = selectedUser.fullData?.obs_eliminado;
    const isEliminado = normalizeStatus(selectedUser.realStatus) === 'eliminado' || Boolean(obsElim);
    
    // Extraer campos principales para el "Hero" y el resto para la cuadrícula
    const fullData = selectedUser.fullData || {};
    
    // Identificar email, teléfono y puesto dinámicamente basándonos en keys comunes
    const extractField = (keywords) => {
        const key = Object.keys(fullData).find(k => keywords.some(kw => k.toLowerCase().includes(kw)));
        return key ? { key, value: fullData[key] } : null;
    };

    const mainEmail = extractField(['email', 'correo']);
    const mainPhone = extractField(['whatsapp_numerico', 'whatsapp', 'telefono', 'celular']);
    const mainRole = extractField(['puesto', 'cargo', 'rol']);
    const mainName = extractField(['nombre_y_apellido', 'nombre y apellido', 'nombre'])?.value || selectedUser.workflowName;

    // Campos restantes (excluyendo los principales si queremos, pero por seguridad los mostramos todos abajo igual o los filtramos)
    const excludeKeys = [
        mainEmail?.key, mainPhone?.key, mainRole?.key, 'obs_eliminado', 
        'nombre_y_apellido', 'nombre y apellido'
    ].filter(Boolean);

    const detailEntries = Object.entries(fullData).filter(([k]) => !excludeKeys.includes(k));

    // Colores según tema
    const overlayCls = isLight ? 'bg-slate-900/40 backdrop-blur-sm' : 'bg-black/60 backdrop-blur-md';
    const modalCls = isLight 
        ? 'bg-white/95 backdrop-blur-xl border border-slate-200 shadow-2xl' 
        : 'bg-[#0a1520]/95 backdrop-blur-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)]';
    const headerCls = isLight ? 'border-b border-slate-200/60 bg-slate-50/50' : 'border-b border-white/5 bg-white/[0.02]';
    const textCls = isLight ? 'text-slate-800' : 'text-slate-100';
    const textMuted = isLight ? 'text-slate-500' : 'text-slate-400';
    const cardCls = isLight 
        ? 'bg-white/80 border border-slate-200 hover:border-blue-400/50 hover:bg-blue-50' 
        : 'bg-white/[0.03] border border-white/5 hover:border-[#14ffec]/30 hover:bg-[#14ffec]/[0.02]';

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[160] flex items-center justify-center p-4 sm:p-6 font-body">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`absolute inset-0 transition-opacity ${overlayCls}`}
                    onClick={onClose}
                />
                
                <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
                    className={`relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl ${modalCls}`}
                >
                    {/* Header Principal */}
                    <div className={`flex items-start justify-between px-6 py-5 ${headerCls}`}>
                        <div className="flex items-center gap-4">
                            <div className={`flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--color-cinte-primary)] to-[var(--color-cinte-turquesa)] text-white shadow-lg`}>
                                <span className="text-2xl font-bold">{String(mainName).charAt(0).toUpperCase()}</span>
                            </div>
                            <div>
                                <h2 className={`text-xl sm:text-2xl font-bold tracking-tight ${textCls} font-heading`}>{mainName}</h2>
                                <p className={`mt-1 flex items-center gap-2 text-xs font-mono uppercase tracking-wider ${textMuted}`}>
                                    <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                    </svg>
                                    ID: {selectedUser.executionId}
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className={`rounded-full p-2 transition-all ${isLight ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-white/10 text-slate-400'}`}
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Barra de Estado y Datos Hero */}
                    <div className={`px-6 py-4 border-b flex flex-wrap items-center gap-6 ${isLight ? 'border-slate-200/60 bg-slate-100/50' : 'border-white/5 bg-black/20'}`}>
                        {/* Estado */}
                        <div className="flex items-center gap-3 min-w-fit">
                            <div className="relative flex h-3.5 w-3.5">
                                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                                    selectedUser.realStatus === 'finalizado' ? 'bg-[#4f8831]' :
                                    selectedUser.realStatus === 'contactado' ? 'bg-[#004D87]' :
                                    'bg-[#f59e0b]'
                                }`}></span>
                                <span className={`relative inline-flex h-3.5 w-3.5 rounded-full ${
                                    selectedUser.realStatus === 'finalizado' ? 'bg-[#4f8831]' :
                                    selectedUser.realStatus === 'contactado' ? 'bg-[#004D87]' :
                                    'bg-[#f59e0b]'
                                }`}></span>
                            </div>
                            <span className={`text-[11px] font-bold uppercase tracking-widest ${
                                selectedUser.realStatus === 'finalizado' ? (isLight ? 'text-[#4f8831]' : 'text-[#4f8831]') :
                                selectedUser.realStatus === 'contactado' ? (isLight ? 'text-[#004D87]' : 'text-[#65BCF7]') :
                                (isLight ? 'text-[#f59e0b]' : 'text-[#f59e0b]')
                            }`}>
                                {selectedUser.realStatus || 'Sin Estado'}
                            </span>
                        </div>

                        {/* Divider */}
                        <div className={`hidden sm:block w-px h-6 ${isLight ? 'bg-slate-300' : 'bg-slate-700'}`}></div>

                        {/* Hero Data */}
                        <div className="flex flex-wrap gap-5 flex-1">
                            {mainRole && (
                                <div className={`flex items-center gap-2 text-sm font-medium ${textCls}`}>
                                    <svg className="w-4 h-4 text-[var(--color-cinte-turquesa)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    {mainRole.value}
                                </div>
                            )}
                            {mainEmail && (
                                <div className={`flex items-center gap-2 text-sm ${textMuted}`}>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    {formatDetailDisplay(mainEmail.key, mainEmail.value)}
                                </div>
                            )}
                            {mainPhone && (
                                <div className={`flex items-center gap-2 text-sm ${textMuted}`}>
                                    <svg className="w-4 h-4 text-[var(--color-cinte-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                    </svg>
                                    {formatDetailDisplay(mainPhone.key, mainPhone.value)}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Cuerpo (Scroll) */}
                    <div className="p-6 overflow-y-auto custom-scrollbar flex-1 relative bg-transparent">
                        {isEliminado && obsElim && (
                            <div className="mb-6 flex items-start gap-3 rounded-xl border border-[var(--color-cinte-red)]/40 bg-[var(--color-cinte-red)]/10 p-4">
                                <svg className="w-5 h-5 text-[var(--color-cinte-red)] mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-cinte-red)]">Motivo de eliminación</p>
                                    <p className={`mt-1 text-sm leading-relaxed ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>{obsElim}</p>
                                </div>
                            </div>
                        )}

                        <div className="mb-4">
                            <h3 className={`text-[10px] font-bold uppercase tracking-widest ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>Toda la Información Adicional</h3>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {detailEntries.length > 0 ? (
                                detailEntries.map(([key, value]) => {
                                    const isDate = key.toLowerCase().includes('ts_') || key.toLowerCase().includes('fecha');
                                    return (
                                        <div key={key} className={`group rounded-xl p-4 transition-all duration-300 ${cardCls}`}>
                                            <div className={`mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${isLight ? 'text-[var(--color-cinte-turquesa)]' : 'text-[var(--color-cinte-cyan)]'}`}>
                                                {isDate ? (
                                                    <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                ) : (
                                                    <svg className="w-3.5 h-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                )}
                                                {key.replace(/_/g, ' ')}
                                            </div>
                                            <div className={`break-words text-sm font-medium leading-relaxed ${textCls} ${isDate ? 'font-mono text-xs' : ''}`}>
                                                {formatDetailDisplay(key, value)}
                                            </div>
                                        </div>
                                    )
                                })
                            ) : (
                                <div className="col-span-full rounded-xl border border-dashed border-slate-500/30 p-8 text-center">
                                    <p className={`text-sm italic ${textMuted}`}>No hay más detalles disponibles para este candidato.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
