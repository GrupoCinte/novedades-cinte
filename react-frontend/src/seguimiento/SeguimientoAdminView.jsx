import { useEffect, useState, useMemo, useCallback } from 'react';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';
import ModuleFiltersToolbar from '../shared/filters/ModuleFiltersToolbar.jsx';
import GestionDataTable from '../onboarding/GestionDataTable.jsx';
import GestionModalShell from '../shared/modals/GestionModalShell.jsx';

/** Lee una cookie por nombre (mismo helper que DirectorioClienteColaboradorModule). */
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

/** Construye headers de autenticación siguiendo el patrón del proyecto (Bearer + XSRF). */
function authHeaders(token) {
    const headers = { 'Content-Type': 'application/json' };
    const t = String(token || '').trim();
    if (t) headers.Authorization = `Bearer ${t}`;
    const xsrf = readCookie('cinteXsrf');
    if (xsrf) headers['x-cinte-xsrf'] = xsrf;
    return headers;
}

export default function SeguimientoAdminView({ token, auth }) {
    const { isLight } = useModuleTheme();
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);

    const role = String(auth?.user?.role || auth?.claims?.role || '').trim().toLowerCase();
    const isGp = role === 'gp';

    const [actas, setActas] = useState([]);
    const [clientesCartera, setClientesCartera] = useState([]);
    const [loading, setLoading] = useState(false);

    // Estado para modal de selección de tipo (CA-03)
    const [modalTipoOpen, setModalTipoOpen] = useState(false);

    // Estado para el panel de filtros
    const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);

    const fetchOpts = useCallback(() => ({
        headers: authHeaders(token),
        credentials: 'include'
    }), [token]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [resActas, resCartera] = await Promise.all([
                    fetch('/api/seguimiento/actas', fetchOpts()),
                    fetch('/api/seguimiento/cartera', fetchOpts())
                ]);

                if (resActas.ok) {
                    const dataActas = await resActas.json();
                    setActas(dataActas.items || []);
                } else {
                    console.error('Error fetching actas', resActas.status);
                }

                if (resCartera.ok) {
                    const dataCartera = await resCartera.json();
                    setClientesCartera(dataCartera.clientes || []);
                } else {
                    console.error('Error fetching cartera', resCartera.status);
                }
            } catch (err) {
                console.error('Error fetching seguimiento data', err);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [fetchOpts]);

    const handleSelectTipo = (tipo) => {
        setModalTipoOpen(false);
        // Retrasamos el alert ligeramente para permitir que el modal se cierre visualmente
        setTimeout(() => {
            alert(`Flujo para crear acta tipo: ${tipo}. El formulario pertenece a AUT-284.`);
        }, 150);
    };

    const columns = [
        { key: 'cliente_nombre', label: 'Cliente' },
        {
            key: 'consultor_nombre',
            label: 'Consultor / Equipo',
            render: (row) => row.tipo_acta === 'CONSULTOR' ? row.consultor_nombre : 'Equipo completo'
        },
        { key: 'tipo_acta', label: 'Tipo de Acta' },
        {
            key: 'estado',
            label: 'Estado',
            render: (row) => (
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${row.estado === 'FINALIZADO'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}>
                    {row.estado}
                </span>
            )
        },
        {
            key: 'created_at',
            label: 'Fecha',
            render: (row) => new Date(row.created_at).toLocaleDateString()
        }
    ];

    return (
        <div className={dash.moduleTabShellFull}>
            <ModuleFiltersToolbar
                chipLabel="Sin filtros"
                filtersPanelOpen={filtersPanelOpen}
                onToggleFilters={() => setFiltersPanelOpen((o) => !o)}
                toggleId="directorio-seguimiento-filtros-toggle"
                panelId="directorio-seguimiento-filtros-panel"
                dash={dash}
            >
                <div className="flex-1" />
                <button
                    type="button"
                    onClick={() => setModalTipoOpen(true)}
                    className={`${dash.btnPrimaryCinte} shrink-0`}
                >
                    Registrar Acta
                </button>
            </ModuleFiltersToolbar>

            {/* Visualización de la cartera (CA-02, PT-01) */}
            {isGp && (
                <div className="px-1 mb-2">
                    <h3 className={`${isLight ? 'text-slate-700' : 'text-slate-300'} text-sm font-semibold mb-1`}>
                        Cartera asignada
                    </h3>
                    <p className={dash.mutedSm}>
                        {clientesCartera.length > 0
                            ? clientesCartera.join(' • ')
                            : (loading ? 'Cargando cartera...' : 'No tienes clientes asignados.')}
                    </p>
                </div>
            )}

            <div className="min-h-0 flex-1 flex flex-col">
                <GestionDataTable
                    columns={columns}
                    rows={loading ? [] : actas}
                    isLight={isLight}
                    emptyText={loading ? 'Cargando actas...' : (isGp ? 'No hay actas registradas en tu cartera.' : 'No hay actas registradas.')}
                    onRowClick={() => alert('Ver detalle (AUT-284)')}
                />
            </div>

            {/* Modal de Selección de Tipo (CA-03, PT-02) */}
            <GestionModalShell
                open={modalTipoOpen}
                onClose={() => setModalTipoOpen(false)}
                title="Registrar Seguimiento"
                size="md"
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <button
                            className={dash.borrarFiltros}
                            onClick={() => setModalTipoOpen(false)}
                        >
                            Cancelar
                        </button>
                    </div>
                }
            >
                <div className="flex flex-col gap-4 p-4">
                    <p className={`text-sm ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                        Selecciona el tipo de acta de seguimiento que deseas registrar:
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => handleSelectTipo('Consultor')}
                            className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 transition-colors ${isLight
                                    ? 'border-slate-200 bg-white hover:border-[#2F7BB8] hover:bg-slate-50'
                                    : 'border-slate-700 bg-slate-800 hover:border-[#2F7BB8] hover:bg-slate-750'
                                }`}
                        >
                            <span className="font-semibold text-[#2F7BB8]">Consultor</span>
                            <span className={`text-xs text-center ${dash.mutedSm}`}>Seguimiento individual a un consultor</span>
                        </button>

                        <button
                            onClick={() => handleSelectTipo('Cliente')}
                            className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 transition-colors ${isLight
                                    ? 'border-slate-200 bg-white hover:border-[#2F7BB8] hover:bg-slate-50'
                                    : 'border-slate-700 bg-slate-800 hover:border-[#2F7BB8] hover:bg-slate-750'
                                }`}
                        >
                            <span className="font-semibold text-[#2F7BB8]">Cliente</span>
                            <span className={`text-xs text-center ${dash.mutedSm}`}>Reunión de servicio con líderes del cliente</span>
                        </button>
                    </div>
                </div>
            </GestionModalShell>
        </div>
    );
}
