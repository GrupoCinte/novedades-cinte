import { ExternalLink, Check, X, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useModuleTheme } from '../moduleTheme.js';
import GestionModalShell from '../shared/modals/GestionModalShell.jsx';
import { isNavigableProfileUrl, isPartialProfile, profileSections, formatContactos } from './candidatoProfile.js';
import { enrichCandidato } from './atraccionApi.js';
import ScoreRing from './ScoreRing.jsx';

export default function AtraccionCandidatoModal({ candidato: c, onClose, onDecision, token, onEnriched }) {
    const { isLight } = useModuleTheme();
    const [enrichBusy, setEnrichBusy] = useState(false);
    const [enrichMsg, setEnrichMsg] = useState('');
    const muted = isLight ? 'text-slate-600' : 'text-slate-400';
    if (!c) return null;

    const partial = isPartialProfile(c.perfil);
    const sections = profileSections(c.perfil);
    const contactos = formatContactos(c.perfil);
    const showExternal = isNavigableProfileUrl(c.url_perfil);
    const decision = c.decision || 'pendiente';

    const aprobarBtn = decision === 'aprobado'
        ? 'inline-flex items-center gap-1 rounded-lg border border-emerald-500 bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white'
        : (isLight
            ? 'inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50'
            : 'inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-500/10');
    const rechazarBtn = decision === 'rechazado'
        ? 'inline-flex items-center gap-1 rounded-lg border border-red-500 bg-red-500 px-3 py-1.5 text-sm font-medium text-white'
        : (isLight
            ? 'inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50'
            : 'inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/10');

    return (
        <GestionModalShell
            open
            onClose={onClose}
            title={c.nombre || 'Sin nombre'}
            subtitle={[c.perfil?.cargo, c.perfil?.ciudad, c.fuente].filter(Boolean).join(' · ')}
            size="wide"
        >
            {onDecision ? (
                <div className={`mb-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                    isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-[#04141E]/40'
                }`}>
                    <span className={`text-sm ${muted}`}>
                        Decisión:{' '}
                        <span className={`font-semibold ${
                            decision === 'aprobado' ? 'text-emerald-600'
                                : decision === 'rechazado' ? 'text-red-500'
                                : (isLight ? 'text-slate-700' : 'text-slate-200')
                        }`}>
                            {decision === 'aprobado' ? 'Aprobado' : decision === 'rechazado' ? 'Rechazado' : 'Pendiente'}
                        </span>
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className={aprobarBtn}
                            onClick={() => onDecision(c, decision === 'aprobado' ? 'pendiente' : 'aprobado')}
                        >
                            <Check size={15} /> Aprobar
                        </button>
                        <button
                            type="button"
                            className={rechazarBtn}
                            onClick={() => onDecision(c, decision === 'rechazado' ? 'pendiente' : 'rechazado')}
                        >
                            <X size={15} /> Rechazar
                        </button>
                    </div>
                </div>
            ) : null}
            <div className="flex gap-4">
                <div className="flex shrink-0 flex-col items-center gap-2">
                    <ScoreRing score={c.score} partial={partial && c.score != null} isLight={isLight} />
                    {c.perfil?.foto_url ? (
                        <img
                            src={c.perfil.foto_url}
                            alt=""
                            className="h-16 w-16 rounded-full object-cover ring-1 ring-slate-200"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                        />
                    ) : null}
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${
                        partial
                            ? 'border-amber-300 bg-amber-50 text-amber-800'
                            : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                    }`}>
                        {partial ? 'Datos parciales' : 'Ficha completa'}
                    </span>
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                    {c.perfil?.fecha_actualizacion ? (
                        <p className={`text-xs ${isLight ? 'text-sky-700' : 'text-sky-300'}`}>
                            CV actualizado: {c.perfil.fecha_actualizacion}
                        </p>
                    ) : null}

                    {c.resumen_score ? (
                        <div>
                            <p className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                                Evaluación IA
                            </p>
                            <p className={`mt-1 text-sm ${muted}`}>{c.resumen_score}</p>
                        </div>
                    ) : null}

                    {c.perfil?.resumen_perfil ? (
                        <p className={`text-sm ${muted}`}>{c.perfil.resumen_perfil}</p>
                    ) : c.perfil?.snippet ? (
                        <p className={`text-sm ${muted}`}>{c.perfil.snippet}</p>
                    ) : null}

                    {contactos.length > 0 ? (
                        <ul className={`space-y-1 text-sm ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                            {contactos.map((ct) => (
                                <li key={`${ct.label}-${ct.telefono}-${ct.email}`}>
                                    <span className="font-medium">{ct.label}:</span>{' '}
                                    {[ct.telefono, ct.email].filter(Boolean).join(' · ')}
                                </li>
                            ))}
                        </ul>
                    ) : null}

                    {Array.isArray(c.perfil?.skills_enriquecidos) && c.perfil.skills_enriquecidos.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                            {c.perfil.skills_enriquecidos.slice(0, 12).map((skill) => (
                                <span
                                    key={skill}
                                    className={`rounded-full px-2 py-0.5 text-xs ${
                                        isLight ? 'bg-sky-100 text-sky-800' : 'bg-sky-900/50 text-sky-200'
                                    }`}
                                >
                                    {skill}
                                </span>
                            ))}
                        </div>
                    ) : null}

                    {sections.map((s) => (
                        <div key={s.label}>
                            <p className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                                {s.label}
                            </p>
                            {s.list ? (
                                <ul className={`mt-1 list-inside list-disc text-sm ${muted}`}>
                                    {s.list.map((item) => (
                                        <li key={item}>{item}</li>
                                    ))}
                                </ul>
                            ) : (
                                <p className={`mt-1 text-sm ${muted}`}>{s.value}</p>
                            )}
                        </div>
                    ))}

                    {!sections.length && !c.perfil?.resumen_perfil ? (
                        <p className={`text-sm ${muted}`}>
                            Aún no hay detalle adicional. El worker puede completar la ficha en la siguiente búsqueda.
                        </p>
                    ) : null}

                    {c.etapa ? (
                        <p className={`text-xs ${isLight ? 'text-sky-700' : 'text-sky-300'}`}>
                            Etapa: {c.etapa}
                            {c.enriquecido ? ' · enriquecido' : ''}
                            {c.score != null ? ` · score ${c.score}` : ''}
                            {c.perfil?.extraccion?.nota ? ` · ${c.perfil.extraccion.nota}` : ''}
                        </p>
                    ) : null}

                    {showExternal ? (
                        <a
                            href={c.url_perfil}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-sky-600 underline"
                        >
                            Abrir perfil externo
                            <ExternalLink size={13} />
                        </a>
                    ) : null}

                    {token && partial ? (
                        <button
                            type="button"
                            disabled={enrichBusy}
                            className={aprobarBtn}
                            onClick={async () => {
                                setEnrichBusy(true);
                                setEnrichMsg('');
                                try {
                                    const data = await enrichCandidato(token, c.id);
                                    setEnrichMsg(data.mensaje || 'Perfil enriquecido');
                                    if (data.candidato) onEnriched?.(data.candidato);
                                } catch (e) {
                                    setEnrichMsg(e.message);
                                } finally {
                                    setEnrichBusy(false);
                                }
                            }}
                        >
                            <Sparkles size={14} />
                            {enrichBusy ? 'Enriqueciendo…' : 'Enriquecer perfil'}
                        </button>
                    ) : null}
                    {enrichMsg ? <p className={`text-xs ${muted}`}>{enrichMsg}</p> : null}
                </div>
            </div>
        </GestionModalShell>
    );
}
