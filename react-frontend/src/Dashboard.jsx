import React, { useEffect, useMemo, useState } from 'react';
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid, BarChart, Bar
} from 'recharts';
import {
  Check, X, Download, Eye, LayoutDashboard, Calendar as CalIcon, TrendingUp, Briefcase,
  BadgeCheck, DollarSign, Users, Activity, Loader2, ChevronLeft, ChevronRight, Code2, Shield
} from 'lucide-react';
import ChatWidget from './ChatWidget'; // si no lo tienes, comenta esta línea y el bloque de <ChatWidget />

/* ================================================================
   1) Constantes de Tabs y utilidades de sesión
================================================================ */
const TAB_HOME      = 'Inicio';
const TAB_ANALYTICS = 'Análisis Avanzado';
const TAB_CALENDAR  = 'Calendario';
const TAB_GESTION   = 'Gestión';

function readAuth() {
  try { return JSON.parse(localStorage.getItem('cinteAuth') || 'null'); }
  catch { return null; }
}
function userPanels() {
  const auth = readAuth();
  return auth?.user?.panels || auth?.claims?.panels || [];
}
function userRole() {
  const auth = readAuth();
  return auth?.user?.role || auth?.claims?.role || '';
}
function userCanApprove() {
  // Si quieres restringir más, ajusta esta lista
  return ['admin_ch','admin_ops','gp','team_ch'].includes(userRole());
}
function normalizeEstado(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v.includes('pend')) return 'Pendiente';
  if (v.includes('aprob')) return 'Aprobado';
  if (v.includes('rech')) return 'Rechazado';
  return raw || '—';
}

