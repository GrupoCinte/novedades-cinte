import { useState } from 'react';
import { FileText, Layers, Send, XCircle } from 'lucide-react';
import { useModuleTheme } from '../moduleTheme.js';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

export default function CotizadorDashboard({ dashboard, onSelectCotizacion, onFilterChange, onNavigateWithFilters }) {
    const { cardPanel, subPanel, panelTitle, labelMuted, isLight, field } = useModuleTheme();
    const top = Array.isArray(dashboard?.top_cargos) ? dashboard.top_cargos : [];
    const ultimas = Array.isArray(dashboard?.ultimas) ? dashboard.ultimas : [];
    const clientes_disponibles = Array.isArray(dashboard?.clientes_disponibles) ? dashboard.clientes_disponibles : [];
    
    const [filtroCliente, setFiltroCliente] = useState('');

    const statValue = isLight ? 'text-2xl font-black font-heading text-slate-900' : 'text-2xl font-black font-heading text-white';
    const blockTitle = isLight ? 'text-slate-700 font-subtitle font-semibold mb-2' : 'text-slate-300 font-subtitle font-semibold mb-2';
    const listText = isLight ? 'text-sm text-slate-700 space-y-1' : 'text-sm text-slate-300 space-y-1';
    const iconTile = isLight
        ? 'flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-[#088DC6]'
        : 'flex h-10 w-10 items-center justify-center rounded-lg bg-[#088DC6]/15 text-[#65BCF7]';

    const kpis = [
        { label: 'Cotizaciones', value: dashboard?.total_cot || 0, icon: FileText },
        { label: 'Perfiles cotizados', value: dashboard?.total_perfiles || 0, icon: Layers },
        { label: 'Cotizaciones enviadas', value: dashboard?.estado_stats?.enviadas || 0, icon: Send },
        { label: 'Cotizaciones rechazadas', value: dashboard?.estado_stats?.rechazadas || 0, icon: XCircle }
    ];

    // Data for charts
    const tendenciaData = Array.isArray(dashboard?.tendencia) 
        ? dashboard.tendencia.map(([fecha, count]) => ({ name: fecha, cantidad: count }))
        : [];

    const comercialData = Object.entries(dashboard?.por_comercial_count || {})
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    const PIE_COLORS = isLight ? ['#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd'] : ['#088DC6', '#38bdf8', '#7dd3fc', '#bae6fd', '#e0f2fe'];
    const tooltipStyle = {
        backgroundColor: isLight ? '#fff' : '#0b1e30',
        borderColor: isLight ? '#e2e8f0' : '#1a3a56',
        color: isLight ? '#334155' : '#f8fafc',
        borderRadius: '8px',
        fontSize: '12px'
    };

    return (
        <div className="space-y-4">
            {/* Header / Filters */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
                <h2 className={isLight ? "text-xl font-heading font-bold text-slate-800" : "text-xl font-heading font-bold text-slate-200"}>
                    Vista General
                </h2>
                {clientes_disponibles.length > 0 && (
                    <select
                        className={`${field} w-full sm:w-64`}
                        value={filtroCliente}
                        onChange={(e) => {
                            setFiltroCliente(e.target.value);
                            if (onFilterChange) onFilterChange(e.target.value);
                        }}
                    >
                        <option value="">Todos los clientes</option>
                        {clientes_disponibles.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                )}
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {kpis.map(({ label, value, icon: Icon }) => (
                    <div 
                        key={label} 
                        className={`${cardPanel} flex items-center gap-3 ${onNavigateWithFilters ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                        onClick={() => {
                            if (!onNavigateWithFilters) return;
                            if (label === 'Cotizaciones enviadas') onNavigateWithFilters('cotizaciones', { estado: 'Enviada', cliente: filtroCliente });
                            else if (label === 'Cotizaciones rechazadas') onNavigateWithFilters('cotizaciones', { estado: 'Rechazada', cliente: filtroCliente });
                            else onNavigateWithFilters('cotizaciones', { cliente: filtroCliente });
                        }}
                    >
                        <div className={iconTile}>
                            <Icon size={20} />
                        </div>
                        <div className="min-w-0">
                            <p className={`text-xs ${labelMuted} truncate`}>{label}</p>
                            <p className={statValue}>{value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className={`${cardPanel} flex flex-col`}>
                    <h3 className={`${panelTitle} mb-4`}>Tendencia de cotizaciones</h3>
                    <div className="flex-1 min-h-[250px]">
                        {tendenciaData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={tendenciaData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isLight ? '#e2e8f0' : '#1e3a5f'} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: isLight ? '#64748b' : '#94a3b8' }} dy={10} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: isLight ? '#64748b' : '#94a3b8' }} />
                                    <Tooltip 
                                        contentStyle={tooltipStyle} 
                                        itemStyle={{ color: tooltipStyle.color }}
                                        labelStyle={{ color: tooltipStyle.color }}
                                        cursor={{ fill: isLight ? '#f1f5f9' : '#0f2942' }} 
                                    />
                                    <Bar 
                                        dataKey="cantidad" 
                                        name="Cotizaciones" 
                                        fill="#088DC6" 
                                        radius={[4, 4, 0, 0]} 
                                        maxBarSize={50} 
                                        cursor="pointer"
                                        onClick={(data) => {
                                            if (onNavigateWithFilters && data && data.name) {
                                                const [yyyy, mm] = data.name.split('-');
                                                if (yyyy && mm) {
                                                    const fDesde = `${yyyy}-${mm}-01`;
                                                    const ultimoDia = new Date(Number(yyyy), Number(mm), 0).getDate();
                                                    const fHasta = `${yyyy}-${mm}-${ultimoDia.toString().padStart(2, '0')}`;
                                                    onNavigateWithFilters('cotizaciones', { fechaDesde: fDesde, fechaHasta: fHasta, cliente: filtroCliente });
                                                }
                                            }
                                        }}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className={`h-full flex items-center justify-center ${labelMuted}`}>Sin datos suficientes</div>
                        )}
                    </div>
                </div>

                <div className={`${cardPanel} flex flex-col`}>
                    <h3 className={`${panelTitle} mb-4`}>Cotizaciones por Comercial</h3>
                    <div className="flex-1 min-h-[250px]">
                        {comercialData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                    <Pie
                                        data={comercialData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {comercialData.map((entry, index) => (
                                            <Cell 
                                                key={`cell-${index}`} 
                                                fill={PIE_COLORS[index % PIE_COLORS.length]} 
                                                className="cursor-pointer hover:opacity-80 transition-opacity"
                                                onClick={() => {
                                                    if (onNavigateWithFilters && entry && entry.name) {
                                                        const cName = entry.name === 'Sin asignar' ? '' : entry.name;
                                                        onNavigateWithFilters('cotizaciones', { comercial: cName, cliente: filtroCliente });
                                                    }
                                                }}
                                            />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        contentStyle={tooltipStyle} 
                                        itemStyle={{ color: tooltipStyle.color }}
                                        labelStyle={{ color: tooltipStyle.color }}
                                    />
                                    <Legend 
                                        verticalAlign="bottom" 
                                        height={36} 
                                        iconType="circle" 
                                        wrapperStyle={{ fontSize: '12px', color: isLight ? '#334155' : '#cbd5e1' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className={`h-full flex items-center justify-center ${labelMuted}`}>Sin datos suficientes</div>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className={cardPanel}>
                    <h3 className={`${panelTitle} mb-3`}>Top cargos</h3>
                    <ul className={listText}>
                        {top.length === 0 && <li className={labelMuted}>Sin datos aún</li>}
                        {top.map(([cargo, count]) => (
                            <li key={cargo} className={`flex justify-between gap-2 rounded ${subPanel}`}>
                                <span className="truncate">{cargo}</span>
                                <span className="font-bold shrink-0">{count}</span>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className={cardPanel}>
                    <h3 className={`${panelTitle} mb-3`}>Últimas cotizaciones</h3>
                    <ul className={`${listText} max-h-[260px] overflow-auto`}>
                        {ultimas.length === 0 && <li className={labelMuted}>Sin datos aún</li>}
                        {ultimas.map((it) => (
                            <li 
                                key={it.id} 
                                className={`flex justify-between gap-2 rounded ${subPanel} cursor-pointer transition-colors ${isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-700/50'}`}
                                onClick={() => onSelectCotizacion?.(it.id)}
                            >
                                <div className="truncate flex items-center gap-1.5">
                                    <span className="font-semibold text-[13px]">{it.cliente || 'Sin cliente'}</span>
                                    {it.titulo && <span className={`text-[11px] truncate ${labelMuted}`}>— {it.titulo}</span>}
                                </div>
                                <span className={`shrink-0 ${labelMuted}`}>{it.fecha}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}
