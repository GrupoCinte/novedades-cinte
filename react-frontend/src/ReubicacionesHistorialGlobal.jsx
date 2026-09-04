import React, { useState, useEffect, useMemo } from 'react';
import { useModuleTheme } from './moduleTheme.js';
import { buildGestionTableDash } from './gestionTableDashTheme.js';
import { 
    Clock, 
    RefreshCw,
    Activity,
    UserCheck,
    FileText
} from 'lucide-react';

export default function ReubicacionesHistorialGlobal({ token, searchQuery, filterApto, estadoFiltro, fechaFinDesde, fechaFinHasta, tipoEvento, actor }) {
    const { isLight } = useModuleTheme();
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);

    const [historial, setHistorial] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [nextCursor, setNextCursor] = useState(null);
    const [expandedRows, setExpandedRows] = useState(new Set());

    const toggleRow = (id) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const fetchHistorial = async (cursor = null, reset = false) => {
        setLoading(true);
        setError('');
        if (reset) {
            setHistorial([]);
            setNextCursor(null);
        }
        try {
            const params = new URLSearchParams();
            if (cursor) params.append('cursor', cursor);
            if (searchQuery) params.append('q', searchQuery);
            if (filterApto) params.append('apto_no_apto', filterApto);
            if (estadoFiltro) params.append('estado', estadoFiltro);
            if (fechaFinDesde) params.append('fecha_fin_desde', fechaFinDesde);
            if (fechaFinHasta) params.append('fecha_fin_hasta', fechaFinHasta);
            if (tipoEvento) params.append('tipo', tipoEvento);
            if (actor) params.append('actor', actor);

            const res = await fetch(`/api/directorio/reubicaciones-historial-global?${params.toString()}`, {
                credentials: 'include',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.ok) {
                if (reset) {
                    setHistorial(data.data.historial);
                } else {
                    setHistorial(prev => [...prev, ...data.data.historial]);
                }
                setNextCursor(data.data.next_cursor);
            } else {
                setError(data.error || 'Error al cargar el historial global');
            }
        } catch {
            setError('Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistorial(null, true);
    }, [searchQuery, filterApto, estadoFiltro, fechaFinDesde, fechaFinHasta, tipoEvento, actor]);

    const getTipoIcon = (tipoLabel) => {
        const t = tipoLabel.toLowerCase();
        if (t.includes('recibida') || t.includes('sincronizaci')) return <RefreshCw size={14} className="text-blue-500" />;
        if (t.includes('actualizada') || t.includes('edición')) return <FileText size={14} className="text-amber-500" />;
        if (t.includes('estado') || t.includes('transición')) return <Activity size={14} className="text-purple-500" />;
        if (t.includes('decisión')) return <UserCheck size={14} className="text-emerald-500" />;
        if (t.includes('observación')) return <FileText size={14} className="text-slate-500" />;
        return <Clock size={14} className="text-slate-400" />;
    };

    return (
        <div className={dash.tableWrap}>
            <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
                <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                    <thead>
                        <tr className={dash.thead}>
                            <th className="p-4 whitespace-nowrap font-semibold text-left normal-case">Fecha</th>
                            <th className="p-4 whitespace-nowrap font-semibold text-left normal-case">Colaborador</th>
                            <th className="p-4 whitespace-nowrap font-semibold text-left normal-case">Evento</th>
                            <th className="p-4 whitespace-nowrap font-semibold text-left normal-case">Responsable</th>
                            <th className="p-4 whitespace-nowrap font-semibold text-left normal-case">Detalles</th>
                        </tr>
                    </thead>
                    <tbody className={dash.tbody}>
                        {error ? (
                            <tr>
                                <td colSpan={5} className={`p-12 text-center font-medium ${dash.muted}`}>
                                    {error}
                                </td>
                            </tr>
                        ) : historial.length === 0 && !loading ? (
                            <tr>
                                <td colSpan={5} className={`p-12 text-center font-medium ${dash.muted}`}>
                                    No hay resultados para los filtros seleccionados.
                                </td>
                            </tr>
                        ) : (
                            historial.map(item => (
                                <tr
                                    key={item.id}
                                    className={dash.trHover}
                                >
                                    <td className={`${dash.tdCell} whitespace-nowrap`}>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{new Date(item.fecha).toLocaleDateString('es-CO')}</span>
                                            <span className="text-xs opacity-70">
                                                {new Date(item.fecha).toLocaleTimeString('es-CO')}
                                            </span>
                                        </div>
                                    </td>
                                    <td className={dash.tdCell}>
                                        <div className="flex flex-col">
                                            <span className="font-medium">{item.consultor}</span>
                                            <span className="text-xs opacity-70">CC {item.cedula}</span>
                                        </div>
                                    </td>
                                    <td className={dash.tdCell}>
                                        <div className="flex items-center gap-2">
                                            <div className={`p-1.5 rounded-md ${isLight ? 'bg-slate-100' : 'bg-slate-900'}`}>
                                                {getTipoIcon(item.tipo_label)}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-semibold">{item.tipo_label}</span>
                                                <span className="text-[10px] uppercase tracking-wide opacity-70">
                                                    {item.origen}
                                                </span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className={dash.tdCell}>
                                        <div className="flex flex-col">
                                            <span>{item.actor}</span>
                                            <span className="text-xs opacity-70">
                                                {item.rol}
                                            </span>
                                        </div>
                                    </td>
                                    <td className={`${dash.tdCell} min-w-[300px] whitespace-normal align-top`}>
                                        <p className="text-sm mb-2 font-medium">
                                            {item.descripcion}
                                        </p>
                                        {(() => {
                                            const changes = getAuditChanges(item.before, item.after);
                                            const hasJustificacion = item.after && item.after.justificacion;
                                            const isExpanded = expandedRows.has(item.id);
                                            
                                            if (changes.length === 0 && !hasJustificacion) return null;

                                            return (
                                                <div className="mt-2">
                                                    {!isExpanded ? (
                                                        <button 
                                                            onClick={() => toggleRow(item.id)}
                                                            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                                                        >
                                                            Ver más
                                                        </button>
                                                    ) : (
                                                        <div className="mt-3 flex flex-col gap-3">
                                                            {changes.length > 0 && (
                                                                <div className="text-xs">
                                                                    <p className="font-semibold text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wide">Historial de cambios</p>
                                                                    <div className="overflow-hidden rounded border border-slate-200 dark:border-slate-700">
                                                                        <table className="w-full border-collapse text-left">
                                                                            <thead>
                                                                                <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                                                                                    <th className="p-2 font-semibold text-slate-600 dark:text-slate-300">Campo</th>
                                                                                    <th className="p-2 font-semibold text-slate-600 dark:text-slate-300">Anterior</th>
                                                                                    <th className="p-2 font-semibold text-slate-600 dark:text-slate-300">Nuevo</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {changes.map(change => (
                                                                                    <tr key={change.field} className="border-b border-slate-100 dark:border-slate-800/50 last:border-0">
                                                                                        <td className="p-2 font-medium text-slate-700 dark:text-slate-200">{change.field}</td>
                                                                                        <td className="p-2 text-rose-600 dark:text-rose-400">{change.before}</td>
                                                                                        <td className="p-2 text-emerald-600 dark:text-emerald-400">{change.after}</td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {hasJustificacion && (
                                                                <div className="text-xs">
                                                                    <span className="font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Justificación</span>
                                                                    <p className="text-slate-600 dark:text-slate-400 mt-1 whitespace-pre-wrap">{formatAuditValue(item.after.justificacion)}</p>
                                                                </div>
                                                            )}
                                                            <button 
                                                                onClick={() => toggleRow(item.id)}
                                                                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline self-start"
                                                            >
                                                                Ver menos
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </td>
                                </tr>
                            ))
                        )}
                        {loading && (
                            <tr>
                                <td colSpan={5} className={`p-12 text-center font-medium ${dash.muted}`}>
                                    Cargando...
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            
            {nextCursor && !loading && (
                <div className={dash.footerBar}>
                    <span>Hay más eventos antiguos</span>
                    <button
                        onClick={() => fetchHistorial(nextCursor, false)}
                        className={dash.compactBtn}
                    >
                        Cargar más
                    </button>
                </div>
            )}
        </div>
    );
}

const IGNORED_AUDIT_FIELDS = new Set(['version', 'dias_transcurridos', 'justificacion']);

function flattenAuditValue(value, prefix = '') {
    if (value == null || typeof value !== 'object') return { [prefix]: value };
    return Object.entries(value).reduce((result, [key, nestedValue]) => {
        if (IGNORED_AUDIT_FIELDS.has(key)) return result;
        const field = prefix ? `${prefix}.${key}` : key;
        return { ...result, ...flattenAuditValue(nestedValue, field) };
    }, {});
}

function formatAuditValue(value) {
    if (value == null || value === '') return 'Sin información';
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    return String(value);
}

function auditFieldLabel(field) {
    const labels = {
        observacion: 'Observación',
        decision: 'Decisión',
        justificacion: 'Justificación',
        estado: 'Estado',
        fecha_fin: 'Fecha fin',
        cliente_destino: 'Cliente destino',
        causal: 'Causal'
    };
    return labels[field] || field.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getAuditChanges(before, after) {
    const previous = flattenAuditValue(before);
    const next = flattenAuditValue(after);
    const fields = [...new Set([...Object.keys(previous), ...Object.keys(next)])];
    return fields
        .filter((field) => !IGNORED_AUDIT_FIELDS.has(field) && previous[field] !== next[field])
        .map((field) => ({
            field: auditFieldLabel(field),
            before: formatAuditValue(previous[field]),
            after: formatAuditValue(next[field])
        }));
}


