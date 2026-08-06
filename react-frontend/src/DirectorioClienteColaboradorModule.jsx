import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Activity,
    ArrowDown,
    ArrowRightLeft,
    ArrowUp,
    Building2,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Home,
    LayoutDashboard,
    Layers,
    Menu,
    Users,
    X
} from 'lucide-react';
import { useModuleTheme } from './moduleTheme.js';
import GestionDataTable from './onboarding/GestionDataTable.jsx';
import GestionModalShell from './shared/modals/GestionModalShell.jsx';
import { buildGestionTableDash } from './gestionTableDashTheme.js';
import ModuleFiltersToolbar from './shared/filters/ModuleFiltersToolbar.jsx';
import ModuleFiltersDrawer from './shared/filters/ModuleFiltersDrawer.jsx';
import {
    buildClienteChipLabel,
    buildConsultoresChipLabel,
    CLIENTE_FILTER_DEFAULTS,
    CONSULTORES_FILTER_DEFAULTS
} from './admin/directorioFilters.js';
import AdminModuleSidebarBrand from './AdminModuleSidebarBrand.jsx';
import { nativeCalendarOnlyInputProps } from './nativeCalendarOnlyInputProps.js';
import AdminModuleSidebarFooter from './AdminModuleSidebarFooter.jsx';
import AdminModuleSidebarUser from './AdminModuleSidebarUser.jsx';
import { userHasRolesTiCatalogRead } from './rolesTiAccess.js';
import { userIsGpMallasOnly } from './mallasAccess.js';
import { userHasMonitoreoAccess } from './monitoreoAccess.js';
import RolesTiCatalogPage from './cotizador/RolesTiCatalogPage';
import ReubicacionesPipelinePage from './ReubicacionesPipelinePage';
import AdministracionDashboardPage from './AdministracionDashboardPage';
import MallasTurnosModule from './MallasTurnosModule';
import MonitoreoActividadesView from './MonitoreoActividadesView.jsx';
import SeguimientoView from './seguimiento/SeguimientoView.jsx';
import ColaboradorFichaFields from './components/ColaboradorFichaFields.jsx';
import {
    initialStaffForm,
    mapRowToStaffForm,
    buildStaffColaboradorPayload,
    CO_TABS
} from './constants/colaboradoresConsultorFields.js';

function readCookie(name) {
    const raw = typeof document !== 'undefined' ? String(document.cookie || '') : '';
    if (!raw) return '';
    const parts = raw.split(';');
    for (const part of parts) {
        const [k, ...rest] = part.trim().split('=');
        if (k === name) return decodeURIComponent(rest.join('=') || '');
    }
    return '';
}

function authHeaders(token) {
    const headers = { 'Content-Type': 'application/json' };
    const t = String(token || '').trim();
    if (t) headers.Authorization = `Bearer ${t}`;
    const xsrf = readCookie('cinteXsrf');
    if (xsrf) headers['x-cinte-xsrf'] = xsrf;
    return headers;
}

