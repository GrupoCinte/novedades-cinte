import { useState, useEffect, useRef, useMemo } from 'react';
import { X, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';
import {
    defaultMasivaEtapaObjetivo,
    getMasivaRevisionDefaults,
    listMasivaEtapaOptions,
    validateRevisionObservacion
} from '../facturacionLogic.js';

export default function ConciliacionesAccionMasivaModal({
    open,
    onClose,
    onSave,
    userRole = '',
    serviceRows = [],
    filteredRows = [],
    cliente,
    hasActiveFilters = false,
    saving,
    isLight
}) {
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const [accion, setAccion] = useState('aprobar');
    const [observaciones, setObservaciones] = useState('');
    const [applyToFiltered, setApplyToFiltered] = useState(false);
    const [etapaObjetivo, setEtapaObjetivo] = useState('ANALISTA');
    const [errorMsg, setErrorMsg] = useState('');

    const closeBtnRef = useRef(null);
    const totalCount = serviceRows.length;
    const filteredCount = filteredRows.length;

    const scopeRows = useMemo(
        () => (applyToFiltered && hasActiveFilters ? filteredRows : serviceRows),
        [applyToFiltered, hasActiveFilters, filteredRows, serviceRows]
    );

    const etapaOptions = useMemo(
        () => listMasivaEtapaOptions(userRole, scopeRows, accion),
        [userRole, scopeRows, accion]
    );

    const masivaDefaults = useMemo(
        () => getMasivaRevisionDefaults(userRole, scopeRows, accion, etapaObjetivo),
        [userRole, scopeRows, accion, etapaObjetivo]
    );

    const aprobarDefaults = useMemo(
        () => getMasivaRevisionDefaults(userRole, scopeRows, 'aprobar', etapaObjetivo),
        [userRole, scopeRows, etapaObjetivo]
    );

    const rechazarDefaults = useMemo(
        () => getMasivaRevisionDefaults(userRole, scopeRows, 'rechazar', etapaObjetivo),
        [userRole, scopeRows, etapaObjetivo]
    );

    const targetCount = masivaDefaults.eligibleCount;
    const skippedCount = Math.max(0, scopeRows.length - targetCount);
    const esAprobar = accion === 'aprobar';
    const showAccionToggles = false;
    const showEtapaSelector = etapaOptions.length > 1;

    const submitLabel = useMemo(() => {
        if (saving) return 'Procesando…';
        const n = targetCount;
        if (!esAprobar) return `Rechazar cierres (${n})`;
        if (etapaObjetivo === 'ANALISTA') return `Aprobar cierres (${n})`;
        return `Aplicar a ${n}`;
    }, [saving, esAprobar, etapaObjetivo, targetCount]);

    useEffect(() => {
        if (open) {
            const scope = applyToFiltered && hasActiveFilters ? filteredRows : serviceRows;
            const defaultEtapa = defaultMasivaEtapaObjetivo(userRole, scope, 'aprobar') || 'ANALISTA';
            setEtapaObjetivo(defaultEtapa);
            setAccion(aprobarDefaults.accionDefault || 'aprobar');
            setObservaciones('');
            setApplyToFiltered(hasActiveFilters);
            setErrorMsg('');
            setTimeout(() => {
                if (closeBtnRef.current) closeBtnRef.current.focus();
            }, 50);
        }
    }, [open, hasActiveFilters, userRole, serviceRows, filteredRows, applyToFiltered, aprobarDefaults.accionDefault]);

    useEffect(() => {
        if (!open || !etapaOptions.length) return;
        const valid = etapaOptions.some((o) => o.etapaObjetivo === etapaObjetivo);
        if (!valid) {
            setEtapaObjetivo(etapaOptions[0].etapaObjetivo);
        }
    }, [open, etapaOptions, etapaObjetivo]);

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

        const validation = validateRevisionObservacion(observaciones);
        if (!validation.ok) {
            setErrorMsg(validation.error);
            return;
        }

        if (!etapaObjetivo || targetCount === 0) {
            setErrorMsg('No hay consultores elegibles para esta etapa');
            return;
        }

        try {
            await onSave({
                accion,
                observaciones: observaciones.trim(),
                applyToFiltered: Boolean(applyToFiltered && hasActiveFilters),
                etapaObjetivo
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
                            <CheckCircle2 size={20} className="text-[#65BCF7]" />
                            {masivaDefaults.title}: {cliente}
                        </h2>
                        <p className={`mt-0.5 text-xs font-semibold ${dash.modalMuted}`}>
                            Se procesarán {targetCount} consultor(es) elegibles
                            {applyToFiltered && hasActiveFilters
                                ? ` (filtro activo: ${filteredCount} de ${totalCount})`
                                : ` del servicio en el mes (${totalCount} en total)`}
                            {skippedCount > 0
                                ? ` · ${skippedCount} omitido(s) (otra etapa o estado no aplicable)`
                                : ''}
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

                        {!masivaDefaults.etapa ? (
                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-200">
                                No hay consultores elegibles para esta acción con tu rol en la selección actual.
                            </div>
                        ) : (
                            <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-blue-400">
                                Solo se actualizarán los consultores pendientes de la etapa seleccionada. Los que ya
                                avanzaron a otra etapa no se modificarán.
                            </div>
                        )}

                        {showEtapaSelector ? (
                            <div className="flex flex-col gap-2">
                                <span className={`text-xs font-bold ${dash.titleLg}`}>Etapa de la acción masiva</span>
                                <div className="flex flex-wrap gap-2">
                                    {etapaOptions.map((opt) => {
                                        const selected = etapaObjetivo === opt.etapaObjetivo;
                                        return (
                                            <button
                                                key={opt.etapaObjetivo}
                                                type="button"
                                                onClick={() => {
                                                    setEtapaObjetivo(opt.etapaObjetivo);
                                                    if (opt.etapaObjetivo === 'ANALISTA') setAccion('aprobar');
                                                }}
                                                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                                                    selected
                                                        ? `${dash.btnPrimaryCinte}`
                                                        : isLight
                                                          ? 'border-slate-200 text-slate-700'
                                                          : 'border-slate-600/50 text-slate-300'
                                                }`}
                                            >
                                                {opt.aprobarLabel} ({opt.eligibleCount})
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : null}

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

                        {showAccionToggles ? (
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => setAccion('aprobar')}
                                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                                        esAprobar
                                            ? `${dash.btnPrimaryCinte}`
                                            : isLight
                                              ? 'border-slate-200 text-slate-700'
                                              : 'border-slate-600/50 text-slate-300'
                                    }`}
                                >
                                    <CheckCircle2 size={16} aria-hidden />
                                    {aprobarDefaults.aprobarLabel}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAccion('rechazar')}
                                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                                        !esAprobar
                                            ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                            : isLight
                                              ? 'border-slate-200 text-slate-700'
                                              : 'border-slate-600/50 text-slate-300'
                                    }`}
                                >
                                    <XCircle size={16} aria-hidden />
                                    {rechazarDefaults.rechazarLabel || 'Rechazar cierres'}
                                </button>
                            </div>
                        ) : null}

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="masiva-observaciones" className={`text-xs font-bold ${dash.titleLg}`}>
                                Observación <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                id="masiva-observaciones"
                                required
                                rows="4"
                                placeholder={esAprobar ? 'Motivo o comentario de la aprobación…' : 'Motivo del rechazo…'}
                                value={observaciones}
                                onChange={(e) => setObservaciones(e.target.value)}
                                maxLength={1000}
                                className={`resize-none rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2F7BB8] ${inputBg}`}
                            />
                        </div>
                    </div>

                    <div className={`${dash.modalFooter} px-1`}>
                        <button type="button" onClick={onClose} className={dash.borrarFiltros}>
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || targetCount === 0 || !masivaDefaults.etapa}
                            className={`${dash.btnPrimaryCinte} inline-flex items-center gap-1.5 disabled:opacity-50`}
                        >
                            {submitLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
