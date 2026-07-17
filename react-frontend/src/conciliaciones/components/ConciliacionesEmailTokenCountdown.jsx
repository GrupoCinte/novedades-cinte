import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

/**
 * @param {string|null|undefined} emailExpiraAt
 * @param {string|null|undefined} emailUsadoAt
 * @param {string} estadoServicio
 * @param {Date} [now]
 */
export function resolveEmailTokenCountdownStatus({
    emailExpiraAt,
    emailUsadoAt,
    estadoServicio,
    now = new Date()
}) {
    const est = String(estadoServicio || '').trim().toUpperCase();
    if (emailUsadoAt || est === 'CONCILIADA') {
        return { kind: 'cerrado', label: 'Respondido / Cerrado', msLeft: 0 };
    }
    if (est !== 'ENVIADA' || !emailExpiraAt) {
        return { kind: 'none', label: '', msLeft: 0 };
    }
    const expMs = new Date(emailExpiraAt).getTime();
    if (Number.isNaN(expMs)) return { kind: 'none', label: '', msLeft: 0 };
    const msLeft = Math.max(0, expMs - now.getTime());
    if (msLeft <= 0) {
        return { kind: 'vencido', label: 'Vencido', msLeft: 0 };
    }
    return { kind: 'activo', label: formatCountdownMs(msLeft), msLeft };
}

export function formatCountdownMs(ms) {
    const totalSec = Math.max(0, Math.floor(Number(ms) / 1000));
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

export default function ConciliacionesEmailTokenCountdown({
    emailExpiraAt = null,
    emailUsadoAt = null,
    estadoServicio = '',
    liderDecisiones = null,
    isLight = false,
    compact = false
}) {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const status = resolveEmailTokenCountdownStatus({
            emailExpiraAt,
            emailUsadoAt,
            estadoServicio,
            now: new Date()
        });
        if (status.kind !== 'activo') return undefined;
        const id = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(id);
    }, [emailExpiraAt, emailUsadoAt, estadoServicio]);

    const status = resolveEmailTokenCountdownStatus({
        emailExpiraAt,
        emailUsadoAt,
        estadoServicio,
        now
    });
    if (status.kind === 'none') return null;

    const chip =
        status.kind === 'activo'
            ? isLight
                ? 'border-[#2F7BB8]/30 bg-[#2F7BB8]/10 text-[#2F7BB8]'
                : 'border-[#65BCF7]/30 bg-[#2F7BB8]/15 text-[#65BCF7]'
            : status.kind === 'vencido'
              ? 'border-red-500/30 bg-red-500/10 text-red-500'
              : isLight
                ? 'border-emerald-500/30 bg-emerald-50 text-emerald-700'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';

    const dec = liderDecisiones;
    const showDec =
        dec &&
        (Number(dec.aprobados) > 0 || Number(dec.rechazados) > 0 || Number(dec.pendientes) > 0);

    return (
        <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
            <span
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${chip}`}
            >
                <Clock size={11} aria-hidden />
                {status.kind === 'activo' ? `Enviada · quedan ${status.label}` : status.label}
            </span>
            {showDec ? (
                <p className={`text-[10px] tabular-nums ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    Líder: {Number(dec.aprobados) || 0} aprob. / {Number(dec.rechazados) || 0} rech. /{' '}
                    {Number(dec.pendientes) || 0} pend.
                </p>
            ) : null}
        </div>
    );
}
