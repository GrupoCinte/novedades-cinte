import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { X, ShieldAlert, Trash2, CheckCircle2, XCircle, Pencil, Save } from 'lucide-react';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';
import {
    buildFacturacionRevisionPayload,
    buildFacturacionAjustesPayload,
    getRevisionActionsForUser,
    canEditConciliacionAjustes,
    resolveHorasBaseMes,
    computeTarifaMesFromValorHora,
    computeValorHoraFromTarifa,
    computeMontoFromValorHoraCop,
    computeMontoNovedadPreview,
    isNovedadCalculadaValorHora,
    showHorasDesgloseColumn,
    formatDiasBaseMesLine
} from '../facturacionLogic.js';
import ConciliacionesNovedadesAprobadasPanel from './ConciliacionesNovedadesAprobadasPanel.jsx';
import ConciliacionesFacturacionHistorialPanel from './ConciliacionesFacturacionHistorialPanel.jsx';

function formatCop(n) {
    const x = Math.round(Number(n) || 0);
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    }).format(x);
}

export default function ConciliacionesFacturacionModal({
    open,
    onClose,
    onSave,
    onSaveAjustes = null,
    onEliminar = null,
    servicioNombre = '',
    servicioId = '',
    colaborador,
    auth = null,
    servicioCompleto = false,
    novedadesItems = [],
    novedadesLoading = false,
    tarifaDetalle = null,
    billingMode = null,
    baseHours = null,
    horasBaseMes = null,
    tarifaValorHora = null,
    diasBaseMes = null,
    diasBaseLabel = null,
    festivosAplicados = false,
    monthLabel = '',
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
    const [editMode, setEditMode] = useState(false);
    const [draftTarifa, setDraftTarifa] = useState('');
    const [draftValorHora, setDraftValorHora] = useState('');
    const [draftValorHorasNovedad, setDraftValorHorasNovedad] = useState({});
    const [valorHoraNovedadTouched, setValorHoraNovedadTouched] = useState(() => new Set());
    const [draftMontos, setDraftMontos] = useState({});
    const [ajustesPendiente, setAjustesPendiente] = useState(false);

    const modalRef = useRef(null);
    const closeBtnRef = useRef(null);
    const obsInputRef = useRef(null);

    const userRole = auth?.user?.role || auth?.claims?.role || '';
    const revisionActions = useMemo(
        () => getRevisionActionsForUser(userRole, colaborador?.estado || 'PENDIENTE'),
        [userRole, colaborador?.estado]
    );
    const canEditAjustes = useMemo(
        () => !servicioCompleto && canEditConciliacionAjustes(userRole, colaborador?.estado || 'PENDIENTE'),
        [servicioCompleto, userRole, colaborador?.estado]
    );

    const diasBaseLine = useMemo(
        () =>
            formatDiasBaseMesLine({
                diasBaseMes,
                diasBaseLabel,
                monthLabel,
                festivosAplicados,
                billingMode
            }),
        [diasBaseMes, diasBaseLabel, monthLabel, festivosAplicados, billingMode]
    );

    const tarifaCliente = tarifaDetalle?.tarifaCliente ?? colaborador?.tarifaCliente ?? null;
    const tarifaMaestro = tarifaDetalle?.tarifaMaestro ?? colaborador?.tarifaMaestro ?? colaborador?.tarifaCliente ?? null;
    const tarifaAjustada = tarifaDetalle?.tarifaAjustada ?? colaborador?.tarifaAjustada ?? false;
    const facturaCop = tarifaDetalle?.facturaCop ?? colaborador?.facturaCop ?? null;
    const billingAdvanceMode = Boolean(
        tarifaDetalle?.billingAdvanceMode ?? colaborador?.billingAdvanceMode
    );

    const horasBase = useMemo(
        () => resolveHorasBaseMes({ billingMode, baseHours, horasBaseMes }),
        [billingMode, baseHours, horasBaseMes]
    );
    const showValorHoraCol = showHorasDesgloseColumn({ billingMode, baseHours, horasBaseMes });

    const syncMontosFromDrafts = useCallback(
        (tarifaStr, valorHoraStr, valorHorasNov = {}, touched = new Set()) => {
            const tarifa = Math.round(Number(tarifaStr) || 0);
            const vhTarifa = Math.round(Number(valorHoraStr) || computeValorHoraFromTarifa(tarifa, horasBase));
            const montos = {};
            const vhNov = { ...valorHorasNov };
            for (const item of novedadesItems || []) {
                const id = String(item?.id || '');
                if (!id) continue;
                if (showValorHoraCol && isNovedadCalculadaValorHora(item)) {
                    const vh = touched.has(id)
                        ? Math.round(Number(vhNov[id]) || 0)
                        : vhTarifa;
                    vhNov[id] = String(vh);
                    montos[id] = String(
                        computeMontoNovedadPreview(item, {
                            tarifa,
                            horasBaseMes: horasBase,
                            valorHora: vh,
                            hoursMode: true
                        })
                    );
                } else {
                    montos[id] = String(item.montoCop ?? '');
                }
            }
            return { montos, vhNov };
        },
        [novedadesItems, horasBase, showValorHoraCol]
    );

    const resetEditDraft = useCallback(() => {
        const tarifa = Math.round(Number(tarifaCliente) || 0);
        const vh = computeValorHoraFromTarifa(tarifa, horasBase);
        setDraftTarifa(String(tarifa));
        setDraftValorHora(String(vh));
        setValorHoraNovedadTouched(new Set());
        const { montos, vhNov } = syncMontosFromDrafts(String(tarifa), String(vh), {}, new Set());
        setDraftValorHorasNovedad(vhNov);
        setDraftMontos(montos);
    }, [tarifaCliente, horasBase, syncMontosFromDrafts]);

    const handleValorHoraChange = useCallback(
        (raw) => {
            const vh = Math.round(Number(raw) || 0);
            const tarifa = computeTarifaMesFromValorHora(vh, horasBase);
            setDraftValorHora(String(vh));
            setDraftTarifa(String(tarifa));
            const { montos, vhNov } = syncMontosFromDrafts(
                String(tarifa),
                String(vh),
                draftValorHorasNovedad,
                valorHoraNovedadTouched
            );
            setDraftValorHorasNovedad(vhNov);
            setDraftMontos((prev) => ({ ...prev, ...montos }));
        },
        [horasBase, syncMontosFromDrafts, draftValorHorasNovedad, valorHoraNovedadTouched]
    );

    const handleValorHoraNovedadChange = useCallback(
        (novedadId, raw) => {
            const id = String(novedadId || '');
            if (!id) return;
            const vh = Math.round(Number(raw) || 0);
            const item = (novedadesItems || []).find((n) => String(n.id) === id);
            if (!item) return;
            setValorHoraNovedadTouched((prev) => new Set(prev).add(id));
            setDraftValorHorasNovedad((prev) => ({ ...prev, [id]: String(vh) }));
            setDraftMontos((prev) => ({
                ...prev,
                [id]: String(
                    computeMontoNovedadPreview(item, {
                        tarifa: draftTarifa,
                        horasBaseMes: horasBase,
                        valorHora: vh,
                        hoursMode: showValorHoraCol
                    })
                )
            }));
        },
        [novedadesItems, horasBase, showValorHoraCol, draftTarifa]
    );

    useEffect(() => {
        if (open && colaborador) {
            setErrorMsg('');
            setAccionPendiente(null);
            setAjustesPendiente(false);
            setObservaciones('');
            setObsError('');
            setEditMode(false);
            resetEditDraft();
            setTimeout(() => {
                if (closeBtnRef.current) closeBtnRef.current.focus();
            }, 50);
        }
    }, [open, colaborador, resetEditDraft]);

    useEffect(() => {
        if (open && !novedadesLoading) resetEditDraft();
    }, [open, novedadesLoading, novedadesItems, tarifaCliente, resetEditDraft]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (!open) return;
            if (e.key === 'Escape') {
                if (accionPendiente || ajustesPendiente) {
                    setAccionPendiente(null);
                    setAjustesPendiente(false);
                    setObsError('');
                } else if (editMode) {
                    setEditMode(false);
                    resetEditDraft();
                } else {
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, onClose, accionPendiente, ajustesPendiente, editMode, resetEditDraft]);

    useEffect(() => {
        if ((accionPendiente || ajustesPendiente) && obsInputRef.current) {
            setTimeout(() => obsInputRef.current?.focus(), 50);
        }
    }, [accionPendiente, ajustesPendiente]);

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
        setAjustesPendiente(false);
        setObsError('');
    };

    const confirmarAccion = async () => {
        setObsError('');
        setErrorMsg('');

        const built = buildFacturacionRevisionPayload(
            { accion: accionPendiente, observaciones },
            { cedula: colaborador.cedula, anio: null, mes: null, servicioId }
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

    const iniciarGuardarAjustes = () => {
        setErrorMsg('');
        setObsError('');
        setObservaciones('');
        setAjustesPendiente(true);
    };

    const confirmarAjustes = async () => {
        if (!onSaveAjustes) return;
        setObsError('');
        setErrorMsg('');

        const built = buildFacturacionAjustesPayload(
            { observaciones, cedula: colaborador.cedula, anio: null, mes: null },
            {
                tarifaDraft: draftTarifa,
                tarifaEffective: tarifaCliente,
                tarifaMaestro,
                montosDraft: draftMontos,
                items: novedadesItems
            }
        );
        if (!built.ok) {
            setObsError(built.error);
            return;
        }

        try {
            await onSaveAjustes(built.data);
            setAjustesPendiente(false);
            setEditMode(false);
        } catch (err) {
            setErrorMsg(err.message || 'Error al guardar ajustes');
            setAjustesPendiente(false);
        }
    };

    const blockBg = isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0f172a]/50 border-slate-700/50';
    const textMain = isLight ? 'text-slate-800' : 'text-slate-200';
    const inputBg = isLight ? 'field-control bg-white text-slate-900' : 'field-control';

    const esAprobar = accionPendiente === 'aprobar';
    const tituloConfirmacion = ajustesPendiente
        ? 'Guardar ajustes de montos'
        : esAprobar
          ? revisionActions.aprobarLabel
          : 'Rechazar cierre';
    const showActions = !servicioCompleto && (revisionActions.canAprobar || revisionActions.canRechazar);
    const confirmOpen = Boolean(accionPendiente || ajustesPendiente);

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
                                    <span className={`block font-semibold ${dash.modalMuted}`}>Servicio</span>
                                    <span className={`font-body font-medium ${textMain}`}>{servicioNombre || colaborador.proyecto || '—'}</span>
                                </div>
                                <div>
                                    <span className={`block font-semibold ${dash.modalMuted}`}>Puesto / cargo</span>
                                    <span className={`font-body font-medium ${textMain}`}>{colaborador.puesto || colaborador.perfil || '—'}</span>
                                </div>
                                <div>
                                    <span className={`block font-semibold ${dash.modalMuted}`}>Líder</span>
                                    <span className={`font-body font-medium ${textMain}`}>{colaborador.lider || '—'}</span>
                                </div>
                                <div>
                                    <span className={`block font-semibold ${dash.modalMuted}`}>Fecha Ingreso</span>
                                    <span className={`font-body font-medium ${textMain}`}>{colaborador.fechaIngreso || '—'}</span>
                                </div>
                                <div>
                                    <span className={`block font-semibold ${dash.modalMuted}`}>Fecha salida</span>
                                    <span className={`font-body font-medium ${textMain}`}>
                                        {colaborador.fechaTermino || colaborador.fechaBajaEfectiva || tarifaDetalle?.fechaTermino || '—'}
                                    </span>
                                </div>
                                {(colaborador.prorrateoAplicado || tarifaDetalle?.prorrateoAplicado) ? (
                                    <div className="sm:col-span-2">
                                        <span className={`block font-semibold ${dash.modalMuted}`}>Tarifa base prorrateada</span>
                                        <span className={`font-body font-medium ${textMain}`}>
                                            {formatCop(tarifaDetalle?.tarifaProrrateada ?? colaborador.tarifaProrrateada ?? tarifaCliente)}
                                            {' · '}
                                            {tarifaDetalle?.diasFacturables ?? colaborador.diasFacturables}/
                                            {tarifaDetalle?.diasMes ?? colaborador.diasMes} días
                                            {(tarifaDetalle?.horasFacturables ?? colaborador.horasFacturables) != null
                                                ? ` · ${tarifaDetalle?.horasFacturables ?? colaborador.horasFacturables} h`
                                                : ''}
                                        </span>
                                        {tarifaMaestro && tarifaMaestro !== tarifaCliente ? (
                                            <span className={`mt-0.5 block text-xs ${dash.modalMuted}`}>
                                                Tarifa catálogo mes: {formatCop(tarifaMaestro)}
                                            </span>
                                        ) : null}
                                    </div>
                                ) : null}
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

                        {diasBaseLine ? (
                            <p className={`text-xs ${dash.modalMuted}`}>
                                <span className="font-semibold">Días base del mes: </span>
                                <span className={textMain}>{diasBaseLine}</span>
                            </p>
                        ) : null}

                        <div className="border-t border-dashed border-slate-300/40 pt-4 dark:border-slate-600/40">
                            <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
                                {canEditAjustes && onSaveAjustes ? (
                                    editMode ? (
                                        <>
                                            <button
                                                type="button"
                                                disabled={saving}
                                                onClick={() => {
                                                    setEditMode(false);
                                                    resetEditDraft();
                                                }}
                                                className={dash.borrarFiltros}
                                            >
                                                Cancelar edición
                                            </button>
                                            <button
                                                type="button"
                                                disabled={saving}
                                                onClick={iniciarGuardarAjustes}
                                                className={`${dash.btnPrimaryCinte} inline-flex items-center gap-1.5 disabled:opacity-50`}
                                            >
                                                <Save size={16} aria-hidden />
                                                Guardar ajustes
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            disabled={saving || novedadesLoading}
                                            onClick={() => setEditMode(true)}
                                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-400/40 px-3 py-1.5 text-xs font-semibold transition hover:bg-slate-500/10 disabled:opacity-50"
                                        >
                                            <Pencil size={14} aria-hidden />
                                            Editar montos
                                        </button>
                                    )
                                ) : null}
                            </div>
                            <ConciliacionesNovedadesAprobadasPanel
                                embedded
                                items={novedadesItems}
                                loading={novedadesLoading}
                                isLight={isLight}
                                tarifaCliente={tarifaCliente}
                                tarifaMaestro={tarifaMaestro}
                                tarifaAjustada={tarifaAjustada}
                                facturaCop={facturaCop}
                                billingAdvanceMode={billingAdvanceMode}
                                ajusteAnticipoMesLabel={
                                    tarifaDetalle?.ajusteAnticipoMesLabel ?? colaborador?.ajusteAnticipoMesLabel
                                }
                                saldoAnticipoTipo={
                                    tarifaDetalle?.saldoAnticipoTipo ?? colaborador?.saldoAnticipoTipo
                                }
                                ajusteAnticipoSumCop={
                                    tarifaDetalle?.ajusteAnticipoSumCop ?? colaborador?.ajusteAnticipoSumCop
                                }
                                ajusteAnticipoSumaCop={
                                    tarifaDetalle?.ajusteAnticipoSumaCop ?? colaborador?.ajusteAnticipoSumaCop
                                }
                                billingMode={billingMode}
                                baseHours={baseHours}
                                horasBaseMes={horasBaseMes}
                                tarifaValorHora={tarifaValorHora}
                                editMode={editMode}
                                draftTarifa={draftTarifa}
                                draftValorHora={draftValorHora}
                                draftValorHorasNovedad={draftValorHorasNovedad}
                                draftMontos={draftMontos}
                                onTarifaChange={editMode && !showValorHoraCol ? setDraftTarifa : null}
                                onValorHoraChange={editMode && showValorHoraCol ? handleValorHoraChange : null}
                                onValorHoraNovedadChange={
                                    editMode && showValorHoraCol ? handleValorHoraNovedadChange : null
                                }
                                onMontoChange={
                                    editMode
                                        ? (id, val) => setDraftMontos((prev) => ({ ...prev, [id]: val }))
                                        : null
                                }
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
                                Revertir cierre
                            </button>
                        ) : null}
                        <button type="button" onClick={onClose} className={dash.borrarFiltros} disabled={saving}>
                            Cancelar
                        </button>
                        {revisionActions.canRechazar ? (
                            <button
                                type="button"
                                disabled={saving || editMode}
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
                                disabled={saving || editMode}
                                onClick={() => abrirConfirmacion('aprobar')}
                                className={`${dash.btnPrimaryCinte} inline-flex items-center gap-1.5 disabled:opacity-50`}
                            >
                                <CheckCircle2 size={16} aria-hidden />
                                {revisionActions.aprobarLabel}
                            </button>
                        ) : null}
                        {!showActions ? (
                            <span className={`text-xs ${dash.modalMuted}`}>
                                {revisionActions.readOnlyMessage ||
                                    (servicioCompleto
                                        ? 'Servicio conciliado — solo lectura.'
                                        : 'Sin acciones disponibles para tu rol en este estado.')}
                            </span>
                        ) : null}
                    </div>
                </div>
            </div>

            {confirmOpen ? (
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
                            Indica la observación {ajustesPendiente ? 'del ajuste' : 'de la revisión'} (obligatoria).
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
                                placeholder={
                                    ajustesPendiente
                                        ? 'Motivo del ajuste de tarifa o montos…'
                                        : esAprobar
                                          ? 'Motivo o comentario de la aprobación…'
                                          : 'Motivo del rechazo…'
                                }
                                value={observaciones}
                                onChange={(e) => setObservaciones(e.target.value)}
                                maxLength={1000}
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
                                onClick={ajustesPendiente ? confirmarAjustes : confirmarAccion}
                                className={
                                    !ajustesPendiente && !esAprobar
                                        ? 'inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50'
                                        : `${dash.btnPrimaryCinte} inline-flex items-center gap-1.5 disabled:opacity-50`
                                }
                            >
                                {saving ? 'Guardando…' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
