import { Clock, ArrowRight, AlertCircle } from 'lucide-react';
import { colaCierreProgress } from '../facturacionAggregate.js';
import { resolveTarjetaCierreBadge } from '../facturacionLogic.js';
import ConciliacionesFacturacionEstadosResumen from './ConciliacionesFacturacionEstadosResumen.jsx';
import ConciliacionesServicioCierreEstados, {
    ConciliacionesServicioCierreAcciones
} from './ConciliacionesServicioCierreEstados.jsx';
import { CINTE_BTN_PRIMARY, CINTE_PROGRESS_FILL, CINTE_CHIP_BLUE } from '../conciliacionesLayout.js';

function formatCop(n) {
    const x = Number(n) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}

const COLA_CHIP = {
    PENDIENTE: 'text-amber-500 border-amber-500/30 bg-amber-500/10',
    EN_REVISION: CINTE_CHIP_BLUE,
    CONCILIADA: 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10',
    DEVUELTA: 'text-red-500 border-red-500/30 bg-red-500/10',
    SIN_CONSULTORES: 'text-slate-500 border-slate-500/30 bg-slate-500/10',
    SERVICIO_LISTO_EXPORT: 'text-violet-500 border-violet-500/30 bg-violet-500/10',
    SERVICIO_ENVIADA: 'text-[#2F7BB8] border-[#2F7BB8]/30 bg-[#2F7BB8]/10',
    SERVICIO_CONCILIADA: 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10'
};

export default function ConciliacionesColaCierresCard({
    item,
    onAbrirCierre,
    onExportExcel,
    onEnviarCorreo,
    onMarcarConciliada,
    exportandoId = '',
    conciliandoId = '',
    userRole = '',
    year,
    month,
    headingAccent,
    labelMuted,
    isLight
}) {
    const progress = colaCierreProgress(item);
    const disabled = item.estadoCola === 'SIN_CONSULTORES';
    const servicioConciliada = String(item.estadoServicio || '').toUpperCase() === 'CONCILIADA';
    const estados = item.estados || {};
    const totales = item.totales || {};
    const tarjetaBadge = resolveTarjetaCierreBadge(item);

    const cardBorder = isLight
        ? 'border-slate-200 bg-white hover:border-[#2F7BB8]/35 hover:shadow-md'
        : 'border-[#0F2337] bg-[#0A1F30]/80 hover:border-[#65BCF7]/25 hover:shadow-lg hover:shadow-[#2F7BB8]/10';

    return (
        <article
            className={`group flex flex-col rounded-xl border p-4 transition-all ${cardBorder} ${disabled ? 'opacity-75' : ''}`}
        >
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <p className={`truncate text-xs font-semibold uppercase tracking-wide ${labelMuted}`}>{item.client}</p>
                    <h3 className={`mt-0.5 truncate font-heading text-base font-bold ${headingAccent}`}>{item.serviceName}</h3>
                </div>
                <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${COLA_CHIP[tarjetaBadge.chipKey] || COLA_CHIP.PENDIENTE}`}
                >
                    {tarjetaBadge.label}
                </span>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <span
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 ${isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-slate-700/50 bg-slate-800/40 text-slate-300'}`}
                >
                    <Clock size={12} aria-hidden />
                    Cierre día {item.closingDay ?? '—'}
                </span>
                <span className={labelMuted}>
                    {item.consultoresCerrados ?? 0}/{item.consultoresTotal ?? 0} consultores cerrados
                </span>
            </div>

            <div className="mb-3">
                <div
                    className={`h-2 overflow-hidden rounded-full ${isLight ? 'bg-slate-100' : 'bg-slate-800/60'}`}
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Progreso de cierre ${progress}%`}
                >
                    <div
                        className={CINTE_PROGRESS_FILL}
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            <div className="mb-3">
                <ConciliacionesFacturacionEstadosResumen
                    variant="chulos"
                    hideZeroCounts
                    estados={estados}
                    isLight={isLight}
                />
            </div>

            <div className="mb-3 space-y-1">
                <p className={`text-[10px] font-bold uppercase tracking-wider ${labelMuted}`}>Estado servicio</p>
                <ConciliacionesServicioCierreEstados
                    estadoServicio={item.estadoServicio}
                    servicioCompletoFinanzas={
                        item.estadoCola === 'CONCILIADA' ||
                        ['LISTO_EXPORT', 'ENVIADA', 'CONCILIADA'].includes(String(item.estadoServicio || '').toUpperCase())
                    }
                    isLight={isLight}
                    compact
                />
            </div>

            <ConciliacionesServicioCierreAcciones
                item={item}
                year={year}
                month={month}
                userRole={userRole}
                isLight={isLight}
                exportando={exportandoId === item.servicioId}
                conciliando={conciliandoId === item.servicioId}
                onExportExcel={onExportExcel}
                onEnviarCorreo={onEnviarCorreo}
                onMarcarConciliada={onMarcarConciliada}
            />

            <div className={`mb-4 grid grid-cols-3 gap-2 rounded-lg border p-2 text-center text-xs ${isLight ? 'border-slate-100 bg-slate-50/80' : 'border-slate-700/40 bg-slate-900/30'}`}>
                <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${labelMuted}`}>Tarifa</p>
                    <p className={`mt-0.5 truncate font-semibold tabular-nums ${headingAccent}`}>{formatCop(totales.tarifaSum)}</p>
                </div>
                <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${labelMuted}`}>Deducciones</p>
                    <p className={`mt-0.5 truncate font-semibold tabular-nums ${headingAccent}`}>{formatCop(totales.deduccionSum)}</p>
                </div>
                <div>
                    <p className={`text-[10px] font-bold uppercase tracking-wider ${labelMuted}`}>Factura</p>
                    <p className={`mt-0.5 truncate font-semibold tabular-nums ${headingAccent}`}>{formatCop(totales.facturaSum)}</p>
                </div>
            </div>

            {disabled ? (
                <div className={`mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${isLight ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
                    <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden />
                    <span>Asocia consultores al servicio en el módulo Servicios.</span>
                </div>
            ) : null}

            <button
                type="button"
                disabled={disabled}
                onClick={() => onAbrirCierre(item)}
                className={`${CINTE_BTN_PRIMARY} mt-auto w-full`}
                aria-label={servicioConciliada ? 'Ver conciliación conciliada en solo lectura' : 'Abrir conciliación'}
            >
                {servicioConciliada ? 'Conciliada (solo lectura)' : 'Abrir conciliación'}
                <ArrowRight size={16} aria-hidden />
            </button>
        </article>
    );
}