/** Alineado con `foldForMatch` del backend (`clienteNombreMatch`) para emparejar catálogo. */
function foldCatalogMatch(value) {
    const t = String(value || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
    if (!t) return '';
    return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function nitSoloDigitos(value) {
    return String(value || '').replace(/\D/g, '');
}

const CLIENTE_INTERNO_CINTE = 'CINTE';

function resolveGpUserIdFromCatalogRows(rows, cliente, lider) {
    const fc = foldCatalogMatch(cliente);
    const fl = foldCatalogMatch(lider);
    if (!fc || !fl) return null;
    const hit = rows.find((r) => foldCatalogMatch(r.cliente) === fc && foldCatalogMatch(r.lider) === fl);
    if (!hit?.gp_user_id) return null;
    return String(hit.gp_user_id);
}

function cedulaForGpUserId(gsOptions, gpUserId) {
    const id = String(gpUserId || '').trim();
    if (!id) return '';
    const hit = gsOptions.find((o) => o.gp_user_id === id);
    return hit?.cedula || '';
}

function gpUserIdForCedula(gsOptions, cedula) {
    const c = String(cedula || '').trim();
    if (!c) return null;
    const hit = gsOptions.find((o) => o.cedula === c);
    return hit?.gp_user_id ? String(hit.gp_user_id) : null;
}

function gsDisplayForCliente(resumen, leaderRows, gpLabelById) {
    if (resumen) {
        const gpN = Number(resumen.gp_distinct_count) || 0;
        if (gpN > 1) {
            return { label: 'Gerentes de servicio distintos por líder', conflict: true };
        }
        if (resumen.gp_user_id) {
            const id = String(resumen.gp_user_id);
            const backendName = String(resumen.gp_full_name || '').trim();
            return {
                label: backendName || gpLabelById.get(id) || '—',
                conflict: false
            };
        }
        return { label: '—', conflict: false };
    }
    const gpIds = [...new Set(leaderRows.map((r) => r.gp_user_id).filter(Boolean).map(String))];
    if (gpIds.length > 1) {
        return { label: 'Gerentes de servicio distintos por líder', conflict: true };
    }
    if (gpIds.length === 1) {
        return { label: gpLabelById.get(gpIds[0]) || '—', conflict: false };
    }
    return { label: '—', conflict: false };
}

function nitDisplayForCliente(resumen, leaderRows) {
    if (resumen) return String(resumen.nit || '').trim() || '—';
    const fromRows = leaderRows.map((r) => nitSoloDigitos(r.nit)).find(Boolean);
    return fromRows || '—';
}

function GerenteServicioSelect({ value, onChange, options, loading, className, missingLabel }) {
    const missing = value && !options.some((o) => o.value === value);
    if (loading) {
        return <p className="text-xs opacity-70">Cargando lista…</p>;
    }
    return (
        <select className={className} value={value} onChange={onChange}>
            <option value="">— Sin Gerente de Servicio —</option>
            {missing ? (
                <option value={value}>{missingLabel || `${value} (no listado)`}</option>
            ) : null}
            {options.map((o) => (
                <option key={o.cedula} value={o.value} disabled={o.disabled}>
                    {o.label}
                    {o.inactive ? ' — inactivo' : ''}
                </option>
            ))}
        </select>
    );
}

export default function DirectorioClienteColaboradorModule({ token, auth, onLogout }) {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const mt = useModuleTheme();
    const {
        shell,
        aside,
        asideHeaderBorder,
        scrim,
        menuFab,
        sidebarIconBtn,
        navOutline,
        email,
        borderSubtle,
        mainCanvas,
        headingAccent,
        labelMuted,
        field,
        navAccentActive,
        navAccentInactive,
        tableSurface,
        tableThead,
        tableRowBorder,
        barInset,
        compactBtn,
        softBtn,
        outlineBtn,
        toolbarBtn,
        isLight
    } = mt;
    // CRIT-002: Derivar de la prop auth (cookie HttpOnly), sin leer localStorage
    const currentEmail = String(auth?.user?.email || auth?.claims?.email || 'sin-correo').toLowerCase();
    const currentRoleLabel = String(auth?.user?.role || auth?.claims?.role || 'sin_rol').replace(/_/g, ' ').toUpperCase();

    const gpMallasOnly = userIsGpMallasOnly(auth);
    const canAccessMonitoreo = userHasMonitoreoAccess(auth);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    /** Vista principal del sidebar */
    const [mainView, setMainView] = useState(() => (gpMallasOnly ? 'mallasTurnos' : 'cliente'));

    useEffect(() => {
        setFiltersPanelOpen(false);
    }, [mainView]);

    useEffect(() => {
        const gpAllowedViews = canAccessMonitoreo
            ? ['mallasTurnos', 'seguimiento', 'monitoreo']
            : ['mallasTurnos', 'seguimiento'];
        if (gpMallasOnly && !gpAllowedViews.includes(mainView)) {
            setMainView('mallasTurnos');
        }
    }, [gpMallasOnly, canAccessMonitoreo, mainView]);

    const showTiCatalogSubmod = !gpMallasOnly && userHasRolesTiCatalogRead(auth);
    useEffect(() => {
        const v = searchParams.get('v');
        if (v === 'monitoreo') {
            if (canAccessMonitoreo) setMainView('monitoreo');
            const next = new URLSearchParams(searchParams);
            next.delete('v');
            setSearchParams(next, { replace: true });
            return;
        }
        if (v === 'seguimiento') {
            setMainView('seguimiento');
            const next = new URLSearchParams(searchParams);
            next.delete('v');
            setSearchParams(next, { replace: true });
            return;
        }
        if (gpMallasOnly) {
            const gpAllowed = canAccessMonitoreo
                ? ['mallasTurnos', 'seguimiento', 'monitoreo']
                : ['mallasTurnos', 'seguimiento'];
            if (!gpAllowed.includes(mainView)) setMainView('mallasTurnos');
            if (v) {
                const next = new URLSearchParams(searchParams);
                next.delete('v');
                setSearchParams(next, { replace: true });
            }
            return;
        }
        if (v === 'dashboard') {
            setMainView('dashboardAdmin');
            const next = new URLSearchParams(searchParams);
            next.delete('v');
            setSearchParams(next, { replace: true });
            return;
        }
        if (v === 'reubicaciones') {
            setMainView('reubicaciones');
            const next = new URLSearchParams(searchParams);
            next.delete('v');
            setSearchParams(next, { replace: true });
            return;
        }
        if (v === 'mallas-turnos') {
            setMainView('mallasTurnos');
            const next = new URLSearchParams(searchParams);
            next.delete('v');
            setSearchParams(next, { replace: true });
            return;
        }
        if (v !== 'catalogo-ti') return;
        if (!showTiCatalogSubmod) {
            const next = new URLSearchParams(searchParams);
            next.delete('v');
            setSearchParams(next, { replace: true });
            return;
        }
        setMainView('catalogoTi');
        const next = new URLSearchParams(searchParams);
        next.delete('v');
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams, showTiCatalogSubmod, gpMallasOnly, canAccessMonitoreo, mainView]);

    const [msg, setMsg] = useState(null);

    const [clItems, setClItems] = useState([]);
    const [clTotal, setClTotal] = useState(0);
    const [clPage, setClPage] = useState(1);
    const [clPageSize, setClPageSize] = useState(10);
    const [clQ, setClQ] = useState('');
    const [clActivo, setClActivo] = useState('true');
    const [clLoading, setClLoading] = useState(false);
    /** Cliente seleccionado en tabla agrupada (nombre canónico igual a BD). */
    const [selectedCatalogCliente, setSelectedCatalogCliente] = useState(null);
    /** Modal unificado detalle cliente: view | edit | addLider */
    const [clienteDetailModal, setClienteDetailModal] = useState(null);
    const [addLiderForm, setAddLiderForm] = useState({ lider: '', gp_colaborador_cedula: '', nit: '' });
    const [clienteModalOpen, setClienteModalOpen] = useState(false);
    const [clienteForm, setClienteForm] = useState({ cliente: '', nit: '', lider: '', gp_colaborador_cedula: '' });
    const [confirmDeactivateCatalog, setConfirmDeactivateCatalog] = useState(false);
    const [confirmDeleteLiderRow, setConfirmDeleteLiderRow] = useState(null);
    const [confirmDeleteColaboradorRow, setConfirmDeleteColaboradorRow] = useState(null);
    const [editClienteOriginalName, setEditClienteOriginalName] = useState('');
    const [editClienteForm, setEditClienteForm] = useState({ nombre: '', nit: '', gp_colaborador_cedula: '' });
    const [editClienteNitHint, setEditClienteNitHint] = useState('');
    const [editClienteTargetRows, setEditClienteTargetRows] = useState([]);
    const [editClienteRowsLoading, setEditClienteRowsLoading] = useState(false);
    /** Aviso si hay un GS único en catálogo pero no se pudo preseleccionar colaborador CINTE. */
    const [editClienteGpSelectHint, setEditClienteGpSelectHint] = useState('');
    const [editClienteSaving, setEditClienteSaving] = useState(false);
    const [gsCinteOptions, setGsCinteOptions] = useState([]);
    const [gsCinteOptionsLoading, setGsCinteOptionsLoading] = useState(false);

    const [coItems, setCoItems] = useState([]);
    const [coTotal, setCoTotal] = useState(0);
    const [coPage, setCoPage] = useState(1);
    const [coPageSize, setCoPageSize] = useState(10);
    const [coQ, setCoQ] = useState('');
    /** Filtro exacto por tipo de contrato (API `tipo_contrato`), p. ej. desde el dashboard. */
    const [coTipoContrato, setCoTipoContrato] = useState('');
    const [coActivo, setCoActivo] = useState('all');
    const [coLoading, setCoLoading] = useState(false);
    const [selectedCoCedula, setSelectedCoCedula] = useState(null);
    /** Orden tabla Consultores: null = orden del API. */
    const [coSort, setCoSort] = useState({ key: null, dir: 'asc' });
    const [staffModalOpen, setStaffModalOpen] = useState(false);
    const [staffModalMode, setStaffModalMode] = useState('create');
    const [coForm, setCoForm] = useState(() => initialStaffForm());
    const [staffFichaTab, setStaffFichaTab] = useState(CO_TABS[0]?.id || 'general');
    const [catalogClientes, setCatalogClientes] = useState([]);
    const [liderOptions, setLiderOptions] = useState([]);
    const [liderLoading, setLiderLoading] = useState(false);

    const [gpItems, setGpItems] = useState([]);

    const detailResumenRow = useMemo(() => {
        if (!clienteDetailModal?.cliente) return null;
        return clItems.find((g) => g.cliente === clienteDetailModal.cliente) || null;
    }, [clienteDetailModal, clItems]);

    /** Navegación remota hacia Reubicaciones (dashboard): incrementar `seq` para aplicar filtros en la página hija. */
    const [reubicacionesNavIntent, setReubicacionesNavIntent] = useState(() => ({ seq: 0 }));

    const administracionDrillDown = useCallback((action) => {
        const t = action?.type;
        if (t === 'cliente') {
            setClQ(String(action.q || '').trim());
            setClPage(1);
            setMainView('cliente');
            setMobileMenuOpen(false);
            return;
        }
        if (t === 'consultoresPorCliente') {
            setCoTipoContrato('');
            setCoQ(String(action.q || '').trim());
            setCoPage(1);
            setMainView('consultores');
            setMobileMenuOpen(false);
            return;
        }
        if (t === 'consultoresPorTipoContrato') {
            setCoTipoContrato(String(action.tipoContrato || '').trim());
            setCoQ('');
            setCoPage(1);
            setMainView('consultores');
            setMobileMenuOpen(false);
            return;
        }
        if (t === 'reubicaciones') {
            setReubicacionesNavIntent((prev) => ({
                seq: prev.seq + 1,
                reset: false,
                fechaFinDesde: action.fechaFinDesde ?? '',
                fechaFinHasta: action.fechaFinHasta ?? '',
                semaforo: action.semaforo ?? ''
            }));
            setMainView('reubicaciones');
            setMobileMenuOpen(false);
            return;
        }
        if (t === 'reubicacionesSinFiltro') {
            setReubicacionesNavIntent((prev) => ({ seq: prev.seq + 1, reset: true }));
            setMainView('reubicaciones');
            setMobileMenuOpen(false);
        }
    }, []);

    const [leadersModalRows, setLeadersModalRows] = useState([]);
    const [leadersModalLoading, setLeadersModalLoading] = useState(false);
    /** Filas catálogo activo solo para resolver GP en modal Staff (no pisar la tabla Cliente). */
    const [staffCatalogActivoRows, setStaffCatalogActivoRows] = useState([]);

    const clItemsActive = useMemo(() => staffCatalogActivoRows.filter((r) => r.activo), [staffCatalogActivoRows]);

    const gpLabelById = useMemo(() => {
        const m = new Map();
        for (const g of gpItems) {
            const fullName = String(g.full_name || '').trim();
            const email = String(g.email || '').trim();
            m.set(g.id, fullName || email || 'GP sin nombre');
        }
        return m;
    }, [gpItems]);

    const flash = useCallback((text, ok = true) => {
        setMsg({ text, ok });
        setTimeout(() => setMsg(null), 6000);
    }, []);

    const fetchLeadersForCliente = useCallback(
        async (cliente) => {
            const c = String(cliente || '').trim();
            if (!c) {
                setLeadersModalRows([]);
                return;
            }
            setLeadersModalLoading(true);
            try {
                const u = new URLSearchParams();
                u.set('cliente', c);
                u.set('activo', 'all');
                u.set('limit', '2000');
                u.set('offset', '0');
                const res = await fetch(`/api/directorio/clientes-lideres?${u}`, { headers: authHeaders(token) });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || res.statusText);
                setLeadersModalRows(data.items || []);
            } catch (e) {
                flash(String(e.message || e), false);
                setLeadersModalRows([]);
            } finally {
                setLeadersModalLoading(false);
            }
        },
        [token, flash]
    );

    const loadCatalogo = useCallback(async () => {
        setClLoading(true);
        try {
            const u = new URLSearchParams();
            u.set('activo', clActivo);
            if (clQ.trim()) u.set('q', clQ.trim());
            u.set('limit', String(clPageSize));
            u.set('offset', String((clPage - 1) * clPageSize));
            const res = await fetch(`/api/directorio/clientes-resumen?${u}`, { headers: authHeaders(token) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            setClItems(data.items || []);
            setClTotal(data.total ?? 0);
        } catch (e) {
            flash(String(e.message || e), false);
        } finally {
            setClLoading(false);
        }
    }, [token, clActivo, clQ, flash, clPage, clPageSize]);

    /** Catálogo activo para resolver GP al guardar colaboradores. */
    const loadCatalogoActivoForStaff = useCallback(async () => {
        try {
            const u = new URLSearchParams();
            u.set('activo', 'true');
            u.set('limit', '500');
            u.set('offset', '0');
            const res = await fetch(`/api/directorio/clientes-lideres?${u}`, { headers: authHeaders(token) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return;
            setStaffCatalogActivoRows(data.items || []);
        } catch {
            /* ignore */
        }
    }, [token]);

    const loadColaboradores = useCallback(async () => {
        setCoLoading(true);
        try {
            const u = new URLSearchParams();
            u.set('activo', coActivo);
            if (coQ.trim()) u.set('q', coQ.trim());
            if (coTipoContrato.trim()) u.set('tipo_contrato', coTipoContrato.trim());
            u.set('limit', String(coPageSize));
            u.set('offset', String((coPage - 1) * coPageSize));
            if (coSort.key) {
                u.set('sort', coSort.key);
                u.set('dir', coSort.dir);
            }
            const res = await fetch(`/api/directorio/colaboradores?${u}`, { headers: authHeaders(token) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            setCoItems(data.items || []);
            setCoTotal(data.total ?? 0);
        } catch (e) {
            flash(String(e.message || e), false);
        } finally {
            setCoLoading(false);
        }
    }, [token, coActivo, coQ, coTipoContrato, flash, coPage, coPageSize, coSort]);

    const fetchCatalogClientes = useCallback(async () => {
        try {
            const res = await fetch('/api/catalogos/clientes', { credentials: 'include' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return;
            setCatalogClientes(Array.isArray(data.items) ? data.items : []);
        } catch {
            /* ignore */
        }
    }, []);

    const fetchLideresForCliente = useCallback(async (cliente) => {
        const c = String(cliente || '').trim();
        if (!c) {
            setLiderOptions([]);
            return;
        }
        setLiderLoading(true);
        try {
            const res = await fetch(`/api/catalogos/lideres?cliente=${encodeURIComponent(c)}`, {
                credentials: 'include'
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setLiderOptions([]);
                return;
            }
            setLiderOptions(Array.isArray(data.items) ? data.items : []);
        } catch {
            setLiderOptions([]);
        } finally {
            setLiderLoading(false);
        }
    }, []);

    useEffect(() => {
        if (mainView !== 'cliente') return;
        loadCatalogo();
    }, [mainView, loadCatalogo]);

    useEffect(() => {
        setClPage(1);
    }, [clActivo, clQ, clPageSize]);

    useEffect(() => {
        const tp = Math.max(1, Math.ceil((clTotal || 0) / clPageSize) || 1);
        if (clPage > tp) setClPage(tp);
    }, [clTotal, clPageSize, clPage]);

    useEffect(() => {
        setCoPage(1);
    }, [coActivo, coQ, coTipoContrato, coPageSize, coSort]);

    useEffect(() => {
        const tp = Math.max(1, Math.ceil((coTotal || 0) / coPageSize) || 1);
        if (coPage > tp) setCoPage(tp);
    }, [coTotal, coPageSize, coPage]);

    /** Lista GP para selects en modales. */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/directorio/gp', { headers: authHeaders(token) });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || cancelled) return;
                const items = data.items || [];
                setGpItems(items);
            } catch {
                /* ignore */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token]);

    useEffect(() => {
        if (mainView !== 'consultores') return;
        loadColaboradores();
        loadCatalogoActivoForStaff();
    }, [mainView, loadColaboradores, loadCatalogoActivoForStaff]);

    useEffect(() => {
        if (!selectedCoCedula) return;
        const exists = coItems.some((r) => r.cedula === selectedCoCedula);
        if (!exists) setSelectedCoCedula(null);
    }, [coItems, selectedCoCedula]);

    async function patchCatalogo(row, patch) {
        try {
            const res = await fetch(`/api/directorio/clientes-lideres/${row.id}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: authHeaders(token),
                body: JSON.stringify(patch)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            flash('Actualizado.');
            await loadCatalogo();
            if (clienteDetailModal?.cliente) await fetchLeadersForCliente(clienteDetailModal.cliente);
            if (mainView === 'consultores') loadCatalogoActivoForStaff();
        } catch (err) {
            flash(String(err.message || err), false);
        }
    }

    async function deleteLiderRow(row) {
        if (!row?.id) return;
        try {
            const res = await fetch(`/api/directorio/clientes-lideres/${row.id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: authHeaders(token)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            flash('Líder eliminado del catálogo.');
            setConfirmDeleteLiderRow(null);
            if (clienteDetailModal?.cliente) await fetchLeadersForCliente(clienteDetailModal.cliente);
            await loadCatalogo();
            if (mainView === 'consultores') loadCatalogoActivoForStaff();
        } catch (err) {
            flash(String(err.message || err), false);
        }
    }

    async function openClienteModalCreate() {
        setClienteForm({ cliente: '', nit: '', lider: '', gp_colaborador_cedula: '' });
        setGsCinteOptions([]);
        setGsCinteOptionsLoading(true);
        setClienteModalOpen(true);
        try {
            const opts = await fetchStaffCinteForGsSelect();
            setGsCinteOptions(opts);
        } catch (e) {
            flash(String(e.message || e), false);
        } finally {
            setGsCinteOptionsLoading(false);
        }
    }

    function closeClienteDetailModal() {
        setEditClienteGpSelectHint('');
        setEditClienteNitHint('');
        setClienteDetailModal(null);
        setLeadersModalRows([]);
    }

    async function ensureGsCinteOptionsLoaded() {
        if (gsCinteOptions.length > 0) return gsCinteOptions;
        if (gsCinteOptionsLoading) return gsCinteOptions;
        setGsCinteOptionsLoading(true);
        try {
            const opts = await fetchStaffCinteForGsSelect();
            setGsCinteOptions(opts);
            return opts;
        } catch (e) {
            flash(String(e.message || e), false);
            return [];
        } finally {
            setGsCinteOptionsLoading(false);
        }
    }

    /** Colaboradores CINTE (activos e inactivos) para select Gerente de Servicio. */
    async function fetchStaffCinteForGsSelect() {
        const all = [];
        let offset = 0;
        const limit = 200;
        for (;;) {
            const u = new URLSearchParams();
            u.set('cliente', CLIENTE_INTERNO_CINTE);
            u.set('activo', 'all');
            u.set('limit', String(limit));
            u.set('offset', String(offset));
            const res = await fetch(`/api/directorio/colaboradores?${u}`, { headers: authHeaders(token) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            const items = data.items || [];
            all.push(...items);
            if (items.length < limit) break;
            offset += limit;
        }
        const opts = all.map((row) => {
            const cedula = String(row.cedula || '').trim();
            const gid = row.gp_user_id ? String(row.gp_user_id).trim() : '';
            const nm = (row.nombre || '').trim();
            const em = (row.correo_cinte || '').trim();
            const label = nm || '—';
            return {
                cedula,
                value: cedula,
                label,
                disabled: !em,
                inactive: !row.activo,
                gp_user_id: gid || null
            };
        });
        opts.sort((a, b) =>
            a.label.localeCompare(b.label, 'es', { numeric: true, sensitivity: 'base' })
        );
        return opts;
    }

    async function loadEditClienteDataForModal(cliente, gsOpts) {
        const original = String(cliente || '').trim();
        if (!original) {
            flash('Cliente no válido.', false);
            return;
        }
        setEditClienteOriginalName(original);
        setEditClienteForm({ nombre: original, nit: '', gp_colaborador_cedula: '' });
        setEditClienteTargetRows([]);
        setEditClienteGpSelectHint('');
        setEditClienteNitHint('');
        setEditClienteRowsLoading(true);
        try {
            const u = new URLSearchParams();
            u.set('cliente', original);
            u.set('activo', 'all');
            u.set('limit', '2000');
            u.set('offset', '0');
            const res = await fetch(`/api/directorio/clientes-lideres?${u}`, { headers: authHeaders(token) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            const rows = data.items || [];
            setEditClienteTargetRows(rows);
            const nitDigitsList = [
                ...new Set(rows.map((r) => nitSoloDigitos(r.nit)).filter(Boolean))
            ];
            let initialNit = '';
            if (nitDigitsList.length === 1) {
                initialNit = nitDigitsList[0];
            } else if (nitDigitsList.length > 1) {
                setEditClienteNitHint(
                    'Hay NIT distintos entre líderes de este cliente; indica un único NIT para unificar todas las filas.'
                );
            }
            const gpIds = [...new Set(rows.map((r) => r.gp_user_id).filter(Boolean).map(String))];
            let initialGpCedula = '';
            let gpSelectHint = '';
            if (gpIds.length === 1) {
                initialGpCedula = cedulaForGpUserId(gsOpts, gpIds[0]);
                if (!initialGpCedula) {
                    gpSelectHint =
                        'El Gerente de Servicio del catálogo no está en la lista CINTE; elija manualmente en la lista.';
                }
            } else if (gpIds.length > 1) {
                gpSelectHint =
                    'Había Gerentes de Servicio distintos por líder; el valor que elijas unificará el GS en todas las filas.';
            }
            setEditClienteGpSelectHint(gpSelectHint);
            setEditClienteForm({ nombre: original, nit: initialNit, gp_colaborador_cedula: initialGpCedula });
        } catch (e) {
            flash(String(e.message || e), false);
            setClienteDetailModal((m) => (m ? { ...m, mode: 'view' } : null));
        } finally {
            setEditClienteRowsLoading(false);
        }
    }

    async function openClienteDetailModal(cliente, mode = 'view') {
        const c = String(cliente || '').trim();
        if (!c) {
            flash('Cliente no válido.', false);
            return;
        }
        setSelectedCatalogCliente(c);
        setEditClienteGpSelectHint('');
        setEditClienteNitHint('');
        setClienteDetailModal({ cliente: c, mode });
        void fetchLeadersForCliente(c);
        const gsOpts = await ensureGsCinteOptionsLoaded();
        if (mode === 'edit') {
            await loadEditClienteDataForModal(c, gsOpts);
        }
    }

    async function prepareAddLiderForm() {
        if (!clienteDetailModal?.cliente) return;
        const gsOpts = await ensureGsCinteOptionsLoaded();
        const rows = leadersModalRows;
        const firstGp = rows.map((r) => r.gp_user_id).find(Boolean);
        const nitFromRows = rows.map((r) => nitSoloDigitos(r.nit)).find(Boolean) || '';
        setAddLiderForm({
            lider: '',
            gp_colaborador_cedula: firstGp ? cedulaForGpUserId(gsOpts, String(firstGp)) : '',
            nit: nitFromRows
        });
        setClienteDetailModal((m) => (m ? { ...m, mode: 'addLider' } : null));
    }

    async function enterClienteDetailEditMode() {
        if (!clienteDetailModal?.cliente) return;
        const c = clienteDetailModal.cliente;
        setClienteDetailModal({ cliente: c, mode: 'edit' });
        const gsOpts = await ensureGsCinteOptionsLoaded();
        await loadEditClienteDataForModal(c, gsOpts);
    }

    function handleCoSortHeader(columnKey) {
        setCoSort((cur) => {
            if (cur.key === columnKey) {
                return { key: columnKey, dir: cur.dir === 'asc' ? 'desc' : 'asc' };
            }
            return { key: columnKey, dir: 'asc' };
        });
    }

    async function submitEditClienteModal(e) {
        e.preventDefault();
        const nombre = String(editClienteForm.nombre || '').trim();
        if (!nombre) {
            flash('El nombre del cliente es obligatorio.', false);
            return;
        }
        const nitDigits = nitSoloDigitos(editClienteForm.nit);
        if (!nitDigits) {
            flash('El NIT es obligatorio (al menos un dígito).', false);
            return;
        }
        const gpUserId = gpUserIdForCedula(gsCinteOptions, editClienteForm.gp_colaborador_cedula);
        if (!editClienteTargetRows.length) {
            flash('No hay filas de catálogo para este cliente.', false);
            return;
        }
        setEditClienteSaving(true);
        try {
            for (const row of editClienteTargetRows) {
                const res = await fetch(`/api/directorio/clientes-lideres/${row.id}`, {
                    method: 'PATCH',
                    credentials: 'include',
                    headers: authHeaders(token),
                    body: JSON.stringify({
                        cliente: nombre,
                        gp_user_id: gpUserId,
                        nit: nitDigits
                    })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || res.statusText);
            }
            await loadCatalogo();
            flash('Cliente actualizado.');
            if (selectedCatalogCliente === editClienteOriginalName) {
                setSelectedCatalogCliente(nombre);
            }
            setClienteDetailModal({ cliente: nombre, mode: 'view' });
            setEditClienteGpSelectHint('');
            setEditClienteNitHint('');
            await fetchLeadersForCliente(nombre);
            if (mainView === 'consultores') await loadCatalogoActivoForStaff();
        } catch (err) {
            flash(String(err.message || err), false);
        } finally {
            setEditClienteSaving(false);
        }
    }

    async function submitAddLiderModal(e) {
        e.preventDefault();
        if (!clienteDetailModal?.cliente) return;
        const nitDigits = nitSoloDigitos(addLiderForm.nit);
        if (!nitDigits) {
            flash('El NIT es obligatorio (al menos un dígito).', false);
            return;
        }
        try {
            const clienteName = clienteDetailModal.cliente;
            const gpCedula = addLiderForm.gp_colaborador_cedula
                ? String(addLiderForm.gp_colaborador_cedula).trim()
                : null;
            const res = await fetch('/api/directorio/clientes-lideres', {
                method: 'POST',
                credentials: 'include',
                headers: authHeaders(token),
                body: JSON.stringify({
                    cliente: clienteName,
                    lider: addLiderForm.lider,
                    nit: nitDigits,
                    gp_colaborador_cedula: gpCedula
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            flash('Líder agregado al catálogo.');
            setClienteDetailModal({ cliente: clienteName, mode: 'view' });
            await loadCatalogo();
            await fetchLeadersForCliente(clienteName);
            if (mainView === 'consultores') loadCatalogoActivoForStaff();
            refreshGpList();
        } catch (err) {
            flash(String(err.message || err), false);
        }
    }

    async function refreshGpList() {
        try {
            const res = await fetch('/api/directorio/gp', { headers: authHeaders(token) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return;
            const items = data.items || [];
            setGpItems(items);
        } catch {
            /* ignore */
        }
    }

    async function submitClienteModal(e) {
        e.preventDefault();
        const nitDigits = nitSoloDigitos(clienteForm.nit);
        if (!nitDigits) {
            flash('El NIT es obligatorio (al menos un dígito).', false);
            return;
        }
        try {
            const gpCedula = clienteForm.gp_colaborador_cedula
                ? String(clienteForm.gp_colaborador_cedula).trim()
                : null;
            const res = await fetch('/api/directorio/clientes-lideres', {
                method: 'POST',
                credentials: 'include',
                headers: authHeaders(token),
                body: JSON.stringify({
                    cliente: clienteForm.cliente,
                    lider: clienteForm.lider,
                    nit: nitDigits,
                    gp_colaborador_cedula: gpCedula
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            flash('Cliente y primer líder guardados en el catálogo.');
            setClienteModalOpen(false);
            loadCatalogo();
            if (mainView === 'consultores') loadCatalogoActivoForStaff();
            refreshGpList();
        } catch (err) {
            flash(String(err.message || err), false);
        }
    }

    async function deactivateAllRowsForClient(cliente) {
        const c = String(cliente || '').trim();
        const u = new URLSearchParams();
        u.set('cliente', c);
        u.set('activo', 'all');
        u.set('limit', '2000');
        u.set('offset', '0');
        const res = await fetch(`/api/directorio/clientes-lideres?${u}`, { headers: authHeaders(token) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.statusText);
        const rows = data.items || [];
        for (const row of rows) {
            if (!row.activo) continue;
            const res = await fetch(`/api/directorio/clientes-lideres/${row.id}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: authHeaders(token),
                body: JSON.stringify({ activo: false })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
        }
    }

    async function submitStaffModal(e) {
        e.preventDefault();
        const gpDerived = resolveGpUserIdFromCatalogRows(clItemsActive, coForm.cliente, coForm.lider_catalogo);
        const ext = buildStaffColaboradorPayload(coForm);
        try {
            if (staffModalMode === 'create') {
                const body = {
                    cedula: coForm.cedula,
                    nombre: coForm.nombre,
                    correo_cinte: coForm.correo_cinte || null,
                    cliente: coForm.cliente || null,
                    lider_catalogo: coForm.lider_catalogo || null,
                    gp_user_id: gpDerived,
                    ...ext
                };
                const res = await fetch('/api/directorio/colaboradores', {
                    method: 'POST',
                    credentials: 'include',
                    headers: authHeaders(token),
                    body: JSON.stringify(body)
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || res.statusText);
                flash('Colaborador creado.');
            } else if (selectedCoCedula) {
                const res = await fetch(`/api/directorio/colaboradores/${encodeURIComponent(selectedCoCedula)}`, {
                    method: 'PATCH',
                    credentials: 'include',
                    headers: authHeaders(token),
                    body: JSON.stringify({
                        nombre: coForm.nombre,
                        correo_cinte: coForm.correo_cinte || null,
                        cliente: coForm.cliente || null,
                        lider_catalogo: coForm.lider_catalogo || null,
                        gp_user_id: gpDerived,
                        ...ext
                    })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || res.statusText);
                flash('Colaborador actualizado.');
            }
            setStaffModalOpen(false);
            loadColaboradores();
        } catch (err) {
            flash(String(err.message || err), false);
        }
    }

    async function deleteColaboradorRow(row) {
        if (!row?.cedula) return;
        try {
            const res = await fetch(`/api/directorio/colaboradores/${encodeURIComponent(row.cedula)}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: authHeaders(token)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            flash('Colaborador eliminado.');
            setSelectedCoCedula(null);
            setConfirmDeleteColaboradorRow(null);
            loadColaboradores();
        } catch (err) {
            flash(String(err.message || err), false);
        }
    }

    async function patchColaborador(cedula, patch) {
        try {
            const res = await fetch(`/api/directorio/colaboradores/${encodeURIComponent(cedula)}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: authHeaders(token),
                body: JSON.stringify(patch)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            flash('Colaborador actualizado.');
            loadColaboradores();
        } catch (err) {
            flash(String(err.message || err), false);
        }
    }

    function openStaffModalCreate() {
        setStaffModalMode('create');
        setCoForm(initialStaffForm());
        setLiderOptions([]);
        fetchCatalogClientes();
        setStaffModalOpen(true);
    }

    function openStaffModalEditForRow(row) {
        if (!row) return;
        setSelectedCoCedula(row.cedula);
        setStaffModalMode('edit');
        setCoForm(mapRowToStaffForm(row));
        fetchCatalogClientes();
        if (row.cliente) fetchLideresForCliente(row.cliente);
        else setLiderOptions([]);
        setStaffModalOpen(true);
    }

    const NavBtn = ({ active, icon: Icon, label, onClick }) => (
        <button
            type="button"
            title={!sidebarOpen ? label : undefined}
            onClick={onClick}
            className={`flex items-center gap-3 rounded-xl transition-all font-body font-medium text-sm text-left w-full ${
                sidebarOpen ? 'px-4 py-3' : 'px-0 py-3 justify-center'
            } ${active ? navAccentActive : navAccentInactive}`}
        >
            <Icon size={18} className="flex-shrink-0" />
            {sidebarOpen && <span className="truncate">{label}</span>}
        </button>
    );

    const sidebarNav = () => (
        <nav className="mt-1 flex flex-1 flex-col gap-1 overflow-y-auto p-2">
            <NavBtn
                active={false}
                icon={Home}
                label="Inicio portal"
                onClick={() => {
                    navigate('/admin');
                    setMobileMenuOpen(false);
                }}
            />
            {gpMallasOnly ? (
                <>
                    <NavBtn
                        active={mainView === 'mallasTurnos'}
                        icon={CalendarDays}
                        label="Mallas de turnos"
                        onClick={() => {
                            setMainView('mallasTurnos');
                            setMobileMenuOpen(false);
                        }}
                    />
                    <NavBtn
                        active={mainView === 'seguimiento'}
                        icon={ClipboardList}
                        label="Seguimiento"
                        onClick={() => {
                            setMainView('seguimiento');
                            setMobileMenuOpen(false);
                        }}
                    />
                    {canAccessMonitoreo ? (
                        <NavBtn
                            active={mainView === 'monitoreo'}
                            icon={Activity}
                            label="Monitoreo de actividades"
                            onClick={() => {
                                setMainView('monitoreo');
                                setMobileMenuOpen(false);
                            }}
                        />
                    ) : null}
                </>
            ) : (
                <>
                    <NavBtn
                        active={mainView === 'dashboardAdmin'}
                        icon={LayoutDashboard}
                        label="Dashboard"
                        onClick={() => {
                            setMainView('dashboardAdmin');
                            setMobileMenuOpen(false);
                        }}
                    />
                    <NavBtn
                        active={mainView === 'cliente'}
                        icon={Building2}
                        label="Cliente"
                        onClick={() => {
                            setMainView('cliente');
                            setMobileMenuOpen(false);
                        }}
                    />
                    <NavBtn
                        active={mainView === 'consultores'}
                        icon={Users}
                        label="Consultores / Staff"
                        onClick={() => {
                            setCoTipoContrato('');
                            setCoQ('');
                            setMainView('consultores');
                            setMobileMenuOpen(false);
                        }}
                    />
                    <NavBtn
                        active={mainView === 'reubicaciones'}
                        icon={ArrowRightLeft}
                        label="Reubicaciones"
                        onClick={() => {
                            setReubicacionesNavIntent((prev) => ({ seq: prev.seq + 1, reset: true }));
                            setMainView('reubicaciones');
                            setMobileMenuOpen(false);
                        }}
                    />
                    <NavBtn
                        active={mainView === 'mallasTurnos'}
                        icon={CalendarDays}
                        label="Mallas de turnos"
                        onClick={() => {
                            setMainView('mallasTurnos');
                            setMobileMenuOpen(false);
                        }}
                    />
                    <NavBtn
                        active={mainView === 'seguimiento'}
                        icon={ClipboardList}
                        label="Seguimiento"
                        onClick={() => {
                            setMainView('seguimiento');
                            setMobileMenuOpen(false);
                        }}
                    />
                    {canAccessMonitoreo ? (
                        <NavBtn
                            active={mainView === 'monitoreo'}
                            icon={Activity}
                            label="Monitoreo de actividades"
                            onClick={() => {
                                setMainView('monitoreo');
                                setMobileMenuOpen(false);
                            }}
                        />
                    ) : null}
                    {showTiCatalogSubmod ? (
                        <NavBtn
                            active={mainView === 'catalogoTi'}
                            icon={Layers}
                            label="Catálogo roles TI"
                            onClick={() => {
                                setMainView('catalogoTi');
                                setMobileMenuOpen(false);
                            }}
                        />
                    ) : null}
                </>
            )}
        </nav>
    );

    const clTotalPages = Math.max(1, Math.ceil((Number(clTotal) || 0) / clPageSize));
    const safeClPage = Math.min(Math.max(1, clPage), clTotalPages);
    const clRangeFrom = !clTotal ? 0 : (safeClPage - 1) * clPageSize + 1;
    const clRangeTo = Math.min(Number(clTotal) || 0, safeClPage * clPageSize);

    const coTotalPages = Math.max(1, Math.ceil((Number(coTotal) || 0) / coPageSize));
    const safeCoPage = Math.min(Math.max(1, coPage), coTotalPages);
    const coRangeFrom = !coTotal ? 0 : (safeCoPage - 1) * coPageSize + 1;
    const coRangeTo = Math.min(Number(coTotal) || 0, safeCoPage * coPageSize);

    const clienteChipLabel = useMemo(
        () => buildClienteChipLabel({ activo: clActivo, pageSize: clPageSize }),
        [clActivo, clPageSize]
    );
    const consultoresChipLabel = useMemo(
        () => buildConsultoresChipLabel({ activo: coActivo, tipoContrato: coTipoContrato, pageSize: coPageSize }),
        [coActivo, coTipoContrato, coPageSize]
    );

    const liderRoseBtnCls =
        'rounded-lg border border-rose-500/40 px-3 py-1 text-xs font-semibold text-rose-400 transition-all hover:bg-rose-500/10';

    const catalogClientColumns = useMemo(
        () => [
            {
                key: 'nit',
                label: 'NIT',
                cellClassName: dash.tdName,
                render: (g) => String(g.nit || '').trim() || '—'
            },
            {
                key: 'cliente',
                label: 'Cliente',
                cellClassName: dash.tdCell,
                render: (g) => g.cliente
            },
            {
                key: 'lideres',
                label: 'Líderes (activos / total)',
                cellClassName: dash.tdCell,
                render: (g) => `${Number(g.active_count) || 0} / ${Number(g.total_count) || 0}`
            },
            {
                key: 'gs',
                label: 'Gerente de servicio',
                cellClassName: dash.tdMuted,
                render: (g) => {
                    const gpN = Number(g.gp_distinct_count) || 0;
                    if (gpN > 1) {
                        return (
                            <span className={isLight ? 'font-medium text-amber-700' : 'font-medium text-amber-300/90'}>
                                GS distintos por líder
                            </span>
                        );
                    }
                    if (g.gp_user_id) {
                        const id = String(g.gp_user_id);
                        const backendName = String(g.gp_full_name || '').trim();
                        return backendName || gpLabelById.get(id) || '—';
                    }
                    return '—';
                }
            },
            {
                key: 'borrar',
                label: 'Eliminar',
                cellClassName: dash.tdCell,
                render: (g) => (
                    <button
                        type="button"
                        className={liderRoseBtnCls}
                        onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCatalogCliente(g.cliente);
                            setConfirmDeactivateCatalog(true);
                        }}
                    >
                        Eliminar
                    </button>
                )
            }
        ],
        [gpLabelById, isLight, dash.tdName, dash.tdCell, dash.tdMuted]
    );

    const leadersModalColumns = useMemo(
        () => [
            {
                key: 'lider',
                label: 'Líder',
                cellClassName: dash.tdName,
                render: (row) => row.lider
            },
            {
                key: 'activo',
                label: 'Activo',
                cellClassName: dash.tdCell,
                render: (row) => (row.activo ? 'Sí' : 'No')
            },
            {
                key: 'acciones',
                label: 'Acciones',
                cellClassName: dash.tdCell,
                render: (row) => (
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            className={dash.actionBtn}
                            onClick={() => patchCatalogo(row, { activo: !row.activo })}
                        >
                            {row.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                            type="button"
                            className={liderRoseBtnCls}
                            onClick={() => setConfirmDeleteLiderRow(row)}
                        >
                            Eliminar
                        </button>
                    </div>
                )
            }
        ],
        [dash.actionBtn, dash.tdName, dash.tdCell]
    );

    const clearClienteFilters = useCallback(() => {
        setClActivo(CLIENTE_FILTER_DEFAULTS.activo);
        setClPageSize(CLIENTE_FILTER_DEFAULTS.pageSize);
        setClQ(CLIENTE_FILTER_DEFAULTS.q);
        setClPage(1);
    }, []);

    const clearConsultoresFilters = useCallback(() => {
        setCoActivo(CONSULTORES_FILTER_DEFAULTS.activo);
        setCoTipoContrato(CONSULTORES_FILTER_DEFAULTS.tipoContrato);
        setCoPageSize(CONSULTORES_FILTER_DEFAULTS.pageSize);
        setCoQ(CONSULTORES_FILTER_DEFAULTS.q);
        setCoPage(1);
    }, []);

    return (
        <div className={shell}>
            <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className={`md:hidden fixed top-4 left-4 z-40 w-10 h-10 flex items-center justify-center shadow-lg ${menuFab}`}
                aria-label="Abrir menú administración"
            >
                <Menu size={18} />
            </button>
            {mobileMenuOpen ? (
                <div className={`md:hidden fixed inset-0 z-40 ${scrim}`} onClick={() => setMobileMenuOpen(false)} />
            ) : null}
            <aside
                className={`md:hidden fixed top-0 left-0 z-50 flex h-full w-72 flex-col transform font-body shadow-2xl transition-transform duration-300 ${aside} ${
                    mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                <AdminModuleSidebarBrand
                    variant="drawer"
                    isLight={isLight}
                    asideHeaderBorder={asideHeaderBorder}
                    moduleContext={(
                        <>
                            <p className={`text-[10px] font-heading font-black uppercase tracking-widest leading-tight ${headingAccent}`}>
                                Administración
                            </p>
                            <p className="text-[10px] font-body font-bold uppercase tracking-widest leading-tight text-slate-400">CINTE</p>
                        </>
                    )}
                    endAction={(
                        <button
                            type="button"
                            onClick={() => setMobileMenuOpen(false)}
                            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center ${sidebarIconBtn}`}
                            aria-label="Cerrar menú"
                        >
                            <X size={16} />
                        </button>
                    )}
                />
                <AdminModuleSidebarUser
                    sidebarOpen
                    currentEmail={currentEmail}
                    currentRoleLabel={currentRoleLabel}
                    emailClass={email}
                    borderSubtle={borderSubtle}
                    isLight={isLight}
                    accentClass={headingAccent}
                />
                {sidebarNav()}
                <AdminModuleSidebarFooter auth={auth} onLogout={onLogout} sidebarOpen borderSubtle={borderSubtle} isLight={isLight} />
            </aside>

            <aside
                className={`relative z-10 hidden h-full flex-shrink-0 flex-col overflow-x-hidden font-body shadow-2xl transition-all duration-300 ease-in-out md:flex ${aside} ${
                    sidebarOpen ? 'w-64' : 'w-16'
                }`}
            >
                <AdminModuleSidebarBrand
                    variant={sidebarOpen ? 'rail-expanded' : 'rail-collapsed'}
                    isLight={isLight}
                    asideHeaderBorder={asideHeaderBorder}
                    moduleContext={(
                        <>
                            <p className={`whitespace-nowrap text-[10px] font-heading font-black uppercase tracking-widest leading-tight ${headingAccent}`}>
                                Administración
                            </p>
                            <p className="whitespace-nowrap text-[10px] font-body font-bold uppercase tracking-widest leading-tight text-slate-400">
                                CINTE
                            </p>
                        </>
                    )}
                    endAction={(
                        <button
                            type="button"
                            onClick={() => setSidebarOpen((o) => !o)}
                            title={sidebarOpen ? 'Colapsar menú' : 'Expandir menú'}
                            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center ${sidebarIconBtn}`}
                        >
                            {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                        </button>
                    )}
                />
                <AdminModuleSidebarUser
                    sidebarOpen={sidebarOpen}
                    currentEmail={currentEmail}
                    currentRoleLabel={currentRoleLabel}
                    emailClass={email}
                    borderSubtle={borderSubtle}
                    isLight={isLight}
                    accentClass={headingAccent}
                />
                {sidebarNav()}
                <AdminModuleSidebarFooter
                    auth={auth}
                    onLogout={onLogout}
                    sidebarOpen={sidebarOpen}
                    borderSubtle={borderSubtle}
                    isLight={isLight}
                />
            </aside>

            <div className="flex flex-col flex-1 min-h-0 min-w-0">
                {msg ? (
                    <div
                        className={`mx-4 md:mx-8 mt-3 px-3 py-2 rounded text-sm shrink-0 ${
                            msg.ok ? 'bg-emerald-900/40 text-emerald-200' : 'bg-red-900/40 text-red-200'
                        }`}
                    >
                        {msg.text}
                    </div>
                ) : null}

                <main className={`flex-1 overflow-y-auto p-4 md:p-6 ${mainCanvas}`}>
                    {mainView === 'dashboardAdmin' ? (
                        <div className="space-y-4 w-full max-w-[95rem]">
                            <AdministracionDashboardPage token={token} onDrillDown={administracionDrillDown} />
                        </div>
                    ) : null}

                    {mainView === 'cliente' && (
                        <div className={dash.moduleTabShellFull}>
                            <ModuleFiltersToolbar
                                chipLabel={clienteChipLabel}
                                filtersPanelOpen={filtersPanelOpen}
                                onToggleFilters={() => setFiltersPanelOpen((o) => !o)}
                                toggleId="directorio-cliente-filtros-toggle"
                                panelId="directorio-cliente-filtros-panel"
                                dash={dash}
                            >
                                <input
                                    type="search"
                                    className={`${field} w-[min(100%,11rem)] max-w-[13rem] shrink-0 text-sm`}
                                    value={clQ}
                                    onChange={(e) => {
                                        setClQ(e.target.value);
                                        setClPage(1);
                                    }}
                                    placeholder="Buscar cliente o líder"
                                />
                                <button
                                    type="button"
                                    onClick={openClienteModalCreate}
                                    className={`${dash.btnPrimaryCinte} shrink-0`}
                                >
                                    Crear nuevo cliente
                                </button>
                            </ModuleFiltersToolbar>
                            <p className={`${dash.mutedSm} px-1`}>
                                Haz clic en una fila para ver detalle del cliente.
                            </p>
                            <div className="min-h-0 flex-1 flex flex-col">
                                <GestionDataTable
                                    columns={catalogClientColumns}
                                    rows={clLoading ? [] : clItems.map((g) => ({ ...g, id: g.cliente }))}
                                    isLight={isLight}
                                    emptyText={clLoading ? 'Cargando…' : 'Sin datos'}
                                    onRowClick={(g) => {
                                        setSelectedCatalogCliente(g.cliente);
                                        void openClienteDetailModal(g.cliente, 'view');
                                    }}
                                />
                                {!clLoading && clTotal > 0 ? (
                                    <div className={dash.footerBar}>
                                        <span>
                                            Mostrando {clRangeFrom}–{clRangeTo} de {clTotal} · Página {safeClPage} de{' '}
                                            {clTotalPages}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setClPage((p) => Math.max(1, p - 1))}
                                                disabled={safeClPage <= 1}
                                                className={dash.compactBtn}
                                            >
                                                Anterior
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setClPage((p) => Math.min(clTotalPages, p + 1))}
                                                disabled={safeClPage >= clTotalPages}
                                                className={dash.compactBtn}
                                            >
                                                Siguiente
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    )}

                    {mainView === 'consultores' && (
                        <div className={dash.moduleTabShellFull}>
                            <ModuleFiltersToolbar
                                chipLabel={consultoresChipLabel}
                                filtersPanelOpen={filtersPanelOpen}
                                onToggleFilters={() => setFiltersPanelOpen((o) => !o)}
                                toggleId="directorio-consultores-filtros-toggle"
                                panelId="directorio-consultores-filtros-panel"
                                dash={dash}
                            >
                                <input
                                    type="search"
                                    className={`${field} w-[min(100%,11rem)] max-w-[13rem] shrink-0 text-sm`}
                                    value={coQ}
                                    onChange={(e) => {
                                        setCoQ(e.target.value);
                                        setCoPage(1);
                                    }}
                                    placeholder="Buscar consultor"
                                />
                                <button
                                    type="button"
                                    onClick={openStaffModalCreate}
                                    className={`${dash.toolbarBtn} shrink-0 bg-[#2F7BB8] text-white hover:bg-[#25649a] border-[#2F7BB8]`}
                                >
                                    Crear colaborador
                                </button>
                            </ModuleFiltersToolbar>
                            <div className={`${dash.cardFlex} min-h-0 flex-1`}>
                                <div className={dash.tableWrap}>
                                    <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
                                        <table className="w-full min-w-[960px] border-collapse text-left">
                                            <thead>
                                                <tr className={dash.thead}>
                                                    <th className="w-10 p-4 pl-6 font-semibold" />
                                                    {(
                                                        [
                                                            ['cedula', 'Cédula'],
                                                            ['codigo', 'Código'],
                                                            ['nombre', 'Nombre'],
                                                            ['correo', 'Correo'],
                                                            ['cliente', 'Cliente'],
                                                            ['lider', 'Líder'],
                                                            ['activo', 'Activo']
                                                        ]
                                                    ).map(([col, label]) => (
                                                        <th key={col} className="p-4 font-semibold">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCoSortHeader(col)}
                                                                className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-semibold text-inherit hover:text-[#65BCF7]"
                                                            >
                                                                {label}
                                                                {coSort.key === col ? (
                                                                    coSort.dir === 'asc' ? (
                                                                        <ArrowUp size={14} className="text-[#65BCF7]" />
                                                                    ) : (
                                                                        <ArrowDown size={14} className="text-[#65BCF7]" />
                                                                    )
                                                                ) : null}
                                                            </button>
                                                        </th>
                                                    ))}
                                                    <th className="p-4 font-semibold whitespace-nowrap">Editar</th>
                                                    <th className="p-4 pr-6 font-semibold">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody className={dash.tbody}>
                                                {coLoading ? (
                                                    <tr>
                                                        <td colSpan={10} className={`p-12 text-center font-medium ${dash.muted}`}>
                                                            Cargando…
                                                        </td>
                                                    </tr>
                                                ) : coItems.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={10} className={`p-12 text-center font-medium ${dash.muted}`}>
                                                            Sin datos
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    coItems.map((row) => (
                                                        <tr
                                                            key={row.cedula}
                                                            className={`${dash.trHover} cursor-pointer ${
                                                                selectedCoCedula === row.cedula
                                                                    ? isLight
                                                                        ? 'bg-sky-100'
                                                                        : 'bg-[#0f2942]/80'
                                                                    : ''
                                                            }`}
                                                            onClick={() =>
                                                                setSelectedCoCedula((cur) =>
                                                                    cur === row.cedula ? null : row.cedula
                                                                )
                                                            }
                                                        >
                                                            <td className="p-4 pl-6">
                                                                <input
                                                                    type="radio"
                                                                    className="accent-[#65BCF7]"
                                                                    checked={selectedCoCedula === row.cedula}
                                                                    onChange={() => setSelectedCoCedula(row.cedula)}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                />
                                                            </td>
                                                            <td className={`${dash.tdCell} whitespace-nowrap`}>{row.cedula}</td>
                                                            <td className={dash.tdCell} title={row.codigo || ''}>
                                                                {row.codigo || '—'}
                                                            </td>
                                                            <td className={dash.tdName}>{row.nombre}</td>
                                                            <td className={dash.tdCell}>{row.correo_cinte || '—'}</td>
                                                            <td className={dash.tdCell}>{row.cliente || '—'}</td>
                                                            <td className={dash.tdCell}>{row.lider_catalogo || '—'}</td>
                                                            <td className={dash.tdMuted}>{row.activo ? 'Sí' : 'No'}</td>
                                                            <td className="p-4 whitespace-nowrap">
                                                                <button
                                                                    type="button"
                                                                    className={dash.actionBtn}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        openStaffModalEditForRow(row);
                                                                    }}
                                                                >
                                                                    Editar
                                                                </button>
                                                            </td>
                                                            <td className="p-4 pr-6 whitespace-nowrap">
                                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                                                    <button
                                                                        type="button"
                                                                        className="text-[#65BCF7] hover:underline"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            patchColaborador(row.cedula, {
                                                                                activo: !row.activo
                                                                            });
                                                                        }}
                                                                    >
                                                                        {row.activo ? 'Desactivar' : 'Activar'}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="text-red-400 hover:text-red-300 hover:underline"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setConfirmDeleteColaboradorRow(row);
                                                                        }}
                                                                    >
                                                                        Eliminar
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                    {!coLoading && coTotal > 0 ? (
                                        <div className={dash.footerBar}>
                                            <span>
                                                Mostrando {coRangeFrom}–{coRangeTo} de {coTotal} · Página {safeCoPage} de{' '}
                                                {coTotalPages}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setCoPage((p) => Math.max(1, p - 1))}
                                                    disabled={safeCoPage <= 1}
                                                    className={dash.compactBtn}
                                                >
                                                    Anterior
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setCoPage((p) => Math.min(coTotalPages, p + 1))}
                                                    disabled={safeCoPage >= coTotalPages}
                                                    className={dash.compactBtn}
                                                >
                                                    Siguiente
                                                </button>
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    )}

                    {mainView === 'catalogoTi' && showTiCatalogSubmod ? (
                        <RolesTiCatalogPage token={token} auth={auth} embedInDirectorio />
                    ) : null}

                    {mainView === 'reubicaciones' ? (
                        <ReubicacionesPipelinePage token={token} navIntent={reubicacionesNavIntent} />
                    ) : null}

                    {mainView === 'mallasTurnos' ? (
                        <MallasTurnosModule token={token} auth={auth} />
                    ) : null}

                    {mainView === 'seguimiento' ? <SeguimientoView token={token} /> : null}

                    {mainView === 'monitoreo' && canAccessMonitoreo ? <MonitoreoActividadesView /> : null}

                    {mainView === 'cliente' ? (
                        <ModuleFiltersDrawer
                            open={filtersPanelOpen}
                            onClose={() => setFiltersPanelOpen(false)}
                            onClear={clearClienteFilters}
                            dash={dash}
                            panelId="directorio-cliente-filtros-panel"
                            titleId="directorio-cliente-filtros-drawer-title"
                        >
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="directorio-cliente-estado" className={dash.filtrosDrawerLabel}>
                                    Estado
                                </label>
                                <select
                                    id="directorio-cliente-estado"
                                    className={`${field} w-full text-sm`}
                                    value={clActivo}
                                    onChange={(e) => {
                                        setClActivo(e.target.value);
                                        setClPage(1);
                                    }}
                                >
                                    <option value="all">Todos</option>
                                    <option value="true">Activos</option>
                                    <option value="false">Inactivos</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="directorio-cliente-pagesize" className={dash.filtrosDrawerLabel}>
                                    Mostrar por página
                                </label>
                                <select
                                    id="directorio-cliente-pagesize"
                                    className={`${field} w-full text-sm`}
                                    value={clPageSize}
                                    onChange={(e) => {
                                        setClPageSize(Number(e.target.value));
                                        setClPage(1);
                                    }}
                                >
                                    <option value={10}>10 por página</option>
                                    <option value={20}>20 por página</option>
                                    <option value={50}>50 por página</option>
                                </select>
                            </div>
                            <button type="button" onClick={() => loadCatalogo()} className={dash.toolbarBtn}>
                                Refrescar
                            </button>
                        </ModuleFiltersDrawer>
                    ) : null}

                    {mainView === 'consultores' ? (
                        <ModuleFiltersDrawer
                            open={filtersPanelOpen}
                            onClose={() => setFiltersPanelOpen(false)}
                            onClear={clearConsultoresFilters}
                            dash={dash}
                            panelId="directorio-consultores-filtros-panel"
                            titleId="directorio-consultores-filtros-drawer-title"
                        >
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="directorio-consultores-activo" className={dash.filtrosDrawerLabel}>
                                    Activo
                                </label>
                                <select
                                    id="directorio-consultores-activo"
                                    className={`${field} w-full text-sm`}
                                    value={coActivo}
                                    onChange={(e) => {
                                        setCoActivo(e.target.value);
                                        setCoPage(1);
                                    }}
                                >
                                    <option value="all">Todos</option>
                                    <option value="true">Activos</option>
                                    <option value="false">Inactivos</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="directorio-consultores-tipo" className={dash.filtrosDrawerLabel}>
                                    Tipo de contrato
                                </label>
                                <input
                                    id="directorio-consultores-tipo"
                                    className={`${field} w-full text-sm`}
                                    value={coTipoContrato}
                                    onChange={(e) => {
                                        setCoTipoContrato(e.target.value);
                                        setCoPage(1);
                                    }}
                                    placeholder="Ej. Indefinido, Obra labor…"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label htmlFor="directorio-consultores-pagesize" className={dash.filtrosDrawerLabel}>
                                    Mostrar por página
                                </label>
                                <select
                                    id="directorio-consultores-pagesize"
                                    className={`${field} w-full text-sm`}
                                    value={coPageSize}
                                    onChange={(e) => {
                                        setCoPageSize(Number(e.target.value));
                                        setCoPage(1);
                                    }}
                                >
                                    <option value={10}>10 por página</option>
                                    <option value={20}>20 por página</option>
                                    <option value={50}>50 por página</option>
                                </select>
                            </div>
                            <button type="button" onClick={() => loadColaboradores()} className={dash.toolbarBtn}>
                                Refrescar
                            </button>
                        </ModuleFiltersDrawer>
                    ) : null}
                </main>
            </div>

            <GestionModalShell
                open={clienteModalOpen}
                onClose={() => setClienteModalOpen(false)}
                title="Crear cliente (y primer líder)"
                subtitle="Alta en catálogo cliente-líder"
                size="md"
                footer={(
                    <div className="flex flex-wrap gap-2 justify-end w-full">
                        <button type="submit" form="cliente-create-form" className={dash.btnPrimaryCinte}>
                            Guardar
                        </button>
                        <button type="button" className={dash.borrarFiltros} onClick={() => setClienteModalOpen(false)}>
                            Cancelar
                        </button>
                    </div>
                )}
            >
                <form id="cliente-create-form" onSubmit={submitClienteModal} className="space-y-4">
                    <div>
                        <label className={`block ${dash.filtrosDrawerLabel} mb-1`}>Cliente</label>
                        <input
                            className={`w-full ${field}`}
                            value={clienteForm.cliente}
                            onChange={(e) => setClienteForm((f) => ({ ...f, cliente: e.target.value }))}
                            required
                        />
                    </div>
                    <div>
                        <label className={`block ${dash.filtrosDrawerLabel} mb-1`}>NIT</label>
                        <input
                            className={`w-full ${field}`}
                            value={clienteForm.nit}
                            onChange={(e) => setClienteForm((f) => ({ ...f, nit: e.target.value }))}
                            inputMode="numeric"
                            autoComplete="off"
                            placeholder="Solo números"
                            required
                        />
                        <p className={`text-xs ${dash.modalMuted} mt-1`}>Obligatorio; se guardan solo dígitos.</p>
                    </div>
                    <div>
                        <label className={`block ${dash.filtrosDrawerLabel} mb-1`}>Líder</label>
                        <input
                            className={`w-full ${field}`}
                            value={clienteForm.lider}
                            onChange={(e) => setClienteForm((f) => ({ ...f, lider: e.target.value }))}
                            required
                        />
                    </div>
                    <div>
                        <label className={`block ${dash.filtrosDrawerLabel} mb-1`}>Gerente de Servicio asignado</label>
                        <GerenteServicioSelect
                            className={`w-full ${field}`}
                            value={clienteForm.gp_colaborador_cedula}
                            onChange={(e) =>
                                setClienteForm((f) => ({
                                    ...f,
                                    gp_colaborador_cedula: e.target.value
                                }))
                            }
                            options={gsCinteOptions}
                            loading={gsCinteOptionsLoading}
                        />
                        {!gsCinteOptionsLoading && gsCinteOptions.length === 0 ? (
                            <p className={`text-xs ${dash.modalMuted} mt-1`}>
                                No hay colaboradores CINTE en el directorio.
                            </p>
                        ) : !gsCinteOptionsLoading ? (
                            <p className={`text-xs ${dash.modalMuted} mt-1`}>
                                Solo personal con cliente CINTE. Si no tiene correo Cinte, no puede seleccionarse.
                            </p>
                        ) : null}
                    </div>
                </form>
            </GestionModalShell>

            <GestionModalShell
                open={Boolean(clienteDetailModal)}
                onClose={() => {
                    if (!editClienteSaving) closeClienteDetailModal();
                }}
                disableClose={editClienteSaving}
                title="Cliente"
                subtitle={clienteDetailModal?.cliente || ''}
                size="wide"
                footer={
                    clienteDetailModal?.mode === 'view' ? (
                        <div className="flex flex-wrap gap-2 justify-end w-full">
                            <button
                                type="button"
                                onClick={() => void enterClienteDetailEditMode()}
                                className={dash.btnPrimaryCinte}
                            >
                                Editar cliente
                            </button>
                            <button
                                type="button"
                                onClick={() => void prepareAddLiderForm()}
                                className={dash.btnPrimaryCinte}
                            >
                                Agregar líder
                            </button>
                            <button type="button" className={dash.borrarFiltros} onClick={() => closeClienteDetailModal()}>
                                Cerrar
                            </button>
                        </div>
                    ) : clienteDetailModal?.mode === 'edit' ? (
                        <div className="flex flex-wrap gap-2 justify-end w-full">
                            <button
                                type="submit"
                                form="cliente-detail-edit-form"
                                disabled={editClienteRowsLoading || editClienteSaving}
                                className={`${dash.btnPrimaryCinte} disabled:opacity-40`}
                            >
                                {editClienteSaving ? 'Guardando…' : 'Guardar'}
                            </button>
                            <button
                                type="button"
                                disabled={editClienteSaving}
                                className={`${dash.borrarFiltros} disabled:opacity-40`}
                                onClick={() => {
                                    setEditClienteGpSelectHint('');
                                    setEditClienteNitHint('');
                                    setClienteDetailModal((m) => (m ? { cliente: m.cliente, mode: 'view' } : null));
                                }}
                            >
                                Cancelar
                            </button>
                        </div>
                    ) : clienteDetailModal?.mode === 'addLider' ? (
                        <div className="flex flex-wrap gap-2 justify-end w-full">
                            <button type="submit" form="cliente-detail-add-lider-form" className={dash.btnPrimaryCinte}>
                                Guardar
                            </button>
                            <button
                                type="button"
                                className={dash.borrarFiltros}
                                onClick={() =>
                                    setClienteDetailModal((m) => (m ? { cliente: m.cliente, mode: 'view' } : null))
                                }
                            >
                                Cancelar
                            </button>
                        </div>
                    ) : null
                }
            >
                {clienteDetailModal?.mode === 'view' ? (
                    <div className="space-y-4">
                        <div className={`${dash.modalGrid} ${dash.modalInfoGrid}`}>
                            <div>
                                <p className={dash.labelFilter}>Nombre</p>
                                <p className="mt-1 font-semibold">{clienteDetailModal.cliente}</p>
                            </div>
                            <div>
                                <p className={dash.labelFilter}>NIT</p>
                                <p className="mt-1 tabular-nums">
                                    {nitDisplayForCliente(detailResumenRow, leadersModalRows)}
                                </p>
                            </div>
                            <div className="md:col-span-2">
                                <p className={dash.labelFilter}>Gerente de Servicio asignado</p>
                                {(() => {
                                    const gsInfo = gsDisplayForCliente(
                                        detailResumenRow,
                                        leadersModalRows,
                                        gpLabelById
                                    );
                                    return (
                                        <p
                                            className={`mt-1 ${
                                                gsInfo.conflict
                                                    ? isLight
                                                        ? 'text-amber-700'
                                                        : 'text-amber-300/90'
                                                    : ''
                                            }`}
                                        >
                                            {gsInfo.label}
                                        </p>
                                    );
                                })()}
                            </div>
                        </div>
                        <div>
                            <h3 className={`${dash.titleLg} mb-3`}>Líderes</h3>
                            <GestionDataTable
                                columns={leadersModalColumns}
                                rows={leadersModalLoading ? [] : leadersModalRows}
                                isLight={isLight}
                                emptyText={leadersModalLoading ? 'Cargando líderes…' : 'Sin líderes para este cliente'}
                            />
                        </div>
                    </div>
                ) : null}

                {clienteDetailModal?.mode === 'edit' ? (
                    <form id="cliente-detail-edit-form" onSubmit={submitEditClienteModal} className="space-y-4">
                        {editClienteRowsLoading ? (
                            <p className={dash.modalMuted}>Cargando datos del catálogo…</p>
                        ) : (
                            <>
                                <p className={`text-xs ${dash.modalMuted}`}>
                                    Los cambios se aplican a todas las filas del cliente en el catálogo (
                                    {editClienteTargetRows.length} líder
                                    {editClienteTargetRows.length === 1 ? '' : 'es'}).
                                </p>
                                {[
                                    ...new Set(
                                        editClienteTargetRows.map((r) => r.gp_user_id).filter(Boolean).map(String)
                                    )
                                ].length > 1 ? (
                                    <p className={`text-xs ${isLight ? 'text-amber-800' : 'text-amber-300/90'}`}>
                                        Había Gerentes de Servicio distintos por líder; el valor que elijas unificará el
                                        GS en todas las filas.
                                    </p>
                                ) : null}
                                <div>
                                    <label className={`block ${dash.filtrosDrawerLabel} mb-1`}>Nombre del cliente</label>
                                    <input
                                        className={`w-full ${field}`}
                                        value={editClienteForm.nombre}
                                        onChange={(e) =>
                                            setEditClienteForm((f) => ({ ...f, nombre: e.target.value }))
                                        }
                                        required
                                    />
                                </div>
                                <div>
                                    <label className={`block ${dash.filtrosDrawerLabel} mb-1`}>NIT</label>
                                    <input
                                        className={`w-full ${field}`}
                                        value={editClienteForm.nit}
                                        onChange={(e) => setEditClienteForm((f) => ({ ...f, nit: e.target.value }))}
                                        inputMode="numeric"
                                        autoComplete="off"
                                        placeholder="Solo números"
                                        required
                                    />
                                    {editClienteNitHint ? (
                                        <p className={`text-xs mt-1 ${isLight ? 'text-amber-800' : 'text-amber-300/90'}`}>
                                            {editClienteNitHint}
                                        </p>
                                    ) : (
                                        <p className={`text-xs ${dash.modalMuted} mt-1`}>
                                            Se aplica a todas las filas del cliente; solo dígitos.
                                        </p>
                                    )}
                                </div>
                                <div>
                                    <label className={`block ${dash.filtrosDrawerLabel} mb-1`}>
                                        Gerente de Servicio asignado
                                    </label>
                                    <GerenteServicioSelect
                                        className={`w-full ${field}`}
                                        value={editClienteForm.gp_colaborador_cedula}
                                        options={gsCinteOptions}
                                        loading={gsCinteOptionsLoading}
                                        onChange={(e) =>
                                            setEditClienteForm((f) => ({
                                                ...f,
                                                gp_colaborador_cedula: e.target.value
                                            }))
                                        }
                                    />
                                    {editClienteGpSelectHint ? (
                                        <p className={`text-xs mt-1 ${isLight ? 'text-amber-800' : 'text-amber-300/90'}`}>
                                            {editClienteGpSelectHint}
                                        </p>
                                    ) : (
                                        <p className={`text-xs ${dash.modalMuted} mt-1`}>
                                            Solo personal con cliente CINTE.
                                        </p>
                                    )}
                                </div>
                            </>
                        )}
                    </form>
                ) : null}

                {clienteDetailModal?.mode === 'addLider' ? (
                    <form id="cliente-detail-add-lider-form" onSubmit={submitAddLiderModal} className="space-y-4">
                        <div>
                            <label className={`block ${dash.filtrosDrawerLabel} mb-1`}>NIT</label>
                            <input
                                className={`w-full ${field}`}
                                value={addLiderForm.nit}
                                readOnly
                                disabled
                                inputMode="numeric"
                                autoComplete="off"
                                placeholder="NIT del cliente"
                                required
                            />
                            <p className={`text-xs ${dash.modalMuted} mt-1`}>Heredado del cliente; no editable.</p>
                        </div>
                        <div>
                            <label className={`block ${dash.filtrosDrawerLabel} mb-1`}>Líder</label>
                            <input
                                className={`w-full ${field}`}
                                value={addLiderForm.lider}
                                onChange={(e) => setAddLiderForm((f) => ({ ...f, lider: e.target.value }))}
                                required
                            />
                        </div>
                        <div>
                            <label className={`block ${dash.filtrosDrawerLabel} mb-1`}>
                                Gerente de Servicio asignado
                            </label>
                            <GerenteServicioSelect
                                className={`w-full ${field}`}
                                value={addLiderForm.gp_colaborador_cedula}
                                options={gsCinteOptions}
                                loading={gsCinteOptionsLoading}
                                onChange={(e) =>
                                    setAddLiderForm((f) => ({
                                        ...f,
                                        gp_colaborador_cedula: e.target.value
                                    }))
                                }
                            />
                            <p className={`text-xs ${dash.modalMuted} mt-1`}>Solo personal con cliente CINTE.</p>
                        </div>
                    </form>
                ) : null}
            </GestionModalShell>

            {staffModalOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="modal-glass-scrim absolute inset-0 transition-opacity"
                        onClick={() => setStaffModalOpen(false)}
                    />
                    <div className="modal-glass-sheet font-body relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[var(--border)] p-0 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-soft)] px-5 py-4">
                            <h2 className="text-lg font-heading font-bold text-[var(--text)]">
                                {staffModalMode === 'create' ? 'Crear colaborador' : `Editar colaborador`}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setStaffModalOpen(false)}
                                className="rounded-lg p-2 text-[rgba(159,179,200,0.95)] hover:bg-slate-800/50"
                                aria-label="Cerrar"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={submitStaffModal} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                            <div className="border-b border-[var(--border)] px-5 flex flex-wrap gap-1">
                                {CO_TABS.map((tab) => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setStaffFichaTab(tab.id)}
                                        className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${
                                            staffFichaTab === tab.id
                                                ? 'border-[#2F7BB8] text-[var(--text)]'
                                                : `border-transparent ${labelMuted}`
                                        }`}
                                    >
                                        {tab.shortTitle || tab.title}
                                    </button>
                                ))}
                            </div>
                            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
                                <ColaboradorFichaFields
                                    value={coForm}
                                    onChange={(patch) => setCoForm((f) => ({ ...f, ...patch }))}
                                    mode={staffModalMode}
                                    clientes={catalogClientes}
                                    liderOptions={liderOptions}
                                    liderLoading={liderLoading}
                                    onClienteChange={(v) => fetchLideresForCliente(v)}
                                    activeTabId={staffFichaTab}
                                />
                            </div>

                            <div className="flex gap-2 border-t border-[var(--border)] p-5">
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-md bg-[#2F7BB8] text-white text-sm font-semibold"
                                >
                                    Guardar
                                </button>
                                <button
                                    type="button"
                                    className={outlineBtn}
                                    onClick={() => setStaffModalOpen(false)}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {confirmDeleteColaboradorRow ? (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div
                        className="modal-glass-scrim absolute inset-0 transition-opacity"
                        onClick={() => setConfirmDeleteColaboradorRow(null)}
                    />
                    <div className="modal-glass-sheet font-body relative w-full max-w-md rounded-2xl border border-[var(--border)] p-6 shadow-2xl">
                        <p className={`text-sm ${isLight ? 'text-slate-700' : 'text-[var(--text)]'}`}>
                            ¿Eliminar definitivamente al colaborador con cédula{' '}
                            <strong>{confirmDeleteColaboradorRow.cedula}</strong>? Esta acción no se puede deshacer.
                        </p>
                        <div className="mt-4 flex gap-2 justify-end">
                            <button
                                type="button"
                                className={outlineBtn}
                                onClick={() => setConfirmDeleteColaboradorRow(null)}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="px-3 py-2 rounded-md bg-rose-600/90 text-white text-sm font-semibold"
                                onClick={() => deleteColaboradorRow(confirmDeleteColaboradorRow)}
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            <GestionModalShell
                open={Boolean(confirmDeactivateCatalog && selectedCatalogCliente)}
                onClose={() => setConfirmDeactivateCatalog(false)}
                title="Desactivar cliente"
                size="md"
                footer={(
                    <div className="flex flex-wrap gap-2 justify-end w-full">
                        <button type="button" className={dash.borrarFiltros} onClick={() => setConfirmDeactivateCatalog(false)}>
                            Cancelar
                        </button>
                        <button
                            type="button"
                            className="px-3 py-2 rounded-md bg-rose-600/90 text-white text-sm font-semibold"
                            onClick={async () => {
                                try {
                                    await deactivateAllRowsForClient(selectedCatalogCliente);
                                    flash('Cliente desactivado en catálogo (todos los líderes).');
                                    setConfirmDeactivateCatalog(false);
                                    setSelectedCatalogCliente(null);
                                    closeClienteDetailModal();
                                    await loadCatalogo();
                                    if (mainView === 'consultores') loadCatalogoActivoForStaff();
                                } catch (err) {
                                    flash(String(err.message || err), false);
                                }
                            }}
                        >
                            Desactivar todo
                        </button>
                    </div>
                )}
            >
                <p className={`text-sm ${dash.modalMuted}`}>
                    ¿Desactivar <strong>todos los líderes</strong> del cliente{' '}
                    <strong>{selectedCatalogCliente}</strong> en el catálogo? Los registros permanecen en la base de
                    datos; con el filtro «Activos» el cliente dejará de mostrarse en la tabla.
                </p>
            </GestionModalShell>

            <GestionModalShell
                open={Boolean(confirmDeleteLiderRow)}
                onClose={() => setConfirmDeleteLiderRow(null)}
                title="Eliminar líder"
                size="md"
                footer={(
                    <div className="flex flex-wrap gap-2 justify-end w-full">
                        <button type="button" className={dash.borrarFiltros} onClick={() => setConfirmDeleteLiderRow(null)}>
                            Cancelar
                        </button>
                        <button
                            type="button"
                            className="px-3 py-2 rounded-md bg-rose-600/90 text-white text-sm font-semibold"
                            onClick={() => deleteLiderRow(confirmDeleteLiderRow)}
                        >
                            Eliminar
                        </button>
                    </div>
                )}
            >
                <p className={`text-sm ${dash.modalMuted}`}>
                    ¿Eliminar definitivamente al líder <strong>{confirmDeleteLiderRow?.lider}</strong> del catálogo?
                    Esta acción no se puede deshacer.
                </p>
            </GestionModalShell>
        </div>
    );
}
