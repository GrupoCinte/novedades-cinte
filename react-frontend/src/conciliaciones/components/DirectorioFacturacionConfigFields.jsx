import { useMemo } from 'react';
import { cutoffCycleDates, formatPeriodoEs } from '../conciliacionesCiclos.js';
import { formatSlaBandsPreview, validateFacturacionForm } from '../../directorio/directorioFacturacionConfig.js';

const REGLA_OPTIONS = [
    { value: 'MES_CALENDARIO', label: 'Mes calendario' },
    { value: 'CALENDARIO_30', label: 'Calendario 30' },
    { value: 'DIAS_HABILES', label: 'Días hábiles' },
    { value: 'HORAS_BASE', label: 'Horas base' }
];

const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function pad2(n) {
    return String(n).padStart(2, '0');
}

function previewCierreEnd(form, refDate = new Date()) {
    const year = refDate.getFullYear();
    const month = refDate.getMonth() + 1;
    const tipo = form.reglaTipo || 'CALENDARIO_30';
    const dia = Number(form.diaCorte);

    if (tipo === 'MES_CALENDARIO' || !Number.isInteger(dia) || dia < 1 || dia > 31) {
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        return formatPeriodoEs(`${year}-${pad2(month)}-${pad2(lastDay)}`);
    }

    const cycle = cutoffCycleDates({ year, month, diaCorte: dia });
    return cycle ? formatPeriodoEs(cycle.end) : '';
}

function previewCierreMonthLabel(refDate = new Date()) {
    return `${MESES_CORTO[refDate.getMonth()]} ${refDate.getFullYear()}`;
}

export default function DirectorioFacturacionConfigFields({
    value,
    onChange,
    isLight,
    field,
    dash,
    disabled = false,
    showPreview = true
}) {
    const validation = useMemo(() => validateFacturacionForm(value), [value]);
    const previewEnd = useMemo(() => previewCierreEnd(value), [value]);
    const previewMonth = useMemo(() => previewCierreMonthLabel(), []);
    const slaBandsPreview = useMemo(
        () => formatSlaBandsPreview(value.slaDiasVerde, value.slaDiasAmarillo),
        [value.slaDiasVerde, value.slaDiasAmarillo]
    );

    const setField = (key, next) => {
        onChange({ ...value, [key]: next });
    };

    return (
        <div
            className={`rounded-xl border p-4 space-y-3 ${
                isLight ? 'border-cyan-200 bg-cyan-50/40' : 'border-cyan-500/25 bg-cyan-950/20'
            }`}
        >
            <h4 className={`text-xs font-bold uppercase tracking-wide ${dash.titleLg}`}>
                Conciliación / Facturación
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <label className={`block ${dash.filtrosDrawerLabel} mb-1`}>Día de corte</label>
                    <input
                        type="number"
                        min={1}
                        max={31}
                        className={`w-full ${field}`}
                        value={value.diaCorte}
                        onChange={(e) => setField('diaCorte', e.target.value)}
                        disabled={disabled}
                        required
                    />
                    {validation.errors.diaCorte ? (
                        <p className={`text-xs mt-1 ${isLight ? 'text-red-700' : 'text-red-300/90'}`}>
                            {validation.errors.diaCorte}
                        </p>
                    ) : showPreview && previewEnd ? (
                        <p className={`text-xs mt-1 ${dash.modalMuted}`}>
                            Próximo cierre ({previewMonth}): {previewEnd}
                        </p>
                    ) : null}
                </div>
                <div>
                    <label className={`block ${dash.filtrosDrawerLabel} mb-1`}>Regla de facturación</label>
                    <select
                        className={`w-full ${field}`}
                        value={value.reglaTipo}
                        onChange={(e) => setField('reglaTipo', e.target.value)}
                        disabled={disabled}
                    >
                        {REGLA_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                    <p className={`mt-1 text-[11px] ${dash.modalMuted}`}>
                        El motor calcula con un solo tipo; el detalle documenta excepciones por frente o país.
                    </p>
                </div>
                {value.reglaTipo === 'HORAS_BASE' ? (
                    <div>
                        <label className={`block ${dash.filtrosDrawerLabel} mb-1`}>Horas base</label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={`w-full ${field}`}
                            value={value.horasBase}
                            onChange={(e) => setField('horasBase', e.target.value)}
                            disabled={disabled}
                            required
                        />
                        {validation.errors.horasBase ? (
                            <p className={`text-xs mt-1 ${isLight ? 'text-red-700' : 'text-red-300/90'}`}>
                                {validation.errors.horasBase}
                            </p>
                        ) : null}
                    </div>
                ) : null}
                <div className="sm:col-span-2">
                    <label className={`block ${dash.filtrosDrawerLabel} mb-1`}>Detalle (opcional)</label>
                    <textarea
                        className={`w-full ${field} min-h-[4rem]`}
                        value={value.reglaDetalle}
                        onChange={(e) => setField('reglaDetalle', e.target.value)}
                        disabled={disabled}
                        placeholder="Ej. CLARO: staffing cal. 30 y fábrica día hábil · EXPERIAN: dev 180 h, Infra días hábiles"
                    />
                </div>
            </div>
            <div className="border-t border-cyan-500/15 pt-3 space-y-3">
                <h5 className={`text-[11px] font-bold uppercase tracking-wide ${dash.titleLg}`}>
                    Alertas SLA (días al corte)
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className={`block ${dash.filtrosDrawerLabel} mb-1`}>Desde cuántos días → verde</label>
                        <input
                            type="number"
                            min={0}
                            max={60}
                            className={`w-full ${field}`}
                            value={value.slaDiasVerde}
                            onChange={(e) => setField('slaDiasVerde', e.target.value)}
                            disabled={disabled}
                            required
                        />
                        {validation.errors.slaDiasVerde ? (
                            <p className={`text-xs mt-1 ${isLight ? 'text-red-700' : 'text-red-300/90'}`}>
                                {validation.errors.slaDiasVerde}
                            </p>
                        ) : null}
                    </div>
                    <div>
                        <label className={`block ${dash.filtrosDrawerLabel} mb-1`}>
                            Desde cuántos días → amarillo
                        </label>
                        <input
                            type="number"
                            min={0}
                            max={60}
                            className={`w-full ${field}`}
                            value={value.slaDiasAmarillo}
                            onChange={(e) => setField('slaDiasAmarillo', e.target.value)}
                            disabled={disabled}
                            required
                        />
                        {validation.errors.slaDiasAmarillo ? (
                            <p className={`text-xs mt-1 ${isLight ? 'text-red-700' : 'text-red-300/90'}`}>
                                {validation.errors.slaDiasAmarillo}
                            </p>
                        ) : null}
                    </div>
                </div>
                <p className={`text-[11px] ${dash.modalMuted}`}>{slaBandsPreview}</p>
            </div>
        </div>
    );
}
