import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { fetchJob } from './atraccionApi.js';
import {
    clearTrackedJobMeta,
    countCandidatosFromProgress,
    isJobActive,
    isJobStale,
    JOB_TERMINAL,
    readTrackedJobMeta,
    writeTrackedJobMeta
} from './atraccionJobStorage.js';

const POLL_MS = 8000;
const POLL_MS_SLOW = 20000;

// Una sola instancia aunque Vite/HMR cargue el módulo por rutas distintas (@fs vs /src).
const AtraccionJobContext =
    (typeof globalThis !== 'undefined' && globalThis.__CINTE_ATRACCION_JOB_CTX__)
    || createContext(null);
if (typeof globalThis !== 'undefined') {
    globalThis.__CINTE_ATRACCION_JOB_CTX__ = AtraccionJobContext;
}

export function AtraccionJobProvider({ token, children }) {
    const [job, setJob] = useState(null);
    const [candidatos, setCandidatos] = useState([]);
    const [vacanteTitulo, setVacanteTitulo] = useState('');
    const [lastPolledAt, setLastPolledAt] = useState(null);
    const [pollError, setPollError] = useState('');
    const [meta, setMeta] = useState(null);
    const [isPolling, setIsPolling] = useState(false);
    const jobIdRef = useRef(null);
    const metaRef = useRef(null);
    const inFlightRef = useRef(false);

    const refreshJob = useCallback(async (jobId) => {
        if (!jobId || inFlightRef.current) return null;
        inFlightRef.current = true;
        try {
            const data = await fetchJob(token, jobId);
            const nextJob = data?.job || null;
            const nextCandidatos = Array.isArray(data?.candidatos) ? data.candidatos : [];
            setJob(nextJob);
            setCandidatos(nextCandidatos);
            setLastPolledAt(Date.now());
            setPollError('');
            if (nextJob && JOB_TERMINAL.has(nextJob.estado)) {
                clearTrackedJobMeta();
                metaRef.current = null;
                setMeta(null);
                if (nextJob.estado === 'fallido' && nextJob.error_mensaje) {
                    setPollError(nextJob.error_mensaje);
                }
            } else if (nextJob && isJobStale(nextJob, metaRef.current || readTrackedJobMeta())) {
                setPollError(
                    'Esta búsqueda quedó atascada (sin progreso del worker). Inicie una búsqueda nueva.'
                );
            }
            return { job: nextJob, candidatos: nextCandidatos };
        } finally {
            inFlightRef.current = false;
        }
    }, [token]);

    const trackJob = useCallback((nextJob, nextMeta = {}) => {
        if (!nextJob?.id) return;
        jobIdRef.current = nextJob.id;
        setJob(nextJob);
        setCandidatos([]);
        setVacanteTitulo(nextMeta.vacanteTitulo || '');
        setPollError('');
        const stored = {
            jobId: nextJob.id,
            vacanteId: nextMeta.vacanteId || nextJob.vacante_id,
            vacanteTitulo: nextMeta.vacanteTitulo || '',
            startedAt: Date.now()
        };
        metaRef.current = stored;
        setMeta(stored);
        writeTrackedJobMeta(stored);
    }, []);

    const dismissJob = useCallback(() => {
        jobIdRef.current = null;
        metaRef.current = null;
        setJob(null);
        setCandidatos([]);
        setVacanteTitulo('');
        setPollError('');
        clearTrackedJobMeta();
        setMeta(null);
    }, []);

    useEffect(() => {
        const stored = readTrackedJobMeta();
        if (!stored?.jobId) return;
        jobIdRef.current = stored.jobId;
        metaRef.current = stored;
        setMeta(stored);
        setVacanteTitulo(stored.vacanteTitulo || '');
        refreshJob(stored.jobId).catch((e) => {
            setPollError(e.message || 'No se pudo recuperar la búsqueda activa');
        });
    }, [refreshJob]);

    useEffect(() => {
        const jobId = job?.id || jobIdRef.current;
        if (!jobId || !isJobActive(job?.estado)) {
            setIsPolling(false);
            return undefined;
        }

        setIsPolling(true);
        let cancelled = false;
        let timeoutId;
        let delayMs = POLL_MS;
        let firstTick = true;

        const schedule = () => {
            const waitMs = firstTick ? 0 : delayMs;
            firstTick = false;
            timeoutId = setTimeout(async () => {
                if (cancelled) return;
                try {
                    const result = await refreshJob(jobId);
                    if (cancelled) return;
                    if (result?.job && !isJobActive(result.job.estado)) {
                        setIsPolling(false);
                        return;
                    }
                    delayMs = POLL_MS;
                    schedule();
                } catch (e) {
                    if (cancelled) return;
                    const msg = e.message || 'Error al consultar progreso';
                    setPollError(msg);
                    delayMs = /demasiadas|429|rate limit/i.test(msg) ? POLL_MS_SLOW : POLL_MS;
                    schedule();
                }
            }, waitMs);
        };

        schedule();

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
            setIsPolling(false);
        };
    }, [job?.id, job?.estado, refreshJob]);

    const candidatosCount = candidatos.length || countCandidatosFromProgress(job?.progreso);
    const isLive = Boolean(job && isJobActive(job.estado));

    const value = useMemo(() => ({
        job,
        candidatos,
        candidatosCount,
        vacanteTitulo,
        lastPolledAt,
        pollError,
        isPolling,
        isLive,
        trackJob,
        dismissJob,
        refreshJob
    }), [
        job,
        candidatos,
        candidatosCount,
        vacanteTitulo,
        lastPolledAt,
        pollError,
        isPolling,
        isLive,
        trackJob,
        dismissJob,
        refreshJob
    ]);

    return (
        <AtraccionJobContext.Provider value={value}>
            {children}
        </AtraccionJobContext.Provider>
    );
}

const ATRACCION_JOB_FALLBACK = {
    job: null,
    candidatos: [],
    candidatosCount: 0,
    vacanteTitulo: '',
    lastPolledAt: null,
    pollError: '',
    isPolling: false,
    isLive: false,
    trackJob: () => {},
    dismissJob: () => {},
    refreshJob: async () => null
};

export function useAtraccionJob() {
    const ctx = useContext(AtraccionJobContext);
    // Fallback: evita pantalla blanca si HMR/Vite duplica el módulo del contexto.
    if (!ctx) return ATRACCION_JOB_FALLBACK;
    return ctx;
}
