import { Link } from 'react-router-dom';
import { Loader2, Radio, X } from 'lucide-react';
import { useModuleTheme } from '../moduleTheme.js';
import { useAtraccionJob } from './AtraccionJobContext.jsx';
import { FUENTE_LABELS, PIPELINE_FASES, FASE_LABELS, resolveProgressEstado } from './atraccionJobStorage.js';

function secondsAgo(ts) {
    if (!ts) return '';
    const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 5) return 'ahora';
    if (s < 60) return `hace ${s}s`;
    return `hace ${Math.floor(s / 60)}m`;
}

function estadoChipClass(estado, isLight, animate = false) {
    const e = String(estado || 'pendiente');
    if (e === 'completado') {
        return isLight ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-emerald-950/50 text-emerald-200 border-emerald-800';
    }
    if (e === 'fallido' || e === 'omitido') {
        return isLight ? 'bg-red-100 text-red-800 border-red-200' : 'bg-red-950/50 text-red-200 border-red-800';
    }
    if (e === 'en_progreso') {
        const pulse = animate ? ' animate-pulse' : '';
        return (
            (isLight ? 'bg-amber-100 text-amber-900 border-amber-200' : 'bg-amber-950/50 text-amber-100 border-amber-700')
            + pulse
        );
    }
    return isLight ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-slate-800/60 text-slate-300 border-slate-600';
}

