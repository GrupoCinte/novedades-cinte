import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useConsultorOutlet } from '../useConsultorOutlet.js';
import { useUiTheme } from '../UiThemeContext.jsx';
import { buildCsrfHeaders } from '../cognitoAuth.js';
import { ClipboardCheck, FileText, Home, Menu, ChevronLeft, ChevronRight, X, Calendar, Users, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AdminModuleSidebarBrand from '../AdminModuleSidebarBrand.jsx';
import AdminModuleSidebarUser from '../AdminModuleSidebarUser.jsx';
import AdminModuleSidebarFooter from '../AdminModuleSidebarFooter.jsx';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';
import ConsultorActaDetail from './ConsultorActaDetail.jsx';

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

export default function SeguimientosConsultorPage() {
    const navigate = useNavigate();
    const { me } = useConsultorOutlet();
    const { theme } = useUiTheme();
    const isLight = theme === 'light';
    const mt = useModuleTheme();
    const { 
        shell, 
        mainCanvas,
        menuFab,
        scrim,
        aside,
        asideHeaderBorder,
        sidebarIconBtn,
        email,
        borderSubtle,
        navInactive
    } = mt;

    const currentEmail = me?.email || 'Consultor';
    const currentRoleLabel = me?.rol || 'Consultor';

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const closeMobile = () => setMobileMenuOpen(false);

    const [seguimientos, setSeguimientos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [selectedActa, setSelectedActa] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [loadingDetail, setLoadingDetail] = useState(false);

    // Theme setup for table dashboard
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);

    const fetchSeguimientos = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch('/api/consultor/seguimientos', {
                credentials: 'include'
            });
            const data = await res.json();
            if (data.ok) {
                setSeguimientos(data.seguimientos || []);
            } else {
                setError(data.error || 'Error al cargar los seguimientos');
            }
        } catch (err) {
            setError('Error de red al cargar seguimientos');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSeguimientos();
    }, [fetchSeguimientos]);

    const handleViewDetail = async (id) => {
        setLoadingDetail(true);
        try {
            const res = await fetch(`/api/consultor/seguimientos/${id}`, {
                credentials: 'include'
            });
            const data = await res.json();
            if (data.ok) {
                // Ensure acta is completely read-only
                setSelectedActa({ ...data.acta, can_edit: false });
                setModalOpen(true);
            } else {
                alert(data.error || 'No se pudo cargar el detalle del acta');
            }
        } catch (err) {
            alert('Error de red al cargar el detalle');
        } finally {
            setLoadingDetail(false);
        }
    };

    const bgClass = isLight ? 'bg-slate-50 text-slate-900' : 'bg-[#04141E] text-slate-200';
    const cardClass = isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0b2844]/50 border-[#65BCF7]/20 shadow-md';
    const headingClass = isLight ? 'text-[#004D87]' : 'text-[#65BCF7]';

    const navItemClassLocal = (active) => navItemClass(active, navInactive);
    const navIconClassLocal = (active) => navIconClass(active, isLight);

    return (
        <div className={shell}>
            {/* Botón flotante móvil */}
            <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className={`md:hidden fixed top-4 left-4 z-40 flex h-10 w-10 items-center justify-center shadow-lg ${menuFab}`}
                aria-label="Abrir menú"
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
                                EVALUACIONES
                            </p>
                            <p className="text-[10px] font-body font-bold uppercase leading-tight tracking-widest text-slate-400">
                                Mis Actas
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
                    sidebarOpen={true}
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
                        <ClipboardCheck size={18} className={navIconClassLocal(true)} />
                        <span>Actas</span>
                    </button>
                </nav>
                <AdminModuleSidebarFooter
                    auth={{ user: { email: currentEmail, role: 'consultor' } }}
                    onLogout={() => navigate('/consultor')}
                    sidebarOpen={true}
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
                                    EVALUACIONES
                                </p>
                                <p className="text-[10px] font-body font-bold uppercase leading-tight tracking-widest text-slate-400">
                                    Mis Actas
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

                <nav className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
                    <button
                        type="button"
                        onClick={() => navigate('/consultor')}
                        className={navItemClassLocal(false)}
                        title="Volver al portal"
                    >
                        <Home size={18} className={navIconClassLocal(false)} />
                        {sidebarOpen ? <span>Volver al portal</span> : null}
                    </button>
                    <button
                        type="button"
                        className={navItemClassLocal(true)}
                        title="Actas"
                    >
                        <ClipboardCheck size={18} className={navIconClassLocal(true)} />
                        {sidebarOpen ? <span>Actas</span> : null}
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

            <main className={mainCanvas}>
                <div className="flex h-full w-full flex-col font-body p-4 md:p-6 overflow-y-auto">
                    {error && (
                        <div className="mb-4 rounded border border-red-500/50 bg-red-500/10 p-3 text-red-500 text-sm">
                            {error}
                        </div>
                    )}

                    <div className={`${dash.cardFlex} min-h-0 flex-1`}>
                        <div className={dash.tableWrap}>
                            <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
                                <table className="w-full text-left border-collapse whitespace-nowrap min-w-[900px] md:min-w-full">
                                    <thead className={dash.thead}>
                                        <tr>
                                            <th className="p-4 pl-6 font-semibold w-[25%]">Cliente</th>
                                            <th className="p-4 font-semibold w-[20%]">Tipo</th>
                                            <th className="p-4 font-semibold w-[20%] text-center">Estado</th>
                                            <th className="p-4 font-semibold w-[20%] text-center">Fecha de reunión</th>
                                            <th className="p-4 font-semibold w-[15%] text-right pr-6">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className={dash.tbody}>
                                        {loading ? (
                                            <tr>
                                                <td colSpan={5} className={`p-12 text-center font-medium ${dash.muted}`}>
                                                    Cargando actas...
                                                </td>
                                            </tr>
                                        ) : seguimientos.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className={`p-12 text-center font-medium ${dash.muted}`}>
                                                    No tienes actas de seguimiento finalizadas registradas.
                                                </td>
                                            </tr>
                                        ) : (
                                            seguimientos.map((row) => {
                                                return (
                                                    <tr key={row.id} className={`${dash.trHover} cursor-pointer`} onClick={() => handleViewDetail(row.id)}>
                                                        <td className={dash.tdName}>{row.cliente_nombre || row.cliente}</td>
                                                        <td className={dash.tdCell}>
                                                            <span className="capitalize">{row.tipo}</span>
                                                        </td>
                                                        <td className="p-4 text-center">
                                                            <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${
                                                                row.estado === 'FINALIZADO' || row.estado === 'finalizado'
                                                                    ? isLight
                                                                        ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                                                                        : 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                                                                    : isLight
                                                                        ? 'border-slate-300 bg-slate-100 text-slate-700'
                                                                        : 'border-slate-600 bg-slate-800 text-slate-300'
                                                            }`}>
                                                                {row.estado || 'DESCONOCIDO'}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 text-center">
                                                            {row.fecha_acta ? new Date(row.fecha_acta).toLocaleDateString() : '-'}
                                                        </td>
                                                        <td className="p-4 pr-6 text-right">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleViewDetail(row.id); }}
                                                                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                                                                    isLight 
                                                                    ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' 
                                                                    : 'bg-[#2F7BB8]/20 text-[#a8dcff] hover:bg-[#2F7BB8]/40'
                                                                }`}
                                                            >
                                                                <Eye size={16} /> Ver detalle
                                                            </button>
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
                </div>

                {modalOpen && (
                    <ConsultorActaDetail
                        open={modalOpen}
                        onClose={() => setModalOpen(false)}
                        actaData={selectedActa}
                        me={me}
                    />
                )}
            </main>
        </div>
    );
}
