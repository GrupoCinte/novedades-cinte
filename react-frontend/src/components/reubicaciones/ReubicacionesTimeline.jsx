import React, { useState, useEffect } from 'react';
import { useModuleTheme } from '../../moduleTheme.js';
import { Clock, User, Settings, ArrowRight, ArrowDown } from 'lucide-react';

export default function ReubicacionesTimeline({ pipelineId, token, refreshTrigger }) {
    const { isLight } = useModuleTheme();
    const [eventos, setEventos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [nextCursor, setNextCursor] = useState(null);
    const [expandedEvents, setExpandedEvents] = useState({});

    useEffect(() => {
        if (pipelineId) {
            fetchHistorial(null);
        }
    }, [pipelineId, token, refreshTrigger]);

    const fetchHistorial = async (cursor = null) => {
        if (cursor) setLoadingMore(true);
        else setLoading(true);
        
        setError('');
        
        try {
            let url = `/api/directorio/reubicaciones/${pipelineId}/historial`;
            if (cursor) url += `?cursor=${encodeURIComponent(cursor)}`;
            
            const headers = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const res = await fetch(url, { headers });
            const data = await res.json();
            if (data.ok) {
                if (cursor) {
                    setEventos(prev => [...prev, ...(data.data.historial || [])]);
                } else {
                    setEventos(data.data.historial || []);
                }
                setNextCursor(data.data.next_cursor || null);
            } else {
                setError(data.error || 'Error al cargar el historial');
            }
        } catch (e) {
            setError('Error de red al cargar el historial');
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const formatearFechaColombia = (isoDateStr) => {
        if (!isoDateStr) return '';
        try {
            return new Intl.DateTimeFormat('es-CO', {
                timeZone: 'America/Bogota',
                dateStyle: 'medium',
                timeStyle: 'short'
            }).format(new Date(isoDateStr));
        } catch (e) {
            return new Date(isoDateStr).toLocaleString();
        }
    };

    const toggleExpand = (id) => {
        setExpandedEvents(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    if (loading && eventos.length === 0) {
        return (
            <div className={`mt-4 p-4 rounded-lg text-center ${isLight ? 'bg-slate-50' : 'bg-slate-800/50'}`}>
                <div className="animate-pulse flex flex-col items-center">
                    <div className="h-4 w-32 bg-slate-300 dark:bg-slate-600 rounded mb-2"></div>
                    <div className="h-3 w-48 bg-slate-200 dark:bg-slate-700 rounded"></div>
                </div>
            </div>
        );
    }

    if (error && eventos.length === 0) {
        return (
            <div className={`mt-4 p-4 rounded-lg text-center ${isLight ? 'bg-rose-50 text-rose-700' : 'bg-rose-950/20 text-rose-300'}`}>
                {error}
            </div>
        );
    }

    return (
        <div className="mt-6 pt-4 border-t border-slate-200/70 dark:border-slate-700">
            <h3 className={`text-sm font-semibold mb-4 flex items-center gap-2 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                <Clock size={16} className={isLight ? "text-slate-500" : "text-slate-400"} />
                Historial Integral
            </h3>
            {eventos.length === 0 ? (
                <div className={`p-4 rounded-lg text-sm text-center ${isLight ? 'text-slate-500 bg-slate-50' : 'text-slate-400 bg-slate-800/50'}`}>
                    No hay eventos registrados en el historial para este caso.
                </div>
            ) : (
                <div className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-3 space-y-4 pb-4">
                    {eventos.map((evt) => (
                        <ReubicacionEventItem 
                            key={evt.id} 
                            evt={evt} 
                            isExpanded={expandedEvents[evt.id]} 
                            toggleExpand={toggleExpand} 
                            isLight={isLight} 
                            formatearFechaColombia={formatearFechaColombia} 
                        />
                    ))}
                </div>
            )}
            
            {nextCursor && (
                <div className="flex justify-center mt-4">
                    <button
                        onClick={() => fetchHistorial(nextCursor)}
                        disabled={loadingMore}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                            isLight 
                                ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50' 
                                : 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700'
                        } disabled:opacity-50`}
                    >
                        {loadingMore ? 'Cargando...' : 'Cargar más antiguos'}
                    </button>
                </div>
            )}
        </div>
    );
}

function ReubicacionEventItem({ evt, isExpanded, toggleExpand, isLight, formatearFechaColombia }) {
    const isAutomatic = evt.origen === 'SISTEMA' || evt.origen === 'ZOHO';
    const Icon = isAutomatic ? Settings : User;
    
    let iconBg = '';
    if (isLight) {
        iconBg = isAutomatic ? 'bg-amber-100 text-amber-600' : 'bg-sky-100 text-sky-600';
    } else {
        iconBg = isAutomatic ? 'bg-amber-900/50 text-amber-400' : 'bg-sky-900/50 text-sky-400';
    }
    
    return (
        <div className="relative pl-6 transition-all">
            <div className={`absolute -left-[13px] top-1 h-6 w-6 rounded-full flex items-center justify-center border-2 ${isLight ? 'border-white' : 'border-slate-900'} ${iconBg}`}>
                <Icon size={12} />
            </div>
            <div className={`rounded-lg border p-3 ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-800/70 border-slate-700'}`}>
                <div className="flex justify-between items-start gap-4">
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-semibold text-sm ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                                {evt.tipo_label}
                            </span>
                        </div>
                        <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isAutomatic ? 'Generado por: ' : 'Actor: '} 
                            <span className="font-medium text-slate-700 dark:text-slate-300">{evt.actor}</span> 
                            {evt.rol && ` (${evt.rol})`}
                        </p>
                    </div>
                    <div className={`text-xs whitespace-nowrap text-right ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        {formatearFechaColombia(evt.fecha)}
                    </div>
                </div>
                
                <p className={`text-sm mt-2 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                    {evt.descripcion}
                </p>
                
                {(evt.before || evt.after) && (
                    <div className="mt-2">
                        <button 
                            onClick={() => toggleExpand(evt.id)}
                            className={`text-xs flex items-center gap-1 hover:underline ${isLight ? 'text-blue-600' : 'text-blue-400'}`}
                        >
                            {isExpanded ? <ArrowDown size={12} /> : <ArrowRight size={12} />}
                            {isExpanded ? 'Ocultar detalles técnicos' : 'Ver cambios'}
                        </button>
                        
                        {isExpanded && (
                            <div className={`mt-2 p-3 rounded-lg text-xs overflow-x-auto grid grid-cols-2 gap-4 ${isLight ? 'bg-slate-50 border border-slate-100 shadow-inner' : 'bg-slate-900/50 border border-slate-800'}`}>
                                <ReubicacionEventValue label="Valor anterior" value={evt.before} isLight={isLight} colorClass="text-rose-600 dark:text-rose-400" />
                                <ReubicacionEventValue label="Nuevo valor" value={evt.after} isLight={isLight} colorClass="text-emerald-600 dark:text-emerald-400" />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function ReubicacionEventValue({ label, value, isLight, colorClass }) {
    return (
        <div>
            <div className="font-semibold mb-2 text-slate-500 dark:text-slate-400 border-b pb-1 dark:border-slate-700">{label}</div>
            <div className="flex flex-col gap-2 mt-2">
                {value ? (
                    typeof value === 'object' ? (
                        Object.entries(value).map(([k, v]) => (
                            <div key={k} className="flex flex-col">
                                <span className={`font-medium capitalize text-[10px] uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{k.replace(/_/g, ' ')}</span>
                                <span className={`${colorClass} whitespace-pre-wrap mt-0.5 break-words`}>
                                    {typeof v === 'object' && v !== null ? JSON.stringify(v) : (v === '' ? '(vacío)' : String(v))}
                                </span>
                            </div>
                        ))
                    ) : (
                        <span className={`${colorClass} break-words`}>{String(value)}</span>
                    )
                ) : (
                    <span className="italic text-slate-400">No aplica</span>
                )}
            </div>
        </div>
    );
}
