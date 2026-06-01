import { useMemo } from 'react';
import { Scale } from 'lucide-react';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';

/**
 * Cabecera de página alineada con el bloque filterBar / título de Dashboard (Novedades).
 */
export default function ConciliacionesPageHeader({
    isLight,
    title,
    description,
    icon: Icon = Scale,
    children,
    /** Sin tarjeta externa: cabecera dentro de un panel unificado (p. ej. facturación). */
    embedded = false
}) {
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const borderClass = isLight ? 'border-slate-200' : 'border-slate-700/50';

    const inner = (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center gap-2">
                    <Icon size={16} className="shrink-0 text-[#65BCF7]" aria-hidden />
                    <span className={dash.labelUpper}>Conciliaciones</span>
                </div>
                <h1 className={`font-heading tracking-tight ${dash.titleXl}`}>{title}</h1>
                {description ? <p className={`mt-1 max-w-2xl font-body ${dash.mutedSm}`}>{description}</p> : null}
            </div>
            {children ? <div className="flex flex-wrap items-end gap-3">{children}</div> : null}
        </div>
    );

    if (embedded) {
        return <div className={`border-b pb-4 ${borderClass}`}>{inner}</div>;
    }

    return <header className={dash.filterBar}>{inner}</header>;
}
