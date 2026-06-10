import { useEffect } from 'react';
import { X } from 'lucide-react';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';
import { useModuleTheme } from '../../moduleTheme.js';

/**
 * Shell modal alineado con Gestión de Novedades / buildGestionTableDash.
 */
export default function GestionModalShell({
    open,
    onClose,
    title,
    subtitle,
    size = 'wide',
    titleSize = '2xl',
    footer,
    children,
    disableClose = false,
    zClass = 'z-50'
}) {
    const { isLight } = useModuleTheme();
    const dash = buildGestionTableDash(Boolean(isLight));

    useEffect(() => {
        if (!open || disableClose) return undefined;
        const handler = (e) => {
            if (e.key === 'Escape' && typeof onClose === 'function') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose, disableClose]);

    if (!open) return null;

    const cardCls = size === 'md' ? dash.modalCardMd : dash.modalCardWide;
    const titleCls = titleSize === 'lg' ? dash.titleLg : dash.title2xl;

    return (
        <div
            className={`${dash.modalBackdrop} ${zClass}`}
            onClick={(e) => {
                if (disableClose) return;
                if (e.target === e.currentTarget && typeof onClose === 'function') onClose();
            }}
            role="presentation"
        >
            <div
                className={cardCls}
                role="dialog"
                aria-modal="true"
                aria-labelledby="gestion-modal-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className={dash.modalHeadBorder}>
                    <div className="min-w-0 flex-1">
                        <h2 id="gestion-modal-title" className={`${titleCls} truncate`}>
                            {title}
                        </h2>
                        {subtitle ? (
                            <p className={`${dash.modalMuted} mt-1 text-sm leading-relaxed`}>{subtitle}</p>
                        ) : null}
                    </div>
                    {!disableClose ? (
                        <button
                            type="button"
                            onClick={onClose}
                            className={dash.modalClose}
                            aria-label="Cerrar"
                        >
                            <X size={18} />
                        </button>
                    ) : null}
                </div>
                <div className={`${dash.modalBodyScroll} px-1`}>{children}</div>
                {footer ? <div className={`${dash.modalFooter} px-1`}>{footer}</div> : null}
            </div>
        </div>
    );
}
