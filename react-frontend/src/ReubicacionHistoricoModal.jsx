// ReubicacionHistoricoModal.jsx
import { useState, useEffect } from 'react';
import MonitorGlassModalShell from './shared/modals/MonitorGlassModalShell.jsx';
import { useModuleTheme } from './moduleTheme.js';
import { buildMonitorGlassModalTheme } from './shared/modals/monitorGlassModalTheme.js';
import { formatMoneyAmountOnly } from './multiCurrencyMoney.js';

function formatMontoDisplay(val, currencyCode = 'COP') {
    if (val == null || val === '') return '—';
    const num = Number(val);
    if (!Number.isFinite(num)) return '—';
    const ccy = currencyCode || 'COP';
    return `$ ${formatMoneyAmountOnly(num, ccy)}`;
}

function getTipoLabel(tipo) {
    const labels = {
        'ficha_recibida': 'Ficha recibida',
        'ficha_actualizada': 'Ficha actualizada',
        'cambio_estado': 'Cambio de estado',
        'observacion_ch': 'Observación CH',
        'decision_aptitud': 'Decisión GP',
        'reubicacion': 'Reubicación',
        'vencimiento_automatico': 'Vencimiento automático',
        'inactivacion': 'Inactivación'
    };
    return labels[tipo] || tipo;
}

function getTipoClase(tipo, isLight) {
    const clases = {
        'ficha_recibida': isLight ? 'bg-sky-100 text-sky-800' : 'bg-sky-900/40 text-sky-200',
        'cambio_estado': isLight ? 'bg-amber-100 text-amber-800' : 'bg-amber-900/40 text-amber-200',
        'observacion_ch': isLight ? 'bg-purple-100 text-purple-800' : 'bg-purple-900/40 text-purple-200',
        'decision_aptitud': isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-900/40 text-emerald-200',
        'vencimiento_automatico': isLight ? 'bg-red-100 text-red-800' : 'bg-red-900/40 text-red-200',
        'inactivacion': isLight ? 'bg-slate-200 text-slate-700' : 'bg-slate-700 text-slate-200'
    };
    return clases[tipo] || (isLight ? 'bg-slate-100 text-slate-700' : 'bg-slate-800 text-slate-300');
}

function getDecisionClass(decision, isLight) {
    if (decision === 'APTO') {
        return isLight ? 'text-emerald-600' : 'text-emerald-300';
    }
    return isLight ? 'text-rose-600' : 'text-rose-300';
}

