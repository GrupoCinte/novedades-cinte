import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useModuleTheme } from '../moduleTheme.js';
import { fetchConciliacionesDashboardResumen } from './conciliacionesApi.js';

function currentMonthValue() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function parseMonthValue(v) {
    const s = String(v || '').trim();
    const m = /^(\d{4})-(\d{2})$/.exec(s);
    if (!m) return { year: null, month: null };
    return { year: Number(m[1]), month: Number(m[2]) };
}

function formatCop(n) {
    const x = Number(n) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}

function shortCliente(label) {
    const s = String(label || '').trim();
    if (s.length <= 14) return s;
    return `${s.slice(0, 12)}…`;
}

export default function ConciliacionesDashboardPage({ token }) {
    const navigate = useNavigate();
    const mt = useModuleTheme();
    const { isLight, topBar, headingAccent, labelMuted, field, subPanel, mainCanvas, tableSurface, tableThead, tableRowBorder } = mt;

    const dash = useMemo(() => {
        const L = isLight;
        const card = L
            ? 'rounded-2xl border border-slate-200 bg-white shadow-md'
            : 'rounded-2xl border border-slate-700/50 bg-[#0b1e30] shadow-lg';
        return { card };
    }, [isLight]);

    const [monthValue, setMonthValue] = useState(currentMonthValue);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [payload, setPayload] = useState(null);

    const ym = useMemo(() => parseMonthValue(monthValue), [monthValue]);

    const load = useCallback(async () => {
        if (!ym.year || !ym.month) return;
        setLoading(true);
        setError('');
        try {
            const data = await fetchConciliacionesDashboardResumen(token, { year: ym.year, month: ym.month });
            setPayload(data);
        } catch (e) {
            setError(e.message || 'No se pudo cargar el dashboard');
            setPayload(null);
        } finally {
            setLoading(false);
        }
    }, [token, ym.year, ym.month]);

    useEffect(() => {
        load();
    }, [load]);

    const chartData = useMemo(() => {
        const rows = payload?.rows || [];
        return [...rows]
            .map((r) => ({
                cliente: shortCliente(r.cliente),
                clienteFull: r.cliente,
                factura: Number(r.totales?.facturaSum) || 0,
                deduccion: Number(r.totales?.deduccionSum) || 0
            }))
            .sort((a, b) => b.factura - a.factura || b.deduccion - a.deduccion)
            .slice(0, 16);
    }, [payload]);

    const gt = payload?.globalTotales;

    return (
        <div className={`min-h-0 flex-1 space-y-5 p-4 sm:p-6 ${mainCanvas}`}>
            <header className={`${topBar} px-4 py-4 sm:px-6`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h1 className={`font-heading text-xl font-extrabold tracking-tight sm:text-2xl ${headingAccent}`}>
                            Dashboard de conciliaciones
                        </h1>
                        <p className={`mt-1 max-w-2xl text-sm ${labelMuted}`}>
                            Vista consolidada por cliente para el mes seleccionado (tarifas, deducciones por novedades aprobadas y
                            facturación neta). Abre el resumen detallado por colaborador desde la tabla.
                        </p>
                    </div>
                    <label className="flex w-full max-w-xs flex-col gap-1.5">
                        <span className={`text-[10px] font-heading font-bold uppercase tracking-wider ${labelMuted}`}>Mes</span>
                        <input type="month" className={field} value={monthValue} onChange={(e) => setMonthValue(e.target.value)} />
                    </label>
                </div>
            </header>

            {error ? (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{error}</div>
            ) : null}

            {loading ? <p className={`text-sm ${labelMuted}`}>Cargando indicadores…</p> : null}

            {!loading && gt ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                        { label: 'Clientes en alcance', value: String(payload?.clientesCount ?? 0) },
                        { label: 'Suma tarifas', value: formatCop(gt.tarifaSum) },
                        { label: 'Deducciones (aprobadas)', value: formatCop(gt.deduccionSum) },
                        { label: 'Total facturación neta', value: formatCop(gt.facturaSum) }
                    ].map(({ label, value }) => (
                        <div key={label} className={`${dash.card} ${subPanel} p-4`}>
                            <p className={`text-[10px] font-heading font-bold uppercase tracking-wider ${labelMuted}`}>{label}</p>
                            <p className={`mt-2 font-heading text-lg font-extrabold sm:text-xl ${headingAccent}`}>{value}</p>
                        </div>
                    ))}
                </div>
            ) : null}

            {!loading && chartData.length > 0 ? (
                <div className={`${dash.card} p-4 sm:p-5`}>
                    <h2 className={`mb-4 font-heading text-sm font-bold ${headingAccent}`}>Facturación neta por cliente</h2>
                    <div className="h-[min(360px,50vh)] w-full min-h-[240px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={isLight ? '#e2e8f0' : '#1a3a56'} />
                                <XAxis dataKey="cliente" tick={{ fill: isLight ? '#475569' : '#94a3b8', fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                                <YAxis tick={{ fill: isLight ? '#475569' : '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1_000_000)}M`} />
                                <Tooltip
                                    formatter={(value) => formatCop(value)}
                                    labelFormatter={(_, pl) => (Array.isArray(pl) && pl[0]?.payload?.clienteFull ? String(pl[0].payload.clienteFull) : '')}
                                    contentStyle={
                                        isLight
                                            ? { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }
                                            : { background: '#0b1e30', border: '1px solid #1a3a56', borderRadius: 8, color: '#e2e8f0' }
                                    }
                                />
                                <Bar dataKey="factura" name="Factura neta" fill="#65BCF7" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            ) : null}

            {!loading && payload?.rows?.length ? (
                <div className={`${dash.card} overflow-hidden`}>
                    <h2 className={`border-b px-4 py-3 font-heading text-sm font-bold ${headingAccent} ${tableRowBorder}`}>Detalle por cliente</h2>
                    <div className={`overflow-x-auto ${tableSurface}`}>
                        <table className="w-full min-w-[640px] text-left text-sm">
                            <thead className={tableThead}>
                                <tr>
                                    <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">Cliente</th>
                                    <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">Colaboradores</th>
                                    <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">Con novedad</th>
                                    <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">Tarifas</th>
                                    <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">Deducción</th>
                                    <th className="px-3 py-2 font-heading text-[10px] font-bold uppercase tracking-wide">Factura</th>
                                    <th className="px-3 py-2" />
                                </tr>
                            </thead>
                            <tbody>
                                {payload.rows.map((r) => (
                                    <tr key={r.cliente} className={`border-t ${tableRowBorder}`}>
                                        <td className={`px-3 py-2 font-medium ${headingAccent}`}>{r.cliente}</td>
                                        <td className="px-3 py-2 tabular-nums">{r.totales?.colaboradores ?? 0}</td>
                                        <td className="px-3 py-2 tabular-nums">{r.totales?.conNovedad ?? 0}</td>
                                        <td className="px-3 py-2 tabular-nums">{formatCop(r.totales?.tarifaSum)}</td>
                                        <td className="px-3 py-2 tabular-nums">{formatCop(r.totales?.deduccionSum)}</td>
                                        <td className={`px-3 py-2 tabular-nums font-semibold ${headingAccent}`}>{formatCop(r.totales?.facturaSum)}</td>
                                        <td className="px-3 py-2 text-right">
                                            <button
                                                type="button"
                                                className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-2 py-1 text-xs font-semibold text-[#65BCF7] hover:bg-sky-500/20"
                                                onClick={() =>
                                                    navigate(`/admin/conciliaciones/resumen?cliente=${encodeURIComponent(r.cliente)}`)
                                                }
                                            >
                                                Resumen
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : !loading && !error ? (
                <p className={`text-sm ${labelMuted}`}>No hay clientes en alcance para este usuario o no hay datos para el mes.</p>
            ) : null}
        </div>
    );
}
