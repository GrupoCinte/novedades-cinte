import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  Clock3,
  Building2,
  Plus,
  X,
  History,
  Save,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  Calendar,
  Clock,
  Menu,
  ChevronLeft,
  ChevronRight,
  Home,
  Search,
  FilterX,
  Filter,
  ChevronDown,
  ChevronUp,
  Play,
  Square,
  Trash2
} from 'lucide-react';
import { useModuleTheme } from '../../moduleTheme.js';
import ModuleFiltersToolbar from '../../shared/filters/ModuleFiltersToolbar.jsx';
import ModuleFiltersDrawer from '../../shared/filters/ModuleFiltersDrawer.jsx';
import {
  buildGestionTableDash,
  GESTION_MODULE_PAGE_PADDING,
  GESTION_TOOLBAR_PRIMARY_BTN
} from '../../gestionTableDashTheme.js';
import AdminModuleSidebarBrand from '../../AdminModuleSidebarBrand.jsx';
import AdminModuleSidebarUser from '../../AdminModuleSidebarUser.jsx';
import AdminModuleSidebarFooter from '../../AdminModuleSidebarFooter.jsx';
import {
  fetchConsultorActividadesContext,
  fetchActividadesList,
  createActividadManual
} from './actividadesApi.js';

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTimeInMinutes(value) {
  if (!value || typeof value !== 'string') return 0;
  const [hours, minutes] = value.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function formatIsoToBogotaDate(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    const options = { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' };
    const parts = new Intl.DateTimeFormat('es-CO', options).formatToParts(date);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    return `${y}-${m}-${d}`;
  } catch {
    return String(isoString).slice(0, 10);
  }
}

function formatIsoToBogotaTime(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    const options = { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hour12: false };
    return new Intl.DateTimeFormat('es-CO', options).format(date);
  } catch {
    return '—';
  }
}

function calculateDurationString(inicioIso, finIso) {
  if (!inicioIso || !finIso) return '—';
  try {
    const startMs = new Date(inicioIso).getTime();
    const endMs = new Date(finIso).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return '—';
    const totalMinutes = Math.round((endMs - startMs) / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const minsStr = mins > 0 ? `${mins}m` : '00m';
    return `${hours}h ${minsStr}`;
  } catch {
    return '—';
  }
}

function renderEstadoBadge(estado) {
  const norm = String(estado || 'pendiente').toLowerCase();
  if (norm === 'aprobado') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
        <span>Aprobado</span>
      </span>
    );
  }
  if (norm === 'rechazado') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30">
        <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
        <span>Rechazado</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
      <Clock3 className="h-3.5 w-3.5 shrink-0 text-amber-500" />
      <span>Pendiente</span>
    </span>
  );
}

const navItemClass = (active, navInactive) =>
  `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-body font-semibold transition-all ${
    active
      ? 'bg-[#2F7BB8] shadow-[0_4px_12px_rgba(47,123,184,0.3)] text-white'
      : navInactive
  }`;

const navIconClass = (active, isLight) => {
  if (active) return 'flex-shrink-0 text-white';
  return isLight ? 'flex-shrink-0 text-slate-600' : 'flex-shrink-0 text-slate-500';
};

function ActivityRow({ act, dash }) {
  const fechaStr = formatIsoToBogotaDate(act.inicio);
  const horaInicioStr = formatIsoToBogotaTime(act.inicio);
  const horaFinStr = formatIsoToBogotaTime(act.fin);
  const duracionStr = calculateDurationString(act.inicio, act.fin);

  return (
    <tr className={dash.trHover}>
      <td className={dash.tdDate}>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-slate-400" />
          <span>{fechaStr}</span>
        </div>
      </td>
      <td className={dash.tdName}>
        <span className="inline-flex items-center gap-1.5 rounded-md bg-[#2F7BB8]/15 px-2.5 py-1 text-xs font-semibold text-[#2F7BB8] dark:text-[#a8dcff]">
          <Building2 className="h-3.5 w-3.5" />
          {act.cliente}
        </span>
      </td>
      <td className="p-4 font-mono text-xs">
        {horaInicioStr}
      </td>
      <td className="p-4 font-mono text-xs">
        {horaFinStr}
      </td>
      <td className="p-4 font-semibold text-xs text-sky-600 dark:text-sky-400">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>{duracionStr}</span>
        </div>
      </td>
      <td className={dash.tdCell}>
        {act.descripcion}
      </td>
      <td className="p-4">
        {renderEstadoBadge(act.estado)}
      </td>
    </tr>
  );
}

