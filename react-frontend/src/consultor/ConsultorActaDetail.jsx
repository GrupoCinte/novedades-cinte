import React, { useState, useEffect } from 'react';
import { X, Clock, AlertTriangle, CheckCircle, Edit2 } from 'lucide-react';
import { useUiTheme } from '../UiThemeContext.jsx';
import { buildCsrfHeaders } from '../cognitoAuth.js';

const DataBlock = ({ label, value }) => (
    <div className="mb-4">
        <h4 className="font-semibold text-sm mb-1 text-slate-500 dark:text-slate-400">{label}</h4>
        <div className="text-sm leading-relaxed whitespace-pre-wrap">
            {value || <span className="italic opacity-60">N/A</span>}
        </div>
    </div>
);

const SectionTitle = ({ children, isLight }) => (
    <h3 className={`text-base font-bold mt-6 mb-4 pb-2 border-b ${isLight ? 'border-slate-200 text-[#2F7BB8]' : 'border-slate-700 text-[#65BCF7]'}`}>
        {children}
    </h3>
);

const ParticipantesTable = ({ participantes, isLight }) => {
    if (participantes.length === 0) {
        return <p className="italic opacity-60 text-sm">No hay participantes registrados.</p>;
    }
    return (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full text-left text-sm border-collapse">
                <thead className={isLight ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-slate-300'}>
                    <tr>
                        <th className="p-3 font-semibold border-b border-slate-200 dark:border-slate-700">Nombre</th>
                        <th className="p-3 font-semibold border-b border-slate-200 dark:border-slate-700">Cargo</th>
                        <th className="p-3 font-semibold border-b border-slate-200 dark:border-slate-700">Empresa</th>
                    </tr>
                </thead>
                <tbody>
                    {participantes.map((p, idx) => (
                        <tr key={p.cedula || p.email || p.nombre || String(idx)} className={`border-b last:border-0 ${isLight ? 'border-slate-100' : 'border-slate-800'}`}>
                            <td className="p-3 font-medium">{p.nombre || p.email}</td>
                            <td className="p-3">{p.cargo || p.rol || 'N/A'}</td>
                            <td className="p-3">{p.empresa || 'N/A'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const DesarrolloSection = ({ participantes, isLight }) => {
    if (participantes.length === 0) {
        return <p className="italic opacity-60 text-sm">No se registró desarrollo.</p>;
    }
    const hasDesarrollo = participantes.some(p => p.desarrollo);
    return (
        <div className="space-y-4">
            {participantes.map((p, idx) => {
                const desarrollo = p.desarrollo;
                if (!desarrollo) return null;
                return (
                    <div key={p.cedula || p.email || p.nombre || String(idx)} className={`p-4 rounded-lg border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/30 border-slate-700/50'}`}>
                        <h4 className="font-bold text-sm mb-2 text-[#2F7BB8]">Consultor: {p.nombre || p.email}</h4>
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{desarrollo}</p>
                    </div>
                );
            })}
            {!hasDesarrollo && (
                <p className="italic opacity-60 text-sm">No se registraron comentarios de desarrollo para los participantes.</p>
            )}
        </div>
    );
};

const PlanesAccionSection = ({ planesAccion, compromisosAntiguos, isLight }) => {
    if (planesAccion.length > 0) {
        return (
            <div className="space-y-3">
                {planesAccion.map((plan, idx) => (
                    <div key={plan.id || plan.tarea || String(idx)} className={`p-4 rounded-lg border flex flex-col gap-2 ${isLight ? 'border-slate-200 bg-white' : 'border-slate-700/50 bg-slate-800/30'}`}>
                        <div className="font-medium text-sm">{plan.tarea}</div>
                        <div className="flex flex-wrap gap-4 text-xs opacity-80">
                            <span><strong>Responsable:</strong> {plan.responsable || 'N/A'}</span>
                            <span><strong>Fecha de entrega:</strong> {plan.fechaEntrega || plan.fecha || 'N/A'}</span>
                            {plan.criticidad && <span><strong>Prioridad:</strong> {plan.criticidad}</span>}
                        </div>
                    </div>
                ))}
            </div>
        );
    }
    if (compromisosAntiguos) {
        return <DataBlock label="Compromisos registrados" value={compromisosAntiguos} />;
    }
    return <p className="italic opacity-60 text-sm">No hay planes de acción ni compromisos registrados.</p>;
};

const TimerBadge = ({ isExpired, timeLeftStr, isLight }) => {
    if (!isExpired) {
        return (
            <div className={`flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-md ${isLight ? 'text-slate-600 bg-slate-100 border border-slate-200 shadow-sm' : 'text-emerald-400 bg-emerald-900/30'}`}>
                <Clock size={14} />
                {timeLeftStr}
            </div>
        );
    }
    return (
        <div className={`flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-md ${isLight ? 'text-slate-500 bg-slate-50 border border-slate-200' : 'text-red-400 bg-red-900/30'}`}>
            <AlertTriangle size={14} />
            {timeLeftStr}
        </div>
    );
};

const ObservacionConsultorState = ({ isExpired, savedObservacion, isEditing, setIsEditing, observacionTxt, setObservacionTxt, handleSaveObservacion, saving, savedMsg, isLight }) => {
    const containerClasses = isLight 
        ? 'bg-slate-50 border-slate-200' 
        : 'bg-slate-800/50 border-slate-700';
    
    const textClasses = isLight ? 'text-slate-700' : 'text-slate-300';
    const buttonCancelClasses = isLight 
        ? 'border-slate-300 text-slate-700 hover:bg-slate-50' 
        : 'border-slate-600 text-slate-300 hover:bg-slate-800';
    
    const textareaClasses = isLight 
        ? 'bg-white border-slate-200 focus:ring-blue-500/20 focus:border-blue-500' 
        : 'bg-[#0b2844]/50 border-slate-700 focus:ring-[#65BCF7]/20 focus:border-[#65BCF7] text-slate-200';
        
    const editBtnClasses = isLight 
        ? 'text-slate-400 hover:bg-slate-200 hover:text-slate-700' 
        : 'text-slate-500 hover:bg-slate-700 hover:text-slate-300';

    const canSave = observacionTxt.trim() && observacionTxt !== savedObservacion && !saving;
    const saveBtnClasses = canSave
        ? (isLight ? 'bg-blue-600 hover:bg-blue-700' : 'bg-[#65BCF7] hover:bg-[#4BA3E3] text-[#04141E]')
        : 'opacity-50 cursor-not-allowed bg-slate-400 text-slate-100';

    if (isExpired) {
        if (savedObservacion) {
            return (
                <div className={`p-4 rounded-xl border ${containerClasses}`}>
                    <p className={`text-sm whitespace-pre-wrap leading-relaxed ${textClasses}`}>{savedObservacion}</p>
                </div>
            );
        }
        return (
            <div className={`p-4 rounded-xl border ${containerClasses}`}>
                <p className="text-sm text-slate-500 italic">No registraste observaciones dentro del plazo permitido.</p>
            </div>
        );
    }

    if (isEditing) {
        return (
            <div className="space-y-3">
                <textarea
                    value={observacionTxt}
                    onChange={(e) => setObservacionTxt(e.target.value)}
                    placeholder="Escribe tu observación sobre el acta aquí..."
                    className={`w-full h-32 p-3 text-sm rounded-xl border focus:ring-2 focus:outline-none resize-y ${textareaClasses}`}
                    disabled={saving}
                />
                <div className="flex justify-end gap-3 items-center">
                    {savedMsg && (
                        <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mr-auto">
                            <CheckCircle size={14} /> {savedMsg}
                        </p>
                    )}
                    {savedObservacion && (
                        <button
                            type="button"
                            onClick={() => {
                                setObservacionTxt(savedObservacion);
                                setIsEditing(false);
                            }}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg border transition-all ${buttonCancelClasses}`}
                            disabled={saving}
                        >
                            Cancelar
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleSaveObservacion}
                        disabled={!canSave}
                        className={`flex items-center gap-2 px-5 py-2 text-sm font-bold text-white rounded-lg transition-all shadow-sm ${saveBtnClasses}`}
                    >
                        {saving ? 'Guardando...' : (savedObservacion ? 'Guardar cambios' : 'Guardar observación')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={`p-4 rounded-xl border ${containerClasses}`}>
            <div className="flex justify-between items-start gap-4">
                <p className={`text-sm whitespace-pre-wrap leading-relaxed flex-1 ${textClasses}`}>{savedObservacion}</p>
                <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className={`p-1.5 rounded-md transition-colors flex-shrink-0 ${editBtnClasses}`}
                    title="Editar observación"
                >
                    <Edit2 size={16} />
                </button>
            </div>
        </div>
    );
};

const useActaTimer = (finalizadoAt) => {
    const [timeLeftStr, setTimeLeftStr] = useState('');
    const [isExpired, setIsExpired] = useState(false);

    useEffect(() => {
        if (!finalizadoAt) {
            setIsExpired(true);
            setTimeLeftStr('Fecha de finalización no disponible.');
            return;
        }

        const updateTimer = () => {
            const finalizado = new Date(finalizadoAt).getTime();
            const now = Date.now();
            const diffMs = now - finalizado;
            const msIn72h = 72 * 60 * 60 * 1000;
            const leftMs = msIn72h - diffMs;

            if (leftMs <= 0) {
                setIsExpired(true);
                setTimeLeftStr('Plazo finalizado');
            } else {
                setIsExpired(false);
                const h = leftMs / (1000 * 60 * 60);
                if (h >= 48) setTimeLeftStr('3 días restantes');
                else if (h >= 24) setTimeLeftStr('2 días restantes');
                else if (h >= 12) setTimeLeftStr('1 día restante');
                else setTimeLeftStr('Menos de 1 día restante');
            }
        };

        updateTimer();
        const interval = setInterval(updateTimer, 60000);
        return () => clearInterval(interval);
    }, [finalizadoAt]);

    return { isExpired, timeLeftStr };
};

const useObservacionConsultor = (initialObs, actaId, isExpired) => {
    const [savedObservacion, setSavedObservacion] = useState(initialObs);
    const [observacionTxt, setObservacionTxt] = useState(initialObs);
    const [isEditing, setIsEditing] = useState(!initialObs);
    const [saving, setSaving] = useState(false);
    const [savedMsg, setSavedMsg] = useState('');

    const handleSaveObservacion = async () => {
        if (!observacionTxt.trim() || isExpired) return;
        setSaving(true);
        setSavedMsg('');
        try {
            const res = await fetch(`/api/consultor/seguimientos/${actaId}/observacion`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    ...buildCsrfHeaders()
                },
                body: JSON.stringify({ observacion: observacionTxt })
            });
            const data = await res.json();
            if (data.ok) {
                setSavedObservacion(observacionTxt);
                setIsEditing(false);
                setSavedMsg('Observación guardada correctamente.');
                setTimeout(() => setSavedMsg(''), 3000);
            } else {
                alert(data.error || 'Error al guardar la observación');
            }
        } catch (err) {
            console.error(err);
            alert('Error de red al guardar la observación');
        } finally {
            setSaving(false);
        }
    };

    return {
        savedObservacion, observacionTxt, isEditing, saving, savedMsg,
        setObservacionTxt, setIsEditing, handleSaveObservacion
    };
};

export default function ConsultorActaDetail({ open, onClose, actaData, me }) {
    const { theme } = useUiTheme();
    const isLight = theme === 'light';

    const pJson = actaData?.payload_json || {};
    
    // Priorizar los participantes vivos de la BD para tener la observación actualizada
    const participantes = (actaData?.participantes && actaData.participantes.length > 0) 
        ? actaData.participantes 
        : (pJson.participantes_detalle || []);

    // Buscar el participante correspondiente al consultor actual
    const myParticipant = participantes.find(p => p.email === me?.email || p.cedula === me?.cedula);
    const initialObs = myParticipant?.observacion || pJson.observacion_consultor || '';

    const { isExpired, timeLeftStr } = useActaTimer(actaData?.finalizado_at);
    const { 
        savedObservacion, 
        observacionTxt, 
        isEditing, 
        saving, 
        savedMsg,
        setObservacionTxt, 
        setIsEditing, 
        handleSaveObservacion 
    } = useObservacionConsultor(initialObs, actaData?.id, isExpired);

    if (!open || !actaData) return null;

    const fecha = actaData.fecha_acta ? new Date(actaData.fecha_acta).toLocaleDateString() : 'N/A';
    const horaInicio = pJson.hora_inicio || 'N/A';
    const horaFin = pJson.hora_fin || 'N/A';
    const responsableNombre = pJson.responsable_nombre || 'N/A';
    const responsableCargo = pJson.responsable_cargo || 'N/A';
    const objetivo = pJson.objetivo || 'Sin objetivo registrado.';
    const agenda = pJson.agenda || 'Sin agenda registrada.';
    const planesAccion = pJson.planes_accion || [];
    const compromisosAntiguos = actaData.compromisos || pJson.compromisos || '';
    const observaciones = actaData.observaciones || pJson.observaciones || '';

    const modalClass = `relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${
        isLight ? 'bg-white text-slate-800' : 'bg-slate-900 text-slate-200 border border-slate-700/50'
    }`;
    const overlayClass = "fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4";

    return (
        <div 
            className={overlayClass} 
            onClick={onClose}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClose(); }}
        >
            <div 
                className={modalClass} 
                onClick={e => e.stopPropagation()}
                role="presentation"
                onKeyDown={(e) => e.stopPropagation()}
            >
                
                {/* Encabezado */}
                <div className={`px-6 py-5 border-b flex items-center justify-between ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/50 border-slate-700/50'}`}>
                    <h2 className="text-xl font-bold">Detalle del Acta</h2>
                    <button 
                        type="button"
                        onClick={onClose}
                        className={`p-2 rounded-full transition-colors ${isLight ? 'hover:bg-slate-200 text-slate-500' : 'hover:bg-slate-700 text-slate-400'}`}
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Contenido */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 font-body">
                    
                    <SectionTitle isLight={isLight}>1. Información General</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <DataBlock label="Fecha de reunión" value={fecha} />
                        <DataBlock label="Hora de inicio" value={horaInicio} />
                        <DataBlock label="Hora de fin" value={horaFin} />
                    </div>

                    <SectionTitle isLight={isLight}>2. Responsable de la reunión</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <DataBlock label="Nombres y apellidos" value={responsableNombre} />
                        <DataBlock label="Cargo / Puesto" value={responsableCargo} />
                    </div>

                    <SectionTitle isLight={isLight}>3. Objetivo</SectionTitle>
                    <DataBlock label="¿Cuál fue el propósito de este seguimiento?" value={objetivo} />

                    <SectionTitle isLight={isLight}>4. Participantes</SectionTitle>
                    <ParticipantesTable participantes={participantes} isLight={isLight} />

                    <SectionTitle isLight={isLight}>5. Agenda</SectionTitle>
                    <DataBlock label="Temas tratados" value={agenda} />

                    <SectionTitle isLight={isLight}>6. Desarrollo de la reunión</SectionTitle>
                    <DesarrolloSection participantes={participantes} isLight={isLight} />

                    <SectionTitle isLight={isLight}>7. Planes de acción / Compromisos</SectionTitle>
                    <PlanesAccionSection planesAccion={planesAccion} compromisosAntiguos={compromisosAntiguos} isLight={isLight} />

                    {observaciones && (
                        <>
                            <SectionTitle isLight={isLight}>Observaciones Generales</SectionTitle>
                            <DataBlock label="Registradas por el administrador" value={observaciones} />
                        </>
                    )}

                    <SectionTitle isLight={isLight}>8. Observaciones del consultor</SectionTitle>
                    <div className={`p-5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/40 border-slate-700/50'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <h4 className="font-bold text-sm">Tu observación sobre el acta</h4>
                            <TimerBadge isExpired={isExpired} timeLeftStr={timeLeftStr} isLight={isLight} />
                        </div>
                        
                        <ObservacionConsultorState 
                            isExpired={isExpired}
                            savedObservacion={savedObservacion}
                            isEditing={isEditing}
                            setIsEditing={setIsEditing}
                            observacionTxt={observacionTxt}
                            setObservacionTxt={setObservacionTxt}
                            handleSaveObservacion={handleSaveObservacion}
                            saving={saving}
                            savedMsg={savedMsg}
                            isLight={isLight}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
