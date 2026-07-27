import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    ChevronLeft,
    ChevronRight,
    Home,
    Menu,
    X,
    Users,
    UserMinus,
    GraduationCap,
    Briefcase,
    Baby,
    Calculator,
    Globe,
    Radio,
    LineChart,
    CalendarPlus,
    Ban,
    Mail
} from 'lucide-react';
import { onboardingApi } from './onboarding/api.js';
import { userHasOnboardingPanel } from './onboarding/onboardingAccess.js';
import { userHasContratacionPanel } from './contratacion/contratacionAccess.js';
import { useModuleTheme } from './moduleTheme.js';
import AdminModuleSidebarBrand from './AdminModuleSidebarBrand.jsx';
import AdminModuleSidebarFooter from './AdminModuleSidebarFooter.jsx';
import AdminModuleSidebarUser from './AdminModuleSidebarUser.jsx';
import OnboardingListView from './onboarding/OnboardingListView.jsx';
import CancelacionesView from './onboarding/CancelacionesView.jsx';
import FichaNovedadesView, { fetchFichaNovedadesPendingCount } from './onboarding/FichaNovedadesView.jsx';
import { EXTRANJEROS_DEFAULT_SORT, LICENCIAS_DEFAULT_SORT } from './onboarding/onboardingSortDefaults.js';
import {
    PersonalView,
    CalculadoraView,
    OnboardingAnalyticsPanel,
    StatusBadge,
    fmtFecha
} from './onboarding/views.jsx';
import {
    LicenciaTipoBadge,
    LicenciaEstadoBadge,
    VencimientoDocBadge
} from './onboarding/onboardingBadges.jsx';
import { ContratacionDashboard } from './ContratacionModule.jsx';

export { userHasOnboardingPanel } from './onboarding/onboardingAccess.js';

/* ---------------------------------------------------------------------------
 * Navegación: dos grupos con encabezado
 *  - Monitor n8n  -> ContratacionDashboard (active / history / metrics)
 *  - Onboarding maestro -> Vistas Personal/Bajas/SENA/.../Rotación
 * ------------------------------------------------------------------------- */

const NAV_GROUPS = [
    {
        id: 'monitor',
        label: 'Monitor n8n',
        scope: 'contratacion',
        items: [
            { id: 'monitor-active', label: 'En ingreso', icon: Radio },
            { id: 'monitor-metrics', label: 'Dashboard General', icon: LineChart }
        ]
    },
    {
        id: 'onboarding',
        label: 'Onboarding maestro',
        scope: 'onboarding',
        items: [
            { id: 'personal', label: 'Personal Activo', icon: Users },
            { id: 'proximos', label: 'Próximos a ingresar', icon: CalendarPlus },
            { id: 'bajas', label: 'Bajas', icon: UserMinus },
            { id: 'sena', label: 'SENA', icon: GraduationCap },
            { id: 'staff', label: 'Staff', icon: Briefcase },
            { id: 'licencias', label: 'Licencias', icon: Baby },
            { id: 'calculadora', label: 'Calculadora', icon: Calculator },
            { id: 'extranjeros', label: 'Extranjeros', icon: Globe },
            { id: 'novedades-zoho', label: 'Novedades Zoho', icon: Mail },
            { id: 'cancelaciones', label: 'Cancelaciones / eliminaciones', icon: Ban }
        ]
    }
];

/** Vistas válidas por scope. Las que llegan en ?v= se validan contra esta lista. */
const VIEW_IDS = new Set(
    NAV_GROUPS.flatMap((g) => g.items.map((it) => it.id))
);

function deriveScope(viewId) {
    return viewId.startsWith('monitor-') ? 'contratacion' : 'onboarding';
}

function firstViewForUser(auth) {
    const canOnboarding = userHasOnboardingPanel(auth);
    const canMonitor = userHasContratacionPanel(auth);
    if (canOnboarding) return 'personal';
    if (canMonitor) return 'monitor-active';
    return 'personal';
}