function MisActividadesSidebar({
  mobileMenuOpen,
  setMobileMenuOpen,
  closeMobile,
  sidebarOpen,
  setSidebarOpen,
  currentEmail,
  currentRoleLabel,
  navigate,
  mt
}) {
  const {
    menuFab,
    scrim,
    aside,
    asideHeaderBorder,
    isLight,
    sidebarIconBtn,
    email,
    borderSubtle,
    navInactive
  } = mt;

  const navItemClassLocal = (active) => navItemClass(active, navInactive);
  const navIconClassLocal = (active) => navIconClass(active, isLight);

  return (
    <>
      {/* Botón flotante móvil */}
      <button
        type="button"
        onClick={() => setMobileMenuOpen(true)}
        className={`md:hidden fixed top-4 left-4 z-40 flex h-10 w-10 items-center justify-center shadow-lg ${menuFab}`}
        aria-label="Abrir menú actividades"
      >
        <Menu size={18} />
      </button>

      {mobileMenuOpen ? (
        <button
          type="button"
          className={`md:hidden fixed inset-0 z-40 ${scrim}`}
          aria-label="Cerrar menú"
          onClick={closeMobile}
        />
      ) : null}

      {/* Sidebar Drawer Móvil */}
      <aside
        className={`md:hidden fixed top-0 left-0 z-50 flex h-full w-72 flex-col transform font-body shadow-2xl transition-transform duration-300 ${aside} ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <AdminModuleSidebarBrand
          variant="drawer"
          isLight={isLight}
          asideHeaderBorder={asideHeaderBorder}
          moduleContext={
            <>
              <p className="text-[10px] font-heading font-black uppercase leading-tight tracking-widest text-[#65BCF7]">
                ACTIVIDADES
              </p>
              <p className="text-[10px] font-body font-bold uppercase leading-tight tracking-widest text-slate-400">
                Mis Actividades
              </p>
            </>
          }
          endAction={
            <button
              type="button"
              onClick={closeMobile}
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center ${sidebarIconBtn}`}
              aria-label="Cerrar menú"
            >
              <X size={16} />
            </button>
          }
        />
        <AdminModuleSidebarUser
          sidebarOpen
          currentEmail={currentEmail}
          currentRoleLabel={currentRoleLabel}
          emailClass={email}
          borderSubtle={borderSubtle}
          isLight={isLight}
        />
        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
          <button
            type="button"
            onClick={() => {
              closeMobile();
              navigate('/consultor');
            }}
            className={navItemClassLocal(false)}
          >
            <Home size={18} className={navIconClassLocal(false)} />
            <span>Volver al portal</span>
          </button>
          <button type="button" className={navItemClassLocal(true)} onClick={closeMobile}>
            <History size={18} className={navIconClassLocal(true)} />
            <span>Historial</span>
          </button>
        </nav>
        <AdminModuleSidebarFooter
          auth={{ user: { email: currentEmail, role: 'consultor' } }}
          onLogout={() => navigate('/consultor')}
          sidebarOpen
          borderSubtle={borderSubtle}
          isLight={isLight}
        />
      </aside>

      {/* Sidebar Escritorio */}
      <aside
        className={`hidden md:flex flex-col shrink-0 font-body transition-all duration-300 ${aside} ${
          sidebarOpen ? 'w-72' : 'w-20'
        }`}
      >
        <AdminModuleSidebarBrand
          variant={sidebarOpen ? 'rail-expanded' : 'rail-collapsed'}
          isLight={isLight}
          asideHeaderBorder={asideHeaderBorder}
          moduleContext={
            sidebarOpen ? (
              <>
                <p className="text-[10px] font-heading font-black uppercase leading-tight tracking-widest text-[#65BCF7]">
                  ACTIVIDADES
                </p>
                <p className="text-[10px] font-body font-bold uppercase leading-tight tracking-widest text-slate-400">
                  Mis Actividades
                </p>
              </>
            ) : null
          }
          endAction={
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center ${sidebarIconBtn}`}
              title={sidebarOpen ? 'Colapsar menú' : 'Expandir menú'}
            >
              {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
            </button>
          }
        />

        <AdminModuleSidebarUser
          sidebarOpen={sidebarOpen}
          currentEmail={currentEmail}
          currentRoleLabel={currentRoleLabel}
          emailClass={email}
          borderSubtle={borderSubtle}
          isLight={isLight}
        />

        {/* Navegación Escritorio (1. Volver al portal, 2. Historial) */}
        <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
          <button
            type="button"
            onClick={() => navigate('/consultor')}
            className={navItemClassLocal(false)}
            title="Volver al portal consultor"
          >
            <Home size={18} className={navIconClassLocal(false)} />
            {sidebarOpen ? <span>Volver al portal</span> : null}
          </button>
          <button
            type="button"
            className={navItemClassLocal(true)}
            title="Historial"
          >
            <History size={18} className={navIconClassLocal(true)} />
            {sidebarOpen ? <span>Historial</span> : null}
          </button>
        </nav>

        <AdminModuleSidebarFooter
          auth={{ user: { email: currentEmail, role: 'consultor' } }}
          onLogout={() => navigate('/consultor')}
          sidebarOpen={sidebarOpen}
          borderSubtle={borderSubtle}
          isLight={isLight}
        />
      </aside>
    </>
  );
}

function ActivityModal({
  isModalOpen,
  handleCloseModal,
  isLight,
  saving,
  handleSubmitForm,
  errorMessage,
  cliente,
  fecha,
  setFecha,
  horaInicio,
  setHoraInicio,
  horaFin,
  setHoraFin,
  fieldErrors,
  descripcion,
  setDescripcion
}) {
  if (!isModalOpen) return null;

  const baseInputClass = isLight
    ? 'border-slate-300 bg-white text-slate-900'
    : 'border-white/15 bg-[#082232] text-white';

  const baseTextareaClass = isLight
    ? 'border-slate-300 bg-white text-slate-900 placeholder:text-slate-400'
    : 'border-white/15 bg-[#082232] text-white placeholder:text-slate-500';

  const horaFinClass = fieldErrors.horaFin
    ? 'border-red-500 focus:ring-red-500'
    : baseInputClass;

  const descClass = fieldErrors.descripcion
    ? 'border-red-500 focus:ring-red-500'
    : baseTextareaClass;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      onClick={handleCloseModal}
      onKeyDown={(e) => {
        if (e.key === 'Escape') handleCloseModal();
      }}
    >
      <div
        role="presentation"
        className={`relative w-full max-w-2xl rounded-2xl border p-6 shadow-2xl backdrop-blur-md sm:p-8 transition-all ${
          isLight
            ? 'border-slate-200 bg-white text-slate-800'
            : 'border-white/15 bg-[#04141E] text-slate-200'
        }`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Header del Modal */}
        <div className="mb-6 flex items-center justify-between border-b pb-4 border-slate-200/60 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl border ${
                isLight
                  ? 'border-sky-200 bg-sky-50 text-sky-700'
                  : 'border-[#65BCF7]/25 bg-[#2F7BB8]/14 text-[#a8dcff]'
              }`}
            >
              <Plus className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h2 className="font-heading text-lg font-extrabold sm:text-xl">
                Agregar actividad
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Carga manual de horas de trabajo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCloseModal}
            disabled={saving}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulario Reutilizado */}
        <form onSubmit={handleSubmitForm} className="space-y-5">
          {errorMessage ? (
            <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-red-700 dark:text-red-300">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
              <p className="text-sm font-semibold">{errorMessage}</p>
            </div>
          ) : null}

          {/* Cliente asignado (Solo lectura) */}
          <div>
            <label htmlFor="cliente-asignado-div" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Cliente asignado (Ficha)
            </label>
            <div
              id="cliente-asignado-div"
              className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm font-semibold ${
                isLight
                  ? 'border-slate-200 bg-slate-100/80 text-slate-800'
                  : 'border-white/10 bg-[#082232] text-slate-200'
              }`}
            >
              <Building2 className="h-4 w-4 text-[#2F7BB8] shrink-0" aria-hidden />
              <span>{cliente || 'Sin cliente asignado'}</span>
              <span className="ml-auto rounded-md bg-[#2F7BB8]/20 px-2 py-0.5 text-xs text-[#2F7BB8] dark:text-[#a8dcff]">
                Solo lectura
              </span>
            </div>
          </div>

          {/* Fila Fecha, Hora Inicio, Hora Fin */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Fecha */}
            <div>
              <label htmlFor="input-fecha" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Fecha <span className="text-red-500">*</span>
              </label>
              <input
                id="input-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                required
                className={`w-full rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${baseInputClass}`}
              />
            </div>

            {/* Hora Inicio */}
            <div>
              <label htmlFor="input-hora-inicio" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Hora Inicio <span className="text-red-500">*</span>
              </label>
              <input
                id="input-hora-inicio"
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                required
                className={`w-full rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${baseInputClass}`}
              />
            </div>

            {/* Hora Fin */}
            <div>
              <label htmlFor="input-hora-fin" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Hora Fin <span className="text-red-500">*</span>
              </label>
              <input
                id="input-hora-fin"
                type="time"
                value={horaFin}
                onChange={(e) => setHoraFin(e.target.value)}
                required
                className={`w-full rounded-xl border px-3.5 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${horaFinClass}`}
              />
              {fieldErrors.horaFin ? (
                <p className="mt-1 text-xs font-medium text-red-500">
                  {fieldErrors.horaFin}
                </p>
              ) : null}
            </div>
          </div>

          {/* Descripción libre */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="input-descripcion" className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Descripción <span className="text-red-500">*</span>
              </label>
              <span className="text-xs text-slate-400">
                {descripcion.length} / 2000
              </span>
            </div>
            <textarea
              id="input-descripcion"
              rows={3}
              maxLength={2000}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder="Describe las actividades desarrolladas..."
              className={`w-full rounded-xl border p-3 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${descClass}`}
            />
            {fieldErrors.descripcion ? (
              <p className="mt-1 text-xs font-medium text-red-500">
                {fieldErrors.descripcion}
              </p>
            ) : null}
          </div>

          {/* Acciones Modal */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-200/60 dark:border-white/10">
            <button
              type="button"
              onClick={handleCloseModal}
              disabled={saving}
              className="rounded-xl border border-slate-300 dark:border-white/15 px-4 py-2 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-white/10"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !cliente}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#2F7BB8] px-5 py-2 text-sm font-semibold text-white transition-all hover:bg-[#25649a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#65BCF7] disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" aria-hidden />
                  <span>Guardar actividad</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}



/**
 * Módulo consultor de Mis Actividades.
 * Reutiliza estrictamente el sistema de tokens y contenedores del Administrador (`buildGestionTableDash`, `GESTION_MODULE_PAGE_PADDING`, `GESTION_TOOLBAR_PRIMARY_BTN`).
 */
export default function MisActividadesModule() {
  const navigate = useNavigate();
  const outletCtx = useOutletContext() || {};
  const me = outletCtx.me || {};

  const mt = useModuleTheme();
  const {
    shell,
    mainCanvas,
    field,
    isLight
  } = mt;

  const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Contexto de la ficha
  const [loadingContext, setLoadingContext] = useState(true);
  const [contextError, setContextError] = useState('');
  const [cliente, setCliente] = useState('');

  // Historial de actividades
  const [actividades, setActividades] = useState([]);
  const [loadingActividades, setLoadingActividades] = useState(true);

  // Estados de Filtros Principales
  const [filterFechaInicio, setFilterFechaInicio] = useState('');
  const [filterFechaFin, setFilterFechaFin] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);

  // Estado del Modal y Formulario HU-2
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fecha, setFecha] = useState(getTodayString);
  const [horaInicio, setHoraInicio] = useState('08:00');
  const [horaFin, setHoraFin] = useState('17:00');
  const [descripcion, setDescripcion] = useState('');

  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const currentEmail = String(me.email || 'consultor@grupocinte.com').toLowerCase();
  const currentRoleLabel = 'CONSULTOR';

  const closeMobile = () => setMobileMenuOpen(false);

  useEffect(() => {
    let mounted = true;
    const fetchInit = async () => {
      setLoadingContext(true);
      setLoadingActividades(true);
      setContextError('');
  
      const [ctxRes, actRes] = await Promise.all([
        fetchConsultorActividadesContext(),
        fetchActividadesList()
      ]);
  
      if (!mounted) return;
  
      setLoadingContext(false);
      setLoadingActividades(false);
  
      if (!ctxRes.ok) {
        setContextError(ctxRes.error || 'No se pudo cargar la información de tu ficha.');
        return;
      }
  
      if (!ctxRes.cliente) {
        setContextError('Debes tener un cliente asignado en tu ficha para poder registrar actividades.');
        return;
      }
  
      setCliente(ctxRes.cliente);
  
      if (actRes.ok) {
        setActividades(actRes.actividades || []);
      }
    };
    fetchInit();
    return () => { mounted = false; };
  }, []);

  const refreshHistory = async () => {
    setLoadingActividades(true);
    const actRes = await fetchActividadesList();
    setLoadingActividades(false);
    if (actRes.ok) {
      setActividades(actRes.actividades || []);
    }
  };

  // Filtrado reactivo en el frontend
  const filteredActividades = useMemo(() => {
    return actividades.filter((act) => {
      const startDayStr = formatIsoToBogotaDate(act.inicio);
      
      if (filterFechaInicio && startDayStr < filterFechaInicio) return false;
      if (filterFechaFin && startDayStr > filterFechaFin) return false;
      
      if (filterSearch.trim() && !String(act.descripcion || '').toLowerCase().includes(filterSearch.trim().toLowerCase())) return false;
      return true;
    });
  }, [actividades, filterFechaInicio, filterFechaFin, filterSearch]);

  // Contador dinámico de filtros activos
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterFechaInicio || filterFechaFin) count++;
    if (filterSearch.trim()) count++;
    return count;
  }, [filterFechaInicio, filterFechaFin, filterSearch]);

  const chipText = useMemo(() => {
    if (activeFilterCount === 0) return 'Sin filtros activos';
    if (activeFilterCount === 1) return '1 filtro activo';
    return `${activeFilterCount} filtros activos`;
  }, [activeFilterCount]);

  const hasActiveFilters = activeFilterCount > 0;

  const handleClearFilters = () => {
    setFilterFechaInicio('');
    setFilterFechaFin('');
    setFilterSearch('');
  };

  const handleOpenModal = () => {
    setErrorMessage('');
    setFieldErrors({});
    setFecha(getTodayString());
    setHoraInicio('08:00');
    setHoraFin('17:00');
    setDescripcion('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    if (saving) return;
    setIsModalOpen(false);
  };

  const handleSubmitForm = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    const errors = {};

    if (!cliente) {
      setErrorMessage('Debes tener un cliente asignado en tu ficha para poder registrar una actividad.');
      return;
    }

    const trimmedDesc = descripcion.trim();
    if (!trimmedDesc) {
      errors.descripcion = 'La descripción es obligatoria.';
    }

    if (getTimeInMinutes(horaFin) <= getTimeInMinutes(horaInicio)) {
      errors.horaFin = 'La hora de fin debe ser mayor que la hora de inicio.';
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSaving(true);

    const res = await createActividadManual({
      descripcion: trimmedDesc,
      fecha,
      horaInicio,
      horaFin
    });

    setSaving(false);

    if (!res.ok) {
      setErrorMessage(res.error || 'No se pudo guardar la actividad.');
      return;
    }

    setIsModalOpen(false);
    setSuccessMessage('Entrada de tiempo registrada con éxito.');
    setTimeout(() => setSuccessMessage(''), 4000);
    await refreshHistory();
  };


  return (
    <div className={shell}>
      <MisActividadesSidebar
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        closeMobile={closeMobile}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        currentEmail={currentEmail}
        currentRoleLabel={currentRoleLabel}
        navigate={navigate}
        mt={mt}
      />

      {/* ÁREA DE CONTENIDO PRINCIPAL (Usa GESTION_MODULE_PAGE_PADDING exacto del Administrador) */}
      <main className={mainCanvas}>
        <div className={GESTION_MODULE_PAGE_PADDING}>
          <div className="space-y-4 w-full">
            {/* Mensaje de Éxito al guardar */}
            {successMessage ? (
              <div className="fixed bottom-4 right-4 z-[300] flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-white dark:bg-[#0b1e30] p-4 text-emerald-700 dark:text-emerald-300 shadow-2xl animate-in fade-in slide-in-from-bottom-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                  <p className="text-sm font-semibold">{successMessage}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSuccessMessage('')}
                  className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 dark:hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : null}

            {/* Alerta de Error de Contexto / Ficha sin Cliente */}
            {contextError && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-red-600 dark:text-red-300">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <h3 className="font-semibold">No es posible registrar ni consultar actividades</h3>
                    <p className="mt-1 text-sm leading-relaxed">{contextError}</p>
                  </div>
                </div>
              </div>
            )}
            
            {!contextError && loadingActividades && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Loader2 className="h-9 w-9 animate-spin text-[#2F7BB8]" />
                <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">
                  Cargando historial de actividades...
                </p>
              </div>
            )}
            
            {!contextError && !loadingActividades && (
              <div className="space-y-4">
                {/* BARRA DE FILTROS (Estándar ModuleFiltersToolbar) */}
                <ModuleFiltersToolbar
                  chipLabel={chipText}
                  filtersPanelOpen={filtersPanelOpen}
                  onToggleFilters={() => setFiltersPanelOpen(!filtersPanelOpen)}
                  dash={dash}
                >
                  <div className="relative flex-1 min-w-[200px] max-w-xs ml-auto">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      placeholder="Buscar por descripción..."
                      className={`${field} h-9 w-full pl-8 text-xs placeholder:text-slate-400`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenModal}
                    disabled={loadingContext || Boolean(contextError)}
                    className={GESTION_TOOLBAR_PRIMARY_BTN}
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    <span className="hidden sm:inline">Agregar manual</span>
                    <span className="sm:hidden">Agregar</span>
                  </button>
                </ModuleFiltersToolbar>

                <ModuleFiltersDrawer
                  open={filtersPanelOpen}
                  onClose={() => setFiltersPanelOpen(false)}
                  onClear={handleClearFilters}
                  onApply={() => setFiltersPanelOpen(false)}
                  dash={dash}
                  title="Filtros avanzados"
                >
                  <div className="flex flex-col gap-1.5 mb-4">
                    <span className={dash.filtrosDrawerLabel}>Fecha inicio</span>
                    <input
                      type="date"
                      className={`${dash.field} min-w-0 w-full px-2 py-1.5 text-sm`}
                      value={filterFechaInicio}
                      onChange={(e) => setFilterFechaInicio(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className={dash.filtrosDrawerLabel}>Fecha fin</span>
                    <input
                      type="date"
                      className={`${dash.field} min-w-0 w-full px-2 py-1.5 text-sm`}
                      value={filterFechaFin}
                      min={filterFechaInicio}
                      onChange={(e) => setFilterFechaFin(e.target.value)}
                    />
                  </div>
                </ModuleFiltersDrawer>

                {/* TABLA DEL HISTORIAL (Usando dash.card, dash.thead, dash.tbody, dash.trHover y celdas del Administrador) */}
                {filteredActividades.length === 0 ? (
                  <div className={`${dash.card} px-4 py-12 text-center shadow-sm`}>
                    <History className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
                    <h3 className="mt-4 font-semibold text-lg">
                      {hasActiveFilters ? 'No se encontraron actividades con los filtros seleccionados' : 'No hay actividades registradas'}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                      {hasActiveFilters
                        ? 'Prueba modificando la fecha, el cliente o el texto de búsqueda.'
                        : 'Presiona el botón "Agregar" en la esquina superior derecha para registrar tu primera actividad.'}
                    </p>
                  </div>
                ) : (
                  <div className={`${dash.card} overflow-hidden`}>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-left text-sm border-collapse">
                        <thead className={dash.thead}>
                          <tr>
                            <th className="px-4 py-3">Fecha</th>
                            <th className="px-4 py-3">Cliente</th>
                            <th className="px-4 py-3">Hora Inicio</th>
                            <th className="px-4 py-3">Hora Fin</th>
                            <th className="px-4 py-3">Duración</th>
                            <th className="px-4 py-3">Descripción</th>
                            <th className="px-4 py-3">Estado</th>
                          </tr>
                        </thead>
                        <tbody className={dash.tbody}>
                          {filteredActividades.map((act) => (
                            <ActivityRow key={act.id} act={act} dash={dash} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* MODAL DE CREACIÓN DE ACTIVIDAD (REUTILIZADO HU-2) */}
      <ActivityModal
        isModalOpen={isModalOpen}
        handleCloseModal={handleCloseModal}
        isLight={isLight}
        saving={saving}
        handleSubmitForm={handleSubmitForm}
        errorMessage={errorMessage}
        cliente={cliente}
        fecha={fecha}
        setFecha={setFecha}
        horaInicio={horaInicio}
        setHoraInicio={setHoraInicio}
        horaFin={horaFin}
        setHoraFin={setHoraFin}
        fieldErrors={fieldErrors}
        descripcion={descripcion}
        setDescripcion={setDescripcion}
      />
    </div>
  );
}
