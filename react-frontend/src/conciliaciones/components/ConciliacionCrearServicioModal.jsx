import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Save, ShieldAlert, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';
import {
    createServicio,
    updateServicio,
    fetchServicioConsultores,
    fetchConsultoresDisponibles,
    associateConsultoresToServicio
} from '../conciliacionesApi.js';
import LideresMultiSelect from './LideresMultiSelect.jsx';

export default function ConciliacionCrearServicioModal({
    open,
    onClose,
    onSuccess,
    token,
    clientes,
    isLight,
    servicio = null
}) {
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const [wizardStep, setWizardStep] = useState('datos');
    const [client, setClient] = useState('');
    const [serviceName, setServiceName] = useState('');
    const [initDate, setInitDate] = useState('');
    const [closingDay, setClosingDay] = useState('');
    const [billingMode, setBillingMode] = useState('HOURS');
    const [baseHours, setBaseHours] = useState('');
    const [billingType, setBillingType] = useState('EXPIRED_MONTH');
    const [lideresCatalogo, setLideresCatalogo] = useState([]);
    const [lideresAsociados, setLideresAsociados] = useState([]);
    const [lideresAllMode, setLideresAllMode] = useState(true);
    const [consultores, setConsultores] = useState([]);
    const [selectedConsultores, setSelectedConsultores] = useState({});
    const [consultorSearch, setConsultorSearch] = useState('');
    const [loadingConsultores, setLoadingConsultores] = useState(false);

    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const modalRef = useRef(null);
    const closeBtnRef = useRef(null);

    useEffect(() => {
        if (open) {
            setWizardStep('datos');
            setConsultores([]);
            setSelectedConsultores({});
            setConsultorSearch('');
            setLoadingConsultores(false);
            if (servicio) {
                const savedLideres = Array.isArray(servicio.lideresAsociados) ? servicio.lideresAsociados : [];
                setClient(servicio.client || '');
                setServiceName(servicio.serviceName || '');
                setInitDate(servicio.initDate || '');
                setClosingDay(servicio.closingDay !== undefined ? String(servicio.closingDay) : '');
                setBillingMode(servicio.billingMode || 'HOURS');
                setBaseHours(servicio.baseHours !== undefined && servicio.baseHours !== null ? String(servicio.baseHours) : '');
                setBillingType(servicio.billingType || 'EXPIRED_MONTH');
                setLideresAsociados(savedLideres);
                setLideresAllMode(!savedLideres.length);
            } else {
                setClient('');
                setServiceName('');
                setInitDate('');
                setClosingDay('');
                setBillingMode('HOURS');
                setBaseHours('');
                setBillingType('EXPIRED_MONTH');
                setLideresAsociados([]);
                setLideresAllMode(true);
            }
            setErrorMsg('');
            setTimeout(() => {
                if (closeBtnRef.current) closeBtnRef.current.focus();
            }, 50);
        }
    }, [open, servicio]);

    useEffect(() => {
        if (!open || !client) {
            setLideresCatalogo([]);
            return undefined;
        }
        let cancelled = false;
        fetch(`/api/catalogos/lideres?cliente=${encodeURIComponent(client)}`, { credentials: 'include' })
            .then((r) => r.json())
            .then((data) => {
                if (cancelled) return;
                const list = Array.isArray(data?.items) ? data.items.map(String) : [];
                setLideresCatalogo(list);
            })
            .catch(() => {
                if (!cancelled) setLideresCatalogo([]);
            });
        return () => {
            cancelled = true;
        };
    }, [open, client]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!open) return;
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    const lideresSelectionValid = lideresAllMode || lideresAsociados.length > 0;
    const consultoresSeleccionadosCount = Object.keys(selectedConsultores).length;
    const canSave = lideresSelectionValid && consultoresSeleccionadosCount > 0;

    const lideresFiltroLabel =
        lideresAllMode || !lideresAsociados.length
            ? 'todos los líderes'
            : lideresAsociados.join(', ');

    const validateDatos = () => {
        if (!client || !serviceName || !initDate || !closingDay || !billingMode || !billingType) {
            setErrorMsg('Todos los campos del servicio son obligatorios');
            return false;
        }
        if (billingMode === 'HOURS' && !baseHours) {
            setErrorMsg('Las horas base son obligatorias cuando el modo de facturación es Horas');
            return false;
        }
        const parsedDiaCierre = parseInt(closingDay, 10);
        if (isNaN(parsedDiaCierre) || parsedDiaCierre < 1 || parsedDiaCierre > 31) {
            setErrorMsg('El día de cierre debe ser un número entero entre 1 y 31');
            return false;
        }
        if (!lideresSelectionValid) {
            setErrorMsg('Seleccione al menos un líder o marque «Todos los líderes».');
            return false;
        }
        return true;
    };

    const buildPayload = () => {
        const parsedDiaCierre = parseInt(closingDay, 10);
        return {
            client,
            serviceName,
            initDate,
            closingDay: parsedDiaCierre,
            billingMode,
            billingType,
            baseHours: billingMode === 'HOURS' ? Number(baseHours) : null,
            lideresAsociados
        };
    };

    const handleContinuar = async () => {
        setErrorMsg('');
        if (!validateDatos()) return;

        setLoadingConsultores(true);
        try {
            const fetchOpts = { lideresAsociados };
            let data;
            if (servicio?.id) {
                data = await fetchServicioConsultores(token, servicio.id, fetchOpts);
            } else {
                data = await fetchConsultoresDisponibles(token, client, fetchOpts);
            }
            setConsultores(data);
            const selected = {};
            data.forEach((c) => {
                if (c.asociado) selected[c.cedula] = true;
            });
            setSelectedConsultores(selected);
            setWizardStep('consultores');
        } catch (err) {
            setErrorMsg(err.message || 'Error al cargar consultores');
            setConsultores([]);
        } finally {
            setLoadingConsultores(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        if (!validateDatos()) return;
        if (!canSave) {
            setErrorMsg('Debe seleccionar al menos un consultor para guardar el servicio.');
            return;
        }

        setSaving(true);
        const payload = buildPayload();
        const payloadAsociacion = Object.keys(selectedConsultores).map((cedula) => ({ cedula }));

        try {
            let saved;
            if (servicio?.id) {
                saved = await updateServicio(token, servicio.id, payload);
                await associateConsultoresToServicio(token, servicio.id, payloadAsociacion);
            } else {
                saved = await createServicio(token, payload);
                if (saved?.id) {
                    await associateConsultoresToServicio(token, saved.id, payloadAsociacion);
                }
            }
            onSuccess({
                ...(saved || { ...payload, id: servicio?.id }),
                consultoresCount: payloadAsociacion.length
            });
        } catch (err) {
            setErrorMsg(err.message || 'Error al guardar el servicio');
        } finally {
            setSaving(false);
        }
    };

    const toggleConsultor = (cedula) => {
        setSelectedConsultores((prev) => {
            const next = { ...prev };
            if (next[cedula]) delete next[cedula];
            else next[cedula] = true;
            return next;
        });
    };

    const allSelected = consultores.length > 0 && consultores.every((c) => selectedConsultores[c.cedula]);
    const handleSelectAll = () => {
        if (allSelected) {
            setSelectedConsultores({});
        } else {
            const next = {};
            consultores.forEach((c) => { next[c.cedula] = true; });
            setSelectedConsultores(next);
        }
    };

    const inputBg = isLight ? 'field-control bg-white text-slate-900' : 'field-control';
    const consultorQuery = consultorSearch.trim().toLowerCase();
    const consultoresAMostrar = consultorQuery
        ? consultores.filter((c) => {
              const nombre = String(c.nombre || '').toLowerCase();
              const cedula = String(c.cedula || '').toLowerCase();
              return nombre.includes(consultorQuery) || cedula.includes(consultorQuery);
          })
        : consultores;

    return (
        <div ref={modalRef} className={dash.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="modal-servicio-title">
            <button type="button" className="modal-glass-scrim absolute inset-0 transition-opacity" aria-label="Cerrar modal" onClick={onClose} />

            <div className={`${dash.modalCardWide} max-w-2xl font-body max-h-[90vh] flex flex-col`}>
                <div className={dash.modalHeadBorder}>
                    <div className="min-w-0">
                        <h2 id="modal-servicio-title" className={`font-heading ${dash.title2xl}`}>
                            {servicio ? 'Editar Servicio' : 'Crear Servicio'}
                        </h2>
                        <p className={`mt-0.5 text-xs font-semibold ${dash.modalMuted}`}>
                            {wizardStep === 'datos'
                                ? 'Paso 1 de 2 — Datos del servicio y líderes'
                                : `Paso 2 de 2 — Consultores (${lideresFiltroLabel})`}
                        </p>
                    </div>
                    <button
                        ref={closeBtnRef}
                        type="button"
                        onClick={onClose}
                        className={dash.modalClose}
                        aria-label="Cerrar modal"
                    >
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                    <div className={`${dash.modalBodyScroll} space-y-4 px-1 pb-1 flex-1`}>
                        {errorMsg && (
                            <div className="flex items-center gap-2 rounded-lg bg-red-900/30 border border-red-800 p-3 text-sm text-red-400">
                                <ShieldAlert size={16} className="shrink-0" />
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        {wizardStep === 'datos' ? (
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
                                        {clientes.map((c) => (
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
                                        <option value="CURRENT_MONTH">Mes corriente</option>
                                        <option value="EXPIRED_MONTH">Mes vencido</option>
                                        <option value="ADVANCE_MONTH">Mes anticipado</option>
                                    </select>
                                </div>

                                <div className="flex flex-col gap-1.5 md:col-span-2">
                                    <label className={`text-xs font-bold ${dash.titleLg}`}>
                                        Líder(es) <span className="text-red-500">*</span>
                                    </label>
                                    <LideresMultiSelect
                                        key={client || 'sin-cliente'}
                                        lideres={lideresCatalogo}
                                        value={lideresAsociados}
                                        onChange={setLideresAsociados}
                                        onAllLeadersModeChange={setLideresAllMode}
                                        disabled={!client || saving}
                                        isLight={isLight}
                                    />
                                    <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                        Elija los líderes y pulse Continuar para cargar sus consultores.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                                        {consultoresSeleccionadosCount} consultor(es) seleccionado(s)
                                    </p>
                                    {consultores.length > 0 ? (
                                        <button
                                            type="button"
                                            onClick={handleSelectAll}
                                            className={`text-xs font-semibold px-2 py-1 rounded transition-colors ${
                                                isLight
                                                    ? 'text-[#2F7BB8] hover:bg-[#2F7BB8]/10'
                                                    : 'text-[#4ea4e9] hover:bg-[#4ea4e9]/10'
                                            }`}
                                        >
                                            {allSelected ? 'Deseleccionar todos' : 'Seleccionar todos'}
                                        </button>
                                    ) : null}
                                </div>
                                <input
                                    type="search"
                                    value={consultorSearch}
                                    onChange={(e) => setConsultorSearch(e.target.value)}
                                    placeholder="Buscar por nombre o cédula…"
                                    className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg}`}
                                    aria-label="Buscar consultor"
                                />
                                {loadingConsultores ? (
                                    <div className="p-4 text-center text-sm opacity-70 animate-pulse">
                                        Cargando consultores…
                                    </div>
                                ) : consultoresAMostrar.length === 0 ? (
                                    <div className="p-4 text-center text-sm opacity-70">
                                        No hay consultores disponibles para los líderes seleccionados.
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2 max-h-[340px] overflow-y-auto pr-1">
                                        {consultoresAMostrar.map((c) => {
                                            const isSelected = !!selectedConsultores[c.cedula];
                                            return (
                                                <div
                                                    key={c.cedula}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => toggleConsultor(c.cedula)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter' || e.key === ' ') {
                                                            e.preventDefault();
                                                            toggleConsultor(c.cedula);
                                                        }
                                                    }}
                                                    className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors ${
                                                        isSelected
                                                            ? (isLight ? 'border-[#2F7BB8] bg-[#2F7BB8]/5' : 'border-[#2F7BB8] bg-[#2F7BB8]/10')
                                                            : (isLight ? 'border-slate-200 hover:bg-slate-50' : 'border-slate-700 hover:bg-slate-800/50')
                                                    }`}
                                                >
                                                    <div className="flex min-w-0 flex-1 items-center gap-3">
                                                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                                            isSelected ? 'bg-[#2F7BB8] border-[#2F7BB8] text-white' : (isLight ? 'border-slate-300' : 'border-slate-600')
                                                        }`}>
                                                            {isSelected && <Check size={14} />}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className={`truncate text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                                                                {c.nombre}
                                                            </p>
                                                            <p className={`truncate text-xs ${dash.modalMuted}`}>
                                                                CC: {c.cedula} • {c.lider || 'Sin líder'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className={`${dash.modalFooter} px-1`}>
                        <button type="button" onClick={onClose} className={dash.borrarFiltros}>
                            Cancelar
                        </button>
                        {wizardStep === 'datos' ? (
                            <button
                                type="button"
                                onClick={handleContinuar}
                                disabled={loadingConsultores || saving}
                                className={`${dash.btnPrimaryCinte} inline-flex items-center gap-1.5 disabled:opacity-50`}
                            >
                                {loadingConsultores ? 'Cargando…' : 'Continuar'}
                                {!loadingConsultores ? <ArrowRight size={14} /> : null}
                            </button>
                        ) : (
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setWizardStep('datos');
                                        setErrorMsg('');
                                    }}
                                    className={`${dash.borrarFiltros} inline-flex items-center gap-1.5`}
                                >
                                    <ArrowLeft size={14} />
                                    Volver
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving || !canSave}
                                    className={`${dash.btnPrimaryCinte} inline-flex items-center gap-1.5 disabled:opacity-50`}
                                    title={!canSave ? 'Seleccione al menos un consultor' : undefined}
                                >
                                    <Save size={14} />
                                    {saving ? 'Guardando…' : (servicio ? 'Guardar servicio' : 'Crear servicio')}
                                </button>
                            </div>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}
