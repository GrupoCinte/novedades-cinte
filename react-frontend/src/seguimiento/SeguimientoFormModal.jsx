import React, { useState, useEffect, useCallback, useMemo } from 'react';
import GestionModalShell from '../shared/modals/GestionModalShell.jsx';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';
import { authHeaders } from '../shared/authUtils.js';

import ParticipantesSubModal from './ParticipantesSubModal.jsx';
import PlanesAccionSubModal from './PlanesAccionSubModal.jsx';

const parseActaData = (actaData, gpName, gpPuesto, tipoSeleccionado, clientesCartera) => {
    if (!actaData) {
        return {
            tipo: tipoSeleccionado || 'Consultor',
            cliente: clientesCartera.length === 1 ? clientesCartera[0] : '',
            fechaActa: new Date().toISOString().split('T')[0],
            isFinalizado: false,
            horaInicio: '',
            horaFin: '',
            responsableNombre: gpName,
            responsableCargo: gpPuesto,
            quienRealizaNombre: gpName,
            quienRealizaCargo: gpPuesto,
            objetivo: '',
            agenda: '',
            participantes: [],
            planesAccion: [],
            observacionConsultor: '',
            observacionConsultorFecha: ''
        };
    }

    const pJson = actaData.payload_json || {};
    return {
        tipo: actaData.tipo === 'cliente' ? 'Cliente' : 'Consultor',
        cliente: actaData.cliente || '',
        fechaActa: actaData.fecha_acta ? new Date(actaData.fecha_acta).toISOString().split('T')[0] : '',
        isFinalizado: actaData.estado === 'FINALIZADO',
        horaInicio: pJson.hora_inicio || '',
        horaFin: pJson.hora_fin || '',
        responsableNombre: pJson.responsable_nombre || gpName,
        responsableCargo: pJson.responsable_cargo || gpPuesto,
        quienRealizaNombre: pJson.quien_realiza_nombre || gpName,
        quienRealizaCargo: pJson.quien_realiza_cargo || gpPuesto,
        objetivo: pJson.objetivo || '',
        agenda: pJson.agenda || '',
        participantes: pJson.participantes_detalle || [],
        planesAccion: pJson.planes_accion || [],
        observacionConsultor: pJson.observacion_consultor || '',
        observacionConsultorFecha: pJson.observacion_consultor_fecha || ''
    };
};

const getRole = (auth) => String(auth?.user?.role || auth?.claims?.role || '').trim().toLowerCase();
const getGpEmail = (auth) => String(auth?.user?.email || auth?.claims?.email || '').trim().toLowerCase();
const getGpName = (auth) => String(auth?.user?.name || auth?.claims?.name || '').trim();

const getGpPuesto = (colabs, gpEmail) => {
    const gpColab = colabs.find(c => {
        const ce = String(c.correo || c.email || '').trim().toLowerCase();
        return ce && ce === gpEmail;
    });
    return gpColab ? (gpColab.puesto || gpColab.cargo || '') : '';
};

const validateActaData = (cliente, fechaActa, horaInicio, horaFin, participantes) => {
    if (!cliente) return 'Debes seleccionar un cliente.';
    if (!fechaActa || !horaInicio || !horaFin) return 'Debes proveer la fecha y las horas de inicio y fin.';
    if (participantes.length === 0) return 'Debes agregar al menos un participante para diligenciar el desarrollo.';
    return null;
};

const mergeParticipantes = (current, selected) => {
    const currentMap = new Map(current.map(p => [p.cedula, p]));
    return selected.map(s => currentMap.get(s.cedula) || { ...s, desarrollo: '' });
};

const SectionTitle = ({ children }) => {
    const { isLight } = useModuleTheme();
    return (
        <h3 className={`text-base font-bold mt-6 mb-4 pb-2 border-b ${isLight ? 'border-slate-200 text-[#2F7BB8]' : 'border-slate-700 text-[#65BCF7]'}`}>
            {children}
        </h3>
    );
};

