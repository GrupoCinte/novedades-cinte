import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useModuleTheme } from '../moduleTheme.js';
import { ATRACCION_PAGE_MAIN } from './atraccionLayout.js';
import { fetchJob, fetchRecentCandidatos } from './atraccionApi.js';
import { useAtraccionJob } from './AtraccionJobContext.jsx';
import { JobProgressPanel } from './AtraccionJobLiveBanner.jsx';
import { isJobActive, JOB_TERMINAL } from './atraccionJobStorage.js';
import AtraccionCandidatoCard from './AtraccionCandidatoCard.jsx';

export default function AtraccionCandidatosPage({ token }) {
    const { isLight } = useModuleTheme();
    const [searchParams] = useSearchParams();
    const jobFilter = searchParams.get('job');
    const card = isLight
        ? 'rounded-xl border border-slate-200 bg-white p-6 shadow-sm'
        : 'rounded-xl border border-slate-700/60 bg-[#0b1f2a]/80 p-6 shadow-lg';
    const muted = isLight ? 'text-slate-600' : 'text-slate-400';

    const {
        job: liveJob,
        candidatos: liveCandidatos,
        candidatosCount,
        lastPolledAt,
        pollError,
        isLive,
        trackJob,
    } = useAtraccionJob();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [candidatos, setCandidatos] = useState([]);
    const [job, setJob] = useState(null);
    const [vacanteTitulo, setVacanteTitulo] = useState('');

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            try {
                if (jobFilter) {
                    const data = await fetchJob(token, jobFilter);
                    if (!cancelled) {
                        setJob(data.job);
                        setCandidatos(Array.isArray(data.candidatos) ? data.candidatos : []);
                        if (data.job && isJobActive(data.job.estado)) {
                            trackJob(data.job, { vacanteId: data.job.vacante_id, vacanteTitulo: '' });
                        }
                    }
                } else if (liveJob && (isLive || JOB_TERMINAL.has(liveJob.estado))) {
                        setJob(liveJob);
                        if (liveCandidatos.length > 0) {
                            setCandidatos(liveCandidatos);
                        } else if (liveJob.id) {
                            const data = await fetchJob(token, liveJob.id);
                            if (!cancelled) {
                                setCandidatos(Array.isArray(data.candidatos) ? data.candidatos : []);
                            }
                        }
                } else {
                    const data = await fetchRecentCandidatos(token);
                    if (!cancelled) {
                        const rows = Array.isArray(data.candidatos) ? data.candidatos : [];
                        setCandidatos(rows);
                        const titulos = [...new Set(rows.map((c) => c.vacante_titulo).filter(Boolean))];
                        if (titulos.length === 1) {
                            setVacanteTitulo(titulos[0]);
                        } else if (titulos.length > 1) {
                            setVacanteTitulo(`${titulos.length} vacantes`);
                        }
                    }
                }
            } catch (e) {
                if (!cancelled) setError(e.message || 'Error al cargar candidatos');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [jobFilter, liveJob?.id, liveJob?.estado, isLive, trackJob]);

    useEffect(() => {
        if (jobFilter && liveJob?.id === jobFilter) {
            setJob(liveJob);
            setCandidatos(liveCandidatos);
        } else if (!jobFilter && liveJob && (isLive || JOB_TERMINAL.has(liveJob.estado))) {
            setJob(liveJob);
            setCandidatos(liveCandidatos);
        }
    }, [jobFilter, liveJob, liveCandidatos, isLive]);

    const displayJob = (jobFilter && liveJob?.id === jobFilter) ? liveJob : job;
    const displayCandidatos = (jobFilter && liveJob?.id === jobFilter) ? liveCandidatos : candidatos;
    const showLivePanel = displayJob && (isLive || isJobActive(displayJob.estado));
    const scoringActive =
        displayJob?.progreso?.fases?.scoring?.estado === 'en_progreso'
        || (isLive && displayJob?.fase === 'scoring');

    return (
        <main className={ATRACCION_PAGE_MAIN}>
            {showLivePanel ? (
                <JobProgressPanel
                    job={displayJob}
                    candidatosCount={displayCandidatos.length || candidatosCount}
                    lastPolledAt={lastPolledAt}
                    pollError={pollError}
                    isLight={isLight}
                />
            ) : null}

            <div className={card}>
                <h1 className={`text-xl font-heading font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Candidatos
                    {isLive ? (
                        <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 animate-pulse">
                            en vivo
                        </span>
                    ) : null}
                </h1>
                <p className={`mt-2 text-sm ${muted}`}>
                    {displayJob
                        ? `Búsqueda ${displayJob.estado}${displayJob.error_mensaje ? ` — ${displayJob.error_mensaje}` : ''}`
                        : vacanteTitulo
                            ? `Vacante: ${vacanteTitulo}`
                            : 'Perfiles encontrados por el worker de scraping.'}
                </p>
                {isLive ? (
                    <p className={`mt-1 text-xs ${isLight ? 'text-sky-700' : 'text-sky-300'}`}>
                        La lista se actualiza sola cada pocos segundos mientras el worker busca.
                    </p>
                ) : null}
            </div>

            <div className={card}>
                {loading && displayCandidatos.length === 0 ? (
                    <p className={`text-sm ${muted}`}>Cargando…</p>
                ) : error ? (
                    <p className="text-sm text-red-500">{error}</p>
                ) : displayCandidatos.length === 0 ? (
                    <p className={`text-sm ${muted}`}>
                        {isLive
                            ? 'Buscando candidatos… aparecerán aquí en cuanto el worker los reporte.'
                            : 'Aún no hay candidatos. Inicie una búsqueda desde la pestaña Búsqueda.'}
                    </p>
                ) : (
                    <ul className="space-y-3">
                        {displayCandidatos.map((c) => (
                            <AtraccionCandidatoCard
                                key={c.id}
                                c={c}
                                isLight={isLight}
                                scoringActive={scoringActive}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </main>
    );
}
