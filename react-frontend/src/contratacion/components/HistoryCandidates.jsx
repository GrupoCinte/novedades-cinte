import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts';
import { RECHARTS_TOOLTIP_CONTENT_STYLE } from '../constants/rechartsTheme.js';
import CandidateModal from './CandidateModal';
import { calculateProcessTime, getTrazabilidadStageKey, normalizeStatus } from '../hooks/useMonitorData';

const CHANNELS = ['DocuSign', 'Portal', 'Correo'];

function formatDate(ts) {
    if (!ts) return 'Sin fecha';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return 'Sin fecha';
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function detectChannel(execution) {
    const doc = String(execution.fullData?.documentos || '').toLowerCase();
    if (doc.includes('docusign')) return 'DocuSign';
    if (doc.includes('portal')) return 'Portal';
    return 'Correo';
}

function getDepartment(execution) {
    const role = String(execution.fullData?.puesto || '').toLowerCase();
    if (/(legal|abog|jurid)/.test(role)) return 'Legal';
    if (/(rrhh|talento|humano|people|recruit)/.test(role)) return 'RRHH';
    if (/(finan|contab|tesor)/.test(role)) return 'Finanzas';
    return 'Operaciones';
}

function buildMonthlyGrowth(executions) {
    // monthKey (YYYYMM) -> { month, firmas }
    const bucket = {};
    executions.forEach((ex) => {
        // Para histórico incluye eliminados (si existe), luego cerrados validados.
        const ts = ex.fullData?.ts_eliminado || ex.fullData?.ts_validacion_completada || ex.timestamp;
        const date = new Date(ts);
        if (Number.isNaN(date.getTime())) return;
        const monthKey = date.getFullYear() * 100 + (date.getMonth() + 1); // YYYYMM
        const monthLabel = date.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
        if (!bucket[monthKey]) {
            bucket[monthKey] = { monthKey, month: monthLabel, firmas: 0 };
        }
        bucket[monthKey].firmas += 1;
    });
    return Object.values(bucket).sort((a, b) => a.monthKey - b.monthKey).map(({ month, firmas }) => ({ month, firmas }));
}

function normalizeKey(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function resolveDescriptivoCinte(execution) {
    const full = execution.fullData || {};
    const fallback = full?.puesto;

    const keys = Object.keys(full);
    for (const key of keys) {
        const nk = normalizeKey(key);
        if (nk.includes('descript') && nk.includes('cinte')) {
            const raw = full[key];
            const val = typeof raw === 'string' ? raw : raw != null ? String(raw) : '';
            const clean = val.trim();
            if (clean && clean.toLowerCase() !== 'null' && clean.toLowerCase() !== 'undefined') return clean;
        }
    }

    const fb = typeof fallback === 'string' ? fallback : fallback != null ? String(fallback) : '';
    return fb.trim() || 'Sin Descriptivo CINTE';
}

function buildDescriptivoCinteBars(executions, max = 8) {
    const bucket = {};
    executions.forEach((ex) => {
        const label = resolveDescriptivoCinte(ex);
        const key = String(label).trim();
        if (!key) return;
        bucket[key] = (bucket[key] || 0) + 1;
    });

    const sorted = Object.entries(bucket)
        .map(([tipo, firmas]) => ({ tipo, firmas }))
        .sort((a, b) => b.firmas - a.firmas);

    const top = sorted.slice(0, max);
    const rest = sorted.slice(max);
    const others = rest.reduce((sum, r) => sum + r.firmas, 0);

    if (others > 0) {
        top.push({ tipo: 'Otros', firmas: others });
    }
    return top;
}

function isEliminadoRecord(ex) {
    const s = normalizeStatus(ex.realStatus);
    return s === 'eliminado' || Boolean(ex.fullData?.obs_eliminado);
}

function SignedContractRow({ execution, onOpen }) {
    const channel = detectChannel(execution);
    const eliminado = isEliminadoRecord(execution);
    const signedDate = formatDate(execution.fullData?.ts_validacion_completada);
    const role = execution.fullData?.puesto || 'Cargo no informado';
    const duration = calculateProcessTime(
        execution.fullData?.ts_documentos_recibidos,
        execution.fullData?.ts_validacion_completada
    );

    const tipoBadgeTone = eliminado
        ? 'border-red-500/55 bg-transparent text-red-400'
        : (() => {
            if (channel === 'DocuSign') return 'border-[rgba(42,144,255,0.35)] bg-[rgba(42,144,255,0.14)] text-[#bfe6ff]';
            if (channel === 'Portal') return 'border-[rgba(8,189,198,0.28)] bg-[rgba(8,189,198,0.12)] text-[#7af2ea]';
            return 'border-[rgba(31,199,106,0.28)] bg-[rgba(31,199,106,0.12)] text-[#b8f7cd]';
        })();

    const tipoLabel = eliminado ? 'Eliminado' : channel;

    return (
        <button
            type="button"
            onClick={onOpen}
            className="grid w-full grid-cols-[2.2fr_1fr_1fr_1.5fr_auto] items-center gap-4 px-4 py-3 text-left transition hover:bg-slate-800/50"
        >
            <div>
                <p className="text-sm font-semibold text-[var(--text)]">{execution.workflowName || 'Candidato'}</p>
                <p className="mt-1 text-xs text-[rgba(159,179,200,0.95)]">{role}</p>
            </div>
            <div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${tipoBadgeTone}`}>
                    {tipoLabel}
                </span>
            </div>
            <p className="text-xs text-[rgba(159,179,200,0.95)]">{signedDate}</p>
            <p className="text-xs text-[rgba(159,179,200,0.95)]">{duration || 'No calculado'}</p>
            <span className="text-xl leading-none text-[rgba(159,179,200,0.95)]">⋮</span>
        </button>
    );
}

export default function HistoryCandidates({ executions, metrics, loading }) {
    const [selectedUser, setSelectedUser] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [channelFilter, setChannelFilter] = useState('all');
    const [pageSize, setPageSize] = useState(20);

    const filtered = useMemo(() => {
        return executions
            .filter((ex) => {
                const stage = getTrazabilidadStageKey(ex.realStatus, ex.statusId);
                if (stage !== 'finalizado') {
                    return false;
                }

                const matchesSearch = !searchTerm || (
                    ex.workflowName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    ex.executionId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (ex.fullData?.puesto || '').toLowerCase().includes(searchTerm.toLowerCase())
                );
                const channel = detectChannel(ex);
                const matchesChannel = channelFilter === 'all' ? true : channel === channelFilter;
                return matchesSearch && matchesChannel;
            })
            .sort((a, b) => {
                const tb = new Date(b.fullData?.ts_eliminado || b.fullData?.ts_validacion_completada || b.timestamp).getTime();
                const ta = new Date(a.fullData?.ts_eliminado || a.fullData?.ts_validacion_completada || a.timestamp).getTime();
                return tb - ta;
            });
    }, [executions, searchTerm, channelFilter]);

    const monthlyGrowth = useMemo(() => buildMonthlyGrowth(filtered), [filtered]);
    const descriptivoCinteBars = useMemo(() => buildDescriptivoCinteBars(filtered, 8), [filtered]);
    const visible = filtered.slice(0, pageSize);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-32">
                <div className="relative">
                    <div className="h-16 w-16 rounded-full border-2 border-zinc-800" />
                    <div className="absolute left-0 top-0 h-16 w-16 animate-spin rounded-full border-2 border-cinte-green border-t-transparent" />
                </div>
                <p className="mt-6 text-sm uppercase tracking-widest text-[#7a8aa0]">Cargando histórico...</p>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

            <div className="surface-panel p-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_auto]">
                <input
                    type="text"
                    className="field-control w-full px-4 py-3 text-sm transition"
                    placeholder="Buscar candidato o cargo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <select
                    value={channelFilter}
                    onChange={(e) => setChannelFilter(e.target.value)}
                    className="field-control px-3 py-3 text-sm transition"
                >
                    <option value="all">Todos los canales</option>
                    {CHANNELS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                    ))}
                </select>
                <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="field-control min-w-[130px] px-3 py-3 text-sm transition"
                >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                </select>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_1fr]">
                <section className="space-y-4">
                    {filtered.length === 0 ? (
                        <div className="surface-panel border-dashed p-10 text-center">
                            <p className="text-lg font-semibold text-[var(--text)]">Sin histórico en el filtro actual</p>
                        </div>
                    ) : (
                        <div className="surface-panel overflow-hidden">
                            <div className="grid grid-cols-[2.2fr_1fr_1fr_1.5fr_auto] gap-4 border-b border-[var(--border)] bg-[var(--surface-soft)] px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-[rgba(159,179,200,0.95)]">
                                <span>Empleado</span>
                                <span>Tipo</span>
                                <span>Incorporacion/cese</span>
                                <span>Tareas completadas</span>
                                <span />
                            </div>
                            <div className="max-h-[64vh] divide-y divide-[var(--border)] overflow-y-auto">
                            {visible.map((ex) => (
                                <SignedContractRow key={ex.executionId} execution={ex} onOpen={() => setSelectedUser(ex)} />
                            ))}
                            </div>
                        </div>
                    )}
                </section>

                <section className="space-y-4">
                    <article className="surface-panel p-4">
                        <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Total de ingresos reales mensual</h3>
                        <div className="h-[220px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={monthlyGrowth}>
                                    <defs>
                                        <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#4F8831" stopOpacity={0.7} />
                                            <stop offset="100%" stopColor="#4F8831" stopOpacity={0.05} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(109, 129, 155, 0.2)" />
                                    <XAxis dataKey="month" stroke="rgba(159,179,200,0.95)" />
                                    <YAxis stroke="rgba(159,179,200,0.95)" />
                                    <Tooltip
                                        contentStyle={RECHARTS_TOOLTIP_CONTENT_STYLE}
                                    />
                                    <Area type="monotone" dataKey="firmas" stroke="#4F8831" fill="url(#growthFill)" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </article>

                    <article className="surface-panel p-4">
                        <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">Conteo por tipo Descriptivo CINTE</h3>
                        <div className="h-[220px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={descriptivoCinteBars} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(109, 129, 155, 0.2)" />
                                    <XAxis type="number" stroke="rgba(159,179,200,0.95)" />
                                    <YAxis
                                        type="category"
                                        dataKey="tipo"
                                        width={220}
                                        stroke="rgba(159,179,200,0.95)"
                                        interval={0}
                                        ticks={descriptivoCinteBars.map((d) => d.tipo)}
                                        tick={{ fontSize: 12 }}
                                        tickFormatter={(v) => String(v).length > 24 ? `${String(v).slice(0, 24)}…` : String(v)}
                                    />
                                    <Tooltip
                                        contentStyle={RECHARTS_TOOLTIP_CONTENT_STYLE}
                                    />
                                    <Bar dataKey="firmas" fill="#08bdc6" radius={[8, 8, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </article>
                </section>
            </div>

            <CandidateModal selectedUser={selectedUser} onClose={() => setSelectedUser(null)} />
        </motion.div>
    );
}
