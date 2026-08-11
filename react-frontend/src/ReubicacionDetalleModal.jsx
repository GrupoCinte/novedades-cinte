<<<<<<< HEAD
import { Pencil, Trash2, Eye, CheckCircle, XCircle, Clock } from 'lucide-react';
import GestionModalShell from './shared/modals/GestionModalShell.jsx';
import { useModuleTheme } from './moduleTheme.js';
import { buildGestionTableDash } from './gestionTableDashTheme.js';
=======
import { Pencil, Trash2, CheckCircle, XCircle } from 'lucide-react';
import MonitorGlassModalShell from './shared/modals/MonitorGlassModalShell.jsx';
import { useModuleTheme } from './moduleTheme.js';
import { buildMonitorGlassModalTheme } from './shared/modals/monitorGlassModalTheme.js';
>>>>>>> feature/HU-07-rediseno-tabla-modal-filtros-reubicaciones
import { formatMoneyAmountOnly } from './multiCurrencyMoney.js';
import { useState, useEffect } from 'react';
import { userCanDecideAptitud, userCanRegisterObservacion, userCanModifyReubicacion } from './reubicaciones/reubicacionesAccess';

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

export function ReubicacionDetalleModal({ isOpen, onClose, row, token, auth, onEdit, onDelete }) {
    const { isLight } = useModuleTheme();
<<<<<<< HEAD
    const dash = buildGestionTableDash(Boolean(isLight));
=======
    const T = buildMonitorGlassModalTheme(isLight);
>>>>>>> feature/HU-07-rediseno-tabla-modal-filtros-reubicaciones

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

    const puedeEscribirObs = userCanRegisterObservacion(auth);
    const puedeDecidir = userCanDecideAptitud(auth);
    const canModify = userCanModifyReubicacion(auth);

<<<<<<< HEAD
=======
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

>>>>>>> feature/HU-07-rediseno-tabla-modal-filtros-reubicaciones
    // Cargar datos al abrir el modal
    useEffect(() => {
        if (isOpen && row?.id) {
            cargarObservacion();
            cargarDecision();
        }
    }, [isOpen, row?.id]);

    // ============================================
    // OBSERVACIONES
    // ============================================
    const cargarObservacion = async () => {
        try {
            const res = await fetch(`/api/directorio/reubicaciones/${row.id}/observacion`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.ok) {
                setObservacionActual(data.data?.actual || null);
                setHistorialObs(data.data?.historial || []);
                if (data.data?.actual) {
                    setObservacion(data.data.actual.observacion);
                }
            }
        } catch (e) {
            console.error('Error cargando observacion:', e);
        }
    };

    const handleGuardarObservacion = async () => {
        if (!observacion.trim()) {
<<<<<<< HEAD
            setError('La observacion no puede estar vacia');
            return;
        }
        if (observacion.length > 1000) {
            setError('La observacion no puede exceder 1000 caracteres');
=======
            setError('La observación no puede estar vacía');
            return;
        }
        if (observacion.length > 1000) {
            setError('La observación no puede exceder 1000 caracteres');
>>>>>>> feature/HU-07-rediseno-tabla-modal-filtros-reubicaciones
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const csrfToken = getCsrfToken();
            const res = await fetch(`/api/directorio/reubicaciones/${row.id}/observacion`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-cinte-xsrf': csrfToken
                },
                body: JSON.stringify({ observacion: observacion.trim() })
            });
            const data = await res.json();
            if (data.ok) {
<<<<<<< HEAD
                setSuccess('Observacion guardada exitosamente');
                await cargarObservacion();
                setObservacion('');
            } else {
                setError(data.error || 'Error al guardar observacion');
            }
        } catch (e) {
            setError('Error al guardar observacion');
=======
                setSuccess('Observación guardada exitosamente');
                await cargarObservacion();
                setObservacion('');
            } else {
                setError(data.error || 'Error al guardar observación');
            }
        } catch (e) {
            setError('Error al guardar observación');
>>>>>>> feature/HU-07-rediseno-tabla-modal-filtros-reubicaciones
        } finally {
            setLoading(false);
        }
    };

    // ============================================
    // DECISIONES
    // ============================================
    const cargarDecision = async () => {
        try {
            const res = await fetch(`/api/directorio/reubicaciones/${row.id}/decision`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.ok) {
                setDecisionActual(data.data?.actual || null);
                setHistorialDec(data.data?.historial || []);
            }
        } catch (e) {
            console.error('Error cargando decision:', e);
        }
    };

    const handleGuardarDecision = async () => {
        if (!decision) {
<<<<<<< HEAD
            setError('Debes seleccionar una decision (APTO o NO APTO)');
            return;
        }
        if (!justificacion.trim()) {
            setError('La justificacion es obligatoria');
            return;
        }
        if (justificacion.length > 500) {
            setError('La justificacion no puede exceder 500 caracteres');
=======
            setError('Debes seleccionar una decisión (APTO o NO APTO)');
            return;
        }
        if (!justificacion.trim()) {
            setError('La justificación es obligatoria');
            return;
        }
        if (justificacion.length > 500) {
            setError('La justificación no puede exceder 500 caracteres');
>>>>>>> feature/HU-07-rediseno-tabla-modal-filtros-reubicaciones
            return;
        }

        setLoading(true);
        setError('');
        setSuccess('');

        try {
            const csrfToken = getCsrfToken();
            const res = await fetch(`/api/directorio/reubicaciones/${row.id}/decision`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'x-cinte-xsrf': csrfToken
                },
                body: JSON.stringify({
                    decision: decision,
                    justificacion: justificacion.trim()
                })
            });
            const data = await res.json();
            if (data.ok) {
<<<<<<< HEAD
                setSuccess('Decision guardada exitosamente');
=======
                setSuccess('Decisión guardada exitosamente');
>>>>>>> feature/HU-07-rediseno-tabla-modal-filtros-reubicaciones
                await cargarDecision();
                setDecision('');
                setJustificacion('');
            } else {
<<<<<<< HEAD
                setError(data.error || 'Error al guardar decision');
            }
        } catch (e) {
            setError('Error al guardar decision');
=======
                setError(data.error || 'Error al guardar decisión');
            }
        } catch (e) {
            setError('Error al guardar decisión');
>>>>>>> feature/HU-07-rediseno-tabla-modal-filtros-reubicaciones
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !row) return null;

    // ============================================
    // FOOTER
    // ============================================
    const footer = (
        <div className="flex justify-end gap-2 w-full pt-2">
            {canModify && (
                <>
                    <button
                        type="button"
                        onClick={() => {
                            onClose();
                            onEdit(row);
                        }}
                        className="px-4 py-2 rounded-md bg-[#2F7BB8] text-white text-sm font-semibold hover:bg-[#25649a] flex items-center gap-2"
                    >
                        <Pencil size={16} /> Editar
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            onClose();
                            onDelete(row);
                        }}
                        className="px-4 py-2 rounded-md bg-rose-600 text-white text-sm font-semibold hover:bg-rose-700 flex items-center gap-2"
                    >
                        <Trash2 size={16} /> Eliminar
                    </button>
                </>
            )}
