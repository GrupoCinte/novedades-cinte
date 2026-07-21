import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createSourcingJob, createPostulacionesJob, createRediscoveryJob, generarOferta, publicarVacante, fetchPublicaciones } from './atraccionApi.js';
import { useAtraccionJob } from './AtraccionJobContext.jsx';
import { JobProgressPanel } from './AtraccionJobLiveBanner.jsx';
import { computeFiltrosFaltantes } from './filtrosObligatorios.js';
import { CINTE_BTN_PRIMARY } from './atraccionLayout.js';
import { displaySalarioCop } from './formatSalarioCopInput.js';

export function CriteriosChips({ criterios, isLight }) {
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
        criterios.cliente ||
        criterios.horario ||
        skills.length ||
        equiv.length ||
        palabras.length;

    if (!hasMeta && !criterios.parse_error) {
        return <p className={`mt-2 text-xs ${muted}`}>Sin criterios extraídos aún.</p>;
    }

    return (
        <div className="mt-3 space-y-2">
            {(criterios.cargo || criterios.ciudad || criterios.experiencia_min > 0 || criterios.modalidad
              || criterios.seniority || criterios.tipo_contrato || criterios.cliente || criterios.horario
              || (Array.isArray(criterios.salario_rangos_cop) && criterios.salario_rangos_cop.length)) ? (
                <div className="flex flex-wrap gap-1.5">
                    {criterios.cargo ? <span className={chip}>{criterios.cargo}</span> : null}
                    {criterios.ciudad ? <span className={chipSoft}>{criterios.ciudad}</span> : null}
                    {criterios.experiencia_min > 0 ? (
                        <span className={chipSoft}>{criterios.experiencia_min}+ años</span>
                    ) : null}
                    {criterios.modalidad ? <span className={chipSoft}>{criterios.modalidad}</span> : null}
                    {criterios.seniority ? <span className={chipSoft}>{criterios.seniority}</span> : null}
                    {criterios.tipo_contrato ? <span className={chipSoft}>{criterios.tipo_contrato}</span> : null}
                    {criterios.cliente ? <span className={chipSoft}>Cliente: {criterios.cliente}</span> : null}
                    {criterios.horario ? <span className={chipSoft}>{criterios.horario}</span> : null}
                    {Array.isArray(criterios.salario_rangos_cop) && criterios.salario_rangos_cop.length
                        ? <span className={chipSoft}>{displaySalarioCop(criterios.salario_rangos_cop)}</span>
                        : null}
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

export function VacanteBusquedaPanel({ vacante, token, health, integraciones, isLight }) {
    const userTouched = useRef(false);
    const [fuentes, setFuentes] = useState({ elempleo: false, linkedin: false, xray: true, zoho: false });
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
        ? 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
        : 'rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50';
    const btnOutline = `${btnSecondary} px-3 py-2`;
    const btnActive = `${CINTE_BTN_PRIMARY} px-3 py-2 text-xs`;

    const jobForVacante = globalJob?.vacante_id === vacante.id ? globalJob : null;
    const searchBusy = isLive && jobForVacante;
    const filtrosOk = vacante.criterios?.filtros_confirmados === true;
    const faltantes = computeFiltrosFaltantes(vacante.criterios || {});

    const connected = {
        elempleo: ['conectado', 'expirado'].includes(
            integraciones?.find((i) => i.provider === 'elempleo')?.estado
        ),
        linkedin: ['conectado', 'expirado'].includes(
            integraciones?.find((i) => i.provider === 'linkedin')?.estado
        ),
        zoho: ['conectado'].includes(
            integraciones?.find((i) => i.provider === 'zoho_recruit')?.estado
        )
    };

    useEffect(() => {
        if (userTouched.current) return;
        setFuentes({
            elempleo: connected.elempleo,
            linkedin: connected.linkedin,
            xray: true,
            zoho: connected.zoho
        });
    }, [connected.elempleo, connected.linkedin, connected.zoho]);

    function toggleFuente(key) {
        userTouched.current = true;
        setFuentes((prev) => ({ ...prev, [key]: !prev[key] }));
    }

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
                Guarde los filtros para habilitar la búsqueda automática.
            </p>
        );
    }

    if (faltantes.length > 0) {
        return (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                <p className="font-semibold">Filtros obligatorios pendientes</p>
                <p className="mt-0.5">
                    Edite la vacante y complete: {faltantes.map((f) => f.label).join(', ')} para iniciar la búsqueda.
                </p>
            </div>
        );
    }

    return (
        <div className="mt-3 border-t pt-3 border-slate-200/60 dark:border-slate-700/60">
            <p className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                Fuentes de búsqueda
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
                {[
                    ['elempleo', 'El Empleo', connected.elempleo],
                    ['linkedin', 'LinkedIn', connected.linkedin],
                    ['xray', 'X-Ray', true],
                    ['zoho', 'Zoho Recruit', connected.zoho]
                ].map(([key, label, ok]) => {
                    const active = Boolean(fuentes[key]);
                    const disabled = Boolean(searchBusy) || (key !== 'xray' && !ok);
                    return (
                        <div key={key} className="flex flex-col items-start gap-0.5">
                            <button
                                type="button"
                                aria-pressed={active}
                                disabled={disabled}
                                className={`${active ? btnActive : btnOutline} inline-flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-40`}
                                onClick={() => { if (!disabled) toggleFuente(key); }}
                            >
                                {label}
                                {ok && key !== 'xray' ? (
                                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                                        active
                                            ? 'bg-white/25 text-white'
                                            : (isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-900/40 text-emerald-200')
                                    }`}>
                                        Conectado
                                    </span>
                                ) : null}
                            </button>
                            {key !== 'xray' && !ok ? (
                                <Link
                                    to="/admin/atraccion-talento/integraciones"
                                    className="text-[10px] text-sky-600 underline"
                                >
                                    Conectar
                                </Link>
                            ) : null}
                        </div>
                    );
                })}
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
                {loading ? 'Iniciando…' : searchBusy ? 'Búsqueda en curso (ver banner arriba)' : 'Iniciar búsqueda'}
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

function normalizeEmpresasUrl(raw) {
    const u = String(raw || '').trim();
    if (!u) return '';
    if (/^https?:\/\//i.test(u)) return u;
    return `https://${u.replace(/^\/+/, '')}`;
}

function validatePostulacionesUrl(raw) {
    const url = normalizeEmpresasUrl(raw);
    if (!url) return { ok: false, error: 'Ingrese la URL de la oferta en El Empleo.' };
    try {
        // eslint-disable-next-line no-new
        new URL(url);
    } catch {
        return { ok: false, error: 'URL no válida.' };
    }
    if (!url.includes('/empresas/')) {
        return {
            ok: false,
            error: 'Use la URL del panel de empresas (debe contener /co/empresas/).'
        };
    }
    return { ok: true, url };
}

export function VacantePublicarPanel({ vacante, token, isLight, onPublishedUrl }) {
    const [textoOferta, setTextoOferta] = useState('');
    const [busy, setBusy] = useState('');
    const [msg, setMsg] = useState('');
    const [msgOk, setMsgOk] = useState(true);
    const [pollingPub, setPollingPub] = useState(false);
    const btnSecondary = isLight
        ? 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
        : 'rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50';
    const input = isLight
        ? 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'
        : 'mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm';

    useEffect(() => {
        if (!pollingPub) return undefined;
        const tick = async () => {
            try {
                const pubs = await fetchPublicaciones(token, vacante.id);
                const latest = pubs.find((p) => p.canal === 'elempleo') || pubs[0];
                if (!latest) return;
                if (latest.estado === 'publicada' && latest.url_publicada) {
                    onPublishedUrl?.(latest.url_publicada, latest);
                    setMsgOk(true);
                    setMsg('Oferta publicada en El Empleo. URL lista para importar postulados.');
                    setPollingPub(false);
                } else if (latest.estado === 'fallida') {
                    setMsgOk(false);
                    setMsg(latest.error_mensaje || 'La publicación falló.');
                    setPollingPub(false);
                }
            } catch {
                /* retry */
            }
        };
        const id = setInterval(tick, 3000);
        tick();
        return () => clearInterval(id);
    }, [pollingPub, token, vacante.id, onPublishedUrl]);

    async function publish(canal) {
        setMsg('');
        setBusy(canal);
        try {
            await publicarVacante(token, vacante.id, canal, textoOferta);
            if (canal === 'elempleo') {
                setMsgOk(true);
                setMsg('Publicando en El Empleo…');
                setPollingPub(true);
            } else {
                setMsgOk(true);
                setMsg('Publicación en LinkedIn iniciada.');
            }
        } catch (e) {
            setMsgOk(false);
            setMsg(e.message || 'Error al publicar');
        } finally {
            setBusy('');
        }
    }

    return (
        <div className="mt-4 border-t pt-4 border-slate-200/60 dark:border-slate-700/60">
            <p className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                Publicar vacante
            </p>
            <textarea
                className={`${input} min-h-[80px]`}
                placeholder="Texto de la oferta (genere con IA o edite)"
                value={textoOferta}
                onChange={(e) => setTextoOferta(e.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
                <button
                    type="button"
                    className={btnSecondary}
                    disabled={Boolean(busy) || pollingPub}
                    onClick={async () => {
                        setBusy('gen');
                        try {
                            const d = await generarOferta(token, vacante.id);
                            setTextoOferta(d.texto_oferta || '');
                        } catch (e) {
                            setMsgOk(false);
                            setMsg(e.message);
                        } finally {
                            setBusy('');
                        }
                    }}
                >
                    Generar con IA
                </button>
                <button
                    type="button"
                    className={CINTE_BTN_PRIMARY + ' px-3 py-1.5 text-xs'}
                    disabled={Boolean(busy) || pollingPub}
                    onClick={() => publish('elempleo')}
                >
                    {busy === 'elempleo' || pollingPub ? 'Publicando…' : 'Publicar El Empleo'}
                </button>
                <button
                    type="button"
                    className={btnSecondary}
                    disabled={Boolean(busy) || pollingPub}
                    onClick={() => publish('linkedin')}
                >
                    Post LinkedIn
                </button>
            </div>
            {msg ? <p className={`mt-2 text-xs ${msgOk ? 'text-emerald-600' : 'text-red-500'}`}>{msg}</p> : null}
        </div>
    );
}

export function VacantePostulacionesPanel({
    vacante, token, isLight, health, integraciones, urlPostulaciones, onUrlChange, urlLocked = false
}) {
    const [busy, setBusy] = useState('');
    const [msg, setMsg] = useState('');
    const [msgOk, setMsgOk] = useState(true);
    const [editUrl, setEditUrl] = useState(false);
    const {
        job: globalJob,
        candidatosCount,
        lastPolledAt,
        pollError,
        isLive,
        trackJob
    } = useAtraccionJob();
    const muted = isLight ? 'text-slate-500' : 'text-slate-400';
    const input = isLight
        ? 'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'
        : 'mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm';
    const btnSecondary = isLight
        ? 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
        : 'rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50';

    const jobForVacante = globalJob?.vacante_id === vacante.id ? globalJob : null;
    const postulacionesBusy = isLive && jobForVacante?.tipo === 'postulaciones';
    const eeConnected = ['conectado', 'expirado'].includes(
        integraciones?.find((i) => i.provider === 'elempleo')?.estado
    );
    const locked = urlLocked && urlPostulaciones && !editUrl;

    useEffect(() => {
        if (vacante.url_postulaciones_ee && !urlPostulaciones) {
            onUrlChange?.(vacante.url_postulaciones_ee);
        }
    }, [vacante.url_postulaciones_ee, urlPostulaciones, onUrlChange]);

    return (
        <div className="mt-4 border-t pt-4 border-slate-200/60 dark:border-slate-700/60">
            <p className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>
                Postulaciones El Empleo
            </p>
            <p className={`text-xs ${muted}`}>
                {locked ? 'URL obtenida automáticamente tras publicar.' : 'URL del panel empresas → Mis Ofertas → Por ver'}
            </p>
            {!eeConnected ? (
                <p className="mt-1 text-xs text-amber-600">
                    Conecte El Empleo en{' '}
                    <Link to="/admin/atraccion-talento/integraciones" className="underline">Integraciones</Link>.
                </p>
            ) : null}
            {!health?.workerConfigured ? (
                <p className="mt-1 text-xs text-amber-600">Worker no configurado (SOURCING_WORKER_URL).</p>
            ) : null}
            {locked ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <a href={urlPostulaciones} target="_blank" rel="noopener noreferrer" className="text-sky-600 underline break-all">
                        {urlPostulaciones}
                    </a>
                    <button type="button" className="text-sky-600 underline" onClick={() => setEditUrl(true)}>
                        Editar URL
                    </button>
                </div>
            ) : (
                <input
                    className={input}
                    placeholder="https://www.elempleo.com/co/empresas/..."
                    value={urlPostulaciones || ''}
                    onChange={(e) => onUrlChange?.(e.target.value)}
                />
            )}
            <button
                type="button"
                className={`${btnSecondary} mt-2`}
                disabled={Boolean(busy) || !urlPostulaciones?.trim() || !eeConnected || postulacionesBusy}
                onClick={async () => {
                    const check = validatePostulacionesUrl(urlPostulaciones);
                    if (!check.ok) {
                        setMsgOk(false);
                        setMsg(check.error);
                        return;
                    }
                    setBusy('post');
                    setMsg('');
                    try {
                        const data = await createPostulacionesJob(token, {
                            vacante_id: vacante.id,
                            url_oferta: check.url
                        });
                        setMsgOk(true);
                        setMsg(data.message || 'Importación iniciada.');
                        if (data.job) {
                            trackJob(data.job, { vacanteId: vacante.id, vacanteTitulo: vacante.titulo || 'Vacante' });
                        }
                    } catch (e) {
                        setMsgOk(false);
                        setMsg(e.message || 'Error');
                    } finally {
                        setBusy('');
                    }
                }}
            >
                {busy === 'post' ? 'Importando…' : postulacionesBusy ? 'Importación en curso…' : 'Importar postulados'}
            </button>
            {jobForVacante?.tipo === 'postulaciones' ? (
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
            {msg ? <p className={`mt-2 text-xs ${msgOk ? 'text-emerald-600' : 'text-red-500'}`}>{msg}</p> : null}
        </div>
    );
}

export function VacanteRediscoveryPanel({ vacante, token, isLight }) {
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const btnSecondary = isLight
        ? 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
        : 'rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50';
    const { trackJob } = useAtraccionJob();

    return (
        <div className="mt-4 border-t pt-4 border-slate-200/60 dark:border-slate-700/60">
            <button
                type="button"
                className={btnSecondary}
                disabled={busy}
                onClick={async () => {
                    setBusy(true);
                    setMsg('');
                    try {
                        const data = await createRediscoveryJob(token, vacante.id);
                        setMsg('Rediscovery iniciado.');
                        if (data.job) {
                            trackJob(data.job, { vacanteId: vacante.id, vacanteTitulo: vacante.titulo || 'Vacante' });
                        }
                    } catch (e) {
                        setMsg(e.message || 'Error');
                    } finally {
                        setBusy(false);
                    }
                }}
            >
                {busy ? 'Buscando…' : 'Rediscovery Zoho (30–180 días)'}
            </button>
            {msg ? <p className="mt-2 text-xs text-emerald-600">{msg}</p> : null}
        </div>
    );
}

/** Wrapper legacy (p. ej. AtraccionVacantePage tras crear). */
export function VacanteExtrasPanel({ vacante, token, isLight, health, integraciones }) {
    const [urlPostulaciones, setUrlPostulaciones] = useState(vacante.url_postulaciones_ee || '');
    const [urlLocked, setUrlLocked] = useState(Boolean(vacante.url_postulaciones_ee));

    return (
        <>
            <VacantePublicarPanel
                vacante={vacante}
                token={token}
                isLight={isLight}
                onPublishedUrl={(url) => { setUrlPostulaciones(url); setUrlLocked(true); }}
            />
            <VacantePostulacionesPanel
                vacante={vacante}
                token={token}
                isLight={isLight}
                health={health}
                integraciones={integraciones}
                urlPostulaciones={urlPostulaciones}
                onUrlChange={setUrlPostulaciones}
                urlLocked={urlLocked}
            />
            <VacanteRediscoveryPanel vacante={vacante} token={token} isLight={isLight} />
        </>
    );
}
