import { Clock } from 'lucide-react';
import { groupHistorialBloques } from './contratoEstanteMap.js';

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

function accionLabel(antes, despues) {
    const vacioAntes = antes == null || antes === '';
    const vacioDespues = despues == null || despues === '';
    if (vacioAntes && !vacioDespues) return 'Agregó';
    if (!vacioAntes && vacioDespues) return 'Quitó';
    return 'Cambió';
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

function tituloBloque(bloque) {
    const n = bloque.cambios.length;
    if (n === 1) {
        const entry = bloque.cambios[0];
        return `${accionLabel(entry.valorAntes, entry.valorDespues)} ${entry.campoLabel || entry.campo}`;
    }
    return `Guardó ${n} cambios`;
}

export default function ContratoHistorialPanel({ items = [], isLight = false }) {
    const bloques = groupHistorialBloques(items);
    const box = isLight ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-white/[0.02]';
    const muted = isLight ? 'text-slate-500' : 'text-slate-400';
    const textMain = isLight ? 'text-slate-800' : 'text-slate-200';
    const rowBox = isLight ? 'border-slate-200 bg-white' : 'border-slate-600/40 bg-slate-900/40';
    const lineBox = isLight ? 'border-slate-100' : 'border-white/5';

    return (
        <div className={`rounded-xl border p-4 ${box}`}>
            <p className={`mb-2 text-xs font-bold uppercase tracking-widest ${muted}`}>
                Historial de la ficha
            </p>
            {bloques.length === 0 ? (
                <p className={`text-sm ${muted}`}>Aún no hay cambios en esta ficha.</p>
            ) : (
                <ul className="flex max-h-52 flex-col gap-2 overflow-y-auto custom-scrollbar" aria-label="Historial de cambios de la ficha">
                    {bloques.map((bloque) => (
                        <li key={bloque.id} className={`rounded-lg border px-3 py-2.5 text-xs ${rowBox}`}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <span className={`font-semibold ${textMain}`}>{tituloBloque(bloque)}</span>
                                <span className={`inline-flex items-center gap-1 ${muted}`}>
                                    <Clock size={12} aria-hidden />
                                    {formatFecha(bloque.createdAt)}
                                </span>
                            </div>
                            <ul className="mt-1.5 flex flex-col gap-1.5">
                                {bloque.cambios.map((entry, idx) => (
                                    <li key={entry.id} className={bloque.cambios.length > 1 && idx > 0 ? `border-t pt-1.5 ${lineBox}` : ''}>
                                        {bloque.cambios.length > 1 ? (
                                            <p className={`font-medium ${textMain}`}>
                                                {accionLabel(entry.valorAntes, entry.valorDespues)}{' '}
                                                {entry.campoLabel || entry.campo}
                                            </p>
                                        ) : null}
                                        <p className={`font-medium ${textMain}`}>
                                            {formatValor(entry.campo, entry.valorAntes)}
                                            {' → '}
                                            {formatValor(entry.campo, entry.valorDespues)}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                            <p className={`mt-1 ${muted}`}>
                                <span className="font-medium text-inherit">{bloque.actorNombre || '—'}</span>
                                {bloque.actorEmail ? <> · {bloque.actorEmail}</> : null}
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
