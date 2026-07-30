import ScoreRing from './ScoreRing.jsx';

import PreentrevistaFaseStepper from './PreentrevistaFaseStepper.jsx';

import {

    PREENTREVISTA_FASE_LABEL,

    PREENTREVISTA_FASE_TOTAL,

    fasesCompletadas,

    faseNumero,

    estadoBadgeClass,

    estadoLabel

} from './preentrevistaFases.js';



const ATRACCION_SCORE_MIN = 70;



function fmtFecha(value) {

    if (!value) return '—';

    try {

        return new Date(value).toLocaleString('es-CO', {

            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'

        });

    } catch {

        return '—';

    }

}



const DATO_LABELS = {

    nombre: 'Nombre',

    edad: 'Edad',

    ciudad: 'Ciudad',

    experiencia: 'Experiencia',

    cargo: 'Cargo actual',

    salario: 'Aspiración salarial',

    disponibilidad: 'Disponibilidad',

    contrato: 'Tipo de contrato',

    correo: 'Correo',

    telefono: 'Teléfono'

};



function DatosGrid({ datos, isLight }) {

    const entries = Object.entries(datos || {}).filter(([, v]) => v != null && v !== '');

    if (!entries.length) {

        return (

            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>

                Sin datos recolectados aún.

            </p>

        );

    }

    return (

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">

            {entries.map(([k, v]) => (

                <div

                    key={k}

                    className={`rounded-md border px-2.5 py-1.5 ${

                        isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-[#04141E]/40'

                    }`}

                >

                    <p className={`text-[10px] font-medium uppercase tracking-wide ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>

                        {DATO_LABELS[k] || k.replace(/_/g, ' ')}

                    </p>

                    <p className={`truncate text-xs ${isLight ? 'text-slate-800' : 'text-slate-100'}`} title={String(v)}>

                        {String(v)}

                    </p>

                </div>

            ))}

        </div>

    );

}



function ScorePrescreeningBlock({ pre, isLight }) {

    const score = pre.score;

    const hasDatos = pre.datos && Object.keys(pre.datos).length > 0;

    const hasResumen = Boolean(pre.resumen_match);

    const muted = isLight ? 'text-slate-500' : 'text-slate-400';



    let badge = 'Pendiente evaluación';

    let badgeCls = isLight

        ? 'border-slate-200 bg-slate-100 text-slate-600'

        : 'border-slate-600 bg-slate-800 text-slate-300';



    if (score != null && Number.isFinite(Number(score))) {

        const n = Number(score);

        if (n >= ATRACCION_SCORE_MIN) {

            badge = 'Apto';

            badgeCls = isLight

                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'

                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300';

        } else {

            badge = 'No apto';

            badgeCls = isLight

                ? 'border-rose-200 bg-rose-50 text-rose-700'

                : 'border-rose-500/40 bg-rose-500/10 text-rose-300';

        }

    } else if (hasDatos || hasResumen) {

        badge = 'Evaluando…';

        badgeCls = isLight

            ? 'border-amber-200 bg-amber-50 text-amber-700'

            : 'border-amber-500/40 bg-amber-500/10 text-amber-300';

    }



    return (

        <div className={`mt-3 rounded-lg border px-3 py-2.5 ${

            isLight ? 'border-slate-200 bg-slate-50/80' : 'border-slate-700 bg-[#04141E]/30'

        }`}>

            <p className={`text-[10px] font-semibold uppercase tracking-wide ${muted}`}>

                Score prescreening

            </p>

            <div className="mt-2 flex items-center gap-3">

                <ScoreRing score={score} size={52} isLight={isLight} />

                <div>

                    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeCls}`}>

                        {badge}

                    </span>

                    <p className={`mt-1 text-[11px] ${muted}`}>

                        Umbral apto: {ATRACCION_SCORE_MIN} pts

                        {score != null ? ` · Score: ${Math.round(Number(score))}` : ''}

                    </p>

                </div>

            </div>

        </div>

    );

}



function PreentrevistaCard({ pre, isLight }) {

    const nombre = pre.candidato_nombre || pre.destinatario_nombre || pre.datos?.nombre || pre.telefono || 'Candidato';

    const currentIdx = faseNumero(pre.fase);

    const completadas = Math.max(fasesCompletadas(pre.fase, pre.estado), currentIdx > 0 ? currentIdx : 0);

    const entrevista = pre.entrevista && typeof pre.entrevista === 'object' ? pre.entrevista : null;

    const muted = isLight ? 'text-slate-500' : 'text-slate-400';



    return (

        <li

            className={`rounded-lg border px-4 py-3 ${

                isLight ? 'border-slate-200 bg-white' : 'border-slate-700 bg-[#04141E]/50'

            }`}

        >

            <div className="flex items-start gap-3">

                <div className="min-w-0 flex-1">

                    <div className="flex flex-wrap items-center gap-2">

                        <span className={`font-medium ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>

                            {nombre}

                        </span>

                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${estadoBadgeClass(pre.estado, isLight)}`}>

                            {estadoLabel(pre.estado)}

                        </span>

                        <span className={`text-xs ${muted}`}>

                            Fase: {PREENTREVISTA_FASE_LABEL[pre.fase] || pre.fase || '—'}

                        </span>

                    </div>



                    <div className="mt-3">

                        <PreentrevistaFaseStepper fase={pre.fase} estado={pre.estado} isLight={isLight} />

                        <span className={`mt-1 inline-block text-[11px] ${muted}`}>

                            {completadas}/{PREENTREVISTA_FASE_TOTAL} fases

                        </span>

                    </div>



                    <ScorePrescreeningBlock pre={pre} isLight={isLight} />



                    {pre.resumen_match ? (

                        <p className={`mt-2 rounded-md px-2.5 py-1.5 text-xs italic ${

                            isLight ? 'bg-slate-50 text-slate-700' : 'bg-[#04141E]/40 text-slate-300'

                        }`}>

                            {pre.resumen_match}

                        </p>

                    ) : null}



                    <div className="mt-2">

                        <DatosGrid datos={pre.datos} isLight={isLight} />

                    </div>



                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">

                        {pre.cv_url ? (

                            <a

                                href={pre.cv_url}

                                target="_blank"

                                rel="noopener noreferrer"

                                onClick={(e) => e.stopPropagation()}

                                className={isLight ? 'font-medium text-sky-700 hover:underline' : 'font-medium text-sky-300 hover:underline'}

                            >

                                Ver hoja de vida →

                            </a>

                        ) : (

                            <span className={muted}>Sin HV</span>

                        )}

                        {entrevista?.inicio ? (

                            <span className={isLight ? 'text-emerald-700' : 'text-emerald-300'}>

                                Entrevista: {fmtFecha(entrevista.inicio)}

                                {entrevista.join_url ? (

                                    <a

                                        href={entrevista.join_url}

                                        target="_blank"

                                        rel="noopener noreferrer"

                                        className="ml-1 underline"

                                    >

                                        (Teams)

                                    </a>

                                ) : null}

                            </span>

                        ) : null}

                        <span className={`ml-auto ${muted}`}>Actualizado {fmtFecha(pre.updated_at)}</span>

                    </div>

                </div>

            </div>

        </li>

    );

}



export default function PreentrevistaSeguimiento({ preentrevistas, isLight, loading, error }) {

    const muted = isLight ? 'text-slate-500' : 'text-slate-400';

    if (loading) return <p className={`text-sm ${muted}`}>Cargando seguimiento…</p>;

    if (error) return <p className="text-sm text-red-500">{error}</p>;

    if (!preentrevistas || preentrevistas.length === 0) {

        return (

            <p className={`text-sm ${muted}`}>

                Aún no hay candidatos en prescreening para esta vacante. Selecciona candidatos aptos y envíalos a prescreening.

            </p>

        );

    }

    return (

        <ul className="space-y-2">

            {preentrevistas.map((pre) => (

                <PreentrevistaCard key={pre.id} pre={pre} isLight={isLight} />

            ))}

        </ul>

    );

}

