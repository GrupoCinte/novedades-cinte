import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid, BarChart, Bar } from 'recharts';
import { X, Download, Eye, LayoutDashboard, Calendar, TrendingUp, Briefcase, BadgeCheck, Clock, Users, Activity, ChevronLeft, ChevronRight, Code2, Menu, FileText, FileImage, FileSpreadsheet, Bell, Home, Trash2 } from 'lucide-react';
import ChatWidget from './ChatWidget';
import { getNovedadRule, NOVEDAD_TYPES, formatCantidadNovedad, formatDiasCount, getCantidadMedidaKind, getCantidadDetalleEtiqueta, getDiasEfectivosNovedad, getAsignacionGestionNovedad, resolveCanonicalNovedadTipo } from './novedadRules';
import {
    toUtcMsFromDateAndTime,
    collectHeDiurnaNocturnaSegmentsBogota,
    collectRecargoDomingoDiurnaNocturnaSegmentsBogota,
    formatHeSegmentListBogota
} from './heNovedadBogotaClient.js';
import { formatHeDomingoCompGestionResumen } from './heDomingoCompDisplay.js';
import { useModuleTheme } from './moduleTheme.js';
import AdminModuleSidebarBrand from './AdminModuleSidebarBrand.jsx';

/** Primer y último día (YYYY-MM-DD) del mes 0–11 en `year`, para filtros de creación en Gestión. */
function creadoEnRangeForMonthIndex(monthIndex, year) {
    const mi = Number(monthIndex);
    if (!Number.isFinite(mi) || mi < 0 || mi > 11) return { desde: '', hasta: '' };
    const y = Number(year);
    if (!Number.isFinite(y)) return { desde: '', hasta: '' };
    const pad = (n) => String(n).padStart(2, '0');
    const lastDay = new Date(y, mi + 1, 0).getDate();
    return {
        desde: `${y}-${pad(mi + 1)}-01`,
        hasta: `${y}-${pad(mi + 1)}-${pad(lastDay)}`
    };
}

/** Si el dashboard tiene `fMes` seleccionado, Gestión usa rango de creado_en en el año actual (no equivale a getItemDate del dashboard). */
function creadoEnRangeForDashboardMesFilter(fMesStr, year = new Date().getFullYear()) {
    if (fMesStr === '' || fMesStr == null) return { desde: '', hasta: '' };
    return creadoEnRangeForMonthIndex(Number(fMesStr), year);
}

/** Texto visible en selects de GP: solo nombre de directorio, sin correo. */
function labelGpDirectorioOption(g) {
    const name = String(g?.full_name || '').trim();
    if (name) return name;
    return 'Sin nombre';
}