export function ReubicacionHistoricoModal({ isOpen, onClose, row, token, auth }) {
    const { isLight } = useModuleTheme();
    const [loading, setLoading] = useState(false);
    const [historial, setHistorial] = useState([]);
    const [error, setError] = useState('');
    const [etiqueta, setEtiqueta] = useState(null);

    const esVencido = String(row?.estado || '').trim() === 'Vencido' || Number(row?.dias_restantes ?? 0) <= -6;

    const infoCardClass = 'rounded-lg p-2.5 shadow-none bg-transparent';
    const infoLabelClass = isLight ? 'text-xs font-medium text-slate-500' : 'text-xs font-medium text-slate-400';
    const infoValueClass = isLight ? 'mt-0.5 font-semibold text-slate-700' : 'mt-0.5 font-semibold text-slate-200';
    const textCapitalizedClass = 'capitalize';
    const subtleTextClass = isLight ? 'text-slate-600' : 'text-slate-400';

    useEffect(() => {
        if (isOpen && row?.id) {
            cargarHistorial();
        }
    }, [isOpen, row?.id]);

    const cargarHistorial = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`/api/directorio/reubicaciones/${row.id}/historial`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.ok) {
                setHistorial(data.data?.historial || []);
                setEtiqueta(data.data?.etiqueta_vencimiento || null);
            } else {
                setError(data.error || 'Error al cargar historial');
            }
        } catch (e) {
            console.error('Error al cargar historial:', e);
            setError('Error al cargar historial');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !row) return null;

    let contenidoHistorial;

    if (loading) {
        contenidoHistorial = (
            <div className={`mt-2 rounded-lg p-3 text-center ${isLight ? 'bg-slate-50' : 'bg-slate-800/50'}`}>
                <p className={`text-sm ${subtleTextClass}`}>Cargando historial...</p>
            </div>
        );
    } else if (error) {
        contenidoHistorial = (
            <div className={`mt-2 rounded-lg p-3 text-center ${isLight ? 'bg-rose-50 text-rose-700' : 'bg-rose-950/20 text-rose-300'}`}>
                <p className="text-sm">{error}</p>
            </div>
        );
    } else if (historial.length === 0) {
        contenidoHistorial = (
            <div className={`mt-2 rounded-lg p-3 text-center ${isLight ? 'bg-slate-50' : 'bg-slate-800/50'}`}>
                <p className={`text-sm ${subtleTextClass}`}>Sin eventos registrados</p>
            </div>
        );
    } else {
        contenidoHistorial = (
            <div className="mt-2 space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {historial.map((evento, index) => (
                    <div
                        key={evento.id || index}
                        className={`rounded-lg p-3 text-sm ${
                            isLight ? 'bg-white border border-slate-200' : 'bg-slate-900/50 border border-slate-700/50'
                        }`}
                    >
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${getTipoClase(evento.tipo, isLight)}`}>
                                {getTipoLabel(evento.tipo)}
                            </span>
                            <span className={`text-xs ${subtleTextClass}`}>
                                · {evento.fecha ? new Date(evento.fecha).toLocaleString('es-CO') : '—'}
                            </span>
                            <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                · por {evento.actor || 'Sistema'} {evento.rol ? `(${evento.rol})` : ''}
                            </span>
                        </div>

                        {evento.tipo === 'observacion_ch' && evento.after?.observacion && (
                            <p className={`mt-1 text-xs ${isLight ? 'text-slate-800' : 'text-white'}`}>
                                {evento.after.observacion}
                            </p>
                        )}

                        {evento.tipo === 'decision_aptitud' && evento.after?.decision && (
                            <p className={`mt-1 text-xs ${getDecisionClass(evento.after.decision, isLight)}`}>
                                {evento.after.decision}
                                {evento.after?.justificacion && (
                                    <span className={`ml-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                                        · {evento.after.justificacion}
                                    </span>
                                )}
                            </p>
                        )}

                        {evento.tipo !== 'observacion_ch' && evento.tipo !== 'decision_aptitud' && evento.descripcion && (
                            <p className={`mt-1 text-xs ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                                {evento.descripcion}
                            </p>
                        )}
                    </div>
                ))}
            </div>
        );
    }

    const footer = (
        <div className="flex justify-end w-full">
            <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-md bg-slate-600 text-white text-sm font-semibold hover:bg-slate-700"
            >
                Cerrar
            </button>
        </div>
    );

    return (
        <MonitorGlassModalShell
            open={isOpen}
            onClose={onClose}
            title="Histórico de reubicación"
            subtitle={(
                <div className="flex flex-wrap items-center gap-2">
                    <span>{`Cédula ${row.cedula} · ${row.consultor || 'Consultor'}`}</span>
                            
                    {esVencido && (
                        <>
                            <span className="text-[10px] font-semibold text-red-500">·</span>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${isLight ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-red-900/40 text-red-200 border border-red-700/50'}`}>
                                Movimiento automático por vencimiento de fecha de decisión.
                            </span>
                        </>
                    )}
                </div>
            )}
            avatarLetter={row.consultor?.[0] || row.cedula?.[0] || 'H'}
            footer={footer}
            bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6 pt-2"
        >
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto custom-scrollbar pr-1">
                <div className="space-y-4 font-body">
                    
                    {/* ================================================ */}
                    {/* 1. DATOS DEL CASO */}
                    {/* ================================================ */}
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
                            <p className={`${infoLabelClass} ${textCapitalizedClass}`}>Estado final</p>
                            <p className={`${infoValueClass} ${textCapitalizedClass}`}>{row.estado || row.semaforo || '—'}</p>
                        </div>
                    </div>

                    {/* Etiqueta de vencimiento */}
                    {etiqueta && (
                        <div className={`rounded-lg p-3 ${isLight ? 'bg-amber-50 border border-amber-200' : 'bg-amber-950/30 border border-amber-800/50'}`}>
                            <p className={`text-sm ${isLight ? 'text-amber-800' : 'text-amber-200'}`}>
                                <span className="font-semibold">Etiqueta:</span> {etiqueta}
                            </p>
                        </div>
                    )}

                    {/* ================================================ */}
                    {/* 2. HISTORIAL DE EVENTOS */}
                    {/* ================================================ */}
                    <div className={`border-t border-slate-200/70 dark:border-slate-700 pt-3`}>
                        <h3 className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                            Historial de eventos
                            {historial.length > 0 && (
                                <span className={`ml-2 text-xs font-normal ${subtleTextClass}`}>
                                    ({historial.length} eventos)
                                </span>
                            )}
                        </h3>
                        
                        {contenidoHistorial}
                    </div>
                </div>
            </div>
        </MonitorGlassModalShell>
    );
}