import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Search, Users, MessageCircle, CheckCircle2, Sparkles } from 'lucide-react';
import { useModuleTheme } from '../moduleTheme.js';
import { ATRACCION_PAGE_MAIN } from './atraccionLayout.js';
import {
    fetchAtraccionHealth,
    fetchIntegraciones,
    fetchVacantes,
    fetchVacantesStats
} from './atraccionApi.js';
import AtraccionVacanteModal from './AtraccionVacanteModal.jsx';
import { formatVacanteCodigo } from './atraccionFormat.js';

const ESTADO_BADGE = {
    activa: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    borrador: 'bg-amber-100 text-amber-800 border-amber-200',
    archivada: 'bg-slate-100 text-slate-600 border-slate-200'
};

function EstadoBadge({ estado }) {
    const cls = ESTADO_BADGE[estado] || ESTADO_BADGE.borrador;
    return (
        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>
            {estado || '—'}
        </span>
    );
}

function Metric({ icon: Icon, value, label, tone, isLight }) {
    const tones = {
        slate: isLight ? 'text-slate-700' : 'text-slate-200',
        sky: isLight ? 'text-sky-700' : 'text-sky-300',
        amber: isLight ? 'text-amber-700' : 'text-amber-300',
        emerald: isLight ? 'text-emerald-700' : 'text-emerald-300'
    };
    return (
        <div className="flex flex-col items-center gap-0.5">
            <Icon size={15} className={tones[tone] || tones.slate} />
            <span className={`text-sm font-bold ${tones[tone] || tones.slate}`}>{value}</span>
            <span className={`text-[10px] uppercase tracking-wide ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {label}
            </span>
        </div>
    );
}

function VacanteCard({ vacante, stats, isLight, onOpen }) {
    const cargo = vacante.criterios?.cargo || '—';
    const ciudad = vacante.criterios?.ciudad || '';
    const s = stats || { total: 0, contactados: 0, respondieron: 0, aptos: 0 };
    return (
        <button
            type="button"
            onClick={() => onOpen(vacante)}
            className={`group flex flex-col rounded-xl border p-4 text-left transition-all ${
                isLight
                    ? 'border-slate-200 bg-white shadow-sm hover:border-sky-300 hover:shadow-md'
                    : 'border-slate-700/60 bg-[#0b1f2a]/80 shadow-lg hover:border-sky-500/50'
            }`}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    {formatVacanteCodigo(vacante.codigo) ? (
                        <p className={`font-mono text-[11px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                            {formatVacanteCodigo(vacante.codigo)}
                        </p>
                    ) : null}
                    <h3 className={`truncate text-sm font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {vacante.titulo || 'Vacante sin título'}
                    </h3>
                </div>
                <EstadoBadge estado={vacante.estado} />
            </div>

            <p className={`mt-1 truncate text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                {cargo}{ciudad ? ` · ${ciudad}` : ''}
            </p>

            <div className={`mt-4 grid grid-cols-4 gap-1 rounded-lg border py-2.5 ${
                isLight ? 'border-slate-100 bg-slate-50' : 'border-slate-700/50 bg-[#04141E]/40'
            }`}>
                <Metric icon={Users} value={s.total} label="Total" tone="slate" isLight={isLight} />
                <Metric icon={Search} value={s.contactados} label="Contact." tone="sky" isLight={isLight} />
                <Metric icon={MessageCircle} value={s.respondieron} label="Respond." tone="amber" isLight={isLight} />
                <Metric icon={CheckCircle2} value={s.aptos} label="Aptos" tone="emerald" isLight={isLight} />
            </div>

            <span className={`mt-3 inline-flex items-center gap-1.5 text-xs font-medium ${
                isLight ? 'text-sky-700' : 'text-sky-300'
            }`}>
                <Sparkles size={13} /> Abrir shortlist →
            </span>
        </button>
    );
}

export default function AtraccionShortlistPage({ token }) {
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const { isLight } = useModuleTheme();
    const card = isLight
        ? 'rounded-xl border border-slate-200 bg-white p-6 shadow-sm'
        : 'rounded-xl border border-slate-700/60 bg-[#0b1f2a]/80 p-6 shadow-lg';
    const muted = isLight ? 'text-slate-600' : 'text-slate-400';

    const [health, setHealth] = useState(null);
    const [integraciones, setIntegraciones] = useState([]);
    const [vacantes, setVacantes] = useState([]);
    const [statsMap, setStatsMap] = useState({});
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState('');
    const [okMsg, setOkMsg] = useState('');
    const [modalVacante, setModalVacante] = useState(null);
    const [modalTab, setModalTab] = useState('detalle');

    useEffect(() => {
        const flash = location.state?.flash;
        if (!flash) return undefined;
        setOkMsg(String(flash));
        const id = setTimeout(() => setOkMsg(''), 8000);
        return () => clearTimeout(id);
    }, [location.state?.flash]);

    async function loadStats() {
        try {
            const stats = await fetchVacantesStats(token);
            const map = {};
            for (const s of stats) map[s.vacante_id] = s;
            setStatsMap(map);
        } catch {
            /* los contadores son informativos: si fallan, se muestran en 0 */
        }
    }

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [h, v, integ] = await Promise.all([
                    fetchAtraccionHealth(token),
                    fetchVacantes(token),
                    fetchIntegraciones(token)
                ]);
                if (!cancelled) {
                    setHealth(h);
                    setVacantes(v);
                    setIntegraciones(integ);
                    setLoaded(true);
                }
                await loadStats();
            } catch (e) {
                if (!cancelled) setError(e.message || 'Error al cargar módulo');
            }
        })();
        return () => { cancelled = true; };
    }, [token]);

    useEffect(() => {
        if (!loaded) return;
        const wanted = searchParams.get('vacante');
        if (!wanted) return;
        const match = vacantes.find((v) => String(v.id) === String(wanted));
        const tab = searchParams.get('tab');
        const allowedTab = tab === 'candidatos' || tab === 'seguimiento' ? tab : 'detalle';
        if (match) {
            setModalVacante(match);
            setModalTab(allowedTab);
        }
        const next = new URLSearchParams(searchParams);
        next.delete('vacante');
        next.delete('tab');
        setSearchParams(next, { replace: true });
    }, [loaded, searchParams, vacantes, setSearchParams]);

    function upsertVacante(updated) {
        setVacantes((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
        setModalVacante((prev) => (prev?.id === updated.id ? updated : prev));
    }

    function handleVacanteArchived(archived) {
        setVacantes((prev) => prev.filter((v) => v.id !== archived.id));
    }

    const activas = useMemo(
        () => vacantes.filter((v) => v.estado !== 'archivada'),
        [vacantes]
    );

    return (
        <main className={ATRACCION_PAGE_MAIN}>
            <div className={card}>
                <h2 className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Shortlist de vacantes
                </h2>
                <p className={`mt-1 text-sm ${muted}`}>
                    Cada tarjeta muestra el avance de contacto. Ábrela para revisar candidatos, seguimiento y prescreening.
                </p>
                {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
                {okMsg ? <p className="mt-3 text-sm text-emerald-600">{okMsg}</p> : null}

                {!loaded ? (
                    <p className={`mt-4 text-sm ${muted}`}>Cargando…</p>
                ) : activas.length === 0 ? (
                    <p className={`mt-4 text-sm ${muted}`}>
                        Aún no hay vacantes. Crea una desde la pestaña Vacante.
                    </p>
                ) : (
                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {activas.map((v) => (
                            <VacanteCard
                                key={v.id}
                                vacante={v}
                                stats={statsMap[v.id]}
                                isLight={isLight}
                                onOpen={(v) => {
                                    setModalTab('detalle');
                                    setModalVacante(v);
                                }}
                            />
                        ))}
                    </div>
                )}
            </div>

            {modalVacante ? (
                <AtraccionVacanteModal
                    vacante={modalVacante}
                    token={token}
                    health={health}
                    integraciones={integraciones}
                    initialTab={modalTab}
                    onClose={() => setModalVacante(null)}
                    onVacanteUpdated={upsertVacante}
                    onVacanteArchived={handleVacanteArchived}
                    onDataChanged={loadStats}
                />
            ) : null}
        </main>
    );
}
