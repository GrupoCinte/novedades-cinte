import React, { useState, useMemo } from 'react';
import GestionModalShell from '../shared/modals/GestionModalShell.jsx';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';

export default function PlanesAccionSubModal({ open, onClose, onAdd, minDateStr, maxDateStr }) {
    const { isLight } = useModuleTheme();
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const inputCls = isLight 
        ? 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#2F7BB8]'
        : 'w-full rounded-lg border border-slate-600 bg-[#1e293b] px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#2F7BB8]';

    const [tarea, setTarea] = useState('');
    const [criticidad, setCriticidad] = useState('Media (M)');
    const [responsable, setResponsable] = useState('');
    const [fechaEntrega, setFechaEntrega] = useState('');
    const [recursos, setRecursos] = useState('');

    // Reset when opened
    React.useEffect(() => {
        if (open) {
            setTarea('');
            setCriticidad('Media (M)');
            setResponsable('');
            setFechaEntrega('');
            setRecursos('');
        }
    }, [open]);

    const handleAceptar = () => {
        if (!tarea || !responsable || !fechaEntrega) {
            alert('Tarea, Responsable y Fecha de entrega son obligatorios.');
            return;
        }
        onAdd({
            tarea,
            criticidad,
            responsable,
            fechaEntrega,
            recursos
        });
        onClose();
    };

    return (
        <GestionModalShell
            open={open}
            onClose={onClose}
            title="Agregar Plan de Acción"
            size="md"
            footer={
                <div className="flex justify-end gap-2 w-full">
                    <button className={dash.borrarFiltros} onClick={onClose}>Cancelar</button>
                    <button className={dash.btnPrimaryCinte} onClick={handleAceptar}>Agregar</button>
                </div>
            }
        >
            <div className="p-6 space-y-4">
                <div>
                    <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Tarea / Acción</label>
                    <input type="text" value={tarea} onChange={e => setTarea(e.target.value)} className={inputCls} placeholder="Ej. Actualizar matriz de riesgos" />
                </div>
                <div>
                    <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Criticidad</label>
                    <select value={criticidad} onChange={e => setCriticidad(e.target.value)} className={inputCls}>
                        <option value="Alta (A)">Alta (A)</option>
                        <option value="Media (M)">Media (M)</option>
                        <option value="Baja (B)">Baja (B)</option>
                    </select>
                </div>
                <div>
                    <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Responsable</label>
                    <input type="text" value={responsable} onChange={e => setResponsable(e.target.value)} className={inputCls} placeholder="Nombre del responsable" />
                </div>
                <div>
                    <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Fecha de Entrega</label>
                    <input 
                        type="date" 
                        value={fechaEntrega} 
                        onChange={e => setFechaEntrega(e.target.value)} 
                        min={minDateStr}
                        max={maxDateStr}
                        className={inputCls} 
                    />
                </div>
                <div>
                    <label className={`block text-xs font-semibold mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Recursos (Opcional)</label>
                    <input type="text" value={recursos} onChange={e => setRecursos(e.target.value)} className={inputCls} placeholder="Ej. Presupuesto, acceso a servidor..." />
                </div>
            </div>
        </GestionModalShell>
    );
}
