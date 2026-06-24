import { useState, useEffect, useRef, useMemo } from 'react';
import { X, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';
import { getMasivaRevisionDefaults, validateRevisionObservacion } from '../facturacionLogic.js';

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
    const [errorMsg, setErrorMsg] = useState('');

    const closeBtnRef = useRef(null);
    const totalCount = serviceRows.length;
    const filteredCount = filteredRows.length;

    const scopeRows = useMemo(
        () => (applyToFiltered && hasActiveFilters ? filteredRows : serviceRows),
        [applyToFiltered, hasActiveFilters, filteredRows, serviceRows]
    );

    const aprobarDefaults = useMemo(
        () => getMasivaRevisionDefaults(userRole, scopeRows, 'aprobar'),
        [userRole, scopeRows]
    );
    const rechazarDefaults = useMemo(
        () => getMasivaRevisionDefaults(userRole, scopeRows, 'rechazar'),
        [userRole, scopeRows]
    );
    const masivaDefaults = useMemo(
        () => getMasivaRevisionDefaults(userRole, scopeRows, accion),
        [userRole, scopeRows, accion]
    );

    const targetCount = masivaDefaults.eligibleCount;
    const skippedCount = Math.max(0, scopeRows.length - targetCount);

    useEffect(() => {
        if (open) {
            setAccion(aprobarDefaults.accionDefault || 'aprobar');
            setObservaciones('');
            setApplyToFiltered(hasActiveFilters);
            setErrorMsg('');
            setTimeout(() => {
                if (closeBtnRef.current) closeBtnRef.current.focus();
            }, 50);
        }
    }, [open, hasActiveFilters, aprobarDefaults.accionDefault]);

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

        try {
            await onSave({
                accion,
                observaciones: observaciones.trim(),
                applyToFiltered: Boolean(applyToFiltered && hasActiveFilters)
            });
            onClose();
        } catch (err) {
            setErrorMsg(err.message || 'Error al procesar la acción masiva');
        }
    };

    const inputBg = isLight ? 'field-control bg-white text-slate-900' : 'field-control';
    const esAprobar = accion === 'aprobar';

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
                            {skippedCount > 0 ? ` · ${skippedCount} omitido(s) por estado o rol` : ''}
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
                        ) : masivaDefaults.etapa === 'MIXED' ? (
                            <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-blue-400">
                                Hay consultores en distintas etapas; solo se actualizarán los elegibles según el estado de
                                cada uno (analista o nómina).
                            </div>
                        ) : (
                            <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-blue-400">
                                La observación quedará registrada en el historial de cada consultor procesado.
                            </div>
                        )}

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
                            {rechazarDefaults.eligibleCount > 0 ? (
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
                            ) : null}
                        </div>

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
                            {saving ? 'Procesando…' : `Aplicar a ${targetCount}`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