/* ================================================================
   2) Componente principal
================================================================ */
export default function Dashboard({ token }) {
  /* ---- Auth headers para TODAS las peticiones ---- */
  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : undefined),
    [token]
  );

  /* ---- Estado base ---- */
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stateError, setStateError] = useState(null);
  const [changingState, setChangingState] = useState({}); // { [id]: boolean }
  const [soporteModal, setSoporteModal] = useState(null);

  // Filtros (Inicio)
  const [fMes, setFMes] = useState('');
  const [fDia, setFDia] = useState('');
  const [fTipoInicio, setFTipoInicio] = useState('');

  // Filtros (Gestión)
  const [fTipo, setFTipo] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [fCorreo, setFCorreo] = useState('');

  // Calendario
  const [currentMonth, setCurrentMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDayItems, setSelectedDayItems] = useState(null);

  /* ---- Carga de datos (respetando scope en el backend) ---- */
  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/api/novedades', { headers });
      const json = await res.json();
      const list = Array.isArray(json)
        ? json
        : (Array.isArray(json.items) ? json.items : (Array.isArray(json.data) ? json.data : []));
      setItems(list.map(it => ({ ...it, estado: normalizeEstado(it.estado) })));
    } catch (e) {
      console.error('[loadData] error:', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [token]);

  /* ---- Acciones de Gestión ---- */
  async function changeState(idRaw, nuevoEstadoRaw) {
    setStateError(null);
    const id = idRaw;
    const nuevoEstado = normalizeEstado(nuevoEstadoRaw);
    setChangingState(prev => ({ ...prev, [id]: true }));

    async function tryActualizarEstado() {
      const res = await fetch('/api/actualizar-estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ id, nuevoEstado })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || data?.message || `Error ${res.status}`);
      }
    }
    async function tryFallbackREST() {
      const approve = nuevoEstado === 'Aprobado';
      const path = approve ? `/api/novedades/${encodeURIComponent(id)}/approve`
                           : `/api/novedades/${encodeURIComponent(id)}/reject`;
      const res = await fetch(path, { method: 'POST', headers: (token ? { Authorization: `Bearer ${token}` } : {}) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || data?.message || `Error ${res.status}`);
      }
    }

    try {
      try { await tryActualizarEstado(); }
      catch { await tryFallbackREST(); }
      await loadData();
    } catch (err) {
      console.error('[changeState] error:', err);
      setStateError(String(err?.message || err));
    } finally {
      setChangingState(prev => ({ ...prev, [id]: false }));
    }
  }

  /* ---- Cálculos de Inicio ---- */
  const getItemDate = (it) => (it?.fechaInicio ? new Date(it.fechaInicio + 'T00:00:00') : new Date(it?.creadoEn));
  const dashItems = items.filter(it => {
    const d = getItemDate(it);
    if (!isNaN(d.getTime())) {
      if (fMes !== '' && d.getMonth() !== Number(fMes)) return false;
      if (fDia !== '' && d.getDate() !== Number(fDia)) return false;
    }
    if (fTipoInicio !== '' && (it?.tipoNovedad || '') !== fTipoInicio) return false;
    return true;
  });

  const availableDays = fMes !== ''
    ? Array.from(new Set(
        items.map(it => getItemDate(it))
             .filter(d => !isNaN(d.getTime()) && d.getMonth() === Number(fMes))
             .map(d => d.getDate())
      )).sort((a, b) => a - b)
    : Array.from({ length: 31 }, (_, i) => i + 1);

  const empMap = dashItems.reduce((acc, it) => { acc[it?.nombre] = (acc[it?.nombre] || 0) + 1; return acc; }, {});
  const topEmpleados = Object.keys(empMap).map(k => ({ nombre: k, count: empMap[k] }))
    .sort((a, b) => b.count - a.count).slice(0, 5);

  const typeDataMap = dashItems.reduce((acc, it) => {
    const tipo = it?.tipoNovedad || 'Otro';
    acc[tipo] = (acc[tipo] || 0) + 1;
    return acc;
  }, {});
  const typeData = Object.keys(typeDataMap).map(k => ({ name: k, value: typeDataMap[k] }));
  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const currentYear = new Date().getFullYear();
  const countByMonth = Array(12).fill(0);
  dashItems.forEach(it => {
    const d = getItemDate(it);
    if (!isNaN(d.getTime()) && d.getFullYear() === currentYear) {
      countByMonth[d.getMonth()]++;
    }
  });
  const nowMonth = new Date().getMonth();
  const areaData = MESES.map((mes, i) => ({
    mes,
    real: i <= nowMonth ? countByMonth[i] : null,
    ia: Math.round(countByMonth[i] * 1.15 + (i > nowMonth ? (i - nowMonth) * 1.5 : 0))
  }));

  const sparkData = items.length > 0
    ? items.map((_, i) => ({ val: i + (Math.random() * 5) }))
    : Array.from({ length: 10 }).map(() => ({ val: Math.random() * 10 }));

  // Gestión table filters
  const filteredItems = items.filter(it => {
    if (fTipo && it?.tipoNovedad !== fTipo) return false;
    if (fEstado && normalizeEstado(it?.estado) !== normalizeEstado(fEstado)) return false;
    if (fCorreo && !String(it?.correoSolicitante || '').toLowerCase().includes(fCorreo.toLowerCase())) return false;
    return true;
  }).reverse();

  const pendientesCount = items.filter(i => normalizeEstado(i?.estado) === 'Pendiente').length;
  const impactoEst = (dashItems.length * 45000).toLocaleString('es-CO');

  /* ---- Calendario ---- */
  const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(new Date(year, month, i));

  const itemsByDate = items.reduce((acc, it) => {
    const dStr = it?.fechaInicio ? it.fechaInicio : new Date(it?.creadoEn).toISOString().slice(0, 10);
    if (!acc[dStr]) acc[dStr] = [];
    acc[dStr].push(it);
    return acc;
  }, {});
  const getTypeColor = (tipo) => {
    if (!tipo) return 'text-slate-400 bg-slate-400/20 border-slate-400/50';
    const t = String(tipo).toLowerCase();
    if (t.includes('incapacidad')) return 'text-rose-400 bg-rose-500/20 border-rose-500/50';
    if (t.includes('vacacion')) return 'text-amber-400 bg-amber-500/20 border-amber-500/50';
    if (t.includes('permiso')) return 'text-blue-400 bg-blue-500/20 border-blue-500/50';
    if (t.includes('extra')) return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/50';
    if (t.includes('licencia')) return 'text-purple-400 bg-purple-500/20 border-purple-500/50';
    return 'text-slate-400 bg-slate-400/20 border-slate-400/50';
  };

  /* ---- Export CSV (Gestión) ---- */
  const exportCSV = () => {
    if (filteredItems.length === 0) return;
    const headers = ["Fecha Creación","Nombre","Cédula","Correo","Tipo Novedad","Fecha Inicio","Fecha Fin","Horas","Turno","Estado"];
    const rows = filteredItems.map(it => [
      new Date(it?.creadoEn).toLocaleString('es-ES'),
      it?.nombre,
      it?.cedula,
      it?.correoSolicitante || '',
      it?.tipoNovedad,
      it?.fechaInicio || '',
      it?.fechaFin || '',
      it?.cantidadHoras || '0',
      it?.tipoHoraExtra || 'N/A',
      normalizeEstado(it?.estado)
    ]);
    const csvContent = [headers.join(","), ...rows.map(row => row.map(v => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `novedades_reporte_${new Date().toISOString().slice(0,10)}.csv`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* ================================================================
     3) Sidebar: tabs PERMITIDOS por panels del token
  ================================================================ */
  const panels = userPanels();
  const allowedTabs = useMemo(() => {
    const tabs = [];
    if (panels.includes('dashboard')) tabs.push(TAB_HOME, TAB_ANALYTICS);
    if (panels.includes('calendar'))  tabs.push(TAB_CALENDAR);
    if (panels.includes('gestion'))   tabs.push(TAB_GESTION);
    if (tabs.length === 0) tabs.push(TAB_HOME);
    return tabs;
  }, [JSON.stringify(panels)]);

  const [activeTab, setActiveTab] = useState(allowedTabs[0] || TAB_HOME);
  useEffect(() => {
    if (!allowedTabs.includes(activeTab)) {
      setActiveTab(allowedTabs[0] || TAB_HOME);
    }
  }, [allowedTabs, activeTab]);

  /* ---- NoAccessCard ---- */
  const NoAccessCard = (
    <div className="p-6 text-[#9fb3c8]">
      <div className="bg-[#0f2437] border border-[#21405f] rounded-xl p-8 flex items-center gap-3">
        <Shield className="text-[#ffb020]" />
        <div>
          <div className="text-white font-semibold">Acceso restringido</div>
          <div className="text-sm">Tu rol no tiene acceso a este panel.</div>
        </div>
      </div>
    </div>
  );

  /* ---- Sidebar ---- */
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navItems = allowedTabs.map(tab => ({
    id: tab,
    icon:
      tab === TAB_HOME      ? LayoutDashboard :
      tab === TAB_ANALYTICS ? TrendingUp      :
      tab === TAB_CALENDAR  ? CalIcon         :
                              Briefcase,
    label: tab
  }));

  /* ================================================================
     4) Render
  ================================================================ */
  return (
    <div className="flex h-full w-full bg-[#0f172a] text-slate-200 overflow-hidden font-sans">
      {/* SIDEBAR */}
      <aside
        className={`
          bg-[#1e293b] flex-shrink-0 flex-col hidden md:flex h-full shadow-2xl relative z-10
          transition-all duration-300 ease-in-out overflow-hidden
          ${sidebarOpen ? 'w-64' : 'w-16'}
        `}
      >
        <div className={`border-b border-slate-700/50 flex items-center ${sidebarOpen ? 'px-5 py-4 justify-between' : 'px-0 py-4 justify-center'}`}>
          {sidebarOpen && (
            <div className="overflow-hidden">
              <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest whitespace-nowrap leading-tight">
                Sistema Análisis
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap leading-tight">
                Novedades CINTE
              </p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(o => !o)}
            title={sidebarOpen ? 'Colapsar menú' : 'Expandir menú'}
            className="flex items-center justify-center w-7 h-7 rounded-lg bg-slate-800 hover:bg-blue-600/20 border border-slate-700 hover:border-blue-500/50 text-slate-400 hover:text-blue-400 transition-all flex-shrink-0"
          >
            {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>

        <nav className="flex flex-col gap-1 p-2 flex-1 mt-1">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={!sidebarOpen ? item.label : undefined}
                className={`
                  flex items-center gap-3 rounded-xl transition-all font-medium text-sm text-left
                  ${sidebarOpen ? 'px-4 py-3' : 'px-0 py-3 justify-center'}
                  ${active ? 'bg-blue-600 shadow-[0_4px_12px_rgba(59,130,246,0.3)] text-white'
                           : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}
                `}
              >
                <Icon size={18} className={`flex-shrink-0 ${active ? 'text-white' : 'text-slate-500'}`} />
                {sidebarOpen && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className={`border-t border-slate-700/50 ${sidebarOpen ? 'p-4' : 'p-2'}`}>
          {sidebarOpen ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                  <Code2 size={13} className="text-blue-400" />
                </div>
                <div className="overflow-hidden">
                  <p className="text-[10px] font-black text-slate-300 whitespace-nowrap leading-tight">Equipo IA · CINTE</p>
                  <p className="text-[9px] text-blue-400 font-semibold whitespace-nowrap leading-tight">Arquitectura de Datos</p>
                </div>
              </div>
              <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest text-center border-t border-slate-700/50 pt-2">
                Consultores Grupo CINTE · V1.0
              </p>
            </div>
          ) : (
            <div className="flex justify-center" title="Equipo IA · CINTE">
              <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                <Code2 size={13} className="text-blue-400" />
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN */}
      <main className="flex-1 overflow-y-auto p-6 md:p-10 relative scroll-smooth bg-[#0f172a]">

        {/* ===== INICIO ===== */}
        {activeTab === TAB_HOME && (
          userPanels().includes('dashboard') ? (
            <div className="flex flex-col gap-6 animate-in fade-in duration-300">
              {/* Filtros */}
              <div className="flex flex-col gap-3 bg-[#1e293b] border border-slate-700/50 rounded-2xl px-5 py-4 shadow-lg">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <CalIcon size={16} className="text-blue-400" />
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Filtrar por período</span>
                  </div>
                  <div className="flex-1 h-px bg-slate-700/50" />

                  {/* Mes */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider whitespace-nowrap">Mes</label>
                    <select value={fMes} onChange={e => { setFMes(e.target.value); setFDia(''); }}
                      className="bg-slate-800 border border-slate-600 text-sm text-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer">
                      <option value="">Todos los meses</option>
                      {['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
                        .map((m, i) => <option key={i} value={String(i)}>{m}</option>)}
                    </select>
                  </div>

                  {/* Día */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider whitespace-nowrap">Día</label>
                    <select value={fDia} onChange={e => setFDia(e.target.value)}
                      className="bg-slate-800 border border-slate-600 text-sm text-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer">
                      <option value="">Todos los días</option>
                      {availableDays.map(d => <option key={d} value={String(d)}>{d}</option>)}
                    </select>
                  </div>

                  {/* Limpiar */}
                  {(fMes !== '' || fDia !== '' || fTipoInicio !== '') && (
                    <button onClick={() => { setFMes(''); setFDia(''); setFTipoInicio(''); }}
                      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/50 px-3 py-1.5 rounded-lg transition-all bg-slate-800 hover:bg-rose-500/10">
                      <X size={12} /> Limpiar filtros
                    </button>
                  )}

                  {/* Badge resultado */}
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-slate-500">Mostrando</span>
                    <span className="text-sm font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-full">
                      {dashItems.length} de {items.length} registros
                    </span>
                  </div>
                </div>

                {/* Chips tipo */}
                <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-700/40">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">Tipo:</span>
                  {[
                    { label: 'Todos', value: '', cls: 'border-slate-600 text-slate-300 bg-slate-800', activeCls: 'bg-slate-600 border-slate-400 text-white' },
                    { label: 'Incapacidad', value: 'Incapacidad', cls: 'border-rose-500/30 text-rose-400 bg-rose-500/10', activeCls: 'bg-rose-500 border-rose-400 text-white' },
                    { label: 'Vacaciones',  value: 'Vacaciones',  cls: 'border-amber-500/30 text-amber-400 bg-amber-500/10', activeCls: 'bg-amber-500 border-amber-400 text-white' },
                    { label: 'Permiso',     value: 'Permiso',     cls: 'border-blue-500/30 text-blue-400 bg-blue-500/10', activeCls: 'bg-blue-600 border-blue-400 text-white' },
                    { label: 'Hora extra',  value: 'Hora extra',  cls: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10', activeCls: 'bg-emerald-600 border-emerald-400 text-white' },
                    { label: 'Licencia',    value: 'Licencia',    cls: 'border-purple-500/30 text-purple-400 bg-purple-500/10', activeCls: 'bg-purple-600 border-purple-400 text-white' },
                  ].map(chip => {
                    const isActive = fTipoInicio === chip.value;
                    return (
                      <button
                        key={chip.value}
                        onClick={() => setFTipoInicio(chip.value)}
                        className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${
                          isActive ? chip.activeCls : chip.cls + ' hover:opacity-80'
                        }`}
                      >
                        {chip.label}
                        {chip.value !== '' && (
                          <span className="ml-1.5 opacity-70 font-normal">
                            ({items.filter(i => i?.tipoNovedad === chip.value).length})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#1e293b] rounded-2xl p-6 border border-slate-700/50 shadow-lg relative overflow-hidden group">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-slate-400 text-sm font-medium">Total Novedades</p>
                      <h3 className="text-3xl font-bold text-white mt-1">{dashItems.length}</h3>
                      {dashItems.length !== items.length && (
                        <p className="text-[10px] text-blue-400 mt-0.5">de {items.length} totales</p>
                      )}
                    </div>
                    <div className="bg-blue-500/10 p-2.5 rounded-lg border border-blue-500/20">
                      <Activity size={20} className="text-blue-500" />
                    </div>
                  </div>
                  <div className="h-10 mt-4 -mx-2 opacity-70 group-hover:opacity-100 transition-opacity">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={sparkData}>
                        <Line type="monotone" dataKey="val" stroke="#3b82f6" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-[#1e293b] rounded-2xl p-6 border border-emerald-500/30 shadow-lg relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-10 -mt-10 blur-2xl" />
                  <div className="flex justify-between items-start relative">
                    <div>
                      <p className="text-slate-400 text-sm font-medium">Impacto Financiero Est.</p>
                      <h3 className="text-3xl font-bold text-emerald-400 mt-1">${impactoEst}</h3>
                    </div>
                    <div className="bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                      <DollarSign size={20} className="text-emerald-500" />
                    </div>
                  </div>
                  <p className="text-xs text-emerald-500/80 mt-4 relative">Proyección optimizada por IA</p>
                </div>

                <div className="bg-[#1e293b] rounded-2xl p-6 border border-slate-700/50 shadow-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-slate-400 text-sm font-medium">Alertas Pendientes</p>
                      <h3 className="text-3xl font-bold text-rose-500 mt-1">{pendientesCount}</h3>
                    </div>
                    <div className="bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                      <Users size={20} className="text-rose-500" />
                    </div>
                  </div>
                  <div className="flex mt-4 -space-x-2">
                    {Array.from({ length: Math.min(pendientesCount, 4) }).map((_, i) => (
                      <div key={i} className="w-8 h-8 rounded-full bg-slate-600 border-2 border-[#1e293b] flex items-center justify-center text-[10px] font-bold text-slate-300">
                        {String.fromCharCode(65 + i)}
                      </div>
                    ))}
                    {pendientesCount > 4 && (
                      <div className="w-8 h-8 rounded-full bg-slate-700 border-2 border-[#1e293b] flex items-center justify-center text-[10px] text-slate-300">
                        +{pendientesCount - 4}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Tendencia */}
              <div className="bg-[#1e293b] rounded-2xl p-6 md:p-8 border border-slate-700/50 shadow-lg">
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      Monitor de Tendencia <BadgeCheck className="text-blue-500" size={18} />
                    </h2>
                    <p className="text-sm text-slate-400 mt-1">Comparativa Real vs. Predicción IA Semestral</p>
                  </div>
                </div>
                <div className="h-72 w-full">
                  <ResponsiveContainer>
                    <AreaChart data={areaData}>
                      <defs>
                        <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                      <XAxis dataKey="mes" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }} />
                      <Area type="monotone" dataKey="real" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorReal)" activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey="ia" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Inferior */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-20">
                <div className="bg-[#1e293b] rounded-2xl p-6 border border-slate-700/50 shadow-lg">
                  <h2 className="text-lg font-bold text-white mb-6">Distribución por Tipología</h2>
                  <div className="h-64 w-full">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie data={typeData} innerRadius={70} outerRadius={95} paddingAngle={2} dataKey="value" stroke="none">
                          {typeData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }} itemStyle={{ color: '#fff' }} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '13px', paddingTop: '20px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-[#1e293b] rounded-2xl p-6 border border-slate-700/50 shadow-lg">
                  <h2 className="text-lg font-bold text-white mb-6">Top 5 Empleados</h2>
                  <div className="flex flex-col gap-4">
                    {topEmpleados.length === 0 ? (
                      <p className="text-center text-slate-400 mt-10">Generando analíticas...</p>
                    ) : topEmpleados.map((emp, i) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-700">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-blue-400">
                            {emp?.nombre?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                          <div>
                            <p className="text-slate-200 font-medium">{emp?.nombre}</p>
                            <p className="text-slate-500 text-xs">Aproximación mensual</p>
                          </div>
                        </div>
                        <div className="bg-slate-800 px-3 py-1 rounded-lg text-slate-300 font-bold border border-slate-700">
                          {emp?.count} reg.
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : NoAccessCard
        )}

        {/* ===== GESTIÓN ===== */}
        {activeTab === TAB_GESTION && (
          userPanels().includes('gestion') ? (
            <div className="animate-in fade-in slide-in-from-right-8 duration-300 pb-20 flex flex-col h-full">
              {stateError && (
                <div className="mb-4 flex items-center gap-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-3 rounded-xl text-sm font-medium">
                  <X size={16} className="flex-shrink-0" />
                  <span>{stateError}</span>
                  <button onClick={() => setStateError(null)} className="ml-auto text-rose-400 hover:text-rose-300"><X size={14} /></button>
                </div>
              )}

              <div className="bg-[#1e293b] border border-slate-700/50 rounded-2xl shadow-lg flex flex-col flex-1 overflow-hidden">
                <div className="p-6 border-b border-slate-700/50 bg-[#1e293b] sticky top-0 z-20">
                  <h2 className="text-xl font-bold text-white mb-4">Gestión Operativa de Novedades</h2>
                  <div className="flex flex-wrap gap-3 items-center">
                    <select onChange={e => setFTipo(e.target.value)} value={fTipo} className="bg-slate-800 border border-slate-600 text-sm text-slate-200 px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                      <option value="">Todos los tipos</option>
                      {Object.keys(typeDataMap).map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                    <select onChange={e => setFEstado(e.target.value)} value={fEstado} className="bg-slate-800 border border-slate-600 text-sm text-slate-200 px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                      <option value="">Todos los estados</option>
                      <option value="Pendiente">Pendientes</option>
                      <option value="Aprobado">Aprobados</option>
                      <option value="Rechazado">Rechazados</option>
                    </select>
                    <input type="text" placeholder="Buscar correo..." value={fCorreo} onChange={(e) => setFCorreo(e.target.value)}
                      className="bg-slate-800 border border-slate-600 text-sm text-slate-200 px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-500 min-w-[180px]" />
                    <div className="flex-1" />
                    <button onClick={exportCSV} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm transition-all flex items-center gap-2 shadow-sm font-medium">
                      <Download size={16} /> Exportar Reporte CSV
                    </button>
                  </div>
                </div>

                <div className="w-full overflow-x-auto overflow-y-auto flex-1 bg-[#0f172a]/50">
                  <table className="w-full text-left border-collapse whitespace-nowrap min-w-[800px]">
                    <thead>
                      <tr className="bg-[#1e293b] text-slate-400 text-xs uppercase tracking-wider sticky top-0 z-10 shadow-sm border-b border-slate-700/50">
                        <th className="p-4 pl-6 font-semibold">Creado</th>
                        <th className="p-4 font-semibold">Nombre</th>
                        <th className="p-4 font-semibold">Tipo</th>
                        <th className="p-4 font-semibold">F. Inicio</th>
                        <th className="p-4 font-semibold text-center">Horas</th>
                        <th className="p-4 font-semibold">Estado</th>
                        <th className="p-4 pr-6 font-semibold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50 text-sm">
                      {loading ? (
                        <tr><td colSpan="7" className="p-12 text-center text-slate-500 font-medium">Cargando base de datos...</td></tr>
                      ) : filteredItems.length === 0 ? (
                        <tr><td colSpan="7" className="p-12 text-center text-slate-500 font-medium">No se encontraron registros.</td></tr>
                      ) : (
                        filteredItems.map(it => {
                          const cread = new Date(it?.creadoEn);
                          const validCread = isNaN(cread.getTime()) ? '-' : cread.toLocaleDateString('es-ES');
                          const rowId = it?.id ?? it?.creadoEn;
                          const canApprove = userCanApprove() && userPanels().includes('gestion') && normalizeEstado(it?.estado) === 'Pendiente';

                          return (
                            <tr key={rowId} className="hover:bg-slate-800/80 transition-colors">
                              <td className="p-4 pl-6 text-slate-400">{validCread}</td>
                              <td className="p-4 font-semibold text-slate-200">{it?.nombre}</td>
                              <td className="p-4 text-slate-400">
                                <span className="bg-slate-800 px-2 py-1 rounded text-xs border border-slate-700">{it?.tipoNovedad}</span>
                              </td>
                              <td className="p-4 text-slate-300">{it?.fechaInicio || '-'}</td>
                              <td className="p-4 text-slate-400 text-center">{it?.cantidadHoras || 0}h</td>
                              <td className="p-4">
                                <span className={`inline-flex px-2 py-1 rounded-md text-[11px] font-bold border uppercase tracking-wider ${
                                  normalizeEstado(it?.estado) === 'Aprobado'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : normalizeEstado(it?.estado) === 'Rechazado'
                                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                }`}>
                                  {normalizeEstado(it?.estado)}
                                </span>
                              </td>
                              <td className="p-4 pr-6">
                                <div className="flex gap-2 justify-end items-center">
                                  {it?.soporteRuta && (
                                    <div className="flex items-center gap-1.5 mr-2">
                                      <span title="Documento validado por IA" className="text-blue-500 animate-pulse"><BadgeCheck size={16} /></span>
                                      <button
                                        onClick={() => setSoporteModal(it?.soporteRuta)}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-blue-600/20 text-slate-300 hover:text-blue-400 border border-slate-700 hover:border-blue-500/50 rounded-lg transition-all shadow-sm text-xs font-medium"
                                      >
                                        <Eye size={14} /> Ver
                                      </button>
                                    </div>
                                  )}

                                  {canApprove ? (
                                    changingState[rowId] ? (
                                      <div className="w-7 h-7 flex items-center justify-center text-slate-400">
                                        <Loader2 size={16} className="animate-spin" />
                                      </div>
                                    ) : (
                                      <>
                                        <button
                                          onClick={() => changeState(rowId, 'Aprobado')}
                                          className="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-emerald-500/20 text-emerald-500 border border-slate-700 hover:border-emerald-500/50 rounded-lg transition-all"
                                          title="Aprobar Solicitud"
                                        >
                                          <Check size={16} strokeWidth={3} />
                                        </button>
                                        <button
                                          onClick={() => changeState(rowId, 'Rechazado')}
                                          className="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-rose-500/20 text-rose-500 border border-slate-700 hover:border-rose-500/50 rounded-lg transition-all"
                                          title="Rechazar Solicitud"
                                        >
                                          <X size={16} strokeWidth={3} />
                                        </button>
                                      </>
                                    )
                                  ) : (
                                    <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest px-2">Acción no disponible</span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : NoAccessCard
        )}

        {/* ===== CALENDARIO ===== */}
        {activeTab === TAB_CALENDAR && (
          userPanels().includes('calendar') ? (
            <div className="animate-in fade-in zoom-in-95 duration-300 pb-20 flex flex-col h-full bg-[#1e293b] rounded-2xl border border-slate-700/50 shadow-lg overflow-hidden">
              <div className="p-6 border-b border-slate-700/50 flex justify-between items-center sticky top-0 bg-[#1e293b] z-10">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <CalIcon className="text-blue-500" size={22} /> Agenda Operativa
                  </h2>
                  <p className="text-sm text-slate-400 mt-1">Vista interactiva mensual de las novedades del talento</p>
                </div>
                <div className="flex gap-4 items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                    className="px-3 py-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-all text-sm font-medium">&larr; Ant.</button>
                  <span className="text-slate-200 font-bold min-w-[120px] text-center capitalize">
                    {currentMonth.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
                  </span>
                  <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                    className="px-3 py-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-all text-sm font-medium">Sig. &rarr;</button>
                </div>
              </div>

              <div className="flex-1 p-6 overflow-auto">
                <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden bg-slate-700/50 border border-slate-700/50 h-full min-h-[500px]">
                  {['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'].map(day => (
                    <div key={day} className="bg-[#1e293b] text-center py-2 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-700/50">
                      {day}
                    </div>
                  ))}

                  {calendarDays.map((dateObj, i) => {
                    if (!dateObj) return <div key={`empty-${i}`} className="bg-[#1e293b]/50 min-h-[100px]" />;

                    const dayDateStr = dateObj.toISOString().slice(0, 10);
                    const dayItems = itemsByDate[dayDateStr] || [];
                    const isToday = new Date().toISOString().slice(0,10) === dayDateStr;

                    return (
                      <div
                        key={dayDateStr}
                        onClick={() => dayItems.length > 0 && setSelectedDayItems({ date: dateObj, items: dayItems })}
                        className={`bg-[#1e293b] min-h-[100px] p-2 flex flex-col gap-1 transition-colors border-b border-r border-slate-700/50 last:border-r-0 ${
                          dayItems.length > 0 ? 'cursor-pointer hover:bg-slate-800' : ''
                        } ${isToday ? 'bg-blue-900/10' : ''}`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold ${
                            isToday ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'text-slate-400'
                          }`}>
                            {dateObj.getDate()}
                          </span>
                          {dayItems.length > 0 && (
                            <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold border border-slate-700">
                              {dayItems.length} reg.
                            </span>
                          )}
                        </div>

                        <div className="flex flex-col gap-1 overflow-y-auto overflow-x-hidden max-h-[80px] custom-scrollbar">
                          {dayItems.slice(0, 4).map((it, idx) => (
                            <div key={idx} className={`text-[10px] leading-tight px-1.5 py-1 rounded truncate border ${getTypeColor(it?.tipoNovedad)}`}>
                              {String(it?.nombre || '').split(' ')[0]} - {it?.tipoNovedad}
                            </div>
                          ))}
                          {dayItems.length > 4 && (
                            <div className="text-[10px] text-center text-slate-500 font-bold mt-0.5">
                              + {dayItems.length - 4} más
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Leyenda */}
                <div className="mt-6 flex flex-wrap gap-4 items-center justify-center text-xs text-slate-400">
                  <span className="font-bold uppercase tracking-widest mr-2 text-slate-500">Leyenda:</span>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-rose-500/20 border border-rose-500/50" /> Incapacidad</div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-500/20 border border-amber-500/50" /> Vacaciones</div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-500/20 border border-blue-500/50" /> Permiso</div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500/20 border border-emerald-500/50" /> Horas Extra</div>
                  <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-purple-500/20 border border-purple-500/50" /> Licencia</div>
                </div>
              </div>
            </div>
          ) : NoAccessCard
        )}

        {/* ===== ANÁLISIS AVANZADO ===== */}
        {activeTab === TAB_ANALYTICS && (
          userPanels().includes('dashboard') ? (
            <div className="animate-in fade-in zoom-in-95 duration-300 pb-20 flex flex-col h-full gap-6">
              <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-700/50 shadow-lg">
                <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                  <TrendingUp className="text-purple-500" size={24} /> Inteligencia Operativa (Pre-IA)
                </h2>
                <p className="text-slate-400 text-sm">Modelos descriptivos diseñados para futura integración con ML.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Heatmap por día */}
                <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-700/50 shadow-lg">
                  <h3 className="text-xl font-bold text-white mb-1">Mapa de Frecuencia (Días de la Semana)</h3>
                  <p className="text-xs text-slate-400 mb-5">
                    Distribución de novedades por día de inicio/creación (más oscuro = mayor concentración).
                  </p>
                  <div className="h-64 w-full">
                    <ResponsiveContainer>
                      <BarChart data={(() => {
                        const dName = {0:'Dom',1:'Lun',2:'Mar',3:'Mié',4:'Jue',5:'Vie',6:'Sáb'};
                        const base = { Dom:0, Lun:0, Mar:0, Mié:0, Jue:0, Vie:0, Sáb:0 };
                        (Array.isArray(items) ? items : []).forEach(it => {
                          const d = it?.fechaInicio ? new Date(it.fechaInicio) : new Date(it?.creadoEn);
                          if (!isNaN(d?.getTime?.())) base[dName[d.getDay()]] += 1;
                        });
                        return Object.keys(base).map(k => ({ name: k, count: base[k] }));
                      })()} barCategoryGap="25%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                        <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip
                          cursor={{ fill: '#334155', opacity: 0.15 }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const { name, count } = payload[0].payload;
                            const total = items?.length || 1;
                            const pct = ((count / total) * 100).toFixed(1);
                            return (
                              <div className="bg-[#0f172a] border border-slate-600 rounded-xl px-4 py-3 shadow-xl text-sm">
                                <p className="font-bold text-white mb-1">{name} — {count} novedades</p>
                                <p className="text-slate-400 text-xs">{pct}% del total</p>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                          {(() => {
                            const data = (() => {
                              const dName = {0:'Dom',1:'Lun',2:'Mar',3:'Mié',4:'Jue',5:'Vie',6:'Sáb'};
                              const base = { Dom:0, Lun:0, Mar:0, Mié:0, Jue:0, Vie:0, Sáb:0 };
                              (Array.isArray(items) ? items : []).forEach(it => {
                                const d = it?.fechaInicio ? new Date(it.fechaInicio) : new Date(it?.creadoEn);
                                if (!isNaN(d?.getTime?.())) base[dName[d.getDay()]] += 1;
                              });
                              return Object.keys(base).map(k => ({ name: k, count: base[k] }));
                            })();
                            const maxCount = Math.max(...data.map(d => d.count), 1);
                            return data.map((entry, index) => {
                              const intensity = (entry.count || 0) / maxCount;
                              return <Cell key={`cell-${index}`} fill={`rgba(139, 92, 246, ${Math.max(0.25, intensity)})`} />;
                            });
                          })()}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[10px] text-slate-600 mt-3 text-center italic">
                    Base para modelo predictivo de ausentismo por día — Grupo CINTE IA
                  </p>
                </div>

                {/* Índice de riesgo */}
                <div className="bg-[#1e293b] p-6 rounded-2xl border border-rose-500/20 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-rose-500/5 rounded-full -mr-20 -mt-20 blur-3xl" />
                  <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                    <Activity className="text-rose-500" size={20} /> Riesgo Operativo (Burnout / Atipicidad)
                  </h3>
                  <p className="text-xs text-slate-400 mb-5">Puntaje: Incapacidad (+5), Hora extra (+3), otros (+1).</p>
                  <div className="space-y-3 overflow-y-auto max-h-[240px] pr-1">
                    {(() => {
                      const map = {};
                      (Array.isArray(items) ? items : []).forEach(it => {
                        const n = it?.nombre || '—';
                        const tipo = String(it?.tipoNovedad || '').toLowerCase();
                        if (!map[n]) map[n] = { puntos: 0, horas: 0, novedades: 0 };
                        map[n].novedades += 1;
                        map[n].horas += Number(it?.cantidadHoras) || 0;
                        if (tipo.includes('incapacidad')) map[n].puntos += 5;
                        else if (tipo.includes('hora extra')) map[n].puntos += 3;
                        else map[n].puntos += 1;
                      });
                      const ranking = Object.keys(map).map(k => ({ nombre: k, ...map[k] }))
                        .sort((a, b) => b.puntos - a.puntos)
                        .slice(0, 5);
                      if (ranking.length === 0) return <p className="text-slate-400 text-center">Datos insuficientes para evaluación.</p>;
                      return ranking.map((r, i) => {
                        const isAlto = r.puntos >= 10;
                        const isMedio = r.puntos >= 5;
                        const badgeCls = isAlto ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                      : isMedio ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                                : 'bg-blue-500/20 text-blue-400 border-blue-500/30';
                        const riskCard = isAlto ? 'text-rose-400 border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10'
                                     : isMedio ? 'text-amber-400 border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10'
                                               : 'text-blue-400 border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10';
                        const label = isAlto ? 'Riesgo Alto' : isMedio ? 'Riesgo Medio' : 'Riesgo Base';
                        return (
                          <div key={i} className={`group flex items-center justify-between p-3 rounded-xl border transition-all cursor-default ${riskCard}`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs border ${badgeCls}`}>{i+1}</div>
                              <div>
                                <p className="text-slate-200 font-bold text-sm leading-tight">{r.nombre}</p>
                                <p className="text-slate-500 text-xs">{r.novedades} novedades · {r.horas}h</p>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className={`text-[10px] uppercase tracking-widest font-black px-2 py-0.5 rounded border ${badgeCls}`}>{label}</span>
                              <span className="text-[10px] text-slate-600 font-semibold">{r.puntos} pts</span>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Funnel */}
                <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-700/50 shadow-lg lg:col-span-2">
                  <h3 className="text-xl font-bold text-white mb-1">Eficiencia del Flujo de Trabajo (Funnel)</h3>
                  <p className="text-xs text-slate-400 mb-5">Compara volumen total radicado vs. pendientes y resueltos.</p>
                  <div className="h-44 w-full">
                    <ResponsiveContainer>
                      <BarChart data={(() => {
                        const total = items?.length || 0;
                        const pend = (items || []).filter(i => normalizeEstado(i?.estado) === 'Pendiente').length;
                        return [
                          { name: 'Total Radicados',  count: total,            fill: '#3b82f6' },
                          { name: 'Esperando Acción', count: pend,             fill: '#f59e0b' },
                          { name: 'Decisión Cerrada', count: Math.max(total - pend, 0), fill: '#10b981' },
                        ];
                      })()} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} horizontal={false} />
                        <XAxis type="number" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} width={130} />
                        <Tooltip cursor={{ fill: '#334155', opacity: 0.15 }} />
                        <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                          {[{ color: '#3b82f6' }, { color: '#f59e0b' }, { color: '#10b981' }].map((e, i) => <Cell key={i} fill={e.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          ) : NoAccessCard
        )}
      </main>

      {/* Chat Widget (opcional) */}
      <ChatWidget ctx={{ pendientesCount, totalItems: items.length, dashItems: dashItems.length }} />

      {/* Modal Día (Calendario) */}
      {selectedDayItems && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/90 backdrop-blur tracking-wide p-4 animate-in fade-in duration-200" onClick={() => setSelectedDayItems(null)}>
          <div className="relative bg-[#1e293b] border border-slate-700 rounded-2xl w-full max-w-3xl md:max-h-[85vh] flex flex-col p-6 shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6 border-b border-slate-700/50 pb-4">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  <CalIcon className="text-blue-500" size={24} /> Novedades del Día
                </h2>
                <p className="text-slate-400 mt-1 uppercase text-sm font-semibold tracking-widest">
                  {selectedDayItems.date.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <button onClick={() => setSelectedDayItems(null)} className="bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 border border-slate-700 hover:border-rose-500/50 rounded-lg transition-all w-10 h-10 flex items-center justify-center">
                <X size={20} strokeWidth={2.5} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
              {selectedDayItems.items.map((it, idx) => (
                <div key={idx} className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${getTypeColor(it?.tipoNovedad).replace('bg-', 'bg-').replace('/20', '/10')}`}>
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg border ${getTypeColor(it?.tipoNovedad).replace('bg-', 'border-').replace('/20', '/30')}`}>
                      {it?.nombre?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                    <div>
                      <h3 className="text-white font-bold">{it?.nombre}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-300 bg-black/20 px-2 py-0.5 rounded font-medium border border-black/10">{it?.tipoNovedad}</span>
                        <span className="text-xs text-slate-400 flex items-center gap-1"><Briefcase size={12} /> Cédula: {it?.cedula}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col md:items-end gap-1 bg-black/20 p-3 rounded-lg border border-black/10">
                    <div className="text-sm text-slate-300 font-medium">
                      {it?.fechaInicio ? `Del ${it?.fechaInicio}` : ''} {it?.fechaFin ? `al ${it?.fechaFin}` : ''}
                      {!it?.fechaInicio && !it?.fechaFin ? 'Fecha no especificada' : ''}
                    </div>
                    <div className="flex items-center gap-2">
                      {Number(it?.cantidadHoras) > 0 && (
                        <span className="text-xs text-blue-400 font-bold">
                          {it?.cantidadHoras}h {it?.tipoHoraExtra ? `(${it?.tipoHoraExtra})` : ''}
                        </span>
                      )}
                      <span className={`text-[10px] uppercase tracking-widest font-black px-1.5 py-0.5 rounded ${
                        normalizeEstado(it?.estado) === 'Aprobado' ? 'text-emerald-400 bg-emerald-500/10'
                          : normalizeEstado(it?.estado) === 'Rechazado' ? 'text-rose-400 bg-rose-500/10'
                          : 'text-amber-400 bg-amber-500/10'
                      }`}>
                        {normalizeEstado(it?.estado)}
                      </span>
                    </div>
                  </div>

                  {it?.soporteRuta && (
                    <button
                      onClick={() => { setSelectedDayItems(null); setSoporteModal(it?.soporteRuta); }}
                      className="md:ml-2 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 px-3 py-2 rounded-lg transition-all flex items-center justify-center gap-2 text-sm font-medium"
                    >
                      <Eye size={16} /> Ver Soporte
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Soporte */}
      {soporteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/90 backdrop-blur tracking-wide p-4 animate-in fade-in duration-200" onClick={() => setSoporteModal(null)}>
          <div className="relative bg-[#1e293b] border border-slate-700 rounded-2xl w-full max-w-5xl md:max-h-[90vh] flex flex-col items-center justify-center p-6 shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
            <button onClick={() => setSoporteModal(null)} className="absolute top-4 right-4 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 border border-slate-700 hover:border-rose-500/50 rounded-lg transition-all w-10 h-10 flex items-center justify-center">
              <X size={20} strokeWidth={2.5} />
            </button>
            <div className="w-full flex items-center justify-between mb-4 mt-2">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <BadgeCheck className="text-blue-500" size={22} /> Documento Analizado por IA
              </h2>
            </div>
            <div className="w-full flex-1 md:minh-[60vh] rounded-xl overflow-hidden border border-slate-700 bg-black/40 p-1 relative">
              {String(soporteModal).toLowerCase().endsWith('.pdf') ? (
                <iframe src={`http://localhost:3005${soporteModal}`} className="w-full h-[65vh] rounded" title="Visor PDF" />
              ) : (
                <img src={`http://localhost:3005${soporteModal}`} alt="Soporte" className="w-full h-[65vh] object-contain rounded" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
