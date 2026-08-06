import React, { useState, useMemo } from 'react';
import GestionModalShell from '../shared/modals/GestionModalShell.jsx';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';

export default function PlanesAccionSubModal({ open, onClose, onAdd, minDateStr, maxDateStr, participantes = [] }) {
    const { isLight, field } = useModuleTheme();
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const inputCls = `${field} w-full`;

    const [tarea, setTarea] = useState('');
    const [criticidad, setCriticidad] = useState('');
    const [responsable, setResponsable] = useState('');
    const [fechaEntrega, setFechaEntrega] = useState('');
    const [recursos, setRecursos] = useState('');

    // Reset when opened
    React.useEffect(() => {
        if (open) {
            setTarea('');
            setCriticidad('');
            setResponsable('');
            setFechaEntrega('');
            setRecursos('');
        }
    }, [open]);

    const handleAceptar = () => {
        if (!tarea || !criticidad || !responsable || !fechaEntrega) {
            alert('Tarea, Criticidad, Responsable y Fecha de entrega son obligatorios.');
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
                    <label className={`block mb-1 ${dash.labelFilter}`}>Tarea / Acción</label>
                    <input type="text" value={tarea} onChange={e => setTarea(e.target.value)} className={inputCls} placeholder="Ej. Actualizar matriz de riesgos" />
                </div>
                <div>
                    <label className={`block mb-1 ${dash.labelFilter}`}>Criticidad</label>
                    <select value={criticidad} onChange={e => setCriticidad(e.target.value)} className={inputCls}>
                        <option value="">Seleccione la criticidad</option>
                        <option value="Alta (A)">Alta (A)</option>
                        <option value="Media (M)">Media (M)</option>
                        <option value="Baja (B)">Baja (B)</option>
                    </select>
                </div>
                <div>
                    <label className={`block mb-1 ${dash.labelFilter}`}>Responsable</label>
                    <select value={responsable} onChange={e => setResponsable(e.target.value)} className={inputCls}>
                        <option value="">Seleccione un responsable</option>
                        {participantes.map(p => (
                            <option key={p.id || p.cedula} value={p.nombre}>{p.nombre}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={`block mb-1 ${dash.labelFilter}`}>Fecha de Entrega</label>
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
                    <label className={`block mb-1 ${dash.labelFilter}`}>Recursos (Opcional)</label>
                    <input type="text" value={recursos} onChange={e => setRecursos(e.target.value)} className={inputCls} placeholder="Ej. Presupuesto, acceso a servidor..." />
                </div>
            </div>
        </GestionModalShell>
    );
}
