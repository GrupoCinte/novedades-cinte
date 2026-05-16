import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from 'recharts';
import { RECHARTS_TOOLTIP_CONTENT_STYLE, RECHARTS_TOOLTIP_CONTENT_STYLE_LIGHT } from '../constants/rechartsTheme.js';
import CandidateModal from './CandidateModal';
import { useModuleTheme } from '../../moduleTheme.js';
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
    const { isLight } = useModuleTheme();
    const channel = detectChannel(execution);
    const eliminado = isEliminadoRecord(execution);
    const signedDate = formatDate(execution.fullData?.ts_validacion_completada);
    const role = execution.fullData?.puesto || 'Cargo no informado';
    const duration = calculateProcessTime(
        execution.fullData?.ts_documentos_recibidos,
        execution.fullData?.ts_validacion_completada
    );

    const tipoBadgeTone = eliminado
        ? (isLight ? 'border-red-400 bg-red-50 text-red-700' : 'border-red-500/55 bg-transparent text-red-400')
        : (() => {
            if (isLight) {
                if (channel === 'DocuSign') return 'border-sky-300 bg-sky-50 text-sky-900';
                if (channel === 'Portal') return 'border-cyan-300 bg-cyan-50 text-cyan-900';
                return 'border-emerald-300 bg-emerald-50 text-emerald-900';
            }
            if (channel === 'DocuSign') return 'border-[rgba(42,144,255,0.35)] bg-[rgba(42,144,255,0.14)] text-[#bfe6ff]';
            if (channel === 'Portal') return 'border-[rgba(8,189,198,0.28)] bg-[rgba(8,189,198,0.12)] text-[#7af2ea]';
            return 'border-[rgba(31,199,106,0.28)] bg-[rgba(31,199,106,0.12)] text-[#b8f7cd]';
        })();

    const tipoLabel = eliminado ? 'Eliminado' : channel;

    return (
        <button
            type="button"
            onClick={onOpen}
            className={`grid w-full grid-cols-[2.2fr_1fr_1fr_1.5fr_auto] items-center gap-4 px-4 py-3 text-left transition ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/5'}`}
        >
            <div>
                <p className={`text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>{execution.workflowName || 'Candidato'}</p>
                <p className={`mt-1 text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{role}</p>
            </div>
            <div>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${tipoBadgeTone}`}>
                    {tipoLabel}
                </span>
            </div>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{signedDate}</p>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>{duration || 'No calculado'}</p>
            <span className={`text-xl leading-none ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>⋮</span>
        </button>
    );
}

export default function HistoryCandidates({ executions, metrics, loading }) {
    const { isLight } = useModuleTheme();
    const chartTick = isLight ? '#64748b' : 'rgba(159,179,200,0.95)';
    const chartGrid = isLight ? '#e2e8f0' : 'rgba(109, 129, 155, 0.2)';
    const chartTooltip = isLight ? RECHARTS_TOOLTIP_CONTENT_STYLE_LIGHT : RECHARTS_TOOLTIP_CONTENT_STYLE;
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
            <div className="flex flex-col items-center justify-center py-32 font-body">
                <div className="relative">
                    <div className="h-16 w-16 rounded-full border-2 border-zinc-800" />
                    <div className="absolute left-0 top-0 h-16 w-16 animate-spin rounded-full border-2 border-cinte-green border-t-transparent" />
                </div>
                <p className="mt-6 text-sm uppercase tracking-widest text-[#7a8aa0]">Cargando histórico...</p>
            </div>
        );
    }

    const glassPanel = isLight ? 'overflow-hidden rounded-2xl border backdrop-blur-xl bg-white/80 border-white/40 shadow-xl' : 'glass-card';

    return (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 font-body">

            <div className={`${glassPanel} p-5`}>
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
                        <div className={`${glassPanel} border-dashed p-10 text-center`}>
                            <p className={`text-lg font-semibold ${isLight ? 'text-slate-800' : 'title-gradient'}`}>Sin histórico en el filtro actual</p>
                        </div>
                    ) : (
                        <div className={`${glassPanel} overflow-hidden`}>
                            <div className={`grid grid-cols-[2.2fr_1fr_1fr_1.5fr_auto] gap-4 border-b px-4 py-3 text-[11px] font-bold uppercase tracking-wide ${isLight ? 'border-slate-200/50 bg-slate-50/50 text-slate-600' : 'border-white/5 bg-white/5 text-[rgba(159,179,200,0.95)]'}`}>
                                <span>Empleado</span>
                                <span>Tipo</span>
                                <span>Incorporacion/cese</span>
                                <span>Tareas completadas</span>
                                <span />
                            </div>
                            <div className={`max-h-[64vh] divide-y overflow-y-auto ${isLight ? 'divide-slate-200' : 'divide-white/5'}`}>
                            {visible.map((ex) => (
                                <SignedContractRow key={ex.executionId} execution={ex} onOpen={() => setSelectedUser(ex)} />
                            ))}
                            </div>
                        </div>
                    )}
                </section>

                <section className="space-y-6">
                    <article className={`${glassPanel} p-5`}>
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className={`text-sm font-bold uppercase tracking-widest ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Total de ingresos reales mensual</h3>
                            <span className="text-[10px] font-bold text-[#14ffec] bg-[#14ffec]/10 px-2 py-1 rounded-full border border-[#14ffec]/20">Métrica Global</span>
                        </div>
                        <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={monthlyGrowth}>
                                    <defs>
                                        <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#14ffec" stopOpacity={0.5} />
                                            <stop offset="100%" stopColor="#14ffec" stopOpacity={0.0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} vertical={false} />
                                    <XAxis dataKey="month" stroke={chartTick} axisLine={false} tickLine={false} />
                                    <YAxis stroke={chartTick} axisLine={false} tickLine={false} />
                                    <Tooltip
                                        contentStyle={chartTooltip}
                                        cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                                    />
                                    <Area type="monotone" dataKey="firmas" stroke="#14ffec" fill="url(#growthFill)" strokeWidth={3} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </article>

                    <article className={`${glassPanel} p-5`}>
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className={`text-sm font-bold uppercase tracking-widest ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Conteo por tipo Descriptivo</h3>
                        </div>
                        <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={descriptivoCinteBars} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" stroke={chartGrid} horizontal={false} />
                                    <XAxis type="number" stroke={chartTick} axisLine={false} tickLine={false} />
                                    <YAxis
                                        type="category"
                                        dataKey="tipo"
                                        width={200}
                                        stroke={chartTick}
                                        interval={0}
                                        axisLine={false}
                                        tickLine={false}
                                        ticks={descriptivoCinteBars.map((d) => d.tipo)}
                                        tick={{ fontSize: 11, fill: chartTick }}
                                        tickFormatter={(v) => String(v).length > 22 ? `${String(v).slice(0, 22)}…` : String(v)}
                                    />
                                    <Tooltip
                                        contentStyle={chartTooltip}
                                        cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                                    />
                                    <Bar dataKey="firmas" fill="#ffb347" radius={[0, 4, 4, 0]} barSize={20} />
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
