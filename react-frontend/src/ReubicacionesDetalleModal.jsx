import { Pencil, Trash2, CheckCircle, XCircle } from 'lucide-react';
import MonitorGlassModalShell from './shared/modals/MonitorGlassModalShell.jsx';
import { useModuleTheme } from './moduleTheme.js';
import { buildMonitorGlassModalTheme } from './shared/modals/monitorGlassModalTheme.js';
import { formatMoneyAmountOnly } from './multiCurrencyMoney.js';
import { useState, useEffect } from 'react';
import ReubicacionesTimeline from './components/reubicaciones/ReubicacionesTimeline.jsx';
import {
    canDecideAptitud as userCanDecideAptitud,
    canRegisterObservacion as userCanRegisterObservacion,
    canEditReubicaciones as userCanModifyReubicacion
} from './reubicacionesAccess.js';

function getCsrfToken() {
    const match = document.cookie.match(/cinteXsrf=([^;]+)/);
    return match ? match[1] : '';
}

function formatMontoDisplay(val, currencyCode = 'COP') {
    if (val == null || val === '') return '—';
    const num = Number(val);
    if (!Number.isFinite(num)) return '—';
    const ccy = currencyCode || 'COP';
    return `$ ${formatMoneyAmountOnly(num, ccy)}`;
}

