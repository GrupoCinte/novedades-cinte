import { apiFetch } from '@cinte/api-client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    ArrowDown,
    ArrowRightLeft,
    ArrowUp,
    Building2,
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Home,
    LayoutDashboard,
    Layers,
    Menu,
    Users,
    X
} from 'lucide-react';
import { useModuleTheme } from './moduleTheme.js';
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
import RolesTiCatalogPage from './cotizador/RolesTiCatalogPage';
import ReubicacionesPipelinePage from './ReubicacionesPipelinePage';
import AdministracionDashboardPage from './AdministracionDashboardPage';
import MallasTurnosModule from './MallasTurnosModule';
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

function resolveGpUserIdFromCatalogRows(rows, cliente, lider) {
    const fc = foldCatalogMatch(cliente);
    const fl = foldCatalogMatch(lider);
    if (!fc || !fl) return null;
    const hit = rows.find((r) => foldCatalogMatch(r.cliente) === fc && foldCatalogMatch(r.lider) === fl);
    if (!hit?.gp_user_id) return null;
    return String(hit.gp_user_id);
}

function GpUserSelect({ value, onChange, options, className }) {
    const missing = value && !options.some((g) => g.id === value);
    return (
        <select className={className} value={value} onChange={onChange}>
            <option value="">— Sin GP —</option>
            {missing ? (
                <option value={value}>
                    {value} (GP inactivo o no listado)
                </option>
            ) : null}
            {options.map((g) => (
                <option key={g.id} value={g.id}>
                    {(g.full_name || g.email || '').trim()} ({g.email})
                    {!g.is_active ? ' — inactivo' : ''}
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

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    /** Vista principal del sidebar */
    const [mainView, setMainView] = useState('cliente');

    useEffect(() => {
        setFiltersPanelOpen(false);
    }, [mainView]);

    const showTiCatalogSubmod = userHasRolesTiCatalogRead(auth);
    useEffect(() => {
        const v = searchParams.get('v');
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
    }, [searchParams, setSearchParams, showTiCatalogSubmod]);

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
    /** Modal detalle: lista de líderes del cliente */
    const [leadersModalCliente, setLeadersModalCliente] = useState(null);
    const [addLiderModalOpen, setAddLiderModalOpen] = useState(false);
    const [addLiderForm, setAddLiderForm] = useState({ lider: '', gp_user_id: '', nit: '' });
    const [clienteModalOpen, setClienteModalOpen] = useState(false);
    const [clienteForm, setClienteForm] = useState({ cliente: '', nit: '', lider: '', gp_colaborador_cedula: '' });
    const [confirmDeactivateCatalog, setConfirmDeactivateCatalog] = useState(false);
    /** Modal editar cliente (nombre + GP desde colaboradores). */
    const [editClienteModalOpen, setEditClienteModalOpen] = useState(false);
    const [editClienteOriginalName, setEditClienteOriginalName] = useState('');
    const [editClienteForm, setEditClienteForm] = useState({ nombre: '', nit: '', gp_colaborador_cedula: '' });
    const [editClienteNitHint, setEditClienteNitHint] = useState('');
    const [editClienteTargetRows, setEditClienteTargetRows] = useState([]);
    const [editClienteRowsLoading, setEditClienteRowsLoading] = useState(false);
    const [editClienteGpOptions, setEditClienteGpOptions] = useState([]);
    const [editClienteGpOptionsLoading, setEditClienteGpOptionsLoading] = useState(false);
    /** Aviso si hay un GP único en catálogo pero no se pudo preseleccionar colaborador por correo. */
    const [editClienteGpSelectHint, setEditClienteGpSelectHint] = useState('');
    const [editClienteSaving, setEditClienteSaving] = useState(false);
    const [clienteGpOptions, setClienteGpOptions] = useState([]);
    const [clienteGpOptionsLoading, setClienteGpOptionsLoading] = useState(false);

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
    const [gpSelectOptions, setGpSelectOptions] = useState([]);

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
                const res = await apiFetch(`/api/directorio/clientes-lideres?${u}`, { headers: authHeaders(token) });
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
            const res = await apiFetch(`/api/directorio/clientes-resumen?${u}`, { headers: authHeaders(token) });
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
            const res = await apiFetch(`/api/directorio/clientes-lideres?${u}`, { headers: authHeaders(token) });
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
            const res = await apiFetch(`/api/directorio/colaboradores?${u}`, { headers: authHeaders(token) });
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
            const res = await apiFetch('/api/catalogos/clientes', { credentials: 'include' });
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
            const res = await apiFetch(`/api/catalogos/lideres?cliente=${encodeURIComponent(c)}`, {
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
                const res = await apiFetch('/api/directorio/gp', { headers: authHeaders(token) });
                const data = await res.json().catch(() => ({}));
                if (!res.ok || cancelled) return;
                const items = data.items || [];
                setGpItems(items);
                setGpSelectOptions(items);
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
            const res = await apiFetch(`/api/directorio/clientes-lideres/${row.id}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: authHeaders(token),
                body: JSON.stringify(patch)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            flash('Actualizado.');
            await loadCatalogo();
            if (leadersModalCliente) await fetchLeadersForCliente(leadersModalCliente);
            if (mainView === 'consultores') loadCatalogoActivoForStaff();
        } catch (err) {
            flash(String(err.message || err), false);
        }
    }

    async function openClienteModalCreate() {
        setClienteForm({ cliente: '', nit: '', lider: '', gp_colaborador_cedula: '' });
        setClienteGpOptions([]);
        setClienteGpOptionsLoading(true);
        setClienteModalOpen(true);
        try {
            const opts = await fetchColaboradoresAllPagesForGpSelect();
            setClienteGpOptions(opts);
        } catch (e) {
            flash(String(e.message || e), false);
        } finally {
            setClienteGpOptionsLoading(false);
        }
    }

    function openLeadersModalForCliente(cliente) {
        setLeadersModalCliente(cliente);
        setAddLiderModalOpen(false);
        void fetchLeadersForCliente(cliente);
    }

    /** Todos los colaboradores (activos e inactivos), una fila por cédula; seleccionable si tiene correo Cinte. */
    async function fetchColaboradoresAllPagesForGpSelect() {
        const all = [];
        let offset = 0;
        const limit = 200;
        for (;;) {
            const u = new URLSearchParams();
            u.set('activo', 'all');
            u.set('limit', String(limit));
            u.set('offset', String(offset));
            const res = await apiFetch(`/api/directorio/colaboradores?${u}`, { headers: authHeaders(token) });
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
            const correoNorm = em.toLowerCase();
            let label = nm || cedula || '—';
            if (em) label += ` (${em})`;
            if (cedula) label += ` · ${cedula}`;
            if (!row.activo) label += ' — inactivo';
            if (!em) label += ' — sin correo Cinte';
            return {
                cedula,
                value: cedula,
                label,
                disabled: !em,
                correoNorm,
                gp_user_id: gid || null
            };
        });
        opts.sort((a, b) =>
            a.label.localeCompare(b.label, 'es', { numeric: true, sensitivity: 'base' })
        );
        return opts;
    }

    function closeEditClienteModal() {
        setEditClienteGpSelectHint('');
        setEditClienteNitHint('');
        setEditClienteModalOpen(false);
    }

    async function openEditClienteModalForCliente(cliente) {
        const original = String(cliente || '').trim();
        if (!original) {
            flash('Cliente no válido.', false);
            return;
        }
        setSelectedCatalogCliente(original);
        setEditClienteOriginalName(original);
        setEditClienteForm({ nombre: original, nit: '', gp_colaborador_cedula: '' });
        setEditClienteTargetRows([]);
        setEditClienteGpOptions([]);
        setEditClienteGpSelectHint('');
        setEditClienteNitHint('');
        setEditClienteModalOpen(true);
        setEditClienteRowsLoading(true);
        setEditClienteGpOptionsLoading(true);
        try {
            const u = new URLSearchParams();
            u.set('cliente', original);
            u.set('activo', 'all');
            u.set('limit', '2000');
            u.set('offset', '0');
            const res = await apiFetch(`/api/directorio/clientes-lideres?${u}`, { headers: authHeaders(token) });
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
            let opts = [];
            try {
                opts = await fetchColaboradoresAllPagesForGpSelect();
            } catch (e2) {
                flash(String(e2.message || e2), false);
            }
            setEditClienteGpOptions(opts);
            if (gpIds.length === 1) {
                const uid = gpIds[0];
                let gpEmailNorm = '';
                let gpUserFound = false;
                let gHit = gpItems.find((g) => String(g.id) === uid);
                if (gHit) gpUserFound = true;
                if (gHit?.email) gpEmailNorm = String(gHit.email).trim().toLowerCase();
                if (!gpEmailNorm) {
                    try {
                        const gpRes = await apiFetch('/api/directorio/gp', { headers: authHeaders(token) });
                        const gpJson = await gpRes.json().catch(() => ({}));
                        const gpRows = gpRes.ok && Array.isArray(gpJson.items) ? gpJson.items : [];
                        const g2 = gpRows.find((g) => String(g.id) === uid);
                        if (g2) gpUserFound = true;
                        if (g2?.email) gpEmailNorm = String(g2.email).trim().toLowerCase();
                    } catch {
                        /* ignore */
                    }
                }
                if (gpEmailNorm) {
                    const match = opts.find((o) => !o.disabled && o.correoNorm === gpEmailNorm);
                    initialGpCedula = match?.cedula || '';
                    if (!initialGpCedula) {
                        gpSelectHint =
                            'No hay colaborador con el mismo correo Cinte que el usuario GP; elija manualmente en la lista.';
                    }
                } else if (gpUserFound) {
                    gpSelectHint = 'El usuario GP no tiene correo registrado; elija manualmente en la lista.';
                } else {
                    gpSelectHint = 'El GP del catálogo no está en la lista de usuarios GP; elija manualmente en la lista.';
                }
            }
            setEditClienteGpSelectHint(gpSelectHint);
            setEditClienteForm({ nombre: original, nit: initialNit, gp_colaborador_cedula: initialGpCedula });
        } catch (e) {
            flash(String(e.message || e), false);
            closeEditClienteModal();
        } finally {
            setEditClienteRowsLoading(false);
            setEditClienteGpOptionsLoading(false);
        }
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
        const gpCedula = String(editClienteForm.gp_colaborador_cedula || '').trim() || null;
        if (!editClienteTargetRows.length) {
            flash('No hay filas de catálogo para este cliente.', false);
            return;
        }
        setEditClienteSaving(true);
        try {
            for (const row of editClienteTargetRows) {
                const res = await apiFetch(`/api/directorio/clientes-lideres/${row.id}`, {
                    method: 'PATCH',
                    credentials: 'include',
                    headers: authHeaders(token),
                    body: JSON.stringify({
                        cliente: nombre,
                        gp_colaborador_cedula: gpCedula,
                        nit: nitDigits
                    })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || res.statusText);
            }
            await loadCatalogo();
            flash('Cliente actualizado.');
            closeEditClienteModal();
            if (selectedCatalogCliente === editClienteOriginalName) {
                setSelectedCatalogCliente(nombre);
            }
            if (leadersModalCliente === editClienteOriginalName) {
                setLeadersModalCliente(nombre);
            }
            if (mainView === 'consultores') await loadCatalogoActivoForStaff();
        } catch (err) {
            flash(String(err.message || err), false);
        } finally {
            setEditClienteSaving(false);
        }
    }

    function openAddLiderModal() {
        if (!leadersModalCliente) return;
        const rows = leadersModalRows;
        const firstGp = rows.map((r) => r.gp_user_id).find(Boolean);
        const nitFromRows = rows.map((r) => nitSoloDigitos(r.nit)).find(Boolean) || '';
        setAddLiderForm({
            lider: '',
            gp_user_id: firstGp ? String(firstGp) : '',
            nit: nitFromRows
        });
        setAddLiderModalOpen(true);
    }

    async function submitAddLiderModal(e) {
        e.preventDefault();
        if (!leadersModalCliente) return;
        const nitDigits = nitSoloDigitos(addLiderForm.nit);
        if (!nitDigits) {
            flash('El NIT es obligatorio (al menos un dígito).', false);
            return;
        }
        try {
            const gpVal = addLiderForm.gp_user_id ? String(addLiderForm.gp_user_id).trim() : null;
            const res = await apiFetch('/api/directorio/clientes-lideres', {
                method: 'POST',
                credentials: 'include',
                headers: authHeaders(token),
                body: JSON.stringify({
                    cliente: leadersModalCliente,
                    lider: addLiderForm.lider,
                    nit: nitDigits,
                    gp_user_id: gpVal
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            flash('Líder agregado al catálogo.');
            setAddLiderModalOpen(false);
            await loadCatalogo();
            if (leadersModalCliente) await fetchLeadersForCliente(leadersModalCliente);
            if (mainView === 'consultores') loadCatalogoActivoForStaff();
            refreshGpList();
        } catch (err) {
            flash(String(err.message || err), false);
        }
    }

    async function refreshGpList() {
        try {
            const res = await apiFetch('/api/directorio/gp', { headers: authHeaders(token) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) return;
            const items = data.items || [];
            setGpItems(items);
            setGpSelectOptions(items);
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
            const res = await apiFetch('/api/directorio/clientes-lideres', {
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
        const res = await apiFetch(`/api/directorio/clientes-lideres?${u}`, { headers: authHeaders(token) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || res.statusText);
        const rows = data.items || [];
        for (const row of rows) {
            if (!row.activo) continue;
            const res = await apiFetch(`/api/directorio/clientes-lideres/${row.id}`, {
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
                const res = await apiFetch('/api/directorio/colaboradores', {
                    method: 'POST',
                    credentials: 'include',
                    headers: authHeaders(token),
                    body: JSON.stringify(body)
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || res.statusText);
                flash('Colaborador creado.');
            } else if (selectedCoCedula) {
                const res = await apiFetch(`/api/directorio/colaboradores/${encodeURIComponent(selectedCoCedula)}`, {
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
        const ok = window.confirm(
            `¿Eliminar definitivamente al colaborador con cédula ${row.cedula}? Esta acción no se puede deshacer.`
        );
        if (!ok) return;
        try {
            const res = await apiFetch(`/api/directorio/colaboradores/${encodeURIComponent(row.cedula)}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: authHeaders(token)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            flash('Colaborador eliminado.');
            setSelectedCoCedula(null);
            loadColaboradores();
        } catch (err) {
            flash(String(err.message || err), false);
        }
    }

    async function patchColaborador(cedula, patch) {
        try {
            const res = await apiFetch(`/api/directorio/colaboradores/${encodeURIComponent(cedula)}`, {
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
                                    className={`${dash.toolbarBtn} shrink-0 bg-[#2F7BB8] text-white hover:bg-[#25649a] border-[#2F7BB8]`}
                                >
                                    Crear nuevo cliente
                                </button>
                            </ModuleFiltersToolbar>
                            <div className={`${dash.cardFlex} min-h-0 flex-1`}>
                                <div className={dash.tableWrap}>
                                    <div className="min-h-0 flex-1 overflow-x-auto overflow-y-auto">
                                        <table className="w-full min-w-[720px] border-collapse text-left">
                                            <thead>
                                                <tr className={dash.thead}>
                                                    <th className="w-10 p-4 pl-6 font-semibold" />
                                                    <th className="p-4 font-semibold">Cliente</th>
                                                    <th className="p-4 font-semibold">NIT</th>
                                                    <th className="p-4 font-semibold">Líderes (activos / total)</th>
                                                    <th className="p-4 font-semibold">GP</th>
                                                    <th className="p-4 font-semibold whitespace-nowrap">Editar</th>
                                                    <th className="p-4 pr-6 font-semibold whitespace-nowrap">Borrar</th>
                                                </tr>
                                            </thead>
                                            <tbody className={dash.tbody}>
                                                {clLoading ? (
                                                    <tr>
                                                        <td colSpan={7} className={`p-12 text-center font-medium ${dash.muted}`}>
                                                            Cargando…
                                                        </td>
                                                    </tr>
                                                ) : clItems.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={7} className={`p-12 text-center font-medium ${dash.muted}`}>
                                                            Sin datos
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    clItems.map((g) => {
                                                        const activeCount = Number(g.active_count) || 0;
                                                        const totalCount = Number(g.total_count) || 0;
                                                        const gpN = Number(g.gp_distinct_count) || 0;
                                                        let gpText = '—';
                                                        let gpConflict = false;
                                                        if (gpN > 1) {
                                                            gpConflict = true;
                                                            gpText = 'GP distintos por líder';
                                                        } else if (g.gp_user_id) {
                                                            const id = String(g.gp_user_id);
                                                            const backendName = String(g.gp_full_name || '').trim();
                                                            gpText =
                                                                backendName || gpLabelById.get(id) || 'GP no disponible';
                                                        }
                                                        const selected = selectedCatalogCliente === g.cliente;
                                                        return (
                                                            <tr
                                                                key={g.cliente}
                                                                className={`${dash.trHover} cursor-pointer ${
                                                                    selected
                                                                        ? isLight
                                                                            ? 'bg-sky-100'
                                                                            : 'bg-[#0f2942]/80'
                                                                        : ''
                                                                }`}
                                                                onClick={() => {
                                                                    setSelectedCatalogCliente(g.cliente);
                                                                    openLeadersModalForCliente(g.cliente);
                                                                }}
                                                            >
                                                                <td className="p-4 pl-6">
                                                                    <input
                                                                        type="radio"
                                                                        className="accent-[#65BCF7]"
                                                                        checked={selected}
                                                                        onChange={() => {
                                                                            setSelectedCatalogCliente(g.cliente);
                                                                            openLeadersModalForCliente(g.cliente);
                                                                        }}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    />
                                                                </td>
                                                                <td className={dash.tdName}>{g.cliente}</td>
                                                                <td className={`${dash.tdCell} tabular-nums`}>
                                                                    {String(g.nit || '').trim() || '—'}
                                                                </td>
                                                                <td className={dash.tdCell}>
                                                                    {activeCount} / {totalCount}
                                                                </td>
                                                                <td
                                                                    className={`${dash.tdMuted} ${gpConflict ? (isLight ? 'text-amber-700' : 'text-amber-300/90') : ''}`}
                                                                >
                                                                    {gpText}
                                                                </td>
                                                                <td className="p-4 whitespace-nowrap">
                                                                    <button
                                                                        type="button"
                                                                        className={dash.actionBtn}
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            void openEditClienteModalForCliente(g.cliente);
                                                                        }}
                                                                    >
                                                                        Editar
                                                                    </button>
                                                                </td>
                                                                <td className="p-4 pr-6 whitespace-nowrap">
                                                                    <button
                                                                        type="button"
                                                                        className="rounded-lg border border-rose-500/40 px-3 py-1 text-xs font-semibold text-rose-400 transition-all hover:bg-rose-500/10"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setSelectedCatalogCliente(g.cliente);
                                                                            setConfirmDeactivateCatalog(true);
                                                                        }}
                                                                    >
                                                                        Borrar
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
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
                                                                            deleteColaboradorRow(row);
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
                        <MallasTurnosModule token={token} />
                    ) : null}

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

            {clienteModalOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="modal-glass-scrim absolute inset-0 transition-opacity"
                        onClick={() => setClienteModalOpen(false)}
                    />
                    <div className="modal-glass-sheet font-body relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] p-0 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-soft)] px-5 py-4">
                            <h2 className="text-lg font-heading font-bold text-[var(--text)]">Crear cliente (y primer líder)</h2>
                            <button
                                type="button"
                                onClick={() => setClienteModalOpen(false)}
                                className="rounded-lg p-2 text-[rgba(159,179,200,0.95)] hover:bg-slate-800/50"
                                aria-label="Cerrar"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={submitClienteModal} className="p-5 space-y-4 overflow-y-auto">
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>Cliente</label>
                                <input
                                    className={`w-full ${field}`}
                                    value={clienteForm.cliente}
                                    onChange={(e) => setClienteForm((f) => ({ ...f, cliente: e.target.value }))}
                                    required
                                />
                            </div>
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>NIT</label>
                                <input
                                    className={`w-full ${field}`}
                                    value={clienteForm.nit}
                                    onChange={(e) => setClienteForm((f) => ({ ...f, nit: e.target.value }))}
                                    inputMode="numeric"
                                    autoComplete="off"
                                    placeholder="Solo números"
                                    required
                                />
                                <p className={`text-xs ${labelMuted} mt-1`}>Obligatorio; se guardan solo dígitos.</p>
                            </div>
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>Líder</label>
                                <input
                                    className={`w-full ${field}`}
                                    value={clienteForm.lider}
                                    onChange={(e) => setClienteForm((f) => ({ ...f, lider: e.target.value }))}
                                    required
                                />
                            </div>
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>GP asignado</label>
                                {clienteGpOptionsLoading ? (
                                    <p className={`text-xs ${labelMuted}`}>Cargando lista…</p>
                                ) : (
                                    <select
                                        className={`w-full ${field}`}
                                        value={clienteForm.gp_colaborador_cedula}
                                        onChange={(e) =>
                                            setClienteForm((f) => ({
                                                ...f,
                                                gp_colaborador_cedula: e.target.value
                                            }))
                                        }
                                    >
                                        <option value="">— Sin GP —</option>
                                        {clienteGpOptions.map((o) => (
                                            <option key={o.cedula} value={o.value} disabled={o.disabled}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {!clienteGpOptionsLoading && clienteGpOptions.length === 0 ? (
                                    <p className={`text-xs ${labelMuted} mt-1`}>No hay colaboradores en el directorio.</p>
                                ) : !clienteGpOptionsLoading ? (
                                    <p className={`text-xs ${labelMuted} mt-1`}>
                                        Si el colaborador no tiene correo Cinte, no puede seleccionarse.
                                    </p>
                                ) : null}
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-md bg-[#2F7BB8] text-white text-sm font-semibold"
                                >
                                    Guardar
                                </button>
                                <button
                                    type="button"
                                    className={outlineBtn}
                                    onClick={() => setClienteModalOpen(false)}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {editClienteModalOpen ? (
                <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
                    <div
                        className="modal-glass-scrim absolute inset-0 transition-opacity"
                        onClick={() => !editClienteSaving && closeEditClienteModal()}
                    />
                    <div className="modal-glass-sheet font-body relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] p-0 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-soft)] px-5 py-4">
                            <h2 className="text-lg font-heading font-bold text-[var(--text)]">Editar cliente</h2>
                            <button
                                type="button"
                                disabled={editClienteSaving}
                                onClick={() => closeEditClienteModal()}
                                className="rounded-lg p-2 text-[rgba(159,179,200,0.95)] hover:bg-slate-800/50 disabled:opacity-40"
                                aria-label="Cerrar"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={submitEditClienteModal} className="p-5 space-y-4 overflow-y-auto">
                            {editClienteRowsLoading ? (
                                <p className={`text-sm ${labelMuted}`}>Cargando datos del catálogo…</p>
                            ) : (
                                <>
                                    <p className={`text-xs ${labelMuted}`}>
                                        Los cambios se aplican a todas las filas del cliente en el catálogo (
                                        {editClienteTargetRows.length} líder
                                        {editClienteTargetRows.length === 1 ? '' : 'es'}).
                                    </p>
                                    {[
                                        ...new Set(
                                            editClienteTargetRows.map((r) => r.gp_user_id).filter(Boolean).map(String)
                                        )
                                    ].length > 1 ? (
                                        <p className="text-xs text-amber-300/90">
                                            Había GP distintos por líder; el valor que elijas unificará el GP en todas
                                            las filas.
                                        </p>
                                    ) : null}
                                    <div>
                                        <label className={`block text-xs ${labelMuted} mb-1`}>Nombre del cliente</label>
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
                                        <label className={`block text-xs ${labelMuted} mb-1`}>NIT</label>
                                        <input
                                            className={`w-full ${field}`}
                                            value={editClienteForm.nit}
                                            onChange={(e) =>
                                                setEditClienteForm((f) => ({ ...f, nit: e.target.value }))
                                            }
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
                                            <p className={`text-xs ${labelMuted} mt-1`}>
                                                Se aplica a todas las filas del cliente; solo dígitos.
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <label className={`block text-xs ${labelMuted} mb-1`}>
                                            GP (lista completa de colaboradores)
                                        </label>
                                        {editClienteGpOptionsLoading ? (
                                            <p className={`text-xs ${labelMuted}`}>Cargando lista…</p>
                                        ) : (
                                            <select
                                                className={`w-full ${field}`}
                                                value={editClienteForm.gp_colaborador_cedula}
                                                onChange={(e) =>
                                                    setEditClienteForm((f) => ({
                                                        ...f,
                                                        gp_colaborador_cedula: e.target.value
                                                    }))
                                                }
                                            >
                                                <option value="">— Sin GP —</option>
                                                {editClienteGpOptions.map((o, idx) => (
                                                    <option
                                                        key={`${o.cedula || 'sin-cedula'}-${idx}`}
                                                        value={o.value}
                                                        disabled={o.disabled}
                                                    >
                                                        {o.label}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                        {!editClienteGpOptionsLoading && editClienteGpOptions.length === 0 ? (
                                            <p className={`text-xs ${labelMuted} mt-1`}>
                                                No hay colaboradores en el directorio.
                                            </p>
                                        ) : !editClienteGpOptionsLoading ? (
                                            <p className={`text-xs ${labelMuted} mt-1`}>
                                                Si el colaborador no tiene correo Cinte, no puede seleccionarse.
                                            </p>
                                        ) : null}
                                        {editClienteGpSelectHint ? (
                                            <p className={`text-xs mt-1 ${isLight ? 'text-amber-800' : 'text-amber-300/90'}`}>
                                                {editClienteGpSelectHint}
                                            </p>
                                        ) : null}
                                    </div>
                                </>
                            )}
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="submit"
                                    disabled={editClienteRowsLoading || editClienteSaving}
                                    className="px-4 py-2 rounded-md bg-[#2F7BB8] text-white text-sm font-semibold disabled:opacity-40"
                                >
                                    {editClienteSaving ? 'Guardando…' : 'Guardar'}
                                </button>
                                <button
                                    type="button"
                                    disabled={editClienteSaving}
                                    className={`${outlineBtn} disabled:opacity-40`}
                                    onClick={() => closeEditClienteModal()}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

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

            {confirmDeactivateCatalog && selectedCatalogCliente ? (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <div
                        className="modal-glass-scrim absolute inset-0 transition-opacity"
                        onClick={() => setConfirmDeactivateCatalog(false)}
                    />
                    <div className="modal-glass-sheet font-body relative w-full max-w-md rounded-2xl border border-[var(--border)] p-6 shadow-2xl">
                        <p className="text-sm text-[#e6edf3]">
                            ¿Desactivar <strong>todos los líderes</strong> del cliente{' '}
                            <strong>{selectedCatalogCliente}</strong> en el catálogo? Los registros permanecen en la
                            base de datos; con el filtro «Activos» el cliente dejará de mostrarse en la tabla.
                        </p>
                        <div className="mt-4 flex gap-2 justify-end">
                            <button
                                type="button"
                                className={outlineBtn}
                                onClick={() => setConfirmDeactivateCatalog(false)}
                            >
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
                                        setLeadersModalCliente(null);
                                        setLeadersModalRows([]);
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
                    </div>
                </div>
            ) : null}

            {leadersModalCliente ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="modal-glass-scrim absolute inset-0 transition-opacity"
                        onClick={() => {
                            if (!addLiderModalOpen) {
                                setLeadersModalCliente(null);
                                setLeadersModalRows([]);
                            }
                        }}
                    />
                    <div className="modal-glass-sheet font-body relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] p-0 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-soft)] px-5 py-4">
                            <div>
                                <h2 className="text-lg font-heading font-bold text-[var(--text)]">Líderes</h2>
                                <p className={`text-xs ${labelMuted} mt-0.5`}>{leadersModalCliente}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setLeadersModalCliente(null);
                                    setAddLiderModalOpen(false);
                                    setLeadersModalRows([]);
                                }}
                                className="rounded-lg p-2 text-[rgba(159,179,200,0.95)] hover:bg-slate-800/50"
                                aria-label="Cerrar"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-4 space-y-3 overflow-y-auto flex-1">
                            <button
                                type="button"
                                onClick={openAddLiderModal}
                                className="px-3 py-2 rounded-md bg-[#2F7BB8] text-white text-sm font-semibold"
                            >
                                Agregar líder
                            </button>
                            <div className={tableSurface}>
                                <table className="min-w-full text-sm">
                                    <thead className={tableThead}>
                                        <tr>
                                            <th className="text-left p-2">Líder</th>
                                            <th className="text-left p-2">Activo</th>
                                            <th className="text-left p-2">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leadersModalLoading ? (
                                            <tr>
                                                <td colSpan={3} className={`p-4 text-center ${labelMuted}`}>
                                                    Cargando líderes…
                                                </td>
                                            </tr>
                                        ) : leadersModalRows.length === 0 ? (
                                            <tr>
                                                <td colSpan={3} className={`p-4 text-center ${labelMuted}`}>
                                                    Sin líderes para este cliente
                                                </td>
                                            </tr>
                                        ) : (
                                            leadersModalRows.map((row) => (
                                                <tr key={row.id} className={tableRowBorder}>
                                                    <td className="p-2">{row.lider}</td>
                                                    <td className="p-2">{row.activo ? 'Sí' : 'No'}</td>
                                                    <td className="p-2">
                                                        <button
                                                            type="button"
                                                            className="text-[#65BCF7] hover:underline text-xs"
                                                            onClick={() => patchCatalogo(row, { activo: !row.activo })}
                                                        >
                                                            {row.activo ? 'Desactivar líder' : 'Activar líder'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {addLiderModalOpen && leadersModalCliente ? (
                <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
                    <div
                        className="modal-glass-scrim absolute inset-0 transition-opacity"
                        onClick={() => setAddLiderModalOpen(false)}
                    />
                    <div className="modal-glass-sheet font-body relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border)] p-0 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-soft)] px-5 py-4">
                            <h2 className="text-lg font-heading font-bold text-[var(--text)]">Agregar líder</h2>
                            <button
                                type="button"
                                onClick={() => setAddLiderModalOpen(false)}
                                className="rounded-lg p-2 text-[rgba(159,179,200,0.95)] hover:bg-slate-800/50"
                                aria-label="Cerrar"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={submitAddLiderModal} className="p-5 space-y-4">
                            <p className={`text-xs ${labelMuted}`}>Cliente: {leadersModalCliente}</p>
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>NIT</label>
                                <input
                                    className={`w-full ${field}`}
                                    value={addLiderForm.nit}
                                    onChange={(e) => setAddLiderForm((f) => ({ ...f, nit: e.target.value }))}
                                    inputMode="numeric"
                                    autoComplete="off"
                                    placeholder="Mismo NIT del cliente"
                                    required
                                />
                                <p className={`text-xs ${labelMuted} mt-1`}>Obligatorio; se guardan solo dígitos.</p>
                            </div>
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>Líder</label>
                                <input
                                    className={`w-full ${field}`}
                                    value={addLiderForm.lider}
                                    onChange={(e) => setAddLiderForm((f) => ({ ...f, lider: e.target.value }))}
                                    required
                                />
                            </div>
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>GP asignado</label>
                                <GpUserSelect
                                    className={`w-full ${field}`}
                                    value={addLiderForm.gp_user_id}
                                    options={gpSelectOptions}
                                    onChange={(e) => setAddLiderForm((f) => ({ ...f, gp_user_id: e.target.value }))}
                                />
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-md bg-[#2F7BB8] text-white text-sm font-semibold"
                                >
                                    Guardar
                                </button>
                                <button
                                    type="button"
                                    className={outlineBtn}
                                    onClick={() => setAddLiderModalOpen(false)}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