const Label = ({ children }) => {
    const { isLight } = useModuleTheme();
    return (
        <label className={`block text-xs font-semibold uppercase tracking-wider mb-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
            {children}
        </label>
    );
};

const ParticipantesSection = ({ participantes, isReadOnly, removeParticipante, setParticipantesOpen, isLight, dash }) => (
    <div>
        {!isReadOnly && (
            <button type="button" onClick={() => setParticipantesOpen(true)} className="mb-4 inline-flex items-center gap-2 rounded-lg border border-[#2F7BB8] text-[#2F7BB8] px-3 py-1.5 text-sm font-semibold hover:bg-blue-50 transition-colors">
                + Agregar participantes
            </button>
        )}
        
        {participantes.length === 0 ? (
            <p className={`text-sm italic ${dash.mutedSm}`}>No hay participantes seleccionados.</p>
        ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 text-slate-700">
                        <tr>
                            <th className="px-4 py-2">Nombre</th>
                            <th className="px-4 py-2">Cargo</th>
                            <th className="px-4 py-2">Empresa</th>
                            {!isReadOnly && <th className="px-4 py-2 w-10"></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {participantes.map(p => (
                            <tr key={p.cedula} className="border-t border-slate-200">
                                <td className="px-4 py-2 font-medium">{p.nombre}</td>
                                <td className="px-4 py-2 text-slate-500">{p.cargo}</td>
                                <td className="px-4 py-2 text-slate-500">{p.empresa}</td>
                                {!isReadOnly && (
                                    <td className="px-4 py-2">
                                        <button type="button" onClick={() => removeParticipante(p.cedula)} className="text-red-500 font-bold px-2 py-1 rounded hover:bg-red-50">X</button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </div>
);

const DesarrolloSection = ({ participantes, isReadOnly, isLight, dash, inputCls, updateDesarrollo }) => (
    <>
        {participantes.length === 0 ? (
            <p className={`text-sm italic ${dash.mutedSm}`}>Agrega participantes para registrar su desarrollo.</p>
        ) : (
            <div className="space-y-4">
                {participantes.map(p => (
                    <div key={p.cedula} className={`p-4 rounded-lg border ${isLight ? 'border-slate-200 bg-white shadow-sm' : 'border-slate-700 bg-slate-800'}`}>
                        <h4 className={`text-sm font-bold mb-2 flex items-center gap-2 ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                            <span className="w-2 h-2 rounded-full bg-[#2F7BB8]"></span>
                            Intervención: {p.nombre} <span className="font-normal opacity-70 text-xs">({p.cargo})</span>
                        </h4>
                        <textarea 
                            rows={3} 
                            value={p.desarrollo || ''} 
                            onChange={e => updateDesarrollo(p.cedula, e.target.value)} 
                            className={inputCls} 
                            disabled={isReadOnly} 
                            placeholder={`Registra aquí lo conversado por ${p.nombre}...`} 
                        />
                    </div>
                ))}
            </div>
        )}
    </>
);

