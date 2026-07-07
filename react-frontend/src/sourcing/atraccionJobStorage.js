const STORAGE_KEY = 'atraccion.activeJob.v1';

export function readTrackedJobMeta() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data?.jobId) return null;
        return data;
    } catch {
        return null;
    }
}

export function writeTrackedJobMeta(meta) {
    try {
        if (!meta?.jobId) {
            sessionStorage.removeItem(STORAGE_KEY);
            return;
        }
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(meta));
    } catch {
        /* ignore quota / private mode */
    }
}

export function clearTrackedJobMeta() {
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        /* ignore */
    }
}

export const JOB_TERMINAL = new Set(['completado', 'parcial', 'fallido', 'cancelado']);

export function isJobActive(estado) {
    return estado === 'pendiente' || estado === 'en_progreso';
}

export function resolveProgressEstado(rawEstado, jobEstado) {
    const e = String(rawEstado || '').trim();
    if (isJobActive(jobEstado)) return e || 'pendiente';
    if (!e || e === 'en_progreso' || e === 'pendiente') {
        if (jobEstado === 'fallido') return 'fallido';
        return 'completado';
    }
    return e;
}

/** Jobs creados antes del fix CSRF o sin callbacks quedan en en_progreso sin progreso. */
export function isJobStale(job, meta) {
    if (!job || !isJobActive(job.estado)) return false;
    const progreso = job.progreso && typeof job.progreso === 'object' ? job.progreso : {};
    const fuenteKeys = Object.keys(progreso).filter((k) => k !== 'fases');
    const faseKeys = progreso.fases && typeof progreso.fases === 'object'
        ? Object.keys(progreso.fases)
        : [];
    const hasProgress = fuenteKeys.length > 0 || faseKeys.length > 0;
    const created = meta?.startedAt || (job.created_at ? new Date(job.created_at).getTime() : 0);
    const updated = job.updated_at ? new Date(job.updated_at).getTime() : created;
    if (!hasProgress) {
        if (!created) return false;
        return Date.now() - created > 90 * 1000;
    }
    if (!updated) return false;
    return Date.now() - updated > 5 * 60 * 1000;
}

export const FUENTE_LABELS = {
    elempleo: 'El Empleo',
    linkedin: 'LinkedIn',
    xray: 'X-Ray'
};

export const PIPELINE_FASES = ['descubrimiento', 'extraccion', 'enriquecimiento'];

export const FASE_LABELS = {
    descubrimiento: 'Descubrimiento',
    extraccion: 'Extracción',
    enriquecimiento: 'Enriquecimiento',
    scoring: 'Scoring IA'
};

export function countCandidatosFromProgress(progreso) {
    if (!progreso || typeof progreso !== 'object') return 0;
    const fases = progreso.fases;
    if (fases && typeof fases === 'object') {
        const desc = fases.descubrimiento;
        if (desc && typeof desc.count === 'number' && desc.count > 0) return desc.count;
        const enrich = fases.enriquecimiento;
        if (enrich && typeof enrich.count === 'number' && enrich.count > 0) return enrich.count;
    }
    return Object.entries(progreso).reduce((sum, [key, p]) => {
        if (key === 'fases') return sum;
        const n = p && typeof p.count === 'number' ? p.count : 0;
        return sum + n;
    }, 0);
}
