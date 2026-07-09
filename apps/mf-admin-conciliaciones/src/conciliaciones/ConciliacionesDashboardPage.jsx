import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';
import { nativeCalendarOnlyInputProps } from '../nativeCalendarOnlyInputProps.js';
import ConciliacionesPageHeader from './components/ConciliacionesPageHeader.jsx';
import { CONCILIACIONES_PAGE_MAIN, conciliacionesErrorBannerClass } from './conciliacionesLayout.js';
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
    const { isLight, headingAccent, labelMuted, field } = mt;

    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);

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
        <div className={CONCILIACIONES_PAGE_MAIN}>
            <ConciliacionesPageHeader
                isLight={isLight}
                icon={LayoutDashboard}
                title="Dashboard de conciliaciones"
                description="Vista consolidada por cliente para el mes seleccionado (tarifas, deducciones por novedades aprobadas y facturación neta). Abre el resumen detallado por colaborador desde la tabla."
            >
                <label className="flex w-full max-w-xs flex-col gap-1.5">
                    <span className={`${dash.labelFilter} whitespace-nowrap`}>Mes</span>
                    <input
                        {...nativeCalendarOnlyInputProps}
                        type="month"
                        className={`${field} cinte-month-picker`}
                        value={monthValue}
                        onChange={(e) => setMonthValue(e.target.value)}
                    />
                </label>
            </ConciliacionesPageHeader>

            {error ? (
                <div className={conciliacionesErrorBannerClass(isLight)}>{error}</div>
            ) : null}

            {loading ? <p className={`text-sm ${labelMuted}`}>Cargando indicadores…</p> : null}

            {!loading && !error && !gt ? (
                <p className={`rounded-xl border px-4 py-3 text-sm ${isLight ? 'border-slate-200 bg-white text-slate-700' : 'border-slate-700 bg-[#1e293b] text-slate-300'}`}>
                    No hay datos de conciliación para el mes seleccionado. Prueba otro mes o revisa que existan novedades aprobadas en ese periodo.
                </p>
            ) : null}

            {!loading && gt ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                        { label: 'Clientes en alcance', value: String(payload?.clientesCount ?? 0) },
                        { label: 'Suma tarifas', value: formatCop(gt.tarifaSum) },
                        { label: 'Deducciones (aprobadas)', value: formatCop(gt.deduccionSum) },
                        { label: 'Total facturación neta', value: formatCop(gt.facturaSum) }
                    ].map(({ label, value }) => (
                        <div key={label} className={`${dash.card} p-4`}>
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
                <div className={`${dash.cardFlex} overflow-hidden`}>
                    <h2 className={`border-b px-4 py-3 font-heading text-sm font-bold ${dash.titleLg} ${dash.gestionHead}`}>Detalle por cliente</h2>
                    <div className={dash.tableWrap}>
                        <table className="w-full min-w-[640px] text-left text-sm">
                            <thead className={dash.thead}>
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
                                    <tr key={r.cliente} className={dash.trHover}>
                                        <td className={dash.tdName}>{r.cliente}</td>
                                        <td className={`${dash.tdCell} tabular-nums`}>{r.totales?.colaboradores ?? 0}</td>
                                        <td className={`${dash.tdCell} tabular-nums`}>{r.totales?.conNovedad ?? 0}</td>
                                        <td className={`${dash.tdCell} tabular-nums`}>{formatCop(r.totales?.tarifaSum)}</td>
                                        <td className={`${dash.tdCell} tabular-nums`}>{formatCop(r.totales?.deduccionSum)}</td>
                                        <td className={`${dash.tdCell} tabular-nums font-semibold`}>{formatCop(r.totales?.facturaSum)}</td>
                                        <td className={`${dash.tdCell} text-right`}>
                                            <button
                                                type="button"
                                                className={dash.actionBtn}
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
