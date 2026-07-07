import { useEffect, useState } from 'react';
import { useModuleTheme } from '../moduleTheme.js';
import { ATRACCION_PAGE_MAIN, CINTE_BTN_PRIMARY } from './atraccionLayout.js';
import { Link, useLocation } from 'react-router-dom';
import {
    createVacante,
    createSourcingJob,
    fetchAtraccionHealth,
    fetchIntegraciones,
    fetchVacantes,
    updateVacanteCriterios
} from './atraccionApi.js';
import { useAtraccionJob } from './AtraccionJobContext.jsx';
import { JobProgressPanel } from './AtraccionJobLiveBanner.jsx';
import FiltrosReviewPanel from './FiltrosReviewPanel.jsx';

function CriteriosChips({ criterios, isLight }) {
    if (!criterios || typeof criterios !== 'object') return null;
    const chip = isLight
        ? 'rounded-full bg-sky-50 px-2.5 py-0.5 text-xs text-sky-800 border border-sky-200'
        : 'rounded-full bg-sky-950/60 px-2.5 py-0.5 text-xs text-sky-200 border border-sky-800';
    const chipSoft = isLight
        ? 'rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-700 border border-slate-200'
        : 'rounded-full bg-slate-800/60 px-2.5 py-0.5 text-xs text-slate-300 border border-slate-600';
    const muted = isLight ? 'text-slate-500' : 'text-slate-400';

    const skills = Array.isArray(criterios.skills_requeridas)
        ? criterios.skills_requeridas
        : Array.isArray(criterios.skills)
            ? criterios.skills
            : [];
    const equiv = Array.isArray(criterios.cargos_equivalentes) ? criterios.cargos_equivalentes : [];
    const palabras = Array.isArray(criterios.palabras_clave_hv) ? criterios.palabras_clave_hv : [];
    const hasMeta =
        criterios.cargo ||
        criterios.ciudad ||
        criterios.experiencia_min > 0 ||
        criterios.modalidad ||
        skills.length ||
        equiv.length ||
        palabras.length;

    if (!hasMeta && !criterios.parse_error) {
        return <p className={`mt-2 text-xs ${muted}`}>Sin criterios extraídos aún.</p>;
    }

    return (
        <div className="mt-3 space-y-2">
            {(criterios.cargo || criterios.ciudad || criterios.experiencia_min > 0 || criterios.modalidad) ? (
                <div className="flex flex-wrap gap-1.5">
                    {criterios.cargo ? <span className={chip}>{criterios.cargo}</span> : null}
                    {criterios.ciudad ? <span className={chipSoft}>{criterios.ciudad}</span> : null}
                    {criterios.experiencia_min > 0 ? (
                        <span className={chipSoft}>{criterios.experiencia_min}+ años</span>
                    ) : null}
                    {criterios.modalidad ? <span className={chipSoft}>{criterios.modalidad}</span> : null}
                </div>
            ) : null}
            {equiv.length ? (
                <div className="flex flex-wrap gap-1.5">
                    {equiv.map((s) => (
                        <span key={`eq-${s}`} className={chip}>{s}</span>
                    ))}
                </div>
            ) : null}
            {palabras.length ? (
                <p className={`text-xs ${muted}`}>Palabras HV: {palabras.join(' · ')}</p>
            ) : null}
            {skills.length ? (
                <div className="flex flex-wrap gap-1.5">
                    {skills.map((s) => (
                        <span key={`req-${s}`} className={chipSoft}>{s}</span>
                    ))}
                </div>
            ) : null}
            {criterios.parse_error ? (
                <p className="text-xs text-amber-600">{criterios.parse_error}</p>
            ) : null}
        </div>
    );
}

