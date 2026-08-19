import { X } from 'lucide-react';

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

export default function MonitoreoActividadModal({ actividad, onClose, isLight }) {
    if (!actividad) return null;

    const bgOverlay = isLight ? 'bg-black/40 backdrop-blur-sm' : 'bg-black/60 backdrop-blur-sm';
    const bgPanel = isLight ? 'bg-white' : 'bg-[#0a1929]';
    const border = isLight ? 'border-slate-200' : 'border-[#1a3a56]';
    const labelCls = 'text-xs font-semibold uppercase tracking-wider opacity-60';
    const valueCls = 'text-sm mt-0.5';

    return (
        <>
            <div className={`fixed inset-0 z-50 ${bgOverlay}`} aria-hidden="true" />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onMouseDown={onClose}>
                <div
                    className={`w-full max-w-3xl rounded-xl border ${border} ${bgPanel} shadow-2xl`}
                    onMouseDown={(e) => e.stopPropagation()}
                >
                    <header className={`flex items-center justify-between border-b px-6 py-4 ${border}`}>
                        <h2 className="text-lg font-bold">Detalle de actividad</h2>
                        <button type="button" onClick={onClose} className="rounded p-1 opacity-70 hover:opacity-100" aria-label="Cerrar">
                            <X size={18} />
                        </button>
                    </header>

                    <div className="space-y-3 px-6 py-5">
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <p className={labelCls}>Consultor</p>
                                <p className={valueCls}>{actividad.consultor_nombre || '—'}</p>
                            </div>
                            <div>
                                <p className={labelCls}>Cédula</p>
                                <p className={valueCls}>{actividad.cedula || '—'}</p>
                            </div>
                            <div>
                                <p className={labelCls}>Cliente</p>
                                <p className={valueCls}>{actividad.cliente || '—'}</p>
                            </div>
                            <div>
                                <p className={labelCls}>Origen</p>
                                <p className={`${valueCls} capitalize`}>{actividad.origen || '—'}</p>
                            </div>
                            <div>
                                <p className={labelCls}>Inicio</p>
                                <p className={valueCls}>{formatDateTime(actividad.inicio)}</p>
                            </div>
                            <div>
                                <p className={labelCls}>Fin</p>
                                <p className={valueCls}>{formatDateTime(actividad.fin)}</p>
                            </div>
                            <div>
                                <p className={labelCls}>Duración</p>
                                <p className={valueCls}>{formatDuration(actividad.inicio, actividad.fin)}</p>
                            </div>
                        </div>
                        <div>
                            <p className={labelCls}>Descripción</p>
                            <p className={`${valueCls} whitespace-pre-wrap break-words`}>{actividad.descripcion || '—'}</p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
