import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import axios from 'axios';
const API_PREFIX = '/api/contratacion';
const WS_PATH = '/api/contratacion/ws';

function axiosErrorMessage(err) {
    const d = err?.response?.data;
    if (d && typeof d === 'object') {
        return d.message || d.error || d.msg || err.message;
    }
    return err?.message || 'Error de red';
}

function authHeaders(token) {
    const t = String(token || '').trim();
    if (!t) return {};
    return { Authorization: `Bearer ${t}` };
}

/** Sesión HttpOnly: el backend acepta cookie `cinteSession` además de Bearer. */
const AXIOS_CRED = { withCredentials: true };

/** Umbral único: alerta si el proceso activo lleva más de esto desde el inicio (ts_documentos_recibidos). */
const SLA_ALERT_MS = 8 * 60 * 60 * 1000;

function getProcessStartMs(execution) {
    const raw = execution?.fullData?.ts_documentos_recibidos;
    if (!raw) return null;
    const ms = new Date(raw).getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : null;
}

export function normalizeStatus(status) {
    return String(status || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

export const TRAZABILIDAD_STAGE_ORDER = [
    'cargando',
    'contactado',
    'whatsapp enviado',
    'documentos recibidos',
    'sagrilaft enviado',
    'finalizado'
];

export function statusIdToStageKey(statusId) {
    if (statusId === 1) return 'cargando';
    if (statusId === 2) return 'contactado';
    if (statusId === 3) return 'whatsapp enviado';
    if (statusId === 4) return 'documentos recibidos';
    if (statusId === 5) return 'sagrilaft enviado';
    if (statusId === 6) return 'finalizado';
    return null;
}

export function getTrazabilidadStageKey(status, statusId = null) {
    const byId = statusIdToStageKey(statusId);
    if (byId) return byId;

    const s = normalizeStatus(status);

    if (s.includes('cargando')) return 'cargando';
    if (s.includes('contactad') || s.includes('comunicacion')) return 'contactado';
    if (s.includes('whatsapp') && s.includes('enviado')) return 'whatsapp enviado';
    if (s.includes('documentos') && s.includes('recib')) return 'documentos recibidos';
    if (s.includes('sagrilaft')) return 'sagrilaft enviado';
    if (
        s.includes('finalizado') ||
        (s.includes('contrato') && s.includes('pendiente') && s.includes('confirm')) ||
        s.includes('contrato recibido') ||
        s.includes('completado') ||
        s.includes('rechazado') ||
        s.includes('eliminad')
    ) {
        return 'finalizado';
    }
    return 'cargando';
}

/** Activo = no etapa final; usa la misma semántica que la trazabilidad (incl. statusId desde Dynamo). */
function isActiveStatus(status, statusId = null) {
    return getTrazabilidadStageKey(status, statusId) !== 'finalizado';
}

/**
 * @param {object|null} auth Objeto de sesión desde `/api/me` (p. ej. `{ user, token? }`). Con CRIT-002 suele no haber `token` en memoria: la cookie HttpOnly autentica las peticiones.
 */
export default function useMonitorData(auth) {
    const [executions, setExecutions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [slaTick, setSlaTick] = useState(0);
    const [kpiConfig, setKpiConfig] = useState({
        humanProcessTimeMinutes: 783.5,
        humanHourCostCop: 20000,
        autoCostUsd: 0.45,
        trmCop: 4200
    });
    /** null = sin comprobar; indica si DYNAMODB_TABLE_NAME está definida en el servidor. */
    const [dynamoConfigured, setDynamoConfigured] = useState(null);
    const wsRef = useRef(null);
    const tokenRef = useRef(auth?.token || '');
    tokenRef.current = auth?.token || '';
    const sessionUserId = String(auth?.user?.email || auth?.user?.sub || auth?.user?.id || '').trim();
    const bearerToken = String(auth?.token || '').trim();

    useEffect(() => {
        const id = setInterval(() => setSlaTick((n) => n + 1), 60000);
        return () => clearInterval(id);
    }, []);

    const fetchExecutions = useCallback(async () => {
        try {
            const response = await axios.get(`${API_PREFIX}/monitor`, {
                ...AXIOS_CRED,
                headers: authHeaders(tokenRef.current)
            });
            const data = response.data;
            if (data?.success) {
                setExecutions(Array.isArray(data.executions) ? data.executions : []);
                setLastUpdate(new Date());
                setError(null);
            } else {
                setError(data?.message || 'No se pudo cargar el monitor');
            }
            setLoading(false);
        } catch (err) {
            if (import.meta.env.DEV) {
                console.error('Contratación monitor:', err);
            }
            setError(axiosErrorMessage(err));
            setLoading(false);
        }
    }, []);

    const fetchMonitorConfig = useCallback(async () => {
        try {
            const response = await axios.get(`${API_PREFIX}/monitor-config`, {
                ...AXIOS_CRED,
                headers: authHeaders(tokenRef.current)
            });
            const d = response?.data;
            if (d && typeof d.dynamoConfigured === 'boolean') {
                setDynamoConfigured(d.dynamoConfigured);
            }
            const maybe = d?.kpi;
            if (!maybe || typeof maybe !== 'object') return;
            setKpiConfig((prev) => ({
                humanProcessTimeMinutes: Number.isFinite(Number(maybe.humanProcessTimeMinutes))
                    ? Number(maybe.humanProcessTimeMinutes)
                    : prev.humanProcessTimeMinutes,
                humanHourCostCop: Number.isFinite(Number(maybe.humanHourCostCop))
                    ? Number(maybe.humanHourCostCop)
                    : prev.humanHourCostCop,
                autoCostUsd: Number.isFinite(Number(maybe.autoCostUsd)) ? Number(maybe.autoCostUsd) : prev.autoCostUsd,
                trmCop: Number.isFinite(Number(maybe.trmCop)) ? Number(maybe.trmCop) : prev.trmCop
            }));
        } catch {
            // defaults
        }
    }, []);

    useEffect(() => {
        if (!sessionUserId) {
            setLoading(false);
            setExecutions([]);
            setError(null);
            return undefined;
        }

        fetchExecutions();
        fetchMonitorConfig();

        const connectWebSocket = async () => {
            let ticket = '';
            try {
                const r = await axios.get(`${API_PREFIX}/ws-token`, {
                    ...AXIOS_CRED,
                    headers: authHeaders(tokenRef.current)
                });
                ticket = r.data?.ticket ? String(r.data.ticket) : '';
            } catch {
                setIsConnected(false);
                return;
            }

            if (!ticket) {
                setIsConnected(false);
                return;
            }

            const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host;
            const wsUrl = `${proto}//${host}${WS_PATH}?ticket=${encodeURIComponent(ticket)}`;
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                setIsConnected(true);
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    const { type, data } = message;
                    if (type === 'AUTH_OK') return;

                    setExecutions((prev) => {
                        let next = [...prev];
                        if (type === 'DELETE' || type === 'REMOVE') {
                            next = next.filter((ex) => ex.executionId !== data.executionId);
                        } else {
                            const index = next.findIndex((ex) => ex.executionId === data.executionId);
                            if (index > -1) next[index] = data;
                            else next.unshift(data);
                        }
                        return next;
                    });

                    setLastUpdate(new Date());
                } catch (e) {
                    if (import.meta.env.DEV) {
                        console.error('WS contratación:', e);
                    }
                }
            };

            ws.onclose = () => {
                setIsConnected(false);
                setTimeout(() => {
                    if (wsRef.current?.readyState === WebSocket.CLOSED && sessionUserId) {
                        connectWebSocket();
                    }
                }, 3000);
            };

            ws.onerror = () => {
                setIsConnected(false);
            };
        };

        connectWebSocket();

        return () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [sessionUserId, bearerToken, fetchExecutions, fetchMonitorConfig]);

    const activeExecutions = useMemo(
        () => executions.filter((e) => isActiveStatus(e.realStatus, e.statusId)),
        [executions]
    );

    const historyExecutions = useMemo(
        () => executions.filter((e) => !isActiveStatus(e.realStatus, e.statusId)),
        [executions]
    );

    const metrics = useMemo(() => {
        const total = executions.length;
        const active = activeExecutions.length;
        const history = historyExecutions.length;
        const contacted = executions.filter((e) => getTrazabilidadStageKey(e.realStatus, e.statusId) === 'contactado').length;

        const finalized = executions.filter((e) => getTrazabilidadStageKey(e.realStatus, e.statusId) === 'finalizado').length;
        const conversionRate = total > 0 ? Math.round(((contacted + finalized) / total) * 100) : 0;

        const now = Date.now();
        const slaAlerts = activeExecutions.filter((e) => {
            const startMs = getProcessStartMs(e);
            if (startMs == null) return false;
            return now - startMs > SLA_ALERT_MS;
        }).length;

        const HUMAN_PROCESS_TIME_MS = kpiConfig.humanProcessTimeMinutes * 60 * 1000;
        const HUMAN_HOUR_COST_COP = kpiConfig.humanHourCostCop;
        const AUTO_COST_USD = kpiConfig.autoCostUsd;
        const TRM = kpiConfig.trmCop;

        let totalAutoTimeMs = 0;
        let totalWaitTimeMs = 0;
        let totalHumanTimeSavedMs = 0;
        let countWithAutoTime = 0;
        let countWithWaitTime = 0;

        executions.forEach((e) => {
            const fd = e.fullData || {};
            const tsStart = fd.ts_documentos_recibidos;
            const tsIaDone = fd.ts_analisis_ia_completado;
            const tsEnd = fd.ts_validacion_completada;

            if (tsStart && tsIaDone) {
                const start = new Date(tsStart).getTime();
                const iaDone = new Date(tsIaDone).getTime();
                const autoDiff = iaDone - start;
                if (autoDiff > 0) {
                    totalAutoTimeMs += autoDiff;
                    countWithAutoTime += 1;
                }
            }

            if (tsIaDone && tsEnd) {
                const iaDone = new Date(tsIaDone).getTime();
                const end = new Date(tsEnd).getTime();
                const waitDiff = end - iaDone;
                if (waitDiff > 0) {
                    totalWaitTimeMs += waitDiff;
                    countWithWaitTime += 1;
                }
            }

            if (tsStart && tsEnd) {
                const start = new Date(tsStart).getTime();
                const end = new Date(tsEnd).getTime();
                const fullDiff = end - start;
                if (fullDiff > 0) {
                    totalHumanTimeSavedMs += HUMAN_PROCESS_TIME_MS - fullDiff;
                }
            }
        });

        const formatDuration = (ms) => {
            const totalSeconds = Math.floor(ms / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            if (hours > 0) return `${hours}h ${minutes}m`;
            if (minutes > 0) return `${minutes}m ${seconds}s`;
            return `${seconds}s`;
        };

        let averageTime = 'N/A';
        if (countWithAutoTime > 0) {
            averageTime = formatDuration(totalAutoTimeMs / countWithAutoTime);
        }

        let avgWaitTime = 'N/A';
        if (countWithWaitTime > 0) {
            avgWaitTime = formatDuration(totalWaitTimeMs / countWithWaitTime);
        }

        let humanTimeSaved = 'N/A';
        let efficiencyPercent = 0;
        const countWithFullTime = executions.filter(
            (e) => e.fullData?.ts_documentos_recibidos && e.fullData?.ts_validacion_completada
        ).length;

        if (countWithFullTime > 0) {
            const savedHours = Math.floor(totalHumanTimeSavedMs / (1000 * 60 * 60));
            const savedMinutes = Math.floor((totalHumanTimeSavedMs % (1000 * 60 * 60)) / (1000 * 60));
            humanTimeSaved = savedHours > 0 ? `${savedHours}h ${savedMinutes}m` : `${savedMinutes}m`;

            if (countWithAutoTime > 0) {
                const avgAutoMs = totalAutoTimeMs / countWithAutoTime;
                efficiencyPercent = Math.round(((HUMAN_PROCESS_TIME_MS - avgAutoMs) / HUMAN_PROCESS_TIME_MS) * 100);
            }
        }

        let costSaved = 'N/A';
        let costSavedSubtext = '';
        let autoCost = 'N/A';
        let autoCostSubtext = '';

        if (countWithFullTime > 0) {
            const humanHours = HUMAN_PROCESS_TIME_MS / (1000 * 60 * 60);
            const humanCostPerCandidate = humanHours * HUMAN_HOUR_COST_COP;
            const autoCostPerCandidateCOP = AUTO_COST_USD * TRM;
            const totalHumanCost = humanCostPerCandidate * countWithFullTime;
            const totalAutoCostCOP = autoCostPerCandidateCOP * countWithFullTime;
            const totalSavedCOP = totalHumanCost - totalAutoCostCOP;

            if (totalSavedCOP >= 1000000) {
                costSaved = `$${(totalSavedCOP / 1000000).toFixed(2)}M`;
            } else if (totalSavedCOP >= 1000) {
                costSaved = `$${new Intl.NumberFormat('es-CO').format(Math.round(totalSavedCOP))}`;
            } else {
                costSaved = `$${Math.round(totalSavedCOP)}`;
            }
            costSavedSubtext = `vs $${new Intl.NumberFormat('es-CO').format(Math.round(totalHumanCost))} manual`;

            if (totalAutoCostCOP >= 1000000) {
                autoCost = `$${(totalAutoCostCOP / 1000000).toFixed(2)}M`;
            } else if (totalAutoCostCOP >= 1000) {
                autoCost = `$${new Intl.NumberFormat('es-CO').format(Math.round(totalAutoCostCOP))}`;
            } else {
                autoCost = `$${Math.round(totalAutoCostCOP)}`;
            }
            autoCostSubtext = `$${new Intl.NumberFormat('es-CO').format(Math.round(autoCostPerCandidateCOP))}/ejec · ${countWithFullTime} procesados`;
        }

        const statusCounts = {};
        executions.forEach((e) => {
            const s = e.realStatus || 'Sin Estado';
            statusCounts[s] = (statusCounts[s] || 0) + 1;
        });

        const positionCounts = {};
        executions.forEach((e) => {
            const p = e.puesto || 'Sin Puesto';
            positionCounts[p] = (positionCounts[p] || 0) + 1;
        });

        const processTimes = [];
        executions.forEach((e) => {
            const fd = e.fullData || {};
            if (fd.ts_documentos_recibidos && fd.ts_validacion_completada) {
                const start = new Date(fd.ts_documentos_recibidos).getTime();
                const end = new Date(fd.ts_validacion_completada).getTime();
                const diffMin = (end - start) / (1000 * 60);
                if (diffMin > 0) {
                    processTimes.push({
                        name: e.workflowName || 'N/A',
                        minutes: Math.round(diffMin)
                    });
                }
            }
        });

        return {
            total,
            active,
            history,
            contacted,
            finalized,
            conversionRate,
            slaAlerts,
            averageTime,
            avgWaitTime,
            humanTimeSaved,
            efficiencyPercent,
            countWithTime: countWithFullTime,
            costSaved,
            costSavedSubtext,
            autoCost,
            autoCostSubtext,
            statusCounts,
            positionCounts,
            processTimes
        };
    }, [executions, activeExecutions, historyExecutions, slaTick, kpiConfig]);

    return {
        executions,
        activeExecutions,
        historyExecutions,
        loading,
        error,
        lastUpdate,
        isConnected,
        metrics,
        refetch: fetchExecutions,
        dynamoConfigured
    };
}

export function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

export function calculateProcessTime(start, end) {
    if (!start || !end) return null;
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const diff = endTime - startTime;
    if (diff < 0) return null;
    const seconds = Math.floor(diff / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