function VacanteBusquedaPanel({ vacante, token, health, integraciones, isLight }) {
    const [fuentes, setFuentes] = useState({ elempleo: false, linkedin: false, xray: true });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const {
        job: globalJob,
        candidatosCount,
        lastPolledAt,
        pollError,
        isLive,
        trackJob
    } = useAtraccionJob();
    const muted = isLight ? 'text-slate-500' : 'text-slate-400';
    const btnSecondary = isLight
        ? 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50'
        : 'rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800';

    const jobForVacante = globalJob?.vacante_id === vacante.id ? globalJob : null;
    const searchBusy = isLive && jobForVacante;
    const filtrosOk = vacante.criterios?.filtros_confirmados === true;

    const connected = {
        elempleo: ['conectado', 'expirado'].includes(
            integraciones?.find((i) => i.provider === 'elempleo')?.estado
        ),
        linkedin: ['conectado', 'expirado'].includes(
            integraciones?.find((i) => i.provider === 'linkedin')?.estado
        )
    };

    async function onStartSearch() {
        setError('');
        setLoading(true);
        try {
            const data = await createSourcingJob(token, { vacante_id: vacante.id, fuentes });
            trackJob(data.job, {
                vacanteId: vacante.id,
                vacanteTitulo: vacante.titulo || 'Vacante'
            });
        } catch (err) {
            setError(err.message || 'No se pudo iniciar la búsqueda');
            if (err.message?.includes('502') || err.message?.includes('Worker')) {
                setError(`${err.message}. ¿Está corriendo el worker en :8090?`);
            }
        } finally {
            setLoading(false);
        }
    }

    if (vacante.estado !== 'activa' || !filtrosOk) {
        return (
            <p className={`mt-3 text-xs ${muted}`}>
                Confirme los filtros arriba para habilitar la búsqueda automática.
            </p>
        );
    }

    return (
        <div className="mt-3 border-t pt-3 border-slate-200/60 dark:border-slate-700/60">
            <p className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                Fuentes de búsqueda
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {[
                    ['elempleo', 'El Empleo', connected.elempleo],
                    ['linkedin', 'LinkedIn', connected.linkedin],
                    ['xray', 'X-Ray', true]
                ].map(([key, label, ok]) => (
                    <label key={key} className={`flex items-center gap-1.5 ${muted}`}>
                        <input
                            type="checkbox"
                            checked={Boolean(fuentes[key])}
                            disabled={Boolean(searchBusy) || (key !== 'xray' && !ok)}
                            onChange={(ev) => setFuentes((prev) => ({ ...prev, [key]: ev.target.checked }))}
                        />
                        {label}
                        {key !== 'xray' && !ok ? (
                            <Link
                                to="/admin/atraccion-talento/integraciones"
                                className="text-sky-600 underline"
                                onClick={(ev) => ev.stopPropagation()}
                            >
                                conectar
                            </Link>
                        ) : null}
                    </label>
                ))}
            </div>
            {!health?.workerConfigured ? (
                <p className="mt-2 text-xs text-amber-600">
                    Worker no configurado (SOURCING_WORKER_URL).
                </p>
            ) : null}
            {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
            <button
                type="button"
                disabled={loading || !Object.values(fuentes).some(Boolean) || Boolean(searchBusy)}
                className={`${btnSecondary} mt-2`}
                onClick={onStartSearch}
            >
                {loading ? 'Iniciando…' : searchBusy ? 'Búsqueda en curso (ver banner arriba)' : '2. Iniciar búsqueda'}
            </button>
            {jobForVacante ? (
                <div className="mt-3">
                    <JobProgressPanel
                        job={jobForVacante}
                        candidatosCount={candidatosCount}
                        lastPolledAt={lastPolledAt}
                        pollError={pollError}
                        isLight={isLight}
                    />
                </div>
            ) : null}
        </div>
    );
}

function VacanteCard({
    vacante,
    token,
    health,
    integraciones,
    isLight,
    onVacanteUpdated
}) {
    function handleUpdated(updated) {
        onVacanteUpdated?.(updated);
    }

    return (
        <li
            className={`rounded-lg border px-4 py-3 text-sm ${
                isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700 bg-[#04141E]/50'
            }`}
        >
            <div className={`font-medium ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                {vacante.titulo || 'Vacante sin título'}
                <span className={`ml-2 text-xs font-normal ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {vacante.estado}
                </span>
            </div>
            <p className={`mt-1 line-clamp-2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {vacante.descripcion}
            </p>
            <CriteriosChips criterios={vacante.criterios} isLight={isLight} />
            <FiltrosReviewPanel
                vacante={vacante}
                token={token}
                isLight={isLight}
                updateVacanteCriterios={updateVacanteCriterios}
                onUpdated={handleUpdated}
            />
            <VacanteBusquedaPanel
                vacante={vacante}
                token={token}
                health={health}
                integraciones={integraciones}
                isLight={isLight}
            />
        </li>
    );
}

export default function AtraccionBusquedaPage({ token }) {
    const location = useLocation();
    const mt = useModuleTheme();
    const { isLight } = mt;
    const card = isLight
        ? 'rounded-xl border border-slate-200 bg-white p-6 shadow-sm'
        : 'rounded-xl border border-slate-700/60 bg-[#0b1f2a]/80 p-6 shadow-lg';
    const muted = isLight ? 'text-slate-600' : 'text-slate-400';
    const input = isLight
        ? 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900'
        : 'w-full rounded-lg border border-slate-600 bg-[#04141E] px-3 py-2 text-sm text-slate-100';

    const [health, setHealth] = useState(null);
    const [integraciones, setIntegraciones] = useState([]);
    const [vacantes, setVacantes] = useState([]);
    const [descripcion, setDescripcion] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [okMsg, setOkMsg] = useState('');
    const [lastCreated, setLastCreated] = useState(null);

    useEffect(() => {
        const flash = location.state?.flash;
        if (!flash) return undefined;
        setOkMsg(String(flash));
        const id = setTimeout(() => setOkMsg(''), 8000);
        return () => clearTimeout(id);
    }, [location.state?.flash]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [h, v, integ] = await Promise.all([
                    fetchAtraccionHealth(token),
                    fetchVacantes(token),
                    fetchIntegraciones(token)
                ]);
                if (!cancelled) {
                    setHealth(h);
                    setVacantes(v);
                    setIntegraciones(integ);
                }
            } catch (e) {
                if (!cancelled) setError(e.message || 'Error al cargar módulo');
            }
        })();
        return () => { cancelled = true; };
    }, [token]);

    function upsertVacante(updated) {
        setVacantes((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
        setLastCreated((prev) => (prev?.id === updated.id ? updated : prev));
    }

    async function onSubmit(e) {
        e.preventDefault();
        setError('');
        setOkMsg('');
        setLastCreated(null);
        setLoading(true);
        try {
            const result = await createVacante(token, { descripcion: descripcion.trim() });
            const vacante = result.vacante || result;
            setVacantes((prev) => [vacante, ...prev]);
            setLastCreated(vacante);
            setDescripcion('');
            if (result.parseWarning) {
                setOkMsg(`Vacante guardada en borrador: ${result.parseWarning}`);
            } else {
                setOkMsg(
                    'Vacante analizada. Revise y confirme los filtros antes de iniciar la búsqueda.'
                );
            }
        } catch (err) {
            setError(err.message || 'No se pudo guardar');
        } finally {
            setLoading(false);
        }
    }

    return (
        <main className={ATRACCION_PAGE_MAIN}>
            <div className={card}>
                <h1 className={`text-xl font-heading font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Nueva búsqueda de candidatos
                </h1>
                <p className={`mt-2 text-sm ${muted}`}>
                    Paso 1: analizar vacante · Paso 2: confirmar filtros · Paso 3: buscar candidatos.
                </p>
                {health ? (
                    <p className={`mt-3 text-xs ${muted}`}>
                        Módulo {health.version}
                        {health.bedrockConfigured ? ' · Bedrock activo' : ' · Bedrock pendiente'}
                        {health.workerConfigured ? ' · worker configurado' : ' · worker pendiente'}
                    </p>
                ) : null}
            </div>

            <form onSubmit={onSubmit} className={card}>
                <label className={`block text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                    Descriptivo de la vacante
                </label>
                <textarea
                    className={`${input} mt-2 min-h-[140px] resize-y`}
                    placeholder="Ej: Buscamos Arquitecto de Soluciones en Bogotá, 5+ años, AWS, GCP..."
                    value={descripcion}
                    onChange={(ev) => setDescripcion(ev.target.value)}
                    required
                    minLength={20}
                    disabled={loading}
                />
                {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
                {okMsg ? <p className="mt-3 text-sm text-emerald-600">{okMsg}</p> : null}
                <button type="submit" disabled={loading} className={`${CINTE_BTN_PRIMARY} mt-4`}>
                    {loading ? 'Analizando vacante con IA…' : '1. Registrar y analizar vacante'}
                </button>
            </form>

            {lastCreated ? (
                <div className={card}>
                    <h2 className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        Criterios extraídos
                    </h2>
                    <p className={`mt-1 text-sm ${muted}`}>
                        {lastCreated.titulo || 'Vacante sin título'}
                        <span className="ml-2 text-xs">({lastCreated.estado})</span>
                    </p>
                    <CriteriosChips criterios={lastCreated.criterios} isLight={isLight} />
                    <FiltrosReviewPanel
                        vacante={lastCreated}
                        token={token}
                        isLight={isLight}
                        updateVacanteCriterios={updateVacanteCriterios}
                        onUpdated={upsertVacante}
                    />
                    <VacanteBusquedaPanel
                        vacante={lastCreated}
                        token={token}
                        health={health}
                        integraciones={integraciones}
                        isLight={isLight}
                    />
                </div>
            ) : null}

            <div className={card}>
                <h2 className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Vacantes recientes
                </h2>
                {vacantes.length === 0 ? (
                    <p className={`mt-3 text-sm ${muted}`}>Aún no hay vacantes registradas.</p>
                ) : (
                    <ul className="mt-4 space-y-3">
                        {vacantes.map((v) => (
                            <VacanteCard
                                key={v.id}
                                vacante={v}
                                token={token}
                                health={health}
                                integraciones={integraciones}
                                isLight={isLight}
                                onVacanteUpdated={upsertVacante}
                            />
                        ))}
                    </ul>
                )}
            </div>
        </main>
    );
}
