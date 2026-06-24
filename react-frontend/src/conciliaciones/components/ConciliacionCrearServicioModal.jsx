import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Save, ShieldAlert } from 'lucide-react';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';
import { createServicio, updateServicio } from '../conciliacionesApi.js';

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
    const [client, setClient] = useState('');
    const [serviceName, setServiceName] = useState('');
    const [initDate, setInitDate] = useState('');
    const [closingDay, setClosingDay] = useState('');
    const [billingMode, setBillingMode] = useState('HOURS');
    const [baseHours, setBaseHours] = useState('');
    const [billingType, setBillingType] = useState('EXPIRED_MONTH');
    
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const modalRef = useRef(null);
    const closeBtnRef = useRef(null);

    useEffect(() => {
        if (open) {
            if (servicio) {
                setClient(servicio.client || '');
                setServiceName(servicio.serviceName || '');
                setInitDate(servicio.initDate || '');
                setClosingDay(servicio.closingDay !== undefined ? String(servicio.closingDay) : '');
                setBillingMode(servicio.billingMode || 'HOURS');
                setBaseHours(servicio.baseHours !== undefined && servicio.baseHours !== null ? String(servicio.baseHours) : '');
                setBillingType(servicio.billingType || 'EXPIRED_MONTH');
            } else {
                setClient('');
                setServiceName('');
                setInitDate('');
                setClosingDay('');
                setBillingMode('HOURS');
                setBaseHours('');
                setBillingType('EXPIRED_MONTH');
            }
            setErrorMsg('');
            setTimeout(() => {
                if (closeBtnRef.current) closeBtnRef.current.focus();
            }, 50);
        }
    }, [open, servicio]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!open) return;
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        if (!client || !serviceName || !initDate || !closingDay || !billingMode || !billingType) {
            setErrorMsg('Todos los campos son obligatorios');
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
        const payload = {
            client,
            serviceName,
            initDate: initDate,
            closingDay: parsedDiaCierre,
            billingMode: billingMode,
            billingType: billingType,
            baseHours: billingMode === 'HOURS' ? Number(baseHours) : null
        };

        try {
            if (servicio && servicio.id) {
                await updateServicio(token, servicio.id, payload);
            } else {
                await createServicio(token, payload);
            }
            onSuccess();
        } catch (err) {
            setErrorMsg(err.message || 'Error al guardar el servicio');
        } finally {
            setSaving(false);
        }
    };

    const todayStr = new Date().toISOString().split('T')[0];

    const inputBg = isLight ? 'field-control bg-white text-slate-900' : 'field-control';

    return (
        <div ref={modalRef} className={dash.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="modal-servicio-title">
            <button type="button" className="modal-glass-scrim absolute inset-0 transition-opacity" aria-label="Cerrar modal" onClick={onClose} />

            <div className={`${dash.modalCardWide} max-w-2xl font-body`}>
                <div className={dash.modalHeadBorder}>
                    <div className="min-w-0">
                        <h2 id="modal-servicio-title" className={`font-heading ${dash.title2xl}`}>
                            {servicio ? 'Editar Servicio' : 'Crear Servicio'}
                        </h2>
                        <p className={`mt-0.5 text-xs font-semibold ${dash.modalMuted}`}>
                            {servicio ? 'Modificar datos del servicio' : 'Registrar un nuevo servicio para un cliente'}
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
                    <div className={`${dash.modalBodyScroll} space-y-4 px-1 pb-1`}>
                        {errorMsg && (
                            <div className="flex items-center gap-2 rounded-lg bg-red-900/30 border border-red-800 p-3 text-sm text-red-400">
                                <ShieldAlert size={16} className="shrink-0" />
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <label className={`text-xs font-bold ${dash.titleLg}`}>
                                    Cliente <span className="text-red-500">*</span>
                                </label>
                                <select
                                    required
                                    value={client}
                                    onChange={(e) => setClient(e.target.value)}
                                    disabled={!!servicio}
                                    className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg} ${!!servicio ? 'opacity-60 cursor-not-allowed' : ''}`}
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
                                    disabled={!!servicio}
                                    placeholder="Ej. Soporte Nivel 2"
                                    className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg} ${!!servicio ? 'opacity-60 cursor-not-allowed' : ''}`}
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <label className={`text-xs font-bold ${dash.titleLg}`}>
                                    Inicio de Conciliación <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    required
                                    min={!servicio ? todayStr : undefined}
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
                    </div>

                    <div className={`${dash.modalFooter} px-1`}>
                        <button
                            type="button"
                            onClick={onClose}
                            className={dash.borrarFiltros}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className={`${dash.btnPrimaryCinte} inline-flex items-center gap-1.5 disabled:opacity-50`}
                        >
                            <Save size={14} />
                            {saving ? 'Guardando...' : (servicio ? 'Guardar Cambios' : 'Crear Servicio')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
