import { Clock } from 'lucide-react';

function formatFecha(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function formatValor(campo, value) {
    if (value == null || value === '') return '—';
    if (campo === 'tarifa_cliente' || campo === 'costo_empresa') {
        const n = Number(value);
        if (Number.isFinite(n)) {
            return new Intl.NumberFormat('es-CO', {
                style: 'currency',
                currency: 'COP',
                maximumFractionDigits: 0
            }).format(n);
        }
    }
    return String(value);
}

export default function ContratoHistorialPanel({ items = [], isLight = false, contratoLabel = '' }) {
    const list = Array.isArray(items) ? items : [];
    const box = isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.02]';
    const muted = isLight ? 'text-slate-500' : 'text-slate-400';
    const textMain = isLight ? 'text-slate-800' : 'text-slate-200';
    const rowBox = isLight ? 'border-slate-200 bg-white' : 'border-slate-600/40 bg-slate-900/40';

    return (
        <div className={`rounded-xl border p-4 ${box}`}>
            <p className={`mb-2 text-xs font-bold uppercase tracking-widest ${muted}`}>
                Historial del contrato{contratoLabel ? ` · ${contratoLabel}` : ''}
            </p>
            {list.length === 0 ? (
                <p className={`text-sm ${muted}`}>Aún no hay cambios en este contrato.</p>
            ) : (
                <ul className="flex max-h-52 flex-col gap-2 overflow-y-auto custom-scrollbar" aria-label="Historial de cambios del contrato">
                    {list.map((entry) => (
                        <li key={entry.id} className={`rounded-lg border px-3 py-2.5 text-xs ${rowBox}`}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <span className={`font-semibold ${textMain}`}>
                                    {entry.campoLabel || entry.campo}
                                </span>
                                <span className={`inline-flex items-center gap-1 ${muted}`}>
                                    <Clock size={12} aria-hidden />
                                    {formatFecha(entry.createdAt)}
                                </span>
                            </div>
                            <p className={`mt-1.5 font-medium ${textMain}`}>
                                {formatValor(entry.campo, entry.valorAntes)}
                                {' → '}
                                {formatValor(entry.campo, entry.valorDespues)}
                            </p>
                            <p className={`mt-1 ${muted}`}>
                                <span className="font-medium text-inherit">{entry.actorNombre || '—'}</span>
                                {entry.actorEmail ? <> · {entry.actorEmail}</> : null}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
