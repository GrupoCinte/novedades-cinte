import { motion, AnimatePresence } from 'framer-motion';
import { useModuleTheme } from '../../moduleTheme.js';
import { buildMonitorGlassModalTheme, monitorGlassModalSizeCls } from './monitorGlassModalTheme.js';

/**
 * Shell glass/cyber alineado con CandidateModal (En ingreso).
 * Reutilizable en onboarding y monitor n8n.
 */
export default function MonitorGlassModalShell({
    open = true,
    onClose,
    zClass = 'z-[160]',
    size = 'wide',
    disableBackdropClose = false,
    title,
    subtitle,
    avatarLetter,
    hero,
    headerActions,
    footer,
    compact = false,
    bodyClassName = 'p-6 overflow-y-auto custom-scrollbar flex-1 relative bg-transparent',
    children
}) {
    const { isLight } = useModuleTheme();
    const T = buildMonitorGlassModalTheme(isLight);
    const letter = avatarLetter ? String(avatarLetter).charAt(0).toUpperCase() : null;

    if (!open) return null;

    const handleBackdrop = () => {
        if (disableBackdropClose) return;
        if (typeof onClose === 'function') onClose();
    };

    return (
        <AnimatePresence>
            <div className={`fixed inset-0 ${zClass} flex items-center justify-center ${compact ? 'p-2 sm:p-4' : 'p-4 sm:p-6'} font-body`}>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`absolute inset-0 transition-opacity ${T.overlayCls}`}
                    onClick={handleBackdrop}
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ type: 'spring', duration: 0.5, bounce: 0.3 }}
                    className={`relative flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl ${monitorGlassModalSizeCls(size)} ${T.modalCls}`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className={`flex items-start justify-between ${compact ? 'px-4 py-2.5' : 'px-6 py-5'} ${T.headerCls}`}>
                        <div className={`flex min-w-0 flex-1 items-center ${compact ? 'gap-2.5' : 'gap-4'}`}>
                            {letter ? (
                                <div className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--color-cinte-primary)] to-[var(--color-cinte-turquesa)] text-white shadow-lg ${compact ? 'h-9 w-9' : 'h-14 w-14'}`}>
                                    <span className={`font-bold ${compact ? 'text-base' : 'text-2xl'}`}>{letter}</span>
                                </div>
                            ) : null}
                            <div className="min-w-0">
                                {title ? (
                                    <h2 className={`truncate font-bold tracking-tight font-heading ${T.textCls} ${compact ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl'}`}>
                                        {title}
                                    </h2>
                                ) : null}
                                {subtitle ? (
                                    <p className={`mt-1 flex items-center gap-2 truncate text-xs font-mono uppercase tracking-wider ${T.textMuted}`}>
                                        {subtitle}
                                    </p>
                                ) : null}
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            {headerActions}
                            {typeof onClose === 'function' ? (
                                <button type="button" onClick={onClose} className={T.closeBtnCls} aria-label="Cerrar">
                                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            ) : null}
                        </div>
                    </div>

                    {hero ? (
                        <div className={`flex flex-wrap items-center gap-4 border-b px-6 py-4 ${T.heroCls}`}>{hero}</div>
                    ) : null}

                    <div className={bodyClassName}>{children}</div>

                    {footer ? (
                        <div className={`flex flex-wrap items-center justify-end gap-3 px-6 py-4 ${T.footerCls}`}>{footer}</div>
                    ) : null}
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
