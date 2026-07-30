import { ExternalLink, Trash2, Check, X } from 'lucide-react';
import { isPartialProfile } from './candidatoProfile.js';
import ScoreRing from './ScoreRing.jsx';

function DecisionBadge({ decision, isLight }) {
    if (decision === 'aprobado') {
        return (
            <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                Aprobado
            </span>
        );
    }
    if (decision === 'rechazado') {
        return (
            <span className="rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                Rechazado
            </span>
        );
    }
    return (
        <span className={`rounded-full border px-2 py-0.5 text-xs ${
            isLight ? 'border-slate-300 bg-slate-100 text-slate-600' : 'border-slate-600 bg-slate-700/40 text-slate-300'
        }`}>
            Pendiente
        </span>
    );
}

export default function AtraccionCandidatoCard({
    c,
    isLight,
    scoringActive = false,
    onOpen,
    onDelete,
    onDecision,
    selectable = false,
    selected = false,
    onToggleSelect
}) {
    const muted = isLight ? 'text-slate-600' : 'text-slate-400';
    const partial = isPartialProfile(c.perfil);
    const scorePending = scoringActive && c.score == null;
    // Los candidatos de X-Ray no tienen ficha enriquecida: en vez de abrir el
    // modal, se redirige directamente al perfil externo (LinkedIn, etc.).
    const isXray = /x-?ray/i.test(c.fuente || '');
    const redirectUrl = typeof c.url_perfil === 'string' && c.url_perfil.startsWith('http')
        ? c.url_perfil
        : '';
    const useRedirect = isXray && Boolean(redirectUrl);
    const decision = c.decision || 'pendiente';

    function handleActivate() {
        if (useRedirect) {
            window.open(redirectUrl, '_blank', 'noopener,noreferrer');
        } else {
            onOpen?.(c);
        }
    }

    const aprobarBtn = decision === 'aprobado'
        ? 'inline-flex items-center gap-1 rounded-md border border-emerald-500 bg-emerald-500 px-2 py-1 text-xs font-medium text-white'
        : (isLight
            ? 'inline-flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50'
            : 'inline-flex items-center gap-1 rounded-md border border-emerald-500/40 px-2 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-500/10');
    const rechazarBtn = decision === 'rechazado'
        ? 'inline-flex items-center gap-1 rounded-md border border-red-500 bg-red-500 px-2 py-1 text-xs font-medium text-white'
        : (isLight
            ? 'inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50'
            : 'inline-flex items-center gap-1 rounded-md border border-red-500/40 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10');

    return (
        <li
            className={`cursor-pointer rounded-lg border px-4 py-3 text-sm transition-colors ${
                isLight
                    ? 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    : 'border-slate-700 bg-[#04141E]/50 hover:bg-[#04141E]/80'
            }`}
            onClick={handleActivate}
        >
            <div className="flex items-center gap-3">
                {selectable ? (
                    <input
                        type="checkbox"
                        checked={selected}
                        title={decision !== 'aprobado'
                            ? 'Seleccionar (se aprueba automáticamente para campaña)'
                            : 'Seleccionar para campaña'}
                        onClick={(ev) => ev.stopPropagation()}
                        onChange={() => onToggleSelect?.(c.id)}
                        className="shrink-0 h-4 w-4 cursor-pointer accent-sky-600"
                        aria-label={`Seleccionar ${c.nombre || 'candidato'}`}
                    />
                ) : null}
                <div className="flex shrink-0 items-center gap-2">
                    <ScoreRing
                        score={c.score}
                        pending={scorePending}
                        partial={partial && c.score != null}
                        isLight={isLight}
                    />
                    {c.perfil?.foto_url ? (
                        <img
                            src={c.perfil.foto_url}
                            alt=""
                            className="h-10 w-10 rounded-full object-cover ring-1 ring-slate-200"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                        />
                    ) : null}
                </div>
                <div className="min-w-0 flex-1">
                    <div className={`flex items-center gap-2 font-medium ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                        <span className="truncate">{c.nombre || 'Sin nombre'}</span>
                        <span className={`text-xs font-normal ${muted}`}>{c.fuente}</span>
                        <DecisionBadge decision={decision} isLight={isLight} />
                    </div>
                    {c.perfil?.cargo ? <p className={`mt-0.5 text-xs ${muted}`}>{c.perfil.cargo}</p> : null}
                    {c.perfil?.ciudad ? <p className={`text-xs ${muted}`}>{c.perfil.ciudad}</p> : null}
                    {c.resumen_score ? (
                        <p className={`mt-1 line-clamp-2 text-xs italic ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                            {c.resumen_score}
                        </p>
                    ) : scorePending ? (
                        <p className={`mt-1 text-xs ${muted}`}>Evaluando encaje con la vacante…</p>
                    ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {onDecision ? (
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={(ev) => { ev.stopPropagation(); onDecision(c, decision === 'aprobado' ? 'pendiente' : 'aprobado'); }}
                                className={aprobarBtn}
                                title="Aprobar candidato"
                            >
                                <Check size={13} /> Aprobar
                            </button>
                            <button
                                type="button"
                                onClick={(ev) => { ev.stopPropagation(); onDecision(c, decision === 'rechazado' ? 'pendiente' : 'rechazado'); }}
                                className={rechazarBtn}
                                title="Rechazar candidato"
                            >
                                <X size={13} /> Rechazar
                            </button>
                        </div>
                    ) : null}
                    <div className="flex items-center gap-1">
                        {onDelete ? (
                            <button
                                type="button"
                                onClick={(ev) => { ev.stopPropagation(); onDelete(c); }}
                                title="Eliminar candidato"
                                aria-label={`Eliminar ${c.nombre || 'candidato'}`}
                                className={isLight
                                    ? 'inline-flex items-center justify-center rounded-md border border-red-200 p-1 text-red-600 hover:bg-red-50'
                                    : 'inline-flex items-center justify-center rounded-md border border-red-500/40 p-1 text-red-400 hover:bg-red-500/10'}
                            >
                                <Trash2 size={14} />
                            </button>
                        ) : null}
                        {useRedirect ? (
                            <span className={`inline-flex items-center gap-1 text-xs font-medium ${isLight ? 'text-sky-700' : 'text-sky-300'}`}>
                                Abrir perfil
                                <ExternalLink size={12} />
                            </span>
                        ) : (
                            <span className={`text-xs ${muted}`}>Ver ficha →</span>
                        )}
                    </div>
                </div>
            </div>
        </li>
    );
}
