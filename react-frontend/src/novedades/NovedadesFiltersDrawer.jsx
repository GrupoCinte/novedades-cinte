import { nativeCalendarOnlyInputProps } from '../nativeCalendarOnlyInputProps.js';
import ModuleFiltersDrawer from '../shared/filters/ModuleFiltersDrawer.jsx';
import {
    creadoEnRangeForMonthIndex,
    mesIndexFromCreadoEnRange
} from './novedadesFilters.js';

const MESES_LABELS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export default function NovedadesFiltersDrawer({
    open,
    onClose,
    onClear,
    filters,
    onChange,
    dash,
    fieldInputClassName,
    showPageSize = false,
    showMesShortcut = false,
    pageSize,
    onPageSizeChange,
    tipoOptions = [],
    clienteOptions = [],
    gpFilterOptions = [],
    isSuperAdminNovedades = false,
    labelGpOption
}) {
    const mesShortcutValue = showMesShortcut
        ? mesIndexFromCreadoEnRange(filters.fCreadoDesde, filters.fCreadoHasta)
        : '';

    const handleMesShortcut = (value) => {
        if (!value) {
            onChange({ fCreadoDesde: '', fCreadoHasta: '' });
            return;
        }
        const r = creadoEnRangeForMonthIndex(Number(value), new Date().getFullYear());
        onChange({ fCreadoDesde: r.desde, fCreadoHasta: r.hasta });
    };

    return (
        <ModuleFiltersDrawer
            open={open}
            onClose={onClose}
            onClear={onClear}
            dash={dash}
            panelId="novedades-filtros-panel"
            titleId="novedades-filtros-drawer-title"
        >
            {showMesShortcut ? (
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="novedades-drawer-mes" className={dash.filtrosDrawerLabel}>
                        Mes de creación
                    </label>
                    <select
                        id="novedades-drawer-mes"
                        value={mesShortcutValue}
                        onChange={(e) => handleMesShortcut(e.target.value)}
                        className={`${fieldInputClassName} w-full text-sm`}
                    >
                        <option value="">Todos los meses</option>
                        {MESES_LABELS.map((m, i) => (
                            <option key={m} value={String(i)}>{m}</option>
                        ))}
                    </select>
                </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
                <label htmlFor="novedades-drawer-tipo" className={dash.filtrosDrawerLabel}>
                    Tipo
                </label>
                <select
                    id="novedades-drawer-tipo"
                    value={filters.fTipo || ''}
                    onChange={(e) => onChange({ fTipo: e.target.value })}
                    className={`${fieldInputClassName} w-full text-sm`}
                >
                    <option value="">Todos los tipos</option>
                    {tipoOptions.map((k) => (
                        <option key={k} value={k}>{k}</option>
                    ))}
                </select>
            </div>
            <div className="flex flex-col gap-1.5">
                <label htmlFor="novedades-drawer-estado" className={dash.filtrosDrawerLabel}>
                    Estado
                </label>
                <select
                    id="novedades-drawer-estado"
                    value={filters.fEstado || ''}
                    onChange={(e) => onChange({ fEstado: e.target.value })}
                    className={`${fieldInputClassName} w-full text-sm`}
                >
                    <option value="">Todos los estados</option>
                    <option value="Pendiente">Pendientes</option>
                    <option value="Aprobado">Aprobados</option>
                    <option value="Rechazado">Rechazados</option>
                </select>
            </div>
            <div className="flex flex-col gap-1.5">
                <label htmlFor="novedades-drawer-cliente" className={dash.filtrosDrawerLabel}>
                    Cliente
                </label>
                <select
                    id="novedades-drawer-cliente"
                    value={filters.fCliente || ''}
                    onChange={(e) => onChange({ fCliente: e.target.value })}
                    className={`${fieldInputClassName} w-full text-sm`}
                >
                    <option value="">Todos los clientes</option>
                    {clienteOptions.map((c) => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
            </div>
            {isSuperAdminNovedades ? (
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="novedades-drawer-gp" className={dash.filtrosDrawerLabel}>
                        GP
                    </label>
                    <select
                        id="novedades-drawer-gp"
                        value={filters.fGpUserId || ''}
                        onChange={(e) => onChange({ fGpUserId: e.target.value })}
                        className={`${fieldInputClassName} w-full text-sm`}
                        title="Clientes asignados a este usuario GP en el catálogo directorio"
                    >
                        <option value="">Todos los GP</option>
                        <option value="__null__">Cliente sin GP en catálogo</option>
                        {gpFilterOptions.map((g) => {
                            const id = String(g.id || '');
                            const label = labelGpOption ? labelGpOption(g) : String(g.nombre || g.email || id);
                            return (
                                <option key={id || label} value={id}>
                                    {label}{g.is_active === false ? ' (inactivo)' : ''}
                                </option>
                            );
                        })}
                    </select>
                </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
                <span className={dash.filtrosDrawerLabel}>Rango de fechas</span>
                <div className="flex items-center gap-2">
                    <input
                        {...nativeCalendarOnlyInputProps}
                        type="date"
                        value={filters.fCreadoDesde || ''}
                        onChange={(e) => onChange({ fCreadoDesde: e.target.value })}
                        className={`${fieldInputClassName} min-w-0 flex-1 px-2 py-1.5 text-sm`}
                        aria-label="Rango de fechas: desde"
                    />
                    <span className={`${dash.modalMuted} shrink-0 text-xs`}>a</span>
                    <input
                        {...nativeCalendarOnlyInputProps}
                        type="date"
                        value={filters.fCreadoHasta || ''}
                        onChange={(e) => onChange({ fCreadoHasta: e.target.value })}
                        className={`${fieldInputClassName} min-w-0 flex-1 px-2 py-1.5 text-sm`}
                        aria-label="Rango de fechas: hasta"
                    />
                </div>
            </div>
            {showPageSize ? (
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="novedades-drawer-pagesize" className={dash.filtrosDrawerLabel}>
                        Mostrar por página
                    </label>
                    <select
                        id="novedades-drawer-pagesize"
                        value={pageSize}
                        onChange={(e) => onPageSizeChange(Number(e.target.value))}
                        className={`${fieldInputClassName} w-full text-sm`}
                    >
                        <option value={10}>10 por página</option>
                        <option value={20}>20 por página</option>
                        <option value={50}>50 por página</option>
                    </select>
                </div>
            ) : null}
        </ModuleFiltersDrawer>
    );
}
