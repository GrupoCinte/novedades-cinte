import { CheckCircle, XCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useModuleTheme } from './moduleTheme.js';
import { buildGestionTableDash } from './gestionTableDashTheme.js';
import { nativeCalendarOnlyInputProps } from './nativeCalendarOnlyInputProps.js';
import { canRegisterObservacion, canDecideAptitud } from './reubicacionesAccess';

function getCsrfToken() {
    const match = /cinteXsrf=([^;]+)/.exec(document.cookie);
    return match ? match[1] : '';
}

export function ReubicacionesDetalleModal({ 
    isOpen, onClose, row, token, auth, 
    editForm, setEditForm, submitEdit, canEdit, editSaving 
}) {
    const { isLight, field, labelMuted, headingAccent } = useModuleTheme();
    const dash = buildGestionTableDash(Boolean(isLight));

    const [observacion, setObservacion] = useState('');
    const [observacionActual, setObservacionActual] = useState(null);
    const [historialObs, setHistorialObs] = useState([]);
    const [mostrarHistorialObs, setMostrarHistorialObs] = useState(false);
    
    const [decision, setDecision] = useState('');
    const [justificacion, setJustificacion] = useState('');
    const [decisionActual, setDecisionActual] = useState(null);
    const [historialDec, setHistorialDec] = useState([]);
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const showError = (msg) => {
        setError(msg);
        setSuccess('');
        setTimeout(() => setError(''), 4000);
    };

    const showSuccess = (msg) => {
        setSuccess(msg);
        setError('');
        setTimeout(() => setSuccess(''), 4000);
    };

    const puedeEscribirObs = canRegisterObservacion(auth);
    const puedeDecidir = canDecideAptitud(auth);

    useEffect(() => {
        if (isOpen && row?.id) {
            cargarContextoAptitud();
        }
    }, [isOpen, row?.id]);

    const cargarContextoAptitud = async () => {
        try {
            const res = await fetch(`/api/directorio/reubicaciones-pipeline/${row.id}/aptitud-context`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.ok) {
                setObservacionActual(data.observacion || null);
                setHistorialObs(data.historialObs || []);
                setDecisionActual(data.decision || null);
                setHistorialDec(data.historialDec || []);
                // Se removió el pre-llenado de la observación (setObservacion) para cumplir CA-02
            }
        } catch (e) {
            console.error('Error cargando contexto aptitud:', e);
        }
    };

    const handleGuardarObservacion = async () => {
        if (!observacion.trim()) { showError('La observación es obligatoria'); return; }
        if (observacion.length > 1000) { showError('La observación excede 1000 caracteres'); return; }

        setLoading(true); setError(''); setSuccess('');
        const idempotencyKey = crypto.randomUUID();

        try {
            const res = await fetch(`/api/directorio/reubicaciones-pipeline/${row.id}/observacion`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-cinte-xsrf': getCsrfToken(),
                    'Idempotency-Key': idempotencyKey
                },
                body: JSON.stringify({ 
                    observacion: observacion.trim(),
                    expectedVersion: observacionActual ? observacionActual.version : 0
                })
            });
            const data = await res.json();
            if (data.ok) {
                showSuccess('Observación guardada exitosamente');
                setObservacion(''); // Limpiar caja después de guardar con éxito
                await cargarContextoAptitud();
            } else {
                showError(data.error || 'Error al guardar observación');
            }
        } catch {
            showError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    const handleGuardarDecision = async () => {
        if (!decision) { showError('Debe seleccionar una decisión (Apto / No Apto)'); return; }
        if (!justificacion.trim()) { showError('La justificación es obligatoria'); return; }
        if (justificacion.length > 500) { showError('La justificación excede 500 caracteres'); return; }

        setLoading(true); setError(''); setSuccess('');
        const idempotencyKey = crypto.randomUUID();

        try {
            const res = await fetch(`/api/directorio/reubicaciones-pipeline/${row.id}/decision`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-cinte-xsrf': getCsrfToken(),
                    'Idempotency-Key': idempotencyKey
                },
                body: JSON.stringify({ decision, justificacion: justificacion.trim() })
            });
            const data = await res.json();
            if (data.ok) {
                showSuccess('Decisión guardada exitosamente');
                await cargarContextoAptitud();
                setDecision(''); setJustificacion('');
            } else {
                showError(data.error || 'Error al guardar decisión');
            }
        } catch {
            showError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !row) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
            <div className={`relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border p-6 shadow-xl ${isLight ? 'border-slate-200 bg-white' : 'border-[var(--border)] bg-[var(--surface)]'}`}>
                <h2 className={`text-lg font-heading font-bold mb-4 ${headingAccent}`}>
                    Detalle y Seguimiento de Reubicación
                </h2>
                <p className={`text-xs ${labelMuted} mb-4`}>
                    Cédula {row.cedula} · {row.consultor || 'Consultor'}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* COLUMNA IZQUIERDA: Formulario de edición principal */}
                    <div className={`space-y-4 border-b md:border-b-0 md:border-r pb-4 md:pb-0 md:pr-4 ${isLight ? 'border-slate-200' : 'border-slate-700'}`}>
                        <h3 className={`text-sm font-semibold mb-2 ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>Información de Pipeline</h3>
                        <form onSubmit={submitEdit} className="space-y-3">
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>Fecha fin *</label>
                                <input
                                    {...nativeCalendarOnlyInputProps}
                                    type="date"
                                    className={`w-full ${field}`}
                                    value={editForm.fecha_fin}
                                    onChange={(e) => setEditForm((f) => ({ ...f, fecha_fin: e.target.value }))}
                                    required
                                    disabled={!canEdit}
                                />
                            </div>
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>Cliente destino</label>
                                <input
                                    className={`w-full ${field}`}
                                    value={editForm.cliente_destino}
                                    onChange={(e) => setEditForm((f) => ({ ...f, cliente_destino: e.target.value }))}
                                    disabled={!canEdit}
                                />
                            </div>
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>Causal</label>
                                <input
                                    className={`w-full ${field}`}
                                    value={editForm.causal}
                                    onChange={(e) => setEditForm((f) => ({ ...f, causal: e.target.value }))}
                                    disabled={!canEdit}
                                />
                            </div>
                            {canEdit && (
                                <div className="flex justify-end pt-2">
                                    <button type="submit" disabled={editSaving} className="px-4 py-1.5 bg-[#2F7BB8] text-white text-sm rounded-lg font-semibold hover:bg-[#25649a]">
                                        {editSaving ? 'Guardando...' : 'Actualizar Datos'}
                                    </button>
                                </div>
                            )}
                        </form>
                    </div>

                    {/* COLUMNA DERECHA: Observación y Decisión */}
                    <div className="space-y-6">
                        
                        {/* EVALUACIÓN DE DESEMPEÑO (CA-07) */}
                        <div>
                            <h3 className={`text-sm font-semibold mb-2 ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                                Evaluación de Desempeño
                            </h3>
                            <div className={`p-3 rounded-lg border ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-slate-800/50'}`}>
                                <p className={`text-sm italic ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                    Sin evaluación
                                </p>
                            </div>
                        </div>

                        {/* OBSERVACIÓN DE CH */}
                        <div>
                            <h3 className={`text-sm font-semibold mb-2 ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                                Observación de Capital Humano
                            </h3>
                            {observacionActual ? (
                                <div className={`p-3 rounded-lg border ${isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-900/20 border-blue-800'}`}>
                                    <div className={`flex items-center gap-2 text-xs ${isLight ? 'text-blue-600' : 'text-blue-300'}`}>
                                        <span className="font-semibold">v{observacionActual.version}</span>
                                        <span>·</span>
                                        <span>{observacionActual.actor_nombre || 'Usuario'}</span>
                                        <span>·</span>
                                        <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>{new Date(observacionActual.fecha).toLocaleString()}</span>
                                    </div>
                                    <p className={`text-sm mt-1 whitespace-pre-wrap ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                                        {observacionActual.observacion}
                                    </p>
                                    {historialObs.length > 1 && (
                                        <button type="button" onClick={() => setMostrarHistorialObs(!mostrarHistorialObs)} className="text-xs text-blue-600 hover:underline mt-1">
                                            {mostrarHistorialObs ? 'Ocultar historial' : `Ver historial (${historialObs.length} versiones)`}
                                        </button>
                                    )}
                                    {mostrarHistorialObs && historialObs.slice(1).map((item) => (
                                        <div key={item.id} className={`mt-2 p-2 rounded text-xs ${isLight ? 'bg-blue-100/50 text-slate-600' : 'bg-blue-800/20 text-slate-300'}`}>
                                            <div className="flex items-center gap-2">
                                                <span className={`font-semibold ${isLight ? 'text-blue-500' : 'text-blue-400'}`}>v{item.version}</span>
                                                <span>·</span>
                                                <span className={isLight ? 'text-slate-700' : 'text-slate-200'}>{item.actor_nombre}</span>
                                                <span>·</span>
                                                <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>{new Date(item.fecha).toLocaleString()}</span>
                                            </div>
                                            <p className="mt-0.5">{item.observacion}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-gray-500">Sin observación registrada.</p>
                            )}
                            
                            {puedeEscribirObs && (
                                <div className="mt-3">
                                    <textarea
                                        value={observacion}
                                        onChange={(e) => { setObservacion(e.target.value); setError(''); }}
                                        placeholder="Nueva observación (CH)..."
                                        className={`w-full min-h-[60px] ${field}`}
                                    />
                                    <button type="button" onClick={handleGuardarObservacion} disabled={loading} className="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                                        {loading ? 'Guardando...' : 'Guardar Observación'}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* DECISIÓN DE GP */}
                        <div className={`border-t pt-4 ${isLight ? 'border-slate-200' : 'border-slate-700'}`}>
                            <h3 className={`text-sm font-semibold mb-2 ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                                Decisión de Aptitud
                            </h3>
                            {decisionActual ? (
                                <div className={`p-3 rounded-lg border ${decisionActual.decision === 'APTO' ? (isLight ? 'bg-green-50 border-green-200' : 'bg-green-900/20 border-green-800') : (isLight ? 'bg-red-50 border-red-200' : 'bg-red-900/20 border-red-800')}`}>
                                    <div className="flex items-center gap-2">
                                        {decisionActual.decision === 'APTO' ? <CheckCircle size={16} className={isLight ? 'text-green-600' : 'text-green-400'} /> : <XCircle size={16} className={isLight ? 'text-red-600' : 'text-red-400'} />}
                                        <span className={`font-semibold ${decisionActual.decision === 'APTO' ? (isLight ? 'text-green-700' : 'text-green-400') : (isLight ? 'text-red-700' : 'text-red-400')}`}>
                                            {decisionActual.decision}
                                        </span>
                                        <span className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>· {decisionActual.actor_nombre}</span>
                                        <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>· {new Date(decisionActual.fecha).toLocaleString()}</span>
                                    </div>
                                    <p className={`text-sm mt-1 ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                                        <span className={`font-medium ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>Justificación:</span> {decisionActual.justificacion}
                                    </p>
                                    {historialDec.length > 1 && (
                                        <details className="mt-2 text-xs">
                                            <summary className="text-blue-600 cursor-pointer font-medium hover:underline">Ver historial ({historialDec.length - 1} versiones anteriores)</summary>
                                            {historialDec.slice(1).map((item) => (
                                                <div key={item.id} className={`mt-2 p-2 rounded border ${item.decision === 'APTO' ? (isLight ? 'bg-green-50/50 border-green-200' : 'bg-green-900/20 border-green-800') : (isLight ? 'bg-red-50/50 border-red-200' : 'bg-red-900/20 border-red-800')}`}>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider ${item.decision === 'APTO' ? (isLight ? 'bg-green-600 text-white' : 'bg-green-700 text-white') : (isLight ? 'bg-red-600 text-white' : 'bg-red-700 text-white')}`}>
                                                            {item.decision}
                                                        </span>
                                                        <span className={`font-medium text-xs ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{item.actor_nombre}</span>
                                                        <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>· {new Date(item.fecha).toLocaleString()}</span>
                                                    </div>
                                                    <p className={`text-sm ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{item.justificacion}</p>
                                                </div>
                                            ))}
                                        </details>
                                    )}
                                </div>
                            ) : (
                                <p className="text-xs text-gray-500">Sin decisión tomada.</p>
                            )}

                            {puedeDecidir && (
                                <div className="mt-3">
                                    <div className="flex gap-2 mb-2">
                                        <button type="button" onClick={() => { setDecision('APTO'); setError(''); }} className={`flex-1 p-2 rounded-lg border text-sm flex justify-center gap-1 items-center transition-colors font-medium ${decision === 'APTO' ? 'border-green-600 bg-green-600 text-white shadow-sm' : 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:border-slate-400'}`}>
                                            <CheckCircle size={16} className={decision === 'APTO' ? 'text-white' : 'text-green-600'} /> Apto
                                        </button>
                                        <button type="button" onClick={() => { setDecision('NO_APTO'); setError(''); }} className={`flex-1 p-2 rounded-lg border text-sm flex justify-center gap-1 items-center transition-colors font-medium ${decision === 'NO_APTO' ? 'border-red-600 bg-red-600 text-white shadow-sm' : 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:border-slate-400'}`}>
                                            <XCircle size={16} className={decision === 'NO_APTO' ? 'text-white' : 'text-red-600'} /> No Apto
                                        </button>
                                    </div>
                                    <textarea
                                        value={justificacion}
                                        onChange={(e) => { setJustificacion(e.target.value); setError(''); }}
                                        placeholder="Justificación de la decisión..."
                                        className={`w-full min-h-[60px] ${field}`}
                                    />
                                    <button type="button" onClick={handleGuardarDecision} disabled={loading} className="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                                        Guardar Decisión
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {error && <div className="mt-4 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-600">{error}</div>}
                {success && <div className="mt-4 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-600">{success}</div>}

                <div className="mt-6 flex justify-end">
                    <button type="button" className={dash.compactBtn} onClick={onClose}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