<<<<<<< HEAD
            <button
                type="button"
                onClick={onClose}
                className={dash.compactBtn}
            >
                Cerrar
            </button>
=======
>>>>>>> feature/HU-07-rediseno-tabla-modal-filtros-reubicaciones
        </div>
    );

    // ============================================
<<<<<<< HEAD
    // RENDER
    // ============================================
    return (
        <GestionModalShell
            open={isOpen}
            onClose={onClose}
            title="Detalle de Reubicacion"
            subtitle={`Cedula ${row.cedula} · ${row.consultor || 'Consultor'}`}
            size="lg"
            footer={footer}
        >
            <div className="mt-2 space-y-4 font-body">
                {/* INFO DEL CASO */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Cedula</p>
                        <p className="font-semibold">{row.cedula}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Consultor</p>
                        <p className="font-semibold">{row.consultor || '—'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Cliente actual</p>
                        <p className="font-semibold">{row.cliente_actual || '—'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Cliente destino</p>
                        <p className="font-semibold">{row.cliente_destino || '—'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Puesto</p>
                        <p className="font-semibold">{row.puesto || '—'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Salario</p>
                        <p className="font-semibold">{formatMontoDisplay(row.salario, row.moneda_salario || row.moneda)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Auxilios</p>
                        <p className="font-semibold">{formatMontoDisplay(row.auxilios, row.moneda_auxilios || row.moneda)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Tipo ficha</p>
                        <p className="font-semibold">{row.tipo_ficha || '—'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Fecha fin</p>
                        <p className="font-semibold">{row.fecha_fin || '—'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Dias restantes</p>
                        <p className="font-semibold">{row.dias_restantes ?? '—'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40 sm:col-span-2">
                        <p className={`text-xs ${dash.modalMuted}`}>Estado</p>
                        <p className="font-semibold">{row.estado || row.semaforo || '—'}</p>
                    </div>
                </div>

                {/* ================================================ */}
                {/* OBSERVACION DE CH */}
                {/* ================================================ */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Observacion de Capital Humano
                    </h3>

                    {observacionActual ? (
                        <div className="mt-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                            <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-300">
                                <span className="font-semibold">v{observacionActual.version}</span>
                                <span>•</span>
                                <span>{observacionActual.actor_nombre || 'Usuario'}</span>
                                <span className="text-blue-400">({observacionActual.actor_role})</span>
                                <span>•</span>
                                <span>{new Date(observacionActual.fecha).toLocaleString('es-CO')}</span>
                            </div>
                            <p className="text-sm text-slate-700 dark:text-slate-300 mt-1 whitespace-pre-wrap">
                                {observacionActual.observacion}
                            </p>
                            {historialObs.length > 1 && (
                                <button
                                    onClick={() => setMostrarHistorialObs(!mostrarHistorialObs)}
                                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1"
                                >
                                    {mostrarHistorialObs ? 'Ocultar historial' : `Ver historial (${historialObs.length} versiones)`}
                                </button>
                            )}
                            {mostrarHistorialObs && historialObs.slice(1).map((item) => (
                                <div key={item.id} className="mt-2 p-2 rounded bg-blue-100/50 dark:bg-blue-800/20 text-xs">
                                    <div className="flex items-center gap-2 text-blue-500 dark:text-blue-300">
                                        <span className="font-semibold">v{item.version}</span>
                                        <span>•</span>
                                        <span>{item.actor_nombre || 'Usuario'}</span>
                                        <span>({item.actor_role})</span>
                                        <span>•</span>
                                        <span>{new Date(item.fecha).toLocaleString('es-CO')}</span>
                                    </div>
                                    <p className="text-slate-600 dark:text-slate-300 mt-0.5">{item.observacion}</p>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="mt-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Sin evaluacion</p>
                        </div>
                    )}

                    {puedeEscribirObs && (
                        <div className="mt-3 space-y-2">
                            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                Nueva observacion
                            </label>
                            <textarea
                                value={observacion}
                                onChange={(e) => {
                                    if (e.target.value.length <= 1000) {
                                        setObservacion(e.target.value);
                                        setError('');
                                    }
                                }}
                                placeholder="Escribe aqui tu observacion sobre el desempeno del consultor..."
                                className="w-full p-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white min-h-[80px] resize-y"
                                disabled={loading}
                            />
                            <div className="flex justify-end">
                                <button
                                    onClick={handleGuardarObservacion}
                                    disabled={loading || !observacion.trim()}
                                    className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'Guardando...' : 'Guardar Observacion'}
                                </button>
                            </div>
                        </div>
                    )}
                    {!puedeEscribirObs && (
                        <p className="text-xs text-gray-400 mt-1">Solo CH puede registrar observaciones</p>
                    )}
                </div>

                {/* ================================================ */}
                {/* DECISION DE GP */}
                {/* ================================================ */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Decision de Aptitud
                    </h3>

                    {decisionActual ? (
                        <div className={`mt-2 p-3 rounded-lg border ${
                            decisionActual.decision === 'APTO'
                                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                        }`}>
                            <div className="flex items-center gap-2">
                                {decisionActual.decision === 'APTO' ? (
                                    <CheckCircle size={16} className="text-green-600" />
                                ) : (
                                    <XCircle size={16} className="text-red-600" />
                                )}
                                <span className={`font-semibold ${
                                    decisionActual.decision === 'APTO'
                                        ? 'text-green-700 dark:text-green-300'
                                        : 'text-red-700 dark:text-red-300'
                                }`}>
                                    {decisionActual.decision}
                                </span>
                                <span className="text-xs text-gray-500">
                                    por {decisionActual.decidido_por_nombre || 'Usuario'} ({decisionActual.decidido_por_role})
                                </span>
                                <span className="text-xs text-gray-400">
                                    {new Date(decisionActual.fecha).toLocaleString('es-CO')}
                                </span>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                                <span className="font-medium">Justificacion:</span> {decisionActual.justificacion}
                            </p>
                            {historialDec.length > 1 && (
                                <details className="mt-2">
                                    <summary className="text-xs text-blue-600 dark:text-blue-400 cursor-pointer">
                                        Ver historial ({historialDec.length} decisiones)
                                    </summary>
                                    {historialDec.slice(1).map((item) => (
                                        <div key={item.id} className={`mt-1 p-2 rounded text-xs ${
                                            item.decision === 'APTO'
                                                ? 'bg-green-100/50 dark:bg-green-800/20'
                                                : 'bg-red-100/50 dark:bg-red-800/20'
                                        }`}>
                                            <div className="flex items-center gap-2">
                                                <span className={`font-semibold ${
                                                    item.decision === 'APTO'
                                                        ? 'text-green-700 dark:text-green-300'
                                                        : 'text-red-700 dark:text-red-300'
                                                }`}>{item.decision}</span>
                                                <span className="text-gray-500">por {item.decidido_por_nombre || 'Usuario'}</span>
                                                <span className="text-gray-400">({item.decidido_por_role})</span>
                                                <span className="text-gray-400">{new Date(item.fecha).toLocaleString('es-CO')}</span>
                                            </div>
                                            <p className="text-gray-600 dark:text-gray-300">{item.justificacion}</p>
                                        </div>
                                    ))}
                                </details>
                            )}
                        </div>
                    ) : (
                        <div className="mt-2 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Sin decision tomada</p>
                        </div>
                    )}

                    {puedeDecidir && (
                        <div className="mt-3 space-y-3">
                            <div className="flex gap-4">
                                <button
                                    onClick={() => { setDecision('APTO'); setError(''); }}
                                    className={`flex-1 p-2 rounded-lg border-2 transition-colors ${
                                        decision === 'APTO'
                                            ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                            : 'border-gray-300 dark:border-gray-600 hover:border-green-300'
                                    }`}
                                    disabled={loading}
                                >
                                    <CheckCircle size={16} className="mx-auto text-green-600" />
                                    <span className="text-sm font-medium">Apto</span>
                                </button>
                                <button
                                    onClick={() => { setDecision('NO_APTO'); setError(''); }}
                                    className={`flex-1 p-2 rounded-lg border-2 transition-colors ${
                                        decision === 'NO_APTO'
                                            ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                                            : 'border-gray-300 dark:border-gray-600 hover:border-red-300'
                                    }`}
                                    disabled={loading}
                                >
                                    <XCircle size={16} className="mx-auto text-red-600" />
                                    <span className="text-sm font-medium">No Apto</span>
                                </button>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                                    Justificacion <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    value={justificacion}
                                    onChange={(e) => {
                                        if (e.target.value.length <= 500) {
                                            setJustificacion(e.target.value);
                                            setError('');
                                        }
                                    }}
                                    placeholder="Explica los motivos de tu decision..."
                                    className="w-full p-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:border-slate-600 dark:text-white min-h-[60px] resize-y"
                                    disabled={loading}
                                />
                            </div>
                            <div className="flex justify-end">
                                <button
                                    onClick={handleGuardarDecision}
                                    disabled={loading || !decision || !justificacion.trim()}
                                    className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? 'Guardando...' : 'Guardar Decision'}
                                </button>
                            </div>
                        </div>
                    )}
                    {!puedeDecidir && (
                        <p className="text-xs text-gray-400 mt-1">Solo GP puede tomar decisiones de aptitud</p>
                    )}
                </div>

                {/* MENSAJES DE ERROR / SUCCESS */}
                {error && (
                    <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-400">
                        {error}
                    </div>
                )}
                {success && (
                    <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-600 dark:text-green-400">
                        {success}
                    </div>
                )}
            </div>
        </GestionModalShell>
=======
    // RENDER - USANDO MonitorGlassModalShell
    // ============================================
    return (
        <MonitorGlassModalShell
            open={isOpen}
            onClose={onClose}
            title="Detalle de reubicación"
            subtitle={`Cédula ${row.cedula} · ${row.consultor || 'Consultor'}`}
            avatarLetter={row.consultor?.[0] || row.cedula?.[0] || 'R'}
            footer={footer}
            bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6 pt-2"
        >
            {/* ✅ CONTENIDO CON SCROLL PROPIO */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto custom-scrollbar pr-1">
                <div className="space-y-4 font-body">
                    {/* INFO DEL CASO */}
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
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Puesto</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{row.puesto || '—'}</p>
                        </div>
                        <div className={infoCardClass}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Salario</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{formatMontoDisplay(row.salario, row.moneda_salario || row.moneda)}</p>
                        </div>
                        <div className={infoCardClass}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Auxilios</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{formatMontoDisplay(row.auxilios, row.moneda_auxilios || row.moneda)}</p>
                        </div>
                        <div className={infoCardClass}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Tipo ficha</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{row.tipo_ficha || '—'}</p>
                        </div>
                        <div className={infoCardClass}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Fecha de fin</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{row.fecha_fin || '—'}</p>
                        </div>
                        <div className={infoCardClass}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Días restantes</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{row.dias_restantes ?? '—'}</p>
                        </div>
                        <div className={`${infoCardClass} sm:col-span-2`}>
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Estado</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{row.estado || row.semaforo || '—'}</p>
                        </div>
                    </div>

                    {/* ================================================ */}
                    {/* OBSERVACION DE CH */}
                    {/* ================================================ */}
                    <div className={`border-t border-slate-200/70 dark:border-slate-700 pt-3`}>
                        <h3 className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                            Observación de Capital Humano
                        </h3>

                        {observacionActual ? (
                            <div className={`mt-2 rounded-lg p-3 ${isLight ? 'bg-slate-50' : 'bg-slate-800/60'}`}>
                                <div className={`flex items-center gap-2 text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                                    <span className="font-semibold">v{observacionActual.version}</span>
                                    <span>•</span>
                                    <span>{observacionActual.actor_nombre || 'Usuario'}</span>
                                    <span className={isLight ? 'text-slate-500' : 'text-blue-400'}>({observacionActual.actor_role})</span>
                                    <span>•</span>
                                    <span>{new Date(observacionActual.fecha).toLocaleString('es-CO')}</span>
                                </div>
                                <p className={`text-sm mt-1 whitespace-pre-wrap ${isLight ? 'text-slate-700' : 'text-slate-300'} ${textCapitalizedClass}`}>
                                    {observacionActual.observacion}
                                </p>
                                {historialObs.length > 1 && (
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
                                            <span>•</span>
                                            <span>{item.actor_nombre || 'Usuario'}</span>
                                            <span>({item.actor_role})</span>
                                            <span>•</span>
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

                    {/* ================================================ */}
                    {/* DECISION DE GP */}
                    {/* ================================================ */}
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
                                        por {decisionActual.decidido_por_nombre || 'Usuario'} ({decisionActual.decidido_por_role})
                                    </span>
                                    <span className={`text-xs ${isLight ? 'text-slate-400' : 'text-slate-400'}`}>
                                        {new Date(decisionActual.fecha).toLocaleString('es-CO')}
                                    </span>
                                </div>
                                <p className={`text-sm mt-1 ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                                    <span className="font-medium">Justificación:</span> {decisionActual.justificacion}
                                </p>
                                {historialDec.length > 1 && (
                                    <details className="mt-2">
                                        <summary className={`text-xs cursor-pointer ${isLight ? 'text-sky-700' : 'text-sky-300'}`}>
                                            Ver historial ({historialDec.length} decisiones)
                                        </summary>
                                        {historialDec.slice(1).map((item) => (
                                            <div key={item.id} className={`mt-1 p-2 rounded text-xs border ${
                                                item.decision === 'APTO'
                                                    ? isLight ? 'bg-emerald-50/90 border-emerald-200 text-emerald-800' : 'bg-emerald-950/35 border-emerald-800/50 text-emerald-200'
                                                    : isLight ? 'bg-rose-50/90 border-rose-200 text-rose-800' : 'bg-rose-950/35 border-rose-800/50 text-rose-200'
                                            }`}>
                                                <div className="flex items-center gap-2">
                                                    <span className={`font-semibold ${
                                                        item.decision === 'APTO'
                                                            ? isLight ? 'text-emerald-700' : 'text-emerald-300'
                                                            : isLight ? 'text-rose-700' : 'text-rose-300'
                                                    }`}>{item.decision}</span>
                                                    <span className={isLight ? 'text-slate-600' : 'text-slate-300'}>por {item.decidido_por_nombre || 'Usuario'}</span>
                                                    <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>({item.decidido_por_role})</span>
                                                    <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>{new Date(item.fecha).toLocaleString('es-CO')}</span>
                                                </div>
                                                <p className={isLight ? 'text-slate-700' : 'text-slate-200'}>{item.justificacion}</p>
                                            </div>
                                        ))}
                                    </details>
                                )}
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
                                        onClick={() => { setDecision('APTO'); setError(''); }}
                                        className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                                            decision === 'APTO'
                                                ? isLight ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-emerald-600/60 bg-emerald-900/30 text-emerald-300'
                                                : isLight ? 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200' : 'border-slate-700 bg-slate-800/70 text-slate-200 hover:border-emerald-700/50'
                                        }`}
                                        disabled={loading}
                                    >
                                        <CheckCircle size={16} className="mx-auto text-green-600" />
                                        <span className="text-sm font-medium">Apto</span>
                                    </button>
                                    <button
                                        onClick={() => { setDecision('NO_APTO'); setError(''); }}
                                        className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                                            decision === 'NO_APTO'
                                                ? isLight ? 'border-rose-400 bg-rose-100 text-rose-800 shadow-sm' : 'border-rose-600/60 bg-rose-900/30 text-rose-300'
                                                : isLight ? 'border-slate-200 bg-white text-slate-700 hover:border-rose-300' : 'border-slate-700 bg-slate-800/70 text-slate-200 hover:border-rose-700/50'
                                        }`}
                                        disabled={loading}
                                    >
                                        <XCircle size={16} className="mx-auto text-red-600" />
                                        <span className="text-sm font-medium">No apto</span>
                                    </button>
                                </div>
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

                    {/* MENSAJES DE ERROR / SUCCESS */}
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
                </div>
            </div>
        </MonitorGlassModalShell>
>>>>>>> feature/HU-07-rediseno-tabla-modal-filtros-reubicaciones
    );
}