export function ReubicacionesDetalleModal({ isOpen, onClose, row, token, auth, onEdit, onDelete }) {
    const { isLight } = useModuleTheme();
    const T = buildMonitorGlassModalTheme(isLight);

    // Estados para observaciones y decisiones
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
    const [refreshTimeline, setRefreshTimeline] = useState(0);

    const puedeEscribirObs = userCanRegisterObservacion(auth);
    const puedeDecidir = userCanDecideAptitud(auth);
    const canModify = userCanModifyReubicacion(auth);
    const decisionBloqueada = Boolean(decisionActual);
    const decisionSeleccionada = decisionActual?.decision || decision;

    const infoCardClass = isLight
        ? 'rounded-lg p-2.5 shadow-none bg-transparent'
        : 'rounded-lg p-2.5 shadow-none bg-transparent';
    const infoLabelClass = isLight ? 'text-xs font-medium text-slate-500' : 'text-xs font-medium text-slate-400';
    const infoValueClass = isLight ? 'mt-0.5 font-semibold text-slate-700' : 'mt-0.5 font-semibold text-slate-200';
    const textCapitalizedClass = 'capitalize';
    const subtleTextClass = isLight ? 'text-slate-600' : 'text-slate-400';
    const fieldClass = isLight
        ? 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-none placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-0'
        : 'w-full rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm text-slate-100 shadow-none placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-0';

    // Cargar datos al abrir el modal
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
            }
        } catch (e) {
            console.error('Error cargando contexto de aptitud:', e);
        }
    };

    const handleGuardarObservacion = async () => {
        if (!observacion.trim()) {
            setError('La observación no puede estar vacía');
            return;
        }
        if (observacion.length > 1000) {
            setError('La observación no puede exceder 1000 caracteres');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const csrfToken = getCsrfToken();
            const res = await fetch(`/api/directorio/reubicaciones-pipeline/${row.id}/observacion`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-cinte-xsrf': csrfToken,
                    'Idempotency-Key': crypto.randomUUID()
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
                setObservacion('');
                setRefreshTimeline(prev => prev + 1);
            } else {
                setError(data.error || 'Error al guardar observación');
            }
        } catch (e) {
            setError('Error al guardar observación');
        } finally {
            setLoading(false);
        }
    };

    const handleGuardarDecision = async () => {
        if (decisionBloqueada) {
            setError('La decisión de aptitud ya fue registrada y no puede modificarse.');
            return;
        }
        if (!decision) {
            setError('Debes seleccionar una decisión (APTO o NO APTO)');
            return;
        }
        if (!justificacion.trim()) {
            setError('La justificación es obligatoria');
            return;
        }
        if (justificacion.length > 500) {
            setError('La justificación no puede exceder 500 caracteres');
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const csrfToken = getCsrfToken();
            const res = await fetch(`/api/directorio/reubicaciones-pipeline/${row.id}/decision`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-cinte-xsrf': csrfToken,
                    'Idempotency-Key': crypto.randomUUID()
                },
                body: JSON.stringify({
                    decision: decision,
                    justificacion: justificacion.trim()
                })
            });
            const data = await res.json();
            if (data.ok) {
                setSuccess('Decisión guardada exitosamente');
                await cargarContextoAptitud();
                setDecision('');
                setJustificacion('');
                setRefreshTimeline(prev => prev + 1);
            } else {
                setError(data.error || 'Error al guardar decisión');
            }
        } catch (e) {
            setError('Error al guardar decisión');
        } finally {
            setLoading(false);
        }
    };

    const [clientesOptions, setClientesOptions] = useState([]);
    useEffect(() => {
        if (canModify && isOpen) {
            fetch('/api/directorio/clientes-destino', { headers: { 'Authorization': `Bearer ${token}` } })
                .then(r => r.json())
                .then(d => { if(d.ok) setClientesOptions(d.data); })
                .catch(console.error);
        }
    }, [canModify, isOpen, token]);

    const handleSaveInline = async (field, value) => {
        setLoading(true);
        setError('');
        setSuccess('');
        try {
            const csrfToken = getCsrfToken();
            const res = await fetch(`/api/directorio/reubicaciones-pipeline/${row.id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-cinte-xsrf': csrfToken
                },
                body: JSON.stringify({ [field]: value })
            });
            const data = await res.json();
            if (data.ok) {
                setSuccess(`Campo ${field} actualizado correctamente`);
                setRefreshTimeline(prev => prev + 1);
                if (typeof onEdit === 'function') onEdit(); // call callback to refresh parent table if needed
            } else {
                setError(data.error || 'Error al actualizar');
            }
        } catch (e) {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
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
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto custom-scrollbar pr-1">
                <div className="space-y-4 font-body">
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
                        <EditableField 
                            label="Cliente destino" 
                            field="cliente_destino" 
                            value={row.cliente_destino} 
                            canModify={canModify} 
                            isLight={isLight} 
                            options={clientesOptions.map(c => c.cliente)} 
                            onSave={handleSaveInline} 
                        />
                        <EditableField 
                            label="Causal" 
                            field="causal" 
                            value={row.causal} 
                            canModify={canModify} 
                            isLight={isLight} 
                            onSave={handleSaveInline} 
                        />
                        <div className={infoCardClass}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Puesto</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{row.puesto || '—'}</p>
                        </div>
                        <div className={infoCardClass}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Salario</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{formatMontoDisplay(row.salario, 'COP')}</p>
                        </div>
                        <div className={infoCardClass}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Auxilios</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{formatMontoDisplay(row.auxilios, 'COP')}</p>
                        </div>
                        <div className={infoCardClass}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Tipo ficha</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{row.tipo_ficha || '—'}</p>
                        </div>
                        <EditableField 
                            label="Fecha de fin" 
                            field="fecha_fin" 
                            value={row.fecha_fin} 
                            canModify={canModify} 
                            isLight={isLight} 
                            type="date"
                            onSave={handleSaveInline} 
                        />
                        <div className={infoCardClass}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Días restantes</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{row.dias_restantes ?? '—'}</p>
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

                    <div className={`border-t border-slate-200/70 dark:border-slate-700 pt-3`}>
                        <h3 className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                            Observación de Capital Humano
                        </h3>

                        {observacionActual ? (
                            <div className={`mt-2 rounded-lg p-3 ${isLight ? 'bg-slate-50' : 'bg-slate-800/60'}`}>
                                <div className={`flex items-center gap-2 text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                                    <span className="font-semibold">{observacionActual.actor_nombre || 'Usuario'}</span>
                                    <span className={isLight ? 'text-slate-500' : 'text-blue-400'}>({observacionActual.actor_role})</span>
                                    <span>·</span>
                                    <span>{new Date(observacionActual.fecha).toLocaleString('es-CO')}</span>
                                </div>
                                <p className={`text-sm mt-1 whitespace-pre-wrap ${isLight ? 'text-slate-700' : 'text-slate-300'} ${textCapitalizedClass}`}>
                                    {observacionActual.observacion}
                                </p>
                            </div>
                        ) : (
                            <div className={`mt-2 rounded-lg p-3 ${isLight ? 'bg-slate-50' : 'bg-slate-800/50'}`}>
                                <p className={`text-sm ${subtleTextClass}`}>Sin evaluación</p>
                            </div>
                        )}

                        {puedeEscribirObs && (
                            <div className="mt-3 space-y-2">
                                <label className={`text-xs font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                                    Nueva observación
                                </label>
                                <textarea
                                    value={observacion}
                                    onChange={(e) => {
                                        if (e.target.value.length <= 1000) {
                                            setObservacion(e.target.value);
                                            setError('');
                                        }
                                    }}
                                    placeholder="Escribe aquí tu observación sobre el desempeño del consultor..."
                                    className={`${fieldClass} min-h-[80px] resize-y`}
                                    disabled={loading}
                                />
                                <div className="flex justify-end">
                                    <button
                                        onClick={handleGuardarObservacion}
                                        disabled={loading || !observacion.trim()}
                                        className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {loading ? 'Guardando...' : 'Guardar observación'}
                                    </button>
                                </div>
                            </div>
                        )}
                        {!puedeEscribirObs && (
                            <p className="text-xs text-gray-400 mt-1">Solo CH puede registrar observaciones</p>
                        )}
                    </div>

                    <div className={`border-t border-slate-200/70 dark:border-slate-700 pt-3`}>
                        <h3 className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                            Decisión de aptitud
                        </h3>

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
                                        por {decisionActual.actor_nombre || 'Usuario'} ({decisionActual.actor_role || decisionActual.actor_rol || '—'})
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
                                        onClick={() => { if (!decisionBloqueada) { setDecision('APTO'); setError(''); } }}
                                        className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                                            decisionSeleccionada === 'APTO'
                                                ? isLight ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-emerald-600/60 bg-emerald-900/30 text-emerald-300'
                                                : isLight ? 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200' : 'border-slate-700 bg-slate-800/70 text-slate-200 hover:border-emerald-700/50'
                                        } ${decisionBloqueada ? 'cursor-not-allowed opacity-60' : ''}`}
                                        disabled={loading || decisionBloqueada}
                                    >
                                        <CheckCircle size={16} className="mx-auto text-green-600" />
                                        <span className="text-sm font-medium">Apto</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { if (!decisionBloqueada) { setDecision('NO_APTO'); setError(''); } }}
                                        className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                                            decisionSeleccionada === 'NO_APTO'
                                                ? isLight ? 'border-rose-400 bg-rose-100 text-rose-800 shadow-sm' : 'border-rose-600/60 bg-rose-900/30 text-rose-300'
                                                : isLight ? 'border-slate-200 bg-white text-slate-700 hover:border-rose-300' : 'border-slate-700 bg-slate-800/70 text-slate-200 hover:border-rose-700/50'
                                        } ${decisionBloqueada ? 'cursor-not-allowed opacity-60' : ''}`}
                                        disabled={loading || decisionBloqueada}
                                    >
                                        <XCircle size={16} className="mx-auto text-red-600" />
                                        <span className="text-sm font-medium">No apto</span>
                                    </button>
                                </div>
                                {!decisionBloqueada && <>
                                <div>
                                    <label className={`text-xs font-medium ${subtleTextClass}`}>
                                        Justificación <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                        value={justificacion}
                                        onChange={(e) => {
                                            if (e.target.value.length <= 500) {
                                                setJustificacion(e.target.value);
                                                setError('');
                                            }
                                        }}
                                        placeholder="Explica los motivos de tu decisión..."
                                        className={`${fieldClass} min-h-[60px] resize-y`}
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
                                </>}
                            </div>
                        )}
                        {!puedeDecidir && (
                            <p className="text-xs text-gray-400 mt-1">Solo GP puede tomar decisiones de aptitud</p>
                        )}
                    </div>

                    {error && (
                        <div className={`rounded-lg p-2 text-sm ${isLight ? 'bg-rose-50 text-rose-700' : 'bg-rose-950/20 text-rose-300'}`}>
                            {error}
                        </div>
                    )}
                    {success && (
                        <div className={`rounded-lg p-2 text-sm ${isLight ? 'bg-emerald-50 text-emerald-700' : 'bg-emerald-950/20 text-emerald-300'}`}>
                            {success}
                        </div>
                    )}

                    <ReubicacionesTimeline pipelineId={row.id} token={token} refreshTrigger={refreshTimeline} />
                </div>
            </div>
        </MonitorGlassModalShell>
    );
}

function EditableField({ label, value, field, options, canModify, isLight, type = 'text', onSave }) {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState(value || '');

    const handleSave = async () => {
        await onSave(field, localValue);
        setIsEditing(false);
    };

    const infoCardClass = isLight
        ? 'rounded-lg p-2.5 shadow-none bg-transparent'
        : 'rounded-lg p-2.5 shadow-none bg-transparent';
    const infoLabelClass = isLight ? 'text-xs font-medium text-slate-500' : 'text-xs font-medium text-slate-400';
    const infoValueClass = isLight ? 'mt-0.5 font-semibold text-slate-700' : 'mt-0.5 font-semibold text-slate-200';
    const fieldClass = isLight
        ? 'w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm text-slate-700 shadow-none focus:outline-none focus:border-slate-400'
        : 'w-full rounded-lg border border-slate-700 bg-slate-800/70 px-2 py-1 text-sm text-slate-100 shadow-none focus:outline-none focus:border-slate-500';

    if (!isEditing) {
        return (
            <div className={`${infoCardClass} group relative flex items-start justify-between`}>
                <div>
                    <p className={`${infoLabelClass}`}>{label}</p>
                    <p className={`${infoValueClass}`}>{value || '—'}</p>
                </div>
                {canModify && (
                    <button 
                        onClick={() => { setLocalValue(value || ''); setIsEditing(true); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-all dark:hover:bg-slate-700 dark:hover:text-slate-200"
                        title="Editar"
                    >
                        <Pencil size={14} />
                    </button>
                )}
            </div>
        );
    }

    return (
        <div className={`${infoCardClass}`}>
            <p className={`${infoLabelClass}`}>{label}</p>
            <div className="mt-1 flex items-center gap-2">
                {options ? (
                    <select 
                        value={localValue} 
                        onChange={e => setLocalValue(e.target.value)} 
                        className={fieldClass}
                    >
                        <option value="">— Seleccione —</option>
                        {options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                ) : (
                    <input 
                        type={type}
                        value={localValue}
                        onChange={e => setLocalValue(e.target.value)}
                        className={fieldClass}
                    />
                )}
                <button onClick={handleSave} className="p-1.5 text-white bg-blue-600 hover:bg-blue-700 rounded-md">
                    <CheckCircle size={16} />
                </button>
                <button onClick={() => setIsEditing(false)} className="p-1.5 text-slate-500 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 rounded-md">
                    <XCircle size={16} />
                </button>
            </div>
        </div>
    );
}
