/** Título unificado del portal admin (misma cadena que `App.jsx` en rutas `/admin`). */
export const ADMIN_PORTAL_UNIFIED_TITLE = 'Sistema de Gestión Unificado';

const MODULE_PREFIXES = ['/admin/novedades', '/admin/conciliaciones', '/admin/comercial', '/admin/contratacion', '/admin/directorio'];

/**
 * Rutas que usan shell de módulo (sidebar propio): sin logo/título duplicado en el header global.
 */
export function pathIsAdminModuleShell(pathname) {
    const p = String(pathname || '');
    return MODULE_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/**
 * Marca CINTE + título del portal en el panel lateral. En rail colapsado solo logo compacto + acción.
 * @param {'rail-expanded' | 'rail-collapsed' | 'drawer'} variant
 */
export default function AdminModuleSidebarBrand({ variant, isLight, asideHeaderBorder, moduleContext, endAction }) {
    const logoSrc = isLight ? '/assets/logo-cinte-header-light.png' : '/assets/logo-cinte-header.png';
    const titleClass = isLight
        ? 'mt-1 font-heading font-extrabold uppercase tracking-wide text-[9px] sm:text-[10px] leading-tight text-[#004D87]'
        : 'mt-1 font-heading font-extrabold uppercase tracking-wide text-[9px] sm:text-[10px] leading-tight text-white';

    if (variant === 'rail-collapsed') {
        return (
            <div className={`flex shrink-0 flex-col items-center gap-2 px-2 py-3 ${asideHeaderBorder}`}>
                <div className={`flex items-center justify-center overflow-hidden rounded-md ${isLight ? 'h-10 w-10' : 'h-9 w-9'}`}>
                    <img
                        src={logoSrc}
                        alt="CINTE"
                        className={`max-h-full max-w-full object-contain object-center ${isLight ? 'h-9 w-9 scale-[1.08]' : 'h-8 w-8'}`}
                    />
                </div>
                {endAction}
            </div>
        );
    }

    return (
        <div className={`flex shrink-0 items-start justify-between gap-2 px-4 py-3 sm:px-5 ${asideHeaderBorder}`}>
            {/*
              En claro el logo lleva scale; sin overflow-hidden el bitmap “pintado” más ancho
              queda encima del chevron (mismo stacking) y bloquea el clic de colapsar.
            */}
            <div className="min-w-0 flex-1 overflow-hidden pr-1">
                <div className={`flex w-full max-w-[11.75rem] items-center justify-start overflow-hidden ${isLight ? 'h-11' : 'h-10'}`}>
                    <img
                        src={logoSrc}
                        alt="CINTE"
                        className={`h-full w-full max-h-full object-contain object-left ${
                            isLight ? 'origin-left scale-[1.44] sm:scale-[1.36]' : ''
                        }`}
                    />
                </div>
                <p className={titleClass}>{ADMIN_PORTAL_UNIFIED_TITLE}</p>
                {moduleContext ? <div className="mt-1.5 min-w-0 space-y-0.5">{moduleContext}</div> : null}
            </div>
            <div className="relative z-10 flex shrink-0 pt-0.5">{endAction}</div>
        </div>
    );
}
