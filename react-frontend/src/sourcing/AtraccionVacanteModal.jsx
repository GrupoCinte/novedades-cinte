import { useCallback, useEffect, useMemo, useState } from 'react';

import { Archive, Sparkles, Users, ListChecks, Send } from 'lucide-react';

import { useModuleTheme } from '../moduleTheme.js';

import GestionModalShell from '../shared/modals/GestionModalShell.jsx';

import {

    archiveVacante,

    updateVacanteCriterios,

    fetchVacanteCandidatos,

    fetchVacantePreentrevistas,

    setCandidatoDecision,

    createCampana,

    enviarCampana

} from './atraccionApi.js';

import {

    VacanteBusquedaPanel,

    VacantePublicarPanel,

    VacantePostulacionesPanel,

    VacanteRediscoveryPanel

} from './atraccionVacanteShared.jsx';

import FiltrosReviewPanel from './FiltrosReviewPanel.jsx';

import { formatVacanteCodigo } from './atraccionFormat.js';

import AtraccionCandidatoCard from './AtraccionCandidatoCard.jsx';

import AtraccionCandidatoModal from './AtraccionCandidatoModal.jsx';

import PreentrevistaSeguimiento from './PreentrevistaSeguimiento.jsx';



function TabButton({ active, onClick, icon: Icon, children, count, isLight }) {

    return (

        <button

            type="button"

            onClick={onClick}

            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${

                active

                    ? 'bg-[#2F7BB8] text-white shadow-sm'

                    : isLight

                        ? 'text-slate-600 hover:bg-slate-100'

                        : 'text-slate-300 hover:bg-slate-800'

            }`}

        >

            <Icon size={14} />

            {children}

            {count != null ? (

                <span className={`ml-0.5 rounded-full px-1.5 text-[10px] font-bold ${

                    active ? 'bg-white/25 text-white' : isLight ? 'bg-slate-200 text-slate-700' : 'bg-slate-700 text-slate-200'

                }`}>

                    {count}

                </span>

            ) : null}

        </button>

    );

}



export default function AtraccionVacanteModal({

    vacante,

    token,

    health,

    integraciones,

    onClose,

    onVacanteUpdated,

    onVacanteArchived,

    onDataChanged,

    initialTab = 'detalle'

}) {

    const { isLight } = useModuleTheme();

    const [tab, setTab] = useState(initialTab);

    const [confirmArchive, setConfirmArchive] = useState(false);

    const [archiving, setArchiving] = useState(false);

    const [error, setError] = useState('');



    const [candidatos, setCandidatos] = useState([]);

    const [candLoading, setCandLoading] = useState(false);

    const [candError, setCandError] = useState('');

    const [selected, setSelected] = useState(new Set());

    const [modalCandidato, setModalCandidato] = useState(null);



    const [preentrevistas, setPreentrevistas] = useState([]);

    const [preLoading, setPreLoading] = useState(false);

    const [preError, setPreError] = useState('');



    const [enviando, setEnviando] = useState(false);

    const [okMsg, setOkMsg] = useState('');

    const [urlPostulaciones, setUrlPostulaciones] = useState(vacante?.url_postulaciones_ee || '');

    const [urlLocked, setUrlLocked] = useState(Boolean(vacante?.url_postulaciones_ee));



    const muted = isLight ? 'text-slate-500' : 'text-slate-400';

    const btnGhost = isLight

        ? 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50'

        : 'inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800';

    const btnDanger = 'inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100';

    const btnToolbar = isLight

        ? 'rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40'

        : 'rounded-lg border border-slate-600 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-40';



    const vacanteId = vacante?.id;



    const loadCandidatos = useCallback(async () => {

        if (!vacanteId) return;

        setCandLoading(true);

        setCandError('');

        try {

            const data = await fetchVacanteCandidatos(token, vacanteId);

            setCandidatos(Array.isArray(data.candidatos) ? data.candidatos : []);

        } catch (e) {

            setCandError(e.message || 'No se pudieron cargar los candidatos');

        } finally {

            setCandLoading(false);

        }

    }, [token, vacanteId]);



    const loadPreentrevistas = useCallback(async () => {

        if (!vacanteId) return;

        setPreLoading(true);

        setPreError('');

        try {

            const list = await fetchVacantePreentrevistas(token, vacanteId);

            setPreentrevistas(list);

        } catch (e) {

            setPreError(e.message || 'No se pudo cargar el seguimiento');

        } finally {

            setPreLoading(false);

        }

    }, [token, vacanteId]);



    useEffect(() => {

        setTab(initialTab);

    }, [vacanteId, initialTab]);



    useEffect(() => {

        setUrlPostulaciones(vacante?.url_postulaciones_ee || '');

        setUrlLocked(Boolean(vacante?.url_postulaciones_ee));

    }, [vacanteId, vacante?.url_postulaciones_ee]);



    useEffect(() => {

        loadCandidatos();

        loadPreentrevistas();

    }, [loadCandidatos, loadPreentrevistas]);



    const criteriosVacios = useMemo(() => {

        const c = vacante?.criterios;

        return !c || (typeof c === 'object' && Object.keys(c).length === 0);

    }, [vacante]);



    const candidatosVisibles = useMemo(

        () => candidatos.filter((c) => (c.decision || 'pendiente') !== 'rechazado'),

        [candidatos]

    );



    const selectedAprobados = useMemo(

        () => [...selected].filter((id) => {

            const c = candidatos.find((x) => x.id === id);

            return c && (c.decision || 'pendiente') === 'aprobado';

        }).length,

        [selected, candidatos]

    );



    if (!vacante) return null;



    function applyDecisionLocal(id, decision) {

        setCandidatos((prev) => prev.map((c) => (c.id === id ? { ...c, decision } : c)));

        setModalCandidato((prev) => (prev && prev.id === id ? { ...prev, decision } : prev));

        if (decision === 'aprobado') {

            setSelected((prev) => new Set(prev).add(id));

        } else {

            setSelected((prev) => {

                const next = new Set(prev);

                next.delete(id);

                return next;

            });

        }

    }



    function toggleSelect(id) {

        const c = candidatos.find((x) => x.id === id);

        if (c && (c.decision || 'pendiente') !== 'aprobado') {

            handleDecision(c, 'aprobado');

            return;

        }

        setSelected((prev) => {

            const next = new Set(prev);

            if (next.has(id)) next.delete(id);

            else next.add(id);

            return next;

        });

    }



    async function handleDecision(cand, decision) {

        applyDecisionLocal(cand.id, decision);

        try {

            await setCandidatoDecision(token, cand.id, decision);

        } catch (e) {

            applyDecisionLocal(cand.id, cand.decision || 'pendiente');

            setCandError(e.message || 'No se pudo actualizar la decisión');

        }

    }



    async function bulkDecision(decision) {

        const ids = [...selected];

        if (!ids.length) return;

        setCandError('');

        ids.forEach((id) => applyDecisionLocal(id, decision));

        try {

            await Promise.all(ids.map((id) => setCandidatoDecision(token, id, decision)));

        } catch (e) {

            await loadCandidatos();

            setCandError(e.message || 'No se pudo actualizar la decisión masiva');

        }

    }



    async function selectAllVisible() {

        const ids = candidatosVisibles.map((c) => c.id);

        setSelected(new Set(ids));

        const toApprove = candidatosVisibles.filter((c) => (c.decision || 'pendiente') !== 'aprobado');

        if (!toApprove.length) return;

        toApprove.forEach((c) => applyDecisionLocal(c.id, 'aprobado'));

        try {

            await Promise.all(toApprove.map((c) => setCandidatoDecision(token, c.id, 'aprobado')));

        } catch (e) {

            await loadCandidatos();

            setCandError(e.message || 'No se pudo aprobar todos los candidatos');

        }

    }



    function deselectAll() {

        setSelected(new Set());

    }



    async function onArchive() {

        setError('');

        setArchiving(true);

        try {

            const data = await archiveVacante(token, vacante.id);

            onVacanteArchived?.(data.vacante || { ...vacante, estado: 'archivada' });

            onClose?.();

        } catch (err) {

            setError(err.message || 'No se pudo archivar la vacante');

        } finally {

            setArchiving(false);

        }

    }



    function handlePublishedUrl(url) {

        setUrlPostulaciones(url);

        setUrlLocked(true);

        onVacanteUpdated?.({ ...vacante, url_postulaciones_ee: url });

    }



    async function enviarAPrescreening() {

        setError('');

        setOkMsg('');

        const aprobadosIds = [...selected].filter((id) => {

            const c = candidatos.find((x) => x.id === id);

            return c && (c.decision || 'pendiente') === 'aprobado';

        });

        if (!aprobadosIds.length) {

            setError('Apruebe al menos un candidato antes de enviar a prescreening.');

            return;

        }

        setEnviando(true);

        try {

            const nombre = `Prescreening — ${vacante.titulo || formatVacanteCodigo(vacante.codigo) || 'Vacante'}`.slice(0, 160);

            const campana = await createCampana(token, {

                nombre,

                canal_default: 'auto',

                candidato_ids: aprobadosIds,

                vacante_id: vacante.id

            });

            if (!campana?.id) throw new Error('No se pudo crear el prescreening.');

            await enviarCampana(token, campana.id);

            setSelected(new Set());

            setOkMsg(`${aprobadosIds.length} candidato(s) enviados a prescreening.`);

            await Promise.all([loadPreentrevistas(), loadCandidatos()]);

            onDataChanged?.();

            setTab('seguimiento');

        } catch (e) {

            setError(e.message || 'No se pudo enviar a prescreening');

        } finally {

            setEnviando(false);

        }

    }



    const headerActions = (

        <div className="flex items-center gap-2">

            {!confirmArchive ? (

                <button type="button" className={btnGhost} onClick={() => setConfirmArchive(true)}>

                    <Archive size={14} /> Archivar

                </button>

            ) : (

                <>

                    <button type="button" className={btnDanger} disabled={archiving} onClick={onArchive}>

                        {archiving ? 'Archivando…' : 'Confirmar archivar'}

                    </button>

                    <button type="button" className={btnGhost} disabled={archiving} onClick={() => setConfirmArchive(false)}>

                        Cancelar

                    </button>

                </>

            )}

        </div>

    );



    return (

        <GestionModalShell

            open

            onClose={onClose}

            title={vacante.titulo || 'Vacante sin título'}

            subtitle={`${formatVacanteCodigo(vacante.codigo) ? `${formatVacanteCodigo(vacante.codigo)} · ` : ''}Estado: ${vacante.estado}`}

            size="wide"

            headerActions={headerActions}

        >

            {error ? <p className="mb-2 text-sm text-red-500">{error}</p> : null}

            {okMsg ? <p className="mb-2 text-sm text-emerald-600">{okMsg}</p> : null}



            <div className={`mb-4 flex flex-wrap items-center gap-1.5 border-b pb-3 ${isLight ? 'border-slate-200' : 'border-slate-700'}`}>

                <TabButton active={tab === 'detalle'} onClick={() => setTab('detalle')} icon={Sparkles} isLight={isLight}>

                    Detalle

                </TabButton>

                <TabButton active={tab === 'candidatos'} onClick={() => setTab('candidatos')} icon={Users} count={candidatosVisibles.length} isLight={isLight}>

                    Candidatos

                </TabButton>

                <TabButton active={tab === 'seguimiento'} onClick={() => setTab('seguimiento')} icon={ListChecks} count={preentrevistas.length} isLight={isLight}>

                    Seguimiento

                </TabButton>

            </div>



            {tab === 'detalle' ? (

                <>

                    {vacante.descripcion ? <p className={`text-sm ${muted}`}>{vacante.descripcion}</p> : null}

                    <FiltrosReviewPanel

                        vacante={vacante}

                        token={token}

                        isLight={isLight}

                        updateVacanteCriterios={updateVacanteCriterios}

                        onUpdated={onVacanteUpdated}

                    />

                    <VacantePublicarPanel

                        vacante={vacante}

                        token={token}

                        isLight={isLight}

                        onPublishedUrl={handlePublishedUrl}

                        onVacanteUpdated={onVacanteUpdated}

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

                    <VacanteBusquedaPanel

                        vacante={vacante}

                        token={token}

                        health={health}

                        integraciones={integraciones}

                        isLight={isLight}

                    />

                    <VacanteRediscoveryPanel vacante={vacante} token={token} isLight={isLight} />

                </>

            ) : null}



            {tab === 'candidatos' ? (

                <div>

                    {criteriosVacios ? (

                        <p className={`mb-3 rounded-lg border px-3 py-2 text-xs ${

                            isLight ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-amber-500/40 bg-amber-500/10 text-amber-300'

                        }`}>

                            Esta vacante no tiene criterios definidos. Complete los filtros en Detalle para que el agente pueda evaluar el match.

                        </p>

                    ) : null}

                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">

                        <div className="flex flex-wrap items-center gap-1.5">

                            <button type="button" className={btnToolbar} onClick={selectAllVisible} disabled={!candidatosVisibles.length}>

                                Seleccionar todos visibles

                            </button>

                            <button type="button" className={btnToolbar} onClick={deselectAll} disabled={selected.size === 0}>

                                Deseleccionar

                            </button>

                            <button type="button" className={btnToolbar} onClick={() => bulkDecision('aprobado')} disabled={selected.size === 0}>

                                Aprobar seleccionados

                            </button>

                            <button type="button" className={btnToolbar} onClick={() => bulkDecision('rechazado')} disabled={selected.size === 0}>

                                Rechazar seleccionados

                            </button>

                        </div>

                        <button

                            type="button"

                            disabled={selectedAprobados === 0 || enviando}

                            onClick={enviarAPrescreening}

                            className={isLight

                                ? 'inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-40'

                                : 'inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-40'}

                        >

                            <Send size={14} /> {enviando ? 'Enviando…' : `Enviar ${selectedAprobados} aprobado(s) a prescreening`}

                        </button>

                    </div>

                    {candError ? <p className="mb-2 text-sm text-red-500">{candError}</p> : null}

                    {candLoading ? (

                        <p className={`text-sm ${muted}`}>Cargando candidatos…</p>

                    ) : candidatosVisibles.length === 0 ? (

                        <p className={`text-sm ${muted}`}>

                            Aún no hay candidatos para esta vacante. Inicia una búsqueda desde Detalle.

                        </p>

                    ) : (

                        <ul className="space-y-2">

                            {candidatosVisibles.map((c) => (

                                <AtraccionCandidatoCard

                                    key={c.id}

                                    c={c}

                                    isLight={isLight}

                                    onOpen={setModalCandidato}

                                    onDecision={handleDecision}

                                    selectable

                                    selected={selected.has(c.id)}

                                    onToggleSelect={toggleSelect}

                                />

                            ))}

                        </ul>

                    )}

                </div>

            ) : null}



            {tab === 'seguimiento' ? (

                <PreentrevistaSeguimiento

                    preentrevistas={preentrevistas}

                    isLight={isLight}

                    loading={preLoading}

                    error={preError}

                />

            ) : null}



            {modalCandidato ? (

                <AtraccionCandidatoModal

                    candidato={modalCandidato}

                    token={token}

                    onClose={() => setModalCandidato(null)}

                    onDecision={handleDecision}

                    onEnriched={(updated) => {

                        setModalCandidato(updated);

                        setCandidatos((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));

                    }}

                />

            ) : null}

        </GestionModalShell>

    );

}

