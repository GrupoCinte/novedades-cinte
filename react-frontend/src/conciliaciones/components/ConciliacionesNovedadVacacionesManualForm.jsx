import { useMemo, useState, useCallback } from 'react';
import { CalendarPlus, Save, X } from 'lucide-react';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';
import { countBusinessDaysInclusive } from '../../novedadRules.js';
import { computeMontoNovedadPreview } from '../facturacionLogic.js';
import { createConciliacionNovedadManual } from '../conciliacionesApi.js';

function formatCop(n) {
    const x = Math.round(Number(n) || 0);
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    }).format(x);
}

export default function ConciliacionesNovedadVacacionesManualForm({
    token,
    cliente,
    cedula,
    anio,
    mes,
    servicioId = '',
    tarifaCliente = 0,
    horasBaseMes = null,
    tarifaValorHora = null,
    billingMode = null,
    billingQueryParams = {},
    festivosSet = null,
    isLight = true,
    saving = false,
    onCancel,
    onCreated
}) {
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const [fechaInicio, setFechaInicio] = useState('');
    const [fechaFin, setFechaFin] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const hoursMode = String(billingMode || '').trim().toUpperCase() === 'HOURS';
    const festivos = festivosSet instanceof Set ? festivosSet : new Set();

    const diasHabiles = useMemo(() => {
        if (!fechaInicio || !fechaFin || fechaFin < fechaInicio) return 0;
        return countBusinessDaysInclusive(fechaInicio, fechaFin, festivos);
    }, [fechaInicio, fechaFin, festivos]);

    const previewMonto = useMemo(() => {
        if (diasHabiles <= 0) return 0;
        return computeMontoNovedadPreview(
            {
                tipoNovedad: 'Vacaciones en tiempo',
                medida: 'days',
                cantidad: diasHabiles,
                montoOrigen: 'calculado',
                montoCalculado: true
            },
            {
                tarifa: tarifaCliente,
                horasBaseMes,
                valorHora: tarifaValorHora,
                hoursMode
            }
        );
    }, [diasHabiles, tarifaCliente, horasBaseMes, tarifaValorHora, hoursMode]);

    const canSave = diasHabiles > 0 && !submitting && !saving;

    const handleSubmit = useCallback(async () => {
        if (!canSave) return;
        setSubmitting(true);
        setErrorMsg('');
        try {
            const out = await createConciliacionNovedadManual(token, {
                cliente,
                cedula,
                anio,
                mes,
                servicioId: servicioId || undefined,
                tipoNovedad: 'Vacaciones en tiempo',
                fechaInicio,
                fechaFin,
                ...billingQueryParams
            });
            onCreated?.(out);
            setFechaInicio('');
            setFechaFin('');
        } catch (e) {
            setErrorMsg(e?.message || 'No se pudo registrar la novedad');
        } finally {
            setSubmitting(false);
        }
    }, [
        canSave,
        token,
        cliente,
        cedula,
        anio,
        mes,
        servicioId,
        fechaInicio,
        fechaFin,
        billingQueryParams,
        onCreated
    ]);

    return (
        <div className="mb-4 rounded-lg border border-slate-300/50 bg-slate-50/60 p-4 dark:border-slate-600/50 dark:bg-slate-900/40">
            <p className={`mb-3 text-sm font-semibold ${dash.modalMuted}`}>Vacaciones en tiempo (manual)</p>
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs">
                    <span className={`mb-1 block font-semibold ${dash.modalMuted}`}>Fecha inicio</span>
                    <input
                        type="date"
                        value={fechaInicio}
                        onChange={(e) => setFechaInicio(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    />
                </label>
                <label className="block text-xs">
                    <span className={`mb-1 block font-semibold ${dash.modalMuted}`}>Fecha fin</span>
                    <input
                        type="date"
                        value={fechaFin}
                        min={fechaInicio || undefined}
                        onChange={(e) => setFechaFin(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                    />
                </label>
            </div>
            <p className={`mt-3 text-xs ${dash.modalMuted}`}>
                Días hábiles estimados:{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-100">{diasHabiles}</span>
                {' · '}
                Deducción estimada:{' '}
                <span className="font-semibold text-rose-700 dark:text-rose-300">{formatCop(previewMonto)}</span>
            </p>
            {errorMsg ? (
                <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400" role="alert">
                    {errorMsg}
                </p>
            ) : null}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button type="button" onClick={onCancel} disabled={submitting} className={dash.borrarFiltros}>
                    <X size={14} className="mr-1 inline" aria-hidden />
                    Cancelar
                </button>
                <button
                    type="button"
                    disabled={!canSave}
                    onClick={handleSubmit}
                    className={`${dash.btnPrimaryCinte} inline-flex items-center gap-1.5 disabled:opacity-50`}
                >
                    <Save size={14} aria-hidden />
                    {submitting ? 'Guardando…' : 'Guardar vacaciones'}
                </button>
            </div>
        </div>
    );
}

export function ConciliacionesVacacionesManualToggleButton({ onClick, disabled = false }) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-200"
        >
            <CalendarPlus size={14} aria-hidden />
            Agregar vacaciones en tiempo
        </button>
    );
}