function mergeClienteOptionsFromApiAndItems(apiList, itemRows) {
    const map = new Map();
    for (const c of Array.isArray(apiList) ? apiList : []) {
        const t = String(c || '').trim();
        if (!t) continue;
        map.set(t.toLowerCase(), t);
    }
    for (const it of Array.isArray(itemRows) ? itemRows : []) {
        const t = String(it?.cliente || '').trim();
        if (!t) continue;
        map.set(t.toLowerCase(), t);
    }
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

function formatDurationMs(ms) {
    if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
    const totalMinutes = Math.floor(ms / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const mins = totalMinutes % 60;
    if (days > 0) return `${days} d. ${hours} h`;
    if (hours > 0) return `${hours} h ${mins} min`;
    if (mins > 0) return `${mins} min`;
    return '< 1 min';
}

function normalizeHoraHePayload(timeRaw) {
    const t = String(timeRaw || '').trim();
    if (!t) return '';
    if (/^\d{2}:\d{2}:\d{2}$/.test(t)) return t.slice(0, 8);
    if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
    return t.slice(0, 8);
}

export default function Dashboard({ token, auth, onLogout }) {
    const mt = useModuleTheme();
    const {
        shell,
        aside,
        asideHeaderBorder,
        asideFooterBorder,
        scrim,
        menuFab,
        sidebarIconBtn,
        navOutline,
        email,
        borderSubtle,
        mainCanvas,
        navInactive,
        isLight,
        field: fieldInput,
        compactBtn,
        outlineBtn
    } = mt;

    const dash = useMemo(() => {
        const L = isLight;
        const card = L
            ? 'rounded-2xl border border-slate-200 bg-white shadow-md'
            : 'rounded-2xl border border-slate-700/50 bg-[#1e293b] shadow-lg';
        return {
            card,
            cardFlex: `${card} flex flex-col h-full overflow-hidden`,
            filterBar: L
                ? 'flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-md'
                : 'flex flex-col gap-3 rounded-2xl border border-slate-700/50 bg-[#1e293b] px-5 py-4 shadow-lg',
            titleXl: L ? 'text-xl font-bold text-slate-900' : 'text-xl font-bold text-white',
            titleLg: L ? 'text-lg font-bold text-slate-900' : 'text-lg font-bold text-white',
            title2xl: L ? 'text-2xl font-bold text-slate-900' : 'text-2xl font-bold text-white',
            title3xl: L ? 'text-3xl font-bold text-slate-900' : 'text-3xl font-bold text-white',
            muted: L ? 'text-slate-600' : 'text-slate-400',
            mutedSm: L ? 'text-sm text-slate-600' : 'text-sm text-slate-400',
            labelUpper: L ? 'text-xs font-bold uppercase tracking-widest text-slate-500' : 'text-xs font-bold uppercase tracking-widest text-slate-400',
            labelFilter: L ? 'text-xs font-semibold uppercase tracking-wider text-slate-600' : 'text-xs font-semibold uppercase tracking-wider text-slate-500',
            divider: L ? 'h-px flex-1 min-w-[1rem] bg-slate-200' : 'h-px flex-1 min-w-[1rem] bg-slate-700/50',
            clearBtn: L
                ? 'flex items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 transition-all hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600'
                : 'flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-400 transition-all hover:border-rose-500/50 hover:bg-rose-500/10 hover:text-rose-400',
            kpiSub: L ? 'text-sm font-medium text-slate-600' : 'text-sm font-medium text-slate-400',
            legendLine: L ? 'text-slate-600' : 'text-slate-300',
            legendDash: L ? 'text-slate-500' : 'text-slate-400',
            avatarRing: L ? 'border-2 border-white bg-slate-300 text-[10px] font-bold text-slate-700' : 'border-2 border-[#1e293b] bg-slate-600 text-[10px] font-bold text-slate-300',
            avatarMore: L ? 'border-2 border-white bg-slate-400 text-[10px] text-slate-800' : 'border-2 border-[#1e293b] bg-slate-700 text-[10px] text-slate-300',
            chGrid: L ? '#e2e8f0' : '#334155',
            lineEstimado: L ? '#475569' : '#94a3b8',
            chartTooltip: L
                ? { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', color: '#0f172a' }
                : { backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' },
            chartTooltipSm: L
                ? { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', color: '#0f172a' }
                : { backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '10px' },
            topEmplRow: L
                ? 'flex items-center justify-between rounded-xl border border-transparent p-3 transition-colors hover:border-slate-200 hover:bg-slate-50'
                : 'flex items-center justify-between rounded-xl border border-transparent p-3 transition-colors hover:border-slate-700 hover:bg-slate-800/50',
            topEmplBadge: L
                ? 'rounded-lg border border-slate-200 bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700'
                : 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-sm font-bold text-slate-300',
            nameEmpl: L ? 'font-medium text-slate-900' : 'font-medium text-slate-200',
            gestionHead: L ? 'border-b border-slate-200 bg-white' : 'border-b border-slate-700/50 bg-[#1e293b]',
            tableWrap: L ? 'flex w-full min-h-0 flex-1 flex-col bg-slate-50' : 'flex w-full min-h-0 flex-1 flex-col bg-[#0f172a]/50',
            thead: L
                ? 'sticky top-0 z-10 border-b border-slate-200 bg-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-600 shadow-sm'
                : 'sticky top-0 z-10 border-b border-slate-700/50 bg-[#1e293b] text-xs font-semibold uppercase tracking-wider text-slate-400 shadow-sm',
            tbody: L ? 'divide-y divide-slate-200 text-sm text-slate-800' : 'divide-y divide-slate-700/50 text-sm',
            trHover: L ? 'transition-colors hover:bg-slate-100' : 'transition-colors hover:bg-slate-800/80',
            tdDate: L ? 'p-4 pl-6 text-slate-500' : 'p-4 pl-6 text-slate-400',
            tdName: L ? 'p-4 font-semibold text-slate-900' : 'p-4 font-semibold text-slate-200',
            tdCell: L ? 'p-4 text-slate-700' : 'p-4 text-slate-300',
            tdMuted: L ? 'p-4 text-slate-500' : 'p-4 text-slate-400',
            tdSmall: L ? 'text-xs text-slate-500' : 'text-xs text-slate-500',
            tdEmphasis: L ? 'break-all font-medium text-slate-900' : 'break-all font-medium text-slate-100',
            tdLead: L ? 'block break-words leading-snug text-slate-800' : 'block break-words leading-snug text-slate-200',
            footerBar: L
                ? 'flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 text-xs text-slate-600'
                : 'flex items-center justify-between border-t border-slate-700/50 bg-[#1e293b] px-4 py-3 text-xs text-slate-300',
            actionBtn: L
                ? 'flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm transition-all hover:border-sky-400 hover:bg-sky-50 hover:text-sky-800'
                : 'flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 shadow-sm transition-all hover:border-blue-500/50 hover:bg-blue-600/20 hover:text-blue-400',
            borrarFiltros: L
                ? 'rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 transition-all hover:bg-slate-100'
                : 'rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 transition-all hover:bg-slate-700/60',
            emptyHe: L ? 'rounded-xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600' : 'rounded-xl border border-slate-700 bg-slate-900/40 p-6 text-sm text-slate-400',
            calShell: L
                ? 'animate-in fade-in zoom-in-95 flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white pb-20 shadow-md duration-300'
                : 'animate-in fade-in zoom-in-95 flex h-full flex-col overflow-hidden rounded-2xl border border-slate-700/50 bg-[#1e293b] pb-20 shadow-lg duration-300',
            calSticky: L ? 'sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-6' : 'sticky top-0 z-10 flex items-center justify-between border-b border-slate-700/50 bg-[#1e293b] p-6',
            calSegOuter: L ? 'flex items-center rounded-lg border border-slate-200 bg-slate-100 p-1' : 'flex items-center rounded-lg border border-slate-700 bg-slate-900 p-1',
            calNavBtn: L ? 'rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition-all hover:bg-slate-200' : 'rounded-md px-3 py-1.5 text-sm font-medium text-slate-400 transition-all hover:bg-slate-700 hover:text-white',
            calWeekday: L
                ? 'border-b border-slate-200 bg-slate-100 py-2 text-center text-xs font-bold uppercase tracking-widest text-slate-600'
                : 'border-b border-slate-700/50 bg-[#1e293b] py-2 text-center text-xs font-bold uppercase tracking-widest text-slate-400',
            calEmpty: L ? 'min-h-[100px] bg-slate-50' : 'min-h-[100px] bg-[#1e293b]/50',
            calCell: L
                ? 'flex min-h-[100px] flex-col gap-1 border-b border-r border-slate-200 bg-white p-2 transition-colors last:border-r-0'
                : 'flex min-h-[100px] flex-col gap-1 border-b border-r border-slate-700/50 bg-[#1e293b] p-2 transition-colors last:border-r-0',
            dailyPanel: L ? 'rounded-xl border border-slate-200 bg-slate-50 p-4 md:p-5' : 'rounded-xl border border-slate-700/50 bg-[#0f172a] p-4 md:p-5',
            dailyEmpty: L ? 'rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600' : 'rounded-lg border border-slate-700 bg-slate-800/60 p-4 text-sm text-slate-400',
            dailyName: L ? 'font-semibold text-slate-900' : 'font-semibold text-white',
            dailyMeta: L ? 'text-xs text-slate-600' : 'text-xs text-slate-300',
            legendFoot: L ? 'text-center text-[10px] italic text-slate-500' : 'text-center text-[10px] italic text-slate-600',
            calGrid: L
                ? 'grid h-full min-h-[500px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200'
                : 'grid h-full min-h-[500px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-700/50 bg-slate-700/50',
            calMonthLabel: L ? 'min-w-[120px] text-center text-sm font-bold capitalize text-slate-800' : 'min-w-[120px] text-center text-sm font-bold capitalize text-slate-200',
            calDayLabel: L ? 'min-w-[160px] text-center text-sm font-bold capitalize text-slate-800' : 'min-w-[160px] text-center text-sm font-bold capitalize text-slate-200',
            calTodayCell: L ? 'bg-sky-50' : 'bg-blue-900/10',
            calNovedadMuted: L ? 'border border-slate-200 bg-slate-100 text-center text-[10px] font-semibold leading-tight text-slate-700' : 'border border-slate-700 bg-slate-800 text-center text-[10px] font-semibold leading-tight text-slate-300',
            tooltipPanel: L
                ? 'rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-lg'
                : 'rounded-xl border border-slate-600 bg-[#0f172a] px-4 py-3 text-sm shadow-xl',
            riesgoNombre: L ? 'text-sm font-bold leading-tight text-slate-900' : 'text-sm font-bold leading-tight text-slate-200',
            modalBackdrop: L
                ? 'fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-900/40 p-4 backdrop-blur fade-in duration-200'
                : 'fixed inset-0 z-50 flex animate-in items-center justify-center bg-[#0f172a]/90 p-4 backdrop-blur fade-in duration-200',
            modalCard: L
                ? 'relative flex w-full max-w-4xl flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200 md:max-h-[88vh]'
                : 'relative flex w-full max-w-4xl flex-col rounded-2xl border border-slate-700 bg-[#1e293b] p-6 shadow-2xl animate-in zoom-in-95 duration-200 md:max-h-[88vh]',
            modalCardMd: L
                ? 'relative flex w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200 md:max-h-[88vh]'
                : 'relative flex w-full max-w-3xl flex-col rounded-2xl border border-slate-700 bg-[#1e293b] p-6 shadow-2xl animate-in zoom-in-95 duration-200 md:max-h-[88vh]',
            modalCardWide: L
                ? 'relative flex w-full max-w-5xl flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200 md:max-h-[90vh]'
                : 'relative flex w-full max-w-5xl flex-col items-center justify-center rounded-2xl border border-slate-700 bg-[#1e293b] p-6 shadow-2xl animate-in zoom-in-95 duration-200 md:max-h-[90vh]',
            modalCardDay: L
                ? 'relative flex w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200 md:max-h-[85vh]'
                : 'relative flex w-full max-w-3xl flex-col rounded-2xl border border-slate-700 bg-[#1e293b] p-6 shadow-2xl animate-in zoom-in-95 duration-200 md:max-h-[85vh]',
            modalHeadBorder: L ? 'mb-4 flex items-start justify-between border-b border-slate-200 pb-4' : 'mb-4 flex items-start justify-between border-b border-slate-700/50 pb-4',
            modalClose: L
                ? 'flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition-all hover:border-rose-400 hover:bg-rose-50 hover:text-rose-600'
                : 'flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-400 transition-all hover:border-rose-500/50 hover:bg-rose-500/20 hover:text-rose-500',
            modalGrid: L ? 'grid grid-cols-1 gap-4 overflow-y-auto pr-1 text-sm text-slate-800 md:grid-cols-2' : 'grid grid-cols-1 gap-4 overflow-y-auto pr-1 text-sm text-slate-200 md:grid-cols-2',
            modalFooter: L ? 'mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4' : 'mt-6 flex flex-wrap justify-end gap-2 border-t border-slate-700/50 pt-4',
            modalMuted: L ? 'text-slate-500' : 'text-slate-400',
            soporteIframe: L ? 'w-full rounded-xl border border-slate-200 bg-slate-100 p-1' : 'w-full rounded-xl border border-slate-700 bg-black/40 p-1',
            soporteLoading: L ? 'flex h-[65vh] w-full items-center justify-center text-slate-600' : 'flex h-[65vh] w-full items-center justify-center text-slate-300',
            excelScroll: L ? 'h-[65vh] w-full overflow-auto rounded bg-slate-50 p-3' : 'h-[65vh] w-full overflow-auto rounded bg-slate-950 p-3',
            supportChip: L
                ? 'inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs transition-all hover:border-sky-400 hover:bg-sky-50'
                : 'inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs transition-all hover:border-blue-500/50',
            dayItemTitle: L ? 'font-bold text-slate-900' : 'font-bold text-white',
            dayPill: L ? 'rounded bg-slate-200/80 px-2 py-0.5 text-xs font-medium text-slate-800' : 'rounded bg-black/20 px-2 py-0.5 text-xs font-medium text-slate-300',
            daySide: L ? 'flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-100 p-3' : 'flex flex-col gap-1 rounded-lg border border-black/10 bg-black/20 p-3',
            daySideText: L ? 'text-sm font-medium text-slate-700' : 'text-sm font-medium text-slate-300',
            dayMeta: L ? 'text-xs text-slate-500' : 'text-xs text-slate-400',
            dateRangeWrap: L ? 'flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1' : 'flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/50 px-2 py-1',
            dateRangeLbl: L ? 'text-[11px] font-semibold uppercase tracking-wider text-slate-500' : 'text-[11px] font-semibold uppercase tracking-wider text-slate-400',
            calCountBadge: L ? 'rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600' : 'rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-400',
            tipoPill: L ? 'text-slate-700' : 'text-slate-300',
        };
    }, [isLight]);

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [soporteModal, setSoporteModal] = useState(null);
    const [activeTab, setActiveTab] = useState('DashboardGeneral');
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
        const priority = ['super_admin', 'cac', 'admin_ch', 'team_ch', 'gp', 'nomina', 'comercial'];
        return priority.find((role) => normalized.includes(role)) || '';
    };
    const authUser = auth?.user && typeof auth.user === 'object' ? auth.user : {};
    const authClaims = auth?.claims && typeof auth.claims === 'object' ? auth.claims : {};
    // CRIT-002: email y rol se derivan de la prop auth (nunca de localStorage)
    const currentRole =
        resolveRoleFromClaims(authClaims)
        || String(authUser.role || '').toLowerCase();
    const currentRoleLabel = currentRole ? String(currentRole).replace(/_/g, ' ').toUpperCase() : 'SIN ROL';
    const currentEmail = String(
        authUser.email
        || authClaims.email
        || 'sin-correo'
    ).toLowerCase();
    const PANEL_POLICY = {
        super_admin: ['dashboard', 'calendar', 'gestion', 'admin', 'contratacion', 'comercial'],
        cac: ['dashboard', 'calendar', 'gestion', 'contratacion', 'comercial'],
        admin_ch: ['dashboard', 'calendar', 'gestion', 'contratacion', 'comercial'],
        team_ch: ['dashboard', 'calendar', 'gestion', 'contratacion', 'comercial'],
        gp: ['dashboard', 'calendar', 'gestion', 'contratacion'],
        nomina: ['dashboard', 'calendar', 'gestion'],
        comercial: ['comercial']
    };
    const tabPanelMap = {
        DashboardGeneral: 'dashboard',
        'Análisis Avanzado': 'dashboard',
        Calendario: 'calendar',
        Gestión: 'gestion',
        'Alertas HE': 'gestion'
    };
    const allowedPanels = PANEL_POLICY[currentRole] || [];
    const canAccessPanel = (panel) => allowedPanels.includes(panel);
    const canApproveItem = (item) => {
        if (!item || item.estado !== 'Pendiente') return false;
        if (currentRole === 'nomina') return false;
        if (currentRole === 'super_admin') return true;
        const rule = getNovedadRule(item.tipoNovedad);
        return Array.isArray(rule.approvers) && rule.approvers.includes(currentRole);
    };

    // Calendar State
    const [currentMonth, setCurrentMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const [selectedDayItems, setSelectedDayItems] = useState(null);
    const [calendarView, setCalendarView] = useState('monthly');
    const [currentDay, setCurrentDay] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));

    // Dashboard general — filtros
    const [fMes, setFMes] = useState('');         // '' = todos, '0'-'11' = ene-dic
    const [fClienteInicio, setFClienteInicio] = useState('');
    const [dashboardClientesList, setDashboardClientesList] = useState([]);
    const [fTipoInicio, setFTipoInicio] = useState(''); // '' = todos los tipos

    // Gestión table filters
    const [fTipo, setFTipo] = useState('');
    const [fEstado, setFEstado] = useState('');
    const [fNombre, setFNombre] = useState('');
    const [fCliente, setFCliente] = useState('');
    const [fCreadoDesde, setFCreadoDesde] = useState('');
    const [fCreadoHasta, setFCreadoHasta] = useState('');
    const [fClienteCalendario, setFClienteCalendario] = useState('');
    /** Filtro por GP asociado (snapshot `novedades.gp_user_id`); solo efectivo para rol `super_admin` en API. */
    const [fGpUserId, setFGpUserId] = useState('');
    const [gpFilterOptions, setGpFilterOptions] = useState([]);
    const isSuperAdminNovedades = currentRole === 'super_admin';
    /** Temporal: ocultar el botón «Editar» en el modal de gestión (API PATCH sigue disponible). */
    const gestionMostrarEditar = false;
    const [calendarClientesList, setCalendarClientesList] = useState([]);
    const [horaExtraAlerts, setHoraExtraAlerts] = useState({
        generatedAt: '',
        summary: { dailyAlertsCount: 0, monthlyAlertsCount: 0, sundayAlertsCount: 0, totalAlerts: 0 },
        dailyAlerts: [],
        monthlyAlerts: [],
        items: []
    });
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
    const [gestionEditMode, setGestionEditMode] = useState(false);
    const [gestionEditDraft, setGestionEditDraft] = useState(null);
    const [gestionDeleteOpen, setGestionDeleteOpen] = useState(false);
    const [gestionDeleteMotivo, setGestionDeleteMotivo] = useState('');
    const [gestionAdminBusy, setGestionAdminBusy] = useState(false);
    const [gestionAdminErr, setGestionAdminErr] = useState(null);
    const [alertaHeDetailItem, setAlertaHeDetailItem] = useState(null);
    const navigate = useNavigate();

    const loadData = async () => {
        setLoading(true);
        try {
            const qp = new URLSearchParams();
            if (fGpUserId) qp.set('gpUserId', fGpUserId);
            const qs = qp.toString();
            const res = await fetch(qs ? `/api/novedades?${qs}` : '/api/novedades', {
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
                limit: String(limit)
            };
            if (fTipo) params.tipo = fTipo;
            if (fEstado) params.estado = fEstado;
            if (fNombre) params.nombre = fNombre;
            if (fCliente) params.cliente = fCliente;
            if (fCreadoDesde) params.createdFrom = fCreadoDesde;
            if (fCreadoHasta) params.createdTo = fCreadoHasta;
            if (fGpUserId) params.gpUserId = fGpUserId;
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

    const loadHoraExtraAlerts = async () => {
        try {
            const params = {};
            if (fCreadoDesde) params.createdFrom = fCreadoDesde;
            if (fCreadoHasta) params.createdTo = fCreadoHasta;
            if (fGpUserId) params.gpUserId = fGpUserId;
            const query = new URLSearchParams(params).toString();
            const url = query ? `/api/novedades/hora-extra-alertas?${query}` : '/api/novedades/hora-extra-alertas';
            const alertRes = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!alertRes.ok) throw new Error('No se pudieron cargar alertas HE');
            const alertJson = await alertRes.json();
            setHoraExtraAlerts(alertJson?.data || {
                generatedAt: '',
                summary: { dailyAlertsCount: 0, monthlyAlertsCount: 0, sundayAlertsCount: 0, totalAlerts: 0 },
                dailyAlerts: [],
                monthlyAlerts: [],
                items: []
            });
        } catch (err) {
            console.error(err);
            setHoraExtraAlerts({
                generatedAt: '',
                summary: { dailyAlertsCount: 0, monthlyAlertsCount: 0, sundayAlertsCount: 0, totalAlerts: 0 },
                dailyAlerts: [],
                monthlyAlerts: [],
                items: []
            });
        }
    };

    useEffect(() => {
        loadData();
    }, [fGpUserId]);

    useEffect(() => {
        if (!isSuperAdminNovedades) {
            setGpFilterOptions([]);
            return undefined;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/directorio/gp', { headers: { Authorization: `Bearer ${token}` } });
                const json = await res.json().catch(() => ({}));
                if (!cancelled && res.ok && Array.isArray(json.items)) setGpFilterOptions(json.items);
            } catch (err) {
                console.error(err);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isSuperAdminNovedades, token]);

    useEffect(() => {
        if (!isSuperAdminNovedades) setFGpUserId('');
    }, [isSuperAdminNovedades]);

    useEffect(() => {
        const loadCalClientes = async () => {
            try {
                const res = await fetch('/api/catalogos/clientes', { credentials: 'include' });
                const json = await res.json();
                if (res.ok && Array.isArray(json.items)) setCalendarClientesList(json.items);
            } catch (err) {
                console.error(err);
            }
        };
        loadCalClientes();
    }, []);

    useEffect(() => {
        const loadDashboardClientes = async () => {
            if (!token) {
                setDashboardClientesList([]);
                return;
            }
            try {
                const qp = new URLSearchParams();
                if (fGpUserId) qp.set('gpUserId', fGpUserId);
                const qs = qp.toString();
                const res = await fetch(
                    qs ? `/api/novedades/clientes-filtro?${qs}` : '/api/novedades/clientes-filtro',
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                const json = await res.json();
                if (res.ok && Array.isArray(json.items)) {
                    setDashboardClientesList(json.items);
                } else {
                    console.warn('[Dashboard] clientes-filtro no OK', res.status, json?.error || '');
                    setDashboardClientesList([]);
                }
            } catch (err) {
                console.error(err);
                setDashboardClientesList([]);
            }
        };
        loadDashboardClientes();
    }, [token, fGpUserId]);

    /** Con GP seleccionado, `items` puede seguir siendo de la petición anterior hasta que termine `loadData`; no mezclar para no contaminar el desplegable de clientes. */
    const dashboardClientesOptions = useMemo(
        () => mergeClienteOptionsFromApiAndItems(dashboardClientesList, fGpUserId ? [] : items),
        [dashboardClientesList, items, fGpUserId]
    );

    /** En Gestión, con filtro GP, los clientes deben coincidir con el catálogo acotado (mismo criterio que el dashboard general). */
    const gestionClienteOptions = useMemo(() => {
        if (isSuperAdminNovedades && fGpUserId) {
            return mergeClienteOptionsFromApiAndItems(dashboardClientesList, []);
        }
        return Array.isArray(calendarClientesList) ? calendarClientesList : [];
    }, [isSuperAdminNovedades, fGpUserId, dashboardClientesList, calendarClientesList]);

    useEffect(() => {
        if (!fClienteInicio) return;
        const ok = dashboardClientesOptions.some(
            (c) => String(c).trim().toLowerCase() === String(fClienteInicio).trim().toLowerCase()
        );
        if (!ok) setFClienteInicio('');
    }, [dashboardClientesOptions, fClienteInicio]);

    useEffect(() => {
        if (!fCliente) return;
        const ok = gestionClienteOptions.some(
            (c) => String(c).trim().toLowerCase() === String(fCliente).trim().toLowerCase()
        );
        if (!ok) setFCliente('');
    }, [gestionClienteOptions, fCliente]);

    useEffect(() => {
        loadGestionData(currentPage, pageSize);
    }, [currentPage, pageSize, fTipo, fEstado, fNombre, fCliente, fCreadoDesde, fCreadoHasta, fGpUserId]);
    useEffect(() => {
        loadHoraExtraAlerts();
    }, [fCreadoDesde, fCreadoHasta, fGpUserId]);

    const changeState = async (id, nuevoEstado, options = {}) => {
        setStateError(null);
        console.log('[changeState] Iniciando cambio de estado:', { id, nuevoEstado, token: token ? '✅ token presente' : '❌ SIN TOKEN' });
        try {
            const fromHoraExtraAlert = Boolean(options?.fromHoraExtraAlert);
            const csrfToken = (() => {
                const raw = String(document?.cookie || '');
                if (!raw) return '';
                const part = raw.split(';').map((c) => c.trim()).find((c) => c.startsWith('cinteXsrf='));
                return part ? decodeURIComponent(part.slice('cinteXsrf='.length)) : '';
            })();
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };
            if (csrfToken) headers['x-cinte-xsrf'] = csrfToken;
            const res = await fetch('/api/actualizar-estado', {
                method: 'POST',
                credentials: 'include',
                headers,
                body: JSON.stringify({
                    id,
                    nuevoEstado,
                    fromHoraExtraAlert
                })
            });
            console.log('[changeState] Respuesta status:', res.status);
            const data = await res.json();
            console.log('[changeState] Respuesta data:', data);
            if (res.ok) {
                const pe = String(data?.persistedEmail || '').trim();
                const rowId = String(id || '').trim();
                if (pe.includes('@') && rowId) {
                    try {
                        sessionStorage.setItem(`novedadActorEmail:${rowId}`, pe);
                    } catch { /* ignore */ }
                }
                await loadData();
                await loadGestionData(currentPage, pageSize);
                await loadHoraExtraAlerts();
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

    const closeGestionDetailModal = () => {
        setGestionDetailItem(null);
        setGestionEditMode(false);
        setGestionEditDraft(null);
        setGestionDeleteOpen(false);
        setGestionDeleteMotivo('');
        setGestionAdminErr(null);
    };

    const gestionAdminHeaders = () => {
        const csrfToken = (() => {
            const raw = String(document?.cookie || '');
            if (!raw) return '';
            const part = raw.split(';').map((c) => c.trim()).find((c) => c.startsWith('cinteXsrf='));
            return part ? decodeURIComponent(part.slice('cinteXsrf='.length)) : '';
        })();
        const headers = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        };
        if (csrfToken) headers['x-cinte-xsrf'] = csrfToken;
        return headers;
    };

    const buildGestionEditDraft = (it) => {
        if (!it) return null;
        const sopRuta =
            Array.isArray(it.soportes) && it.soportes.length > 1
                ? JSON.stringify(it.soportes)
                : String(it.soporteKey || it.soporteRuta || it.soportes?.[0] || '').trim();
        const monto = it.montoCop != null && it.montoCop !== '' ? String(it.montoCop) : '';
        return {
            nombre: it.nombre || '',
            cedula: it.cedula || '',
            correoSolicitante: it.correoSolicitante || '',
            cliente: it.cliente || '',
            lider: it.lider || '',
            gpUserId: it.gpUserId || '',
            tipoNovedad: it.tipoNovedad || '',
            area: it.area || 'Operaciones',
            fecha: it.fecha || '',
            horaInicio: normalizeHoraHePayload(it.horaInicio).slice(0, 5) || '',
            horaFin: normalizeHoraHePayload(it.horaFin).slice(0, 5) || '',
            fechaInicio: it.fechaInicio || '',
            fechaFin: it.fechaFin || '',
            cantidadHoras: String(it.cantidadHoras ?? 0),
            horasDiurnas: String(it.horasDiurnas ?? 0),
            horasNocturnas: String(it.horasNocturnas ?? 0),
            horasRecargoDomingo: String(it.horasRecargoDomingo ?? 0),
            horasRecargoDomingoDiurnas: String(it.horasRecargoDomingoDiurnas ?? 0),
            horasRecargoDomingoNocturnas: String(it.horasRecargoDomingoNocturnas ?? 0),
            tipoHoraExtra: it.tipoHoraExtra || '',
            montoCop: monto,
            estado: it.estado || 'Pendiente',
            heDomingoObservacion: it.heDomingoObservacion || '',
            soporteRuta: sopRuta
        };
    };

    const patchBodyFromGestionDraft = (draft) => {
        const num = (s) => {
            const n = Number(String(s).replace(',', '.'));
            return Number.isFinite(n) ? n : 0;
        };
        const montoRaw = String(draft.montoCop || '').trim().replace(/\./g, '').replace(',', '.');
        let montoCop = null;
        if (montoRaw !== '') {
            const mn = Number(montoRaw);
            montoCop = Number.isFinite(mn) ? Number(mn.toFixed(2)) : null;
        }
        return {
            nombre: String(draft.nombre || '').trim(),
            cedula: String(draft.cedula || '').replace(/\D/g, ''),
            correoSolicitante: String(draft.correoSolicitante || '').trim() || null,
            cliente: String(draft.cliente || '').trim() || null,
            lider: String(draft.lider || '').trim() || null,
            gpUserId: String(draft.gpUserId || '').trim() || null,
            tipoNovedad: String(draft.tipoNovedad || '').trim(),
            area: String(draft.area || '').trim(),
            fecha: String(draft.fecha || '').trim() || null,
            horaInicio: draft.horaInicio ? normalizeHoraHePayload(draft.horaInicio) : null,
            horaFin: draft.horaFin ? normalizeHoraHePayload(draft.horaFin) : null,
            fechaInicio: String(draft.fechaInicio || '').trim() || null,
            fechaFin: String(draft.fechaFin || '').trim() || null,
            cantidadHoras: num(draft.cantidadHoras),
            horasDiurnas: num(draft.horasDiurnas),
            horasNocturnas: num(draft.horasNocturnas),
            horasRecargoDomingo: num(draft.horasRecargoDomingo),
            horasRecargoDomingoDiurnas: num(draft.horasRecargoDomingoDiurnas),
            horasRecargoDomingoNocturnas: num(draft.horasRecargoDomingoNocturnas),
            tipoHoraExtra: String(draft.tipoHoraExtra || '').trim() || null,
            montoCop,
            estado: String(draft.estado || 'Pendiente').trim(),
            heDomingoObservacion: String(draft.heDomingoObservacion || '').trim() || null,
            soporteRuta: String(draft.soporteRuta || '').trim() || null
        };
    };

    const gestionNovedadPublicId = (it) => {
        const u = String(it?.id || '').trim();
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(u)) return u;
        return String(it?.creadoEn || '').trim();
    };

    const submitGestionAdminPatch = async () => {
        if (!gestionDetailItem || !gestionEditDraft) return;
        setGestionAdminErr(null);
        setGestionAdminBusy(true);
        try {
            const id = gestionNovedadPublicId(gestionDetailItem);
            if (!id) throw new Error('No se pudo resolver el identificador de la novedad.');
            const res = await fetch(`/api/novedades/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: gestionAdminHeaders(),
                body: JSON.stringify(patchBodyFromGestionDraft(gestionEditDraft))
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setGestionAdminErr(data?.error || `Error ${res.status}`);
                return;
            }
            await loadData();
            await loadGestionData(currentPage, pageSize);
            await loadHoraExtraAlerts();
            closeGestionDetailModal();
        } catch (e) {
            setGestionAdminErr(e?.message || 'Error de red');
        } finally {
            setGestionAdminBusy(false);
        }
    };

    const submitGestionAdminDelete = async () => {
        if (!gestionDetailItem) return;
        const motivo = String(gestionDeleteMotivo || '').trim();
        if (!motivo) {
            setGestionAdminErr('El motivo de eliminación es obligatorio.');
            return;
        }
        setGestionAdminErr(null);
        setGestionAdminBusy(true);
        try {
            const id = gestionNovedadPublicId(gestionDetailItem);
            if (!id) throw new Error('No se pudo resolver el identificador de la novedad.');
            const res = await fetch(`/api/novedades/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: gestionAdminHeaders(),
                body: JSON.stringify({ motivo })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setGestionAdminErr(data?.error || `Error ${res.status}`);
                return;
            }
            await loadData();
            await loadGestionData(currentPage, pageSize);
            await loadHoraExtraAlerts();
            closeGestionDetailModal();
        } catch (e) {
            setGestionAdminErr(e?.message || 'Error de red');
        } finally {
            setGestionAdminBusy(false);
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

    // Ítems visibles en Dashboard general (mes + tipo + cliente; el alcance por rol viene de `items` / API)
    const dashItems = useMemo(() => items.filter((it) => {
        const d = getItemDate(it);
        if (isNaN(d.getTime())) return true;
        if (fMes !== '' && d.getMonth() !== Number(fMes)) return false;
        if (fTipoInicio !== '' && it.tipoNovedad !== fTipoInicio) return false;
        if (fClienteInicio !== '') {
            const a = String(it.cliente || '').trim().toLowerCase();
            const b = String(fClienteInicio).trim().toLowerCase();
            if (a !== b) return false;
        }
        return true;
    }), [items, fMes, fTipoInicio, fClienteInicio]);

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
    const typeDataSorted = useMemo(() => [...typeData].sort((a, b) => b.value - a.value), [typeData]);
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
        estimado: Math.round(countByMonth[i] * 1.15 + (i > nowMonth ? (i - nowMonth) * 1.5 : 0))
    }));

    // 4. KPI tarjeta Total: barras por mes (año en curso, misma fecha ref. que el monitor)
    const kpiBarMonthData = useMemo(() => {
        const MESES_CORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const y = new Date().getFullYear();
        const countByMonth = Array(12).fill(0);
        for (const it of dashItems) {
            const d = getItemDate(it);
            if (!isNaN(d.getTime()) && d.getFullYear() === y) countByMonth[d.getMonth()] += 1;
        }
        return MESES_CORT.map((mes, i) => ({ mes, count: countByMonth[i], monthIndex: i }));
    }, [dashItems]);

    /**
     * Abre Gestión aplicando filtros; rango creado_en solo si se pasan creadoDesde/creadoHasta o si hay fMes en el dashboard.
     * Nota: en Gestión el rango es sobre creado_en; el filtro Mes del dashboard usa getItemDate (puede diferir).
     */
    const navigateGestionWithDashboardFilters = useCallback((partial = {}) => {
        const nextTipo = Object.prototype.hasOwnProperty.call(partial, 'tipo') ? partial.tipo : fTipoInicio;
        const nextCliente = Object.prototype.hasOwnProperty.call(partial, 'cliente') ? partial.cliente : fClienteInicio;
        const nextNombre = Object.prototype.hasOwnProperty.call(partial, 'nombre') ? partial.nombre : '';
        const nextEstado = Object.prototype.hasOwnProperty.call(partial, 'estado') ? partial.estado : '';

        let desde = '';
        let hasta = '';
        if (Object.prototype.hasOwnProperty.call(partial, 'creadoDesde') && Object.prototype.hasOwnProperty.call(partial, 'creadoHasta')) {
            desde = partial.creadoDesde;
            hasta = partial.creadoHasta;
        } else if (fMes !== '') {
            const r = creadoEnRangeForDashboardMesFilter(fMes);
            desde = r.desde;
            hasta = r.hasta;
        }

        setFTipo(nextTipo || '');
        setFCliente(nextCliente || '');
        setFNombre(nextNombre || '');
        setFEstado(nextEstado || '');
        setFCreadoDesde(desde);
        setFCreadoHasta(hasta);
        setCurrentPage(1);
        setActiveTab('Gestión');
    }, [fTipoInicio, fClienteInicio, fMes]);

    const MS_DAY = 86400000;
    const leadTimeStats = useMemo(() => {
        const deltas = [];
        for (const it of dashItems) {
            if (String(it.estado || '') !== 'Aprobado') continue;
            const c0 = new Date(it.creadoEn);
            const c1 = new Date(it.aprobadoEn);
            if (Number.isNaN(c0.getTime()) || Number.isNaN(c1.getTime())) continue;
            const ms = c1 - c0;
            if (ms <= 0) continue;
            deltas.push(ms);
        }
        const n = deltas.length;
        const buckets = [
            { name: '≤24 h', n: 0 },
            { name: '1–3 d', n: 0 },
            { name: '3–7 d', n: 0 },
            { name: '>7 d', n: 0 }
        ];
        for (const ms of deltas) {
            const days = ms / MS_DAY;
            if (ms < MS_DAY) buckets[0].n += 1;
            else if (days < 3) buckets[1].n += 1;
            else if (days < 7) buckets[2].n += 1;
            else buckets[3].n += 1;
        }
        const avgMs = n > 0 ? deltas.reduce((a, b) => a + b, 0) / n : null;
        return { n, avgMs, buckets };
    }, [dashItems]);

    // ── Gestión table filters ─────────────────────────────────────────────────
    const sortedItems = gestionItems;
    const alertItems = useMemo(
        () => (Array.isArray(horaExtraAlerts?.items) ? horaExtraAlerts.items : []),
        [horaExtraAlerts]
    );

    /** Solo alertas por exceso de topes; la política de domingo no se muestra aquí (sigue en Excel). */
    const alertDisplayCards = useMemo(() => {
        const cards = [];
        for (const it of alertItems) {
            const hasExcess = (Array.isArray(it.dailyReasons) && it.dailyReasons.length > 0)
                || (Array.isArray(it.monthlyReasons) && it.monthlyReasons.length > 0);
            if (hasExcess) cards.push({ key: `excess-${it.id}`, it });
        }
        return cards;
    }, [alertItems]);

    const alertasHeCount = alertDisplayCards.length;
    const alertasHeBadgeText = alertasHeCount > 99 ? '99+' : String(alertasHeCount);
    const alertasHeExcesoCardCount = alertDisplayCards.length;
    const alertasHeTooltipTitle = `${alertasHeCount} tarjeta(s) (exceso HE)`;

    /** Roles asignados: API + mismo criterio que el formulario si el mapper no resolvió el tipo. */
    const asignacionEtiquetaForItem = (it) => {
        const api = it?.asignacionRolesEtiqueta;
        if (api && api !== '—') return api;
        const { rolesEtiqueta } = getAsignacionGestionNovedad(it?.tipoNovedad || '');
        return rolesEtiqueta && rolesEtiqueta !== '—' ? rolesEtiqueta : (api || '—');
    };

    /** Columna «Aprobado por»: solo correo; nunca mostrar roles u otro texto. */
    const soloCorreoActor = (raw) => {
        const s = String(raw || '').trim();
        if (!s.includes('@')) return '—';
        return s;
    };

    const correoAprobadoMostrar = (it) => {
        const db = soloCorreoActor(it?.aprobadoPorCorreo);
        if (db !== '—') return db;
        if (it?.estado !== 'Aprobado' || !it?.id) return '—';
        try {
            const cached = String(sessionStorage.getItem(`novedadActorEmail:${it.id}`) || '').trim();
            if (cached.includes('@')) return cached;
        } catch { /* ignore */ }
        return '—';
    };

    const correoRechazadoMostrar = (it) => {
        const db = soloCorreoActor(it?.rechazadoPorCorreo);
        if (db !== '—') return db;
        if (it?.estado !== 'Rechazado' || !it?.id) return '—';
        try {
            const cached = String(sessionStorage.getItem(`novedadActorEmail:${it.id}`) || '').trim();
            if (cached.includes('@')) return cached;
        } catch { /* ignore */ }
        return '—';
    };

    /** Franjas diurna/nocturna (Bogotá) para el modal de detalle HE; memoizado para no recalcular en cada re-render del Dashboard. */
    const gestionHeDetailFranjas = useMemo(() => {
        const it = gestionDetailItem;
        if (!it || resolveCanonicalNovedadTipo(it.tipoNovedad) !== 'Hora Extra') return null;
        const hi = normalizeHoraHePayload(it.horaInicio);
        const hf = normalizeHoraHePayload(it.horaFin);
        const startMs = toUtcMsFromDateAndTime(it.fechaInicio, hi);
        const endMs = toUtcMsFromDateAndTime(it.fechaFin, hf);
        const dash = { diurna: [], nocturna: [] };
        if (startMs == null || endMs == null || endMs <= startMs) {
            return {
                recargoDiurnaFranja: '—',
                recargoNoctFranja: '—',
                heDiurnaFranja: '—',
                heNoctFranja: '—'
            };
        }
        const recSegs = collectRecargoDomingoDiurnaNocturnaSegmentsBogota(startMs, endMs);
        const heSegs = collectHeDiurnaNocturnaSegmentsBogota(startMs, endMs);
        return {
            recargoDiurnaFranja: formatHeSegmentListBogota(recSegs.diurna),
            recargoNoctFranja: formatHeSegmentListBogota(recSegs.nocturna),
            heDiurnaFranja: formatHeSegmentListBogota(heSegs.diurna),
            heNoctFranja: formatHeSegmentListBogota(heSegs.nocturna)
        };
    }, [
        gestionDetailItem?.id,
        gestionDetailItem?.tipoNovedad,
        gestionDetailItem?.fechaInicio,
        gestionDetailItem?.fechaFin,
        gestionDetailItem?.horaInicio,
        gestionDetailItem?.horaFin
    ]);

    const totalPages = Math.max(1, Number(gestionPagination.totalPages || 1));
    const safePage = Math.min(currentPage, totalPages);
    const pagedItems = sortedItems;

    useEffect(() => {
        setCurrentPage(1);
    }, [fTipo, fEstado, fNombre, fCliente, fCreadoDesde, fCreadoHasta, fGpUserId, pageSize]);
    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const pendientesCount = items.filter(i => i.estado === 'Pendiente').length;

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
        const L = isLight;
        if (!tipo) return L ? 'border-slate-300 bg-slate-100 text-slate-700' : 'text-slate-400 bg-slate-400/20 border-slate-400/50';
        const t = tipo.toLowerCase();
        if (t.includes('incapacidad')) return L ? 'border-rose-300 bg-rose-100 text-rose-900' : 'text-rose-400 bg-rose-500/20 border-rose-500/50';
        if (t.includes('vacacion')) return L ? 'border-amber-300 bg-amber-100 text-amber-900' : 'text-amber-400 bg-amber-500/20 border-amber-500/50';
        if (t.includes('permiso')) return L ? 'border-blue-300 bg-blue-100 text-blue-900' : 'text-blue-400 bg-blue-500/20 border-blue-500/50';
        if (t.includes('extra')) return L ? 'border-emerald-300 bg-emerald-100 text-emerald-900' : 'text-emerald-400 bg-emerald-500/20 border-emerald-500/50';
        if (t.includes('licencia')) return L ? 'border-purple-300 bg-purple-100 text-purple-900' : 'text-purple-400 bg-purple-500/20 border-purple-500/50';
        return L ? 'border-slate-300 bg-slate-100 text-slate-700' : 'text-slate-400 bg-slate-400/20 border-slate-400/50';
    };
    // -----------------------

    const exportExcel = async () => {
        try {
            const params = {};
            if (fTipo) params.tipo = fTipo;
            if (fEstado) params.estado = fEstado;
            if (fNombre) params.nombre = fNombre;
            if (fCliente) params.cliente = fCliente;
            if (fCreadoDesde) params.createdFrom = fCreadoDesde;
            if (fCreadoHasta) params.createdTo = fCreadoHasta;
            if (fGpUserId) params.gpUserId = fGpUserId;
            const query = new URLSearchParams(params).toString();
            const res = await fetch(`/api/novedades/export-excel?${query}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) {
                const payload = await res.json().catch(() => ({}));
                throw new Error(payload?.error || payload?.message || `Error ${res.status} exportando Excel`);
            }
            const buf = await res.arrayBuffer();
            const blob = new Blob([buf], { type: 'application/octet-stream' });
            const disposition = res.headers.get('content-disposition') || '';
            const match = disposition.match(/filename="?([^"]+)"?/i);
            const filename = (match && match[1]) ? match[1] : `novedades_reporte_${new Date().toISOString().slice(0, 10)}.xlsx`;
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
        } catch (err) {
            setStateError(err?.message || 'No se pudo exportar el reporte Excel.');
        }
    };

    const clearGestionFilters = () => {
        setFTipo('');
        setFEstado('');
        setFNombre('');
        setFCliente('');
        setFCreadoDesde('');
        setFCreadoHasta('');
        setFGpUserId('');
        setCurrentPage(1);
    };

    // Sidebar
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const navItems = [
        { id: 'DashboardGeneral', icon: LayoutDashboard, label: 'Dashboard general' },
        { id: 'Calendario', icon: Calendar, label: 'Calendario' },
        { id: 'Análisis Avanzado', icon: TrendingUp, label: 'Análisis Avanzado' },
        { id: 'Gestión', icon: Briefcase, label: 'Gestión de Novedades' },
        { id: 'Alertas HE', icon: Bell, label: 'Alertas HE' },
    ].filter((item) => canAccessPanel(tabPanelMap[item.id]));

    useEffect(() => {
        const allowedTabs = navItems.map((n) => n.id);
        if (!allowedTabs.includes(activeTab)) {
            setActiveTab(allowedTabs[0] || 'Calendario');
        }
    }, [activeTab, navItems]);

    const superAdminGpSelect = isSuperAdminNovedades ? (
        <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="dash-filtro-gp" className={`${dash.labelFilter} whitespace-nowrap`}>
                Filtrar por GS
            </label>
            <select
                id="dash-filtro-gp"
                value={fGpUserId}
                onChange={(e) => setFGpUserId(e.target.value)}
                className={`${fieldInput} min-w-[10rem] max-w-[18rem] cursor-pointer py-1.5 text-sm`}
                title="Clientes asignados a este usuario GP en el catálogo directorio"
            >
                <option value="">Todos los GP</option>
                <option value="__null__">Cliente sin GP en catálogo</option>
                {gpFilterOptions.map((g) => {
                    const id = String(g.id || '');
                    const label = labelGpDirectorioOption(g);
                    return (
                        <option key={id || label} value={id}>
                            {label}
                            {g.is_active === false ? ' (inactivo)' : ''}
                        </option>
                    );
                })}
            </select>
        </div>
    ) : null;

    return (
        <div className={shell}>

            {/* ───────── MOBILE SIDEBAR ───────── */}
            <button
                onClick={() => setMobileMenuOpen(true)}
                className={`md:hidden fixed top-16 left-4 z-40 w-10 h-10 flex items-center justify-center shadow-lg ${menuFab}`}
                aria-label="Abrir menú"
            >
                <Menu size={18} />
            </button>
            {mobileMenuOpen && (
                <div
                    className={`md:hidden fixed inset-0 z-40 ${scrim}`}
                    onClick={() => setMobileMenuOpen(false)}
                />
            )}
            <aside
                className={`md:hidden fixed top-0 left-0 h-full w-72 z-50 shadow-2xl transform transition-transform duration-300 font-body ${aside} ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
                    }`}
            >
                <AdminModuleSidebarBrand
                    variant="drawer"
                    isLight={isLight}
                    asideHeaderBorder={asideHeaderBorder}
                    moduleContext={(
                        <>
                            <p className="text-[10px] font-heading font-black uppercase tracking-widest leading-tight text-[#65BCF7]">Sistema Análisis</p>
                            <p className="text-[10px] font-body font-bold uppercase tracking-widest leading-tight text-slate-400">Novedades CINTE</p>
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
                <nav className="p-3 flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            navigate('/admin');
                            setMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-body font-semibold transition-all ${navOutline}`}
                    >
                        <Home size={17} />
                        <span>Inicio portal</span>
                    </button>
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const active = activeTab === item.id;
                        return (
                            <button
                                key={`mobile-${item.id}`}
                                onClick={() => setActiveTab(item.id)}
                                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-body font-semibold transition-all ${active ? 'bg-[#2F7BB8] text-white' : navInactive
                                    }`}
                            >
                                <Icon size={17} />
                                <span>{item.label}</span>
                                {item.id === 'Alertas HE' && alertasHeCount > 0 ? (
                                    <span
                                        title={alertasHeTooltipTitle}
                                        className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.5 text-[10px] font-bold text-amber-300"
                                    >
                                        {alertasHeBadgeText}
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                </nav>
                <div className={`mt-auto p-4 ${asideFooterBorder}`}>
                    <p className={`text-[10px] font-body font-black truncate ${email}`}>{currentEmail}</p>
                    <p className="text-[10px] text-[#65BCF7] font-body font-semibold uppercase">{currentRoleLabel}</p>
                </div>
            </aside>

            {/* ───────── SIDEBAR COLAPSABLE ───────── */}
            <aside
                className={`
                    flex-shrink-0 flex-col hidden md:flex h-full shadow-2xl relative z-10 font-body
                    transition-all duration-300 ease-in-out overflow-hidden
                    ${aside}
                    ${sidebarOpen ? 'w-64' : 'w-16'}
                `}
            >
                <AdminModuleSidebarBrand
                    variant={sidebarOpen ? 'rail-expanded' : 'rail-collapsed'}
                    isLight={isLight}
                    asideHeaderBorder={asideHeaderBorder}
                    moduleContext={(
                        <>
                            <p className="whitespace-nowrap text-[10px] font-heading font-black uppercase leading-tight tracking-widest text-[#65BCF7]">
                                Sistema Análisis
                            </p>
                            <p className="whitespace-nowrap text-[10px] font-body font-bold uppercase leading-tight tracking-widest text-slate-400">
                                Novedades CINTE
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

                <nav className="flex flex-col gap-1 p-2 flex-1 mt-1">
                    <button
                        type="button"
                        onClick={() => navigate('/admin')}
                        title={!sidebarOpen ? 'Inicio portal' : undefined}
                        className={`
                            flex items-center gap-3 rounded-xl transition-all font-body font-medium text-sm text-left
                            ${navOutline}
                            ${sidebarOpen ? 'px-4 py-3' : 'px-0 py-3 justify-center'}
                        `}
                    >
                        <Home size={18} className={`flex-shrink-0 ${isLight ? 'text-slate-600' : 'text-slate-500'}`} />
                        {sidebarOpen ? (
                            <span className="truncate whitespace-nowrap overflow-hidden transition-all duration-300">
                                Inicio portal
                            </span>
                        ) : null}
                    </button>
                    {navItems.map(item => {
                        const Icon = item.icon;
                        const active = activeTab === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setActiveTab(item.id)}
                                title={!sidebarOpen ? item.label : undefined}
                                className={`
                                    flex items-center gap-3 rounded-xl transition-all font-body font-medium text-sm text-left
                                    ${sidebarOpen ? 'px-4 py-3' : 'px-0 py-3 justify-center'}
                                    ${active
                                        ? 'bg-[#2F7BB8] shadow-[0_4px_12px_rgba(47,123,184,0.3)] text-white'
                                        : navInactive
                                    }
                                `}
                            >
                                <Icon size={18} className={`flex-shrink-0 ${active ? 'text-white' : isLight ? 'text-slate-600' : 'text-slate-500'}`} />
                                {sidebarOpen && (
                                    <span className="truncate whitespace-nowrap overflow-hidden transition-all duration-300">
                                        {item.label}
                                    </span>
                                )}
                                {sidebarOpen && item.id === 'Alertas HE' && alertasHeCount > 0 ? (
                                    <span
                                        title={alertasHeTooltipTitle}
                                        className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500/20 border border-amber-400/40 px-1.5 py-0.5 text-[10px] font-bold text-amber-300"
                                    >
                                        {alertasHeBadgeText}
                                    </span>
                                ) : null}
                            </button>
                        );
                    })}
                </nav>

                <div className={`border-t ${borderSubtle} ${sidebarOpen ? 'p-4' : 'p-2'}`}>
                    {sidebarOpen ? (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-[#2F7BB8]/20 border border-[#2F7BB8]/30 flex items-center justify-center flex-shrink-0">
                                    <Code2 size={13} className="text-[#65BCF7]" />
                                </div>
                                <div className="overflow-hidden">
                                    <p className={`text-[10px] font-body font-black whitespace-nowrap leading-tight truncate ${email}`}>{currentEmail}</p>
                                    <p className="text-[9px] text-[#65BCF7] font-body font-semibold whitespace-nowrap leading-tight">{currentRoleLabel}</p>
                                </div>
                            </div>
                            <p className={`text-[9px] font-body font-bold uppercase tracking-widest text-center border-t pt-2 ${mt.isLight ? 'text-slate-400 border-slate-200' : 'text-slate-600 border-[#1a3a56]/50'}`}>
                                Grupo CINTE · V2.0
                            </p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 py-1">
                            <div className="flex justify-center" title={`${currentEmail} - ${currentRoleLabel}`}>
                                <div className="w-7 h-7 rounded-lg bg-[#2F7BB8]/20 border border-[#2F7BB8]/30 flex items-center justify-center">
                                    <Code2 size={13} className="text-[#65BCF7]" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Content Area */}
            <main className={`flex-1 overflow-y-auto p-4 pt-12 md:pt-6 md:p-6 relative scroll-smooth ${mainCanvas}`}>

                {/* ---------- Dashboard general ---------- */}
                {activeTab === 'DashboardGeneral' && canAccessPanel('dashboard') && (
                    <div className="flex flex-col gap-5 animate-in fade-in duration-300 min-h-[calc(100vh-9.5rem)]">

                        {/* ── Filtros: período, cliente, tipo ── */}
                        <div className={dash.filterBar}>

                            <div className="flex flex-wrap items-center gap-3">
                                <div className="flex items-center gap-2">
                                    <Calendar size={16} className="text-blue-400" />
                                    <span className={dash.labelUpper}>Filtros</span>
                                </div>
                                <div className={dash.divider} />

                                {/* Mes */}
                                <div className="flex items-center gap-2">
                                    <label className={`${dash.labelFilter} whitespace-nowrap`}>Mes</label>
                                    <select
                                        value={fMes}
                                        onChange={(e) => { setFMes(e.target.value); }}
                                        className={`${fieldInput} cursor-pointer py-1.5 text-sm`}
                                    >
                                        <option value="">Todos los meses</option>
                                        {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'].map((m, i) => (
                                            <option key={i} value={String(i)}>{m}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Cliente (alcance según rol; API acotada) */}
                                <div className="flex items-center gap-2">
                                    <label className={`${dash.labelFilter} whitespace-nowrap`}>Cliente</label>
                                    <select
                                        value={fClienteInicio}
                                        onChange={(e) => setFClienteInicio(e.target.value)}
                                        className={`${fieldInput} min-w-[10rem] max-w-[22rem] cursor-pointer py-1.5 text-sm`}
                                    >
                                        <option value="">Todos los clientes</option>
                                        {dashboardClientesOptions.map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex items-center gap-2">
                                    <label className={`${dash.labelFilter} whitespace-nowrap`}>Tipo</label>
                                    <select
                                        value={fTipoInicio}
                                        onChange={(e) => setFTipoInicio(e.target.value)}
                                        className={`${fieldInput} min-w-[12rem] max-w-[20rem] cursor-pointer py-1.5 text-sm`}
                                    >
                                        <option value="">Todos los tipos</option>
                                        {NOVEDAD_TYPES.map((tipo) => {
                                            const n = items.filter((i) => i.tipoNovedad === tipo).length;
                                            return (
                                                <option key={tipo} value={tipo} title={`${n} en el total cargado`}>
                                                    {tipo}{n > 0 ? ` (${n})` : ''}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>

                                {superAdminGpSelect ? (
                                    <>
                                        <div className={dash.divider} />
                                        {superAdminGpSelect}
                                    </>
                                ) : null}

                                {/* Botón limpiar */}
                                {(fMes !== '' || fClienteInicio !== '' || fTipoInicio !== '' || fGpUserId !== '') && (
                                    <button
                                        type="button"
                                        onClick={() => { setFMes(''); setFClienteInicio(''); setFTipoInicio(''); setFGpUserId(''); }}
                                        className={dash.clearBtn}
                                    >
                                        <X size={12} /> Limpiar filtros
                                    </button>
                                )}

                                {/* Badge de resultados */}
                                <div className="ml-auto flex items-center gap-2">
                                    <span className={`text-xs ${dash.muted}`}>Mostrando</span>
                                    <span className="text-sm font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-full">
                                        {dashItems.length} de {items.length} registros
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* KPIs Row */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                            <div className={`${dash.card} relative overflow-hidden p-6 group`}>
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className={dash.kpiSub}>Total novedades</p>
                                        <h3 className={`${dash.title3xl} mt-1`}>{dashItems.length}</h3>
                                        {dashItems.length !== items.length && <p className="text-[10px] text-blue-400 mt-0.5">de {items.length} totales</p>}
                                        <p className={`text-[10px] ${dash.muted} mt-1`}>Por mes (año en curso). Clic en una barra: abre Gestión con rango de creación de ese mes.</p>
                                    </div>
                                    <div className="bg-blue-500/10 p-2.5 rounded-lg border border-blue-500/20">
                                        <Activity size={20} className="text-blue-500" />
                                    </div>
                                </div>
                                <div className="h-16 mt-3 -mx-1 opacity-90 group-hover:opacity-100 transition-opacity cursor-pointer">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={kpiBarMonthData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                                            <XAxis dataKey="mes" tick={{ fontSize: 8 }} interval={0} stroke="#64748b" axisLine={false} tickLine={false} />
                                            <Tooltip contentStyle={dash.chartTooltip} formatter={(v) => [v, 'Novedades']} />
                                            <Bar
                                                dataKey="count"
                                                fill="#3b82f6"
                                                radius={[2, 2, 0, 0]}
                                                maxBarSize={18}
                                                cursor="pointer"
                                                onClick={(_entry, index) => {
                                                    const row = kpiBarMonthData[index];
                                                    if (row && typeof row.monthIndex === 'number') {
                                                        const y = new Date().getFullYear();
                                                        const r = creadoEnRangeForMonthIndex(row.monthIndex, y);
                                                        navigateGestionWithDashboardFilters({ creadoDesde: r.desde, creadoHasta: r.hasta });
                                                    }
                                                }}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className={`${dash.card} relative overflow-visible border-sky-500/30 p-6 group`}>
                                <div className="pointer-events-none absolute top-0 right-0 w-32 h-32 overflow-hidden rounded-2xl">
                                    <div className="absolute -right-10 -top-10 h-32 w-32 bg-sky-500/5 rounded-full blur-2xl" />
                                </div>
                                <div className="flex justify-between items-start relative">
                                    <div className="min-w-0 pr-2">
                                        <p className={dash.kpiSub}>Tiempo medio hasta aprobación</p>
                                        <h3 className="mt-1 text-2xl sm:text-3xl font-bold text-sky-500 tabular-nums">
                                            {leadTimeStats.n > 0 ? formatDurationMs(leadTimeStats.avgMs) : '—'}
                                        </h3>
                                        <p className={`text-xs ${dash.muted} mt-1`}>
                                            {leadTimeStats.n > 0
                                                ? 'Indicador calculado a partir del tiempo entre el registro de la novedad y su aprobación.'
                                                : 'No hay suficientes registros aprobados para mostrar este indicador.'}
                                        </p>
                                    </div>
                                    <div className="bg-sky-500/10 p-2.5 rounded-lg border border-sky-500/20 flex-shrink-0">
                                        <Clock size={20} className="text-sky-500" />
                                    </div>
                                </div>
                                {leadTimeStats.n > 0 ? (
                                    <div className="h-16 mt-3 min-h-[4rem] cursor-pointer pl-0.5 pr-1">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart
                                                data={leadTimeStats.buckets.map((b) => ({ name: b.name, n: b.n }))}
                                                layout="vertical"
                                                margin={{ top: 8, right: 10, left: 8, bottom: 8 }}
                                            >
                                                <XAxis type="number" hide />
                                                <YAxis
                                                    type="category"
                                                    dataKey="name"
                                                    width={78}
                                                    interval={0}
                                                    tickMargin={4}
                                                    tick={{ fontSize: 10, fill: '#64748b' }}
                                                    stroke="#64748b"
                                                    axisLine={false}
                                                    tickLine={false}
                                                />
                                                <Tooltip contentStyle={dash.chartTooltip} formatter={(v) => [v, 'Novedades']} />
                                                <Bar
                                                    dataKey="n"
                                                    fill="#0ea5e9"
                                                    radius={[0, 4, 4, 0]}
                                                    barSize={14}
                                                    cursor="pointer"
                                                    onClick={() => navigateGestionWithDashboardFilters({ estado: 'Aprobado' })}
                                                />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                ) : (
                                    <p className={`text-xs ${dash.muted} mt-3`}>Solo cuenta novedades en estado Aprobado con fechas válidas.</p>
                                )}
                            </div>

                            <div
                                className={`${dash.card} p-6 cursor-pointer transition-opacity hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500`}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(ev) => {
                                    if (ev.key === 'Enter' || ev.key === ' ') {
                                        ev.preventDefault();
                                        navigateGestionWithDashboardFilters({ estado: 'Pendiente' });
                                    }
                                }}
                                onClick={() => navigateGestionWithDashboardFilters({ estado: 'Pendiente' })}
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className={dash.kpiSub}>Novedades pendientes por aprobación</p>
                                        <h3 className={`${dash.title3xl} mt-1 text-rose-500`}>{pendientesCount}</h3>
                                        <p className={`text-[10px] ${dash.muted} mt-1`}>Incluye las novedades que aún no tienen decisión de aprobación.</p>
                                    </div>
                                    <div className="bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                                        <Users size={20} className="text-rose-500" />
                                    </div>
                                </div>
                                <div className="flex mt-4 -space-x-2">
                                    {Array.from({ length: Math.min(pendientesCount, 4) }).map((_, i) => (
                                        <div key={i} className={`flex h-8 w-8 items-center justify-center rounded-full ${dash.avatarRing}`}>
                                            {String.fromCharCode(65 + i)}
                                        </div>
                                    ))}
                                    {pendientesCount > 4 && (
                                        <div className={`flex h-8 w-8 items-center justify-center rounded-full ${dash.avatarMore}`}>
                                            +{pendientesCount - 4}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Comparativa real vs. serie estimada */}
                        <div className={`${dash.card} p-6 md:p-8`}>
                            <div className="flex justify-between items-end mb-6">
                                <div>
                                    <h2 className={`${dash.titleXl} flex items-center gap-2`}>
                                        Monitor de Tendencia <BadgeCheck className="text-blue-500" size={18} />
                                    </h2>
                                    <p className={`${dash.mutedSm} mt-1`}>Comparativa real vs. predicción semestral (estimada)</p>
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
                                        <CartesianGrid strokeDasharray="3 3" stroke={dash.chGrid} opacity={0.5} vertical={false} />
                                        <XAxis dataKey="mes" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                                        <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                                        <Tooltip contentStyle={dash.chartTooltip} />
                                        <Area type="monotone" dataKey="real" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorReal)" activeDot={{ r: 6 }} />
                                        <Line type="monotone" dataKey="estimado" stroke={dash.lineEstimado} strokeWidth={2} strokeDasharray="5 5" dot={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="mt-4 flex items-center justify-end gap-4 text-xs font-medium">
                                <span className={`flex items-center gap-1.5 align-middle ${dash.legendLine}`}><div className="h-3 w-3 rounded-full bg-blue-500"></div> Dato Real</span>
                                <span className={`flex items-center gap-1.5 align-middle ${dash.legendDash}`}><div className="h-0.5 w-6 border-t-2 border-dashed border-slate-400"></div> Serie estimada</span>
                            </div>
                        </div>

                        {/* Grid inferior 2 Cols */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6">

                            <div className={`${dash.card} p-6`}>
                                <h2 className={`${dash.titleLg} mb-6`}>Distribución por Tipología</h2>
                                <p className={`text-xs ${dash.muted} -mt-4 mb-4`}>Clic en una barra para filtrar por tipo en Gestión.</p>
                                <div className="h-72 w-full cursor-pointer">
                                    <ResponsiveContainer>
                                        <BarChart data={typeDataSorted} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke={dash.chGrid} opacity={0.3} horizontal={false} />
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
                                                cursor={{ fill: isLight ? '#cbd5e1' : '#334155', opacity: 0.15 }}
                                                contentStyle={dash.chartTooltipSm}
                                                formatter={(value, name, props) => [value, props?.payload?.name || name]}
                                            />
                                            <Bar
                                                dataKey="value"
                                                radius={[0, 6, 6, 0]}
                                                cursor="pointer"
                                                onClick={(_entry, index) => {
                                                    const row = typeDataSorted[index];
                                                    const tipoNom = String(row?.name || '').trim();
                                                    if (tipoNom) navigateGestionWithDashboardFilters({ tipo: tipoNom });
                                                }}
                                            >
                                                {typeDataSorted.map((entry, index) => (
                                                    <Cell key={`bar-tipologia-${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className={`${dash.card} p-6`}>
                                <h2 className={`${dash.titleLg} mb-6`}>Top 5 empleados con más novedades</h2>
                                <div className="flex flex-col gap-4">
                                    {topEmpleados.length === 0 ? (
                                        <p className={`mt-10 text-center ${dash.muted}`}>Generando analíticas...</p>
                                    ) : topEmpleados.map((emp, i) => (
                                        <div
                                            key={i}
                                            className={`${dash.topEmplRow} cursor-pointer rounded-xl transition-colors hover:bg-blue-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500`}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(ev) => {
                                                if (ev.key === 'Enter' || ev.key === ' ') {
                                                    ev.preventDefault();
                                                    navigateGestionWithDashboardFilters({ nombre: emp.nombre });
                                                }
                                            }}
                                            onClick={() => navigateGestionWithDashboardFilters({ nombre: emp.nombre })}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`flex h-10 w-10 items-center justify-center rounded-full font-bold ${isLight ? 'bg-slate-200 text-blue-700' : 'bg-slate-700 text-blue-400'}`}>
                                                    {emp.nombre.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <p className={dash.nameEmpl}>{emp.nombre}</p>
                                                    <p className={`${dash.tdSmall} text-xs`}>Aproximación mensual</p>
                                                </div>
                                            </div>
                                            <div className={dash.topEmplBadge}>
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
                            <div
                                className={
                                    isLight
                                        ? 'mb-4 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-900'
                                        : 'mb-4 flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-400'
                                }
                            >
                                <X size={16} className="flex-shrink-0" />
                                <span>{stateError}</span>
                                <button
                                    type="button"
                                    onClick={() => setStateError(null)}
                                    className={isLight ? 'ml-auto text-rose-700 hover:text-rose-900' : 'ml-auto text-rose-400 hover:text-rose-300'}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        )}
                        <div className={dash.cardFlex}>
                            <div className={`sticky top-0 z-20 p-4 ${dash.gestionHead}`}>
                                <h2 className={`${dash.titleXl} mb-4`}>Gestión Operativa de Novedades</h2>
                                <div className="flex flex-wrap gap-3 items-center">
                                    <select onChange={e => setFTipo(e.target.value)} value={fTipo} className={`${fieldInput} text-sm`}>
                                        <option value="">Todos los tipos</option>
                                        {Object.keys(typeDataMap).map(k => <option key={k} value={k}>{k}</option>)}
                                    </select>
                                    <select onChange={e => setFEstado(e.target.value)} value={fEstado} className={`${fieldInput} text-sm`}>
                                        <option value="">Todos los estados</option>
                                        <option value="Pendiente">Pendientes</option>
                                        <option value="Aprobado">Aprobados</option>
                                        <option value="Rechazado">Rechazados</option>
                                    </select>
                                    <input type="text" placeholder="Buscar por nombre..." value={fNombre} onChange={(e) => setFNombre(e.target.value)} className={`${fieldInput} min-w-[180px] text-sm`} />
                                    <select onChange={(e) => setFCliente(e.target.value)} value={fCliente} className={`${fieldInput} min-w-[220px] text-sm`}>
                                        <option value="">Todos los clientes</option>
                                        {gestionClienteOptions.map((c) => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                    {superAdminGpSelect}
                                    <div className={dash.dateRangeWrap}>
                                        <span className={dash.dateRangeLbl}>Rango de fechas</span>
                                        <input type="date" value={fCreadoDesde} onChange={(e) => setFCreadoDesde(e.target.value)} className={`${fieldInput} px-2 py-1 text-sm`} />
                                        <span className={`${dash.modalMuted} text-xs`}>a</span>
                                        <input type="date" value={fCreadoHasta} onChange={(e) => setFCreadoHasta(e.target.value)} className={`${fieldInput} px-2 py-1 text-sm`} />
                                    </div>
                                    <select onChange={e => setPageSize(Number(e.target.value))} value={pageSize} className={`${fieldInput} text-sm`}>
                                        <option value={10}>10 por página</option>
                                        <option value={20}>20 por página</option>
                                        <option value={50}>50 por página</option>
                                    </select>
                                    <button
                                        type="button"
                                        onClick={clearGestionFilters}
                                        className={dash.borrarFiltros}
                                    >
                                        Borrar filtros
                                    </button>

                                    <div className="flex-1"></div>

                                    <button onClick={exportExcel} className="bg-[#2F7BB8] hover:bg-[#004D87] text-white px-4 py-2 rounded-lg text-sm transition-all flex items-center gap-2 shadow-sm font-body font-medium">
                                        <Download size={16} /> Exportar Reporte Excel
                                    </button>
                                </div>
                            </div>

                            <div className={dash.tableWrap}>
                                <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
                                    <table className="w-full text-left border-collapse whitespace-nowrap min-w-[900px] md:min-w-full">
                                        <thead>
                                            <tr className={dash.thead}>
                                                <th className="p-4 pl-6 font-semibold">Creado</th>
                                                <th className="p-4 font-semibold">Nombre</th>
                                                <th className="p-4 font-semibold">Cliente</th>
                                                <th className="p-4 font-semibold">Tipo</th>
                                                <th className="p-4 font-semibold">F. Inicio</th>
                                                <th className="p-4 font-semibold text-center">Cantidad</th>
                                                <th className="p-4 font-semibold">Estado</th>
                                                <th className="p-4 font-semibold">Asignado a</th>
                                                <th className="p-4 font-semibold">Aprobado por</th>
                                                <th className="p-4 pr-6 font-semibold text-right">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className={dash.tbody}>
                                            {loading ? (
                                                <tr><td colSpan="10" className={`p-12 text-center font-medium ${dash.muted}`}>Cargando base de datos...</td></tr>
                                            ) : sortedItems.length === 0 ? (
                                                <tr><td colSpan="10" className={`p-12 text-center font-medium ${dash.muted}`}>No se encontraron registros.</td></tr>
                                            ) : (
                                                pagedItems.map(it => {
                                                    const cread = new Date(it.creadoEn);
                                                    const validCread = isNaN(cread.getTime()) ? '-' : cread.toLocaleString('es-CO');
                                                    const aprobado = it.aprobadoEn ? new Date(it.aprobadoEn) : null;
                                                    const aprobadoTxt = aprobado && !isNaN(aprobado.getTime())
                                                        ? aprobado.toLocaleString('es-ES')
                                                        : '';
                                                    const rechazado = it.rechazadoEn ? new Date(it.rechazadoEn) : null;
                                                    const rechazadoTxt = rechazado && !isNaN(rechazado.getTime())
                                                        ? rechazado.toLocaleString('es-ES')
                                                        : '';
                                                    return (
                                                        <tr key={it.id ? String(it.id) : `${it.creadoEn}-${it.cedula}-${it.nombre}`} className={dash.trHover}>
                                                            <td className={dash.tdDate}>{validCread}</td>
                                                            <td className={dash.tdName}>{it.nombre}</td>
                                                            <td className={dash.tdCell}>{it.cliente || '-'}</td>
                                                            <td className={dash.tdMuted}>
                                                                <span className={`px-2 py-1 rounded text-xs border ${getTypeColor(it.tipoNovedad)}`}>{it.tipoNovedad}</span>
                                                            </td>
                                                            <td className={dash.tdCell}>{it.fechaInicio || '-'}</td>
                                                            <td className={`${dash.tdMuted} text-center`}>
                                                                {formatCantidadNovedad(it.tipoNovedad, it.cantidadHoras, it)}
                                                            </td>
                                                            <td className="p-4">
                                                                <div className="flex flex-col gap-1">
                                                                    <span
                                                                        className={`inline-flex w-fit rounded-md border px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${
                                                                            it.estado === 'Aprobado'
                                                                                ? isLight
                                                                                    ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                                                                                    : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                                                                                : it.estado === 'Rechazado'
                                                                                    ? isLight
                                                                                        ? 'border-rose-300 bg-rose-100 text-rose-900'
                                                                                        : 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                                                                                    : isLight
                                                                                        ? 'border-amber-300 bg-amber-100 text-amber-900'
                                                                                        : 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                                                                        }`}
                                                                    >
                                                                        {it.estado}
                                                                    </span>
                                                                    {it.alertaHeResueltaEstado ? (
                                                                        <span
                                                                            className={
                                                                                isLight
                                                                                    ? 'inline-flex w-fit rounded border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-900'
                                                                                    : 'inline-flex w-fit rounded border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-200'
                                                                            }
                                                                        >
                                                                            Gestionada por alerta HE: {it.alertaHeResueltaEstado}
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            </td>
                                                            <td className={`${dash.tdCell} max-w-[240px] align-top text-xs !whitespace-normal`}>
                                                                <span className={`${dash.tdLead} block`} title={asignacionEtiquetaForItem(it)}>{asignacionEtiquetaForItem(it)}</span>
                                                            </td>
                                                            <td className={`${dash.tdCell} max-w-[220px] align-top text-xs !whitespace-normal`}>
                                                                {it.estado === 'Aprobado'
                                                                    ? (
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <span className={dash.modalMuted}>{aprobadoTxt || '-'}</span>
                                                                            <span className={dash.tdEmphasis}>{correoAprobadoMostrar(it)}</span>
                                                                        </div>
                                                                    )
                                                                    : it.estado === 'Rechazado'
                                                                        ? (
                                                                            <div className="flex flex-col gap-0.5">
                                                                                <span className={dash.modalMuted}>{rechazadoTxt || '-'}</span>
                                                                                <span className={dash.tdEmphasis}>{correoRechazadoMostrar(it)}</span>
                                                                            </div>
                                                                        )
                                                                    : '—'}
                                                            </td>
                                                            <td className="p-4 pr-6">
                                                                <div className="flex gap-2 justify-end items-center">
                                                                    <button onClick={() => setGestionDetailItem(it)} className={dash.actionBtn}>
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
                                    <div className={dash.footerBar}>
                                        <span>Mostrando {pagedItems.length} de {gestionPagination.total || 0} registros</span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                                disabled={safePage <= 1}
                                                className={compactBtn}
                                            >
                                                Anterior
                                            </button>
                                            <span>Página {safePage} de {totalPages}</span>
                                            <button
                                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                                disabled={safePage >= totalPages}
                                                className={compactBtn}
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

                {/* ---------- ALERTAS HE ---------- */}
                {activeTab === 'Alertas HE' && canAccessPanel('gestion') && (
                    <div className="animate-in fade-in slide-in-from-right-8 duration-300 pb-2 flex flex-col h-[calc(100vh-8.5rem)] md:h-[calc(100vh-7.5rem)]">
                        <div className={dash.cardFlex}>
                            <div className={`sticky top-0 z-20 p-4 ${dash.gestionHead}`}>
                                <h2 className={dash.titleXl}>Alertas HE</h2>
                                <p className={`mt-1 text-sm ${dash.muted}`}>
                                    Tarjetas: {alertasHeCount}
                                    {' · '}
                                    Exceso de topes: {alertasHeExcesoCardCount}
                                </p>
                                {superAdminGpSelect ? (
                                    <div className={`mt-3 flex flex-wrap items-center gap-2 border-t pt-3 ${isLight ? 'border-slate-200' : 'border-slate-700/50'}`}>
                                        {superAdminGpSelect}
                                    </div>
                                ) : null}
                            </div>
                            <div className="flex-1 overflow-auto p-4">
                                {alertDisplayCards.length === 0 ? (
                                    <div className={dash.emptyHe}>
                                        No hay alertas pendientes para el rango seleccionado.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 gap-3">
                                        {alertDisplayCards.map(({ key, it }) => (
                                            <div
                                                key={key}
                                                className={
                                                    isLight
                                                        ? 'rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm'
                                                        : 'rounded-xl border border-amber-500/30 bg-amber-500/10 p-4'
                                                }
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div>
                                                        <p
                                                            className={
                                                                isLight
                                                                    ? 'text-sm font-semibold text-amber-950'
                                                                    : 'text-sm font-semibold text-amber-100'
                                                            }
                                                        >
                                                            {it.nombre} ({it.cedula})
                                                        </p>
                                                        <p className={isLight ? 'text-xs text-amber-900' : 'text-xs text-amber-200/90'}>
                                                            {it.cliente || 'Sin cliente'} · {it.tipoNovedad}
                                                            <span
                                                                className={
                                                                    isLight
                                                                        ? 'ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950'
                                                                        : 'ml-2 rounded bg-amber-500/25 px-1.5 py-0.5 text-amber-100'
                                                                }
                                                            >
                                                                Exceso de topes HE
                                                            </span>
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setAlertaHeDetailItem(it)}
                                                        className={
                                                            isLight
                                                                ? 'rounded-lg border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-950 shadow-sm hover:bg-amber-100'
                                                                : 'rounded-lg border border-amber-300/40 px-3 py-1.5 text-xs font-semibold text-amber-100 hover:bg-amber-400/15'
                                                        }
                                                    >
                                                        Ver alerta
                                                    </button>
                                                </div>
                                                <div
                                                    className={
                                                        isLight
                                                            ? 'mt-2 space-y-1 text-xs text-amber-950'
                                                            : 'mt-2 space-y-1 text-xs text-amber-100/90'
                                                    }
                                                >
                                                    <p
                                                        className={
                                                            isLight ? 'font-semibold text-amber-950' : 'font-semibold text-amber-200/95'
                                                        }
                                                    >
                                                        Detalle del exceso
                                                    </p>
                                                    {Array.isArray(it.dailyReasons) && it.dailyReasons.map((d) => (
                                                        <p key={`cd-${key}-${d.date}`}>
                                                            Diario {d.date}: {d.totalHours}h (tope {d.limitHours}h, exceso {d.exceededByHours}h)
                                                        </p>
                                                    ))}
                                                    {Array.isArray(it.monthlyReasons) && it.monthlyReasons.map((m) => (
                                                        <p key={`cm-${key}-${m.month}`}>
                                                            Mensual {m.month}: {m.totalHours}h (tope {m.limitHours}h, exceso {m.exceededByHours}h)
                                                        </p>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* ---------- CALENDARIO INTERACTIVO ---------- */}
                {activeTab === 'Calendario' && canAccessPanel('calendar') && (
                    <div className={dash.calShell}>
                        <div className={dash.calSticky}>
                            <div>
                                <h2 className={`${dash.titleXl} flex items-center gap-2`}>
                                    <Calendar className="text-blue-500" size={22} /> Agenda Operativa
                                </h2>
                                <p className={`${dash.mutedSm} mt-1`}>Vista interactiva mensual de las novedades del talento</p>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-3">
                                <select
                                    value={fClienteCalendario}
                                    onChange={(e) => setFClienteCalendario(e.target.value)}
                                    className={`${fieldInput} max-w-[220px] text-sm`}
                                    aria-label="Filtrar por cliente"
                                >
                                    <option value="">Todos los clientes</option>
                                    {calendarClientesList.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                                {superAdminGpSelect}
                                <div className={dash.calSegOuter}>
                                    <button
                                        onClick={() => setCalendarView('monthly')}
                                        className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${calendarView === 'monthly' ? 'bg-blue-600 text-white' : dash.calNavBtn}`}
                                    >
                                        Mensual
                                    </button>
                                    <button
                                        onClick={() => setCalendarView('daily')}
                                        className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${calendarView === 'daily' ? 'bg-blue-600 text-white' : dash.calNavBtn}`}
                                    >
                                        Diaria
                                    </button>
                                </div>
                                {calendarView === 'monthly' ? (
                                    <div className={dash.calSegOuter}>
                                        <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className={dash.calNavBtn}>&larr; Ant.</button>
                                        <span className={dash.calMonthLabel}>
                                            {currentMonth.toLocaleString('es-ES', { month: 'long', year: 'numeric' })}
                                        </span>
                                        <button type="button" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className={dash.calNavBtn}>Sig. &rarr;</button>
                                    </div>
                                ) : (
                                    <div className={dash.calSegOuter}>
                                        <button type="button" onClick={() => setCurrentDay(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 1))} className={dash.calNavBtn}>&larr; Ant.</button>
                                        <span className={dash.calDayLabel}>
                                            {currentDay.toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                                        </span>
                                        <button type="button" onClick={() => setCurrentDay(prev => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1))} className={dash.calNavBtn}>Sig. &rarr;</button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex-1 overflow-auto p-6">
                            {calendarView === 'monthly' ? (
                                <div className={dash.calGrid}>
                                    {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
                                        <div key={day} className={dash.calWeekday}>
                                            {day}
                                        </div>
                                    ))}

                                    {calendarDays.map((dateObj, i) => {
                                        if (!dateObj) return <div key={`empty-${i}`} className={dash.calEmpty} />;

                                        const dayDateStr = dateObj.toISOString().slice(0, 10);
                                        const dayItems = itemsByDate[dayDateStr] || [];
                                        const isToday = new Date().toISOString().slice(0, 10) === dayDateStr;

                                        return (
                                            <div key={dayDateStr}
                                                onClick={() => dayItems.length > 0 && setSelectedDayItems({ date: dateObj, items: dayItems })}
                                                className={`${dash.calCell}${dayItems.length > 0 ? (isLight ? ' cursor-pointer hover:bg-slate-50' : ' cursor-pointer hover:bg-slate-800') : ''
                                                    } ${isToday ? dash.calTodayCell : ''}`}>

                                                <div className="mb-1 flex items-center justify-between">
                                                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold ${isToday ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]' : isLight ? 'text-slate-500' : 'text-slate-400'
                                                        }`}>
                                                        {dateObj.getDate()}
                                                    </span>
                                                    {dayItems.length > 0 && (
                                                        <span className={dash.calCountBadge}>
                                                            {dayItems.length} reg.
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="mt-auto">
                                                    {dayItems.length > 0 && (
                                                        <div className={`rounded border px-2 py-1 text-center text-[10px] font-semibold leading-tight ${isToday
                                                            ? (isLight ? 'border-blue-200 bg-sky-100 text-blue-800' : 'border-blue-500/40 bg-blue-500/15 text-blue-300')
                                                            : dash.calNovedadMuted
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
                                <div className={dash.dailyPanel}>
                                    <h3 className={`mb-4 text-base font-bold md:text-lg ${dash.titleXl}`}>
                                        Novedades del día: {currentDay.toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                                    </h3>
                                    {dailyItems.length === 0 ? (
                                        <div className={dash.dailyEmpty}>
                                            No hay novedades registradas para este día.
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-3">
                                            {dailyItems.map((it, idx) => (
                                                <div key={`${it.creadoEn}-${idx}`} className={`rounded-lg border p-3 ${getTypeColor(it.tipoNovedad)}`}>
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div>
                                                            <p className={dash.dailyName}>{it.nombre}</p>
                                                            <p className={dash.dailyMeta}>{it.tipoNovedad} · Estado: {it.estado}</p>
                                                        </div>
                                                        <div className={`${dash.dailyMeta} text-right`}>
                                                            <p>{it.fechaInicio || '-'}</p>
                                                            <p>{formatCantidadNovedad(it.tipoNovedad, it.cantidadHoras, it)}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Legend */}
                            <div className={`mt-6 flex flex-wrap items-center justify-center gap-4 text-xs ${dash.muted}`}>
                                <span className={`mr-2 font-bold uppercase tracking-widest ${isLight ? 'text-slate-600' : 'text-slate-500'}`}>Leyenda:</span>
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
                        <div className={`${dash.card} p-6`}>
                            <h2 className={`${dash.title2xl} mb-2 flex items-center gap-2`}>
                                <TrendingUp className="text-purple-500" size={24} /> Inteligencia operativa (fase exploratoria)
                            </h2>
                            <p className={`text-sm ${dash.muted}`}>Modelos estadísticos descriptivos diseñados para futura integración con algoritmos de Machine Learning y predicción de anomalías.</p>
                            {superAdminGpSelect ? (
                                <div className={`mt-4 flex flex-wrap items-center gap-2 border-t pt-4 ${isLight ? 'border-slate-200' : 'border-slate-700/50'}`}>
                                    {superAdminGpSelect}
                                </div>
                            ) : null}
                        </div>

                        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                            {/* Mapa de Frecuencia (Por Día de la Semana) */}
                            <div className={`${dash.card} p-6`}>
                                <h3 className={`${dash.titleXl} mb-1`}>Mapa de Frecuencia (Días de la Semana)</h3>
                                <p className={`mb-5 text-xs ${dash.muted}`}>
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
                                            <CartesianGrid strokeDasharray="3 3" stroke={dash.chGrid} opacity={0.5} vertical={false} />
                                            <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                                            <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                                            <Tooltip
                                                cursor={{ fill: isLight ? '#cbd5e1' : '#334155', opacity: 0.15, radius: 6 }}
                                                content={({ active, payload }) => {
                                                    if (!active || !payload?.length) return null;
                                                    const { name, count } = payload[0].payload;
                                                    const total = items.length || 1;
                                                    const pct = ((count / total) * 100).toFixed(1);
                                                    const isWeekend = name === 'Dom' || name === 'Sáb';
                                                    const label = count === 0 ? 'Sin actividad' : isWeekend ? 'Día no hábil — verificar horas extra' : count >= 5 ? 'Concentración alta — revisar patrón' : 'Actividad normal';
                                                    return (
                                                        <div className={dash.tooltipPanel}>
                                                            <p className={`mb-1 font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{name} — {count} novedad{count !== 1 ? 'es' : ''}</p>
                                                            <p className={`text-xs ${dash.muted}`}>{pct}% del total registrado</p>
                                                            <p className={`mt-1 text-xs font-semibold ${isLight ? 'text-purple-700' : 'text-purple-400'}`}>{label}</p>
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
                                <p className={dash.legendFoot}>Base para modelo predictivo de ausentismo por día — Grupo CINTE</p>
                            </div>

                            {/* Índice de Riesgo por Consultor */}
                            <div className={`${dash.card} relative overflow-hidden border-rose-500/20 p-6`}>
                                <div className="absolute top-0 right-0 w-40 h-40 bg-rose-500/5 rounded-full -mr-20 -mt-20 blur-3xl" />
                                <h3 className={`${dash.titleXl} mb-1 flex items-center gap-2`}>
                                    <Activity className="text-rose-500" size={20} /> Riesgo Operativo (Burnout / Atipicidad)
                                </h3>
                                <p className={`mb-5 text-xs ${dash.muted}`}>
                                    Puntaje acumulado por tipo de novedad: Incapacidad (+5 pts), Hora extra (+3 pts), otros (+1 pt). Detecta colaboradores con patrones atípicos que requieren atención preventiva.
                                </p>
                                <div className="space-y-3 overflow-y-auto max-h-[240px] pr-1">
                                    {(() => {
                                        const riesgoMap = {};
                                        items.forEach(it => {
                                            if (!riesgoMap[it.nombre]) riesgoMap[it.nombre] = { puntos: 0, sumHoras: 0, sumDias: 0, novedades: 0 };
                                            const kind = getCantidadMedidaKind(it.tipoNovedad);
                                            const v = Number(it.cantidadHoras) || 0;
                                            if (kind === 'hours') riesgoMap[it.nombre].sumHoras += v;
                                            else if (kind === 'days') {
                                                riesgoMap[it.nombre].sumDias += getDiasEfectivosNovedad(it.tipoNovedad, it.cantidadHoras, it.fechaInicio, it.fechaFin);
                                            }
                                            riesgoMap[it.nombre].novedades += 1;
                                            const tipoNorm = String(it.tipoNovedad || '').toLowerCase();
                                            if (tipoNorm.includes('incapacidad')) riesgoMap[it.nombre].puntos += 5;
                                            else if (tipoNorm.includes('extra')) riesgoMap[it.nombre].puntos += 3;
                                            else riesgoMap[it.nombre].puntos += 1;
                                        });
                                        const ranking = Object.keys(riesgoMap)
                                            .map(k => ({ nombre: k, ...riesgoMap[k] }))
                                            .sort((a, b) => b.puntos - a.puntos)
                                            .slice(0, 5);
                                        if (ranking.length === 0) return <p className={`text-center ${dash.muted}`}>Datos insuficientes para evaluación.</p>;
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
                                                            <p className={`${dash.riesgoNombre} leading-tight`}>{r.nombre}</p>
                                                            <p className={`text-xs ${dash.modalMuted}`}>
                                                                {r.novedades} novedad{r.novedades !== 1 ? 'es' : ''}
                                                                {' · '}
                                                                {(() => {
                                                                    const parts = [];
                                                                    if (r.sumHoras > 0) parts.push(`${r.sumHoras}h`);
                                                                    if (r.sumDias > 0) parts.push(formatDiasCount(r.sumDias));
                                                                    return parts.length ? parts.join(' · ') : 'sin horas/días acumulados';
                                                                })()}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1">
                                                        <span className={`text-[10px] uppercase tracking-widest font-black px-2 py-0.5 rounded border ${badgeCls}`}>
                                                            {label}
                                                        </span>
                                                        <span className={`text-[10px] font-semibold ${isLight ? 'text-slate-500' : 'text-slate-600'}`}>{r.puntos} pts</span>
                                                    </div>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>

                            {/* Eficiencia del Flujo de Trabajo (Funnel) */}
                            <div className={`${dash.card} p-6 lg:col-span-2`}>
                                <h3 className={`${dash.titleXl} mb-1`}>Eficiencia del Flujo de Trabajo (Funnel)</h3>
                                <p className={`mb-5 text-xs ${dash.muted}`}>
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
                                            <CartesianGrid strokeDasharray="3 3" stroke={dash.chGrid} opacity={0.3} horizontal={false} />
                                            <XAxis type="number" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                                            <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} width={130} />
                                            <Tooltip
                                                cursor={{ fill: isLight ? '#cbd5e1' : '#334155', opacity: 0.15 }}
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
                                                        <div className={dash.tooltipPanel}>
                                                            <p className={`mb-1 font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{name}</p>
                                                            <p className={isLight ? 'text-slate-700' : 'text-slate-300'}>{count} registro{count !== 1 ? 's' : ''}</p>
                                                            <p className={`text-xs ${dash.muted}`}>{pct}% del total radicado</p>
                                                            <p className={`mt-1 text-xs font-semibold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>{tip}</p>
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
                                <p className={dash.legendFoot}>Base para optimización de SLA de respuesta — Grupo CINTE</p>
                            </div>

                        </div>
                    </div>
                )}


            </main>

            {/* Chat widget — fuera del main para que sea fixed global */}
            <ChatWidget
                ctx={{
                    pendientesCount,
                    totalItems: items.length,
                    dashItems: dashItems.length,
                    role: currentRole,
                }}
            />

            {gestionDetailItem && (
                <div className={dash.modalBackdrop} onClick={closeGestionDetailModal}>
                    <div className={`${dash.modalCard} relative`} onClick={(e) => e.stopPropagation()}>
                        <div className={dash.modalHeadBorder}>
                            <div>
                                <h2 className={dash.title2xl}>Detalle de novedad</h2>
                                <p className={`${dash.modalMuted} mt-1 text-sm`}>{gestionDetailItem.tipoNovedad} · {gestionDetailItem.estado}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {isSuperAdminNovedades && !gestionEditMode ? (
                                    <>
                                        {gestionMostrarEditar ? (
                                        <button
                                            type="button"
                                            disabled={gestionAdminBusy}
                                            onClick={() => {
                                                setGestionAdminErr(null);
                                                setGestionEditDraft(buildGestionEditDraft(gestionDetailItem));
                                                setGestionEditMode(true);
                                            }}
                                            className={
                                                isLight
                                                    ? 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50'
                                                    : 'inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50'
                                            }
                                        >
                                            Editar
                                        </button>
                                        ) : null}
                                        <button
                                            type="button"
                                            disabled={gestionAdminBusy}
                                            onClick={() => {
                                                setGestionAdminErr(null);
                                                setGestionDeleteMotivo('');
                                                setGestionDeleteOpen(true);
                                            }}
                                            className={
                                                isLight
                                                    ? 'inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50'
                                                    : 'inline-flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-slate-800 px-3 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50'
                                            }
                                        >
                                            <Trash2 size={16} /> Eliminar
                                        </button>
                                    </>
                                ) : null}
                                {gestionEditMode ? (
                                    <button
                                        type="button"
                                        disabled={gestionAdminBusy}
                                        onClick={() => {
                                            setGestionEditMode(false);
                                            setGestionEditDraft(null);
                                            setGestionAdminErr(null);
                                        }}
                                        className={
                                            isLight
                                                ? 'rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50'
                                                : 'rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50'
                                        }
                                    >
                                        Cancelar edición
                                    </button>
                                ) : null}
                                <button type="button" onClick={closeGestionDetailModal} className={dash.modalClose}>
                                    <X size={20} strokeWidth={2.5} />
                                </button>
                            </div>
                        </div>

                        {gestionAdminErr ? (
                            <p className={isLight ? 'mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800' : 'mb-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200'}>
                                {gestionAdminErr}
                            </p>
                        ) : null}

                        {!gestionEditMode ? (
                        <div className={dash.modalGrid}>
                            <div><span className={dash.modalMuted}>Nombre:</span> {gestionDetailItem.nombre}</div>
                            <div><span className={dash.modalMuted}>Cédula:</span> {gestionDetailItem.cedula}</div>
                            <div><span className={dash.modalMuted}>Correo:</span> {gestionDetailItem.correoSolicitante || '-'}</div>
                            <div><span className={dash.modalMuted}>Cliente:</span> {gestionDetailItem.cliente || '-'}</div>
                            <div><span className={dash.modalMuted}>Líder:</span> {gestionDetailItem.lider || '-'}</div>
                            <div><span className={dash.modalMuted}>Estado:</span> {gestionDetailItem.estado}</div>
                            <div><span className={dash.modalMuted}>Asignado a (roles):</span> {asignacionEtiquetaForItem(gestionDetailItem)}</div>
                            {gestionDetailItem.estado === 'Aprobado' && (
                                <div><span className={dash.modalMuted}>Aprobado por (correo):</span> {correoAprobadoMostrar(gestionDetailItem)}</div>
                            )}
                            {gestionDetailItem.estado === 'Rechazado' && (
                                <div><span className={dash.modalMuted}>Rechazado por (correo):</span> {correoRechazadoMostrar(gestionDetailItem)}</div>
                            )}
                            <div><span className={dash.modalMuted}>Fecha inicio:</span> {gestionDetailItem.fechaInicio || '-'}</div>
                            <div><span className={dash.modalMuted}>Fecha fin:</span> {gestionDetailItem.fechaFin || '-'}</div>
                            {resolveCanonicalNovedadTipo(gestionDetailItem.tipoNovedad) !== 'Hora Extra' && (
                                <div><span className={dash.modalMuted}>{getCantidadDetalleEtiqueta(gestionDetailItem.tipoNovedad)}:</span> {formatCantidadNovedad(gestionDetailItem.tipoNovedad, gestionDetailItem.cantidadHoras, gestionDetailItem)}</div>
                            )}
                            {gestionDetailItem.alertaHeResueltaEstado ? (
                                <div
                                    className={
                                        isLight
                                            ? 'md:col-span-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-950'
                                            : 'md:col-span-2 rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-3 py-2 text-cyan-100'
                                    }
                                >
                                    Alerta HE gestionada: {gestionDetailItem.alertaHeResueltaEstado}
                                </div>
                            ) : null}
                            {(() => {
                                const heDomingoCompResumen = formatHeDomingoCompGestionResumen(
                                    gestionDetailItem.heDomingoObservacion
                                );
                                return heDomingoCompResumen ? (
                                    <div
                                        className={
                                            isLight
                                                ? 'md:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950'
                                                : 'md:col-span-2 rounded-lg border border-emerald-500/35 bg-emerald-950/25 px-3 py-2 text-sm text-emerald-100'
                                        }
                                    >
                                        <span className="font-semibold">Compensación dominical:</span> {heDomingoCompResumen}
                                    </div>
                                ) : null;
                            })()}

                            {resolveCanonicalNovedadTipo(gestionDetailItem.tipoNovedad) === 'Hora Extra' && gestionHeDetailFranjas && (
                                <div
                                    className={
                                        isLight
                                            ? 'md:col-span-2 mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-4'
                                            : 'md:col-span-2 mt-2 rounded-2xl border border-cyan-500/30 bg-slate-900/60 p-4'
                                    }
                                >
                                    <div className="flex flex-col gap-3">
                                        {(Number(gestionDetailItem.horasRecargoDomingoDiurnas ?? 0) > 0 ||
                                            Number(gestionDetailItem.horasRecargoDomingoNocturnas ?? 0) > 0) && (
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {Number(gestionDetailItem.horasRecargoDomingoDiurnas ?? 0) > 0 ? (
                                                    <div
                                                        className={
                                                            isLight
                                                                ? 'flex flex-col items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-amber-950'
                                                                : 'flex flex-col items-center gap-1 rounded-xl border border-amber-500/45 bg-amber-500/10 p-3 text-center'
                                                        }
                                                    >
                                                        <span
                                                            className={
                                                                isLight
                                                                    ? 'text-[10px] font-black uppercase leading-tight tracking-widest text-amber-900'
                                                                    : 'text-[10px] font-black uppercase leading-tight tracking-widest text-amber-200'
                                                            }
                                                        >
                                                            Recargo dominical/festivos — diurno
                                                        </span>
                                                        <span
                                                            className={
                                                                isLight
                                                                    ? 'text-[10px] font-semibold normal-case tracking-normal text-amber-800'
                                                                    : 'text-[10px] font-semibold normal-case tracking-normal text-amber-100/80'
                                                            }
                                                        >
                                                            {gestionHeDetailFranjas.recargoDiurnaFranja}
                                                        </span>
                                                        <span
                                                            className={
                                                                isLight ? 'text-xl font-black text-amber-950' : 'text-xl font-black text-amber-300'
                                                            }
                                                        >
                                                            {Number(gestionDetailItem.horasRecargoDomingoDiurnas ?? 0)}h
                                                        </span>
                                                    </div>
                                                ) : null}
                                                {Number(gestionDetailItem.horasRecargoDomingoNocturnas ?? 0) > 0 ? (
                                                    <div
                                                        className={
                                                            isLight
                                                                ? 'flex flex-col items-center gap-1 rounded-xl border border-orange-200 bg-orange-50 p-3 text-center text-orange-950'
                                                                : 'flex flex-col items-center gap-1 rounded-xl border border-orange-500/40 bg-orange-950/30 p-3 text-center'
                                                        }
                                                    >
                                                        <span
                                                            className={
                                                                isLight
                                                                    ? 'text-[10px] font-black uppercase leading-tight tracking-widest text-orange-900'
                                                                    : 'text-[10px] font-black uppercase leading-tight tracking-widest text-orange-200'
                                                            }
                                                        >
                                                            Recargo dominical/festivos — nocturno
                                                        </span>
                                                        <span
                                                            className={
                                                                isLight
                                                                    ? 'text-[10px] font-semibold normal-case tracking-normal text-orange-800'
                                                                    : 'text-[10px] font-semibold normal-case tracking-normal text-orange-100/80'
                                                            }
                                                        >
                                                            {gestionHeDetailFranjas.recargoNoctFranja}
                                                        </span>
                                                        <span
                                                            className={
                                                                isLight ? 'text-xl font-black text-orange-950' : 'text-xl font-black text-orange-300'
                                                            }
                                                        >
                                                            {Number(gestionDetailItem.horasRecargoDomingoNocturnas ?? 0)}h
                                                        </span>
                                                    </div>
                                                ) : null}
                                            </div>
                                        )}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div
                                                className={
                                                    isLight
                                                        ? 'flex flex-col items-center gap-1 rounded-xl border border-cyan-200 bg-cyan-50 p-3'
                                                        : 'flex flex-col items-center gap-1 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3'
                                                }
                                            >
                                                <span
                                                    className={
                                                        isLight
                                                            ? 'text-center text-[10px] font-bold uppercase leading-tight tracking-widest text-cyan-950'
                                                            : 'text-center text-[10px] font-bold uppercase leading-tight tracking-widest text-cyan-200'
                                                    }
                                                >
                                                    Hora extra diurna
                                                </span>
                                                <span
                                                    className={
                                                        isLight
                                                            ? 'text-center text-[9px] leading-tight text-cyan-800'
                                                            : 'text-center text-[9px] leading-tight text-cyan-100/85'
                                                    }
                                                >
                                                    Franjas Bogotá: laboral y exceso dominical/festivos
                                                </span>
                                                <span
                                                    className={
                                                        isLight
                                                            ? 'text-center text-[10px] font-semibold normal-case tracking-normal text-cyan-900'
                                                            : 'text-center text-[10px] font-semibold normal-case tracking-normal text-cyan-100/90'
                                                    }
                                                >
                                                    {gestionHeDetailFranjas.heDiurnaFranja}
                                                </span>
                                                <span
                                                    className={
                                                        isLight ? 'text-xl font-black text-cyan-950' : 'text-xl font-black text-cyan-300'
                                                    }
                                                >
                                                    {Number(gestionDetailItem.horasDiurnas ?? 0)}h
                                                </span>
                                            </div>
                                            <div
                                                className={
                                                    isLight
                                                        ? 'flex flex-col items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 p-3'
                                                        : 'flex flex-col items-center gap-1 rounded-xl border border-indigo-500/35 bg-indigo-500/10 p-3'
                                                }
                                            >
                                                <span
                                                    className={
                                                        isLight
                                                            ? 'text-center text-[10px] font-bold uppercase leading-tight tracking-widest text-indigo-950'
                                                            : 'text-center text-[10px] font-bold uppercase leading-tight tracking-widest text-indigo-200'
                                                    }
                                                >
                                                    Hora extra nocturna
                                                </span>
                                                <span
                                                    className={
                                                        isLight
                                                            ? 'text-center text-[9px] leading-tight text-indigo-800'
                                                            : 'text-center text-[9px] leading-tight text-indigo-100/85'
                                                    }
                                                >
                                                    Franjas Bogotá: laboral y exceso dominical/festivos
                                                </span>
                                                <span
                                                    className={
                                                        isLight
                                                            ? 'text-center text-[10px] font-semibold normal-case tracking-normal text-indigo-900'
                                                            : 'text-center text-[10px] font-semibold normal-case tracking-normal text-indigo-100/90'
                                                    }
                                                >
                                                    {gestionHeDetailFranjas.heNoctFranja}
                                                </span>
                                                <span
                                                    className={
                                                        isLight ? 'text-xl font-black text-indigo-950' : 'text-xl font-black text-indigo-300'
                                                    }
                                                >
                                                    {Number(gestionDetailItem.horasNocturnas ?? 0)}h
                                                </span>
                                            </div>
                                            <div
                                                className={
                                                    isLight
                                                        ? 'rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950'
                                                        : 'rounded-xl border border-emerald-500/35 bg-emerald-500/10 p-3 text-sm text-emerald-100'
                                                }
                                            >
                                                <div>
                                                    <span className={isLight ? 'font-semibold text-emerald-900' : 'font-semibold text-emerald-300'}>
                                                        Horas cargadas:
                                                    </span>{' '}
                                                    {gestionDetailItem.cantidadHoras || 0}h
                                                </div>
                                                <div>
                                                    <span className={isLight ? 'font-semibold text-emerald-900' : 'font-semibold text-emerald-300'}>
                                                        Franja cargada:
                                                    </span>{' '}
                                                    {(gestionDetailItem.horaInicio && gestionDetailItem.horaFin)
                                                        ? `${gestionDetailItem.horaInicio} - ${gestionDetailItem.horaFin}`
                                                        : '-'}
                                                </div>
                                                <div>
                                                    <span className={isLight ? 'font-semibold text-emerald-900' : 'font-semibold text-emerald-300'}>
                                                        Fecha inicio:
                                                    </span>{' '}
                                                    {gestionDetailItem.fechaInicio || '-'}
                                                </div>
                                                <div>
                                                    <span className={isLight ? 'font-semibold text-emerald-900' : 'font-semibold text-emerald-300'}>
                                                        Fecha fin:
                                                    </span>{' '}
                                                    {gestionDetailItem.fechaFin || '-'}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        ) : (
                        gestionEditDraft && (
                            <div className={`${dash.modalGrid} max-h-[52vh] overflow-y-auto custom-scrollbar`}>
                                <label className={`${dash.labelUpper} col-span-full`}>Nombre
                                    <input className={`mt-1 w-full ${fieldInput}`} value={gestionEditDraft.nombre} onChange={(e) => setGestionEditDraft((d) => ({ ...d, nombre: e.target.value }))} />
                                </label>
                                <label className={`${dash.labelUpper} col-span-full`}>Cédula
                                    <input className={`mt-1 w-full ${fieldInput}`} value={gestionEditDraft.cedula} onChange={(e) => setGestionEditDraft((d) => ({ ...d, cedula: e.target.value }))} />
                                </label>
                                <label className={`${dash.labelUpper} col-span-full`}>Correo solicitante
                                    <input className={`mt-1 w-full ${fieldInput}`} type="email" value={gestionEditDraft.correoSolicitante} onChange={(e) => setGestionEditDraft((d) => ({ ...d, correoSolicitante: e.target.value }))} />
                                </label>
                                <label className={`${dash.labelUpper} col-span-full`}>Cliente
                                    <input className={`mt-1 w-full ${fieldInput}`} value={gestionEditDraft.cliente} onChange={(e) => setGestionEditDraft((d) => ({ ...d, cliente: e.target.value }))} />
                                </label>
                                <label className={`${dash.labelUpper} col-span-full`}>Líder
                                    <input className={`mt-1 w-full ${fieldInput}`} value={gestionEditDraft.lider} onChange={(e) => setGestionEditDraft((d) => ({ ...d, lider: e.target.value }))} />
                                </label>
                                <label className={`${dash.labelUpper} col-span-full`}>GP asociado
                                    <select className={`mt-1 w-full ${fieldInput}`} value={gestionEditDraft.gpUserId || ''} onChange={(e) => setGestionEditDraft((d) => ({ ...d, gpUserId: e.target.value }))}>
                                        <option value="">Sin GP</option>
                                        {gpFilterOptions.map((g) => {
                                            const id = String(g.id || '');
                                            const label = labelGpDirectorioOption(g);
                                            return (
                                                <option key={id} value={id}>{label}</option>
                                            );
                                        })}
                                    </select>
                                </label>
                                <label className={`${dash.labelUpper} col-span-full`}>Tipo novedad
                                    <select className={`mt-1 w-full ${fieldInput}`} value={gestionEditDraft.tipoNovedad} onChange={(e) => setGestionEditDraft((d) => ({ ...d, tipoNovedad: e.target.value }))}>
                                        {NOVEDAD_TYPES.map((t) => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                </label>
                                <label className={`${dash.labelUpper} col-span-full`}>Área
                                    <select className={`mt-1 w-full ${fieldInput}`} value={gestionEditDraft.area} onChange={(e) => setGestionEditDraft((d) => ({ ...d, area: e.target.value }))}>
                                        <option value="Global">Global</option>
                                        <option value="Capital Humano">Capital Humano</option>
                                        <option value="Operaciones">Operaciones</option>
                                    </select>
                                </label>
                                <label className={`${dash.labelUpper} col-span-full`}>Estado
                                    <select className={`mt-1 w-full ${fieldInput}`} value={gestionEditDraft.estado} onChange={(e) => setGestionEditDraft((d) => ({ ...d, estado: e.target.value }))}>
                                        <option value="Pendiente">Pendiente</option>
                                        <option value="Aprobado">Aprobado</option>
                                        <option value="Rechazado">Rechazado</option>
                                    </select>
                                </label>
                                <label className={`${dash.labelUpper} col-span-full`}>Fecha (HE)
                                    <input className={`mt-1 w-full ${fieldInput}`} type="date" value={gestionEditDraft.fecha} onChange={(e) => setGestionEditDraft((d) => ({ ...d, fecha: e.target.value }))} />
                                </label>
                                <label className={`${dash.labelUpper} col-span-full`}>Hora inicio / fin (HE)
                                    <div className="mt-1 flex gap-2">
                                        <input className={`flex-1 ${fieldInput}`} type="time" value={gestionEditDraft.horaInicio} onChange={(e) => setGestionEditDraft((d) => ({ ...d, horaInicio: e.target.value }))} />
                                        <input className={`flex-1 ${fieldInput}`} type="time" value={gestionEditDraft.horaFin} onChange={(e) => setGestionEditDraft((d) => ({ ...d, horaFin: e.target.value }))} />
                                    </div>
                                </label>
                                <label className={`${dash.labelUpper} col-span-full`}>Fecha inicio
                                    <input className={`mt-1 w-full ${fieldInput}`} type="date" value={gestionEditDraft.fechaInicio} onChange={(e) => setGestionEditDraft((d) => ({ ...d, fechaInicio: e.target.value }))} />
                                </label>
                                <label className={`${dash.labelUpper} col-span-full`}>Fecha fin
                                    <input className={`mt-1 w-full ${fieldInput}`} type="date" value={gestionEditDraft.fechaFin} onChange={(e) => setGestionEditDraft((d) => ({ ...d, fechaFin: e.target.value }))} />
                                </label>
                                <label className={`${dash.labelUpper} col-span-full`}>Cantidad / horas total
                                    <input className={`mt-1 w-full ${fieldInput}`} type="number" step="0.01" min="0" value={gestionEditDraft.cantidadHoras} onChange={(e) => setGestionEditDraft((d) => ({ ...d, cantidadHoras: e.target.value }))} />
                                </label>
                                <label className={dash.labelUpper}>Horas diurnas
                                    <input className={`mt-1 w-full ${fieldInput}`} type="number" step="0.01" min="0" value={gestionEditDraft.horasDiurnas} onChange={(e) => setGestionEditDraft((d) => ({ ...d, horasDiurnas: e.target.value }))} />
                                </label>
                                <label className={dash.labelUpper}>Horas nocturnas
                                    <input className={`mt-1 w-full ${fieldInput}`} type="number" step="0.01" min="0" value={gestionEditDraft.horasNocturnas} onChange={(e) => setGestionEditDraft((d) => ({ ...d, horasNocturnas: e.target.value }))} />
                                </label>
                                <label className={dash.labelUpper}>Recargo domingo (total)
                                    <input className={`mt-1 w-full ${fieldInput}`} type="number" step="0.01" min="0" value={gestionEditDraft.horasRecargoDomingo} onChange={(e) => setGestionEditDraft((d) => ({ ...d, horasRecargoDomingo: e.target.value }))} />
                                </label>
                                <label className={dash.labelUpper}>Recargo domingo diurnas
                                    <input className={`mt-1 w-full ${fieldInput}`} type="number" step="0.01" min="0" value={gestionEditDraft.horasRecargoDomingoDiurnas} onChange={(e) => setGestionEditDraft((d) => ({ ...d, horasRecargoDomingoDiurnas: e.target.value }))} />
                                </label>
                                <label className={dash.labelUpper}>Recargo domingo nocturnas
                                    <input className={`mt-1 w-full ${fieldInput}`} type="number" step="0.01" min="0" value={gestionEditDraft.horasRecargoDomingoNocturnas} onChange={(e) => setGestionEditDraft((d) => ({ ...d, horasRecargoDomingoNocturnas: e.target.value }))} />
                                </label>
                                <label className={`${dash.labelUpper} col-span-full`}>Tipo hora extra
                                    <input className={`mt-1 w-full ${fieldInput}`} value={gestionEditDraft.tipoHoraExtra} onChange={(e) => setGestionEditDraft((d) => ({ ...d, tipoHoraExtra: e.target.value }))} />
                                </label>
                                <label className={`${dash.labelUpper} col-span-full`}>Monto COP
                                    <input className={`mt-1 w-full ${fieldInput}`} value={gestionEditDraft.montoCop} onChange={(e) => setGestionEditDraft((d) => ({ ...d, montoCop: e.target.value }))} />
                                </label>
                                <label className={`${dash.labelUpper} col-span-full`}>Compensación HE (observación)
                                    <textarea className={`mt-1 min-h-[72px] w-full ${fieldInput}`} value={gestionEditDraft.heDomingoObservacion} onChange={(e) => setGestionEditDraft((d) => ({ ...d, heDomingoObservacion: e.target.value }))} />
                                </label>
                                <label className={`${dash.labelUpper} col-span-full`}>Soporte(s) — ruta o JSON
                                    <textarea className={`mt-1 min-h-[56px] w-full font-mono text-xs ${fieldInput}`} value={gestionEditDraft.soporteRuta} onChange={(e) => setGestionEditDraft((d) => ({ ...d, soporteRuta: e.target.value }))} />
                                </label>
                            </div>
                        )
                        )}

                        {!gestionEditMode ? (
                        <div className={isLight ? 'mt-5 border-t border-slate-200 pt-4' : 'mt-5 border-t border-slate-700/50 pt-4'}>
                            <h3 className={isLight ? 'mb-3 text-sm font-bold uppercase tracking-wider text-slate-600' : 'mb-3 text-sm font-bold uppercase tracking-wider text-slate-400'}>
                                Soportes
                            </h3>
                            {buildSupportList(gestionDetailItem).length === 0 ? (
                                <p className={isLight ? 'text-sm text-slate-600' : 'text-sm text-slate-500'}>Sin soportes adjuntos.</p>
                            ) : (
                                <div className="flex flex-wrap gap-2">
                                    {buildSupportList(gestionDetailItem).map((support) => (
                                        <div
                                            key={support.id}
                                            className={
                                                isLight
                                                    ? 'inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 shadow-sm transition-all hover:border-sky-300 hover:bg-sky-50/80'
                                                    : 'inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs transition-all hover:border-blue-500/50'
                                            }
                                        >
                                            <button
                                                type="button"
                                                onClick={() => openSupport(gestionDetailItem, support)}
                                                className={
                                                    isLight
                                                        ? 'inline-flex items-center gap-2 rounded-lg border-none bg-transparent px-0 py-0 text-slate-800 hover:text-sky-800'
                                                        : 'inline-flex items-center gap-2 rounded-lg border-none bg-transparent px-0 py-0 hover:text-blue-300'
                                                }
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
                                                className={
                                                    isLight
                                                        ? 'rounded-lg border border-sky-300 bg-white px-2 py-1 text-sky-800 transition-all hover:border-sky-500 hover:bg-sky-100'
                                                        : 'rounded-lg border border-blue-500/30 px-2 py-1 text-blue-300 transition-all hover:border-blue-500/50 hover:bg-blue-500/10'
                                                }
                                            >
                                                Descargar
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        ) : null}

                        <div className={dash.modalFooter}>
                            <button type="button" onClick={closeGestionDetailModal} className={`${outlineBtn} text-sm`}>Cerrar</button>
                            {gestionEditMode && isSuperAdminNovedades ? (
                                <button
                                    type="button"
                                    disabled={gestionAdminBusy}
                                    onClick={() => void submitGestionAdminPatch()}
                                    className={
                                        isLight
                                            ? 'rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50'
                                            : 'rounded-lg border border-sky-500 bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50'
                                    }
                                >
                                    {gestionAdminBusy ? 'Guardando…' : 'Guardar cambios'}
                                </button>
                            ) : null}
                            {!gestionEditMode && canApproveItem(gestionDetailItem) && (
                                <>
                                    <button
                                        type="button"
                                        onClick={async () => { await changeState(gestionDetailItem.id || gestionDetailItem.creadoEn, 'Rechazado'); closeGestionDetailModal(); }}
                                        className={
                                            isLight
                                                ? 'rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 transition-all hover:bg-rose-50'
                                                : 'rounded-lg border border-rose-500/40 px-4 py-2 text-sm text-rose-400 transition-all hover:bg-rose-500/10'
                                        }
                                    >
                                        Rechazar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={async () => { await changeState(gestionDetailItem.id || gestionDetailItem.creadoEn, 'Aprobado'); closeGestionDetailModal(); }}
                                        className={
                                            isLight
                                                ? 'rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition-all hover:bg-emerald-50'
                                                : 'rounded-lg border border-emerald-500/40 px-4 py-2 text-sm text-emerald-400 transition-all hover:bg-emerald-500/10'
                                        }
                                    >
                                        Aceptar
                                    </button>
                                </>
                            )}
                        </div>

                        {gestionDeleteOpen && (
                            <div
                                className="absolute inset-0 z-[70] flex items-center justify-center rounded-2xl bg-slate-900/50 p-4"
                                onClick={(e) => e.stopPropagation()}
                                role="presentation"
                            >
                                <div
                                    className={isLight ? 'w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl' : 'w-full max-w-md rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-xl'}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <h3 className={dash.titleLg}>Eliminar novedad</h3>
                                    <p className={`${dash.modalMuted} mt-2 text-sm`}>Indique el motivo de la eliminación. Es obligatorio.</p>
                                    <textarea
                                        className={`mt-3 min-h-[100px] w-full ${fieldInput}`}
                                        placeholder="Motivo de eliminación…"
                                        value={gestionDeleteMotivo}
                                        onChange={(e) => setGestionDeleteMotivo(e.target.value)}
                                        disabled={gestionAdminBusy}
                                    />
                                    {gestionAdminErr ? <p className="mt-2 text-sm text-rose-600">{gestionAdminErr}</p> : null}
                                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                                        <button
                                            type="button"
                                            disabled={gestionAdminBusy}
                                            onClick={() => {
                                                setGestionDeleteOpen(false);
                                                setGestionDeleteMotivo('');
                                                setGestionAdminErr(null);
                                            }}
                                            className={`${outlineBtn} text-sm`}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            disabled={gestionAdminBusy || !String(gestionDeleteMotivo || '').trim()}
                                            onClick={() => void submitGestionAdminDelete()}
                                            className={
                                                isLight
                                                    ? 'rounded-lg border border-rose-600 bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-40'
                                                    : 'rounded-lg border border-rose-500 bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-40'
                                            }
                                        >
                                            {gestionAdminBusy ? 'Eliminando…' : 'Eliminar'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {alertaHeDetailItem && (
                <div className={dash.modalBackdrop} onClick={() => setAlertaHeDetailItem(null)}>
                    <div className={dash.modalCardMd} onClick={(e) => e.stopPropagation()}>
                        <div className={dash.modalHeadBorder}>
                            <div>
                                <h2 className={dash.title2xl}>Detalle alerta HE</h2>
                                <p className={`${dash.modalMuted} mt-1 text-sm`}>{alertaHeDetailItem.nombre} ({alertaHeDetailItem.cedula})</p>
                            </div>
                            <button type="button" onClick={() => setAlertaHeDetailItem(null)} className={dash.modalClose}>
                                <X size={20} strokeWidth={2.5} />
                            </button>
                        </div>
                        <div className={dash.modalGrid}>
                            <div><span className={dash.modalMuted}>Cliente:</span> {alertaHeDetailItem.cliente || '-'}</div>
                            <div><span className={dash.modalMuted}>Líder:</span> {alertaHeDetailItem.lider || '-'}</div>
                            <div><span className={dash.modalMuted}>Fecha inicio:</span> {alertaHeDetailItem.fechaInicio || '-'}</div>
                            <div><span className={dash.modalMuted}>Fecha fin:</span> {alertaHeDetailItem.fechaFin || '-'}</div>
                            <div><span className={dash.modalMuted}>Franja cargada:</span> {(alertaHeDetailItem.horaInicio && alertaHeDetailItem.horaFin) ? `${alertaHeDetailItem.horaInicio} - ${alertaHeDetailItem.horaFin}` : '-'}</div>
                            <div><span className={dash.modalMuted}>Horas cargadas:</span> {alertaHeDetailItem.cantidadHoras || 0}h</div>
                            {Array.isArray(alertaHeDetailItem.dailyReasons) && alertaHeDetailItem.dailyReasons.length > 0 && (
                                <div
                                    className={
                                        isLight
                                            ? 'md:col-span-2 rounded-lg border border-cyan-200 bg-cyan-50 p-3'
                                            : 'md:col-span-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3'
                                    }
                                >
                                    <p className={isLight ? 'text-sm font-semibold text-cyan-950' : 'text-sm font-semibold text-cyan-100'}>
                                        Conteo diario excedido
                                    </p>
                                    {alertaHeDetailItem.dailyReasons.map((r) => (
                                        <p key={`d-${r.date}`} className={isLight ? 'mt-1 text-xs text-cyan-900' : 'mt-1 text-xs text-cyan-100/95'}>
                                            {r.date}: {r.totalHours}h (tope {r.limitHours}h, exceso {r.exceededByHours}h)
                                        </p>
                                    ))}
                                </div>
                            )}
                            {Array.isArray(alertaHeDetailItem.monthlyReasons) && alertaHeDetailItem.monthlyReasons.length > 0 && (
                                <div
                                    className={
                                        isLight
                                            ? 'md:col-span-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3'
                                            : 'md:col-span-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 p-3'
                                    }
                                >
                                    <p className={isLight ? 'text-sm font-semibold text-indigo-950' : 'text-sm font-semibold text-indigo-100'}>
                                        Conteo mensual excedido
                                    </p>
                                    {alertaHeDetailItem.monthlyReasons.map((r) => (
                                        <p key={`m-${r.month}`} className={isLight ? 'mt-1 text-xs text-indigo-900' : 'mt-1 text-xs text-indigo-100/95'}>
                                            {r.month}: {r.totalHours}h (tope {r.limitHours}h, exceso {r.exceededByHours}h)
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className={dash.modalFooter}>
                            <button type="button" onClick={() => setAlertaHeDetailItem(null)} className={`${outlineBtn} text-sm`}>Cerrar</button>
                            <button
                                type="button"
                                onClick={async () => {
                                    await changeState(alertaHeDetailItem.id, 'Rechazado', { fromHoraExtraAlert: true });
                                    setAlertaHeDetailItem(null);
                                }}
                                className={
                                    isLight
                                        ? 'rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-800 transition-all hover:bg-rose-50'
                                        : 'rounded-lg border border-rose-500/40 px-4 py-2 text-sm text-rose-400 transition-all hover:bg-rose-500/10'
                                }
                            >
                                Rechazar
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    await changeState(alertaHeDetailItem.id, 'Aprobado', { fromHoraExtraAlert: true });
                                    setAlertaHeDetailItem(null);
                                }}
                                className={
                                    isLight
                                        ? 'rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition-all hover:bg-emerald-50'
                                        : 'rounded-lg border border-emerald-500/40 px-4 py-2 text-sm text-emerald-400 transition-all hover:bg-emerald-500/10'
                                }
                            >
                                Aprobar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Detalle de Día */}
            {selectedDayItems && (
                <div className={`${dash.modalBackdrop} tracking-wide`} onClick={() => setSelectedDayItems(null)}>
                    <div className={dash.modalCardDay} onClick={e => e.stopPropagation()}>
                        <div className={`${dash.modalHeadBorder} mb-6`}>
                            <div>
                                <h2 className={`${dash.title2xl} flex items-center gap-3`}>
                                    <Calendar className="text-blue-500" size={24} /> Novedades del Día
                                </h2>
                                <p className={`${dash.modalMuted} mt-1 text-sm font-semibold uppercase tracking-widest`}>
                                    {selectedDayItems.date.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                                </p>
                            </div>
                            <button type="button" onClick={() => setSelectedDayItems(null)} className={dash.modalClose}>
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
                                            <h3 className={dash.dayItemTitle}>{it.nombre}</h3>
                                            <div className="mt-1 flex items-center gap-2">
                                                <span className={dash.dayPill}>{it.tipoNovedad}</span>
                                                <span className={`${dash.dayMeta} flex items-center gap-1`}><Briefcase size={12} /> Cédula: {it.cedula}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={dash.daySide}>
                                        <div className={`${dash.daySideText} font-medium`}>
                                            {it.fechaInicio ? `Del ${it.fechaInicio}` : ''} {it.fechaFin ? `al ${it.fechaFin}` : ''}
                                            {!it.fechaInicio && !it.fechaFin ? 'Fecha no especificada' : ''}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {(() => {
                                                const qtyTxt = formatCantidadNovedad(it.tipoNovedad, it.cantidadHoras, it);
                                                if (qtyTxt === '—') return null;
                                                return (
                                                    <span className={isLight ? 'text-xs font-bold text-blue-800' : 'text-xs font-bold text-blue-400'}>
                                                        {qtyTxt}
                                                        {getCantidadMedidaKind(it.tipoNovedad) === 'hours' && it.tipoHoraExtra ? ` (${it.tipoHoraExtra})` : ''}
                                                    </span>
                                                );
                                            })()}
                                            <span
                                                className={`rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                                                    it.estado === 'Aprobado'
                                                        ? isLight
                                                            ? 'bg-emerald-100 text-emerald-900'
                                                            : 'bg-emerald-500/10 text-emerald-400'
                                                        : it.estado === 'Rechazado'
                                                            ? isLight
                                                                ? 'bg-rose-100 text-rose-900'
                                                                : 'bg-rose-500/10 text-rose-400'
                                                            : isLight
                                                                ? 'bg-amber-100 text-amber-900'
                                                                : 'bg-amber-500/10 text-amber-400'
                                                }`}
                                            >
                                                {it.estado}
                                            </span>
                                        </div>
                                    </div>

                                    {(it.soporteRuta || it.soporteKey) && (
                                        <button
                                            onClick={() => {
                                                setSelectedDayItems(null);
                                                openSupport(it);
                                            }}
                                            className={
                                                isLight
                                                    ? 'md:ml-2 flex items-center justify-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900 transition-all hover:bg-blue-600 hover:text-white'
                                                    : 'md:ml-2 flex items-center justify-center gap-2 rounded-lg border border-blue-500/30 bg-blue-600/20 px-3 py-2 text-sm font-medium text-blue-400 transition-all hover:bg-blue-600 hover:text-white'
                                            }
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

            {/* Modal Soporte Viewer */}
            {soporteModal && (
                <div className={`${dash.modalBackdrop} tracking-wide`} onClick={() => setSoporteModal(null)}>
                    <div className={dash.modalCardWide} onClick={e => e.stopPropagation()}>
                        <button type="button" onClick={() => setSoporteModal(null)} className={`absolute right-4 top-4 ${dash.modalClose}`}>
                            <X size={20} strokeWidth={2.5} />
                        </button>
                        <div className="mb-4 mt-2 flex w-full items-center justify-between">
                            <h2 className={`${dash.titleXl} flex items-center gap-2`}>
                                <BadgeCheck className="text-blue-500" size={22} /> Vista del documento
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
                        <div className={`relative w-full flex-1 overflow-hidden rounded-xl p-1 md:min-h-[60vh] ${dash.soporteIframe}`}>
                            {soporteLoading ? (
                                <div className={dash.soporteLoading}>Cargando soporte...</div>
                            ) : soporteModal?.currentType === 'pdf' ? (
                                <iframe src={soporteModal.currentUrl} className="w-full h-[65vh] rounded" title="Visor PDF" />
                            ) : soporteModal?.currentType === 'image' ? (
                                <img src={soporteModal?.currentUrl} alt="Soporte" className="w-full h-[65vh] object-contain rounded" />
                            ) : soporteModal?.currentType === 'excel' ? (
                                soporteModal?.excelPreview?.rows?.length ? (
                                    <div className={dash.excelScroll}>
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
