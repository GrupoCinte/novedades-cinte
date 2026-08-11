import React from 'react';
import ModuleFiltersDrawer from '../shared/filters/ModuleFiltersDrawer.jsx';
import { useModuleTheme } from '../moduleTheme.js';

export default function SeguimientoFiltersDrawer({
    open,
    onClose,
    dash,
    
    // Valores de filtros (borrador) manejados por el padre
    draftCliente,
    setDraftCliente,
    draftTipo,
    setDraftTipo,
    draftFechaInicio,
    setDraftFechaInicio,
    draftFechaFin,
    setDraftFechaFin,

    // Acciones finales
    onApply,
    onClear
}) {
    const { field } = useModuleTheme();

    return (
        <ModuleFiltersDrawer
            open={open}
            onClose={onClose}
            onClear={onClear}
            onApply={onApply}
            dash={dash}
            panelId="seguimiento-filtros-panel"
            titleId="seguimiento-filtros-drawer-title"
            title="Filtros avanzados"
        >
            <div className="space-y-5">
                {/* Cliente */}
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="seguimiento-drawer-cliente" className={dash.filtrosDrawerLabel}>
                        Cliente
                    </label>
                    <input
                        id="seguimiento-drawer-cliente"
                        type="search"
                        value={draftCliente}
                        onChange={(e) => setDraftCliente(e.target.value)}
                        placeholder="Buscar por nombre..."
                        className={`${field} w-full text-sm`}
                    />
                </div>

                {/* Tipo */}
                <div className="flex flex-col gap-1.5">
                    <label htmlFor="seguimiento-drawer-tipo" className={dash.filtrosDrawerLabel}>
                        Tipo de acta
                    </label>
                        <select
                            id="seguimiento-drawer-tipo"
                            value={draftTipo}
                            onChange={(e) => setDraftTipo(e.target.value)}
                            className={`${field} w-full text-sm`}
                        >
                            <option value="">Todos los tipos</option>
                            <option value="Consultor">Consultor</option>
                            <option value="Cliente">Cliente</option>
                        </select>
                </div>

                {/* Rango de Fechas */}
                <div className="flex flex-col gap-1.5">
                    <span className={dash.filtrosDrawerLabel}>Fecha de reunión</span>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="seguimiento-drawer-fecha-ini" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                                Desde
                            </label>
                            <input
                                id="seguimiento-drawer-fecha-ini"
                                type="date"
                                value={draftFechaInicio}
                                onChange={(e) => setDraftFechaInicio(e.target.value)}
                                className={`${field} w-full text-sm`}
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="seguimiento-drawer-fecha-fin" className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
                                Hasta
                            </label>
                            <input
                                id="seguimiento-drawer-fecha-fin"
                                type="date"
                                value={draftFechaFin}
                                onChange={(e) => setDraftFechaFin(e.target.value)}
                                className={`${field} w-full text-sm`}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </ModuleFiltersDrawer>
    );
}
