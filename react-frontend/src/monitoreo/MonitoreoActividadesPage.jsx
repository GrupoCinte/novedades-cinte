import { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, ChevronDown, Filter, UserRound } from 'lucide-react';
import { useModuleTheme } from '../moduleTheme.js';
import { fetchMonitoreoActividades } from './monitoreoActividadesApi.js';
import { groupActividadesByCliente } from './monitoreoActividadesGrouping.js';

function formatDateTime(value) {
    if (!value) return 'En curso';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Sin fecha';
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' }).format(date);
}

function formatDuration(inicio, fin) {
    if (!inicio || !fin) return 'En curso';
    const milliseconds = new Date(fin).getTime() - new Date(inicio).getTime();
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return 'Sin duración';
    const minutes = Math.round(milliseconds / 60000);
    const hours = Math.floor(minutes / 60);
    return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}

function renderEstado(estado) {
    const s = String(estado || '').toLowerCase();
    if (s === 'aprobado') return <span className="font-medium text-emerald-600">🟢 Aprobado</span>;
    if (s === 'rechazado') return <span className="font-medium text-rose-600">🔴 Rechazado</span>;
    return <span className="font-medium text-amber-500">🟡 Pendiente</span>;
}

export default function MonitoreoActividadesPage() {
    const { cardPanel, field, isLight, primaryBtn, sectionSubtitle, sectionTitle } = useModuleTheme();
    const [filters, setFilters] = useState({ fechaDesde: '', fechaHasta: '', cedula: '' });
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadActivities = async (nextFilters = filters) => {
        setLoading(true);
        setError('');
        try {
            setItems(await fetchMonitoreoActividades(nextFilters));
        } catch (loadError) {
            setItems([]);
            setError(loadError.message || 'No fue posible cargar las actividades.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void loadActivities({ fechaDesde: '', fechaHasta: '', cedula: '' }); }, []);

    const groups = useMemo(() => groupActividadesByCliente(items), [items]);
    const consultantOptions = useMemo(() => {
        const seen = new Map();
        for (const item of items) {
            const cedula = String(item?.cedula || '').trim();
            if (cedula) seen.set(cedula, String(item?.consultor_nombre || cedula).trim() || cedula);
        }
        return [...seen.entries()].map(([cedula, nombre]) => ({ cedula, nombre }));
    }, [items]);
    const submitFilters = (event) => { event.preventDefault(); void loadActivities(); };
    const clearFilters = () => {
        const empty = { fechaDesde: '', fechaHasta: '', cedula: '' };
        setFilters(empty);
        void loadActivities(empty);
    };

    return (
        <section className="w-full space-y-4">
            <header><h1 className={sectionTitle}>Monitoreo de actividades</h1><p className={`mt-1 ${sectionSubtitle}`}>Consulta de solo lectura agrupada por cliente y consultor.</p></header>
            <form className={`grid w-full gap-3 md:grid-cols-[1fr_1fr_1.3fr_auto_auto] ${cardPanel}`} onSubmit={submitFilters}>
                <label className="flex flex-col gap-1 text-xs font-semibold">Desde<input type="date" className={field} value={filters.fechaDesde} onChange={(event) => setFilters((current) => ({ ...current, fechaDesde: event.target.value }))} /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold">Hasta<input type="date" className={field} value={filters.fechaHasta} onChange={(event) => setFilters((current) => ({ ...current, fechaHasta: event.target.value }))} /></label>
                <label className="flex flex-col gap-1 text-xs font-semibold">Consultor<select className={field} value={filters.cedula} onChange={(event) => setFilters((current) => ({ ...current, cedula: event.target.value }))}><option value="">Todos los consultores</option>{consultantOptions.map(({ cedula, nombre }) => <option key={cedula} value={cedula}>{nombre} · {cedula}</option>)}</select></label>
                <button type="submit" className={`${primaryBtn} self-end`}><Filter size={16} /> Filtrar</button>
                <button type="button" className={`self-end rounded-lg border px-4 py-2 text-sm font-semibold ${isLight ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-[#1a3a56] text-slate-200 hover:bg-[#0f2942]'}`} onClick={clearFilters}>Limpiar</button>
            </form>
            {loading ? <div className={`w-full ${cardPanel} text-sm`}>Cargando actividades…</div> : null}
            {!loading && error ? <div className={`w-full ${cardPanel} border-rose-400/50 text-sm text-rose-600`}>{error}</div> : null}
            {!loading && !error && groups.length === 0 ? <div className={`flex w-full flex-col items-center gap-3 py-12 text-center ${cardPanel}`}><Activity size={30} className="text-[#65BCF7]" /><div><h2 className="font-heading text-lg font-bold">No hay actividades para los filtros seleccionados</h2><p className={`mt-1 text-sm ${sectionSubtitle}`}>Prueba con otro rango de fechas o consultor.</p></div></div> : null}
            {!loading && !error ? groups.map(({ cliente, consultores }) => <section key={cliente} className={`w-full ${cardPanel}`}><div className="mb-5 flex items-center gap-3"><CalendarDays size={24} className="text-[#65BCF7]" /><h2 className="font-heading text-xl font-extrabold tracking-wide uppercase text-[#65BCF7]">{cliente}</h2><span className="rounded-full bg-[#65BCF7]/10 px-3 py-1 text-xs font-bold text-[#65BCF7]">{consultores.length} consultor(es)</span></div><div className="space-y-3">{consultores.map((consultor) => <div key={`${cliente}-${consultor.cedula}`} className={`rounded-lg border ${isLight ? 'border-slate-200 bg-slate-50' : 'border-[#1a3a56] bg-[#04141E]/45'}`}><div className="flex items-center gap-2 px-4 py-3"><UserRound size={16} className="text-[#65BCF7]" /><div><p className="text-sm font-bold">{consultor.nombre}</p><p className="text-xs opacity-70">{consultor.cedula}</p></div></div><div className={`border-t ${isLight ? 'border-slate-200' : 'border-[#1a3a56]'}`}>{consultor.actividades.map((actividad) => <details key={actividad.id} className={`group border-b px-4 py-3 last:border-b-0 ${isLight ? 'border-slate-200' : 'border-[#1a3a56]'}`}><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate font-semibold">{actividad.descripcion}</span><span className="flex shrink-0 items-center gap-1 text-xs font-medium text-[#65BCF7] opacity-90 transition-opacity hover:opacity-100">Ver detalle <ChevronDown size={16} className="transition-transform group-open:rotate-180" /></span></summary><dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 rounded bg-black/5 p-3 dark:bg-white/5"><div><dt className="text-xs font-semibold opacity-60 uppercase tracking-wider mb-1">Inicio</dt><dd>{formatDateTime(actividad.inicio)}</dd></div><div><dt className="text-xs font-semibold opacity-60 uppercase tracking-wider mb-1">Fin</dt><dd>{formatDateTime(actividad.fin)}</dd></div><div><dt className="text-xs font-semibold opacity-60 uppercase tracking-wider mb-1">Duración</dt><dd>{formatDuration(actividad.inicio, actividad.fin)}</dd></div><div><dt className="text-xs font-semibold opacity-60 uppercase tracking-wider mb-1">Origen</dt><dd className="capitalize">{actividad.origen || 'Sin origen'}</dd></div><div><dt className="text-xs font-semibold opacity-60 uppercase tracking-wider mb-1">Estado</dt><dd>{renderEstado(actividad.estado)}</dd></div></dl></details>)}</div></div>)}</div></section>) : null}
        </section>
    );
}
