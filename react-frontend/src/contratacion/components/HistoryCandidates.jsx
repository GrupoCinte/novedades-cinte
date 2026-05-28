import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CandidateModal from './CandidateModal';
import FilterDrawer, { FilterDrawerTrigger, FilterSection } from './FilterDrawer';
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
            className={`grid w-full grid-cols-[2.2fr_1fr_1fr_1.5fr_40px] items-center gap-4 px-4 py-3 text-left transition ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/5'}`}
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
    const { isLight, field: fieldCls } = useModuleTheme();
    const [selectedUser, setSelectedUser] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [channelFilter, setChannelFilter] = useState('all');
    const [pageSize, setPageSize] = useState(20);
    const [drawerOpen, setDrawerOpen] = useState(false);

    const activeFilterCount = [
        searchTerm !== '',
        channelFilter !== 'all',
    ].filter(Boolean).length;

    function clearAllFilters() {
        setSearchTerm('');
        setChannelFilter('all');
    }

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

            {/* ── Barra superior: búsqueda rápida + botón filtros ── */}
            <div className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 ${
                isLight ? 'bg-white/80 border border-slate-200/60 shadow-sm backdrop-blur-xl' : 'bg-white/[0.04] border border-white/5 backdrop-blur-xl'
            }`}>
                <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        className={`${fieldCls || 'field-control'} w-full py-2 pl-10 pr-3 text-sm h-9`}
                        placeholder="Buscar candidato o cargo..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <span className={`shrink-0 text-[11px] font-semibold hidden sm:inline ${
                    isLight ? 'text-slate-500' : 'text-slate-500'
                }`}>
                    {filtered.length} / {executions.length}
                </span>
                <FilterDrawerTrigger
                    onClick={() => setDrawerOpen(true)}
                    activeCount={activeFilterCount}
                    isLight={isLight}
                />
            </div>

            {/* ── FilterDrawer ── */}
            <FilterDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                activeCount={activeFilterCount}
                onClear={clearAllFilters}
            >
                <FilterSection title="Búsqueda" isLight={isLight}>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            className={`${fieldCls || 'field-control'} w-full py-2.5 pl-10 pr-3 text-sm`}
                            placeholder="Candidato o cargo..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </FilterSection>

                <FilterSection title="Canal de firma" isLight={isLight}>
                    <select
                        value={channelFilter}
                        onChange={(e) => setChannelFilter(e.target.value)}
                        className={`${fieldCls || 'field-control'} w-full cursor-pointer px-3 py-2.5 text-sm`}
                    >
                        <option value="all">Todos los canales</option>
                        {CHANNELS.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                </FilterSection>

                <FilterSection title="Paginación" isLight={isLight}>
                    <div className="space-y-1.5">
                        <label className={`text-[11px] font-semibold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Filas por página</label>
                        <select
                            value={pageSize}
                            onChange={(e) => setPageSize(Number(e.target.value))}
                            className={`${fieldCls || 'field-control'} w-full cursor-pointer px-3 py-2.5 text-sm`}
                        >
                            <option value={10}>10 filas</option>
                            <option value={20}>20 filas</option>
                            <option value={50}>50 filas</option>
                            <option value={100}>100 filas</option>
                        </select>
                    </div>
                </FilterSection>
            </FilterDrawer>

            <section className="space-y-4">
                {filtered.length === 0 ? (
                    <div className={`${glassPanel} border-dashed p-10 text-center`}>
                        <p className={`text-lg font-semibold ${isLight ? 'text-slate-800' : 'title-gradient'}`}>Sin histórico en el filtro actual</p>
                    </div>
                ) : (
                    <div className={`${glassPanel} overflow-hidden`}>
                        <div className={`grid grid-cols-[2.2fr_1fr_1fr_1.5fr_40px] gap-4 border-b px-4 py-3 text-[11px] font-bold uppercase tracking-wide ${isLight ? 'border-slate-200/50 bg-slate-50/50 text-slate-600' : 'border-white/5 bg-white/5 text-[rgba(159,179,200,0.95)]'}`}>
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

            <CandidateModal selectedUser={selectedUser} onClose={() => setSelectedUser(null)} />
        </motion.div>
    );
}
