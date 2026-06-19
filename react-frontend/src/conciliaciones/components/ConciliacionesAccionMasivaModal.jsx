import { useState, useEffect, useRef, useMemo } from 'react';
import { X, Save, ShieldAlert, Users } from 'lucide-react';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';
import { validateFacturacionForm } from '../facturacionLogic.js';

export default function ConciliacionesAccionMasivaModal({
    open,
    onClose,
    onSave,
    cliente,
    totalCount = 0,
    filteredCount = 0,
    hasActiveFilters = false,
    saving,
    isLight
}) {
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const [estado, setEstado] = useState('PENDIENTE');
    const [facturaFv, setFacturaFv] = useState('');
    const [fechaRadicacion, setFechaRadicacion] = useState('');
    const [motivoDevolucion, setMotivoDevolucion] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [applyToFiltered, setApplyToFiltered] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const closeBtnRef = useRef(null);

    const targetCount = applyToFiltered && hasActiveFilters ? filteredCount : totalCount;

    useEffect(() => {
        if (open) {
            setEstado('PENDIENTE');
            setFacturaFv('');
            setFechaRadicacion('');
            setMotivoDevolucion('');
            setObservaciones('');
            setApplyToFiltered(hasActiveFilters);
            setErrorMsg('');
            setTimeout(() => {
                if (closeBtnRef.current) closeBtnRef.current.focus();
            }, 50);
        }
    }, [open, hasActiveFilters]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!open) return;
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose]);

    if (!open) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');

        const validation = validateFacturacionForm({
            estado,
            facturaFv,
            fechaRadicacion,
            motivoDevolucion,
            requireProyecto: false
        });
        if (!validation.ok) {
            setErrorMsg(validation.error);
            return;
        }

        try {
            await onSave({
                estado,
                facturaFv: estado === 'RADICADA' || estado === 'ENVIADA' ? facturaFv : null,
                fechaRadicacion: estado === 'RADICADA' || estado === 'ENVIADA' ? fechaRadicacion : null,
                motivoDevolucion: estado === 'DEVUELTA' ? motivoDevolucion : null,
                observaciones: observaciones.trim() || null,
                applyToFiltered: Boolean(applyToFiltered && hasActiveFilters)
            });
            onClose();
        } catch (err) {
            setErrorMsg(err.message || 'Error al procesar la acción masiva');
        }
    };

    const inputBg = isLight ? 'field-control bg-white text-slate-900' : 'field-control';

    return (
        <div className={dash.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="modal-masiva-title">
            <button type="button" className="modal-glass-scrim absolute inset-0 transition-opacity" aria-label="Cerrar modal" onClick={onClose} />

            <div className={`${dash.modalCardWide} max-w-lg font-body`}>
                <div className={dash.modalHeadBorder}>
                    <div className="min-w-0">
                        <h2 id="modal-masiva-title" className={`font-heading ${dash.title2xl} flex items-center gap-2`}>
                            <Users size={20} className="text-[#65BCF7]" />
                            Acción grupal: {cliente}
                        </h2>
                        <p className={`mt-0.5 text-xs font-semibold ${dash.modalMuted}`}>
                            Se actualizarán {targetCount} colaborador(es)
                            {applyToFiltered && hasActiveFilters ? ' (filtro activo)' : ' del cliente en el mes'}
                        </p>
                    </div>
                    <button ref={closeBtnRef} type="button" onClick={onClose} className={dash.modalClose} aria-label="Cerrar modal">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                    <div className={`${dash.modalBodyScroll} space-y-4 px-1 pb-1`}>
                    {errorMsg ? (
                        <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-900/30 p-3 text-sm text-red-400">
                            <ShieldAlert size={16} className="shrink-0" />
                            <span>{errorMsg}</span>
                        </div>
                    ) : null}

                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-blue-400">
                        El estado (y datos de radicación o devolución) se aplicará a los colaboradores seleccionados. Proyecto
                        individual no se modifica; las observaciones opcionales se aplican a todos si las indicas.
                    </div>

                    {hasActiveFilters ? (
                        <label className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700/50 bg-slate-800/40'}`}>
                            <input
                                type="checkbox"
                                className="mt-1"
                                checked={applyToFiltered}
                                onChange={(e) => setApplyToFiltered(e.target.checked)}
                            />
                            <span>
                                Aplicar solo a colaboradores visibles con filtro ({filteredCount} de {totalCount})
                            </span>
                        </label>
                    ) : null}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-1.5 sm:col-span-2">
                            <label htmlFor="masiva-estado" className={`text-xs font-bold ${dash.titleLg}`}>
                                Nuevo estado <span className="text-red-500">*</span>
                            </label>
                            <select
                                id="masiva-estado"
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
                                    <label htmlFor="masiva-fv" className={`text-xs font-bold ${dash.titleLg}`}>
                                        Número de factura (FV) <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        id="masiva-fv"
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
                                    <label htmlFor="masiva-fecha-rad" className={`text-xs font-bold ${dash.titleLg}`}>
                                        Fecha de radicación <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        id="masiva-fecha-rad"
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
                            <div className="flex flex-col gap-1.5 sm:col-span-2">
                                <label htmlFor="masiva-motivo" className={`text-xs font-bold ${dash.titleLg}`}>
                                    Motivo de devolución <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    id="masiva-motivo"
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

                        <div className="flex flex-col gap-1.5 sm:col-span-2">
                            <label htmlFor="masiva-observaciones" className={`text-xs font-bold ${dash.titleLg}`}>
                                Observaciones <span className="font-normal text-slate-500">(Opcional)</span>
                            </label>
                            <textarea
                                id="masiva-observaciones"
                                rows="3"
                                placeholder="Notas que se aplicarán a todos los colaboradores seleccionados"
                                value={observaciones}
                                onChange={(e) => setObservaciones(e.target.value)}
                                maxLength={1000}
                                className={`resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg}`}
                            />
                        </div>
                    </div>

                    </div>

                    <div className={`${dash.modalFooter} px-1`}>
                        <button type="button" onClick={onClose} className={dash.borrarFiltros}>
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || targetCount === 0}
                            className={`${dash.btnPrimaryCinte} inline-flex items-center gap-1.5 disabled:opacity-50`}
                        >
                            <Save size={14} />
                            {saving ? 'Procesando…' : `Aplicar a ${targetCount}`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
