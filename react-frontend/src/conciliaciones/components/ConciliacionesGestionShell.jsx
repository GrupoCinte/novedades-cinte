import { useMemo } from 'react';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';

/**
 * Mismo contenedor que el tab «Gestión Operativa de Novedades» en Dashboard.jsx:
 * cardFlex + gestionHead (título + toolbar) + tableWrap + pie opcional.
 */
export default function ConciliacionesGestionShell({
    isLight,
    title,
    subtitle = null,
    toolbar = null,
    headerExtra = null,
    footer = null,
    children,
    className = '',
    /** Cabecera baja: título + filtros en menos altura (facturación). */
    compact = false,
    /** Solo card + tabla (como tab Gestión en Dashboard): sin título ni toolbar. */
    tableOnly = false
}) {
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);

    if (tableOnly) {
        return (
            <div className={`${dash.cardFlex} min-h-0 flex-1 ${className}`.trim()}>
                <div className={dash.tableWrap}>
                    <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">{children}</div>
                    {footer}
                </div>
            </div>
        );
    }

    if (compact) {
        return (
            <div className={`${dash.cardFlex} ${className}`.trim()}>
                <div className={`shrink-0 border-b p-4 ${dash.gestionHead}`}>
                    <h2 className={`${dash.titleXl} mb-3 font-heading md:mb-4`}>{title}</h2>
                    {toolbar ? (
                        <div className="mb-2 flex flex-col gap-2 md:gap-3">
                            <div className="flex flex-wrap items-center gap-2">{toolbar}</div>
                        </div>
                    ) : null}
                    {headerExtra ? <div className="mt-0">{headerExtra}</div> : null}
                </div>
                <div className={`${dash.tableWrap} min-h-0 flex-1`}>
                    <div className="h-full min-h-0 overflow-x-auto overflow-y-auto">{children}</div>
                    {footer}
                </div>
            </div>
        );
    }

    return (
        <div className={`${dash.cardFlex} ${className}`.trim()}>
            <div className={`sticky top-0 z-20 p-4 ${dash.gestionHead}`}>
                <h2 className={`${dash.titleXl} mb-3 font-heading md:mb-4`}>{title}</h2>
                {subtitle ? <p className={`-mt-2 mb-3 max-w-3xl font-body ${dash.mutedSm}`}>{subtitle}</p> : null}
                {toolbar ? (
                    <div className="mb-2 flex flex-col gap-2 md:gap-3">{toolbar}</div>
                ) : null}
                {headerExtra}
            </div>
            <div className={dash.tableWrap}>
                <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">{children}</div>
                {footer}
            </div>
        </div>
    );
}
