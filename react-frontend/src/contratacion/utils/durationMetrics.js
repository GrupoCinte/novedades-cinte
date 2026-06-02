import { normalizeStatus } from '../hooks/useMonitorData';
import { TERMINAL_STATUSES_SET } from '../constants/trazabilidad.js';

export function parseTs(value) {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : null;
}

export function formatDuration(ms) {
    const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
    const totalSeconds = Math.floor(safeMs / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function durationToParts(ms) {
    const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
    const totalSeconds = Math.floor(safeMs / 1000);
    return {
        h: Math.floor(totalSeconds / 3600),
        m: Math.floor((totalSeconds % 3600) / 60),
        s: totalSeconds % 60
    };
}

export function resolveFlowProcessingMs(execution, nowTs) {
    const fd = execution?.fullData || {};
    const status = normalizeStatus(fd.status || execution?.realStatus);
    const isTerminal = TERMINAL_STATUSES_SET.has(status);
    const start =
        parseTs(fd.ts_documentos_recibidos) ??
        parseTs(fd.ts_analisis_ia_completado) ??
        parseTs(fd.ts_primer_contacto_candidato) ??
        parseTs(execution?.timestamp) ??
        nowTs;
    const end = isTerminal ? (parseTs(fd.ts_validacion_completada) ?? nowTs) : nowTs;
    const waitStart = parseTs(fd.ts_primer_contacto_candidato) ?? parseTs(fd.ts_analisis_ia_completado);
    const waitEnd = end;

    const totalMs = Math.max(0, end - start);
    let waitOverlapMs = 0;
    if (waitStart && waitEnd > waitStart) {
        const overlapStart = Math.max(start, waitStart);
        const overlapEnd = Math.min(end, waitEnd);
        waitOverlapMs = Math.max(0, overlapEnd - overlapStart);
    }
    return Math.max(0, totalMs - waitOverlapMs);
}

export function resolveCandidateWaitMs(execution, nowTs) {
    const fd = execution?.fullData || {};
    const status = normalizeStatus(fd.status || execution?.realStatus);
    const isTerminal = TERMINAL_STATUSES_SET.has(status);
    const start =
        parseTs(fd.ts_primer_contacto_candidato) ??
        parseTs(fd.ts_analisis_ia_completado) ??
        parseTs(fd.ts_documentos_recibidos) ??
        parseTs(execution?.timestamp) ??
        nowTs;
    const end = isTerminal ? (parseTs(fd.ts_validacion_completada) ?? nowTs) : nowTs;
    return Math.max(0, end - start);
}

export function resolveFlowProcessingTime(execution, nowTs) {
    return formatDuration(resolveFlowProcessingMs(execution, nowTs));
}

export function resolveCandidateWaitTime(execution, nowTs) {
    return formatDuration(resolveCandidateWaitMs(execution, nowTs));
}
