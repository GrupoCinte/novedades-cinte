import { useState, useEffect, useMemo } from 'react';
import { Pencil, Trash2, Check, Save } from 'lucide-react';
import GestionModalShell from '../../shared/modals/GestionModalShell.jsx';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';
import { fetchServicioConsultores, updateServicio, associateConsultoresToServicio } from '../conciliacionesApi.js';

const getModoFacturacionLabel = (val) => {
    switch (val) {
        case 'HOURS': return 'Horas';
        case 'CALENDAR_DAYS': return 'Días calendario';
        case 'BUSINESS_DAYS': return 'Días hábiles';
        default: return val || '';
    }
};

const getTipoFacturacionLabel = (val) => {
    switch (val) {
        case 'EXPIRED_MONTH': return 'Mes vencido';
        case 'ADVANCE_MONTH': return 'Mes anticipado';
        default: return val || '';
    }
};

export default function ConciliacionDetalleServicioModal({
    open,
    onClose,
    servicio,
    onDelete,
    onSuccess,
    clientes = [],
    isLight,
    token
}) {
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    
    const [mode, setMode] = useState('view'); // 'view' or 'edit'
    const [isAssociating, setIsAssociating] = useState(false);
    const [consultores, setConsultores] = useState([]);
    const [loading, setLoading] = useState(false);
    
    // Edit Form State
    const [client, setClient] = useState('');
    const [serviceName, setServiceName] = useState('');
    const [initDate, setInitDate] = useState('');
    const [closingDay, setClosingDay] = useState('');
    const [billingMode, setBillingMode] = useState('HOURS');
    const [baseHours, setBaseHours] = useState('');
    const [billingType, setBillingType] = useState('EXPIRED_MONTH');
    const [selectedConsultores, setSelectedConsultores] = useState({});
    
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        if (open && servicio) {
            setMode('view');
            setIsAssociating(false);
            setErrorMsg('');
            setLoading(true);
            
            // Init Form
            setClient(servicio.client || '');
            setServiceName(servicio.serviceName || '');
            setInitDate(servicio.initDate || '');
            setClosingDay(servicio.closingDay !== undefined ? String(servicio.closingDay) : '');
            setBillingMode(servicio.billingMode || 'HOURS');
            setBaseHours(servicio.baseHours !== undefined && servicio.baseHours !== null ? String(servicio.baseHours) : '');
            setBillingType(servicio.billingType || 'EXPIRED_MONTH');

            fetchServicioConsultores(token, servicio.id)
                .then(data => {
                    setConsultores(data);
                    const selected = {};
                    data.forEach(c => {
                        if (c.asociado) selected[c.cedula] = true;
                    });
                    setSelectedConsultores(selected);
                })
                .catch(err => {
                    console.error('Error fetching consultores:', err);
                    setConsultores([]);
                })
                .finally(() => setLoading(false));
        } else {
            setConsultores([]);
            setMode('view');
            setIsAssociating(false);
        }
    }, [open, servicio, token]);

    if (!open || !servicio) return null;

    const asociadosCount = consultores.filter(c => selectedConsultores[c.cedula]).length;
    const allSelected = consultores.length > 0 && consultores.every(c => selectedConsultores[c.cedula]);

    const toggleConsultor = (cedula) => {
        if (mode !== 'edit' || !isAssociating) return;
        setSelectedConsultores(prev => {
            const next = { ...prev };
            if (next[cedula]) delete next[cedula];
            else next[cedula] = true;
            return next;
        });
    };

    const handleSelectAll = () => {
        if (allSelected) {
            setSelectedConsultores({});
        } else {
            const next = {};
            consultores.forEach(c => { next[c.cedula] = true; });
            setSelectedConsultores(next);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        if (!client || !serviceName || !initDate || !closingDay || !billingMode || !billingType) {
            setErrorMsg('Todos los campos del servicio son obligatorios');
            return;
        }

        if (billingMode === 'HOURS' && !baseHours) {
            setErrorMsg('Las horas base son obligatorias cuando el modo de facturación es Horas');
            return;
        }

        const parsedDiaCierre = parseInt(closingDay, 10);
        if (isNaN(parsedDiaCierre) || parsedDiaCierre < 1 || parsedDiaCierre > 31) {
            setErrorMsg('El día de cierre debe ser un número entero entre 1 y 31');
            return;
        }

        setSaving(true);
        const payloadServicio = {
            client,
            serviceName,
            initDate: initDate,
            closingDay: parsedDiaCierre,
            billingMode: billingMode,
            billingType: billingType,
            baseHours: billingMode === 'HOURS' ? Number(baseHours) : null
        };

        const payloadAsociacion = Object.keys(selectedConsultores).map(cedula => ({
            cedula
        }));

        try {
            const saved = await updateServicio(token, servicio.id, payloadServicio);
            if (isAssociating) {
                await associateConsultoresToServicio(token, servicio.id, payloadAsociacion);
            }
            onSuccess(saved || { ...payloadServicio, id: servicio.id });
            onClose();
        } catch (err) {
            setErrorMsg(err.message || 'Error al guardar los cambios');
        } finally {
            setSaving(false);
        }
    };

    const inputBg = isLight ? 'field-control bg-white text-slate-900' : 'field-control';
    const consultoresAMostrar = (mode === 'edit' && isAssociating) ? consultores : consultores.filter(c => selectedConsultores[c.cedula]);

    const titleElement = (
        <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-bold shadow-sm ${
                isLight ? 'bg-[#2F7BB8] text-white' : 'bg-[#18466b] text-blue-100'
            }`}>
                {servicio.serviceName ? servicio.serviceName.charAt(0).toUpperCase() : 'S'}
            </div>
            <div className="flex-1 min-w-0">
                <span className="block truncate">{servicio.serviceName}</span>
            </div>
        </div>
    );

    const subtitleElement = (
        <span className="flex items-center gap-2 text-xs">
            <span className="font-semibold uppercase tracking-wide opacity-80">Cliente:</span>
            <span>{servicio.client}</span>
            <span className="px-1.5 opacity-50">•</span>
            <span>{asociadosCount} consultores asociados</span>
        </span>
    );

    return (
        <GestionModalShell
            open={open}
            onClose={onClose}
            title={titleElement}
            subtitle={subtitleElement}
            size="wide"
            titleSize="lg"
            headerActions={
                mode === 'view' ? (
                    <button
                        type="button"
                        onClick={() => setMode('edit')}
                        className="rounded-md bg-[#2F7BB8] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#266395] transition-colors"
                    >
                        Editar
                    </button>
                ) : null
            }
            footer={
                mode === 'edit' ? (
                    <div className="flex justify-between items-center w-full">
                        <button
                            type="button"
                            onClick={() => {
                                onDelete(servicio);
                                onClose();
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/40 transition-colors"
                        >
                            <Trash2 size={14} />
                            Eliminar Servicio
                        </button>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setMode('view');
                                    setIsAssociating(false);
                                    setErrorMsg('');
                                    // Reset selected consultores
                                    const selected = {};
                                    consultores.forEach(c => {
                                        if (c.asociado) selected[c.cedula] = true;
                                    });
                                    setSelectedConsultores(selected);
                                }}
                                className={dash.borrarFiltros}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={saving || loading}
                                className={`${dash.btnPrimaryCinte} inline-flex items-center gap-1.5 disabled:opacity-50`}
                            >
                                <Save size={14} />
                                {saving ? 'Guardando...' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </div>
                ) : null
            }
        >
            <div className="px-2 pb-4 pt-2 font-body text-sm">
                {errorMsg && (
                    <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-900/30 border border-red-800 p-3 text-sm text-red-400">
                        <span>{errorMsg}</span>
                    </div>
                )}

                {/* TABS SIMULATION */}
                <div className="mb-6 flex gap-6 border-b border-slate-200 px-1 dark:border-slate-700/50">
                    <button className={`border-b-2 border-[#2F7BB8] pb-2 text-sm font-bold text-[#2F7BB8]`}>
                        General
                    </button>
                    {/* Placeholder for future tabs if needed */}
                </div>

                {/* FORM / READ-ONLY FIELDS */}
                <div className="mb-8">
                    <h3 className={`text-xs font-bold uppercase tracking-wider mb-4 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        Información del Servicio
                    </h3>
                    {mode === 'edit' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <label className={`text-xs font-bold ${dash.titleLg}`}>
                                    Cliente <span className="text-red-500">*</span>
                                </label>
                                <select
                                    required
                                    value={client}
                                    onChange={(e) => setClient(e.target.value)}
                                    className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg}`}
                                >
                                    <option value="">Seleccione un cliente</option>
                                    {clientes.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <label className={`text-xs font-bold ${dash.titleLg}`}>
                                    Nombre del Servicio <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={serviceName}
                                    onChange={(e) => setServiceName(e.target.value)}
                                    placeholder="Ej. Soporte Nivel 2"
                                    className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg}`}
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className={`text-xs font-bold ${dash.titleLg}`}>
                                    Inicio de Conciliación <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    required
                                    value={initDate}
                                    onChange={(e) => setInitDate(e.target.value)}
                                    className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg}`}
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className={`text-xs font-bold ${dash.titleLg}`}>
                                    Día de Cierre <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    max="31"
                                    value={closingDay}
                                    onChange={(e) => setClosingDay(e.target.value)}
                                    placeholder="1-31"
                                    className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg}`}
                                />
                            </div>

                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <label className={`text-xs font-bold ${dash.titleLg}`}>
                                    Modo de Facturación <span className="text-red-500">*</span>
                                </label>
                                <select
                                    required
                                    value={billingMode}
                                    onChange={(e) => setBillingMode(e.target.value)}
                                    className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg}`}
                                >
                                    <option value="HOURS">Horas</option>
                                    <option value="CALENDAR_DAYS">Días calendario</option>
                                    <option value="BUSINESS_DAYS">Días hábiles</option>
                                </select>
                            </div>

                            {billingMode === 'HOURS' && (
                                <div className="flex flex-col gap-1.5 md:col-span-2">
                                    <label className={`text-xs font-bold ${dash.titleLg}`}>
                                        Horas Base <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="number"
                                        required
                                        min="1"
                                        value={baseHours}
                                        onChange={(e) => setBaseHours(e.target.value)}
                                        placeholder="Ej. 160"
                                        className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg}`}
                                    />
                                </div>
                            )}

                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <label className={`text-xs font-bold ${dash.titleLg}`}>
                                    Tipo de Facturación <span className="text-red-500">*</span>
                                </label>
                                <select
                                    required
                                    value={billingType}
                                    onChange={(e) => setBillingType(e.target.value)}
                                    className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg}`}
                                >
                                    <option value="EXPIRED_MONTH">Mes vencido</option>
                                    <option value="ADVANCE_MONTH">Mes anticipado</option>
                                </select>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <span className="block font-bold opacity-60 uppercase tracking-wider text-[10px] mb-0.5">Cliente</span>
                                <span className={`text-base font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{servicio.client}</span>
                            </div>
                            <div className="col-span-2">
                                <span className="block font-bold opacity-60 uppercase tracking-wider text-[10px] mb-0.5">Nombre del Servicio</span>
                                <span className={`text-base font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{servicio.serviceName}</span>
                            </div>
                            <div>
                                <span className="block font-bold opacity-60 uppercase tracking-wider text-[10px] mb-0.5">Inicio de Conciliación</span>
                                <span className={`font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{servicio.initDate}</span>
                            </div>
                            <div>
                                <span className="block font-bold opacity-60 uppercase tracking-wider text-[10px] mb-0.5">Día de Cierre</span>
                                <span className={`font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Día {servicio.closingDay}</span>
                            </div>
                            <div>
                                <span className="block font-bold opacity-60 uppercase tracking-wider text-[10px] mb-0.5">Modo de Facturación</span>
                                <span className={`font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                                    {getModoFacturacionLabel(servicio.billingMode)}
                                    {servicio.baseHours ? ` (${servicio.baseHours} hrs base)` : ''}
                                </span>
                            </div>
                            <div>
                                <span className="block font-bold opacity-60 uppercase tracking-wider text-[10px] mb-0.5">Tipo de Facturación</span>
                                <span className={`font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                                    {getTipoFacturacionLabel(servicio.billingType)}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* CONSULTORES LIST */}
                <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-700/50">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                            Consultores {(mode === 'edit' && isAssociating) ? 'del Cliente' : 'Asociados'}
                        </h3>
                        {mode === 'edit' && !isAssociating && (
                            <button
                                type="button"
                                onClick={() => setIsAssociating(true)}
                                className="rounded-md bg-[#2F7BB8] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#266395] transition-colors shadow-sm"
                            >
                                Asociar Consultores
                            </button>
                        )}
                        {mode === 'edit' && isAssociating && !loading && consultores.length > 0 && (
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsAssociating(false);
                                        // Revert associations
                                        const selected = {};
                                        consultores.forEach(c => {
                                            if (c.asociado) selected[c.cedula] = true;
                                        });
                                        setSelectedConsultores(selected);
                                    }}
                                    className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${
                                        isLight ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800'
                                    }`}
                                >
                                    Cancelar Asociación
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSelectAll}
                                    className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${
                                        isLight 
                                            ? 'text-[#2F7BB8] hover:bg-[#2F7BB8]/10' 
                                            : 'text-[#4ea4e9] hover:bg-[#4ea4e9]/10'
                                    }`}
                                >
                                    {allSelected ? 'Deseleccionar Todos' : 'Seleccionar Todos'}
                                </button>
                            </div>
                        )}
                    </div>
                    
                    {loading ? (
                        <div className="p-4 text-center text-sm opacity-70 animate-pulse">
                            Cargando consultores...
                        </div>
                    ) : consultoresAMostrar.length === 0 ? (
                        <div className="p-4 text-center text-sm opacity-70">
                            {mode === 'edit' && isAssociating
                                ? 'No hay consultores disponibles. Los que no aparecen pueden estar asociados a otro servicio del mismo cliente.'
                                : 'No hay consultores asociados a este servicio.'}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
                            {consultoresAMostrar.map(c => {
                                const isSelected = !!selectedConsultores[c.cedula];
                                return (
                                    <div 
                                        key={c.cedula}
                                        onClick={() => toggleConsultor(c.cedula)}
                                        className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${(mode === 'edit' && isAssociating) ? 'cursor-pointer' : ''} ${
                                            isSelected 
                                                ? (isLight ? 'border-[#2F7BB8] bg-[#2F7BB8]/5' : 'border-[#2F7BB8] bg-[#2F7BB8]/10')
                                                : (isLight ? 'border-slate-200 hover:bg-slate-50' : 'border-slate-700 hover:bg-slate-800/50')
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            {(mode === 'edit' && isAssociating) ? (
                                                <div className={`flex items-center justify-center w-5 h-5 rounded border shrink-0 ${
                                                    isSelected ? 'bg-[#2F7BB8] border-[#2F7BB8] text-white' : (isLight ? 'border-slate-300' : 'border-slate-600')
                                                }`}>
                                                    {isSelected && <Check size={14} />}
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-center w-5 h-5 rounded border bg-[#2F7BB8] border-[#2F7BB8] text-white shrink-0">
                                                    <Check size={14} />
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className={`text-sm font-semibold truncate ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                                                    {c.nombre}
                                                </p>
                                                <p className={`text-xs truncate ${dash.modalMuted}`}>
                                                    CC: {c.cedula} • {c.perfil || 'Sin perfil'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end shrink-0 pl-4 text-xs font-medium">
                                            <div className="flex gap-1">
                                                <span className="opacity-60">Tarifa:</span>
                                                <span className={isLight ? 'text-slate-700 font-semibold' : 'text-slate-300 font-semibold'}>
                                                    {c.tarifaCliente != null ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: c.moneda || 'COP', maximumFractionDigits: 0 }).format(c.tarifaCliente) : '—'}
                                                </span>
                                            </div>
                                            <div className="flex gap-1 mt-0.5">
                                                <span className="opacity-60">Costo Cinte:</span>
                                                <span className={isLight ? 'text-slate-700 font-semibold' : 'text-slate-300 font-semibold'}>
                                                    {c.costoCinte != null ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: c.moneda || 'COP', maximumFractionDigits: 0 }).format(c.costoCinte) : '—'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </GestionModalShell>
    );
}
