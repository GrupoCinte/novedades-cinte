import React, { useState, useEffect, useCallback, useMemo } from 'react';
import GestionModalShell from '../shared/modals/GestionModalShell.jsx';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';
import { authHeaders } from '../shared/authUtils.js';
import { MoreVertical } from 'lucide-react';

import ParticipantesSubModal from './ParticipantesSubModal.jsx';
import PlanesAccionSubModal from './PlanesAccionSubModal.jsx';

export default function SeguimientoFormModal({ 
    open, 
    onClose, 
    actaId, 
    actaData, // The actual data passed from the parent row
    token, 
    auth, 
    onSaved,
    tipoSeleccionado,
    clientesCartera = [],
    refreshCartera
}) {
    const { isLight, field } = useModuleTheme();
    const [menuOpen, setMenuOpen] = useState(false);
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const inputCls = `${field} w-full`;
    
    const role = String(auth?.user?.role || auth?.claims?.role || '').trim().toLowerCase();
    const isGp = role === 'gp';

    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    // Lists for autocomplete
    const [colaboradores, setColaboradores] = useState([]);
    
    // Submodals state
    const [participantesOpen, setParticipantesOpen] = useState(false);
    const [planesOpen, setPlanesOpen] = useState(false);

    // Form state (Nativo BD)
    const [tipo, setTipo] = useState(tipoSeleccionado || 'Consultor');
    const [cliente, setCliente] = useState('');
    const [fechaActa, setFechaActa] = useState(new Date().toISOString().split('T')[0]);
    
    // Form state extendido (payload_json)
    const [horaInicio, setHoraInicio] = useState('');
    const [horaFin, setHoraFin] = useState('');
    
    const [responsableNombre, setResponsableNombre] = useState('');
    const [responsableCargo, setResponsableCargo] = useState('');
    const [quienRealizaNombre, setQuienRealizaNombre] = useState('');
    const [quienRealizaCargo, setQuienRealizaCargo] = useState('');

    const [objetivo, setObjetivo] = useState('');
    const [agenda, setAgenda] = useState('');
    const [proximaReunion, setProximaReunion] = useState('');
    
    // Array de participantes estructurado: { cedula, nombre, cargo, empresa, email, desarrollo }
    const [participantes, setParticipantes] = useState([]);
    
    // Array de planes de acción: { tarea, criticidad, responsable, fechaEntrega, recursos }
    const [planesAccion, setPlanesAccion] = useState([]);
    
    // Observaciones del consultor (solo lectura para el GP)
    const [observacionConsultor, setObservacionConsultor] = useState('');
    const [observacionConsultorFecha, setObservacionConsultorFecha] = useState('');
    
    // Sub-modal for confirming finalize
    const [confirmFinalizeOpen, setConfirmFinalizeOpen] = useState(false);
    const [isFinalizado, setIsFinalizado] = useState(false);
    const [fechaFinalizado, setFechaFinalizado] = useState(null);

    // Cálculos de fecha para restricciones
    const { minDateStr, maxDateStr } = useMemo(() => {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        const minM = m === 0 ? 0 : m - 1;
        const minD = new Date(y, minM, 1);
        const maxD = new Date(y, 11, 31);
        
        const pad = (n) => String(n).padStart(2, '0');
        const minDateStr = `${minD.getFullYear()}-${pad(minD.getMonth() + 1)}-${pad(minD.getDate())}`;
        const maxDateStr = `${maxD.getFullYear()}-${pad(maxD.getMonth() + 1)}-${pad(maxD.getDate())}`;
        return { minDateStr, maxDateStr };
    }, []);

    const fetchOpts = useCallback(() => ({
        headers: authHeaders(token),
        credentials: 'include'
    }), [token]);

    useEffect(() => {
        if (open) {
            setLoading(true);
            setError(null);
            
            const gpEmail = String(auth?.user?.email || auth?.claims?.email || '').trim().toLowerCase();
            const gpName = String(auth?.user?.name || auth?.claims?.name || '').trim();
            
            fetch('/api/directorio/colaboradores?limit=1000', fetchOpts())
                .then(r => r.json())
                .then(d => {
                    const colabs = d.items || [];
                    setColaboradores(colabs);
                    
                    // Buscar puesto del GP en el directorio (la DB usa 'puesto' para colaboradores)
                    const gpColab = colabs.find(c => {
                        const ce = String(c.correo_cinte || c.correo || c.email || '').trim().toLowerCase();
                        return ce && ce === gpEmail;
                    });
                    const gpPuesto = gpColab ? (gpColab.puesto || gpColab.cargo || '') : '';
                    
                    if (actaId && actaData) {
                        setTipo(actaData.tipo === 'cliente' ? 'Cliente' : 'Consultor');
                        setCliente(actaData.cliente || '');
                        setFechaActa(actaData.fecha_acta ? new Date(actaData.fecha_acta).toISOString().split('T')[0] : '');
                        setIsFinalizado(actaData.estado === 'FINALIZADO');
                        setFechaFinalizado(actaData.finalizado_at || null);
        
                        const pJson = actaData.payload_json || {};
                        setHoraInicio(pJson.hora_inicio || '');
                        setHoraFin(pJson.hora_fin || '');
                        
                        // Si existen en DB se cargan, si no, se toma del GP logueado
                        setResponsableNombre(pJson.responsable_nombre || gpName);
                        setResponsableCargo(pJson.responsable_cargo || gpPuesto);
                        setQuienRealizaNombre(pJson.quien_realiza_nombre || gpName);
                        setQuienRealizaCargo(pJson.quien_realiza_cargo || gpPuesto);
                        
                        setObjetivo(pJson.objetivo || '');
                        setAgenda(pJson.agenda || '');
                        setProximaReunion(pJson.proxima_reunion || '');
                        
                        setParticipantes(pJson.participantes_detalle || []);
                        setPlanesAccion(pJson.planes_accion || []);
                        
                        setObservacionConsultor(pJson.observacion_consultor || '');
                        setObservacionConsultorFecha(pJson.observacion_consultor_fecha || '');
                    } else {
                        // Nueva acta
                        setTipo(tipoSeleccionado || 'Consultor');
                        if (clientesCartera.length === 1) {
                            setCliente(clientesCartera[0]);
                        } else {
                            setCliente('');
                        }
                        setFechaActa(new Date().toISOString().split('T')[0]);
                        setIsFinalizado(false);
                        setFechaFinalizado(null);
        
                        setHoraInicio('');
                        setHoraFin('');
                        setResponsableNombre(gpName);
                        setResponsableCargo(gpPuesto);
                        setQuienRealizaNombre(gpName);
                        setQuienRealizaCargo(gpPuesto);
                        setObjetivo('');
                        setAgenda('');
                        setProximaReunion('');
                        setParticipantes([]);
                        setPlanesAccion([]);
                        setObservacionConsultor('');
                        setObservacionConsultorFecha('');
                    }
                })
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [open, actaId, actaData, tipoSeleccionado, fetchOpts, clientesCartera, auth]);

    // Helpers
    const isReadOnly = actaData ? (actaData.can_edit === false) : false;

    // Participantes Logic
    const handleAcceptParticipantes = (selectedItems) => {
        // Merge with existing to preserve 'desarrollo' text
        const currentMap = new Map(participantes.map(p => [p.cedula, p]));
        const merged = selectedItems.map(s => {
            const existing = currentMap.get(s.cedula);
            if (existing) return existing;
            return { ...s, desarrollo: '' };
        });
        setParticipantes(merged);

        // Auto-assign internal 'cliente' based on participants if not already set
        if (!cliente && merged.length > 0 && clientesCartera.length > 0) {
            const pConCliente = merged.find(p => clientesCartera.includes(p.empresa));
            if (pConCliente) {
                setCliente(pConCliente.empresa);
            } else {
                setCliente(clientesCartera[0]);
            }
        }
    };

    const updateDesarrollo = (cedula, text) => {
        setParticipantes(prev => prev.map(p => p.cedula === cedula ? { ...p, desarrollo: text } : p));
    };

    const removeParticipante = (cedula) => {
        setParticipantes(prev => prev.filter(p => p.cedula !== cedula));
    };

    // Planes de acción logic
    const handleAddPlan = (plan) => {
        setPlanesAccion(prev => [...prev, plan]);
    };
    
    const removePlan = (idx) => {
        setPlanesAccion(prev => prev.filter((_, i) => i !== idx));
    };

    const isBorradorVacio = () => {
        const noObjetivo = !objetivo || objetivo.trim() === '';
        const noAgenda = !agenda || agenda.trim() === '';
        const noParticipantes = participantes.length === 0;
        const noPlanes = planesAccion.length === 0;
        return noObjetivo && noAgenda && noParticipantes && noPlanes;
    };

    const handleTimeInput = (value, setter) => {
        // Solo permitir números
        let raw = value.replace(/\D/g, '');
        if (raw.length > 4) raw = raw.slice(0, 4);
        
        // Validaciones básicas en vivo
        if (raw.length >= 1 && parseInt(raw[0], 10) > 2) raw = '2'; // La hora no puede empezar con 3+
        if (raw.length >= 2 && parseInt(raw.slice(0, 2), 10) > 23) raw = '23' + raw.slice(2);
        if (raw.length >= 3 && parseInt(raw[2], 10) > 5) raw = raw.slice(0, 2) + '5' + raw.slice(3);
        
        // Insertar los dos puntos
        let formatted = raw;
        if (raw.length > 2) {
            formatted = raw.slice(0, 2) + ':' + raw.slice(2);
        }
        
        setter(formatted);
    };

    const handleLimpiar = () => {
        setMenuOpen(false);
        setObjetivo('');
        setAgenda('');
        setProximaReunion('');
        setParticipantes([]);
        setPlanesAccion([]);
        setHoraInicio('');
        setHoraFin('');
        setError(null);
    };

    const handleDescartar = async () => {
        setMenuOpen(false);
        if (!isBorradorVacio()) {
            setError('Para descartar el borrador, primero debes dejar el formulario completamente limpio.');
            return;
        }

        if (actaId) {
            setSaving(true);
            try {
                const resDel = await fetch(`/api/seguimiento/actas/${actaId}`, {
                    ...fetchOpts(),
                    method: 'DELETE'
                });
                if (resDel.ok) {
                    onSaved('DESCARTADO');
                    onClose();
                } else {
                    const err = await resDel.json();
                    setError(err.error || 'No se pudo descartar el borrador vacío.');
                }
            } catch (e) {
                setError('Error de conexión al descartar borrador.');
            } finally {
                setSaving(false);
            }
        } else {
            onSaved('DESCARTADO');
            onClose();
        }
    };

    const saveActa = async (estadoFinal) => {
        if (participantes.length === 0) {
            setError('Debes agregar al menos un participante para diligenciar el desarrollo.');
            return;
        }

        if (estadoFinal === 'FINALIZADO') {
            if (!fechaActa) {
                setError('La Fecha es obligatoria para finalizar el acta.');
                return;
            }
            if (!agenda || agenda.trim() === '') {
                setError('El campo Temas (Agenda) es obligatorio para finalizar el acta.');
                return;
            }
            if (participantes.some(p => !p.desarrollo || p.desarrollo.trim() === '')) {
                setError('El Desarrollo (Feedback) de todos los participantes es obligatorio para finalizar el acta.');
                return;
            }
            if (planesAccion.length === 0) {
                setError('Debes agregar al menos un compromiso (Planes de Acción) para finalizar el acta.');
                return;
            }
            if (tipoSeleccionado === 'Consultor' && participantes.length === 0) {
                setError('Debes seleccionar consultores para finalizar este tipo de acta.');
                return;
            }
        }

        let clienteFinal = cliente;
        if (!clienteFinal && participantes.length > 0) {
            const pConCliente = participantes.find(p => p.empresa && p.empresa !== 'CINTe');
            clienteFinal = pConCliente ? pConCliente.empresa : (clientesCartera.length > 0 ? clientesCartera[0] : 'General');
            setCliente(clienteFinal);
        }

        if (!clienteFinal) {
            setError('Error interno: No se pudo determinar el cliente asociado al acta.');
            return;
        }
        
        if (!fechaActa || !horaInicio || !horaFin) {
            setError('Debes proveer la fecha y las horas de inicio y fin.');
            return;
        }

        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(horaInicio)) {
            setError('El formato de Hora de inicio no es válido (usa formato 24h, ej. 08:30, 14:00).');
            return;
        }
        if (!timeRegex.test(horaFin)) {
            setError('El formato de Hora de finalización no es válido (usa formato 24h, ej. 08:30, 14:00).');
            return;
        }

        setSaving(true);
        setError(null);

        // Map base participantes for relational DB storage (just to satisfy existing schema)
        const participantesRelational = participantes.map(p => ({
            cedula: p.cedula,
            nombre: p.nombre,
            rol: p.cargo,
            email: p.email
        }));

        const payloadJson = {
            hora_inicio: horaInicio,
            hora_fin: horaFin,
            responsable_nombre: responsableNombre,
            responsable_cargo: responsableCargo,
            quien_realiza_nombre: quienRealizaNombre,
            quien_realiza_cargo: quienRealizaCargo,
            objetivo,
            agenda,
            proxima_reunion: proximaReunion,
            participantes_detalle: participantes, // Completo con su campo 'desarrollo'
            planes_accion: planesAccion
        };

        const payload = {
            tipo: tipo.toLowerCase(),
            cliente: clienteFinal,
            fecha_acta: fechaActa,
            estado: estadoFinal,
            compromisos: '', // Deprecated nativamente, movido a planes_accion
            observaciones: '', 
            participantes: participantesRelational,
            payload_json: payloadJson 
        };

        try {
            const url = actaId ? `/api/seguimiento/actas/${actaId}` : '/api/seguimiento/actas';
            const method = actaId ? 'PATCH' : 'POST';
            
            const res = await fetch(url, {
                ...fetchOpts(),
                method,
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (!res.ok) {
                throw new Error(data.error || 'Error al guardar el acta');
            }

            setConfirmFinalizeOpen(false);
            onSaved(estadoFinal);
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    // UI Components
    const SectionTitle = ({ children }) => (
        <h3 className={`text-base font-bold mt-6 mb-4 pb-2 border-b ${isLight ? 'border-slate-200 text-[#2F7BB8]' : 'border-slate-700 text-[#65BCF7]'}`}>
            {children}
        </h3>
    );

    return (
        <>
            <GestionModalShell
                open={open}
                onClose={onClose}
                title={actaId ? "Acta de Seguimiento" : "Nueva Acta de Seguimiento"}
                size="xl"
                footer={
                    <div className="flex justify-between w-full">
                        <div>
                            {error && <span className="text-red-500 text-sm font-semibold">{error}</span>}
                        </div>
                        <div className="flex gap-2 items-center">
                            {!isReadOnly && (
                                <div className="relative">
                                    <button 
                                        onClick={() => setMenuOpen(!menuOpen)} 
                                        className="p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors"
                                        title="Opciones del borrador"
                                    >
                                        <MoreVertical className="w-5 h-5" />
                                    </button>
                                    {menuOpen && (
                                        <div className="absolute right-0 bottom-full mb-2 w-48 bg-white border border-slate-200 shadow-xl rounded-lg overflow-hidden z-50">
                                            <button 
                                                onClick={handleLimpiar} 
                                                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                            >
                                                Limpiar formulario
                                            </button>
                                            <button 
                                                onClick={handleDescartar} 
                                                className="w-full text-left px-4 py-2 text-sm text-red-600 font-medium hover:bg-red-50 transition-colors"
                                            >
                                                Descartar borrador
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                            <button 
                                className={dash.borrarFiltros} 
                                onClick={() => {
                                    if (isReadOnly) {
                                        onClose();
                                    } else {
                                        saveActa('Borrador');
                                    }
                                }} 
                                disabled={saving}
                            >
                                {saving ? 'Guardando...' : 'Cancelar'}
                            </button>
                            {!isReadOnly && (
                                <button className={dash.btnPrimaryCinte} onClick={() => setConfirmFinalizeOpen(true)} disabled={saving}>
                                    Finalizar Acta
                                </button>
                            )}
                        </div>
                    </div>
                }
            >
                <div className="flex flex-col gap-2 p-6 h-full overflow-y-auto">
                    {loading ? (
                        <p className={dash.mutedSm}>Cargando datos del acta...</p>
                    ) : (
                        <div className="space-y-2 pb-6">
                            
                            {/* SECCIÓN 1: Información General */}
                            <SectionTitle>1. Información General</SectionTitle>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="md:col-span-2">
                                    <label className={`block mb-1 ${dash.labelFilter}`}>Fecha de reunión</label>
                                    <input 
                                        type="date" 
                                        value={fechaActa} 
                                        onChange={e => setFechaActa(e.target.value)} 
                                        min={minDateStr}
                                        max={maxDateStr}
                                        className={inputCls} 
                                        readOnly={isReadOnly} 
                                    />
                                </div>
                                <div>
                                    <label className={`block mb-1 ${dash.labelFilter}`}>Hora Inicio (24h)</label>
                                    <input type="text" placeholder="--:--" maxLength="5" value={horaInicio} onChange={e => handleTimeInput(e.target.value, setHoraInicio)} className={inputCls} readOnly={isReadOnly} />
                                </div>
                                <div>
                                    <label className={`block mb-1 ${dash.labelFilter}`}>Hora Fin (24h)</label>
                                    <input type="text" placeholder="--:--" maxLength="5" value={horaFin} onChange={e => handleTimeInput(e.target.value, setHoraFin)} className={inputCls} readOnly={isReadOnly} />
                                </div>
                            </div>

                            {/* SECCIÓN 2: Responsable */}
                            <SectionTitle>2. Responsable de la reunión</SectionTitle>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={`block mb-1 ${dash.labelFilter}`}>Nombres y apellidos</label>
                                    <input type="text" value={responsableNombre} onChange={e => setResponsableNombre(e.target.value)} className={inputCls} readOnly />
                                </div>
                                <div>
                                    <label className={`block mb-1 ${dash.labelFilter}`}>Cargo / Puesto</label>
                                    <input type="text" value={responsableCargo} onChange={e => setResponsableCargo(e.target.value)} className={inputCls} readOnly />
                                </div>
                            </div>

                            {/* SECCIÓN 3: Objetivo */}
                            <SectionTitle>3. Objetivo</SectionTitle>
                            <div>
                                <textarea rows={2} value={objetivo} onChange={e => setObjetivo(e.target.value)} className={inputCls} readOnly={isReadOnly} placeholder="¿Cuál fue el propósito de este seguimiento?" />
                            </div>

                            {/* SECCIÓN 4: Participantes */}
                            <SectionTitle>4. Participantes</SectionTitle>
                            <div>
                                {!isReadOnly && (
                                    <button type="button" onClick={() => setParticipantesOpen(true)} className={`mb-4 ${dash.borrarFiltros}`}>
                                        + Agregar participantes
                                    </button>
                                )}
                                
                                {participantes.length === 0 ? (
                                    <p className={`text-sm italic ${dash.mutedSm}`}>No hay participantes seleccionados.</p>
                                ) : (
                                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                                        <table className="w-full text-left text-sm border-collapse">
                                            <thead className={dash.thead}>
                                                <tr>
                                                    <th className="p-4 font-semibold">Nombre</th>
                                                    <th className="p-4 font-semibold">Cargo</th>
                                                    <th className="p-4 font-semibold">Empresa</th>
                                                    {!isReadOnly && <th className="p-4 font-semibold w-10"></th>}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {participantes.map(p => (
                                                    <tr key={p.cedula} className={dash.trHover}>
                                                        <td className={dash.tdName}>{p.nombre}</td>
                                                        <td className={dash.tdCell}>{p.cargo}</td>
                                                        <td className={dash.tdCell}>{p.empresa}</td>
                                                        {!isReadOnly && (
                                                            <td className="px-4 py-2 text-right">
                                                                <button onClick={() => removeParticipante(p.cedula)} className="text-red-500 font-bold px-2 py-1 rounded hover:bg-red-50">X</button>
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* SECCIÓN 5: Agenda */}
                            <SectionTitle>5. Agenda</SectionTitle>
                            <div>
                                <textarea rows={4} value={agenda} onChange={e => setAgenda(e.target.value)} className={inputCls} readOnly={isReadOnly} placeholder="Lista los puntos de la agenda (Temas a ser tratados)..." />
                            </div>

                            {/* SECCIÓN 6: Desarrollo de la reunión */}
                            <SectionTitle>6. Desarrollo de la reunión</SectionTitle>
                            {participantes.length === 0 ? (
                                <p className={`text-sm italic ${dash.mutedSm}`}>Agrega participantes para registrar su desarrollo.</p>
                            ) : (
                                <div className="space-y-4">
                                    {participantes.map(p => (
                                        <div key={p.cedula} className={`p-4 ${dash.card}`}>
                                            <h4 className={`mb-2 flex items-center gap-2 ${dash.titleLg} !text-sm`}>
                                                <span className="w-2 h-2 rounded-full bg-[#2F7BB8]"></span>
                                                Evaluación de servicio: {p.nombre} <span className="font-normal text-slate-500 dark:text-slate-400">({p.cargo})</span>
                                            </h4>
                                            <div>
                                                <label className={`block mb-1 ${dash.labelFilter}`}>Observaciones / Comentarios</label>
                                                <textarea 
                                                    rows={3} 
                                                    value={p.desarrollo || ''} 
                                                    onChange={e => updateDesarrollo(p.cedula, e.target.value)} 
                                                    className={inputCls} 
                                                    readOnly={isReadOnly} 
                                                    placeholder={`Registra aquí lo conversado por ${p.nombre}...`} 
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* SECCIÓN 7: Planes de acción */}
                            <SectionTitle>7. Planes de acción</SectionTitle>
                            <div>
                                {!isReadOnly && (
                                    <button type="button" onClick={() => setPlanesOpen(true)} className="mb-4 inline-flex items-center gap-2 rounded-lg border border-[#2F7BB8] text-[#2F7BB8] px-3 py-1.5 text-sm font-semibold hover:bg-blue-50 transition-colors">
                                        + Agregar plan de acción
                                    </button>
                                )}

                                {planesAccion.length === 0 ? (
                                    <p className={`text-sm italic ${dash.mutedSm}`}>No hay planes de acción registrados.</p>
                                ) : (
                                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                                        <table className="w-full text-left text-sm">
                                            <thead className={dash.thead}>
                                                <tr>
                                                    <th className="p-4 font-semibold">Tarea / Acción</th>
                                                    <th className="p-4 font-semibold">Criticidad</th>
                                                    <th className="p-4 font-semibold">Responsable</th>
                                                    <th className="p-4 font-semibold">F. Entrega</th>
                                                    <th className="p-4 font-semibold">Recursos</th>
                                                    {!isReadOnly && <th className="p-4 font-semibold w-10"></th>}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {planesAccion.map((plan, idx) => (
                                                    <tr key={idx} className={dash.trHover}>
                                                        <td className={dash.tdCell}>{plan.tarea}</td>
                                                        <td className={dash.tdCell}>{plan.criticidad}</td>
                                                        <td className={dash.tdName}>{plan.responsable}</td>
                                                        <td className={dash.tdCell}>{plan.fechaEntrega}</td>
                                                        <td className={dash.tdMuted}>{plan.recursos || '-'}</td>
                                                        {!isReadOnly && (
                                                            <td className="px-4 py-2">
                                                                <button onClick={() => removePlan(idx)} className="text-red-500 font-bold px-2 py-1 rounded hover:bg-red-50">X</button>
                                                            </td>
                                                        )}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* SECCIÓN 8 y 9: Cierre */}
                            <SectionTitle>8. Cierre y Próxima Reunión</SectionTitle>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className={`block mb-1 ${dash.labelFilter}`}>Quien realiza el acta</label>
                                    <input type="text" value={quienRealizaNombre} className={inputCls} readOnly />
                                </div>
                                <div>
                                    <label className={`block mb-1 ${dash.labelFilter}`}>Cargo / Puesto</label>
                                    <input type="text" value={quienRealizaCargo} className={inputCls} readOnly />
                                </div>
                                <div className="md:col-span-2 mt-2">
                                    <label className={`block mb-1 ${dash.labelFilter}`}>Próxima reunión</label>
                                    <select 
                                        value={proximaReunion} 
                                        onChange={e => setProximaReunion(e.target.value)} 
                                        className={inputCls} 
                                        disabled={isReadOnly}
                                    >
                                        <option value="">-- Selecciona --</option>
                                        <option value="Seguimiento quincenal">Seguimiento quincenal</option>
                                        <option value="Seguimiento mensual">Seguimiento mensual</option>
                                        <option value="Seguimiento bimensual">Seguimiento bimensual</option>
                                        <option value="Seguimiento semestral">Seguimiento semestral</option>
                                    </select>
                                </div>
                            </div>
                            
                            {/* SECCIÓN OPCIONAL: Observaciones de Consultor (Visible si hay algo) */}
                            {observacionConsultor && (
                                <div className={`mt-6 p-4 rounded-xl border ${isLight ? 'border-amber-200 bg-amber-50' : 'border-amber-900/50 bg-amber-900/20'}`}>
                                    <h3 className={`text-sm font-bold flex items-center gap-2 mb-2 ${isLight ? 'text-amber-800' : 'text-amber-500'}`}>
                                        Observaciones del Consultor (Solo Lectura)
                                    </h3>
                                    <p className={`text-sm whitespace-pre-wrap ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                                        {observacionConsultor}
                                    </p>
                                    <p className="text-xs text-amber-600 mt-3 font-semibold">
                                        Registrado el: {new Date(observacionConsultorFecha).toLocaleString()}
                                    </p>
                                </div>
                            )}

                        </div>
                    )}
                </div>
            </GestionModalShell>

            <ParticipantesSubModal 
                open={participantesOpen} 
                onClose={() => setParticipantesOpen(false)} 
                colaboradores={colaboradores} 
                participantesActuales={participantes}
                onAccept={handleAcceptParticipantes} 
            />

            <PlanesAccionSubModal 
                open={planesOpen} 
                onClose={() => setPlanesOpen(false)} 
                onAdd={handleAddPlan} 
                minDateStr={minDateStr}
                maxDateStr={maxDateStr}
                participantes={participantes}
            />

            {/* Modal de confirmación */}
            <GestionModalShell
                open={confirmFinalizeOpen}
                onClose={() => setConfirmFinalizeOpen(false)}
                title="¿Finalizar Acta Oficial?"
                size="sm"
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <button className={dash.borrarFiltros} onClick={() => saveActa('Borrador')} disabled={saving}>Cancelar</button>
                        <button className={dash.btnPrimaryCinte} onClick={() => saveActa('FINALIZADO')} disabled={saving}>
                            {saving ? 'Finalizando...' : 'Finalizar'}
                        </button>
                    </div>
                }
            >
                <div className="p-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold rounded-lg flex items-center gap-2">
                            <span>{error}</span>
                        </div>
                    )}
                    <p className={`text-sm ${dash.muted}`}>
                        Al finalizar esta acta, se enviará su versión final y no podrá ser editada. Los consultores tendrán 3 días hábiles para agregar observaciones posteriores si aplica.
                    </p>
                    <div className={`p-4 rounded-xl border-l-4 border-amber-500 ${isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-900/20 border-amber-700/50'}`}>
                        <h3 className={`text-sm font-bold flex items-center gap-2 mb-2 ${isLight ? 'text-amber-800' : 'text-amber-500'}`}>
                            ⚠️ Advertencia de cierre
                        </h3>
                        <p className={`text-sm whitespace-pre-wrap ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                            Al <strong>Finalizar</strong> esta acta, el documento quedará cerrado. No podrás volver a editar ni los participantes, ni las evaluaciones, ni los planes de acción.
                        </p>
                        <p className="text-sm text-amber-600 mt-3 font-semibold">
                            ¿Estás seguro de que deseas registrarla como Finalizada?
                        </p>
                    </div>
                </div>
            </GestionModalShell>
        </>
    );
}
