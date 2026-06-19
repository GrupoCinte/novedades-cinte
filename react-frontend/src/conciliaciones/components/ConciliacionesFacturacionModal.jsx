import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Save, ShieldAlert } from 'lucide-react';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';
import { validateFacturacionForm, buildFacturacionSavePayload } from '../facturacionLogic.js';

function formatCop(n) {
    const x = Number(n) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}

export default function ConciliacionesFacturacionModal({
    open,
    onClose,
    onSave,
    colaborador, // El objeto colaborador completo con los campos que agregamos en la capa de datos
    saving,
    isLight
}) {
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const [proyecto, setProyecto] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [estado, setEstado] = useState('PENDIENTE');
    const [facturaFv, setFacturaFv] = useState('');
    const [fechaRadicacion, setFechaRadicacion] = useState('');
    const [motivoDevolucion, setMotivoDevolucion] = useState('');
    const [errorMsg, setErrorMsg] = useState('');

    const modalRef = useRef(null);
    const closeBtnRef = useRef(null);

    useEffect(() => {
        if (open && colaborador) {
            setProyecto(colaborador.proyecto || colaborador.clienteProyecto || '');
            setObservaciones(colaborador.observaciones || '');
            setEstado(colaborador.estado || 'PENDIENTE');
            setFacturaFv(colaborador.facturaFv || '');
            setFechaRadicacion(colaborador.fechaRadicacion || '');
            setMotivoDevolucion(colaborador.motivoDevolucion || '');
            setErrorMsg('');
            // Foco inicial
            setTimeout(() => {
                if (closeBtnRef.current) closeBtnRef.current.focus();
            }, 50);
        }
    }, [open, colaborador]);

    // Trap de foco simple
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

    if (!open || !colaborador) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        const validation = validateFacturacionForm({
            proyecto,
            estado,
            facturaFv,
            fechaRadicacion,
            motivoDevolucion
        });
        if (!validation.ok) {
            setErrorMsg(validation.error);
            return;
        }

        const payload = buildFacturacionSavePayload(
            { proyecto, observaciones, estado, facturaFv, fechaRadicacion, motivoDevolucion },
            { cedula: colaborador.cedula, anio: null, mes: null }
        );

        try {
            await onSave(payload);
            onClose();
        } catch (err) {
            setErrorMsg(err.message || 'Error al guardar la facturación');
        }
    };

    const blockBg = isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0f172a]/50 border-slate-700/50';
    const textMain = isLight ? 'text-slate-800' : 'text-slate-200';
    const inputBg = isLight ? 'field-control bg-white text-slate-900' : 'field-control';

    return (
        <div ref={modalRef} className={dash.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="modal-facturacion-title">
            <button type="button" className="modal-glass-scrim absolute inset-0 transition-opacity" aria-label="Cerrar modal" onClick={onClose} />

            <div className={`${dash.modalCardWide} max-w-4xl font-body`}>
                <div className={dash.modalHeadBorder}>
                    <div className="min-w-0">
                        <h2 id="modal-facturacion-title" className={`font-heading ${dash.title2xl}`}>
                            {colaborador.cerrado ? 'Actualizar Cierre de Facturación' : 'Cerrar Facturación Mensual'}
                        </h2>
                        <p className={`mt-0.5 text-xs font-semibold ${dash.modalMuted}`}>
                            {colaborador.nombre} — C.C. {colaborador.cedula}
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

                {/* Formulario */}
                <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                    <div className={`${dash.modalBodyScroll} space-y-4 px-1 pb-1`}>
                    
                    {errorMsg && (
                        <div className="flex items-center gap-2 rounded-lg bg-red-900/30 border border-red-800 p-3 text-sm text-red-400">
                            <ShieldAlert size={16} className="shrink-0" />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    {/* Contenedor de Información de Solo Lectura */}
                    <div className="space-y-3">
                        <h3 className={`font-heading text-xs font-bold uppercase tracking-wider ${dash.titleLg}`}>
                            Información del Colaborador (Lectura)
                        </h3>
                        <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 rounded-xl border p-4 text-xs ${blockBg} ${dash.modalInfoGrid}`}>
                            
                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Nit Cliente</span>
                                <span className={`font-body font-medium ${textMain}`}>{colaborador.nit || '—'}</span>
                            </div>
                            
                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Cliente / Organización</span>
                                <span className={`font-body font-medium ${textMain}`}>{colaborador.cliente || '—'}</span>
                            </div>

                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Cédula Consultor</span>
                                <span className={`font-body font-medium ${textMain}`}>{colaborador.cedula || '—'}</span>
                            </div>

                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Nombre Consultor</span>
                                <span className={`font-body font-medium ${textMain}`}>{colaborador.nombre || '—'}</span>
                            </div>

                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Servicio / Rol</span>
                                <span className={`font-body font-medium ${textMain}`}>{colaborador.perfil || '—'}</span>
                            </div>

                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Fecha Ingreso</span>
                                <span className={`font-body font-medium ${textMain}`}>{colaborador.fechaIngreso || '—'}</span>
                            </div>

                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Tipo de Contrato</span>
                                <span className={`font-body font-medium ${textMain}`}>{colaborador.tipoContrato || '—'}</span>
                            </div>

                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Ejecutivo Comercial</span>
                                <span className={`font-body font-medium ${textMain}`}>{colaborador.comercial || '—'}</span>
                            </div>

                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Tipo de Servicio / Modalidad</span>
                                <span className={`font-body font-medium ${textMain}`}>{colaborador.tipoServicio || '—'}</span>
                            </div>

                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Honorarios / Sueldo Nómina</span>
                                <span className={`font-body font-medium ${textMain}`}>
                                    {colaborador.sueldoNomina > 0 
                                        ? `Sueldo Nómina: ${formatCop(colaborador.sueldoNomina)}` 
                                        : `Honorarios: ${colaborador.honorarios || '—'}`}
                                </span>
                            </div>

                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Tarifa del Mes</span>
                                <span className={`font-body font-medium font-semibold ${dash.titleLg}`}>
                                    {formatCop(colaborador.tarifaCliente)}
                                </span>
                            </div>

                            <div>
                                <span className={`block font-semibold ${dash.modalMuted}`}>Novedades Aprobadas / Deducción</span>
                                <span className="font-body font-medium text-red-400 font-semibold">
                                    {colaborador.novedadesCount} novedades ({formatCop(colaborador.novedadesSumCop)})
                                </span>
                            </div>

                            <div className="sm:col-span-2 md:col-span-3 lg:col-span-4 pt-2 border-t border-dashed border-gray-400/30 flex justify-between items-center text-sm">
                                <span className={`font-heading font-extrabold uppercase ${dash.titleLg}`}>Total a Facturar</span>
                                <span className={`font-body font-extrabold text-base ${dash.titleLg}`}>
                                    {formatCop(colaborador.facturaCop)}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Campos Editables */}
                    <div className="space-y-4 pt-2">
                        <h3 className={`font-heading text-xs font-bold uppercase tracking-wider ${dash.titleLg}`}>
                            Campos de Cierre de Facturación
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            
                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <label 
                                    htmlFor="facturacion-estado" 
                                    className={`text-xs font-bold ${dash.titleLg}`}
                                >
                                    Estado de Conciliación <span className="text-red-500">*</span>
                                </label>
                                <select
                                    id="facturacion-estado"
                                    required
                                    value={estado}
                                    onChange={(e) => setEstado(e.target.value)}
                                    className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg}`}
                                >
                                    <option value="PENDIENTE">Pendiente</option>
                                    <option value="CONCILIADA">Conciliada</option>
                                    <option value="ENVIADA">Enviada a Cliente</option>
                                    <option value="RADICADA">Radicada</option>
                                    <option value="DEVUELTA">Devuelta</option>
                                </select>
                            </div>

                            {(estado === 'RADICADA' || estado === 'ENVIADA') && (
                                <>
                                    <div className="flex flex-col gap-1.5">
                                        <label 
                                            htmlFor="facturacion-fv" 
                                            className={`text-xs font-bold ${dash.titleLg}`}
                                        >
                                            Número de Factura (FV) <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            id="facturacion-fv"
                                            type="text"
                                            required
                                            placeholder="Ej. FV-1234"
                                            value={facturaFv}
                                            onChange={(e) => setFacturaFv(e.target.value)}
                                            maxLength={100}
                                            className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg}`}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1.5">
                                        <label 
                                            htmlFor="facturacion-fecha-rad" 
                                            className={`text-xs font-bold ${dash.titleLg}`}
                                        >
                                            Fecha de Radicación <span className="text-red-500">*</span>
                                        </label>
                                        <input
                                            id="facturacion-fecha-rad"
                                            type="date"
                                            required
                                            value={fechaRadicacion}
                                            onChange={(e) => setFechaRadicacion(e.target.value)}
                                            className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg}`}
                                        />
                                    </div>
                                </>
                            )}

                            {estado === 'DEVUELTA' && (
                                <div className="flex flex-col gap-1.5 md:col-span-2">
                                    <label 
                                        htmlFor="facturacion-motivo" 
                                        className={`text-xs font-bold ${dash.titleLg}`}
                                    >
                                        Motivo de Devolución <span className="text-red-500">*</span>
                                    </label>
                                    <textarea
                                        id="facturacion-motivo"
                                        required
                                        rows="2"
                                        placeholder="Especifique el motivo de la devolución"
                                        value={motivoDevolucion}
                                        onChange={(e) => setMotivoDevolucion(e.target.value)}
                                        maxLength={1000}
                                        className={`rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg}`}
                                    />
                                </div>
                            )}
                            
                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <label 
                                    htmlFor="facturacion-proyecto" 
                                    className={`text-xs font-bold ${dash.titleLg}`}
                                >
                                    Proyecto / Frente de Trabajo <span className="text-red-500">*</span>
                                </label>
                                <input
                                    id="facturacion-proyecto"
                                    type="text"
                                    required
                                    placeholder="Nombre del proyecto o frente"
                                    value={proyecto}
                                    onChange={(e) => setProyecto(e.target.value)}
                                    className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg}`}
                                />
                            </div>

                            <div className="flex flex-col gap-1.5 md:col-span-2">
                                <label 
                                    htmlFor="facturacion-observaciones" 
                                    className={`text-xs font-bold ${dash.titleLg}`}
                                >
                                    Observaciones <span className="text-slate-500 font-normal ml-1">(Opcional)</span>
                                </label>
                                <textarea
                                    id="facturacion-observaciones"
                                    rows="3"
                                    placeholder="Notas sobre el cierre, incidencias de facturación, etc."
                                    value={observaciones}
                                    onChange={(e) => setObservaciones(e.target.value)}
                                    maxLength={1000}
                                    className={`rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg}`}
                                />
                            </div>
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
                            {saving ? 'Guardando...' : colaborador.cerrado ? 'Actualizar Cierre' : 'Cerrar Facturación'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}
