import { Pencil, Trash2, Eye, CheckCircle, XCircle, Clock } from 'lucide-react';
import GestionModalShell from './shared/modals/GestionModalShell.jsx';
import { useModuleTheme } from './moduleTheme.js';
import { buildGestionTableDash } from './gestionTableDashTheme.js';
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
    const dash = buildGestionTableDash(Boolean(isLight));

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
            setError('La observacion no puede estar vacia');
            return;
        }
        if (observacion.length > 1000) {
            setError('La observacion no puede exceder 1000 caracteres');
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
                setSuccess('Observacion guardada exitosamente');
                await cargarObservacion();
                setObservacion('');
            } else {
                setError(data.error || 'Error al guardar observacion');
            }
        } catch (e) {
            setError('Error al guardar observacion');
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
            setError('Debes seleccionar una decision (APTO o NO APTO)');
            return;
        }
        if (!justificacion.trim()) {
            setError('La justificacion es obligatoria');
            return;
        }
        if (justificacion.length > 500) {
            setError('La justificacion no puede exceder 500 caracteres');
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
                await cargarDecision();
                setDecision('');
                setJustificacion('');
            } else {
                setError(data.error || 'Error al guardar decision');
            }
        } catch (e) {
            setError('Error al guardar decision');
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
            
        </div>
    );

    // ============================================
    // RENDER
    // ============================================
    return (
        <GestionModalShell
            open={isOpen}
            onClose={onClose}
            title="Detalle de Reubicación"
            subtitle={`Cédula ${row.cedula} · ${row.consultor || 'Consultor'}`}
            size="md"
            footer={footer}
        >
            <div className="mt-2 space-y-4 font-body">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-slate-200/60 dark:border-slate-800/80 p-3 bg-slate-50/50 dark:bg-slate-900/40">
                        <p className={`text-xs ${dash.modalMuted}`}>Cédula</p>
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
                    {!puedeEscribirObs &&  (
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
                    {!puedeDecidir &&  (
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
    );
}