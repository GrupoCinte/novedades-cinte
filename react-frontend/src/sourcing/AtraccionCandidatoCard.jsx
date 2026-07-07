import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { isNavigableProfileUrl, isPartialProfile, profileSections, formatContactos } from './candidatoProfile.js';
import ScoreRing from './ScoreRing.jsx';

export default function AtraccionCandidatoCard({ c, isLight, scoringActive = false }) {
    const [open, setOpen] = useState(false);
    const muted = isLight ? 'text-slate-600' : 'text-slate-400';
    const partial = isPartialProfile(c.perfil);
    const sections = profileSections(c.perfil);
    const contactos = formatContactos(c.perfil);
    const showExternal = isNavigableProfileUrl(c.url_perfil);
    const scorePending = scoringActive && c.score == null;

    return (
        <li
            className={`rounded-lg border px-4 py-3 text-sm ${
                isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-[#04141E]/50'
            }`}
        >
            <div className="flex gap-3">
                <div className="flex shrink-0 flex-col items-center gap-1">
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
                    <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <div className={`font-medium ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                                {c.nombre || 'Sin nombre'}
                                <span className={`ml-2 text-xs font-normal ${muted}`}>{c.fuente}</span>
                            </div>
                            {c.resumen_score ? (
                                <p className={`mt-1 text-xs italic ${isLight ? 'text-slate-700' : 'text-slate-300'} ${open ? '' : 'line-clamp-2'}`}>
                                    {c.resumen_score}
                                </p>
                            ) : scorePending ? (
                                <p className={`mt-1 text-xs ${muted}`}>Evaluando encaje con la vacante…</p>
                            ) : null}
                            {c.perfil?.cargo ? (
                                <p className={`mt-0.5 ${muted}`}>{c.perfil.cargo}</p>
                            ) : null}
                            {c.perfil?.ciudad ? (
                                <p className={`text-xs ${muted}`}>{c.perfil.ciudad}</p>
                            ) : null}
                            {c.perfil?.fecha_actualizacion ? (
                                <p className={`text-xs ${isLight ? 'text-sky-700' : 'text-sky-300'}`}>
                                    CV actualizado: {c.perfil.fecha_actualizacion}
                                </p>
                            ) : null}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {partial ? (
                                <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                                    Datos parciales
                                </span>
                            ) : (
                                <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">
                                    Ficha completa
                                </span>
                            )}
                        </div>
                    </div>

                    {c.perfil?.resumen_perfil ? (
                        <p className={`mt-2 text-xs ${muted} ${open ? '' : 'line-clamp-3'}`}>
                            {c.perfil.resumen_perfil}
                        </p>
                    ) : c.perfil?.snippet ? (
                        <p className={`mt-2 line-clamp-3 text-xs ${muted}`}>{c.perfil.snippet}</p>
                    ) : null}

                    {contactos.length > 0 ? (
                        <ul className={`mt-2 space-y-1 text-xs ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>
                            {contactos.map((ct) => (
                                <li key={`${ct.label}-${ct.telefono}-${ct.email}`}>
                                    <span className="font-medium">{ct.label}:</span>{' '}
                                    {[ct.telefono, ct.email].filter(Boolean).join(' · ')}
                                </li>
                            ))}
                        </ul>
                    ) : null}

                    {Array.isArray(c.perfil?.skills_enriquecidos) && c.perfil.skills_enriquecidos.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                            {c.perfil.skills_enriquecidos.slice(0, 8).map((skill) => (
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

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setOpen((v) => !v)}
                            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                                isLight
                                    ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                                    : 'border-slate-600 text-slate-200 hover:bg-slate-800'
                            }`}
                        >
                            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            {open ? 'Ocultar ficha' : 'Ver ficha completa'}
                        </button>
                        {showExternal ? (
                            <a
                                href={c.url_perfil}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-sky-600 underline"
                            >
                                Abrir en El Empleo
                                <ExternalLink size={12} />
                            </a>
                        ) : null}
                    </div>

                    {open ? (
                        <div
                            className={`mt-3 space-y-3 rounded-lg border p-3 text-xs ${
                                isLight ? 'border-slate-200 bg-white' : 'border-slate-600 bg-[#0b1f2a]/60'
                            }`}
                        >
                            {c.resumen_score ? (
                                <div>
                                    <p className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                                        Evaluación IA
                                    </p>
                                    <p className={`mt-1 ${muted}`}>{c.resumen_score}</p>
                                </div>
                            ) : null}
                            {sections.map((s) => (
                                <div key={s.label}>
                                    <p className={`font-semibold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                                        {s.label}
                                    </p>
                                    {s.list ? (
                                        <ul className={`mt-1 list-inside list-disc ${muted}`}>
                                            {s.list.map((item) => (
                                                <li key={item}>{item}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className={`mt-1 ${muted}`}>{s.value}</p>
                                    )}
                                </div>
                            ))}
                            {!sections.length && !c.perfil?.resumen_perfil ? (
                                <p className={muted}>
                                    Aún no hay detalle adicional. El worker puede completar la ficha en la siguiente
                                    búsqueda.
                                </p>
                            ) : null}
                            {c.etapa ? (
                                <p className={`${isLight ? 'text-sky-700' : 'text-sky-300'}`}>
                                    Etapa: {c.etapa}
                                    {c.enriquecido ? ' · enriquecido' : ''}
                                    {c.score != null ? ` · score ${c.score}` : ''}
                                    {c.perfil?.extraccion?.nota ? ` · ${c.perfil.extraccion.nota}` : ''}
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>
        </li>
    );
}
