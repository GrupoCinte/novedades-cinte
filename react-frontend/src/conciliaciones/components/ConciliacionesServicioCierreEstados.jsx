import { CheckCircle2, Circle, Download } from 'lucide-react';
import { ESTADOS_SERVICIO_META, canExportServicioCompleto, canMarcarServicioConciliada } from '../facturacionLogic.js';
import { CINTE_BTN_PRIMARY } from '../conciliacionesLayout.js';

const STEP_ACTIVE = 'text-[#2F7BB8] border-[#2F7BB8]/40 bg-[#2F7BB8]/10';
const STEP_DONE = 'text-emerald-600 border-emerald-500/30 bg-emerald-500/10';
const STEP_MUTED = 'text-slate-500 border-slate-500/20 bg-transparent';

function stepClass(estadoServicio, stepKey, isLight) {
    const order = ['EN_REVISION', 'LISTO_EXPORT', 'ENVIADA', 'CONCILIADA'];
    const cur = String(estadoServicio || 'EN_REVISION').toUpperCase();
    const curIdx = order.indexOf(cur);
    const stepIdx = order.indexOf(stepKey);
    if (stepIdx < 0) return isLight ? 'text-slate-400 border-slate-200' : 'text-slate-500 border-slate-700/40';
    if (curIdx >= stepIdx && cur !== 'EN_REVISION') {
        if (curIdx > stepIdx || cur === stepKey) return STEP_DONE;
    }
    if (cur === stepKey || (stepKey === 'LISTO_EXPORT' && cur === 'LISTO_EXPORT')) {
        return STEP_ACTIVE;
    }
    if (stepKey === 'LISTO_EXPORT' && (cur === 'ENVIADA' || cur === 'CONCILIADA')) return STEP_DONE;
    return isLight ? `${STEP_MUTED} border-slate-200` : `${STEP_MUTED} border-slate-700/40`;
}

export default function ConciliacionesServicioCierreEstados({
    estadoServicio = 'EN_REVISION',
    servicioCompletoFinanzas = false,
    isLight = true,
    compact = false,
    showLabels = true
}) {
    const cur = String(estadoServicio || 'EN_REVISION').toUpperCase();
    const steps = ESTADOS_SERVICIO_META.filter((s) => s.key !== 'EN_REVISION');

    return (
        <div
            className={`flex flex-wrap items-center gap-1.5 ${compact ? 'text-[10px]' : 'text-xs'}`}
            role="list"
            aria-label="Estados de cierre del servicio"
        >
            {steps.map((step) => {
                const active = cur === step.key;
                const done =
                    (step.key === 'LISTO_EXPORT' && ['LISTO_EXPORT', 'ENVIADA', 'CONCILIADA'].includes(cur)) ||
                    (step.key === 'ENVIADA' && ['ENVIADA', 'CONCILIADA'].includes(cur)) ||
                    (step.key === 'CONCILIADA' && cur === 'CONCILIADA');
                const cls = stepClass(
                    servicioCompletoFinanzas && cur === 'EN_REVISION' ? 'LISTO_EXPORT' : cur,
                    step.key,
                    isLight
                );
                return (
                    <span
                        key={step.key}
                        role="listitem"
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-semibold uppercase tracking-wide ${cls}`}
                        title={step.description || step.label}
                    >
                        {done ? <CheckCircle2 size={compact ? 10 : 12} aria-hidden /> : <Circle size={compact ? 10 : 12} aria-hidden />}
                        {showLabels ? step.shortLabel : null}
                    </span>
                );
            })}
        </div>
    );
}

export function ConciliacionesServicioCierreAcciones({
    item,
    year,
    month,
    userRole,
    isLight,
    exportando = false,
    conciliando = false,
    onExportExcel,
    onMarcarConciliada
}) {
    const estadoServicio = String(item?.estadoServicio || 'EN_REVISION').toUpperCase();
    const finanzasOk =
        item?.consultoresTotal > 0 &&
        (Number(item?.estados?.APROBADO_FINANZAS) || 0) + (Number(item?.estados?.CONCILIADA) || 0) >=
            item.consultoresTotal;
    const canExport = finanzasOk && canExportServicioCompleto(userRole) && estadoServicio !== 'CONCILIADA';
    const canConciliar = canMarcarServicioConciliada(userRole, estadoServicio);

    if (!canExport && !canConciliar) return null;

    const btnSecondary = isLight
        ? 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50'
        : 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-600/50 bg-slate-800/40 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800/70';

    return (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {canExport ? (
                <button
                    type="button"
                    disabled={exportando}
                    onClick={() => onExportExcel?.(item)}
                    className={`${btnSecondary} flex-1`}
                >
                    <Download size={14} aria-hidden />
                    {exportando ? 'Generando…' : estadoServicio === 'ENVIADA' ? 'Volver a descargar Excel' : 'Descargar Excel'}
                </button>
            ) : null}
            {canConciliar ? (
                <button
                    type="button"
                    disabled={conciliando}
                    onClick={() => onMarcarConciliada?.(item)}
                    className={`${CINTE_BTN_PRIMARY} flex-1`}
                >
                    <CheckCircle2 size={14} aria-hidden />
                    {conciliando ? 'Marcando…' : 'Marcar conciliada'}
                </button>
            ) : null}
        </div>
    );
}
