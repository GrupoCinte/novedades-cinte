import { CheckCircle, XCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import MonitorGlassModalShell from './shared/modals/MonitorGlassModalShell.jsx';
import { useModuleTheme } from './moduleTheme.js';
import { nativeCalendarOnlyInputProps } from './nativeCalendarOnlyInputProps.js';
import { canRegisterObservacion, canDecideAptitud } from './reubicacionesAccess';
import { formatMoneyAmountOnly } from './multiCurrencyMoney.js';

function getCsrfToken() {
    const match = /cinteXsrf=([^;]+)/.exec(document.cookie);
    return match ? match[1] : '';
}

function formatMontoDisplay(val, currencyCode = 'COP') {
    if (val == null || val === '') return '—';
    const num = Number(val);
    if (!Number.isFinite(num)) return '—';
    const ccy = currencyCode || 'COP';
    return `$ ${formatMoneyAmountOnly(num, ccy)}`;
}

// Subcomponente de Formulario Principal
function FormInformacionPipeline({ isLight, field, labelMuted, editForm, setEditForm, submitEdit, canEdit, editSaving }) {
    return (
        <div className={`space-y-4`}>
            <h3 className={`text-sm font-semibold mb-2 ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>Edición de Información</h3>
            <form onSubmit={submitEdit} className="space-y-3">
                <div>
                    <label htmlFor="fecha_fin" className={`block text-xs ${labelMuted} mb-1`}>Fecha fin *</label>
                    <input id="fecha_fin" {...nativeCalendarOnlyInputProps} type="date" className={`w-full ${field}`} value={editForm.fecha_fin} onChange={(e) => setEditForm((f) => ({ ...f, fecha_fin: e.target.value }))} required disabled={!canEdit} />
                </div>
                <div>
                    <label htmlFor="cliente_destino" className={`block text-xs ${labelMuted} mb-1`}>Cliente destino</label>
                    <input id="cliente_destino" className={`w-full ${field}`} value={editForm.cliente_destino} onChange={(e) => setEditForm((f) => ({ ...f, cliente_destino: e.target.value }))} disabled={!canEdit} />
                </div>
                <div>
                    <label htmlFor="causal" className={`block text-xs ${labelMuted} mb-1`}>Causal</label>
                    <input id="causal" className={`w-full ${field}`} value={editForm.causal} onChange={(e) => setEditForm((f) => ({ ...f, causal: e.target.value }))} disabled={!canEdit} />
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
    );
}

// Subcomponente de Observación CH (Adoptando el diseño de HU-07)
function PanelObservacionCH({ isLight, field, observacionActual, historialObs, puedeEscribirObs, observacion, setObservacion, handleGuardarObservacion, loading, setError }) {
    const [mostrarHistorialObs, setMostrarHistorialObs] = useState(false);
    const subtleTextClass = isLight ? 'text-slate-600' : 'text-slate-400';
    const textCapitalizedClass = 'capitalize';

    return (
        <div className={`border-t border-slate-200/70 dark:border-slate-700 pt-3`}>
            <h3 className={`text-sm font-semibold mb-2 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Observación de Capital Humano</h3>
            {observacionActual ? (
                <div className={`mt-2 rounded-lg p-3 ${isLight ? 'bg-slate-50' : 'bg-slate-800/60'}`}>
                    <div className={`flex items-center gap-2 text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                        <span className="font-semibold">v{observacionActual.version}</span>
                        <span>·</span>
                        <span>{observacionActual.actor_nombre || 'Usuario'}</span>
                        <span className={isLight ? 'text-slate-500' : 'text-blue-400'}>({observacionActual.actor_role})</span>
                        <span>·</span>
                        <span>{new Date(observacionActual.fecha).toLocaleString('es-CO')}</span>
                    </div>
                    <p className={`text-sm mt-1 whitespace-pre-wrap ${isLight ? 'text-slate-700' : 'text-slate-300'} ${textCapitalizedClass}`}>
                        {observacionActual.observacion}
                    </p>
                    {historialObs && historialObs.length > 1 && (
                        <button
                            onClick={() => setMostrarHistorialObs(!mostrarHistorialObs)}
                            className={`text-xs mt-1 hover:underline ${isLight ? 'text-slate-600' : 'text-sky-300'}`}
                        >
                            {mostrarHistorialObs ? 'Ocultar historial' : `Ver historial (${historialObs.length} versiones)`}
                        </button>
                    )}
                    {mostrarHistorialObs && historialObs.slice(1).map((item) => (
                        <div
                            key={item.id}
                            className={`mt-2 rounded p-2 text-xs ${isLight ? 'bg-slate-100 text-slate-700 border border-slate-200' : 'bg-slate-800/80 text-slate-200 border border-slate-700'}`}
                        >
                            <div className={`flex items-center gap-2 ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                                <span className="font-semibold">v{item.version}</span>
                                <span>·</span>
                                <span>{item.actor_nombre || 'Usuario'}</span>
                                <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>({item.actor_role})</span>
                                <span>·</span>
                                <span>{new Date(item.fecha).toLocaleString('es-CO')}</span>
                            </div>
                            <p className={`mt-0.5 ${isLight ? 'text-slate-700' : 'text-slate-200'} ${textCapitalizedClass}`}>{item.observacion}</p>
                        </div>
                    ))}
                </div>
            ) : (
                <div className={`mt-2 rounded-lg p-3 ${isLight ? 'bg-slate-50' : 'bg-slate-800/50'}`}>
                    <p className={`text-sm ${subtleTextClass}`}>Sin evaluación</p>
                </div>
            )}
            
            {puedeEscribirObs && (
                <div className="mt-3 space-y-2">
                    <label className={`text-xs font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>Nueva observación</label>
                    <textarea value={observacion} onChange={(e) => { if (e.target.value.length <= 1000) { setObservacion(e.target.value); setError(''); } }} placeholder="Escribe aquí tu observación..." className={`w-full min-h-[80px] resize-y ${field}`} disabled={loading} />
                    <div className="flex justify-end">
                        <button type="button" onClick={handleGuardarObservacion} disabled={loading || !observacion.trim()} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                            {loading ? 'Guardando...' : 'Guardar Observación'}
                        </button>
                    </div>
                </div>
            )}
            {!puedeEscribirObs && (
                <p className="text-xs text-gray-400 mt-1">Solo CH puede registrar observaciones</p>
            )}
        </div>
    );
}

// Subcomponente de Decisión GP (Adoptando el diseño de HU-07)
function PanelDecisionGP({ isLight, field, decisionActual, puedeDecidir, decision, setDecision, justificacion, setJustificacion, handleGuardarDecision, loading, setError }) {
    const subtleTextClass = isLight ? 'text-slate-600' : 'text-slate-400';

    return (
        <div className={`border-t border-slate-200/70 dark:border-slate-700 pt-3`}>
            <h3 className={`text-sm font-semibold mb-2 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Decisión de aptitud</h3>
            {decisionActual ? (
                <div className={`mt-2 rounded-lg p-3 ${
                    decisionActual.decision === 'APTO'
                        ? isLight ? 'bg-emerald-50/90 border border-emerald-200 text-emerald-800' : 'bg-emerald-950/35 border border-emerald-800/50 text-emerald-200'
                        : isLight ? 'bg-rose-50/90 border border-rose-200 text-rose-800' : 'bg-rose-950/35 border border-rose-800/50 text-rose-200'
                }`}>
                    <div className="flex items-center gap-2">
                        {decisionActual.decision === 'APTO' ? (
                            <CheckCircle size={16} className={isLight ? 'text-emerald-600' : 'text-emerald-400'} />
                        ) : (
                            <XCircle size={16} className={isLight ? 'text-rose-600' : 'text-rose-400'} />
                        )}
                        <span className={`font-semibold ${
                            decisionActual.decision === 'APTO'
                                ? isLight ? 'text-emerald-700' : 'text-emerald-300'
                                : isLight ? 'text-rose-700' : 'text-rose-300'
                        }`}>
                            {decisionActual.decision}
                        </span>
                        <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-300'}`}>
                            por {decisionActual.actor_nombre || decisionActual.decidido_por_nombre || 'Usuario'}
                        </span>
                        <span className={`text-xs ${isLight ? 'text-slate-400' : 'text-slate-400'}`}>
                            {new Date(decisionActual.fecha).toLocaleString('es-CO')}
                        </span>
                    </div>
                    <p className={`text-sm mt-1 ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                        <span className="font-medium">Justificación:</span> {decisionActual.justificacion}
                    </p>
                </div>
            ) : (
                <div className={`mt-2 rounded-lg p-3 ${isLight ? 'bg-slate-50' : 'bg-slate-800/50'}`}>
                    <p className={`text-sm ${subtleTextClass}`}>Sin decisión tomada</p>
                </div>
            )}

            {puedeDecidir && (
                <div className="mt-3 space-y-3">
                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={() => { setDecision('APTO'); setError(''); }}
                            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                decision === 'APTO'
                                    ? isLight ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-emerald-600/60 bg-emerald-900/30 text-emerald-300'
                                    : isLight ? 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200' : 'border-slate-700 bg-slate-800/70 text-slate-200 hover:border-emerald-700/50'
                            }`}
                            disabled={loading}
                        >
                            <CheckCircle size={16} className={decision === 'APTO' ? 'text-emerald-600' : 'text-slate-400'} />
                            <span>Apto</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => { setDecision('NO_APTO'); setError(''); }}
                            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                                decision === 'NO_APTO'
                                    ? isLight ? 'border-rose-400 bg-rose-100 text-rose-800 shadow-sm' : 'border-rose-600/60 bg-rose-900/30 text-rose-300'
                                    : isLight ? 'border-slate-200 bg-white text-slate-700 hover:border-rose-300' : 'border-slate-700 bg-slate-800/70 text-slate-200 hover:border-rose-700/50'
                            }`}
                            disabled={loading}
                        >
                            <XCircle size={16} className={decision === 'NO_APTO' ? 'text-rose-600' : 'text-slate-400'} />
                            <span>No apto</span>
                        </button>
                    </div>
                    <div>
                        <label className={`text-xs font-medium ${subtleTextClass}`}>Justificación <span className="text-red-500">*</span></label>
                        <textarea
                            value={justificacion}
                            onChange={(e) => { if (e.target.value.length <= 500) { setJustificacion(e.target.value); setError(''); } }}
                            placeholder="Explica los motivos de tu decisión..."
                            className={`w-full min-h-[60px] resize-y ${field}`}
                            disabled={loading}
                        />
                    </div>
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={handleGuardarDecision}
                            disabled={loading || !decision || !justificacion.trim()}
                            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Guardando...' : 'Guardar decisión'}
                        </button>
                    </div>
                </div>
            )}
            {!puedeDecidir && (
                <p className="text-xs text-gray-400 mt-1">Solo GP puede tomar decisiones de aptitud</p>
            )}
        </div>
    );
}

// Componente Principal Exportado
export function ReubicacionesDetalleModal({ 
    isOpen, onClose, row, token, auth, 
    editForm, setEditForm, submitEdit, canEdit, editSaving 
}) {
    const { isLight, field, labelMuted } = useModuleTheme();

    const [observacion, setObservacion] = useState('');
    const [observacionActual, setObservacionActual] = useState(null);
    const [historialObs, setHistorialObs] = useState([]);
    
    const [decision, setDecision] = useState('');
    const [justificacion, setJustificacion] = useState('');
    const [decisionActual, setDecisionActual] = useState(null);
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const showError = (msg) => { setError(msg); setSuccess(''); setTimeout(() => setError(''), 4000); };
    const showSuccess = (msg) => { setSuccess(msg); setError(''); setTimeout(() => setSuccess(''), 4000); };

    const puedeEscribirObs = canRegisterObservacion(auth);
    const puedeDecidir = canDecideAptitud(auth);

    const infoCardClass = isLight
        ? 'rounded-lg p-2.5 shadow-none bg-transparent'
        : 'rounded-lg p-2.5 shadow-none bg-transparent';
    const infoLabelClass = isLight ? 'text-xs font-medium text-slate-500' : 'text-xs font-medium text-slate-400';
    const infoValueClass = isLight ? 'mt-0.5 font-semibold text-slate-700' : 'mt-0.5 font-semibold text-slate-200';
    const textCapitalizedClass = 'capitalize';

    useEffect(() => {
        if (isOpen && row?.id) cargarContextoAptitud();
    }, [isOpen, row?.id]);

    const cargarContextoAptitud = async () => {
        try {
            const res = await fetch(`/api/directorio/reubicaciones-pipeline/${row.id}/aptitud-context`, { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await res.json();
            if (data.ok) {
                setObservacionActual(data.observacion || null);
                setHistorialObs(data.historialObs || []);
                setDecisionActual(data.decision || null);
            }
        } catch (e) {
            console.error('Error cargando contexto aptitud:', e);
        }
    };

    const handleGuardarObservacion = async () => {
        if (!observacion.trim()) return showError('La observación es obligatoria');
        if (observacion.length > 1000) return showError('La observación excede 1000 caracteres');

        setLoading(true); setError(''); setSuccess('');
        try {
            const res = await fetch(`/api/directorio/reubicaciones-pipeline/${row.id}/observacion`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-cinte-xsrf': getCsrfToken(), 'Idempotency-Key': crypto.randomUUID() },
                body: JSON.stringify({ observacion: observacion.trim(), expectedVersion: observacionActual ? observacionActual.version : 0 })
            });
            const data = await res.json();
            if (data.ok) { showSuccess('Observación guardada exitosamente'); setObservacion(''); await cargarContextoAptitud(); } 
            else { showError(data.error || 'Error al guardar observación'); }
        } catch { showError('Error de conexión'); } finally { setLoading(false); }
    };

    const handleGuardarDecision = async () => {
        if (!decision) return showError('Debe seleccionar una decisión (Apto / No Apto)');
        if (!justificacion.trim()) return showError('La justificación es obligatoria');
        if (justificacion.length > 500) return showError('La justificación excede 500 caracteres');

        setLoading(true); setError(''); setSuccess('');
        try {
            const res = await fetch(`/api/directorio/reubicaciones-pipeline/${row.id}/decision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-cinte-xsrf': getCsrfToken(), 'Idempotency-Key': crypto.randomUUID() },
                body: JSON.stringify({ decision, justificacion: justificacion.trim() })
            });
            const data = await res.json();
            if (data.ok) { showSuccess('Decisión guardada exitosamente'); await cargarContextoAptitud(); setDecision(''); setJustificacion(''); } 
            else { showError(data.error || 'Error al guardar decisión'); }
        } catch { showError('Error de conexión'); } finally { setLoading(false); }
    };

    if (!isOpen || !row) return null;

    return (
        <MonitorGlassModalShell
            open={isOpen}
            onClose={onClose}
            title="Detalle de reubicación"
            subtitle={`Cédula ${row.cedula} · ${row.consultor || 'Consultor'}`}
            avatarLetter={row.consultor?.[0] || row.cedula?.[0] || 'R'}
            bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6 pt-2"
        >
            {/* CONTENIDO CON SCROLL PROPIO */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto custom-scrollbar pr-1">
                <div className="space-y-4 font-body">
                    {/* INFO DEL CASO (GRID HU-07) */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div className={infoCardClass}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Cédula</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{row.cedula}</p>
                        </div>
                        <div className={infoCardClass}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Consultor</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{row.consultor || '—'}</p>
                        </div>
                        <div className={infoCardClass}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Cliente actual</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{row.cliente_actual || '—'}</p>
                        </div>
                        <div className={infoCardClass}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Cliente destino</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{row.cliente_destino || '—'}</p>
                        </div>
                        <div className={infoCardClass}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Salario</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{formatMontoDisplay(row.salario, row.moneda_salario || row.moneda || row.montos_divisa?.salario)}</p>
                        </div>
                        <div className={infoCardClass}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Tipo ficha</p>
                            <p className={`${infoValueClass} uppercase font-bold text-sky-600 dark:text-sky-400`}>{row.tipo_ficha || '—'}</p>
                        </div>
                        <div className={infoCardClass}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Fecha de fin</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{String(row.fecha_fin || '').slice(0, 10) || '—'}</p>
                        </div>
                        <div className={infoCardClass}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Días restantes</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{row.dias_restantes != null ? row.dias_restantes : '—'}</p>
                        </div>
                        <div className={`${infoCardClass} sm:col-span-2`}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Estado</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{row.estado || row.semaforo || '—'}</p>
                            {(String(row.estado || '').startsWith('Con novedad') || row.motivo) && (
                                <p className="mt-1 text-xs text-rose-600 dark:text-rose-300">
                                    <strong>Razón:</strong> {row.motivo || 'Faltan datos o inconsistencia en la ficha'}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* EDICIÓN DE PIPELINE INLINE (Nuestro aporte de HU-05) */}
                    <div className={`border-t border-slate-200/70 dark:border-slate-700 pt-3`}>
                        <FormInformacionPipeline 
                            isLight={isLight} field={field} labelMuted={labelMuted} 
                            editForm={editForm} setEditForm={setEditForm} 
                            submitEdit={submitEdit} canEdit={canEdit} editSaving={editSaving} 
                        />
                    </div>

                    {/* OBSERVACION DE CH */}
                    <PanelObservacionCH 
                        isLight={isLight} field={field} 
                        observacionActual={observacionActual} historialObs={historialObs} 
                        puedeEscribirObs={puedeEscribirObs} observacion={observacion} 
                        setObservacion={setObservacion} handleGuardarObservacion={handleGuardarObservacion} 
                        loading={loading} setError={setError} 
                    />

                    {/* DECISION DE GP */}
                    <PanelDecisionGP 
                        isLight={isLight} field={field} 
                        decisionActual={decisionActual} 
                        puedeDecidir={puedeDecidir} decision={decision} setDecision={setDecision} 
                        justificacion={justificacion} setJustificacion={setJustificacion} 
                        handleGuardarDecision={handleGuardarDecision} loading={loading} setError={setError} 
                    />
                </div>

                {/* MENSAJES DE ERROR / SUCCESS */}
                <div className="mt-4">
                    {error && (
                        <div className={`rounded-lg p-3 text-sm ${isLight ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-rose-950/40 text-rose-300 border border-rose-900/50'}`}>
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className={`rounded-lg p-3 text-sm ${isLight ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-emerald-950/40 text-emerald-300 border border-emerald-900/50'}`}>
                            {success}
                        </div>
                    )}
                </div>
            </div>
        </MonitorGlassModalShell>
    );
}
