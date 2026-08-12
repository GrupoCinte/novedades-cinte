import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';
import ModuleFiltersToolbar from '../shared/filters/ModuleFiltersToolbar.jsx';
import GestionModalShell from '../shared/modals/GestionModalShell.jsx';
import SeguimientoFormModal from './SeguimientoFormModal.jsx';
import SeguimientoFiltersDrawer from './SeguimientoFiltersDrawer.jsx';
import { CheckCircle2, X } from 'lucide-react';

import { authHeaders } from '../shared/authUtils.js';

export default function SeguimientoAdminView({ token, auth }) {
    const { isLight } = useModuleTheme();
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);

    const role = String(auth?.user?.role || auth?.claims?.role || '').trim().toLowerCase();
    const isGp = role === 'gp';

    const [actas, setActas] = useState([]);
    const [clientesCartera, setClientesCartera] = useState([]);
    const [loading, setLoading] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    // Estado para el panel de filtros
    const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);

    // Filtros locales (activos)
    const [filterCliente, setFilterCliente] = useState('');
    const [filterTipo, setFilterTipo] = useState('');
    const [filterFechaInicio, setFilterFechaInicio] = useState('');
    const [filterFechaFin, setFilterFechaFin] = useState('');

    // Valores en borrador (para el drawer)
    const [draftCliente, setDraftCliente] = useState('');
    const [draftTipo, setDraftTipo] = useState('');
    const [draftFechaInicio, setDraftFechaInicio] = useState('');
    const [draftFechaFin, setDraftFechaFin] = useState('');

    // Sincronizar borrador al abrir el drawer
    useEffect(() => {
        if (filtersPanelOpen) {
            setDraftCliente(filterCliente);
            setDraftTipo(filterTipo);
            setDraftFechaInicio(filterFechaInicio);
            setDraftFechaFin(filterFechaFin);
        }
    }, [filtersPanelOpen, filterCliente, filterTipo, filterFechaInicio, filterFechaFin]);

    const handleApplyFilters = () => {
        setFilterCliente(draftCliente);
        setFilterTipo(draftTipo);
        setFilterFechaInicio(draftFechaInicio);
        setFilterFechaFin(draftFechaFin);
        setFiltersPanelOpen(false);
    };

    const handleClearFilters = () => {
        setDraftCliente('');
        setDraftTipo('');
        setDraftFechaInicio('');
        setDraftFechaFin('');
        setFilterCliente('');
        setFilterTipo('');
        setFilterFechaInicio('');
        setFilterFechaFin('');
        setFiltersPanelOpen(false);
    };

    const activeCount = [filterCliente, filterTipo, filterFechaInicio, filterFechaFin].filter(Boolean).length;
    const chipLabel = activeCount === 0 ? 'Sin filtros' : `${activeCount} filtro${activeCount > 1 ? 's' : ''} activo${activeCount > 1 ? 's' : ''}`;

    const filteredActas = useMemo(() => {
        return actas.filter(a => {
            const matchCliente = !filterCliente || (a.cliente || '').toLowerCase().includes(filterCliente.toLowerCase());
            const matchTipo = !filterTipo || (a.tipo || '').toLowerCase() === filterTipo.toLowerCase();
            
            let matchFecha = true;
            if (a.fecha_acta && (filterFechaInicio || filterFechaFin)) {
                const d = new Date(a.fecha_acta);
                d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
                // Remove time part to compare just the date string YYYY-MM-DD safely
                const yyyyMmDd = d.toISOString().split('T')[0];
                
                if (filterFechaInicio && yyyyMmDd < filterFechaInicio) matchFecha = false;
                if (filterFechaFin && yyyyMmDd > filterFechaFin) matchFecha = false;
            } else if (!a.fecha_acta && (filterFechaInicio || filterFechaFin)) {
                matchFecha = false; // If searching by date but acta has no date
            }
            
            return matchCliente && matchTipo && matchFecha;
        });
    }, [actas, filterCliente, filterTipo, filterFechaInicio, filterFechaFin]);

    const handleSaved = (estadoFinal) => {
        refreshActas();
        if (estadoFinal === 'Borrador') {
            setSuccessMessage('Acta guardada como borrador.');
            setTimeout(() => setSuccessMessage(''), 4000);
        } else if (estadoFinal === 'DESCARTADO') {
            setSuccessMessage('Borrador descartado.');
            setTimeout(() => setSuccessMessage(''), 4000);
        }
    };

    // Estado para modal de selección de tipo (CA-03)
    const [modalTipoOpen, setModalTipoOpen] = useState(false);
    
    // Estado para SeguimientoFormModal
    const [formModalOpen, setFormModalOpen] = useState(false);
    const [selectedTipo, setSelectedTipo] = useState('Consultor');
    const [editingActa, setEditingActa] = useState(null);

    // Estado para Eliminar Acta
    const [actaToDelete, setActaToDelete] = useState(null);
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchOpts = useCallback(() => ({
        headers: authHeaders(token),
        credentials: 'include'
    }), [token]);

    const refreshActas = useCallback(async () => {
        try {
            const resActas = await fetch('/api/seguimiento/actas', fetchOpts());
            if (resActas.ok) {
                const dataActas = await resActas.json();
                setActas(dataActas.items || []);
            }
        } catch (err) { }
    }, [fetchOpts]);

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
                }

                if (resCartera.ok) {
                    const dataCartera = await resCartera.json();
                    setClientesCartera(dataCartera.clientes || []);
                }
            } catch (err) {
                // Ignore errors for now
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [refreshActas, fetchOpts]);

    const handleSelectTipo = (tipo) => {
        setModalTipoOpen(false);
        setSelectedTipo(tipo);
        setEditingActa(null);
        setFormModalOpen(true);
    };

    const handleEditRow = (row) => {
        setEditingActa(row);
        setFormModalOpen(true);
    };

    const handleDeleteClick = (e, row) => {
        e.stopPropagation();
        setActaToDelete(row);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!actaToDelete) return;
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/seguimiento/actas/${actaToDelete.id}`, {
                ...fetchOpts(),
                method: 'DELETE'
            });
            if (res.ok) {
                setSuccessMessage('Acta eliminada exitosamente.');
                refreshActas();
                setTimeout(() => setSuccessMessage(''), 4000);
            } else {
                const errData = await res.json();
                alert(errData.error || 'Error al eliminar el acta');
            }
        } catch (error) {
            alert('Error de conexión al eliminar');
        } finally {
            setIsDeleting(false);
            setDeleteModalOpen(false);
            setActaToDelete(null);
        }
    };

    // Remove columns array since we render directly inline now

    // Fix SonarQube: Extract nested ternary operation into an independent statement
    const getEstadoBadgeColor = (estado, isLight) => {
        if (estado === 'FINALIZADO') {
            return isLight
                ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400';
        }
        return isLight
            ? 'border-amber-300 bg-amber-100 text-amber-900'
            : 'border-amber-500/20 bg-amber-500/10 text-amber-400';
    };

    return (
        <div className={dash.moduleTabShellFull}>
            <ModuleFiltersToolbar
                chipLabel={chipLabel}
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
                    Crear Nuevo
                </button>
            </ModuleFiltersToolbar>

            <SeguimientoFiltersDrawer
                open={filtersPanelOpen}
                onClose={() => setFiltersPanelOpen(false)}
                dash={dash}
                draftCliente={draftCliente}
                setDraftCliente={setDraftCliente}
                draftTipo={draftTipo}
                setDraftTipo={setDraftTipo}
                draftFechaInicio={draftFechaInicio}
                setDraftFechaInicio={setDraftFechaInicio}
                draftFechaFin={draftFechaFin}
                setDraftFechaFin={setDraftFechaFin}
                onApply={handleApplyFilters}
                onClear={handleClearFilters}
            />



            <div className={`${dash.cardFlex} min-h-0 flex-1`}>
                <div className={dash.tableWrap}>
                    <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto">
                        <table className="w-full text-left border-collapse whitespace-nowrap min-w-[900px] md:min-w-full">
                            <thead className={dash.thead}>
                                <tr>
                                    <th className="p-4 pl-6 font-semibold">Cliente</th>
                                    <th className="p-4 font-semibold">Tipo</th>
                                    <th className="p-4 font-semibold">Participantes</th>
                                    <th className="p-4 font-semibold">Estado</th>
                                    <th className="p-4 font-semibold text-right pr-6">Fecha Reunión</th>
                                    <th className="p-4 w-12 text-center"></th>
                                </tr>
                            </thead>
                            <tbody className={dash.tbody}>
                                {loading ? (
                                    <tr><td colSpan={6} className={`p-12 text-center font-medium ${dash.muted}`}>Cargando actas...</td></tr>
                                ) : filteredActas.length === 0 ? (
                                    <tr><td colSpan={6} className={`p-12 text-center font-medium ${dash.muted}`}>{actas.length > 0 ? 'Ningún acta coincide con los filtros.' : isGp ? 'No hay actas registradas en tu cartera.' : 'No hay actas registradas.'}</td></tr>
                                ) : (
                                    filteredActas.map((row) => {
                                        const names = row.participantes?.map(p => p.nombre).filter(Boolean) || [];
                                        return (
                                            <tr key={row.id} className={`${dash.trHover} cursor-pointer`} onClick={() => handleEditRow(row)}>
                                                <td className={dash.tdName}>{row.cliente}</td>
                                                <td className={dash.tdCell}>
                                                    <span className="capitalize">{row.tipo}</span>
                                                </td>
                                                <td className={dash.tdCell}>
                                                    {names.length === 0 ? (
                                                        <span className={dash.mutedSm}>Sin participantes</span>
                                                    ) : (
                                                        <span className="truncate max-w-[200px] block" title={names.join(', ')}>{names.join(', ')}</span>
                                                    )}
                                                </td>
                                                <td className="p-4">
                                                    <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-[11px] font-bold uppercase tracking-wider ${getEstadoBadgeColor(row.estado, isLight)}`}>
                                                        {row.estado}
                                                    </span>
                                                </td>
                                                <td className={`p-4 pr-6 text-right ${dash.mutedSm}`}>
                                                    {row.fecha_acta ? (() => {
                                                        const d = new Date(row.fecha_acta);
                                                        d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
                                                        return d.toLocaleDateString();
                                                    })() : '-'}
                                                </td>
                                                <td className="p-4 text-center">
                                                    {(row.estado === 'Borrador' || role === 'cac' || role === 'super admin' || role === 'super_admin') && (
                                                        <button 
                                                            className="text-slate-400 hover:text-red-500 transition-colors p-1.5 rounded-md hover:bg-red-50"
                                                            onClick={(e) => handleDeleteClick(e, row)}
                                                            title={row.estado === 'Borrador' ? "Eliminar borrador" : "Eliminar acta"}
                                                        >
                                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    )}
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
                        {[
                            { tipo: 'Consultor', desc: 'Seguimiento individual a un consultor' },
                            { tipo: 'Cliente', desc: 'Reunión de servicio con líderes del cliente' }
                        ].map((opcion) => (
                            <button
                                key={opcion.tipo}
                                type="button"
                                onClick={() => handleSelectTipo(opcion.tipo)}
                                className={`flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 transition-colors ${isLight
                                    ? 'border-slate-200 bg-white hover:border-[#2F7BB8] hover:bg-slate-50'
                                    : 'border-slate-700 bg-slate-800 hover:border-[#2F7BB8] hover:bg-slate-750'
                                    }`}
                            >
                                <span className="font-semibold text-[#2F7BB8]">{opcion.tipo}</span>
                                <span className={`text-xs text-center ${dash.mutedSm}`}>{opcion.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </GestionModalShell>

            <SeguimientoFormModal
                open={formModalOpen}
                onClose={() => setFormModalOpen(false)}
                actaId={editingActa?.id}
                actaData={editingActa}
                token={token}
                auth={auth}
                onSaved={handleSaved}
                tipoSeleccionado={selectedTipo}
                clientesCartera={clientesCartera}
            />

            {/* Modal de confirmación para eliminar acta */}
            <GestionModalShell
                open={deleteModalOpen}
                onClose={() => !isDeleting && setDeleteModalOpen(false)}
                title="Eliminar Acta"
                size="sm"
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <button className={dash.borrarFiltros} onClick={() => setDeleteModalOpen(false)} disabled={isDeleting}>Cancelar</button>
                        <button className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium shadow-sm hover:bg-red-700 disabled:opacity-50" onClick={confirmDelete} disabled={isDeleting}>
                            {isDeleting ? 'Eliminando...' : 'Sí, Eliminar'}
                        </button>
                    </div>
                }
            >
                <div className="p-4">
                    <p className={`text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                        ¿Estás seguro de que deseas eliminar permanentemente el acta de <strong>{actaToDelete?.cliente}</strong>? 
                        Esta acción la quitará del listado de forma inmediata pero mantendrá el registro lógico en el historial.
                    </p>
                </div>
            </GestionModalShell>

            {successMessage ? (
                <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg border-l-4 border-emerald-500 font-medium z-[9999] flex items-center gap-3 animate-slide-up ${isLight ? 'bg-white text-slate-700' : 'bg-slate-800 text-slate-200'}`}>
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
        </div>
    );
}
