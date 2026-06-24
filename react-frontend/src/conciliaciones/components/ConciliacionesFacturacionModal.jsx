import { useState, useEffect, useRef, useMemo } from 'react';
import { X, ShieldAlert, Trash2, CheckCircle2, XCircle } from 'lucide-react';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';
import { buildFacturacionRevisionPayload, getRevisionActionsForUser } from '../facturacionLogic.js';
import ConciliacionesNovedadesAprobadasPanel from './ConciliacionesNovedadesAprobadasPanel.jsx';
import ConciliacionesFacturacionHistorialPanel from './ConciliacionesFacturacionHistorialPanel.jsx';

export default function ConciliacionesFacturacionModal({
    open,
    onClose,
    onSave,
    onEliminar = null,
    colaborador,
    auth = null,
    novedadesItems = [],
    novedadesLoading = false,
    historial = [],
    historialLoading = false,
    saving,
    isLight
}) {
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const [errorMsg, setErrorMsg] = useState('');
    const [accionPendiente, setAccionPendiente] = useState(null);
    const [observaciones, setObservaciones] = useState('');
    const [obsError, setObsError] = useState('');

    const modalRef = useRef(null);
    const closeBtnRef = useRef(null);
    const obsInputRef = useRef(null);

    const userRole = auth?.user?.role || auth?.claims?.role || '';
    const revisionActions = useMemo(
        () => getRevisionActionsForUser(userRole, colaborador?.estado || 'PENDIENTE'),
        [userRole, colaborador?.estado]
    );

    useEffect(() => {
        if (open && colaborador) {
            setErrorMsg('');
            setAccionPendiente(null);
            setObservaciones('');
            setObsError('');
            setTimeout(() => {
                if (closeBtnRef.current) closeBtnRef.current.focus();
            }, 50);
        }
    }, [open, colaborador]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!open) return;
            if (e.key === 'Escape') {
                if (accionPendiente) {
                    setAccionPendiente(null);
                    setObsError('');
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose, accionPendiente]);

    useEffect(() => {
        if (accionPendiente && obsInputRef.current) {
            setTimeout(() => obsInputRef.current?.focus(), 50);
        }
    }, [accionPendiente]);

    if (!open || !colaborador) return null;

    const abrirConfirmacion = (accion) => {
        setErrorMsg('');
        setObsError('');
        setObservaciones('');
        setAccionPendiente(accion);
    };

    const cerrarConfirmacion = () => {
        if (saving) return;
        setAccionPendiente(null);
        setObsError('');
    };

    const confirmarAccion = async () => {
        setObsError('');
        setErrorMsg('');

        const built = buildFacturacionRevisionPayload(
            { accion: accionPendiente, observaciones },
            { cedula: colaborador.cedula, anio: null, mes: null }
        );
        if (!built.ok) {
            setObsError(built.error);
            return;
        }

        try {
            await onSave({ ...built.data, _revisionAccion: accionPendiente });
            setAccionPendiente(null);
            onClose();
        } catch (err) {
            setErrorMsg(err.message || 'Error al guardar la revisión');
            setAccionPendiente(null);
        }
    };

    const blockBg = isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0f172a]/50 border-slate-700/50';
    const textMain = isLight ? 'text-slate-800' : 'text-slate-200';
    const inputBg = isLight ? 'field-control bg-white text-slate-900' : 'field-control';

    const esAprobar = accionPendiente === 'aprobar';
    const tituloConfirmacion = esAprobar ? revisionActions.aprobarLabel : 'Rechazar cierre';
    const showActions = revisionActions.canAprobar || revisionActions.canRechazar;

    return (
        <div ref={modalRef} className={dash.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="modal-facturacion-title">
            <button type="button" className="modal-glass-scrim absolute inset-0 transition-opacity" aria-label="Cerrar modal" onClick={onClose} />

            <div className={`${dash.modalCardWide} max-w-4xl font-body`}>
                <div className={dash.modalHeadBorder}>
                    <div className="min-w-0">
                        <h2 id="modal-facturacion-title" className={`font-heading ${dash.title2xl}`}>
                            Revisión de cierre
                        </h2>
                        <p className={`mt-0.5 text-xs font-semibold ${dash.modalMuted}`}>
                            {colaborador.nombre} — C.C. {colaborador.cedula}
                        </p>
                    </div>
                    <button ref={closeBtnRef} type="button" onClick={onClose} className={dash.modalClose} aria-label="Cerrar modal">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col">
                    <div className={`${dash.modalBodyScroll} space-y-4 px-1 pb-1`}>
                        {errorMsg ? (
                            <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-900/30 p-3 text-sm text-red-400">
                                <ShieldAlert size={16} className="shrink-0" />
                                <span>{errorMsg}</span>
                            </div>
                        ) : null}

                        <div className="space-y-3">
                            <h3 className={`font-heading text-xs font-bold uppercase tracking-wider ${dash.titleLg}`}>
                                Información del colaborador
                            </h3>
                            <div className={`grid grid-cols-1 gap-3 rounded-xl border p-4 text-xs sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 ${blockBg} ${dash.modalInfoGrid}`}>
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
                            </div>
                        </div>

                        <div className="border-t border-dashed border-slate-300/40 pt-4 dark:border-slate-600/40">
                            <ConciliacionesNovedadesAprobadasPanel
                                embedded
                                items={novedadesItems}
                                loading={novedadesLoading}
                                isLight={isLight}
                                tarifaCliente={colaborador.tarifaCliente}
                                facturaCop={colaborador.facturaCop}
                            />
                        </div>

                        <div className="border-t border-dashed border-slate-300/40 pt-4 dark:border-slate-600/40">
                            <ConciliacionesFacturacionHistorialPanel
                                items={historial}
                                loading={historialLoading}
                                isLight={isLight}
                            />
                        </div>
                    </div>

                    <div className={`${dash.modalFooter} flex flex-wrap items-center justify-end gap-2 px-1`}>
                        {onEliminar && colaborador.cerrado ? (
                            <button
                                type="button"
                                onClick={() => onEliminar(colaborador)}
                                className="mr-auto inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-500 transition hover:bg-rose-500/20"
                            >
                                <Trash2 size={16} aria-hidden />
                                Eliminar cierre
                            </button>
                        ) : null}
                        <button type="button" onClick={onClose} className={dash.borrarFiltros} disabled={saving}>
                            Cancelar
                        </button>
                        {revisionActions.canRechazar ? (
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => abrirConfirmacion('rechazar')}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-500/20 disabled:opacity-50 dark:text-rose-400"
                            >
                                <XCircle size={16} aria-hidden />
                                Rechazar
                            </button>
                        ) : null}
                        {revisionActions.canAprobar ? (
                            <button
                                type="button"
                                disabled={saving}
                                onClick={() => abrirConfirmacion('aprobar')}
                                className={`${dash.btnPrimaryCinte} inline-flex items-center gap-1.5 disabled:opacity-50`}
                            >
                                <CheckCircle2 size={16} aria-hidden />
                                {revisionActions.aprobarLabel}
                            </button>
                        ) : null}
                        {!showActions ? (
                            <span className={`text-xs ${dash.modalMuted}`}>Sin acciones disponibles para tu rol en este estado.</span>
                        ) : null}
                    </div>
                </div>
            </div>

            {accionPendiente ? (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-revision-obs-title"
                >
                    <button
                        type="button"
                        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
                        aria-label="Cerrar confirmación"
                        onClick={cerrarConfirmacion}
                    />
                    <div
                        className={`relative z-10 w-full max-w-md rounded-xl border p-5 shadow-xl ${
                            isLight ? 'border-slate-200 bg-white' : 'border-slate-600/50 bg-slate-900'
                        }`}
                    >
                        <h3 id="modal-revision-obs-title" className={`font-heading text-lg font-bold ${dash.titleLg}`}>
                            {tituloConfirmacion}
                        </h3>
                        <p className={`mt-1 text-sm ${dash.modalMuted}`}>
                            Indica la observación de la revisión (obligatoria).
                        </p>

                        {obsError ? (
                            <p className="mt-3 text-sm text-rose-500" role="alert">
                                {obsError}
                            </p>
                        ) : null}

                        <div className="mt-4 flex flex-col gap-1.5">
                            <label htmlFor="revision-observaciones" className={`text-xs font-bold ${dash.titleLg}`}>
                                Observación <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                ref={obsInputRef}
                                id="revision-observaciones"
                                required
                                rows="4"
                                placeholder={esAprobar ? 'Motivo o comentario de la aprobación…' : 'Motivo del rechazo…'}
                                value={observaciones}
                                onChange={(e) => setObservaciones(e.target.value)}
                                className={`resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg}`}
                            />
                        </div>

                        <div className="mt-5 flex justify-end gap-2">
                            <button type="button" onClick={cerrarConfirmacion} className={dash.borrarFiltros} disabled={saving}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={saving}
                                onClick={confirmarAccion}
                                className={
                                    esAprobar
                                        ? `${dash.btnPrimaryCinte} inline-flex items-center gap-1.5 disabled:opacity-50`
                                        : 'inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50'
                                }
                            >
                                {saving ? 'Guardando…' : esAprobar ? 'Confirmar' : 'Confirmar rechazo'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