const PlanesAccionSection = ({ planesAccion, isReadOnly, setPlanesOpen, removePlan, isLight, dash }) => (
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
                    <thead className="bg-slate-100 text-slate-700">
                        <tr>
                            <th className="px-4 py-2">Tarea</th>
                            <th className="px-4 py-2">Crit.</th>
                            <th className="px-4 py-2">Responsable</th>
                            <th className="px-4 py-2">Entrega</th>
                            <th className="px-4 py-2">Recursos</th>
                            {!isReadOnly && <th className="px-4 py-2 w-10"></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {planesAccion.map((plan, idx) => (
                            <tr key={`${plan.tarea}-${idx}`} className="border-t border-slate-200">
                                <td className="px-4 py-2">{plan.tarea}</td>
                                <td className="px-4 py-2 font-medium">{plan.criticidad.charAt(0)}</td>
                                <td className="px-4 py-2">{plan.responsable}</td>
                                <td className="px-4 py-2 whitespace-nowrap">{plan.fechaEntrega}</td>
                                <td className="px-4 py-2 text-xs">{plan.recursos}</td>
                                {!isReadOnly && (
                                    <td className="px-4 py-2">
                                        <button type="button" onClick={() => removePlan(idx)} className="text-red-500 font-bold px-2 py-1 rounded hover:bg-red-50">X</button>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </div>
);

export default function SeguimientoFormModal({ 
    open, 
    onClose, 
    actaId, 
    actaData, // The actual data passed from the parent row
    token, 
    auth, 
    onSaved,
    tipoSeleccionado,
    clientesCartera = []
}) {
    const { isLight } = useModuleTheme();
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const inputCls = isLight 
        ? 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-[#2F7BB8] focus:ring-1 focus:ring-[#2F7BB8] disabled:opacity-60'
        : 'w-full rounded-lg border border-slate-600 bg-[#1e293b] px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#2F7BB8] focus:ring-1 focus:ring-[#2F7BB8] disabled:opacity-60';
    
    const role = getRole(auth);
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
            
            const gpEmail = getGpEmail(auth);
            const gpName = getGpName(auth);
            
            fetch('/api/directorio/colaboradores', fetchOpts())
                .then(r => r.json())
                .then(d => {
                    const colabs = d.items || [];
                    setColaboradores(colabs);
                    
                    const gpPuesto = getGpPuesto(colabs, gpEmail);
                    
                    const parsed = parseActaData(actaId ? actaData : null, gpName, gpPuesto, tipoSeleccionado, clientesCartera);
                    
                    setTipo(parsed.tipo);
                    setCliente(parsed.cliente);
                    setFechaActa(parsed.fechaActa);
                    setIsFinalizado(parsed.isFinalizado);
                    setHoraInicio(parsed.horaInicio);
                    setHoraFin(parsed.horaFin);
                    setResponsableNombre(parsed.responsableNombre);
                    setResponsableCargo(parsed.responsableCargo);
                    setQuienRealizaNombre(parsed.quienRealizaNombre);
                    setQuienRealizaCargo(parsed.quienRealizaCargo);
                    setObjetivo(parsed.objetivo);
                    setAgenda(parsed.agenda);
                    setParticipantes(parsed.participantes);
                    setPlanesAccion(parsed.planesAccion);
                    setObservacionConsultor(parsed.observacionConsultor);
                    setObservacionConsultorFecha(parsed.observacionConsultorFecha);
                })
                .catch(console.error)
                .finally(() => setLoading(false));
        }
    }, [open, actaId, actaData, tipoSeleccionado, fetchOpts, clientesCartera, auth]);

    // Helpers
    const isReadOnly = isFinalizado && isGp;

    // Participantes Logic
    const handleAcceptParticipantes = (selectedItems) => {
        setParticipantes(mergeParticipantes(participantes, selectedItems));
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

    const saveActa = async (estadoFinal) => {
        const validationError = validateActaData(cliente, fechaActa, horaInicio, horaFin, participantes);
        if (validationError) {
            setError(validationError);
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
            participantes_detalle: participantes, // Completo con su campo 'desarrollo'
            planes_accion: planesAccion
        };

        const payload = {
            tipo: tipo.toLowerCase(),
            cliente,
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
            onSaved();
            onClose();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    // UI Components

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
                        <div className="flex gap-2">
                            <button type="button" className={dash.borrarFiltros} onClick={onClose} disabled={saving}>Cancelar</button>
                            {!isReadOnly && (
                                <button type="button" className={dash.btnPrimaryCinte} onClick={() => saveActa('Borrador')} disabled={saving}>
                                    {saving ? 'Guardando...' : 'Guardar Borrador'}
                                </button>
                            )}
                            {!isReadOnly && (
                                <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-all disabled:opacity-50" onClick={() => setConfirmFinalizeOpen(true)} disabled={saving}>
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
                                <div>
                                    <Label>Tipo de Acta</Label>
                                    <input type="text" readOnly value={tipo} className={inputCls} disabled />
                                </div>
                                <div className="md:col-span-3">
                                    <Label>Cliente Asignado</Label>
                                    {clientesCartera.length > 0 ? (
                                        <select value={cliente} onChange={e => setCliente(e.target.value)} className={inputCls} disabled={isReadOnly}>
                                            <option value="">-- Seleccionar Cliente --</option>
                                            {clientesCartera.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    ) : (
                                        <input type="text" value={cliente} onChange={e => setCliente(e.target.value)} className={inputCls} disabled={isReadOnly} placeholder="Nombre del cliente" />
                                    )}
                                </div>
                                <div className="md:col-span-2">
                                    <Label>Fecha de reunión</Label>
                                    <input 
                                        type="date" 
                                        value={fechaActa} 
                                        onChange={e => setFechaActa(e.target.value)} 
                                        min={minDateStr}
                                        max={maxDateStr}
                                        className={inputCls} 
                                        disabled={isReadOnly} 
                                    />
                                </div>
                                <div>
                                    <Label>Hora Inicio</Label>
                                    <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} className={inputCls} disabled={isReadOnly} />
                                </div>
                                <div>
                                    <Label>Hora de finalización</Label>
                                    <input type="time" value={horaFin} onChange={e => setHoraFin(e.target.value)} className={inputCls} disabled={isReadOnly} />
                                </div>
                            </div>

                            {/* SECCIÓN 2: Responsable */}
                            <SectionTitle>2. Responsable de la reunión</SectionTitle>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label>Nombres y apellidos</Label>
                                    <input type="text" value={responsableNombre} onChange={e => setResponsableNombre(e.target.value)} className={inputCls} disabled={isReadOnly} readOnly />
                                </div>
                                <div>
                                    <Label>Cargo / Puesto</Label>
                                    <input type="text" value={responsableCargo} onChange={e => setResponsableCargo(e.target.value)} className={inputCls} disabled={isReadOnly} readOnly />
                                </div>
                            </div>

                            {/* SECCIÓN 3: Objetivo */}
                            <SectionTitle>3. Objetivo</SectionTitle>
                            <div>
                                <textarea rows={2} value={objetivo} onChange={e => setObjetivo(e.target.value)} className={inputCls} disabled={isReadOnly} placeholder="¿Cuál fue el propósito de este seguimiento?" />
                            </div>

                            {/* SECCIÓN 4: Participantes */}
                            <SectionTitle>4. Participantes</SectionTitle>
                            <ParticipantesSection 
                                participantes={participantes}
                                isReadOnly={isReadOnly}
                                removeParticipante={removeParticipante}
                                setParticipantesOpen={setParticipantesOpen}
                                isLight={isLight}
                                dash={dash}
                            />

                            {/* SECCIÓN 5: Agenda */}
                            <SectionTitle>5. Agenda</SectionTitle>
                            <div>
                                <textarea rows={4} value={agenda} onChange={e => setAgenda(e.target.value)} className={inputCls} disabled={isReadOnly} placeholder="Lista los puntos de la agenda (Temas a ser tratados)..." />
                            </div>

                            {/* SECCIÓN 6: Desarrollo de la reunión */}
                            <SectionTitle>6. Desarrollo de la reunión</SectionTitle>
                            <DesarrolloSection 
                                participantes={participantes}
                                isReadOnly={isReadOnly}
                                isLight={isLight}
                                dash={dash}
                                inputCls={inputCls}
                                updateDesarrollo={updateDesarrollo}
                            />

                            {/* SECCIÓN 7: Planes de acción */}
                            <SectionTitle>7. Planes de acción</SectionTitle>
                            <PlanesAccionSection 
                                planesAccion={planesAccion}
                                isReadOnly={isReadOnly}
                                setPlanesOpen={setPlanesOpen}
                                removePlan={removePlan}
                                isLight={isLight}
                                dash={dash}
                            />

                            {/* SECCIÓN 8 y 9: Cierre */}
                            <SectionTitle>8. Cierre y Próxima Reunión</SectionTitle>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <Label>Quien realiza el acta</Label>
                                    <input type="text" value={quienRealizaNombre} className={inputCls} disabled readOnly />
                                </div>
                                <div>
                                    <Label>Cargo / Puesto</Label>
                                    <input type="text" value={quienRealizaCargo} className={inputCls} disabled readOnly />
                                </div>
                                <div className="md:col-span-2 mt-2">
                                    <Label>Próxima reunión</Label>
                                    <input type="text" value="Próxima reunión mensual" className={inputCls} disabled readOnly />
                                </div>
                            </div>
                            
                            {/* SECCIÓN OPCIONAL: Observaciones de Consultor (Visible si hay algo) */}
                            {observacionConsultor && (
                                <div className={`mt-6 p-4 rounded-xl border ${isLight ? 'border-amber-200 bg-amber-50' : 'border-amber-900 bg-amber-900/20'}`}>
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
            />

            {/* Modal de confirmación */}
            <GestionModalShell
                open={confirmFinalizeOpen}
                onClose={() => setConfirmFinalizeOpen(false)}
                title="¿Finalizar Acta Oficial?"
                size="sm"
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <button type="button" className={dash.borrarFiltros} onClick={() => setConfirmFinalizeOpen(false)} disabled={saving}>Cancelar</button>
                        <button type="button" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700" onClick={() => saveActa('FINALIZADO')} disabled={saving}>
                            {saving ? 'Finalizando...' : 'Sí, Finalizar'}
                        </button>
                    </div>
                }
            >
                <div className="p-4">
                    <p className={`text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        Al finalizar esta acta, se enviará su versión final y no podrá ser editada. Los consultores tendrán 3 días hábiles para agregar observaciones posteriores si aplica.
                    </p>
                </div>
            </GestionModalShell>
        </>
    );
}
