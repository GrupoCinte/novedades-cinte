import React, { useState, useMemo } from 'react';
import GestionModalShell from '../shared/modals/GestionModalShell.jsx';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';

export default function ParticipantesSubModal({ open, onClose, onAccept, colaboradores = [], participantesActuales = [] }) {
    const { isLight } = useModuleTheme();
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const inputCls = isLight 
        ? 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#2F7BB8]'
        : 'w-full rounded-lg border border-slate-600 bg-[#1e293b] px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#2F7BB8]';

    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState(new Set());

    // Initialize selected from current participants
    React.useEffect(() => {
        if (open) {
            const currentIds = new Set(participantesActuales.map(p => p.cedula).filter(Boolean));
            setSelectedIds(currentIds);
            setSearch('');
        }
    }, [open, participantesActuales]);

    const filtered = useMemo(() => {
        if (!search.trim()) return colaboradores.slice(0, 50); // Show max 50 default to prevent lag
        const s = search.toLowerCase();
        return colaboradores.filter(c => 
            (c.nombre && c.nombre.toLowerCase().includes(s)) ||
            (c.cedula && String(c.cedula).includes(s)) ||
            (c.cargo && c.cargo.toLowerCase().includes(s)) ||
            (c.puesto && c.puesto.toLowerCase().includes(s))
        ).slice(0, 100);
    }, [search, colaboradores]);

    const toggleSelection = (cedula) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(cedula)) newSet.delete(cedula);
        else newSet.add(cedula);
        setSelectedIds(newSet);
    };

    const handleAceptar = () => {
        // Map selected IDs back to full objects
        const accepted = Array.from(selectedIds).map(id => {
            const colab = colaboradores.find(c => c.cedula === id);
            return {
                cedula: colab.cedula,
                nombre: colab.nombre,
                // Cargo -> Si no hay cargo, probamos con puesto, o rol
                cargo: colab.cargo || colab.puesto || colab.rol || 'N/A',
                // Empresa -> El cliente asignado o "CINTe" por defecto si es staff
                empresa: colab.cliente || colab.empleador || 'CINTe',
                email: colab.correo || colab.email || ''
            };
        });
        onAccept(accepted);
        onClose();
    };

    return (
        <GestionModalShell
            open={open}
            onClose={onClose}
            title="Seleccionar Participantes del Directorio"
            size="lg"
            footer={
                <div className="flex justify-between w-full items-center">
                    <span className={`text-sm font-semibold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        {selectedIds.size} seleccionados
                    </span>
                    <div className="flex gap-2">
                        <button className={dash.borrarFiltros} onClick={onClose}>Cancelar</button>
                        <button className={dash.btnPrimaryCinte} onClick={handleAceptar}>Aceptar Selección</button>
                    </div>
                </div>
            }
        >
            <div className="p-4 flex flex-col h-[60vh] gap-4">
                <input 
                    type="text" 
                    placeholder="Buscar por nombre, cédula o cargo..." 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className={inputCls}
                />
                
                <div className={`flex-1 overflow-y-auto rounded-lg border ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800'} p-2`}>
                    {filtered.length === 0 ? (
                        <p className={`text-sm p-4 text-center ${dash.mutedSm}`}>No se encontraron colaboradores.</p>
                    ) : (
                        <div className="space-y-1">
                            {filtered.map(c => {
                                const isSelected = selectedIds.has(c.cedula);
                                const cargoDisplay = c.cargo || c.puesto || 'N/A';
                                const empresaDisplay = c.cliente || c.empleador || 'CINTe';
                                return (
                                    <label key={c.cedula} className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                                        isSelected 
                                            ? (isLight ? 'bg-blue-50 border border-blue-200' : 'bg-blue-900/30 border border-blue-800') 
                                            : (isLight ? 'hover:bg-slate-100' : 'hover:bg-slate-700')
                                    }`}>
                                        <input 
                                            type="checkbox" 
                                            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
                                            checked={isSelected}
                                            onChange={() => toggleSelection(c.cedula)}
                                        />
                                        <div className="flex-1">
                                            <p className={`text-sm font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                                                {c.nombre} <span className="font-normal text-xs opacity-70">({c.cedula})</span>
                                            </p>
                                            <p className={`text-xs mt-0.5 ${dash.mutedSm}`}>
                                                {cargoDisplay} • {empresaDisplay}
                                            </p>
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </GestionModalShell>
    );
}
