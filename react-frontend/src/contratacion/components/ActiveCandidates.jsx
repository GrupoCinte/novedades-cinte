import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import CandidateModal from './CandidateModal';
import ModuleFiltersToolbar from '../../shared/filters/ModuleFiltersToolbar.jsx';
import ModuleFiltersDrawer from '../../shared/filters/ModuleFiltersDrawer.jsx';
import { buildGestionTableDash, gestionTableHeadRowCls, gestionTableHeadCellCls } from '../../gestionTableDashTheme.js';
import { normalizeStatus, getTrazabilidadStageKey, TRAZABILIDAD_STAGE_ORDER } from '../hooks/useMonitorData';
import { statusTone } from '../contratacionStatusBadges.js';
import { TERMINAL_STATUSES_SET } from '../constants/trazabilidad.js';
import { useModuleTheme } from '../../moduleTheme.js';
import { nativeCalendarOnlyInputProps } from '../../nativeCalendarOnlyInputProps.js';
import { buildCsrfHeaders } from '../../cognitoAuth.js';

/** Texto para búsqueda sin serializar todo fullData (mejor rendimiento y menos superficie). */
function buildSearchHaystack(ex) {
    const parts = [];
    const push = (v) => {
        if (v == null || v === '') return;
        parts.push(String(v));
    };
    push(ex.workflowName);
    push(ex.executionId);
    push(ex.email);
    push(ex.puesto);
    push(ex.realStatus);
    const fd = ex.fullData || {};
    push(fd.email);
    push(fd.puesto);
    push(fd['nombre y apellido']);
    push(fd.nombre_y_apellido);
    push(fd.nombre);
    push(fd.apellido);
    push(fd.status);
    push(fd.statuses);
    push(fd.whatsapp_numerico);
    push(fd.whatsapp);
    push(fd.telefono);
    push(fd.celular);
    push(fd.documentos);
    for (const v of Object.values(fd)) {
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            push(v);
        }
    }
    return parts.join(' ').toLowerCase();
}

/** Fecha de ingreso al flujo (más reciente = último en llegar). */
function resolveIngresoMs(ex) {
    const raw =
        ex.fullData?.ts_primer_contacto_candidato ||
        ex.fullData?.ts_documentos_recibidos ||
        ex.timestamp ||
        0;
    const ms = new Date(raw).getTime();
    return Number.isFinite(ms) ? ms : 0;
}

function resolveIngresoRaw(ex) {
    return (
        ex.fullData?.ts_primer_contacto_candidato ||
        ex.fullData?.ts_documentos_recibidos ||
        ex.timestamp ||
        null
    );
}