export default function CapitalHumanoModule({ auth, onLogout }) {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const mt = useModuleTheme();
    const {
        isLight,
        shell,
        aside,
        asideHeaderBorder,
        scrim,
        menuFab,
        sidebarIconBtn,
        navOutline,
        email,
        borderSubtle
    } = mt;
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const canOnboarding = useMemo(() => userHasOnboardingPanel(auth), [auth]);
    const canMonitor = useMemo(() => userHasContratacionPanel(auth), [auth]);

    // Ingresos reales mensuales (Postgres, fecha_ingreso) para el card del Dashboard General.
    const [monitorIngresos, setMonitorIngresos] = useState(null);
    const [zohoPendingCount, setZohoPendingCount] = useState(0);
    useEffect(() => {
        if (!canOnboarding) return undefined;
        let alive = true;
        onboardingApi
            .reporteGraficas(auth?.token || '', {})
            .then((r) => {
                if (alive && Array.isArray(r?.ingresos_by_month)) setMonitorIngresos(r.ingresos_by_month);
            })
            .catch(() => {});
        fetchFichaNovedadesPendingCount(auth?.token || '').then((n) => {
            if (alive) setZohoPendingCount(n);
        });
        return () => {
            alive = false;
        };
    }, [canOnboarding, auth]);

    /** Validamos `?v=` contra los permisos. Si no aplica, caemos a la primera vista permitida. */
    const initialView = useMemo(() => {
        const q = String(searchParams.get('v') || '').trim();
        if (VIEW_IDS.has(q)) {
            const scope = deriveScope(q);
            if (scope === 'contratacion' && !canMonitor) return firstViewForUser(auth);
            if (scope === 'onboarding' && !canOnboarding) return firstViewForUser(auth);
            return q;
        }
        return firstViewForUser(auth);
    }, [searchParams, canMonitor, canOnboarding, auth]);

    const [navView, setNavView] = useState(initialView);

    /** Mantener `?v=` sincronizado con la vista activa, sin sumar entradas al history. */
    useEffect(() => {
        const current = searchParams.get('v');
        if (current !== navView) {
            const next = new URLSearchParams(searchParams);
            next.set('v', navView);
            setSearchParams(next, { replace: true });
        }
    }, [navView, searchParams, setSearchParams]);

    if (!canOnboarding && !canMonitor) {
        return (
            <div className="flex flex-1 items-center justify-center p-8">
                <p className="text-sm text-slate-500">No tienes acceso al módulo Capital Humano.</p>
            </div>
        );
    }

    const handleNav = (id) => {
        if (!VIEW_IDS.has(id)) return;
        setNavView(id);
        setMobileMenuOpen(false);
    };

    /** Grupos visibles según permisos del usuario. */
    const visibleGroups = NAV_GROUPS.filter((g) => {
        if (g.scope === 'contratacion') return canMonitor;
        if (g.scope === 'onboarding') return canOnboarding;
        return true;
    });

    const renderView = () => {
        const token = auth?.token || '';
        if (navView.startsWith('monitor-')) {
            const monitorView = navView.replace('monitor-', '');
            return (
                <ContratacionDashboard
                    auth={auth}
                    currentView={monitorView}
                    onNavigate={(v) => setNavView(`monitor-${v}`)}
                    isLight={isLight}
                    ingresosByMonth={monitorIngresos}
                    metricsExtra={canOnboarding ? <OnboardingAnalyticsPanel auth={auth} isLight={isLight} /> : null}
                />
            );
        }
        switch (navView) {
            case 'personal':
                return (
                    <PersonalView
                        auth={auth}
                        tipoPersonal="consultor"
                        activo="true"
                        isLight={isLight}
                    />
                );
            case 'proximos':
                return (
                    <PersonalView
                        auth={auth}
                        endpointKey="listProximos"
                        activo="true"
                        isLight={isLight}
                    />
                );
            case 'bajas':
                return <PersonalView auth={auth} activo="false" isLight={isLight} />;
            case 'sena':
                return <PersonalView auth={auth} tipoPersonal="sena" isLight={isLight} />;
            case 'staff':
                return <PersonalView auth={auth} tipoPersonal="staff" isLight={isLight} />;
            case 'licencias':
                return (
                    <OnboardingListView
                        isLight={isLight}
                        defaultSort={LICENCIAS_DEFAULT_SORT}
                        fetcher={(params) => onboardingApi.listLicencias(token, params)}
                        searchPlaceholder="Buscar cédula / nombre..."
                        emptyText="Sin licencias registradas para este filtro."
                        filtersConfig={[
                            {
                                id: 'tipo_licencia',
                                paramKey: 'tipo_licencia',
                                label: 'Tipo de licencia',
                                type: 'select',
                                options: [
                                    { value: 'maternidad', label: 'Maternidad' },
                                    { value: 'paternidad', label: 'Paternidad' },
                                    { value: 'lactancia', label: 'Lactancia' }
                                ],
                                summaryFormatter: (v) => `Tipo: ${v}`
                            },
                            {
                                id: 'estado',
                                paramKey: 'estado',
                                label: 'Estado',
                                type: 'select',
                                options: [
                                    { value: 'abierta', label: 'Abierta' },
                                    { value: 'cerrada', label: 'Cerrada' }
                                ],
                                summaryFormatter: (v) => `Estado: ${v}`
                            },
                            { id: 'eps', paramKey: 'eps', label: 'EPS', type: 'text' },
                            { id: 'cliente', paramKey: 'cliente', label: 'Cliente', type: 'text' },
                            {
                                id: 'inicio',
                                paramKeys: { desde: 'inicio_desde', hasta: 'inicio_hasta' },
                                label: 'Rango inicio licencia',
                                type: 'date-range'
                            }
                        ]}
                        columns={[
                            { key: 'cedula', label: 'Cédula' },
                            { key: 'nombre', label: 'Nombre' },
                            { key: 'cliente', label: 'Cliente' },
                            {
                                key: 'tipo_licencia',
                                label: 'Tipo',
                                render: (r) => <LicenciaTipoBadge value={r.tipo_licencia} isLight={isLight} />
                            },
                            { key: 'meses_gestacion', label: 'Meses gest.' },
                            { key: 'parto_fecha_aproximada', label: 'F. parto aprox.', render: (r) => fmtFecha(r.parto_fecha_aproximada) },
                            { key: 'inicio_licencia', label: 'Inicio', render: (r) => fmtFecha(r.inicio_licencia) },
                            { key: 'fin_licencia', label: 'Fin', render: (r) => fmtFecha(r.fin_licencia) },
                            { key: 'eps', label: 'EPS' },
                            {
                                key: 'estado',
                                label: 'Estado',
                                render: (r) => <LicenciaEstadoBadge value={r.estado} isLight={isLight} />
                            }
                        ]}
                    />
                );
            case 'calculadora':
                return <CalculadoraView auth={auth} isLight={isLight} />;
            case 'extranjeros':
                return (
                    <OnboardingListView
                        isLight={isLight}
                        defaultSort={EXTRANJEROS_DEFAULT_SORT}
                        fetcher={(params) => onboardingApi.listExtranjeros(token, params)}
                        searchPlaceholder="Buscar cédula / nombre..."
                        emptyText="Sin documentos para este filtro."
                        filtersConfig={[
                            { id: 'cliente', paramKey: 'cliente', label: 'Cliente', type: 'text' },
                            { id: 'lugar_nacimiento', paramKey: 'lugar_nacimiento', label: 'Lugar de nacimiento (contiene)', type: 'text' },
                            { id: 'tipo_identificacion', paramKey: 'tipo_identificacion', label: 'Tipo de identificación', type: 'text' },
                            { id: 'estado_documento', paramKey: 'estado_documento', label: 'Estado del documento', type: 'text' },
                            {
                                id: 'registro_sire',
                                paramKey: 'registro_sire',
                                label: 'Registro SIRE',
                                type: 'tristate',
                                summaryFormatter: (v) => `SIRE: ${v === 'true' ? 'Sí' : 'No'}`
                            },
                            {
                                id: 'registro_rutec',
                                paramKey: 'registro_rutec',
                                label: 'Registro RUTEC',
                                type: 'tristate',
                                summaryFormatter: (v) => `RUTEC: ${v === 'true' ? 'Sí' : 'No'}`
                            },
                            {
                                id: 'vence',
                                paramKeys: { desde: 'vence_desde', hasta: 'vence_hasta' },
                                label: 'Rango vencimiento',
                                type: 'date-range'
                            }
                        ]}
                        columns={[
                            { key: 'cedula', label: 'Cédula' },
                            { key: 'nombre', label: 'Nombre' },
                            { key: 'lugar_nacimiento', label: 'Origen' },
                            { key: 'tipo_identificacion', label: 'Tipo doc' },
                            { key: 'numero_identidad', label: 'No. doc' },
                            { key: 'registro_sire', label: 'SIRE', render: (r) => <StatusBadge value={r.registro_sire} isLight={isLight} /> },
                            { key: 'registro_rutec', label: 'RUTEC', render: (r) => <StatusBadge value={r.registro_rutec} isLight={isLight} /> },
                            {
                                key: 'fecha_vencimiento',
                                label: 'Vence',
                                render: (r) => <VencimientoDocBadge fecha={r.fecha_vencimiento} isLight={isLight} />
                            },
                            {
                                key: 'vigencia_renovar',
                                label: 'Renovar',
                                render: (r) => <VencimientoDocBadge fecha={r.vigencia_renovar} isLight={isLight} />
                            }
                        ]}
                    />
                );
            case 'cancelaciones':
                return <CancelacionesView auth={auth} isLight={isLight} />;
            case 'novedades-zoho':
                return (
                    <FichaNovedadesView
                        auth={auth}
                        isLight={isLight}
                        onPendingCount={setZohoPendingCount}
                    />
                );
            default:
                return null;
        }
    };

    const currentEmail = String(auth?.user?.email || auth?.claims?.email || '').toLowerCase();
    const currentRoleLabel = String(auth?.user?.role || auth?.claims?.role || 'sin_rol').replace(/_/g, ' ').toUpperCase();

    /** Encabezado de grupo dentro del sidebar (sólo visible cuando el sidebar está expandido). */
    const groupHeader = (label) => (
        <p
            className={`mt-2 mb-1 px-3 text-[10px] font-heading font-black uppercase leading-tight tracking-widest ${
                isLight ? 'text-slate-500' : 'text-[#9fb3c8]'
            }`}
        >
            {label}
        </p>
    );

    return (
        <div className={shell}>
            <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className={`fixed left-4 top-16 z-40 flex h-10 w-10 items-center justify-center shadow-lg md:hidden ${menuFab}`}
                aria-label="Abrir menú Capital Humano"
            >
                <Menu size={18} />
            </button>
            {mobileMenuOpen ? (
                <div className={`fixed inset-0 z-40 md:hidden ${scrim}`} onClick={() => setMobileMenuOpen(false)} />
            ) : null}

            {/* Sidebar móvil */}
            <aside className={`fixed left-0 top-0 z-50 flex h-full w-72 flex-col shadow-2xl transition-transform duration-300 font-body md:hidden ${aside} ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <AdminModuleSidebarBrand
                    variant="drawer"
                    isLight={isLight}
                    asideHeaderBorder={asideHeaderBorder}
                    moduleContext={(
                        <>
                            <p className="text-[10px] font-heading font-black uppercase leading-tight tracking-widest text-[#65BCF7]">Módulo madre</p>
                            <p className="text-[10px] font-body font-bold uppercase leading-tight tracking-widest text-slate-400">Capital Humano</p>
                        </>
                    )}
                    endAction={(
                        <button type="button" onClick={() => setMobileMenuOpen(false)} className={`flex h-8 w-8 flex-shrink-0 items-center justify-center ${sidebarIconBtn}`} aria-label="Cerrar menú">
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
                />
                <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
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

                    {visibleGroups.map((group) => (
                        <div key={group.id} className="flex flex-col">
                            {groupHeader(group.label)}
                            {group.items.map(({ id, label, icon: Icon }) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => handleNav(id)}
                                    className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-body font-semibold transition-all ${
                                        navView === id ? 'bg-[#2F7BB8] text-white' : mt.navInactive
                                    }`}
                                >
                                    <Icon size={17} />
                                    <span className="flex flex-1 items-center justify-between gap-2">
                                        <span>{label}</span>
                                        {id === 'novedades-zoho' && zohoPendingCount > 0 ? (
                                            <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                                {zohoPendingCount}
                                            </span>
                                        ) : null}
                                    </span>
                                </button>
                            ))}
                        </div>
                    ))}
                </nav>
                <AdminModuleSidebarFooter
                    auth={auth}
                    onLogout={onLogout}
                    sidebarOpen
                    borderSubtle={borderSubtle}
                    isLight={isLight}
                />
            </aside>

            {/* Sidebar desktop */}
            <aside className={`relative z-10 hidden h-full flex-shrink-0 flex-col overflow-hidden shadow-2xl transition-all duration-300 ease-in-out font-body md:flex ${aside} ${sidebarOpen ? 'w-64' : 'w-16'}`}>
                <AdminModuleSidebarBrand
                    variant={sidebarOpen ? 'rail-expanded' : 'rail-collapsed'}
                    isLight={isLight}
                    asideHeaderBorder={asideHeaderBorder}
                    moduleContext={(
                        <>
                            <p className="whitespace-nowrap text-[10px] font-heading font-black uppercase leading-tight tracking-widest text-[#65BCF7]">Módulo madre</p>
                            <p className="whitespace-nowrap text-[10px] font-body font-bold uppercase leading-tight tracking-widest text-slate-400">Capital Humano</p>
                        </>
                    )}
                    endAction={(
                        <button type="button" onClick={() => setSidebarOpen((o) => !o)} title={sidebarOpen ? 'Colapsar menú' : 'Expandir menú'} className={`flex h-7 w-7 flex-shrink-0 items-center justify-center ${sidebarIconBtn}`}>
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
                />
                <nav className="mt-1 flex flex-1 flex-col gap-1 overflow-y-auto p-2">
                    <button
                        type="button"
                        onClick={() => navigate('/admin')}
                        title={!sidebarOpen ? 'Inicio portal' : undefined}
                        className={`flex items-center gap-3 rounded-xl text-left text-sm font-body font-medium transition-all ${navOutline} ${sidebarOpen ? 'px-4 py-3' : 'justify-center px-0 py-3'}`}
                    >
                        <Home size={18} className="flex-shrink-0" />
                        {sidebarOpen ? <span className="truncate">Inicio portal</span> : null}
                    </button>

                    {visibleGroups.map((group) => (
                        <div key={group.id} className="flex flex-col">
                            {sidebarOpen ? groupHeader(group.label) : null}
                            {group.items.map(({ id, label, icon: Icon }) => (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => handleNav(id)}
                                    title={!sidebarOpen ? label : undefined}
                                    className={`flex items-center gap-3 rounded-xl text-left text-sm font-body font-medium transition-all ${
                                        sidebarOpen ? 'px-4 py-3' : 'justify-center px-0 py-3'
                                    } ${navView === id ? 'bg-[#2F7BB8] text-white shadow-[0_4px_12px_rgba(47,123,184,0.35)]' : mt.navInactive}`}
                                >
                                    <Icon size={18} className="flex-shrink-0" />
                                    {sidebarOpen ? (
                                        <span className="flex flex-1 items-center justify-between gap-2 truncate">
                                            <span className="truncate">{label}</span>
                                            {id === 'novedades-zoho' && zohoPendingCount > 0 ? (
                                                <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                                    {zohoPendingCount}
                                                </span>
                                            ) : null}
                                        </span>
                                    ) : null}
                                </button>
                            ))}
                        </div>
                    ))}
                </nav>
                <AdminModuleSidebarFooter
                    auth={auth}
                    onLogout={onLogout}
                    sidebarOpen={sidebarOpen}
                    borderSubtle={borderSubtle}
                    isLight={isLight}
                />
            </aside>

            {/* Para Monitor n8n el lienzo lo gestiona Layout/ContratacionDashboard (con header propio);
                para Onboarding aplicamos el padding estándar del módulo. */}
            <section className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-auto ${navView.startsWith('monitor-') ? '' : 'p-4 sm:p-6'}`}>
                {renderView()}
            </section>
        </div>
    );
}
