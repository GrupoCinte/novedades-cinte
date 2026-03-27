import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid, BarChart, Bar } from 'recharts';
import { X, Download, Eye, LayoutDashboard, Calendar, TrendingUp, Briefcase, BadgeCheck, DollarSign, Users, Activity, ChevronLeft, ChevronRight, Code2, KeyRound, LogOut, Menu, FileText, FileImage, FileSpreadsheet } from 'lucide-react';
import ChatWidget from './ChatWidget';
import { getNovedadRule, NOVEDAD_TYPES } from './novedadRules';
import ROLE_PRIORITY from './constants/rolePriority.json';

export default function Dashboard({ token, onLogout }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [soporteModal, setSoporteModal] = useState(null);
    const [activeTab, setActiveTab] = useState('Inicio');
    const [stateError, setStateError] = useState(null);
    const [soporteLoading, setSoporteLoading] = useState(false);
    const parseJwt = (rawToken) => {
        try {
            const payload = rawToken.split('.')[1];
            const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
            return JSON.parse(atob(normalized));
        } catch {
            return {};
        }
    };
    const resolveRoleFromClaims = (claims = {}) => {
        const direct = String(claims.role || '').toLowerCase();
        if (direct) return direct;
        const groupsClaim = claims['cognito:groups'];
        const groups = Array.isArray(groupsClaim) ? groupsClaim : (groupsClaim ? [groupsClaim] : []);
        const normalized = groups.map((g) => String(g || '').toLowerCase());
        return ROLE_PRIORITY.find((role) => normalized.includes(role)) || '';
    };
    const authFromStorage = (() => {
        try {
            return JSON.parse(localStorage.getItem('cinteAuth') || 'null');
        } catch {
            return null;
        }
    })();
    const tokenClaims = parseJwt(token);
    const currentRole = resolveRoleFromClaims(tokenClaims) || resolveRoleFromClaims(authFromStorage?.claims || {});
    const currentRoleLabel = currentRole ? String(currentRole).replace(/_/g, ' ').toUpperCase() : 'SIN ROL';
    const currentEmail = String(tokenClaims.email || authFromStorage?.user?.email || authFromStorage?.claims?.email || 'sin-correo').toLowerCase();
    const PANEL_POLICY = {
        super_admin: ['dashboard', 'calendar', 'gestion', 'admin'],
        admin_ch: ['dashboard', 'calendar', 'gestion'],
        team_ch: ['dashboard', 'calendar', 'gestion'],
        admin_ops: ['dashboard', 'calendar'],
        comercial: [],
        gp: ['dashboard', 'calendar', 'gestion'],
        nomina: ['dashboard', 'calendar', 'gestion'],
        sst: ['dashboard', 'calendar', 'gestion']
    };
    const tabPanelMap = {
        Inicio: 'dashboard',
        'Análisis Avanzado': 'dashboard',
        Calendario: 'calendar',
        Gestión: 'gestion'
    };
    const allowedPanels = PANEL_POLICY[currentRole] || [];
    const canAccessPanel = (panel) => allowedPanels.includes(panel);
    const canApproveItem = (item) => {
        if (!item || item.estado !== 'Pendiente') return false;
        if (currentRole === 'super_admin') return true;
        const rule = getNovedadRule(item.tipoNovedad);
        return Array.isArray(rule.approvers) && rule.approvers.includes(currentRole);
    };

    // Calendar State
    const [currentMonth, setCurrentMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [selectedDayItems, setSelectedDayItems] = useState(null);
    const [calendarView, setCalendarView] = useState('monthly');
    const [currentDay, setCurrentDay] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));

    // Dashboard (Inicio) date filters
    const [fMes, setFMes] = useState('');         // '' = todos, '0'-'11' = ene-dic
    const [fDia, setFDia] = useState('');         // '' = todos, '1'-'31'
    const [fTipoInicio, setFTipoInicio] = useState(''); // '' = todos los tipos

    // Gestión table filters
    const [fTipo, setFTipo] = useState('');
    const [fEstado, setFEstado] = useState('');
    const [fCorreo, setFCorreo] = useState('');
    const [fCliente, setFCliente] = useState('');
    const [fClienteCalendario, setFClienteCalendario] = useState('');
    const [calendarClientesList, setCalendarClientesList] = useState([]);
    const [sortBy, setSortBy] = useState('creadoEn');
    const [sortDir, setSortDir] = useState('desc');
    const [pageSize, setPageSize] = useState(10);
    const [currentPage, setCurrentPage] = useState(1);
    const [gestionItems, setGestionItems] = useState([]);
    const [gestionPagination, setGestionPagination] = useState({
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 1
    });
    const [gestionDetailItem, setGestionDetailItem] = useState(null);
    const navigate = useNavigate();

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/novedades', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('No autorizado');
            const data = await res.json();
            setItems(data.items || []);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const loadGestionData = async (page = currentPage, limit = pageSize) => {
        setLoading(true);
        try {
            const params = {
                page: String(page),
                limit: String(limit),
                sortBy: String(sortBy || 'creadoEn'),
                sortDir: String(sortDir || 'desc')
            };
            if (fTipo) params.tipo = fTipo;
            if (fEstado) params.estado = fEstado;
            if (fCorreo) params.correo = fCorreo;
            if (fCliente) params.cliente = fCliente;
            const query = new URLSearchParams(params).toString();
            const res = await fetch(`/api/novedades?${query}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) throw new Error('No autorizado');
            const data = await res.json();
            setGestionItems(data.items || []);
            setGestionPagination({
                page: Number(data?.pagination?.page || page || 1),
                limit: Number(data?.pagination?.limit || limit || pageSize),
                total: Number(data?.pagination?.total || 0),
                totalPages: Number(data?.pagination?.totalPages || 1)
            });
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        const loadCalClientes = async () => {
            try {
                const res = await fetch('/api/catalogos/clientes');
                const json = await res.json();
                if (res.ok && Array.isArray(json.items)) setCalendarClientesList(json.items);
            } catch (err) {
                console.error(err);
            }
        };
        loadCalClientes();
    }, []);
    useEffect(() => {
        loadGestionData(currentPage, pageSize);
    }, [currentPage, pageSize, fTipo, fEstado, fCorreo, fCliente, sortBy, sortDir]);

    const changeState = async (id, nuevoEstado) => {
        setStateError(null);
        console.log('[changeState] Iniciando cambio de estado:', { id, nuevoEstado, token: token ? '✅ token presente' : '❌ SIN TOKEN' });
        try {
            const res = await fetch('/api/actualizar-estado', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ id, nuevoEstado })
            });
            console.log('[changeState] Respuesta status:', res.status);
            const data = await res.json();
            console.log('[changeState] Respuesta data:', data);
            if (res.ok) {
                await loadData();
                await loadGestionData(currentPage, pageSize);
            } else {
                const errMsg = data?.error || `Error ${res.status}`;
                console.error('[changeState] Error del servidor:', errMsg);
                setStateError(errMsg);
            }
        } catch (err) {
            console.error('[changeState] Error de red/fetch:', err);
            setStateError('Error de conexión con el servidor. Verifica que el backend esté corriendo en :3005');
        }
    };

    const detectSupportType = (pathOrKey = '') => {
        const lower = String(pathOrKey || '').toLowerCase();
        if (lower.endsWith('.pdf')) return 'pdf';
        if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png')) return 'image';
        if (lower.endsWith('.xls') || lower.endsWith('.xlsx')) return 'excel';
        return 'other';
    };

    const buildSupportList = (it) => {
        const raw = Array.isArray(it?.soportes) && it.soportes.length > 0
            ? it.soportes
            : [it?.soporteRuta || it?.soporteKey || ''].filter(Boolean);
        return raw.map((entry, index) => {
            const key = String(entry || '');
            const type = detectSupportType(key);
            return {
                id: `${it?.id || it?.creadoEn || 'novedad'}-${index}`,
                key,
                type,
                isLocal: key.startsWith('/assets/'),
                name: key.split('/').pop() || `soporte_${index + 1}`
            };
        });
    };

    const fetchSupportUrl = async (support) => {
        if (support.isLocal) return support.key;
        const res = await fetch(`/api/soportes/url?key=${encodeURIComponent(support.key)}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();
        if (!res.ok || !json?.url) throw new Error(json?.error || 'No se pudo abrir soporte');
        return json.url;
    };

    const downloadSupport = async (support) => {
        if (!support) return;
        try {
            const url = await fetchSupportUrl(support);
            const safeName = String(support.name || '').trim() || 'archivo';
            const a = document.createElement('a');
            a.href = url;
            a.download = safeName;
            a.rel = 'noreferrer';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            // Fallback: si el atributo download no funciona por CORS/signed URL, abrimos.
            try {
                const url = await fetchSupportUrl(support);
                window.open(url, '_blank', 'noopener,noreferrer');
            } catch (e2) {
                setStateError(err?.message || e2?.message || 'No se pudo descargar el archivo');
            }
        }
    };

    const fetchExcelPreview = async (support) => {
        const res = await fetch(`/api/soportes/preview?key=${encodeURIComponent(support.key)}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();
        if (!res.ok || !json?.ok) throw new Error(json?.error || 'No se pudo previsualizar el Excel');
        return json;
    };

    const openSupport = async (it, supportToOpen = null) => {
        const supports = buildSupportList(it);
        if (supports.length === 0) return;
        const selected = supportToOpen || supports[0];
        setSoporteLoading(true);
        try {
            const url = await fetchSupportUrl(selected);
            const modal = {
                supports,
                currentKey: selected.key,
                currentType: selected.type,
                currentName: selected.name,
                currentUrl: url,
                excelPreview: null
            };
            if (selected.type === 'excel') {
                modal.excelPreview = await fetchExcelPreview(selected).catch(() => null);
            }
            setSoporteModal(modal);
        } catch (err) {
            console.error(err);
            setStateError(err?.message || 'No se pudo obtener el soporte');
        } finally {
            setSoporteLoading(false);
        }
    };

    const openSupportFromModal = async (support) => {
        if (!soporteModal) return;
        setSoporteLoading(true);
        try {
            const url = await fetchSupportUrl(support);
            const nextModal = {
                ...soporteModal,
                currentKey: support.key,
                currentType: support.type,
                currentName: support.name,
                currentUrl: url,
                excelPreview: null
            };
            if (support.type === 'excel') {
                nextModal.excelPreview = await fetchExcelPreview(support).catch(() => null);
            }
            setSoporteModal(nextModal);
        } catch (err) {
            console.error(err);
            setStateError(err?.message || 'No se pudo abrir el soporte seleccionado');
        } finally {
            setSoporteLoading(false);
        }
    };

    const soporteModalCurrentSupport = Array.isArray(soporteModal?.supports)
        ? soporteModal.supports.find((s) => s.key === soporteModal.currentKey) || null
        : null;

    // ── Dashboard filter helper ──────────────────────────────────────────────
    // Helper: get the reference date for an item (fechaInicio preferred, else creadoEn)
    const getItemDate = (it) => {
        if (it.fechaInicio) return new Date(it.fechaInicio + 'T00:00:00');
        return new Date(it.creadoEn);
    };

    // Items visible in the Inicio dashboard (filtered by mes + día + tipo)
    const dashItems = items.filter(it => {
        const d = getItemDate(it);
        if (isNaN(d.getTime())) return true;
        if (fMes !== '' && d.getMonth() !== Number(fMes)) return false;
        if (fDia !== '' && d.getDate() !== Number(fDia)) return false;
        if (fTipoInicio !== '' && it.tipoNovedad !== fTipoInicio) return false;
        return true;
    });

    // Available days for the selected month (for the day dropdown)
    const availableDays = fMes !== ''
        ? Array.from(new Set(
            items
                .map(it => getItemDate(it))
                .filter(d => !isNaN(d.getTime()) && d.getMonth() === Number(fMes))
                .map(d => d.getDate())
        )).sort((a, b) => a - b)
        : Array.from({ length: 31 }, (_, i) => i + 1);

    // ── Data Processing (based on dashItems) ─────────────────────────────────
    // 1. Top 5 Empleados
    const empMap = dashItems.reduce((acc, it) => {
        acc[it.nombre] = (acc[it.nombre] || 0) + 1;
        return acc;
    }, {});
    const topEmpleados = Object.keys(empMap)
        .map(k => ({ nombre: k, count: empMap[k] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    // 2. Distribución Tipos (Donut)
    const typeDataMap = dashItems.reduce((acc, it) => {
        const tipo = it.tipoNovedad || 'Otro';
        acc[tipo] = (acc[tipo] || 0) + 1;
        return acc;
    }, {});
    const typeData = Object.keys(typeDataMap).map(k => ({ name: k, value: typeDataMap[k] }));
    const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    // 3. Monitor de Tendencia – agrupa dashItems por mes del año en curso
    const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
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

    // 4. Sparkline para Total
    const sparkData = items.length > 0
        ? items.map((_, i) => ({ val: i + (Math.random() * 5) }))
        : Array.from({ length: 10 }).map(() => ({ val: Math.random() * 10 }));

    // ── Gestión table filters ─────────────────────────────────────────────────
    const sortedItems = gestionItems;

    const totalPages = Math.max(1, Number(gestionPagination.totalPages || 1));
    const safePage = Math.min(currentPage, totalPages);
    const pagedItems = sortedItems;

    useEffect(() => {
        setCurrentPage(1);
    }, [fTipo, fEstado, fCorreo, fCliente, sortBy, sortDir, pageSize]);
    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const pendientesCount = items.filter(i => i.estado === 'Pendiente').length;
    // KPI Impacto financiero ficticio baseado en el número de novedades
    const impactoEst = (dashItems.length * 45000).toLocaleString('es-CO');

    // --- CALENDAR LOGIC ---
    const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);

    const calendarDays = [];
    for (let i = 0; i < firstDay; i++) calendarDays.push(null);
    for (let i = 1; i <= daysInMonth; i++) calendarDays.push(new Date(year, month, i));

    const toIsoDate = (input) => {
        if (!input) return '';
        const asString = String(input);
        if (/^\d{4}-\d{2}-\d{2}$/.test(asString)) return asString;
        const parsed = new Date(asString);
        if (Number.isNaN(parsed.getTime())) return '';
        return parsed.toISOString().slice(0, 10);
    };

    const expandDateRangeInclusive = (startRaw, endRaw) => {
        const startIso = toIsoDate(startRaw);
        const endIso = toIsoDate(endRaw) || startIso;
        if (!startIso) return [];
        if (!endIso || endIso < startIso) return [startIso];

        const dates = [];
        const cursor = new Date(`${startIso}T00:00:00`);
        const end = new Date(`${endIso}T00:00:00`);
        while (cursor <= end) {
            dates.push(cursor.toISOString().slice(0, 10));
            cursor.setDate(cursor.getDate() + 1);
        }
        return dates;
    };

    const calendarSourceItems = useMemo(() => {
        if (!fClienteCalendario) return items;
        return items.filter((it) => String(it.cliente || '').trim() === fClienteCalendario);
    }, [items, fClienteCalendario]);

    const itemsByDate = calendarSourceItems.reduce((acc, it) => {
        const startDate = it.fechaInicio || toIsoDate(it.creadoEn);
        const endDate = it.fechaFin || startDate;
        const range = expandDateRangeInclusive(startDate, endDate);

        if (range.length === 0) {
            const fallback = toIsoDate(it.creadoEn);
            if (!fallback) return acc;
            if (!acc[fallback]) acc[fallback] = [];
            acc[fallback].push(it);
            return acc;
        }

        for (const dayIso of range) {
            if (!acc[dayIso]) acc[dayIso] = [];
            acc[dayIso].push(it);
        }
        return acc;
    }, {});
    const currentDayStr = currentDay.toISOString().slice(0, 10);
    const dailyItems = itemsByDate[currentDayStr] || [];

    const getTypeColor = (tipo) => {
        if (!tipo) return 'text-slate-400 bg-slate-400/20 border-slate-400/50';
        const t = tipo.toLowerCase();
        if (t.includes('incapacidad')) return 'text-rose-400 bg-rose-500/20 border-rose-500/50';
        if (t.includes('vacacion')) return 'text-amber-400 bg-amber-500/20 border-amber-500/50';
        if (t.includes('permiso')) return 'text-blue-400 bg-blue-500/20 border-blue-500/50';
        if (t.includes('extra')) return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/50';
        if (t.includes('licencia')) return 'text-purple-400 bg-purple-500/20 border-purple-500/50';
        return 'text-slate-400 bg-slate-400/20 border-slate-400/50';
    };
    // -----------------------

    const exportCSV = async () => {
        try {
            const params = {
                sortBy: String(sortBy || 'creadoEn'),
                sortDir: String(sortDir || 'desc')
            };
            if (fTipo) params.tipo = fTipo;
            if (fEstado) params.estado = fEstado;
            if (fCorreo) params.correo = fCorreo;
            if (fCliente) params.cliente = fCliente;
            const query = new URLSearchParams(params).toString();
            const res = await fetch(`/api/novedades/export-csv?${query}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload?.error || payload?.message || `Error ${res.status} exportando CSV`);
            }
            const blob = await res.blob();
            const disposition = res.headers.get('content-disposition') || '';
            const match = disposition.match(/filename="?([^"]+)"?/i);
            const filename = (match && match[1]) ? match[1] : `novedades_reporte_${new Date().toISOString().slice(0, 10)}.csv`;
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        } catch (err) {
            setStateError(err?.message || 'No se pudo exportar el reporte CSV.');
        }
    };

    const handleSidebarLogout = () => {
        if (onLogout) {
            onLogout();
            return;
        }
        localStorage.removeItem('cinteAuth');
        navigate('/admin', { replace: true });
    };

    // Sidebar
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const navItems = [
        { id: 'Inicio', icon: LayoutDashboard, label: 'Inicio (Dashboard)' },
        { id: 'Calendario', icon: Calendar, label: 'Calendario' },
        { id: 'Análisis Avanzado', icon: TrendingUp, label: 'Análisis Avanzado' },
        { id: 'Gestión', icon: Briefcase, label: 'Gestión de Novedades' },
    ].filter((item) => canAccessPanel(tabPanelMap[item.id]));

    useEffect(() => {
        const allowedTabs = navItems.map((n) => n.id);
        if (!allowedTabs.includes(activeTab)) {
            setActiveTab(allowedTabs[0] || 'Calendario');
        }
    }, [activeTab, navItems]);
    useEffect(() => {
        setMobileMenuOpen(false);
    }, [activeTab]);

    return (
        <div className="flex h-full w-full bg-[#0f172a] text-slate-200 overflow-hidden font-sans">

            {/* ───────── MOBILE SIDEBAR ───────── */}
            <button
                onClick={() => setMobileMenuOpen(true)}
                className="md:hidden fixed top-24 left-4 z-40 w-10 h-10 rounded-lg bg-[#1e293b] border border-slate-700 text-slate-200 flex items-center justify-center shadow-lg"
                aria-label="Abrir menú"
            >
                <Menu size={18} />
            </button>
            {mobileMenuOpen && (
                <div
                    className="md:hidden fixed inset-0 bg-black/50 z-40"
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}
            <aside
                className={`md:hidden fixed top-0 left-0 h-full w-72 bg-[#1e293b] border-r border-slate-700/50 z-50 shadow-2xl transform transition-transform duration-300 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                <div className="p-4 border-b border-slate-700/50 flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Sistema Análisis</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Novedades CINTE</p>
                    </div>
                    <button
                        onClick={() => setMobileMenuOpen(false)}
                        className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center"
                        aria-label="Cerrar menú"
                    >
                        <X size={16} />
                    </button>
                </div>
                <nav className="p-3 flex flex-col gap-2">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const active = activeTab === item.id;
                        return (
                            <button
                                key={`mobile-${item.id}`}
                                onClick={() => setActiveTab(item.id)}
                                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700/50'
                                    }`}
                            >
                                <Icon size={17} />
                                <span>{item.label}</span>
                            </button>
                        );
                    })}
                </nav>
                <div className="mt-auto p-4 border-t border-slate-700/50">
                    <p className="text-[10px] font-black text-slate-300 truncate">{currentEmail}</p>
                    <p className="text-[10px] text-blue-400 font-semibold uppercase">{currentRoleLabel}</p>
                    <div className="mt-3 flex flex-col gap-2">
                        <button
                            onClick={() => navigate('/perfil/cambiar-clave')}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-700/60 transition-all text-xs font-semibold"
                        >
                            <KeyRound size={14} />
                            Cambiar contraseña
                        </button>
                        <button
                            onClick={handleSidebarLogout}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 transition-all text-xs font-semibold"
                        >
                            <LogOut size={14} />
                            Cerrar sesión
                        </button>
                    </div>
                </div>
            </aside>

            {/* ───────── SIDEBAR COLAPSABLE ───────── */}
            <aside
                className={`
                    bg-[#1e293b] flex-shrink-0 flex-col hidden md:flex h-full shadow-2xl relative z-10
                    transition-all duration-300 ease-in-out overflow-hidden
                    ${sidebarOpen ? 'w-64' : 'w-16'}
                `}
            >
                {/* Header + toggle */}
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

                {/* Nav items */}
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
                                    ${active
                                        ? 'bg-blue-600 shadow-[0_4px_12px_rgba(59,130,246,0.3)] text-white'
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                                    }
                                `}
                            >
                                <Icon size={18} className={`flex-shrink-0 ${active ? 'text-white' : 'text-slate-500'}`} />
                                {sidebarOpen && (
                                    <span className="truncate whitespace-nowrap overflow-hidden transition-all duration-300">
                                        {item.label}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </nav>

                {/* Footer */}
                <div className={`border-t border-slate-700/50 ${sidebarOpen ? 'p-4' : 'p-2'}`}>
                    {sidebarOpen ? (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                                    <Code2 size={13} className="text-blue-400" />
                                </div>
                                <div className="overflow-hidden">
                                    <p className="text-[10px] font-black text-slate-300 whitespace-nowrap leading-tight truncate">{currentEmail}</p>
                                    <p className="text-[9px] text-blue-400 font-semibold whitespace-nowrap leading-tight">{currentRoleLabel}</p>
                                </div>
                            </div>
                            <p className="text-[9px] text-slate-600 font-bold uppercase tracking-widest text-center border-t border-slate-700/50 pt-2">
                                Consultores Grupo CINTE · V1.0
                            </p>
                            <div className="border-t border-slate-700/50 pt-2 flex flex-col gap-2">
                                <button
                                    onClick={() => navigate('/perfil/cambiar-clave')}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700/60 transition-all text-xs font-semibold"
                                >
                                    <KeyRound size={14} />
                                    Cambiar contraseña
                                </button>
                                <button
                                    onClick={handleSidebarLogout}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-500/30 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-all text-xs font-semibold"
                                >
                                    <LogOut size={14} />
                                    Cerrar sesión
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2">
                            <div className="flex justify-center" title={`${currentEmail} - ${currentRoleLabel}`}>
                                <div className="w-7 h-7 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center">
                                    <Code2 size={13} className="text-blue-400" />
                                </div>
                            </div>
                            <button
                                onClick={() => navigate('/perfil/cambiar-clave')}
                                title="Cambiar contraseña"
                                className="w-7 h-7 rounded-lg border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700/60 flex items-center justify-center transition-all"
                            >
                                <KeyRound size={13} />
                            </button>
                            <button
                                onClick={handleSidebarLogout}
                                title="Cerrar sesión"
                                className="w-7 h-7 rounded-lg border border-rose-500/40 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 flex items-center justify-center transition-all"
                            >
                                <LogOut size={13} />
                            </button>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto p-4 pt-14 md:pt-6 md:p-6 relative scroll-smooth bg-[#0f172a]">

                {/* ---------- INICIO (DASHBOARD) ---------- */}
                {activeTab === 'Inicio' && canAccessPanel('dashboard') && (
                    <div className="flex flex-col gap-5 animate-in fade-in duration-300 min-h-[calc(100vh-9.5rem)]">

                        {/* ── Filtros: Período + Tipo de Novedad ── */}
                        <div className="flex flex-col gap-3 bg-[#1e293b] border border-slate-700/50 rounded-2xl px-5 py-4 shadow-lg">

                            {/* Fila 1: Mes / Día / Tipo */}
                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <Calendar size={16} className="text-blue-400" />
                                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Filtrar por período</span>
                                </div>
                                <div className="flex-1 h-px bg-slate-700/50" />

                                {/* Mes */}
                                <div className="flex items-center gap-2">
                                    <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider whitespace-nowrap">Mes</label>
                                    <select
                                        value={fMes}
                                        onChange={e => { setFMes(e.target.value); setFDia(''); }}
                                        className="bg-slate-800 border border-slate-600 text-sm text-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                                    >
                                        <option value="">Todos los meses</option>
                                        {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((m, i) => (
                                            <option key={i} value={String(i)}>{m}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Día */}
                                <div className="flex items-center gap-2">
                                    <label className="text-xs text-slate-500 font-semibold uppercase tracking-wider whitespace-nowrap">Día</label>
                                    <select
                                        value={fDia}
                                        onChange={e => setFDia(e.target.value)}
                                        className="bg-slate-800 border border-slate-600 text-sm text-slate-200 px-3 py-1.5 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                                    >
                                        <option value="">Todos los días</option>
                                        {availableDays.map(d => (
                                            <option key={d} value={String(d)}>{d}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Botón limpiar */}
                                {(fMes !== '' || fDia !== '' || fTipoInicio !== '') && (
                                    <button
                                        onClick={() => { setFMes(''); setFDia(''); setFTipoInicio(''); }}
                                        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-500/50 px-3 py-1.5 rounded-lg transition-all bg-slate-800 hover:bg-rose-500/10"
                                    >
                                        <X size={12} /> Limpiar filtros
                                    </button>
                                )}

                                {/* Badge de resultados */}
                                <div className="ml-auto flex items-center gap-2">
                                    <span className="text-xs text-slate-500">Mostrando</span>
                                    <span className="text-sm font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-full">
                                        {dashItems.length} de {items.length} registros
                                    </span>
                                </div>
                            </div>

                            {/* Fila 2: Chips tipo de novedad */}
                            <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-700/40">
                                <span className="text-xs font-bold uppercase tracking-widest text-slate-500 whitespace-nowrap">Tipo:</span>
                                {[
                                    { label: 'Todos', value: '', cls: 'border-slate-600 text-slate-300 bg-slate-800', activeCls: 'bg-slate-600 border-slate-400 text-white' },
                                    ...NOVEDAD_TYPES.map((tipo) => ({
                                        label: tipo,
                                        value: tipo,
                                        cls: 'border-slate-600 text-slate-300 bg-slate-800',
                                        activeCls: 'bg-blue-600 border-blue-400 text-white'
                                    }))
                                ].map(chip => {
                                    const isActive = fTipoInicio === chip.value;
                                    return (
                                        <button
                                            key={chip.value}
                                            onClick={() => setFTipoInicio(chip.value)}
                                            className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-all ${isActive ? chip.activeCls : chip.cls + ' hover:opacity-80'
                                                }`}
                                        >
                                            {chip.label}
                                            {chip.value !== '' && (
                                                <span className="ml-1.5 opacity-70 font-normal">
                                                    ({items.filter(i => i.tipoNovedad === chip.value).length})
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* KPIs Row */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                            <div className="bg-[#1e293b] rounded-2xl p-6 border border-slate-700/50 shadow-lg relative overflow-hidden group">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-slate-400 text-sm font-medium">Total Novedades</p>
                                        <h3 className="text-3xl font-bold text-white mt-1">{dashItems.length}</h3>
                                        {dashItems.length !== items.length && <p className="text-[10px] text-blue-400 mt-0.5">de {items.length} totales</p>}
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
                                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
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
                                        <p className="text-slate-400 text-sm font-medium">Novedades pendientes por aprobación</p>
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

                        {/* Predicción IA */}
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
                                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
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
                            <div className="flex items-center gap-4 text-xs font-medium mt-4 justify-end">
                                <span className="flex items-center gap-1.5 align-middle text-slate-300"><div className="w-3 h-3 rounded-full bg-blue-500"></div> Dato Real</span>
                                <span className="flex items-center gap-1.5 align-middle text-slate-400"><div className="w-6 h-0.5 border-t-2 border-dashed border-slate-400"></div> Predicción IA</span>
                            </div>
                        </div>

                        {/* Grid inferior 2 Cols */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">

                            <div className="bg-[#1e293b] rounded-2xl p-6 border border-slate-700/50 shadow-lg">
                                <h2 className="text-lg font-bold text-white mb-6">Distribución por Tipología</h2>
                                <div className="h-72 w-full">
                                    <ResponsiveContainer>
                                        <BarChart
                                            data={[...typeData].sort((a, b) => b.value - a.value)}
                                            layout="vertical"
                                            margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} horizontal={false} />
                                            <XAxis type="number" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                                            <YAxis
                                                dataKey="name"
                                                type="category"
                                                width={170}
                                                stroke="#94a3b8"
                                                fontSize={11}
                                                interval={0}
                                                tickLine={false}
                                                axisLine={false}
                                            />
                                            <Tooltip
                                                cursor={{ fill: '#334155', opacity: 0.15 }}
                                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '10px' }}
                                                formatter={(value, name, props) => [value, props?.payload?.name || name]}
                                            />
                                            <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                                                {[...typeData].sort((a, b) => b.value - a.value).map((entry, index) => (
                                                    <Cell key={`bar-tipologia-${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="bg-[#1e293b] rounded-2xl p-6 border border-slate-700/50 shadow-lg">
                                <h2 className="text-lg font-bold text-white mb-6">Top 5 empleados con más novedades</h2>
                                <div className="flex flex-col gap-4">
                                    {topEmpleados.length === 0 ? (
                                        <p className="text-center text-slate-400 mt-10">Generando analíticas...</p>
                                    ) : topEmpleados.map((emp, i) => (
                                        <div key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-700">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center font-bold text-blue-400">
                                                    {emp.nombre.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className="text-slate-200 font-medium">{emp.nombre}</p>
                                                    <p className="text-slate-500 text-xs">Aproximación mensual</p>
                                                </div>
                                            </div>
                                            <div className="bg-slate-800 px-3 py-1 rounded-lg text-slate-300 font-bold border border-slate-700">
                                                {emp.count} reg.
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ---------- GESTIÓN ---------- */}
                {activeTab === 'Gestión' && canAccessPanel('gestion') && (
                    <div className="animate-in fade-in slide-in-from-right-8 duration-300 pb-2 flex flex-col h-[calc(100vh-8.5rem)] md:h-[calc(100vh-7.5rem)]">
                        {/* Banner de error de acción */}
                        {stateError && (
                            <div className="mb-4 flex items-center gap-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 px-4 py-3 rounded-xl text-sm font-medium">
                                <X size={16} className="flex-shrink-0" />
                                <span>{stateError}</span>
                                <button onClick={() => setStateError(null)} className="ml-auto text-rose-400 hover:text-rose-300"><X size={14} /></button>
                            </div>
                        )}
                        <div className="bg-[#1e293b] border border-slate-700/50 rounded-2xl shadow-lg flex flex-col h-full overflow-hidden">
                            <div className="p-4 border-b border-slate-700/50 bg-[#1e293b] sticky top-0 z-20">
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
                                    <input type="text" placeholder="Buscar correo..." value={fCorreo} onChange={(e) => setFCorreo(e.target.value)} className="bg-slate-800 border border-slate-600 text-sm text-slate-200 px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-500 min-w-[180px]" />
                                    <input type="text" placeholder="Filtrar cliente..." value={fCliente} onChange={(e) => setFCliente(e.target.value)} className="bg-slate-800 border border-slate-600 text-sm text-slate-200 px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-500 min-w-[180px]" />
                                    <select onChange={e => setSortBy(e.target.value)} value={sortBy} className="bg-slate-800 border border-slate-600 text-sm text-slate-200 px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                                        <option value="creadoEn">Ordenar: Fecha creación</option>
                                        <option value="estado">Ordenar: Estado</option>
                                        <option value="tipoNovedad">Ordenar: Tipo</option>
                                    </select>
                                    <select onChange={e => setSortDir(e.target.value)} value={sortDir} className="bg-slate-800 border border-slate-600 text-sm text-slate-200 px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                                        <option value="desc">Descendente</option>
                                        <option value="asc">Ascendente</option>
                                    </select>
                                    <select onChange={e => setPageSize(Number(e.target.value))} value={pageSize} className="bg-slate-800 border border-slate-600 text-sm text-slate-200 px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                                        <option value={10}>10 por página</option>
                                        <option value={20}>20 por página</option>
                                        <option value={50}>50 por página</option>
                                    </select>

                                    <div className="flex-1"></div>

                                    <button onClick={exportCSV} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm transition-all flex items-center gap-2 shadow-sm font-medium">
                                        <Download size={16} /> Exportar Reporte CSV
                                    </button>
                                </div>
                            </div>

                            <div className="w-full flex-1 min-h-0 bg-[#0f172a]/50 flex flex-col">
                                <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
                                    <table className="w-full text-left border-collapse whitespace-nowrap min-w-[900px] md:min-w-full">
                                        <thead>
                                            <tr className="bg-[#1e293b] text-slate-400 text-xs uppercase tracking-wider sticky top-0 z-10 shadow-sm border-b border-slate-700/50">
                                                <th className="p-4 pl-6 font-semibold">Creado</th>
                                                <th className="p-4 font-semibold">Nombre</th>
                                                <th className="p-4 font-semibold">Cliente</th>
                                                <th className="p-4 font-semibold">Tipo</th>
                                                <th className="p-4 font-semibold">F. Inicio</th>
                                                <th className="p-4 font-semibold text-center">Horas</th>
                                                <th className="p-4 font-semibold">Estado</th>
                                                <th className="p-4 font-semibold">Aprobado por</th>
                                                <th className="p-4 pr-6 font-semibold text-right">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-700/50 text-sm">
                                            {loading ? (
                                                <tr><td colSpan="9" className="p-12 text-center text-slate-500 font-medium">Cargando base de datos...</td></tr>
                                            ) : sortedItems.length === 0 ? (
                                                <tr><td colSpan="9" className="p-12 text-center text-slate-500 font-medium">No se encontraron registros.</td></tr>
                                            ) : (
                                                pagedItems.map(it => {
                                                    const cread = new Date(it.creadoEn);
                                                    const validCread = isNaN(cread.getTime()) ? '-' : cread.toLocaleDateString('es-ES');
                                                    const aprobado = it.aprobadoEn ? new Date(it.aprobadoEn) : null;
                                                    const aprobadoTxt = aprobado && !isNaN(aprobado.getTime())
                                                        ? aprobado.toLocaleString('es-ES')
                                                        : '';
                                                    const rechazado = it.rechazadoEn ? new Date(it.rechazadoEn) : null;
                                                    const rechazadoTxt = rechazado && !isNaN(rechazado.getTime())
                                                        ? rechazado.toLocaleString('es-ES')
                                                        : '';
                                                    return (
                                                        <tr key={it.creadoEn} className="hover:bg-slate-800/80 transition-colors">
                                                            <td className="p-4 pl-6 text-slate-400">{validCread}</td>
                                                            <td className="p-4 font-semibold text-slate-200">{it.nombre}</td>
                                                            <td className="p-4 text-slate-300">{it.cliente || '-'}</td>
                                                            <td className="p-4 text-slate-400">
                                                                <span className={`px-2 py-1 rounded text-xs border ${getTypeColor(it.tipoNovedad)}`}>{it.tipoNovedad}</span>
                                                            </td>
                                                            <td className="p-4 text-slate-300">{it.fechaInicio || '-'}</td>
                                                            <td className="p-4 text-slate-400 text-center">
                                                                {it.cantidadHoras || 0}h
                                                            </td>
                                                            <td className="p-4">
                                                                <span className={`inline-flex px-2 py-1 rounded-md text-[11px] font-bold border uppercase tracking-wider ${it.estado === 'Aprobado' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                                    it.estado === 'Rechazado' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                                                                        'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                                                    }`}>
                                                                    {it.estado}
                                                                </span>
                                                            </td>
                                                            <td className="p-4 text-xs text-slate-300">
                                                                {it.estado === 'Aprobado'
                                                                    ? (
                                                                        <div className="flex flex-col">
                                                                            <span>{aprobadoTxt || '-'}</span>
                                                                            <span className="text-[10px] uppercase text-slate-400">{it.aprobadoPorRol || '-'}</span>
                                                                        </div>
                                                                    )
                                                                    : it.estado === 'Rechazado'
                                                                        ? (
                                                                            <div className="flex flex-col">
                                                                                <span>{rechazadoTxt || '-'}</span>
                                                                                <span className="text-[10px] uppercase text-slate-400">{it.rechazadoPorRol || '-'}</span>
                                                                            </div>
                                                                        )
                                                                    : '-'}
                                                            </td>
                                                            <td className="p-4 pr-6">
                                                                <div className="flex gap-2 justify-end items-center">
                                                                    <button onClick={() => setGestionDetailItem(it)} className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-blue-600/20 text-slate-300 hover:text-blue-400 border border-slate-700 hover:border-blue-500/50 rounded-lg transition-all shadow-sm text-xs font-medium">
                                                                        <Eye size={14} /> Ver detalle
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                {!loading && sortedItems.length > 0 && (
                                    <div className="bg-[#1e293b] border-t border-slate-700/50 px-4 py-3 flex items-center justify-between text-xs text-slate-300">
                                        <span>Mostrando {pagedItems.length} de {gestionPagination.total || 0} registros</span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                                disabled={safePage <= 1}
                                                className="px-3 py-1 rounded border border-slate-600 disabled:opacity-40"
                                            >
                                                Anterior
                                            </button>
                                            <span>Página {safePage} de {totalPages}</span>
                                            <button
                                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                                disabled={safePage >= totalPages}
                                                className="px-3 py-1 rounded border border-slate-600 disabled:opacity-40"
                                            >
                                                Siguiente
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ---------- CALENDARIO INTERACTIVO ---------- */}
                {activeTab === 'Calendario' && canAccessPanel('calendar') && (
                    <div className="animate-in fade-in zoom-in-95 duration-300 pb-20 flex flex-col h-full bg-[#1e293b] rounded-2xl border border-slate-700/50 shadow-lg overflow-hidden">
                        <div className="p-6 border-b border-slate-700/50 flex justify-between items-center sticky top-0 bg-[#1e293b] z-10">
                            <div>
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Calendar className="text-blue-500" size={22} /> Agenda Operativa
                                </h2>
                                <p className="text-sm text-slate-400 mt-1">Vista interactiva mensual de las novedades del talento</p>
                            </div>
                            <div className="flex flex-wrap gap-3 items-center justify-end">
                                <select
                                    value={fClienteCalendario}
                                    onChange={(e) => setFClienteCalendario(e.target.value)}
                                    className="bg-slate-800 border border-slate-600 text-sm text-slate-200 px-3 py-2 rounded-lg focus:outline-none focus:border-blue-500 max-w-[220px]"
                                    aria-label="Filtrar por cliente"
                                >
                                    <option value="">Todos los clientes</option>
                                    {calendarClientesList.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                                <div className="flex items-center bg-slate-900 rounded-lg p-1 border border-slate-700">
                                    <button
                                        onClick={() => setCalendarView('monthly')}
                                        className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${calendarView === 'monthly' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                                    >
                                        Mensual
                                    </button>
                                    <button
                                        onClick={() => setCalendarView('daily')}
                                        className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${calendarView === 'daily' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
                                    >
                                        Diaria
                                    </button>
                                </div>
                                {calendarView === 'monthly' ? (
                                    <div className="flex gap-4 items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
                                        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="px-3 py-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-all text-sm font-medium">&larr; Ant.</button>
                                        <span className="text-slate-200 font-bold min-w-[120px] text-center capitalize">
                                            {currentMonth.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
                                        </span>
                                        <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="px-3 py-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-all text-sm font-medium">Sig. &rarr;</button>
                                    </div>
                                ) : (
                                    <div className="flex gap-4 items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
                                        <button onClick={() => setCurrentDay(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1))} className="px-3 py-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-all text-sm font-medium">&larr; Ant.</button>
                                        <span className="text-slate-200 font-bold min-w-[160px] text-center capitalize">
                                            {currentDay.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                                        </span>
                                        <button onClick={() => setCurrentDay(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1))} className="px-3 py-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-md transition-all text-sm font-medium">Sig. &rarr;</button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 p-6 overflow-auto">
                            {calendarView === 'monthly' ? (
                                <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden bg-slate-700/50 border border-slate-700/50 h-full min-h-[500px]">
                                    {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
                                        <div key={day} className="bg-[#1e293b] text-center py-2 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-700/50">
                                            {day}
                                        </div>
                                    ))}

                                    {calendarDays.map((dateObj, i) => {
                                        if (!dateObj) return <div key={`empty-${i}`} className="bg-[#1e293b]/50 min-h-[100px]" />;

                                        const dayDateStr = dateObj.toISOString().slice(0, 10);
                                        const dayItems = itemsByDate[dayDateStr] || [];
                                        const isToday = new Date().toISOString().slice(0, 10) === dayDateStr;

                                        return (
                                            <div key={dayDateStr}
                                                onClick={() => dayItems.length > 0 && setSelectedDayItems({ date: dateObj, items: dayItems })}
                                                className={`bg-[#1e293b] min-h-[100px] p-2 flex flex-col gap-1 transition-colors border-b border-r border-slate-700/50 last:border-r-0 ${dayItems.length > 0 ? 'cursor-pointer hover:bg-slate-800' : ''
                                                    } ${isToday ? 'bg-blue-900/10' : ''}`}>

                                                <div className="flex justify-between items-center mb-1">
                                                    <span className={`w-7 h-7 flex items-center justify-center rounded-full text-sm font-bold ${isToday ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'text-slate-400'
                                                        }`}>
                                                        {dateObj.getDate()}
                                                    </span>
                                                    {dayItems.length > 0 && (
                                                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-bold border border-slate-700">
                                                            {dayItems.length} reg.
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="mt-auto">
                                                    {dayItems.length > 0 && (
                                                        <div className={`text-[10px] leading-tight px-2 py-1 rounded border font-semibold text-center ${isToday
                                                            ? 'text-blue-300 bg-blue-500/15 border-blue-500/40'
                                                            : 'text-slate-300 bg-slate-800 border-slate-700'
                                                            }`}>
                                                            {isToday ? `Hoy: ${dayItems.length} novedades` : `${dayItems.length} novedades`}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="bg-[#0f172a] rounded-xl border border-slate-700/50 p-4 md:p-5">
                                    <h3 className="text-base md:text-lg font-bold text-white mb-4">
                                        Novedades del día: {currentDay.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                                    </h3>
                                    {dailyItems.length === 0 ? (
                                        <div className="text-slate-400 text-sm bg-slate-800/60 border border-slate-700 rounded-lg p-4">
                                            No hay novedades registradas para este día.
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-3">
                                            {dailyItems.map((it, idx) => (
                                                <div key={`${it.creadoEn}-${idx}`} className={`p-3 rounded-lg border ${getTypeColor(it.tipoNovedad)}`}>
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <p className="font-semibold text-white">{it.nombre}</p>
                                                            <p className="text-xs text-slate-300">{it.tipoNovedad} · Estado: {it.estado}</p>
                                                        </div>
                                                        <div className="text-xs text-slate-300 text-right">
                                                            <p>{it.fechaInicio || '-'}</p>
                                                            <p>{it.cantidadHoras || 0}h</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Legend */}
                            <div className="mt-6 flex flex-wrap gap-4 items-center justify-center text-xs text-slate-400">
                                <span className="font-bold uppercase tracking-widest mr-2 text-slate-500">Leyenda:</span>
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-rose-500/20 border border-rose-500/50"></div> Incapacidad</div>
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-500/20 border border-amber-500/50"></div> Vacaciones</div>
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-blue-500/20 border border-blue-500/50"></div> Permiso</div>
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500/20 border border-emerald-500/50"></div> Horas Extra</div>
                                <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-purple-500/20 border border-purple-500/50"></div> Licencia</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ---------- ANÁLISIS AVANZADO ---------- */}
                {activeTab === 'Análisis Avanzado' && canAccessPanel('dashboard') && (
                    <div className="animate-in fade-in zoom-in-95 duration-300 pb-20 flex flex-col h-full gap-6">
                        <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-700/50 shadow-lg">
                            <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
                                <TrendingUp className="text-purple-500" size={24} /> Inteligencia Operativa (Pre-IA)
                            </h2>
                            <p className="text-slate-400 text-sm">Modelos estadísticos descriptivos diseñados para futura integración con algoritmos de Machine Learning y predicción de anomalías.</p>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Mapa de Frecuencia (Por Día de la Semana) */}
                            <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-700/50 shadow-lg">
                                <h3 className="text-xl font-bold text-white mb-1">Mapa de Frecuencia (Días de la Semana)</h3>
                                <p className="text-xs text-slate-400 mb-5">
                                    Distribución de novedades según el día de inicio. Barras más oscuras indican mayor concentración — útil para detectar patrones de ausentismo recurrente.
                                </p>
                                <div className="h-64 w-full">
                                    <ResponsiveContainer>
                                        <BarChart data={(() => {
                                            const daysInfo = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' };
                                            const heatMap = { Dom: 0, Lun: 0, Mar: 0, Mié: 0, Jue: 0, Vie: 0, Sáb: 0 };
                                            items.forEach(it => {
                                                const d = it.fechaInicio ? new Date(it.fechaInicio) : new Date(it.creadoEn);
                                                if (!isNaN(d.getTime())) {
                                                    heatMap[daysInfo[d.getDay()]] += 1;
                                                }
                                            });
                                            return Object.keys(heatMap).map(k => ({ name: k, count: heatMap[k] }));
                                        })()} barCategoryGap="25%">
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                                            <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                                            <Tooltip
                                                cursor={{ fill: '#334155', opacity: 0.15, radius: 6 }}
                                                content={({ active, payload }) => {
                                                    if (!active || !payload?.length) return null;
                                                    const { name, count } = payload[0].payload;
                                                    const total = items.length || 1;
                                                    const pct = ((count / total) * 100).toFixed(1);
                                                    const isWeekend = name === 'Dom' || name === 'Sáb';
                                                    const label = count === 0 ? 'Sin actividad' : isWeekend ? 'Día no hábil — verificar horas extra' : count >= 5 ? 'Concentración alta — revisar patrón' : 'Actividad normal';
                                                    return (
                                                        <div className="bg-[#0f172a] border border-slate-600 rounded-xl px-4 py-3 shadow-xl text-sm">
                                                            <p className="font-bold text-white mb-1">{name} — {count} novedad{count !== 1 ? 'es' : ''}</p>
                                                            <p className="text-slate-400 text-xs">{pct}% del total registrado</p>
                                                            <p className="text-purple-400 text-xs mt-1 font-semibold">{label}</p>
                                                        </div>
                                                    );
                                                }}
                                            />
                                            <Bar dataKey="count" fill="#8b5cf6" radius={[6, 6, 0, 0]}>
                                                {(() => {
                                                    const data = (() => {
                                                        const daysInfo = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' };
                                                        const heatMap = { Dom: 0, Lun: 0, Mar: 0, Mié: 0, Jue: 0, Vie: 0, Sáb: 0 };
                                                        items.forEach(it => {
                                                            const d = it.fechaInicio ? new Date(it.fechaInicio) : new Date(it.creadoEn);
                                                            if (!isNaN(d.getTime())) heatMap[daysInfo[d.getDay()]] += 1;
                                                        });
                                                        return Object.keys(heatMap).map(k => ({ name: k, count: heatMap[k] }));
                                                    })();
                                                    const maxCount = Math.max(...data.map(d => d.count), 1);
                                                    return data.map((entry, index) => {
                                                        const intensity = entry.count / maxCount;
                                                        return <Cell key={`cell-${index}`} fill={`rgba(139, 92, 246, ${Math.max(0.25, intensity)})`} />;
                                                    });
                                                })()}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <p className="text-[10px] text-slate-600 mt-3 text-center italic">Base para modelo predictivo de ausentismo por día — Grupo CINTE IA</p>
                            </div>

                            {/* Índice de Riesgo por Consultor */}
                            <div className="bg-[#1e293b] p-6 rounded-2xl border border-rose-500/20 shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-40 h-40 bg-rose-500/5 rounded-full -mr-20 -mt-20 blur-3xl" />
                                <h3 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
                                    <Activity className="text-rose-500" size={20} /> Riesgo Operativo (Burnout / Atipicidad)
                                </h3>
                                <p className="text-xs text-slate-400 mb-5">
                                    Puntaje acumulado por tipo de novedad: Incapacidad (+5 pts), Hora extra (+3 pts), otros (+1 pt). Detecta colaboradores con patrones atípicos que requieren atención preventiva.
                                </p>
                                <div className="space-y-3 overflow-y-auto max-h-[240px] pr-1">
                                    {(() => {
                                        const riesgoMap = {};
                                        items.forEach(it => {
                                            if (!riesgoMap[it.nombre]) riesgoMap[it.nombre] = { puntos: 0, horas: 0, novedades: 0 };
                                            riesgoMap[it.nombre].horas += Number(it.cantidadHoras) || 0;
                                            riesgoMap[it.nombre].novedades += 1;
                                            if (it.tipoNovedad === 'Incapacidad') riesgoMap[it.nombre].puntos += 5;
                                            else if (it.tipoNovedad === 'Hora extra') riesgoMap[it.nombre].puntos += 3;
                                            else riesgoMap[it.nombre].puntos += 1;
                                        });
                                        const ranking = Object.keys(riesgoMap)
                                            .map(k => ({ nombre: k, ...riesgoMap[k] }))
                                            .sort((a, b) => b.puntos - a.puntos)
                                            .slice(0, 5);
                                        if (ranking.length === 0) return <p className="text-slate-400 text-center">Datos insuficientes para evaluación.</p>;
                                        return ranking.map((r, i) => {
                                            const isAlto = r.puntos >= 10;
                                            const isMedio = r.puntos >= 5;
                                            const riskColor = isAlto ? 'text-rose-400 border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10'
                                                : isMedio ? 'text-amber-400 border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10'
                                                    : 'text-blue-400 border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10';
                                            const badgeCls = isAlto ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                                : isMedio ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                                    : 'bg-blue-500/20 text-blue-400 border-blue-500/30';
                                            const label = isAlto ? 'Riesgo Alto' : isMedio ? 'Riesgo Medio' : 'Riesgo Base';
                                            const tip = isAlto
                                                ? 'Requiere entrevista de bienestar urgente'
                                                : isMedio
                                                    ? 'Seguimiento preventivo recomendado'
                                                    : 'Comportamiento dentro del rango esperado';
                                            return (
                                                <div
                                                    key={i}
                                                    title={tip}
                                                    className={`group flex items-center justify-between p-3 rounded-xl border transition-all cursor-default ${riskColor}`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-xs border ${badgeCls}`}>
                                                            {i + 1}
                                                        </div>
                                                        <div>
                                                            <p className="text-slate-200 font-bold text-sm leading-tight">{r.nombre}</p>
                                                            <p className="text-slate-500 text-xs">{r.novedades} novedad{r.novedades !== 1 ? 'es' : ''} · {r.horas}h acumuladas</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1">
                                                        <span className={`text-[10px] uppercase tracking-widest font-black px-2 py-0.5 rounded border ${badgeCls}`}>
                                                            {label}
                                                        </span>
                                                        <span className="text-[10px] text-slate-600 font-semibold">{r.puntos} pts</span>
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>

                            {/* Eficiencia del Flujo de Trabajo (Funnel) */}
                            <div className="bg-[#1e293b] p-6 rounded-2xl border border-slate-700/50 shadow-lg lg:col-span-2">
                                <h3 className="text-xl font-bold text-white mb-1">Eficiencia del Flujo de Trabajo (Funnel)</h3>
                                <p className="text-xs text-slate-400 mb-5">
                                    Embudo de gestión: compara el volumen total radicado con los casos en espera y los ya resueltos. Una barra de “Esperando Acción” alta respecto al total indica cuello de botella en validaciones.
                                </p>
                                <div className="h-44 w-full">
                                    <ResponsiveContainer>
                                        <BarChart
                                            data={(() => {
                                                const pend = items.filter(i => i.estado === 'Pendiente').length;
                                                return [
                                                    { name: 'Total Radicados', count: items.length, fill: '#3b82f6' },
                                                    { name: 'Esperando Acción', count: pend, fill: '#f59e0b' },
                                                    { name: 'Decisión Cerrada', count: items.length - pend, fill: '#10b981' },
                                                ];
                                            })()}
                                            layout="vertical"
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} horizontal={false} />
                                            <XAxis type="number" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                                            <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} width={130} />
                                            <Tooltip
                                                cursor={{ fill: '#334155', opacity: 0.15 }}
                                                content={({ active, payload }) => {
                                                    if (!active || !payload?.length) return null;
                                                    const { name, count } = payload[0].payload;
                                                    const total = items.length || 1;
                                                    const pct = ((count / total) * 100).toFixed(1);
                                                    const tip = name === 'Total Radicados'
                                                        ? 'Todos los registros ingresados al sistema'
                                                        : name === 'Esperando Acción'
                                                            ? pct > 50 ? '⚠️ Cuello de botella detectado — revisar capacidad' : 'Volumen de pendientes en revisión'
                                                            : pct >= 70 ? '✅ Flujo eficiente' : 'Porcentaje de gestión cerrada';
                                                    return (
                                                        <div className="bg-[#0f172a] border border-slate-600 rounded-xl px-4 py-3 shadow-xl text-sm">
                                                            <p className="font-bold text-white mb-1">{name}</p>
                                                            <p className="text-slate-300">{count} registro{count !== 1 ? 's' : ''}</p>
                                                            <p className="text-slate-400 text-xs">{pct}% del total radicado</p>
                                                            <p className="text-emerald-400 text-xs mt-1 font-semibold">{tip}</p>
                                                        </div>
                                                    );
                                                }}
                                            />
                                            <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                                                {[{ color: '#3b82f6' }, { color: '#f59e0b' }, { color: '#10b981' }].map((e, i) => (
                                                    <Cell key={i} fill={e.color} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                                <p className="text-[10px] text-slate-600 mt-3 text-center italic">Base para optimización de SLA de respuesta — Grupo CINTE IA</p>
                            </div>

                        </div>
                    </div>
                )}


            </main>

            {/* Chat Widget IA — fuera del main para que sea fixed global */}
            <ChatWidget ctx={{ pendientesCount, totalItems: items.length, dashItems: dashItems.length }} />

            {gestionDetailItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/90 backdrop-blur p-4 animate-in fade-in duration-200" onClick={() => setGestionDetailItem(null)}>
                    <div className="relative bg-[#1e293b] border border-slate-700 rounded-2xl w-full max-w-4xl md:max-h-[88vh] flex flex-col p-6 shadow-2xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-4 border-b border-slate-700/50 pb-4">
                            <div>
                                <h2 className="text-2xl font-bold text-white">Detalle de novedad</h2>
                                <p className="text-slate-400 mt-1 text-sm">{gestionDetailItem.tipoNovedad} · {gestionDetailItem.estado}</p>
                            </div>
                            <button onClick={() => setGestionDetailItem(null)} className="bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 border border-slate-700 hover:border-rose-500/50 rounded-lg transition-all w-10 h-10 flex items-center justify-center">
                                <X size={20} strokeWidth={2.5} />
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-200 overflow-y-auto pr-1">
                            <div><span className="text-slate-400">Nombre:</span> {gestionDetailItem.nombre}</div>
                            <div><span className="text-slate-400">Cédula:</span> {gestionDetailItem.cedula}</div>
                            <div><span className="text-slate-400">Correo:</span> {gestionDetailItem.correoSolicitante || '-'}</div>
                            <div><span className="text-slate-400">Cliente:</span> {gestionDetailItem.cliente || '-'}</div>
                            <div><span className="text-slate-400">Líder:</span> {gestionDetailItem.lider || '-'}</div>
                            <div><span className="text-slate-400">Estado:</span> {gestionDetailItem.estado}</div>
                            <div><span className="text-slate-400">Fecha inicio:</span> {gestionDetailItem.fechaInicio || '-'}</div>
                            <div><span className="text-slate-400">Fecha fin:</span> {gestionDetailItem.fechaFin || '-'}</div>
                            <div><span className="text-slate-400">Cantidad horas:</span> {gestionDetailItem.cantidadHoras || 0}</div>
                            <div><span className="text-slate-400">Horas diurnas:</span> {gestionDetailItem.horasDiurnas || 0}</div>
                            <div><span className="text-slate-400">Horas nocturnas:</span> {gestionDetailItem.horasNocturnas || 0}</div>
                            <div><span className="text-slate-400">Clasificación:</span> {gestionDetailItem.tipoHoraExtra || '-'}</div>
                        </div>

                        <div className="mt-5 border-t border-slate-700/50 pt-4">
                            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">Soportes</h3>
                            {buildSupportList(gestionDetailItem).length === 0 ? (
                                <p className="text-sm text-slate-500">Sin soportes adjuntos.</p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {buildSupportList(gestionDetailItem).map((support) => (
                                        <div
                                            key={support.id}
                                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-800 hover:border-blue-500/50 transition-all text-xs"
                                        >
                                            <button
                                                type="button"
                                                onClick={() => openSupport(gestionDetailItem, support)}
                                                className="inline-flex items-center gap-2 px-0 py-0 rounded-lg border-none bg-transparent hover:text-blue-300"
                                            >
                                                {support.type === 'pdf' && <FileText size={14} />}
                                                {support.type === 'image' && <FileImage size={14} />}
                                                {support.type === 'excel' && <FileSpreadsheet size={14} />}
                                                {support.type === 'other' && <Eye size={14} />}
                                                <span className="whitespace-nowrap">Visualizar: {support.name}</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => downloadSupport(support)}
                                                className="px-2 py-1 rounded-lg border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 hover:border-blue-500/50 transition-all"
                                            >
                                                Descargar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="mt-6 border-t border-slate-700/50 pt-4 flex flex-wrap justify-end gap-2">
                            <button onClick={() => setGestionDetailItem(null)} className="px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-700/50 transition-all text-sm">Cerrar</button>
                            {canApproveItem(gestionDetailItem) && (
                                <>
                                    <button onClick={async () => { await changeState(gestionDetailItem.id || gestionDetailItem.creadoEn, 'Rechazado'); setGestionDetailItem(null); }} className="px-4 py-2 rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 transition-all text-sm">Rechazar</button>
                                    <button onClick={async () => { await changeState(gestionDetailItem.id || gestionDetailItem.creadoEn, 'Aprobado'); setGestionDetailItem(null); }} className="px-4 py-2 rounded-lg border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 transition-all text-sm">Aceptar</button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Detalle de Día */}
            {selectedDayItems && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/90 backdrop-blur tracking-wide p-4 animate-in fade-in duration-200" onClick={() => setSelectedDayItems(null)}>
                    <div className="relative bg-[#1e293b] border border-slate-700 rounded-2xl w-full max-w-3xl md:max-h-[85vh] flex flex-col p-6 shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-start mb-6 border-b border-slate-700/50 pb-4">
                            <div>
                                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                                    <Calendar className="text-blue-500" size={24} /> Novedades del Día
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
                                <div key={idx} className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${getTypeColor(it.tipoNovedad).replace('bg-', 'bg-').replace('/20', '/10')}`}>
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg border ${getTypeColor(it.tipoNovedad).replace('bg-', 'border-').replace('/20', '/30')}`}>
                                            {it.nombre.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="text-white font-bold">{it.nombre}</h3>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs text-slate-300 bg-black/20 px-2 py-0.5 rounded font-medium border border-black/10">{it.tipoNovedad}</span>
                                                <span className="text-xs text-slate-400 flex items-center gap-1"><Briefcase size={12} /> Cédula: {it.cedula}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col md:items-end gap-1 bg-black/20 p-3 rounded-lg border border-black/10">
                                        <div className="text-sm text-slate-300 font-medium">
                                            {it.fechaInicio ? `Del ${it.fechaInicio}` : ''} {it.fechaFin ? `al ${it.fechaFin}` : ''}
                                            {!it.fechaInicio && !it.fechaFin ? 'Fecha no especificada' : ''}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {Number(it.cantidadHoras) > 0 && (
                                                <span className="text-xs text-blue-400 font-bold">
                                                    {it.cantidadHoras}h {it.tipoHoraExtra ? `(${it.tipoHoraExtra})` : ''}
                                                </span>
                                            )}
                                            <span className={`text-[10px] uppercase tracking-widest font-black px-1.5 py-0.5 rounded ${it.estado === 'Aprobado' ? 'text-emerald-400 bg-emerald-500/10' : it.estado === 'Rechazado' ? 'text-rose-400 bg-rose-500/10' : 'text-amber-400 bg-amber-500/10'}`}>
                                                {it.estado}
                                            </span>
                                        </div>
                                    </div>

                                    {(it.soporteRuta || it.soporteKey) && (
                                        <button onClick={() => { setSelectedDayItems(null); openSupport(it); }} className="md:ml-2 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/30 px-3 py-2 rounded-lg transition-all flex items-center justify-center gap-2 text-sm font-medium">
                                            <Eye size={16} /> Ver Soporte
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Soporte Viewer */}
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
                            {soporteModalCurrentSupport && (
                                <button
                                    type="button"
                                    onClick={() => downloadSupport(soporteModalCurrentSupport)}
                                    className="px-3 py-2 rounded-lg border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 hover:border-blue-500/50 transition-all text-sm font-medium"
                                >
                                    Descargar
                                </button>
                            )}
                        </div>
                        {Array.isArray(soporteModal?.supports) && soporteModal.supports.length > 1 && (
                            <div className="w-full mb-3 flex flex-wrap gap-2">
                                {soporteModal.supports.map((support) => (
                                    <div key={support.id} className="inline-flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => openSupportFromModal(support)}
                                            className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${soporteModal.currentKey === support.key
                                                ? 'border-blue-500/60 text-blue-300 bg-blue-500/10'
                                                : 'border-slate-700 text-slate-300 hover:border-blue-500/40 hover:text-blue-300'
                                                }`}
                                        >
                                            {support.name}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => downloadSupport(support)}
                                            className="px-2 py-1 rounded-lg border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 hover:border-blue-500/50 transition-all text-xs"
                                        >
                                            Descargar
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="w-full flex-1 md:min-h-[60vh] rounded-xl overflow-hidden border border-slate-700 bg-black/40 p-1 relative">
                            {soporteLoading ? (
                                <div className="w-full h-[65vh] flex items-center justify-center text-slate-300">Cargando soporte...</div>
                            ) : soporteModal?.currentType === 'pdf' ? (
                                <iframe src={soporteModal.currentUrl} className="w-full h-[65vh] rounded" title="Visor PDF" />
                            ) : soporteModal?.currentType === 'image' ? (
                                <img src={soporteModal?.currentUrl} alt="Soporte" className="w-full h-[65vh] object-contain rounded" />
                            ) : soporteModal?.currentType === 'excel' ? (
                                soporteModal?.excelPreview?.rows?.length ? (
                                    <div className="w-full h-[65vh] overflow-auto bg-slate-950 rounded p-3">
                                        <p className="text-xs text-slate-400 mb-3">
                                            Hoja: {soporteModal.excelPreview.sheetName} · Filas mostradas: {soporteModal.excelPreview.rows.length}
                                            {soporteModal.excelPreview.truncated ? ' (previsualización parcial)' : ''}
                                        </p>
                                        <table className="w-full text-xs text-slate-200 border-collapse">
                                            <tbody>
                                                {soporteModal.excelPreview.rows.map((row, idx) => (
                                                    <tr key={`excel-row-${idx}`} className="border-b border-slate-800">
                                                        {(Array.isArray(row) ? row : []).map((cell, cidx) => (
                                                            <td key={`excel-cell-${idx}-${cidx}`} className="px-2 py-1 border-r border-slate-800 align-top">
                                                                {String(cell ?? '')}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="w-full h-[65vh] flex flex-col items-center justify-center gap-2 text-slate-300">
                                        <p>No fue posible previsualizar este Excel.</p>
                                        <button
                                            type="button"
                                            onClick={() => downloadSupport(soporteModalCurrentSupport)}
                                            className="px-3 py-2 rounded border border-blue-500/40 text-blue-300 hover:bg-blue-500/10 transition-all text-sm"
                                        >
                                            Descargar archivo
                                        </button>
                                    </div>
                                )
                            ) : (
                                <div className="w-full h-[65vh] flex flex-col items-center justify-center gap-2 text-slate-300">
                                    <p>No hay visor embebido para este tipo de archivo.</p>
                                    <button
                                        type="button"
                                        onClick={() => downloadSupport(soporteModalCurrentSupport)}
                                        className="px-3 py-2 rounded border border-blue-500/40 text-blue-300 hover:bg-blue-500/10 transition-all text-sm"
                                    >
                                        Descargar archivo
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