export function TaskProgressCompact({ completedStages, maxStages, isLight }) {
    const steps = Array.from({ length: maxStages }, (_, i) => i + 1);
    return (
        <div className="flex items-center gap-1">
            {steps.map((step) => {
                const done = step <= completedStages;
                const current = step === completedStages + 1;
                return (
                    <div key={step} className="flex items-center">
                        <div
                            className={`
                                relative flex h-5 w-5 shrink-0 items-center justify-center
                                rounded-full border text-[9px] font-bold transition-all duration-300
                                ${done
                                    ? isLight
                                        ? 'border-blue-500 bg-blue-500 text-white shadow-[0_0_6px_rgba(59,130,246,0.5)]'
                                        : 'border-blue-400 bg-blue-500/80 text-white shadow-[0_0_6px_rgba(59,130,246,0.4)]'
                                    : current
                                        ? isLight
                                            ? 'border-blue-400 bg-blue-50 text-blue-600 animate-pulse'
                                            : 'border-blue-400/60 bg-blue-500/10 text-blue-400 animate-pulse'
                                        : isLight
                                            ? 'border-slate-300 bg-white text-slate-400'
                                            : 'border-slate-700 bg-transparent text-slate-600'
                                }
                            `}
                        >
                            {done ? (
                                <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="currentColor">
                                    <path d="M8.5 2.5L4 7 1.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                                </svg>
                            ) : (
                                step
                            )}
                        </div>
                        {step < maxStages && (
                            <div
                                className={`h-px w-3 transition-all duration-300 ${
                                    done
                                        ? isLight ? 'bg-blue-400' : 'bg-blue-500/60'
                                        : isLight ? 'bg-slate-200' : 'bg-slate-700/50'
                                }`}
                            />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

function parseTs(value) {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms) && ms > 0 ? ms : null;
}

function formatDuration(ms) {
    const safeMs = Number.isFinite(ms) && ms > 0 ? ms : 0;
    const totalSeconds = Math.floor(safeMs / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function resolveFlowProcessingTime(execution, nowTs) {
    const fd = execution.fullData || {};
    const status = normalizeStatus(fd.status || execution.realStatus);
    const isTerminal = TERMINAL_STATUSES_SET.has(status);
    const start =
        parseTs(fd.ts_documentos_recibidos) ??
        parseTs(fd.ts_analisis_ia_completado) ??
        parseTs(fd.ts_primer_contacto_candidato) ??
        parseTs(execution.timestamp) ??
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
    return formatDuration(Math.max(0, totalMs - waitOverlapMs));
}

function resolveCandidateWaitTime(execution, nowTs) {
    const fd = execution.fullData || {};
    const status = normalizeStatus(fd.status || execution.realStatus);
    const isTerminal = TERMINAL_STATUSES_SET.has(status);
    const start =
        parseTs(fd.ts_primer_contacto_candidato) ??
        parseTs(fd.ts_analisis_ia_completado) ??
        parseTs(fd.ts_documentos_recibidos) ??
        parseTs(execution.timestamp) ??
        nowTs;
    const end = isTerminal ? (parseTs(fd.ts_validacion_completada) ?? nowTs) : nowTs;
    return formatDuration(Math.max(0, end - start));
}

function taskProgress(status, statusId = null) {
    const stageKey = getTrazabilidadStageKey(status, statusId);
    const idx = TRAZABILIDAD_STAGE_ORDER.indexOf(stageKey);
    return idx >= 0 ? idx : 0;
}

function WhatsAppGlyph({ className }) {
    return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
    );
}

/** Dígitos para https://wa.me/ — alinea con Dynamo (p. ej. whatsapp_numerico). */
function resolveWhatsAppDigits(ex) {
    const candidates = [
        ex.fullData?.whatsapp_numerico,
        ex.fullData?.whatsapp,
        ex.fullData?.telefono,
        ex.fullData?.celular,
        ex.fullData?.phone,
    ];
    for (const raw of candidates) {
        if (raw == null || raw === '') continue;
        const d = String(raw).replace(/\D/g, '');
        if (d.length >= 10 && d.length <= 15) return d;
    }
    const id = ex.executionId;
    if (id != null) {
        const d = String(id).replace(/\D/g, '');
        if (d.length >= 10 && d.length <= 15) return d;
    }
    return null;
}

function EliminarCandidatoOverlay({ candidate, obs, setObs, errorMsg, submitting, onClose, onConfirm }) {
    if (!candidate) return null;
    return (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4">
            <div
                role="presentation"
                className="modal-glass-scrim absolute inset-0 transition-opacity"
                onClick={submitting ? undefined : onClose}
            />
            <div className="modal-glass-sheet relative w-full max-w-md rounded-2xl border border-[var(--border)] p-6 shadow-2xl font-body">
                <h3 className="text-lg font-semibold text-[var(--text)] font-heading">Eliminar candidato del flujo activo</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                    El candidato pasará a <span className="font-semibold text-[var(--text)]">Historico</span> como{' '}
                    <span className="font-semibold text-[var(--error)]">Eliminado</span>. En la observación debe indicarse el{' '}
                    <span className="font-semibold text-[var(--text)]">motivo</span> por el que se elimina del seguimiento activo.
                </p>
                <p className="mt-3 font-mono text-xs text-[var(--muted)]">{candidate.workflowName}</p>
                <label className="mt-4 block text-[11px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    Observación obligatoria
                </label>
                <textarea
                    className="field-control mt-2 min-h-[100px] w-full resize-y px-3 py-2 text-sm"
                    placeholder="Describa el motivo de la eliminación…"
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                    disabled={submitting}
                />
                {errorMsg ? <p className="mt-2 text-sm text-[var(--error)]">{errorMsg}</p> : null}
                <div className="mt-5 flex flex-wrap justify-end gap-3">
                    <button
                        type="button"
                        disabled={submitting}
                        onClick={onClose}
                        className="rounded-xl border border-[var(--border)] bg-transparent px-4 py-2 text-sm font-semibold text-[var(--muted)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--text)] disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        disabled={submitting}
                        onClick={onConfirm}
                        className="rounded-xl border border-red-500/65 bg-transparent px-4 py-2 text-sm font-semibold text-[var(--error)] transition hover:bg-[rgba(255,107,107,0.1)] disabled:opacity-50"
                    >
                        {submitting ? 'Guardando…' : 'Confirmar eliminación'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function LiveDurations({ execution, isLight }) {
    const [nowTs, setNowTs] = useState(Date.now());
    useEffect(() => {
        const id = setInterval(() => setNowTs(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);
    return (
        <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-[var(--muted)]'}`}>
            Flujo {resolveFlowProcessingTime(execution, nowTs)} · Espera {resolveCandidateWaitTime(execution, nowTs)}
        </p>
    );
}

export default function ActiveCandidates({
    executions,
    metrics,
    loading,
    error,
    isConnected,
    refetch,
    authToken,
    canEliminarCandidato,
    dynamoConfigured,
    totalMonitorCount = 0
}) {
    const { isLight, field: fieldCls } = useModuleTheme();
    const dash = buildGestionTableDash(Boolean(isLight));
    const headCellCls = gestionTableHeadCellCls(isLight);
    const infoBanner = isLight
        ? 'rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600'
        : 'rounded-xl border border-slate-600/50 bg-slate-800/40 px-4 py-3 text-xs text-slate-300';
    const ghostNav = isLight
        ? 'rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-[10px] font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40'
        : 'rounded-lg border border-[var(--border)] bg-transparent px-3 py-1.5 text-[10px] font-semibold text-[rgba(159,179,200,0.95)] transition hover:bg-slate-800/50 disabled:cursor-not-allowed disabled:opacity-40';

    const [selectedUser, setSelectedUser] = useState(null);
    const [eliminarTarget, setEliminarTarget] = useState(null);
    const [eliminarObs, setEliminarObs] = useState('');
    const [eliminarError, setEliminarError] = useState('');
    const [eliminarSubmitting, setEliminarSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('start'); // employee | type | start | tasks
    const [sortDir, setSortDir] = useState('desc'); // asc | desc — desc = último en llegar primero
    const [pageSize, setPageSize] = useState(20);
    const [page, setPage] = useState(1);

    // Filtros avanzados
    const [fSoloActivos, setFSoloActivos] = useState(false);
    const [fFechaDesde, setFFechaDesde] = useState('');
    const [fFechaHasta, setFFechaHasta] = useState('');
    const [drawerOpen, setDrawerOpen] = useState(false);

    const activeFilterCount = [
        searchTerm !== '',
        statusFilter !== 'all',
        fSoloActivos,
        fFechaDesde !== '',
        fFechaHasta !== ''
    ].filter(Boolean).length;

    function clearAllFilters() {
        setSearchTerm('');
        setStatusFilter('all');
        setFSoloActivos(false);
        setFFechaDesde('');
        setFFechaHasta('');
    }

    useEffect(() => {
        setPage(1);
    }, [searchTerm, statusFilter, sortBy, sortDir, pageSize, fSoloActivos, fFechaDesde, fFechaHasta]);

    function getSortNumber(execution, key) {
        if (key === 'start') {
            return resolveIngresoMs(execution);
        }
        if (key === 'tasks') {
            return taskProgress(execution.realStatus);
        }
        return 0;
    }

    function getSortString(execution, key) {
        if (key === 'employee') return String(execution.workflowName || '');
        if (key === 'type') return String(execution.realStatus || '');
        return '';
    }

    function toggleSort(nextKey) {
        if (sortBy === nextKey) {
            setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
        } else {
            setSortBy(nextKey);
            setSortDir('desc');
        }
    }

    function openEliminar(ex, e) {
        e.stopPropagation();
        setEliminarTarget(ex);
        setEliminarObs('');
        setEliminarError('');
    }

    function openWhatsApp(ex, e) {
        e.stopPropagation();
        const digits = resolveWhatsAppDigits(ex);
        if (!digits) {
            window.alert('No hay un número de Whats válido en los datos de este candidato (p. ej. whatsapp_numerico).');
            return;
        }
        window.open(`https://wa.me/${digits}`, '_blank', 'noopener,noreferrer');
    }

    async function confirmEliminar() {
        const text = eliminarObs.trim();
        if (!eliminarTarget || !text) {
            setEliminarError('Debe escribir una observación.');
            return;
        }
        setEliminarSubmitting(true);
        setEliminarError('');
        try {
            await axios.post(
                '/api/contratacion/eliminar-candidato',
                { executionId: eliminarTarget.executionId, obs_eliminado: text },
                {
                    withCredentials: true,
                    headers: buildCsrfHeaders(
                        authToken ? { Authorization: `Bearer ${authToken}` } : {}
                    )
                }
            );
            setEliminarTarget(null);
            setEliminarObs('');
            if (selectedUser?.executionId === eliminarTarget.executionId) {
                setSelectedUser(null);
            }
            if (typeof refetch === 'function') await refetch();
        } catch (err) {
            const msg =
                err.response?.data?.message ||
                err.response?.data?.error ||
                err.response?.data?.errors?.[0]?.message ||
                err.message ||
                'No se pudo guardar.';
            setEliminarError(msg);
        } finally {
            setEliminarSubmitting(false);
        }
    }

    const preparedExecutions = useMemo(
        () => executions.map((ex) => ({ ...ex, _searchHaystack: buildSearchHaystack(ex) })),
        [executions]
    );

    const filtered = useMemo(() => {
        const results = preparedExecutions.filter(ex => {
            const q = searchTerm.toLowerCase();
            const matchesSearch = !q.trim() || ex._searchHaystack.includes(q);
            const matchesStatus = statusFilter === 'all'
                ? true
                : getTrazabilidadStageKey(ex.realStatus, ex.statusId) === statusFilter;

            // Filtro solo activos (no terminados ni eliminados)
            const stage = getTrazabilidadStageKey(ex.realStatus, ex.statusId);
            const isTerminado = stage === 'finalizado' || normalizeStatus(ex.realStatus) === 'eliminado';
            const matchesSoloActivos = !fSoloActivos || !isTerminado;

            // Filtros de fecha de ingreso del candidato
            const ingresoMs = resolveIngresoMs(ex);
            const ingresoDate = ingresoMs > 0 ? new Date(ingresoMs) : null;
            const matchesFechaDesde = !fFechaDesde || (ingresoDate && ingresoDate >= new Date(fFechaDesde));
            const matchesFechaHasta = !fFechaHasta || (ingresoDate && ingresoDate <= new Date(fFechaHasta + 'T23:59:59'));

            return matchesSearch && matchesStatus && matchesSoloActivos && matchesFechaDesde && matchesFechaHasta;
        });

        return results.sort((a, b) => {
            // Numérico
            if (sortBy === 'start' || sortBy === 'tasks') {
                const aVal = getSortNumber(a, sortBy);
                const bVal = getSortNumber(b, sortBy);
                const diff = bVal - aVal;
                if (diff !== 0) return sortDir === 'desc' ? diff : -diff;
            }

            // String
            if (sortBy === 'employee' || sortBy === 'type') {
                const aVal = getSortString(a, sortBy);
                const bVal = getSortString(b, sortBy);
                const cmp = aVal.localeCompare(bVal, 'es', { sensitivity: 'base' });
                if (cmp !== 0) return sortDir === 'desc' ? -cmp : cmp;
            }

            // Empate: más reciente primero (último en llegar arriba)
            return resolveIngresoMs(b) - resolveIngresoMs(a);
        });
    }, [preparedExecutions, searchTerm, statusFilter, sortBy, sortDir, fSoloActivos, fFechaDesde, fFechaHasta]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(page, totalPages);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [page, totalPages]);

    const pageStart = (currentPage - 1) * pageSize;
    const pageEnd = Math.min(pageStart + pageSize, filtered.length);
    const visible = filtered.slice(pageStart, pageStart + pageSize);

    function goPrevPage() {
        setPage((p) => Math.max(1, Math.min(p, totalPages) - 1));
    }

    function goNextPage() {
        setPage((p) => Math.min(totalPages, Math.min(p, totalPages) + 1));
    }

    if (loading) return <LoadingState />;
    if (error) return <ErrorState error={error} />;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-5 font-body"
        >
            {dynamoConfigured === false ? (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    <p className="font-semibold">DynamoDB no está configurado en el servidor</p>
                    <p className="mt-1 text-amber-200/90">
                        Define <code className="rounded bg-black/20 px-1">DYNAMODB_TABLE_NAME</code> (y región AWS) en el{' '}
                        <code className="rounded bg-black/20 px-1">.env</code> del backend, reinicia Node y vuelve a cargar.
                        Sin eso el monitor no puede leer candidatos.
                    </p>
                </div>
            ) : null}
            {dynamoConfigured === true && totalMonitorCount === 0 ? (
                <div className={infoBanner}>
                    La tabla Dynamo configurada devolvió <strong>0</strong> registros en el scan. Comprueba que{' '}
                    <code className="rounded bg-black/25 px-1">DYNAMODB_TABLE_NAME</code> sea la misma que usa n8n, la región{' '}
                    <code className="rounded bg-black/25 px-1">AWS_REGION</code> y que las credenciales IAM (o keys) tengan{' '}
                    <code className="rounded bg-black/25 px-1">dynamodb:Scan</code> en esa tabla.
                </div>
            ) : null}

            {/* ── Barra de filtros estándar del portal ── */}
            <ModuleFiltersToolbar
                chipLabel={activeFilterCount > 0
                    ? `${activeFilterCount} filtro${activeFilterCount !== 1 ? 's' : ''} activo${activeFilterCount !== 1 ? 's' : ''}`
                    : 'Sin filtros'}
                filtersPanelOpen={drawerOpen}
                onToggleFilters={() => setDrawerOpen((o) => !o)}
                toggleId="contratacion-activos-filtros-toggle"
                panelId="contratacion-activos-filtros-panel"
                dash={dash}
            >
                <div className="relative min-w-[200px] flex-1">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="search"
                        className={`${fieldCls} w-full py-2 pl-10 pr-3 text-sm h-9`}
                        placeholder="Buscar por nombre, puesto o ID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <span className={`shrink-0 text-[11px] font-semibold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {filtered.length} / {executions.length}
                </span>
            </ModuleFiltersToolbar>

            {/* ── Drawer de filtros avanzados estándar ── */}
            <ModuleFiltersDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                onClear={clearAllFilters}
                dash={dash}
                panelId="contratacion-activos-filtros-panel"
                titleId="contratacion-activos-filtros-drawer-title"
            >
                <div className="flex flex-col gap-1.5">
                    <label className={dash.filtrosDrawerLabel}>Estado</label>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className={`${fieldCls} w-full cursor-pointer px-3 py-2.5 text-sm`}
                    >
                        <option value="all">Todos los estados</option>
                        <option value="cargando">Cargando</option>
                        <option value="contactado">Contactado</option>
                        <option value="whatsapp enviado">WhatsApp Enviado</option>
                        <option value="documentos recibidos">Documentos Recibidos</option>
                        <option value="sagrilaft enviado">Sagrilaft Enviado</option>
                        <option value="finalizado">Finalizado</option>
                    </select>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={dash.filtrosDrawerLabel}>Opciones</label>
                    <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition ${
                        isLight ? 'border-slate-200 bg-slate-50 text-slate-800' : 'border-slate-700/60 bg-slate-800/40 text-slate-200'
                    }`}>
                        <input
                            type="checkbox"
                            checked={fSoloActivos}
                            onChange={(e) => setFSoloActivos(e.target.checked)}
                            className="h-4 w-4 cursor-pointer rounded accent-[#2F7BB8]"
                        />
                        <div>
                            <p className="font-semibold">Solo activos</p>
                            <p className={`mt-0.5 text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Excluye finalizados y eliminados</p>
                        </div>
                    </label>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={dash.filtrosDrawerLabel}>Desde</label>
                    <input
                        {...nativeCalendarOnlyInputProps}
                        type="date"
                        value={fFechaDesde}
                        onChange={(e) => setFFechaDesde(e.target.value)}
                        className={`${fieldCls} w-full cursor-pointer px-3 py-2.5 text-sm`}
                    />
                </div>
                <div className="flex flex-col gap-1.5">
                    <label className={dash.filtrosDrawerLabel}>Hasta</label>
                    <input
                        {...nativeCalendarOnlyInputProps}
                        type="date"
                        value={fFechaHasta}
                        onChange={(e) => setFFechaHasta(e.target.value)}
                        className={`${fieldCls} w-full cursor-pointer px-3 py-2.5 text-sm`}
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={dash.filtrosDrawerLabel}>Filas por página</label>
                    <select
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                        className={`${fieldCls} w-full cursor-pointer px-3 py-2.5 text-sm`}
                    >
                        <option value={10}>10 filas</option>
                        <option value={20}>20 filas</option>
                        <option value={50}>50 filas</option>
                        <option value={100}>100 filas</option>
                    </select>
                </div>
            </ModuleFiltersDrawer>



            {filtered.length === 0 ? (
                totalMonitorCount > 0 && executions.length === 0 ? (
                    <div className={`rounded-xl border px-5 py-10 text-center ${isLight ? 'border-sky-200 bg-sky-50' : 'border-blue-500/35 bg-blue-500/10'}`}>
                        <p className={`text-sm font-semibold ${isLight ? 'text-sky-900' : 'text-blue-100'}`}>
                            Hay {totalMonitorCount} ejecución{totalMonitorCount !== 1 ? 'es' : ''} en el flujo, pero ninguna en estado activo.
                        </p>
                        <p className={`mt-2 text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                            Es probable que estén en etapa final (finalizado, rechazado, etc.).
                        </p>
                    </div>
                ) : (
                    <EmptyState />
                )
            ) : (
                <div className={isLight ? 'flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border backdrop-blur-xl bg-white/80 border-white/40 shadow-xl' : 'glass-card flex min-h-0 w-full flex-1 flex-col p-0'}>
                    <div className={`grid grid-cols-[1.8fr_0.95fr_0.95fr_1fr_120px] items-center gap-3 ${gestionTableHeadRowCls(isLight)}`}>
                        <button
                            type="button"
                            className={`${headCellCls} flex items-center gap-2 text-left`}
                            onClick={() => toggleSort('employee')}
                        >
                            Empleado
                            {sortBy === 'employee' && <span className="text-[10px] opacity-70">{sortDir === 'desc' ? '▼' : '▲'}</span>}
                        </button>
                        <button
                            type="button"
                            className={`${headCellCls} flex items-center gap-2 text-left`}
                            onClick={() => toggleSort('type')}
                        >
                            Estado
                            {sortBy === 'type' && <span className="text-[10px] opacity-70">{sortDir === 'desc' ? '▼' : '▲'}</span>}
                        </button>
                        <button
                            type="button"
                            className={`${headCellCls} flex items-center gap-2 text-left`}
                            onClick={() => toggleSort('start')}
                        >
                            Inicio
                            {sortBy === 'start' && <span className="text-[10px] opacity-70">{sortDir === 'desc' ? '▼' : '▲'}</span>}
                        </button>
                        <button
                            type="button"
                            className={`${headCellCls} flex items-center gap-2 text-left`}
                            onClick={() => toggleSort('tasks')}
                        >
                            Progreso
                            {sortBy === 'tasks' && <span className="text-[10px] opacity-70">{sortDir === 'desc' ? '▼' : '▲'}</span>}
                        </button>
                        <span className={`${headCellCls} text-right`}>Acciones</span>
                    </div>
                    <div className="min-h-0 flex-1 divide-y divide-[var(--border)] overflow-y-auto">
                        {visible.map((ex) => {
                            const completedStages = taskProgress(ex.realStatus, ex.statusId);
                            const maxStages = TRAZABILIDAD_STAGE_ORDER.length - 1; // 5
                            const startDate = resolveIngresoRaw(ex);
                            return (
                                <div
                                    key={ex.executionId}
                                    onClick={() => setSelectedUser(ex)}
                                    className={`grid w-full cursor-pointer grid-cols-[1.8fr_0.95fr_0.95fr_1fr_120px] items-center gap-3 px-4 py-3 transition-colors ${isLight ? 'hover:bg-white/60' : 'hover:bg-white/5'}`}
                                >
                                    <div className="min-w-0">
                                        <p className={`truncate text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>{ex.workflowName || 'Name Last Name'}</p>
                                        <p className={`truncate text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{ex.fullData?.puesto || 'Puesto de trabajo'}</p>
                                    </div>
                                    <div className="min-w-0 flex items-center">
                                        <span className={`inline-flex max-w-full truncate rounded-full border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${statusTone(ex.realStatus, ex.statusId, isLight)}`}>
                                            {ex.realStatus || 'Onboarding'}
                                        </span>
                                    </div>
                                    <div className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                                        {startDate ? new Date(startDate).toLocaleDateString('es-CO') : 'DD/MM/YYYY'}
                                    </div>
                                    <div className="min-w-0">
                                        <LiveDurations execution={ex} isLight={isLight} />
                                        <div className="mt-2">
                                            <TaskProgressCompact completedStages={completedStages} maxStages={maxStages} isLight={isLight} />
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            type="button"
                                            title="Abrir WhatsApp Web / app"
                                            aria-label="Abrir conversación en WhatsApp"
                                            onClick={(e) => openWhatsApp(ex, e)}
                                            className="flex h-7 w-7 items-center justify-center rounded-md border border-[rgba(37,211,102,0.55)] bg-transparent text-[#25D366] transition hover:bg-[rgba(37,211,102,0.12)]"
                                        >
                                            <WhatsAppGlyph className="h-4 w-4" />
                                        </button>
                                        {canEliminarCandidato ? (
                                            <button
                                                type="button"
                                                onClick={(e) => openEliminar(ex, e)}
                                                className="rounded-md border border-red-500/65 bg-transparent px-2 py-1 text-[10px] font-semibold text-[var(--error)] transition hover:bg-[rgba(255,107,107,0.08)]"
                                            >
                                                Eliminar
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    {/* ── Pie de tabla: info + paginación ── */}
                    <div className={`flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 ${isLight ? 'border-slate-200/50 bg-slate-50/50' : 'border-white/5 bg-transparent'}`}>
                        {/* Info de filas y página */}
                        <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                            {filtered.length === 0 ? (
                                <>Sin resultados</>
                            ) : (
                                <>
                                    Filas{' '}
                                    <span className="font-semibold text-[var(--text)]">{pageStart + 1}</span>
                                    {' — '}
                                    <span className="font-semibold text-[var(--text)]">{pageEnd}</span>
                                    {' de '}
                                    <span className="font-semibold text-[var(--text)]">{filtered.length}</span>
                                </>
                            )}
                        </p>

                        {/* Botones de paginación (solo si hay más de una página) */}
                        {filtered.length > pageSize && (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={goPrevPage}
                                    disabled={currentPage <= 1}
                                    className={isLight ? ghostNav : 'neon-button w-auto px-4 py-1 text-[10px]'}
                                >
                                    Anterior
                                </button>
                                <button
                                    type="button"
                                    onClick={goNextPage}
                                    disabled={currentPage >= totalPages}
                                    className={isLight ? ghostNav : 'neon-button w-auto px-4 py-1 text-[10px]'}
                                >
                                    Siguiente
                                </button>
                            </div>
                        )}

                        {/* Total Dynamo */}
                        <span className="data-chip text-xs">Total en Dynamo: {totalMonitorCount}</span>
                    </div>
                    </div>
            )}

            <EliminarCandidatoOverlay
                candidate={eliminarTarget}
                obs={eliminarObs}
                setObs={setEliminarObs}
                errorMsg={eliminarError}
                submitting={eliminarSubmitting}
                onClose={() => !eliminarSubmitting && setEliminarTarget(null)}
                onConfirm={confirmEliminar}
            />
            <CandidateModal selectedUser={selectedUser} onClose={() => setSelectedUser(null)} />
        </motion.div>
    );
}

function LoadingState() {
    return (
        <div className="flex flex-col items-center justify-center py-32 font-body">
            <div className="relative">
                <div className="h-16 w-16 border-2 border-zinc-800 rounded-full"></div>
                <div className="absolute top-0 left-0 h-16 w-16 border-2 border-cinte-cyan border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p className="mt-6 text-[#7a8aa0] text-sm uppercase tracking-widest">Cargando datos...</p>
        </div>
    );
}

function ErrorState({ error }) {
    return (
            <div className="mb-8 rounded-xl border border-[rgba(255,107,107,0.35)] bg-[rgba(255,107,107,0.08)] p-6 font-body">
            <div className="flex items-center gap-4">
                <div className="p-2 bg-[rgba(255,107,107,0.12)] rounded-lg">
                    <svg className="w-6 h-6 text-[var(--error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <div>
                    <h3 className="text-[rgba(255,107,107,0.95)] font-semibold mb-1 font-heading">Error de Conexion</h3>
                    <p className="text-[rgba(255,107,107,0.9)] text-sm">{error}</p>
                </div>
            </div>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="surface-panel border-dashed py-24 text-center font-body">
            <div className="mb-6 inline-flex h-20 w-20 items-center justify-center rounded-2xl border border-[var(--primary)]/20 bg-[var(--primary-soft)] shadow-sm">
                <svg className="h-10 w-10 text-[var(--primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
            </div>
            <h3 className="mb-2 text-2xl font-bold tracking-wide text-[var(--text)] font-heading">Sin Actividad</h3>
            <p className="mx-auto max-w-sm text-[var(--muted)]">No hay candidatos activos que coincidan con tu busqueda.</p>
        </div>
    );
}
