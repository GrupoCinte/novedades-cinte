import { useState } from 'react';
import { X, CheckCircle2, XCircle } from 'lucide-react';
import { patchActividadEstado } from './monitoreoActividadesApi.js';

const MAX_OBS = 1000;

function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(date);
}

function formatDuration(inicio, fin) {
    if (!inicio || !fin) return '—';
    const ms = new Date(fin).getTime() - new Date(inicio).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const mins = Math.round(ms / 60000);
    const h = Math.floor(mins / 60);
    return h ? `${h} h ${mins % 60} min` : `${mins} min`;
}

function estadoBadge(estado) {
    const s = String(estado || '').toLowerCase();
    if (s === 'aprobado') return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">🟢 Aprobado</span>;
    if (s === 'rechazado') return <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">🔴 Rechazado</span>;
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">🟡 Pendiente</span>;
}

export default function MonitoreoActividadModal({ actividad, onClose, onUpdated, isLight }) {
    const [action, setAction] = useState(null); // null | 'aprobado' | 'rechazado'
    const [observaciones, setObservaciones] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    if (!actividad) return null;

    const handleSubmit = async () => {
        if (action === 'rechazado' && !observaciones.trim()) {
            setError('La observación de rechazo es obligatoria.');
            return;
        }
        if (observaciones.length > MAX_OBS) {
            setError(`La observación no puede superar ${MAX_OBS} caracteres.`);
            return;
        }
        setError('');
        setLoading(true);
        try {
            await patchActividadEstado(actividad.id, { estado: action, observaciones: observaciones.trim() || undefined });
            onUpdated?.();
            onClose();
        } catch (err) {
            setError(err.message || 'Error al procesar la solicitud.');
        } finally {
            setLoading(false);
        }
    };

    const bgOverlay = isLight ? 'bg-black/40' : 'bg-black/60';
    const bgPanel = isLight ? 'bg-white' : 'bg-[#0a1929]';
    const border = isLight ? 'border-slate-200' : 'border-[#1a3a56]';
    const labelCls = 'text-xs font-semibold uppercase tracking-wider opacity-60';
    const valueCls = 'text-sm mt-0.5';

    return (
        <>
            <div className={`fixed inset-0 z-50 ${bgOverlay}`} onClick={onClose} aria-hidden="true" />
            <div className={`fixed inset-0 z-50 flex items-center justify-center p-4`}>
                <div className={`w-full max-w-lg rounded-xl border ${border} ${bgPanel} shadow-2xl`} onClick={(e) => e.stopPropagation()}>
                    {/* Header */}
                    <header className={`flex items-center justify-between border-b px-6 py-4 ${border}`}>
                        <h2 className="text-lg font-bold">Detalle de actividad</h2>
                        <button type="button" onClick={onClose} className="rounded p-1 opacity-70 hover:opacity-100" aria-label="Cerrar">
                            <X size={18} />
                        </button>
                    </header>

                    {/* Body */}
                    <div className="space-y-3 px-6 py-5">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div><p className={labelCls}>Consultor</p><p className={valueCls}>{actividad.consultor_nombre || '—'}</p></div>
                            <div><p className={labelCls}>Cédula</p><p className={valueCls}>{actividad.cedula || '—'}</p></div>
                            <div><p className={labelCls}>Cliente</p><p className={valueCls}>{actividad.cliente || '—'}</p></div>
                            <div><p className={labelCls}>Origen</p><p className={`${valueCls} capitalize`}>{actividad.origen || '—'}</p></div>
                            <div><p className={labelCls}>Inicio</p><p className={valueCls}>{formatDateTime(actividad.inicio)}</p></div>
                            <div><p className={labelCls}>Fin</p><p className={valueCls}>{formatDateTime(actividad.fin)}</p></div>
                            <div><p className={labelCls}>Duración</p><p className={valueCls}>{formatDuration(actividad.inicio, actividad.fin)}</p></div>
                            <div><p className={labelCls}>Estado</p><p className="mt-1">{estadoBadge(actividad.estado)}</p></div>
                        </div>
                        <div>
                            <p className={labelCls}>Descripción</p>
                            <p className={`${valueCls} whitespace-pre-wrap`}>{actividad.descripcion || '—'}</p>
                        </div>

                        {/* Auditoría previa */}
                        {actividad.aprobado_por_email && (
                            <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">
                                Aprobado por {actividad.aprobado_por_email} el {formatDateTime(actividad.aprobado_en)}
                            </div>
                        )}
                        {actividad.rechazado_por_email && (
                            <div className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800">
                                Rechazado por {actividad.rechazado_por_email} el {formatDateTime(actividad.rechazado_en)}
                                {actividad.observaciones_rechazo && <p className="mt-1 font-medium">Motivo: {actividad.observaciones_rechazo}</p>}
                            </div>
                        )}

                        {/* Acciones */}
                        {actividad.estado === 'pendiente' && !action && (
                            <div className="flex gap-2 pt-2">
                                <button type="button" onClick={() => setAction('aprobado')} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                                    <CheckCircle2 size={16} /> Aprobar
                                </button>
                                <button type="button" onClick={() => setAction('rechazado')} className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">
                                    <XCircle size={16} /> Rechazar
                                </button>
                            </div>
                        )}

                        {/* Formulario de confirmación */}
                        {action && (
                            <div className={`space-y-2 rounded-lg border p-3 ${border}`}>
                                <p className="text-sm font-semibold">
                                    {action === 'aprobado' ? '¿Confirmar aprobación?' : '¿Confirmar rechazo?'}
                                </p>
                                <textarea
                                    className={`w-full rounded-lg border px-3 py-2 text-sm ${border} ${isLight ? 'bg-white' : 'bg-[#04141E]'}`}
                                    rows={3}
                                    maxLength={MAX_OBS}
                                    placeholder={action === 'rechazado' ? 'Observación obligatoria (causa e indicaciones)...' : 'Observación opcional...'}
                                    value={observaciones}
                                    onChange={(e) => setObservaciones(e.target.value)}
                                />
                                <p className="text-right text-xs opacity-50">{observaciones.length}/{MAX_OBS}</p>
                                {error && <p className="text-sm text-rose-600">{error}</p>}
                                <div className="flex gap-2">
                                    <button type="button" disabled={loading} onClick={handleSubmit} className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${action === 'aprobado' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'} disabled:opacity-50`}>
                                        {loading ? 'Procesando…' : 'Confirmar'}
                                    </button>
                                    <button type="button" disabled={loading} onClick={() => { setAction(null); setObservaciones(''); setError(''); }} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${border} ${isLight ? 'text-slate-700 hover:bg-slate-100' : 'text-slate-200 hover:bg-[#0f2942]'}`}>
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
