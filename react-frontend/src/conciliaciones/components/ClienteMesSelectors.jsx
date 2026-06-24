import { useMemo, useState } from 'react';
import { Filter, ChevronDown, ChevronUp, X, RefreshCw } from 'lucide-react';
import { useModuleTheme } from '../../moduleTheme.js';
import { buildGestionTableDash, GESTION_SEARCH_FIELD_WIDTH } from '../../gestionTableDashTheme.js';

const fieldCompact = (field) => `${field} min-w-[10rem] max-w-[22rem] cursor-pointer text-sm`;

/**
 * @param {'default' | 'gestion' | 'embedded'} variant
 * - default: tarjeta filterBar independiente
 * - gestion: fila compacta en cabecera de facturación (como Dashboard Gestión)
 * - embedded: separador dentro de panel legacy
 */
export default function ClienteMesSelectors({
    clientes,
    clienteValue,
    onClienteChange,
    monthValue,
    onMonthChange,
    field,
    labelMuted: _labelMuted,
    variant = 'default',
    /** Menos padding y etiquetas (facturación compacta). */
    dense = false,
    /** Mostrar la opción "Todos / seleccionar" en el select de cliente. */
    allowTodos = true,
    /** Ocultar selector de cliente (p. ej. workspace con servicio ya elegido). */
    hideClienteSelector = false,
    /** Mes visible en la barra principal (sin abrir drawer). */
    showMonthInline = false,
    /** Ocultar filtro de estado en drawer (cuando las pills ya filtran). */
    omitEstadoFilter = false,
    /** Contenido a la izquierda del mes (p. ej. título workspace + volver). */
    leadingContent = null,
    trailingActions = null,

    isFacturacion = false,
    fSearch = '',
    onSearchChange = () => {},
    fEstado = '',
    onEstadoChange = () => {},
    fCerrado = 'TODOS',
    onCerradoChange = () => {},
    fProyecto = '',
    onProyectoChange = () => {},
    fNovedades = 'TODOS',
    onNovedadesChange = () => {},
    onResetFilters = () => {}
}) {
    const [isOpen, setIsOpen] = useState(false);
    const { isLight } = useModuleTheme();
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);

    /** Búsqueda y filtros avanzados en toda la vista de facturación (todos o un cliente). */
    const facturacionFiltersOn = Boolean(isFacturacion);

    const drawerExtrasCount = useMemo(() => {
        if (!facturacionFiltersOn) return 0;
        let c = 0;
        if (!omitEstadoFilter && fEstado) c += 1;
        if (fCerrado !== 'TODOS') c += 1;
        if (fProyecto) c += 1;
        if (fNovedades !== 'TODOS') c += 1;
        return c;
    }, [facturacionFiltersOn, omitEstadoFilter, fEstado, fCerrado, fProyecto, fNovedades]);

    const filtrosBtnClass = dense
        ? isLight
            ? 'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#2F7BB8]/35 bg-[#2F7BB8]/10 px-2 py-1 text-xs font-semibold text-[#004D87] shadow-sm hover:bg-[#2F7BB8]/15'
            : 'inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#65BCF7]/40 bg-[#2F7BB8]/15 px-2 py-1 text-xs font-semibold text-[#65BCF7] shadow-sm hover:bg-[#2F7BB8]/25'
        : dash.filtrosAvanzadosBtn;

    const filterRow = (
        <div className="flex flex-wrap items-center gap-2">
            {leadingContent}

            {facturacionFiltersOn ? (
                <button
                    type="button"
                    id="conciliaciones-filtros-avanzados-toggle"
                    aria-expanded={isOpen}
                    aria-controls="conciliaciones-filtros-avanzados-panel"
                    onClick={() => setIsOpen((o) => !o)}
                    className={filtrosBtnClass}
                    title={dense ? 'Filtros avanzados' : undefined}
                >
                    <Filter size={dense ? 14 : 16} className="shrink-0 opacity-90" aria-hidden />
                    <span className={dense ? 'sr-only sm:not-sr-only sm:inline' : ''}>{dense ? 'Filtros' : 'Filtros avanzados'}</span>
                    {drawerExtrasCount > 0 ? (
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#2F7BB8] text-[10px] font-bold text-white">
                            {drawerExtrasCount}
                        </span>
                    ) : null}
                    {isOpen ? (
                        <ChevronUp size={18} className="shrink-0 opacity-90" aria-hidden />
                    ) : (
                        <ChevronDown size={18} className="shrink-0 opacity-90" aria-hidden />
                    )}
                </button>
            ) : null}

            {showMonthInline ? (
                <div className="flex items-center gap-1.5">
                    {!dense ? (
                        <label htmlFor="conciliaciones-page-mes" className={`${dash.labelFilter} whitespace-nowrap`}>
                            Mes
                        </label>
                    ) : null}
                    <input
                        id="conciliaciones-page-mes"
                        type="month"
                        className={`${fieldCompact(field)} cinte-month-picker`}
                        value={monthValue}
                        onChange={(e) => onMonthChange(e.target.value)}
                        aria-label="Mes de facturación"
                    />
                </div>
            ) : null}

            {!hideClienteSelector ? (
                <div className="flex items-center gap-1.5">
                    {!dense ? (
                        <label htmlFor="conciliaciones-page-cliente" className={`${dash.labelFilter} whitespace-nowrap`}>
                            Cliente
                        </label>
                    ) : null}
                    <select
                        id="conciliaciones-page-cliente"
                        className={fieldCompact(field)}
                        value={clienteValue}
                        onChange={(e) => onClienteChange(e.target.value)}
                        aria-label="Cliente"
                    >
                        {allowTodos ? (
                            <option value="">{dense ? 'Todos…' : 'Todos / seleccionar'}</option>
                        ) : null}
                        {clientes.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>
                </div>
            ) : null}

            {facturacionFiltersOn ? (
                <input
                    type="search"
                    enterKeyHint="search"
                    placeholder="Buscar por nombre..."
                    value={fSearch}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className={`${field} ${GESTION_SEARCH_FIELD_WIDTH}`}
                    aria-label="Buscar por nombre o cédula"
                />
            ) : null}

            {trailingActions}
        </div>
    );

    const drawer = isOpen ? (
        <>
            <div className={dash.filtrosDrawerBackdrop} onClick={() => setIsOpen(false)} aria-hidden="true" />
            <aside
                role="dialog"
                aria-modal="true"
                aria-labelledby="conciliaciones-filtros-drawer-title"
                className={dash.filtrosDrawerPanel}
                id="conciliaciones-filtros-avanzados-panel"
            >
                <header className={dash.filtrosDrawerHeader}>
                    <h3 id="conciliaciones-filtros-drawer-title" className={dash.titleLg}>
                        Filtros avanzados
                    </h3>
                    <button type="button" onClick={() => setIsOpen(false)} aria-label="Cerrar filtros avanzados" className={dash.modalClose}>
                        <X size={18} />
                    </button>
                </header>

                <div className={dash.filtrosDrawerBody}>
                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="conciliaciones-drawer-mes" className={dash.filtrosDrawerLabel}>
                            Mes de facturación
                        </label>
                        <input
                            id="conciliaciones-drawer-mes"
                            type="month"
                            className={`${field} cinte-month-picker w-full text-sm`}
                            value={monthValue}
                            onChange={(e) => onMonthChange(e.target.value)}
                        />
                    </div>

                    {facturacionFiltersOn ? (
                        <>
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="conciliaciones-drawer-proyecto" className={dash.filtrosDrawerLabel}>
                                    Proyecto asignado
                                </label>
                                <input
                                    id="conciliaciones-drawer-proyecto"
                                    type="search"
                                    placeholder="Buscar por proyecto…"
                                    className={`${field} w-full text-sm`}
                                    value={fProyecto}
                                    onChange={(e) => onProyectoChange(e.target.value)}
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="conciliaciones-drawer-cierre" className={dash.filtrosDrawerLabel}>
                                    Estado de cierre
                                </label>
                                <select
                                    id="conciliaciones-drawer-cierre"
                                    className={`${field} w-full text-sm`}
                                    value={fCerrado}
                                    onChange={(e) => onCerradoChange(e.target.value)}
                                >
                                    <option value="TODOS">Todos los colaboradores</option>
                                    <option value="PENDIENTE">Abierto (pendiente de cierre)</option>
                                    <option value="CERRADO">Cerrado (listo para facturar)</option>
                                </select>
                            </div>
                            {!omitEstadoFilter ? (
                                <div className="flex flex-col gap-1.5">
                                    <label htmlFor="conciliaciones-drawer-estado" className={dash.filtrosDrawerLabel}>
                                        Estado de conciliación
                                    </label>
                                    <select
                                        id="conciliaciones-drawer-estado"
                                        className={`${field} w-full text-sm`}
                                        value={fEstado}
                                        onChange={(e) => onEstadoChange(e.target.value)}
                                    >
                                        <option value="">Todos los estados</option>
                                        <option value="PENDIENTE">Pendiente</option>
                                        <option value="APROBADO_ANALISTA">Aprobado Analista</option>
                                        <option value="APROBADO_FINANZAS">Aprobado Finanzas</option>
                                        <option value="DEVUELTA">Devuelta</option>
                                        <option value="CONCILIADA">Conciliada</option>
                                    </select>
                                </div>
                            ) : null}
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="conciliaciones-drawer-novedades" className={dash.filtrosDrawerLabel}>
                                    Deducciones por novedades
                                </label>
                                <select
                                    id="conciliaciones-drawer-novedades"
                                    className={`${field} w-full text-sm`}
                                    value={fNovedades}
                                    onChange={(e) => onNovedadesChange(e.target.value)}
                                >
                                    <option value="TODOS">Todos</option>
                                    <option value="CON_NOVEDADES">Con novedades aprobadas</option>
                                    <option value="SIN_NOVEDADES">Sin novedades (tarifa neta)</option>
                                </select>
                            </div>
                        </>
                    ) : null}
                </div>

                <footer className={dash.filtrosDrawerFooter}>
                    {facturacionFiltersOn && (drawerExtrasCount > 0 || fSearch || fProyecto) ? (
                        <button
                            type="button"
                            onClick={() => {
                                onResetFilters();
                                setIsOpen(false);
                            }}
                            className={`${dash.borrarFiltros} inline-flex items-center gap-1.5`}
                        >
                            <RefreshCw size={14} aria-hidden />
                            Limpiar
                        </button>
                    ) : (
                        <span />
                    )}
                    <button type="button" onClick={() => setIsOpen(false)} className={dash.filtrosDrawerCta}>
                        Aplicar filtros
                    </button>
                </footer>
            </aside>
        </>
    ) : null;

    if (variant === 'gestion') {
        return (
            <>
                <div className="mb-2 flex flex-col gap-2 md:gap-3">
                    {filterRow}
                </div>
                {drawer}
            </>
        );
    }

    const barShellClass =
        variant === 'embedded'
            ? `border-b py-4 ${isLight ? 'border-slate-200' : 'border-slate-700/50'}`
            : dash.filterBar;

    return (
        <>
            <div className={barShellClass}>
                <div className="flex flex-col gap-2 md:gap-3">{filterRow}</div>
            </div>
            {drawer}
        </>
    );
}
