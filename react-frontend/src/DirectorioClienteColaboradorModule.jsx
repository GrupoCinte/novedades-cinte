import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowDown,
    ArrowUp,
    Building2,
    ChevronLeft,
    ChevronRight,
    KeyRound,
    LogOut,
    Menu,
    Users,
    X
} from 'lucide-react';

function authHeaders(token) {
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
    };
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

function readAuthEmailRole() {
    try {
        const raw = JSON.parse(localStorage.getItem('cinteAuth') || 'null');
        const email = String(raw?.user?.email || raw?.claims?.email || 'sin-correo').toLowerCase();
        const role = String(raw?.user?.role || raw?.claims?.role || 'sin_rol')
            .replace(/_/g, ' ')
            .toUpperCase();
        return { email, role };
    } catch {
        return { email: 'sin-correo', role: 'SIN ROL' };
    }
}

export default function DirectorioClienteColaboradorModule({ token, onLogout }) {
    const navigate = useNavigate();
    const { email: currentEmail, role: currentRoleLabel } = useMemo(() => readAuthEmailRole(), []);

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    /** Vista principal del sidebar */
    const [mainView, setMainView] = useState('cliente');

    const [msg, setMsg] = useState(null);

    const [clItems, setClItems] = useState([]);
    const [clTotal, setClTotal] = useState(0);
    const [clQ, setClQ] = useState('');
    const [clActivo, setClActivo] = useState('all');
    const [clLoading, setClLoading] = useState(false);
    /** Cliente seleccionado en tabla agrupada (nombre canónico igual a BD). */
    const [selectedCatalogCliente, setSelectedCatalogCliente] = useState(null);
    /** Modal detalle: lista de líderes del cliente */
    const [leadersModalCliente, setLeadersModalCliente] = useState(null);
    const [addLiderModalOpen, setAddLiderModalOpen] = useState(false);
    const [addLiderForm, setAddLiderForm] = useState({ lider: '', gp_user_id: '' });
    const [clienteModalOpen, setClienteModalOpen] = useState(false);
    const [clienteForm, setClienteForm] = useState({ cliente: '', lider: '', gp_colaborador_cedula: '' });
    const [confirmDeactivateCatalog, setConfirmDeactivateCatalog] = useState(false);
    /** Modal editar cliente (nombre + GP desde colaboradores). */
    const [editClienteModalOpen, setEditClienteModalOpen] = useState(false);
    const [editClienteOriginalName, setEditClienteOriginalName] = useState('');
    const [editClienteForm, setEditClienteForm] = useState({ nombre: '', gp_colaborador_cedula: '' });
    const [editClienteTargetRows, setEditClienteTargetRows] = useState([]);
    const [editClienteRowsLoading, setEditClienteRowsLoading] = useState(false);
    const [editClienteGpOptions, setEditClienteGpOptions] = useState([]);
    const [editClienteGpOptionsLoading, setEditClienteGpOptionsLoading] = useState(false);
    const [editClienteSaving, setEditClienteSaving] = useState(false);
    const [clienteGpOptions, setClienteGpOptions] = useState([]);
    const [clienteGpOptionsLoading, setClienteGpOptionsLoading] = useState(false);

    const [coItems, setCoItems] = useState([]);
    const [coTotal, setCoTotal] = useState(0);
    const [coQ, setCoQ] = useState('');
    const [coActivo, setCoActivo] = useState('all');
    const [coLoading, setCoLoading] = useState(false);
    const [selectedCoCedula, setSelectedCoCedula] = useState(null);
    /** Orden tabla Consultores: null = orden del API. */
    const [coSort, setCoSort] = useState({ key: null, dir: 'asc' });
    const [staffModalOpen, setStaffModalOpen] = useState(false);
    const [staffModalMode, setStaffModalMode] = useState('create');
    const [coForm, setCoForm] = useState({
        cedula: '',
        nombre: '',
        correo_cinte: '',
        cliente: '',
        lider_catalogo: ''
    });
    const [catalogClientes, setCatalogClientes] = useState([]);
    const [liderOptions, setLiderOptions] = useState([]);
    const [liderLoading, setLiderLoading] = useState(false);

    const [gpItems, setGpItems] = useState([]);
    const [gpSelectOptions, setGpSelectOptions] = useState([]);

    const clItemsActive = useMemo(() => clItems.filter((r) => r.activo), [clItems]);

    const gpLabelById = useMemo(() => {
        const m = new Map();
        for (const g of gpItems) {
            const fullName = String(g.full_name || '').trim();
            const email = String(g.email || '').trim();
            m.set(g.id, fullName || email || 'GP sin nombre');
        }
        return m;
    }, [gpItems]);

    const catalogClienteGroups = useMemo(() => {
        const map = new Map();
        for (const row of clItems) {
            const k = row.cliente;
            if (!map.has(k)) map.set(k, []);
            map.get(k).push(row);
        }
        const groups = [];
        for (const [cliente, rows] of map) {
            const activeCount = rows.filter((r) => r.activo).length;
            const gpIds = [...new Set(rows.map((r) => r.gp_user_id).filter(Boolean).map(String))];
            let gpDisplay = '—';
            let gpConflict = false;
            if (gpIds.length === 1) {
                const rowWithGp = rows.find((r) => r.gp_user_id && String(r.gp_user_id) === gpIds[0]);
                const backendName = String(rowWithGp?.gp_full_name || '').trim();
                gpDisplay = backendName || gpLabelById.get(gpIds[0]) || 'GP no disponible';
            } else if (gpIds.length > 1) {
                gpConflict = true;
                gpDisplay = 'GP distintos por líder';
            }
            groups.push({ cliente, rows, activeCount, totalCount: rows.length, gpDisplay, gpConflict });
        }
        groups.sort((a, b) => a.cliente.localeCompare(b.cliente, 'es'));
        return groups;
    }, [clItems, gpLabelById]);

    const leadersModalRows = useMemo(() => {
        if (!leadersModalCliente) return [];
        return clItems.filter((r) => r.cliente === leadersModalCliente);
    }, [clItems, leadersModalCliente]);

    const coSortedItems = useMemo(() => {
        if (!coSort.key) return coItems;
        const mul = coSort.dir === 'asc' ? 1 : -1;
        const key = coSort.key;
        const pick = (row) => {
            switch (key) {
                case 'cedula':
                    return String(row.cedula || '');
                case 'nombre':
                    return String(row.nombre || '');
                case 'correo':
                    return String(row.correo_cinte || '');
                case 'cliente':
                    return String(row.cliente || '');
                case 'lider':
                    return String(row.lider_catalogo || '');
                case 'activo':
                    return row.activo ? 1 : 0;
                default:
                    return '';
            }
        };
        return [...coItems].sort((a, b) => {
            let c = 0;
            if (key === 'activo') {
                c = (pick(a) - pick(b)) * mul;
            } else {
                c = String(pick(a)).localeCompare(String(pick(b)), 'es', { sensitivity: 'base' }) * mul;
            }
            if (c !== 0) return c;
            return String(a.cedula || '').localeCompare(String(b.cedula || ''), 'es', { sensitivity: 'base' });
        });
    }, [coItems, coSort]);

    const flash = useCallback((text, ok = true) => {
        setMsg({ text, ok });
        setTimeout(() => setMsg(null), 6000);
    }, []);

    const loadCatalogo = useCallback(async () => {
        setClLoading(true);
        try {
            const u = new URLSearchParams();
            u.set('activo', clActivo);
            if (clQ.trim()) u.set('q', clQ.trim());
            u.set('limit', '2000');
            u.set('offset', '0');
            const res = await fetch(`/api/directorio/clientes-lideres?${u}`, { headers: authHeaders(token) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            setClItems(data.items || []);
            setClTotal(data.total ?? 0);
        } catch (e) {
            flash(String(e.message || e), false);
        } finally {
            setClLoading(false);
        }
    }, [token, clActivo, clQ, flash]);

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
            setClItems(data.items || []);
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
            u.set('limit', '200');
            u.set('offset', '0');
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
    }, [token, coActivo, coQ, flash]);

    const fetchCatalogClientes = useCallback(async () => {
        try {
            const res = await fetch('/api/catalogos/clientes');
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
            const res = await fetch(`/api/catalogos/lideres?cliente=${encodeURIComponent(c)}`);
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
        if (!selectedCatalogCliente) return;
        const exists = catalogClienteGroups.some((g) => g.cliente === selectedCatalogCliente);
        if (!exists) setSelectedCatalogCliente(null);
    }, [catalogClienteGroups, selectedCatalogCliente]);

    useEffect(() => {
        if (!leadersModalCliente) return;
        const exists = catalogClienteGroups.some((g) => g.cliente === leadersModalCliente);
        if (!exists) {
            setLeadersModalCliente(null);
            setAddLiderModalOpen(false);
        }
    }, [catalogClienteGroups, leadersModalCliente]);

    useEffect(() => {
        if (!selectedCoCedula) return;
        const exists = coItems.some((r) => r.cedula === selectedCoCedula);
        if (!exists) setSelectedCoCedula(null);
    }, [coItems, selectedCoCedula]);

    const handleSidebarLogout = () => {
        if (onLogout) onLogout();
        else {
            localStorage.removeItem('cinteAuth');
            navigate('/admin', { replace: true });
        }
    };

    async function patchCatalogo(row, patch) {
        try {
            const res = await fetch(`/api/directorio/clientes-lideres/${row.id}`, {
                method: 'PATCH',
                headers: authHeaders(token),
                body: JSON.stringify(patch)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            flash('Actualizado.');
            loadCatalogo();
            if (mainView === 'consultores') loadCatalogoActivoForStaff();
        } catch (err) {
            flash(String(err.message || err), false);
        }
    }

    async function openClienteModalCreate() {
        setClienteForm({ cliente: '', lider: '', gp_colaborador_cedula: '' });
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
                gp_user_id: gid || null
            };
        });
        opts.sort((a, b) =>
            a.label.localeCompare(b.label, 'es', { numeric: true, sensitivity: 'base' })
        );
        return opts;
    }

    async function openEditClienteModal() {
        if (!selectedCatalogCliente) {
            flash('Selecciona un cliente en la tabla.', false);
            return;
        }
        const original = selectedCatalogCliente;
        setEditClienteOriginalName(original);
        setEditClienteForm({ nombre: original, gp_colaborador_cedula: '' });
        setEditClienteTargetRows([]);
        setEditClienteGpOptions([]);
        setEditClienteModalOpen(true);
        setEditClienteRowsLoading(true);
        setEditClienteGpOptionsLoading(true);
        try {
            const u = new URLSearchParams();
            u.set('activo', 'all');
            u.set('limit', '2000');
            u.set('offset', '0');
            const res = await fetch(`/api/directorio/clientes-lideres?${u}`, { headers: authHeaders(token) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            const rows = (data.items || []).filter((r) => r.cliente === original);
            setEditClienteTargetRows(rows);
            const gpIds = [...new Set(rows.map((r) => r.gp_user_id).filter(Boolean).map(String))];
            let initialGpCedula = '';
            let opts = [];
            try {
                opts = await fetchColaboradoresAllPagesForGpSelect();
            } catch (e2) {
                flash(String(e2.message || e2), false);
            }
            setEditClienteGpOptions(opts);
            if (gpIds.length === 1) {
                const match = opts.find((o) => !o.disabled && o.gp_user_id === gpIds[0]);
                initialGpCedula = match?.cedula || '';
            }
            setEditClienteForm({ nombre: original, gp_colaborador_cedula: initialGpCedula });
        } catch (e) {
            flash(String(e.message || e), false);
            setEditClienteModalOpen(false);
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
        const gpCedula = String(editClienteForm.gp_colaborador_cedula || '').trim() || null;
        if (!editClienteTargetRows.length) {
            flash('No hay filas de catálogo para este cliente.', false);
            return;
        }
        setEditClienteSaving(true);
        try {
            for (const row of editClienteTargetRows) {
                const res = await fetch(`/api/directorio/clientes-lideres/${row.id}`, {
                    method: 'PATCH',
                    headers: authHeaders(token),
                    body: JSON.stringify({
                        cliente: nombre,
                        gp_colaborador_cedula: gpCedula
                    })
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || res.statusText);
            }
            await loadCatalogo();
            flash('Cliente actualizado.');
            setEditClienteModalOpen(false);
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
        const rows = clItems.filter((r) => r.cliente === leadersModalCliente);
        const firstGp = rows.map((r) => r.gp_user_id).find(Boolean);
        setAddLiderForm({
            lider: '',
            gp_user_id: firstGp ? String(firstGp) : ''
        });
        setAddLiderModalOpen(true);
    }

    async function submitAddLiderModal(e) {
        e.preventDefault();
        if (!leadersModalCliente) return;
        try {
            const gpVal = addLiderForm.gp_user_id ? String(addLiderForm.gp_user_id).trim() : null;
            const res = await fetch('/api/directorio/clientes-lideres', {
                method: 'POST',
                headers: authHeaders(token),
                body: JSON.stringify({
                    cliente: leadersModalCliente,
                    lider: addLiderForm.lider,
                    gp_user_id: gpVal
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || res.statusText);
            flash('Líder agregado al catálogo.');
            setAddLiderModalOpen(false);
            loadCatalogo();
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
            setGpSelectOptions(items);
        } catch {
            /* ignore */
        }
    }

    async function submitClienteModal(e) {
        e.preventDefault();
        try {
            const gpCedula = clienteForm.gp_colaborador_cedula
                ? String(clienteForm.gp_colaborador_cedula).trim()
                : null;
            const res = await fetch('/api/directorio/clientes-lideres', {
                method: 'POST',
                headers: authHeaders(token),
                body: JSON.stringify({
                    cliente: clienteForm.cliente,
                    lider: clienteForm.lider,
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
        const rows = clItems.filter((r) => r.cliente === cliente);
        for (const row of rows) {
            if (!row.activo) continue;
            const res = await fetch(`/api/directorio/clientes-lideres/${row.id}`, {
                method: 'PATCH',
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
        try {
            if (staffModalMode === 'create') {
                const body = {
                    cedula: coForm.cedula,
                    nombre: coForm.nombre,
                    correo_cinte: coForm.correo_cinte || null,
                    cliente: coForm.cliente || null,
                    lider_catalogo: coForm.lider_catalogo || null,
                    gp_user_id: gpDerived
                };
                const res = await fetch('/api/directorio/colaboradores', {
                    method: 'POST',
                    headers: authHeaders(token),
                    body: JSON.stringify(body)
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || res.statusText);
                flash('Colaborador creado.');
            } else if (selectedCoCedula) {
                const res = await fetch(`/api/directorio/colaboradores/${encodeURIComponent(selectedCoCedula)}`, {
                    method: 'PATCH',
                    headers: authHeaders(token),
                    body: JSON.stringify({
                        nombre: coForm.nombre,
                        correo_cinte: coForm.correo_cinte || null,
                        cliente: coForm.cliente || null,
                        lider_catalogo: coForm.lider_catalogo || null,
                        gp_user_id: gpDerived
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

    async function patchColaborador(cedula, patch) {
        try {
            const res = await fetch(`/api/directorio/colaboradores/${encodeURIComponent(cedula)}`, {
                method: 'PATCH',
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
        setCoForm({
            cedula: '',
            nombre: '',
            correo_cinte: '',
            cliente: '',
            lider_catalogo: ''
        });
        setLiderOptions([]);
        fetchCatalogClientes();
        setStaffModalOpen(true);
    }

    function openStaffModalEdit() {
        if (!selectedCoCedula) {
            flash('Selecciona un colaborador en la tabla.', false);
            return;
        }
        const row = coItems.find((r) => r.cedula === selectedCoCedula);
        if (!row) return;
        setStaffModalMode('edit');
        setCoForm({
            cedula: row.cedula,
            nombre: row.nombre || '',
            correo_cinte: row.correo_cinte || '',
            cliente: row.cliente || '',
            lider_catalogo: row.lider_catalogo || ''
        });
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
            } ${
                active
                    ? 'bg-[#65BCF7] shadow-[0_4px_12px_rgba(101,188,247,0.25)] text-[#04141E]'
                    : 'text-slate-300 hover:bg-[#0f2942]/60 hover:text-white border border-transparent'
            }`}
        >
            <Icon size={18} className="flex-shrink-0" />
            {sidebarOpen && <span className="truncate">{label}</span>}
        </button>
    );

    const sidebarNav = () => (
        <nav className="flex flex-col gap-1 p-2 flex-1 mt-1">
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
                    setMainView('consultores');
                    setMobileMenuOpen(false);
                }}
            />
        </nav>
    );

    const sidebarFooter = (compact) => (
        <div className={`border-t border-[#1a3a56]/50 ${compact ? 'p-4' : 'p-2'}`}>
            {compact ? (
                <div className="space-y-2">
                    <div className="overflow-hidden">
                        <p className="text-[10px] font-body font-black text-slate-300 whitespace-nowrap leading-tight truncate">
                            {currentEmail}
                        </p>
                        <p className="text-[9px] text-[#65BCF7] font-body font-semibold whitespace-nowrap leading-tight">
                            {currentRoleLabel}
                        </p>
                    </div>
                    <div className="border-t border-[#1a3a56]/50 pt-2 flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={() => navigate('/perfil/cambiar-clave')}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-[#1a3a56] text-slate-300 hover:text-white hover:bg-[#0f2942]/60 transition-all text-xs font-body font-semibold"
                        >
                            <KeyRound size={14} />
                            Cambiar contraseña
                        </button>
                        <button
                            type="button"
                            onClick={handleSidebarLogout}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-all text-xs font-body font-semibold"
                        >
                            <LogOut size={14} />
                            Cerrar sesión
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-2 items-center py-2">
                    <button
                        type="button"
                        title="Cambiar contraseña"
                        onClick={() => navigate('/perfil/cambiar-clave')}
                        className="w-9 h-9 rounded-lg border border-[#1a3a56] text-slate-300 hover:text-white flex items-center justify-center"
                    >
                        <KeyRound size={16} />
                    </button>
                    <button
                        type="button"
                        title="Cerrar sesión"
                        onClick={handleSidebarLogout}
                        className="w-9 h-9 rounded-lg border border-rose-500/30 text-rose-400 flex items-center justify-center"
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            )}
        </div>
    );

    return (
        <div className="flex h-full w-full bg-[#04141E] text-slate-200 overflow-hidden font-body">
            <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden fixed top-24 left-4 z-40 w-10 h-10 rounded-lg bg-[#0b1e30] border border-[#1a3a56] text-slate-200 flex items-center justify-center shadow-lg"
                aria-label="Abrir menú administración"
            >
                <Menu size={18} />
            </button>
            {mobileMenuOpen ? (
                <div className="md:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileMenuOpen(false)} />
            ) : null}
            <aside
                className={`md:hidden fixed top-0 left-0 h-full w-72 bg-[#0b1e30] border-r border-[#1a3a56]/50 z-50 shadow-2xl transform transition-transform duration-300 flex flex-col ${
                    mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                <div className="p-4 border-b border-[#1a3a56]/50 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-heading font-black text-[#65BCF7] uppercase tracking-widest">
                            Administración
                        </p>
                        <p className="text-[10px] font-body font-bold text-slate-400 uppercase tracking-widest">CINTE</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setMobileMenuOpen(false)}
                        className="w-8 h-8 rounded-lg bg-[#04141E] border border-[#1a3a56] text-slate-300 flex items-center justify-center"
                        aria-label="Cerrar menú"
                    >
                        <X size={16} />
                    </button>
                </div>
                {sidebarNav()}
                <div className="mt-auto p-4 border-t border-[#1a3a56]/50">
                    <p className="text-[10px] font-body font-black text-slate-300 truncate">{currentEmail}</p>
                    <p className="text-[10px] text-[#65BCF7] font-body font-semibold uppercase">{currentRoleLabel}</p>
                    <div className="mt-3 flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={() => navigate('/perfil/cambiar-clave')}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-[#1a3a56] text-slate-200 hover:bg-[#0f2942]/60 transition-all text-xs font-body font-semibold"
                        >
                            <KeyRound size={14} />
                            Cambiar contraseña
                        </button>
                        <button
                            type="button"
                            onClick={handleSidebarLogout}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-all text-xs font-body font-semibold"
                        >
                            <LogOut size={14} />
                            Cerrar sesión
                        </button>
                    </div>
                </div>
            </aside>

            <aside
                className={`bg-[#0b1e30] flex-shrink-0 flex-col hidden md:flex h-full shadow-2xl relative z-10 transition-all duration-300 ease-in-out overflow-hidden ${
                    sidebarOpen ? 'w-64' : 'w-16'
                }`}
            >
                <div
                    className={`border-b border-[#1a3a56]/50 flex items-center ${
                        sidebarOpen ? 'px-5 py-4 justify-between' : 'px-0 py-4 justify-center'
                    }`}
                >
                    {sidebarOpen ? (
                        <div className="overflow-hidden">
                            <p className="text-[10px] font-heading font-black text-[#65BCF7] uppercase tracking-widest whitespace-nowrap leading-tight">
                                Administración
                            </p>
                            <p className="text-[10px] font-body font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap leading-tight">
                                CINTE
                            </p>
                        </div>
                    ) : null}
                    <button
                        type="button"
                        onClick={() => setSidebarOpen((o) => !o)}
                        title={sidebarOpen ? 'Colapsar menú' : 'Expandir menú'}
                        className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#04141E] hover:bg-[#65BCF7]/20 border border-[#1a3a56] hover:border-[#65BCF7]/50 text-slate-400 hover:text-[#65BCF7] transition-all flex-shrink-0"
                    >
                        {sidebarOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
                    </button>
                </div>
                {sidebarNav()}
                {sidebarFooter(sidebarOpen)}
            </aside>

            <div className="flex flex-col flex-1 min-h-0 min-w-0">
                <header className="flex items-center justify-between px-4 md:px-8 py-3 border-b border-[#1a3a56] shrink-0 md:pl-6">
                    <div>
                        <h1 className="text-lg md:text-xl font-heading font-bold text-[#65BCF7]">Módulo de administración</h1>
                        <p className="text-xs text-[#9fb3c8] mt-1">
                            Catálogo por cliente (líderes y GP) y colaboradores (roles autorizados).
                        </p>
                    </div>
                </header>

                {msg ? (
                    <div
                        className={`mx-4 md:mx-8 mt-3 px-3 py-2 rounded text-sm shrink-0 ${
                            msg.ok ? 'bg-emerald-900/40 text-emerald-200' : 'bg-red-900/40 text-red-200'
                        }`}
                    >
                        {msg.text}
                    </div>
                ) : null}

                <main className="flex-1 overflow-y-auto p-4 md:p-8">
                    {mainView === 'cliente' && (
                        <div className="space-y-4 w-full max-w-[95rem]">
                            <div className="flex flex-wrap gap-2 items-center">
                                <button
                                    type="button"
                                    onClick={openClienteModalCreate}
                                    className="px-4 py-2 rounded-md bg-[#2F7BB8] text-white text-sm font-semibold hover:bg-[#25649a]"
                                >
                                    Crear nuevo cliente
                                </button>
                                <button
                                    type="button"
                                    disabled={!selectedCatalogCliente}
                                    onClick={() => openEditClienteModal()}
                                    className="px-4 py-2 rounded-md border border-[#1a3a56] text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0f2942]/60"
                                >
                                    Editar cliente
                                </button>
                                <button
                                    type="button"
                                    disabled={!selectedCatalogCliente}
                                    onClick={() => setConfirmDeactivateCatalog(true)}
                                    className="px-4 py-2 rounded-md border border-rose-500/40 text-rose-300 text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-rose-500/10"
                                >
                                    Borrar cliente
                                </button>
                            </div>
                            <p className="text-xs text-[#9fb3c8]">
                                Un clic en la fila abre el detalle de líderes (sin columna GP). El GP del cliente se ve
                                en esta tabla y se edita con «Editar cliente» (lista completa de colaboradores). Al
                                guardar, el sistema crea o vincula el usuario GP interno según el colaborador elegido.
                                Al agregar un líder, el GP sigue eligiéndose entre usuarios rol GP del
                                sistema. La carga inicial desde Excel ocurre solo en migración al arranque (catálogo
                                vacío).
                            </p>
                            <div className="flex flex-wrap gap-2 items-end">
                                <div>
                                    <label className="block text-xs text-[#9fb3c8] mb-1">Estado</label>
                                    <select
                                        className="px-3 py-2 rounded bg-[#04141E] border border-[#1a3a56] text-sm"
                                        value={clActivo}
                                        onChange={(e) => setClActivo(e.target.value)}
                                    >
                                        <option value="all">Todos</option>
                                        <option value="true">Activos</option>
                                        <option value="false">Inactivos</option>
                                    </select>
                                </div>
                                <div className="flex-1 min-w-[160px]">
                                    <label className="block text-xs text-[#9fb3c8] mb-1">Buscar</label>
                                    <input
                                        className="w-full px-3 py-2 rounded bg-[#04141E] border border-[#1a3a56] text-sm"
                                        value={clQ}
                                        onChange={(e) => setClQ(e.target.value)}
                                        placeholder="Texto en cliente o líder"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => loadCatalogo()}
                                    className="px-3 py-2 rounded-md bg-[#0f2942] border border-[#1a3a56] text-sm"
                                >
                                    Refrescar
                                </button>
                            </div>
                            <p className="text-xs text-[#9fb3c8]">
                                Total filas catálogo: {clTotal} · Clientes mostrados: {catalogClienteGroups.length}
                            </p>
                            <div className="overflow-x-auto border border-[#1a3a56] rounded-lg">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-[#0b1e30] text-[#9fb3c8]">
                                        <tr>
                                            <th className="text-left p-2 w-10"></th>
                                            <th className="text-left p-2">Cliente</th>
                                            <th className="text-left p-2">Líderes (activos / total)</th>
                                            <th className="text-left p-2">GP</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {clLoading ? (
                                            <tr>
                                                <td colSpan={4} className="p-4 text-center text-[#9fb3c8]">
                                                    Cargando…
                                                </td>
                                            </tr>
                                        ) : catalogClienteGroups.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="p-4 text-center text-[#9fb3c8]">
                                                    Sin datos
                                                </td>
                                            </tr>
                                        ) : (
                                            catalogClienteGroups.map((g) => (
                                                <tr
                                                    key={g.cliente}
                                                    className={`border-t border-[#1a3a56] cursor-pointer ${
                                                        selectedCatalogCliente === g.cliente ? 'bg-[#0f2942]/80' : ''
                                                    }`}
                                                    onClick={() => {
                                                        setSelectedCatalogCliente(g.cliente);
                                                        openLeadersModalForCliente(g.cliente);
                                                    }}
                                                >
                                                    <td className="p-2">
                                                        <input
                                                            type="radio"
                                                            className="accent-[#65BCF7]"
                                                            checked={selectedCatalogCliente === g.cliente}
                                                            onChange={() => {
                                                                setSelectedCatalogCliente(g.cliente);
                                                                openLeadersModalForCliente(g.cliente);
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    </td>
                                                    <td className="p-2 font-medium">{g.cliente}</td>
                                                    <td className="p-2">
                                                        {g.activeCount} / {g.totalCount}
                                                    </td>
                                                    <td
                                                        className={`p-2 ${g.gpConflict ? 'text-amber-300/90' : 'text-[#9fb3c8]'}`}
                                                    >
                                                        {g.gpDisplay}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {mainView === 'consultores' && (
                        <div className="space-y-4 w-full max-w-[95rem]">
                            <div className="flex flex-wrap gap-2 items-center">
                                <button
                                    type="button"
                                    onClick={openStaffModalCreate}
                                    className="px-4 py-2 rounded-md bg-[#2F7BB8] text-white text-sm font-semibold hover:bg-[#25649a]"
                                >
                                    Crear
                                </button>
                                <button
                                    type="button"
                                    disabled={!selectedCoCedula}
                                    onClick={openStaffModalEdit}
                                    className="px-4 py-2 rounded-md border border-[#1a3a56] text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#0f2942]/60"
                                >
                                    Editar
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 items-end">
                                <select
                                    className="px-3 py-2 rounded bg-[#04141E] border border-[#1a3a56] text-sm"
                                    value={coActivo}
                                    onChange={(e) => setCoActivo(e.target.value)}
                                >
                                    <option value="all">Todos</option>
                                    <option value="true">Activos</option>
                                    <option value="false">Inactivos</option>
                                </select>
                                <input
                                    className="flex-1 min-w-[160px] px-3 py-2 rounded bg-[#04141E] border border-[#1a3a56] text-sm"
                                    value={coQ}
                                    onChange={(e) => setCoQ(e.target.value)}
                                    placeholder="Buscar"
                                />
                                <button
                                    type="button"
                                    onClick={() => loadColaboradores()}
                                    className="px-3 py-2 rounded-md bg-[#0f2942] border border-[#1a3a56] text-sm"
                                >
                                    Refrescar
                                </button>
                            </div>
                            <p className="text-xs text-[#9fb3c8]">
                                Total: {coTotal}. Clic en un encabezado de columna para ordenar (ascendente / descendente).
                            </p>
                            <div className="overflow-x-auto border border-[#1a3a56] rounded-lg">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-[#0b1e30] text-[#9fb3c8]">
                                        <tr>
                                            <th className="text-left p-2 w-10"></th>
                                            {(
                                                [
                                                    ['cedula', 'Cédula'],
                                                    ['nombre', 'Nombre'],
                                                    ['correo', 'Correo'],
                                                    ['cliente', 'Cliente'],
                                                    ['lider', 'Líder'],
                                                    ['activo', 'Activo']
                                                ]
                                            ).map(([col, label]) => (
                                                <th key={col} className="text-left p-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCoSortHeader(col)}
                                                        className="inline-flex items-center gap-1 hover:text-[#65BCF7] cursor-pointer font-medium text-inherit bg-transparent border-0 p-0"
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
                                            <th className="text-left p-2">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {coLoading ? (
                                            <tr>
                                                <td colSpan={8} className="p-4 text-center">
                                                    Cargando…
                                                </td>
                                            </tr>
                                        ) : (
                                            coSortedItems.map((row) => (
                                                <tr
                                                    key={row.cedula}
                                                    className={`border-t border-[#1a3a56] cursor-pointer ${
                                                        selectedCoCedula === row.cedula ? 'bg-[#0f2942]/80' : ''
                                                    }`}
                                                    onClick={() =>
                                                        setSelectedCoCedula((cur) =>
                                                            cur === row.cedula ? null : row.cedula
                                                        )
                                                    }
                                                >
                                                    <td className="p-2">
                                                        <input
                                                            type="radio"
                                                            className="accent-[#65BCF7]"
                                                            checked={selectedCoCedula === row.cedula}
                                                            onChange={() => setSelectedCoCedula(row.cedula)}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                    </td>
                                                    <td className="p-2 whitespace-nowrap">{row.cedula}</td>
                                                    <td className="p-2">{row.nombre}</td>
                                                    <td className="p-2">{row.correo_cinte || '—'}</td>
                                                    <td className="p-2">{row.cliente || '—'}</td>
                                                    <td className="p-2">{row.lider_catalogo || '—'}</td>
                                                    <td className="p-2">{row.activo ? 'Sí' : 'No'}</td>
                                                    <td className="p-2 whitespace-nowrap">
                                                        <button
                                                            type="button"
                                                            className="text-[#65BCF7] hover:underline"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                patchColaborador(row.cedula, { activo: !row.activo });
                                                            }}
                                                        >
                                                            {row.activo ? 'Desactivar' : 'Activar'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </main>
            </div>

            {clienteModalOpen ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="modal-glass-scrim absolute inset-0 transition-opacity"
                        onClick={() => setClienteModalOpen(false)}
                    />
                    <div className="modal-glass-sheet relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] p-0 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-soft)] px-5 py-4">
                            <h2 className="text-lg font-bold text-[var(--text)]">Crear cliente (y primer líder)</h2>
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
                                <label className="block text-xs text-[#9fb3c8] mb-1">Cliente</label>
                                <input
                                    className="w-full px-3 py-2 rounded bg-[#04141E] border border-[#1a3a56] text-sm"
                                    value={clienteForm.cliente}
                                    onChange={(e) => setClienteForm((f) => ({ ...f, cliente: e.target.value }))}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-[#9fb3c8] mb-1">Líder</label>
                                <input
                                    className="w-full px-3 py-2 rounded bg-[#04141E] border border-[#1a3a56] text-sm"
                                    value={clienteForm.lider}
                                    onChange={(e) => setClienteForm((f) => ({ ...f, lider: e.target.value }))}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-[#9fb3c8] mb-1">GP asignado</label>
                                {clienteGpOptionsLoading ? (
                                    <p className="text-xs text-[#9fb3c8]">Cargando lista…</p>
                                ) : (
                                    <select
                                        className="w-full px-3 py-2 rounded bg-[#04141E] border border-[#1a3a56] text-sm"
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
                                    <p className="text-xs text-[#9fb3c8] mt-1">No hay colaboradores en el directorio.</p>
                                ) : !clienteGpOptionsLoading ? (
                                    <p className="text-xs text-[#9fb3c8] mt-1">
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
                                    className="px-4 py-2 rounded-md border border-[#1a3a56] text-sm"
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
                        onClick={() => !editClienteSaving && setEditClienteModalOpen(false)}
                    />
                    <div className="modal-glass-sheet relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] p-0 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-soft)] px-5 py-4">
                            <h2 className="text-lg font-bold text-[var(--text)]">Editar cliente</h2>
                            <button
                                type="button"
                                disabled={editClienteSaving}
                                onClick={() => setEditClienteModalOpen(false)}
                                className="rounded-lg p-2 text-[rgba(159,179,200,0.95)] hover:bg-slate-800/50 disabled:opacity-40"
                                aria-label="Cerrar"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={submitEditClienteModal} className="p-5 space-y-4 overflow-y-auto">
                            {editClienteRowsLoading ? (
                                <p className="text-sm text-[#9fb3c8]">Cargando datos del catálogo…</p>
                            ) : (
                                <>
                                    <p className="text-xs text-[#9fb3c8]">
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
                                        <label className="block text-xs text-[#9fb3c8] mb-1">Nombre del cliente</label>
                                        <input
                                            className="w-full px-3 py-2 rounded bg-[#04141E] border border-[#1a3a56] text-sm"
                                            value={editClienteForm.nombre}
                                            onChange={(e) =>
                                                setEditClienteForm((f) => ({ ...f, nombre: e.target.value }))
                                            }
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-[#9fb3c8] mb-1">
                                            GP (lista completa de colaboradores)
                                        </label>
                                        {editClienteGpOptionsLoading ? (
                                            <p className="text-xs text-[#9fb3c8]">Cargando lista…</p>
                                        ) : (
                                            <select
                                                className="w-full px-3 py-2 rounded bg-[#04141E] border border-[#1a3a56] text-sm"
                                                value={editClienteForm.gp_colaborador_cedula}
                                                onChange={(e) =>
                                                    setEditClienteForm((f) => ({
                                                        ...f,
                                                        gp_colaborador_cedula: e.target.value
                                                    }))
                                                }
                                            >
                                                <option value="">— Sin GP —</option>
                                                {editClienteGpOptions.map((o) => (
                                                    <option key={o.cedula} value={o.value} disabled={o.disabled}>
                                                        {o.label}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                        {!editClienteGpOptionsLoading && editClienteGpOptions.length === 0 ? (
                                            <p className="text-xs text-[#9fb3c8] mt-1">
                                                No hay colaboradores en el directorio.
                                            </p>
                                        ) : !editClienteGpOptionsLoading ? (
                                            <p className="text-xs text-[#9fb3c8] mt-1">
                                                Si el colaborador no tiene correo Cinte, no puede seleccionarse.
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
                                    className="px-4 py-2 rounded-md border border-[#1a3a56] text-sm disabled:opacity-40"
                                    onClick={() => setEditClienteModalOpen(false)}
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
                    <div className="modal-glass-sheet relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] p-0 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-soft)] px-5 py-4">
                            <h2 className="text-lg font-bold text-[var(--text)]">
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
                        <form onSubmit={submitStaffModal} className="p-5 space-y-4 overflow-y-auto">
                            <div>
                                <label className="block text-xs text-[#9fb3c8] mb-1">Cédula (solo dígitos)</label>
                                <input
                                    className="w-full px-3 py-2 rounded bg-[#04141E] border border-[#1a3a56] text-sm disabled:opacity-50"
                                    value={coForm.cedula}
                                    onChange={(e) => setCoForm((f) => ({ ...f, cedula: e.target.value }))}
                                    disabled={staffModalMode === 'edit'}
                                    required={staffModalMode === 'create'}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-[#9fb3c8] mb-1">Nombres y Apellidos</label>
                                <input
                                    className="w-full px-3 py-2 rounded bg-[#04141E] border border-[#1a3a56] text-sm"
                                    value={coForm.nombre}
                                    onChange={(e) => setCoForm((f) => ({ ...f, nombre: e.target.value }))}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-[#9fb3c8] mb-1">Correo Cinte</label>
                                <input
                                    className="w-full px-3 py-2 rounded bg-[#04141E] border border-[#1a3a56] text-sm"
                                    value={coForm.correo_cinte}
                                    onChange={(e) => setCoForm((f) => ({ ...f, correo_cinte: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-[#9fb3c8] mb-1">Cliente</label>
                                <select
                                    className="w-full px-3 py-2 rounded bg-[#04141E] border border-[#1a3a56] text-sm"
                                    value={coForm.cliente}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setCoForm((f) => ({ ...f, cliente: v, lider_catalogo: '' }));
                                        fetchLideresForCliente(v);
                                    }}
                                >
                                    <option value="">— Seleccionar —</option>
                                    {catalogClientes.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs text-[#9fb3c8] mb-1">Líder</label>
                                <select
                                    className="w-full px-3 py-2 rounded bg-[#04141E] border border-[#1a3a56] text-sm"
                                    value={coForm.lider_catalogo}
                                    onChange={(e) => setCoForm((f) => ({ ...f, lider_catalogo: e.target.value }))}
                                    disabled={!coForm.cliente || liderLoading}
                                >
                                    <option value="">
                                        {!coForm.cliente ? 'Elige un cliente primero' : liderLoading ? 'Cargando…' : '— Seleccionar —'}
                                    </option>
                                    {liderOptions.map((l) => (
                                        <option key={l} value={l}>
                                            {l}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <p className="text-xs text-[#9fb3c8]">
                                El GP se toma automáticamente del par cliente–líder en el catálogo (si está definido).
                            </p>
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="submit"
                                    className="px-4 py-2 rounded-md bg-[#2F7BB8] text-white text-sm font-semibold"
                                >
                                    Guardar
                                </button>
                                <button
                                    type="button"
                                    className="px-4 py-2 rounded-md border border-[#1a3a56] text-sm"
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
                    <div className="modal-glass-sheet relative w-full max-w-md rounded-2xl border border-[var(--border)] p-6 shadow-2xl">
                        <p className="text-sm text-[#e6edf3]">
                            ¿Desactivar <strong>todos los líderes</strong> del cliente{' '}
                            <strong>{selectedCatalogCliente}</strong> en el catálogo?
                        </p>
                        <div className="mt-4 flex gap-2 justify-end">
                            <button
                                type="button"
                                className="px-3 py-2 rounded-md border border-[#1a3a56] text-sm"
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
                                        loadCatalogo();
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
                            }
                        }}
                    />
                    <div className="modal-glass-sheet relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] p-0 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-soft)] px-5 py-4">
                            <div>
                                <h2 className="text-lg font-bold text-[var(--text)]">Líderes</h2>
                                <p className="text-xs text-[#9fb3c8] mt-0.5">{leadersModalCliente}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setLeadersModalCliente(null);
                                    setAddLiderModalOpen(false);
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
                            <div className="overflow-x-auto border border-[#1a3a56] rounded-lg">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-[#0b1e30] text-[#9fb3c8]">
                                        <tr>
                                            <th className="text-left p-2">Líder</th>
                                            <th className="text-left p-2">Activo</th>
                                            <th className="text-left p-2">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leadersModalRows.map((row) => (
                                            <tr key={row.id} className="border-t border-[#1a3a56]">
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
                                        ))}
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
                    <div className="modal-glass-sheet relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-[var(--border)] p-0 shadow-2xl">
                        <div className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface-soft)] px-5 py-4">
                            <h2 className="text-lg font-bold text-[var(--text)]">Agregar líder</h2>
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
                            <p className="text-xs text-[#9fb3c8]">Cliente: {leadersModalCliente}</p>
                            <div>
                                <label className="block text-xs text-[#9fb3c8] mb-1">Líder</label>
                                <input
                                    className="w-full px-3 py-2 rounded bg-[#04141E] border border-[#1a3a56] text-sm"
                                    value={addLiderForm.lider}
                                    onChange={(e) => setAddLiderForm((f) => ({ ...f, lider: e.target.value }))}
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-[#9fb3c8] mb-1">GP asignado</label>
                                <GpUserSelect
                                    className="w-full px-3 py-2 rounded bg-[#04141E] border border-[#1a3a56] text-sm"
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
                                    className="px-4 py-2 rounded-md border border-[#1a3a56] text-sm"
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
