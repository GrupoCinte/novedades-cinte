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
                if (data.observacion) {
                    setObservacion(data.observacion.observacion);
                }
            }
        } catch (e) {
            console.error('Error cargando contexto aptitud:', e);
        }
    };

    const handleGuardarObservacion = async () => {
        if (!observacion.trim()) { setError('La observación no puede estar vacía'); return; }
        if (observacion.length > 1000) { setError('La observación excede 1000 caracteres'); return; }

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
                setSuccess('Observación guardada exitosamente');
                await cargarContextoAptitud();
            } else {
                setError(data.error || 'Error al guardar observación');
            }
        } catch {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    const handleGuardarDecision = async () => {
        if (!decision) { setError('Seleccione una decisión'); return; }
        if (!justificacion.trim()) { setError('La justificación es obligatoria'); return; }
        if (justificacion.length > 500) { setError('La justificación excede 500 caracteres'); return; }

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
                setSuccess('Decisión guardada exitosamente');
                await cargarContextoAptitud();
                setDecision(''); setJustificacion('');
            } else {
                setError(data.error || 'Error al guardar decisión');
            }
        } catch {
            setError('Error de conexión');
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
                    <div className="space-y-4 border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700 pb-4 md:pb-0 md:pr-4">
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Información de Pipeline</h3>
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
                        
                        {/* OBSERVACIÓN DE CH */}
                        <div>
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                Observación de Capital Humano
                            </h3>
                            {observacionActual ? (
                                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                                    <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-300">
                                        <span className="font-semibold">v{observacionActual.version}</span>
                                        <span>·</span>
                                        <span>{observacionActual.actor_nombre || 'Usuario'}</span>
                                    </div>
                                    <p className="text-sm text-slate-700 dark:text-slate-300 mt-1 whitespace-pre-wrap">
                                        {observacionActual.observacion}
                                    </p>
                                    {historialObs.length > 1 && (
                                        <button type="button" onClick={() => setMostrarHistorialObs(!mostrarHistorialObs)} className="text-xs text-blue-600 hover:underline mt-1">
                                            {mostrarHistorialObs ? 'Ocultar historial' : `Ver historial (${historialObs.length} versiones)`}
                                        </button>
                                    )}
                                    {mostrarHistorialObs && historialObs.slice(1).map((item) => (
                                        <div key={item.id} className="mt-2 p-2 rounded bg-blue-100/50 dark:bg-blue-800/20 text-xs text-slate-600 dark:text-slate-300">
                                            <span className="font-semibold text-blue-500">v{item.version}</span> · {item.actor_nombre}
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
                                        onChange={(e) => { if (e.target.value.length <= 1000) setObservacion(e.target.value); setError(''); }}
                                        placeholder="Nueva observación (CH)..."
                                        className="w-full p-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 min-h-[60px]"
                                    />
                                    <button type="button" onClick={handleGuardarObservacion} disabled={loading || !observacion.trim()} className="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">
                                        {loading ? 'Guardando...' : (observacionActual ? 'Actualizar Observación' : 'Guardar Observación')}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* DECISIÓN DE GP */}
                        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
                                Decisión de Aptitud
                            </h3>
                            {decisionActual ? (
                                <div className={`p-3 rounded-lg border ${decisionActual.decision === 'APTO' ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800' : 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800'}`}>
                                    <div className="flex items-center gap-2">
                                        {decisionActual.decision === 'APTO' ? <CheckCircle size={16} className="text-green-600" /> : <XCircle size={16} className="text-red-600" />}
                                        <span className={`font-semibold ${decisionActual.decision === 'APTO' ? 'text-green-700' : 'text-red-700'}`}>
                                            {decisionActual.decision}
                                        </span>
                                        <span className="text-xs text-gray-500">· {decisionActual.actor_nombre}</span>
                                    </div>
                                    <p className="text-sm text-slate-700 mt-1">
                                        <span className="font-medium">Justificación:</span> {decisionActual.justificacion}
                                    </p>
                                    {historialDec.length > 1 && (
                                        <details className="mt-2 text-xs">
                                            <summary className="text-blue-600 cursor-pointer">Ver historial</summary>
                                            {historialDec.slice(1).map((item) => (
                                                <div key={item.id} className="mt-1 p-2 bg-white/50 rounded">
                                                    <span className="font-semibold">{item.decision}</span> · {item.actor_nombre}
                                                    <p>{item.justificacion}</p>
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
                                        <button type="button" onClick={() => setDecision('APTO')} className={`flex-1 p-1.5 rounded border text-sm flex justify-center gap-1 items-center ${decision === 'APTO' ? 'border-green-500 bg-green-50' : 'border-gray-300'}`}>
                                            <CheckCircle size={14} className="text-green-600" /> Apto
                                        </button>
                                        <button type="button" onClick={() => setDecision('NO_APTO')} className={`flex-1 p-1.5 rounded border text-sm flex justify-center gap-1 items-center ${decision === 'NO_APTO' ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}>
                                            <XCircle size={14} className="text-red-600" /> No Apto
                                        </button>
                                    </div>
                                    <textarea
                                        value={justificacion}
                                        onChange={(e) => { if (e.target.value.length <= 500) setJustificacion(e.target.value); setError(''); }}
                                        placeholder="Justificación de la decisión..."
                                        className="w-full p-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 min-h-[50px]"
                                    />
                                    <button type="button" onClick={handleGuardarDecision} disabled={loading || !decision || !justificacion.trim()} className="mt-2 px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">
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
