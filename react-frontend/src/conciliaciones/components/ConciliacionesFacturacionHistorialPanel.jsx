import { useMemo } from 'react';
import { CheckCircle2, XCircle, Clock, Pencil, CalendarPlus } from 'lucide-react';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';

function formatHistorialFecha(value) {
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

function formatCop(n) {
    const x = Math.round(Number(n) || 0);
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}

function etapaLabel(etapa) {
    if (etapa === 'ANALISTA') return 'Analista de conciliaciones';
    if (etapa === 'NOMINA') return 'Nómina';
    return etapa || '—';
}

function ajusteDiffLabel(detalle) {
    if (!detalle || typeof detalle !== 'object') return null;
    const prev = detalle.valorAnterior;
    const next = detalle.valorNuevo;
    if (prev == null && next == null) return null;
    if (detalle.campo === 'tarifa') {
        return `${formatCop(prev)} → ${formatCop(next)}`;
    }
    if (detalle.campo === 'monto_novedad') {
        const tipo = detalle.tipoNovedad ? ` (${detalle.tipoNovedad})` : '';
        return `${formatCop(prev)} → ${formatCop(next)}${tipo}`;
    }
    return null;
}

function novedadManualDiffLabel(detalle) {
    if (!detalle || detalle.campo !== 'novedad_manual') return null;
    const fi = detalle.fechaInicio || '—';
    const ff = detalle.fechaFin || '—';
    const dias = Number(detalle.diasHabiles) || 0;
    const monto = Number(detalle.montoCop) || 0;
    const diasTxt = dias === 1 ? '1 día hábil' : `${dias} días hábiles`;
    return `${fi} → ${ff} · ${diasTxt} · ${formatCop(monto)}`;
}

export default function ConciliacionesFacturacionHistorialPanel({ items = [], loading = false, isLight }) {
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const list = Array.isArray(items) ? items : [];
    const blockBg = isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0f172a]/50 border-slate-700/50';
    const textMain = isLight ? 'text-slate-800' : 'text-slate-200';

    return (
        <div className="space-y-3">
            <h3 className={`font-heading text-xs font-bold uppercase tracking-wider ${dash.titleLg}`}>
                Historial de revisiones
            </h3>
            <div className={`rounded-xl border p-4 ${blockBg}`}>
                {loading ? (
                    <p className={`text-sm ${dash.modalMuted}`}>Cargando historial…</p>
                ) : list.length === 0 ? (
                    <p className={`text-sm ${dash.modalMuted}`}>Sin revisiones registradas.</p>
                ) : (
                    <ul className="space-y-3" aria-label="Historial de aprobaciones, rechazos y ajustes">
                        {list.map((entry) => {
                            const esAprobar = entry.accion === 'APROBAR';
                            const esRechazar = entry.accion === 'RECHAZAR';
                            const esAjuste = entry.accion === 'AJUSTE';
                            const esNovedadManual = entry.accion === 'NOVEDAD_MANUAL';
                            const diff = esNovedadManual
                                ? novedadManualDiffLabel(entry.detalle)
                                : esAjuste
                                  ? ajusteDiffLabel(entry.detalle)
                                  : null;
                            return (
                                <li
                                    key={entry.id}
                                    className={`rounded-lg border px-3 py-2.5 text-xs ${
                                        isLight ? 'border-slate-200 bg-white' : 'border-slate-600/40 bg-slate-900/40'
                                    }`}
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            {esAprobar ? (
                                                <CheckCircle2 size={16} className="shrink-0 text-emerald-500" aria-hidden />
                                            ) : esRechazar ? (
                                                <XCircle size={16} className="shrink-0 text-rose-500" aria-hidden />
                                            ) : esNovedadManual ? (
                                                <CalendarPlus size={16} className="shrink-0 text-sky-500" aria-hidden />
                                            ) : (
                                                <Pencil size={16} className="shrink-0 text-amber-500" aria-hidden />
                                            )}
                                            <span className={`font-semibold ${textMain}`}>
                                                {esAprobar
                                                    ? 'Aprobación'
                                                    : esRechazar
                                                      ? 'Rechazo'
                                                      : esNovedadManual
                                                        ? 'Vacaciones en tiempo (manual)'
                                                        : 'Ajuste de montos'}{' '}
                                                — {etapaLabel(entry.etapa)}
                                            </span>
                                        </div>
                                        <span className={`inline-flex items-center gap-1 ${dash.modalMuted}`}>
                                            <Clock size={12} aria-hidden />
                                            {formatHistorialFecha(entry.createdAt)}
                                        </span>
                                    </div>
                                    {diff ? (
                                        <p className={`mt-1.5 font-medium tabular-nums ${textMain}`}>{diff}</p>
                                    ) : null}
                                    <p className={`mt-1.5 ${dash.modalMuted}`}>
                                        <span className="font-medium text-inherit">{entry.actorNombre || '—'}</span>
                                        {entry.actorEmail ? (
                                            <>
                                                {' '}
                                                · <span>{entry.actorEmail}</span>
                                            </>
                                        ) : null}
                                    </p>
                                    {entry.observacion ? (
                                        <p className={`mt-1.5 whitespace-pre-wrap ${textMain}`}>{entry.observacion}</p>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