export function JobProgressPanel({ job, candidatosCount = 0, lastPolledAt, pollError, compact = false, isLight: isLightProp }) {
    const mt = useModuleTheme();
    const isLight = isLightProp ?? mt.isLight;
    if (!job) return null;

    const progreso = job.progreso && typeof job.progreso === 'object' ? job.progreso : {};
    const fasesProg = progreso.fases && typeof progreso.fases === 'object' ? progreso.fases : {};
    const fuentes = Object.keys(FUENTE_LABELS).filter((f) => job.fuentes?.[f]);
    const live = job.estado === 'en_progreso' || job.estado === 'pendiente';
    const faseActual = job.fase || 'descubrimiento';

    return (
        <div
            className={`rounded-xl border text-sm ${
                live
                    ? isLight
                        ? 'border-sky-300 bg-gradient-to-r from-sky-50 to-white shadow-sm'
                        : 'border-sky-800 bg-gradient-to-r from-sky-950/40 to-[#0b1f2a]/80'
                    : isLight
                        ? 'border-slate-200 bg-slate-50'
                        : 'border-slate-700 bg-[#04141E]/50'
            } ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}
        >
            <div className="flex flex-wrap items-center gap-2">
                {live ? (
                    <Loader2 size={16} className="animate-spin text-sky-600" aria-hidden />
                ) : null}
                <span className={`font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {live ? 'Búsqueda en vivo' : `Búsqueda ${job.estado}`}
                </span>
                {candidatosCount > 0 ? (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${isLight ? 'bg-sky-100 text-sky-800' : 'bg-sky-900/60 text-sky-100'}`}>
                        {candidatosCount} candidato{candidatosCount !== 1 ? 's' : ''}
                    </span>
                ) : null}
                {lastPolledAt ? (
                    <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        · actualizado {secondsAgo(lastPolledAt)}
                    </span>
                ) : null}
            </div>

            {pollError ? <p className="mt-2 text-xs text-red-500">{pollError}</p> : null}
            {job.error_mensaje ? (
                <p className={`mt-2 text-xs ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>{job.error_mensaje}</p>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-1.5">
                {PIPELINE_FASES.map((f) => {
                    const p = fasesProg[f] || {};
                    const isCurrent = faseActual === f;
                    const rawEstado = p.estado || (isCurrent && live ? 'en_progreso' : 'pendiente');
                    const estado = resolveProgressEstado(rawEstado, job.estado);
                    const animate = live && estado === 'en_progreso';
                    return (
                        <span
                            key={f}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                                isCurrent && live ? 'ring-1 ring-sky-400 ' : ''
                            }${estadoChipClass(estado, isLight, animate)}`}
                        >
                            {FASE_LABELS[f]}: {estado.replace(/_/g, ' ')}
                            {typeof p.count === 'number' && p.count > 0 ? ` (${p.count})` : ''}
                        </span>
                    );
                })}
                <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${
                        estadoChipClass(
                            resolveProgressEstado(fasesProg.scoring?.estado || 'pendiente', job.estado),
                            isLight,
                            live && fasesProg.scoring?.estado === 'en_progreso'
                        )
                    }`}
                >
                    {FASE_LABELS.scoring}: {resolveProgressEstado(fasesProg.scoring?.estado || 'pendiente', job.estado)}
                </span>
            </div>

            {fuentes.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
                {fuentes.map((f) => {
                    const p = progreso[f] || {};
                    const hasEstado = Boolean(p.estado);
                    const rawEstado = p.estado
                        || (live ? 'pendiente' : job.estado === 'fallido' && !hasEstado ? 'fallido' : 'completado');
                    const estado = resolveProgressEstado(rawEstado, job.estado);
                    const animate = live && estado === 'en_progreso';
                    return (
                        <span
                            key={f}
                            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${estadoChipClass(estado, isLight, animate)}`}
                        >
                            {FUENTE_LABELS[f]}: {estado.replace(/_/g, ' ')}
                            {typeof p.count === 'number' && p.count > 0 ? ` (${p.count})` : ''}
                        </span>
                    );
                })}
            </div>
            ) : null}

            {!compact && live && fuentes.every((f) => !(progreso[f]?.estado) || progreso[f]?.estado === 'pendiente') ? (
                <p className={`mt-2 text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    El worker está procesando… Si permanece en pendiente, verifique que el backend y el worker estén activos.
                </p>
            ) : null}

            {!compact && ['completado', 'parcial', 'fallido'].includes(job.estado) ? (
                <Link
                    to={`/admin/atraccion-talento/candidatos?job=${job.id}`}
                    className="mt-3 inline-block text-sm font-medium text-sky-600 underline"
                >
                    Ver candidatos de esta búsqueda
                </Link>
            ) : null}
        </div>
    );
}

export default function AtraccionJobLiveBanner() {
    const { isLight } = useModuleTheme();
    const {
        job,
        candidatos,
        candidatosCount,
        vacanteTitulo,
        lastPolledAt,
        pollError,
        isLive,
        dismissJob
    } = useAtraccionJob();

    if (!job) return null;

    const count = candidatos.length || candidatosCount;

    return (
        <div
            className={`sticky top-0 z-20 border-b px-4 py-3 md:px-6 ${
                isLive
                    ? isLight
                        ? 'border-sky-200 bg-sky-50/95 backdrop-blur'
                        : 'border-sky-900/60 bg-[#04141E]/95 backdrop-blur'
                    : isLight
                        ? 'border-slate-200 bg-white/95 backdrop-blur'
                        : 'border-slate-700/60 bg-[#0b1f2a]/95 backdrop-blur'
            }`}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        {isLive ? (
                            <Radio size={14} className="flex-shrink-0 animate-pulse text-sky-500" aria-hidden />
                        ) : null}
                        <p className={`truncate text-xs font-bold uppercase tracking-wide ${isLight ? 'text-sky-800' : 'text-sky-200'}`}>
                            {isLive ? 'Monitoreo activo' : 'Última búsqueda'}
                            {vacanteTitulo ? ` · ${vacanteTitulo}` : ''}
                        </p>
                    </div>
                    <div className="mt-2">
                        <JobProgressPanel
                            job={job}
                            candidatosCount={count}
                            lastPolledAt={lastPolledAt}
                            pollError={pollError}
                            compact
                            isLight={isLight}
                        />
                    </div>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-2">
                    {isLive ? (
                        <Link
                            to={`/admin/atraccion-talento/candidatos?job=${job.id}`}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                                isLight ? 'bg-sky-600 text-white hover:bg-sky-700' : 'bg-sky-700 text-white hover:bg-sky-600'
                            }`}
                        >
                            Ver en vivo ({count})
                        </Link>
                    ) : (
                        <button
                            type="button"
                            onClick={dismissJob}
                            className={`rounded-lg p-1 ${isLight ? 'text-slate-500 hover:bg-slate-200' : 'text-slate-400 hover:bg-slate-800'}`}
                            aria-label="Ocultar banner"
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
