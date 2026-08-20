import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import ConciliacionesServicioCierreEstados from './ConciliacionesServicioCierreEstados.jsx';
import ConciliacionesEmailTokenCountdown from './ConciliacionesEmailTokenCountdown.jsx';
import ConciliacionesMetricCards from './ConciliacionesMetricCards.jsx';
import { ESTADOS_SERVICIO_META } from '../facturacionLogic.js';

function formatCop(n) {
    const x = Number(n) || 0;
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(x);
}
function billingModeLabel(val) {
    switch (String(val || '').trim()) {
        case 'HOURS':
            return 'Horas';
        case 'CALENDAR_DAYS':
            return 'Días calendario';
        case 'BUSINESS_DAYS':
            return 'Días hábiles';
        default:
            return val || '—';
    }
}

function billingTypeLabel(val) {
    switch (String(val || '').trim()) {
        case 'EXPIRED_MONTH':
            return 'Mes vencido';
        case 'CURRENT_MONTH':
            return 'Mes vencido';
        case 'ADVANCE_MONTH':
            return 'Mes anticipado';
        default:
            return val || '—';
    }
}

/**
 * Metadata del servicio en workspace de facturación (colapsable; cliente/servicio van en la barra).
 */
export default function ConciliacionesServicioResumenCard({
    servicio,
    monthLabel,
    consultoresCount = 0,
    servicioCompleto = false,
    estadoServicio = 'EN_REVISION',
    emailExpiraAt = null,
    emailUsadoAt = null,
    liderDecisiones = null,
    diasBaseMes = null,
    diasBaseLabel = null,
    festivosAplicados = false,
    cardClass = '',
    labelMuted,
    headingAccent = '',
    isLight,
    defaultExpanded = false,
    facturacionTotales = null,
    metricDetailRows = []
}) {
    const [expanded, setExpanded] = useState(defaultExpanded);

    if (!servicio) return null;

    const textMain = isLight ? 'text-slate-800' : 'text-slate-200';
    const shell = cardClass || (isLight != null
        ? isLight
            ? 'rounded-xl border border-slate-200 bg-white shadow-sm'
            : 'rounded-xl border border-slate-700/50 bg-[#1e293b] shadow-md'
        : '');

    let diasBaseValue = '—';
    if (diasBaseMes != null && diasBaseLabel) {
        const mode = String(servicio.billingMode || '').trim().toUpperCase();
        if (mode === 'BUSINESS_DAYS') {
            const note = festivosAplicados ? '' : ' (festivos no disponibles)';
            diasBaseValue = `${diasBaseMes}${note}`;
        } else {
            diasBaseValue = String(diasBaseMes);
        }
    }

    const tipoFacturacion = billingTypeLabel(servicio.billingType);
    const estadoLabel =
        ESTADOS_SERVICIO_META.find((s) => s.key === String(estadoServicio || '').toUpperCase())?.label ||
        'En revisión';

    const items = [
        { label: 'Mes facturación', value: monthLabel || '—' },
        { label: 'Tipo facturación', value: tipoFacturacion },
        { label: 'Modo facturación', value: billingModeLabel(servicio.billingMode) },
        ...(diasBaseMes != null && diasBaseLabel ? [{ label: diasBaseLabel, value: diasBaseValue }] : []),
        { label: 'Día cierre', value: servicio.closingDay != null ? String(servicio.closingDay) : '—' },
        { label: 'Inicio contrato', value: servicio.initDate || '—' },
        {
            label: 'Horas base',
            value: servicio.baseHours != null && servicio.baseHours !== '' ? String(servicio.baseHours) : '—'
        },
        { label: 'Consultores', value: String(consultoresCount) },
        { label: 'Estado servicio', value: estadoLabel },
        ...(servicioCompleto ? [{ label: 'Modo', value: 'Solo lectura' }] : [])
    ];

    const headerBtnCls = isLight
        ? 'hover:bg-slate-50/80'
        : 'hover:bg-slate-800/30';

    return (
        <div className={`mb-3 ${shell}`}>
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className={`flex w-full items-start justify-between gap-3 p-3 text-left transition-colors sm:p-4 ${headerBtnCls}`}
            >
                <div className="min-w-0 flex-1">
                    <p className={`text-[10px] font-heading font-bold uppercase tracking-wider ${labelMuted}`}>
                        Detalle del servicio
                    </p>
                    <div className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium ${textMain}`}>
                        <span className={headingAccent || textMain}>{monthLabel || '—'}</span>
                        <span className={labelMuted} aria-hidden>
                            ·
                        </span>
                        <span>{tipoFacturacion}</span>
                        <span className={labelMuted} aria-hidden>
                            ·
                        </span>
                        <span>
                            {consultoresCount} consultor{consultoresCount === 1 ? '' : 'es'}
                        </span>
                        <span className={labelMuted} aria-hidden>
                            ·
                        </span>
                        <span>{estadoLabel}</span>
                        {facturacionTotales?.facturaSum != null ? (
                            <>
                                <span className={labelMuted} aria-hidden>
                                    ·
                                </span>
                                <span className={`font-heading font-bold tabular-nums ${headingAccent || textMain}`}>
                                    {formatCop(facturacionTotales.facturaSum)}
                                </span>
                            </>
                        ) : null}
                    </div>
                </div>
                <span className={`mt-0.5 shrink-0 ${labelMuted}`} aria-hidden>
                    {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </span>
            </button>

            <div className="border-t px-3 pb-3 pt-2 sm:px-4 sm:pb-4 border-slate-200/80 dark:border-slate-700/50">
                <ConciliacionesServicioCierreEstados
                    estadoServicio={estadoServicio}
                    servicioCompletoFinanzas={servicioCompleto}
                    isLight={isLight}
                    compact
                />
                <div className="mt-2">
                    <ConciliacionesEmailTokenCountdown
                        emailExpiraAt={emailExpiraAt}
                        emailUsadoAt={emailUsadoAt}
                        estadoServicio={estadoServicio}
                        liderDecisiones={liderDecisiones}
                        isLight={isLight}
                        compact
                    />
                </div>
            </div>

            {expanded ? (
                <div className="border-t border-slate-200/80 dark:border-slate-700/50">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 p-3 text-xs sm:grid-cols-4 sm:gap-y-3 sm:p-4">
                        {items.map(({ label, value }) => (
                            <div key={label} className="min-w-0">
                                <span className={`block text-[10px] font-semibold uppercase tracking-wide ${labelMuted}`}>
                                    {label}
                                </span>
                                <span className={`mt-0.5 block truncate text-sm font-medium ${textMain}`} title={value}>
                                    {value}
                                </span>
                            </div>
                        ))}
                    </div>

                    {String(servicio?.billingType || '').trim().toUpperCase() === 'ADVANCE_MONTH' ? (
                        <p
                            className={`mx-3 rounded-lg border px-3 py-2 text-xs sm:mx-4 ${
                                isLight
                                    ? 'border-[#65BCF7]/30 bg-[#2F7BB8]/5 text-slate-700'
                                    : 'border-[#65BCF7]/25 bg-[#2F7BB8]/10 text-slate-300'
                            }`}
                        >
                            Mes anticipado: la tarifa del periodo se factura completa. Las novedades del mes se liquidan
                            como ajuste (saldo a favor o en contra) en el cierre del mes siguiente.
                        </p>
                    ) : null}

                    {facturacionTotales ? (
                        <div className="border-t border-slate-200/80 px-3 pb-3 pt-3 dark:border-slate-700/50 sm:px-4 sm:pb-4">
                            <p className={`mb-2 text-[10px] font-heading font-bold uppercase tracking-wider ${labelMuted}`}>
                                Resumen facturación
                            </p>
                            <ConciliacionesMetricCards
                                totales={facturacionTotales}
                                detailRows={metricDetailRows}
                                cardClass={cardClass}
                                headingAccent={headingAccent}
                                labelMuted={labelMuted}
                                isLight={isLight}
                                compact
                            />
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
