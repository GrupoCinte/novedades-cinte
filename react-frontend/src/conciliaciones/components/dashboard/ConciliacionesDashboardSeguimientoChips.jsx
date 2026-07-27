import { CINTE_HEADING } from '../../conciliacionesLayout.js';

const SERVICIO_ORDER = ['EN_REVISION', 'LISTO_EXPORT', 'ENVIADA', 'CONCILIADA'];

const SERVICIO_LABELS = {
    EN_REVISION: 'En revisión',
    LISTO_EXPORT: 'Listo export',
    ENVIADA: 'Enviada',
    CONCILIADA: 'Conciliada',
    ESPERANDO_LIDER: 'Esperando líder'
};

/**
 * Chips de seguimiento solo por estado de servicio.
 * Click navega a facturación con el filtro correspondiente.
 */
export default function ConciliacionesDashboardSeguimientoChips({
    resumen,
    dash,
    labelMuted,
    isLight,
    onFilterServicio
}) {
    if (!resumen) return null;

    const porServicio = resumen.porServicio || {};
    const chips = SERVICIO_ORDER.map((key) => ({
        key,
        label: SERVICIO_LABELS[key],
        count: Number(porServicio[key]) || 0,
        filter: { estadoServicio: key }
    }));

    if ((Number(resumen.esperandoLider) || 0) > 0) {
        chips.push({
            key: 'ESPERANDO_LIDER',
            label: SERVICIO_LABELS.ESPERANDO_LIDER,
            count: Number(resumen.esperandoLider) || 0,
            filter: { seguimiento: 'ESPERANDO_LIDER' },
            accent: true,
            hint:
                (Number(resumen.enviadaVencida) || 0) > 0
                    ? `${resumen.enviadaVencida} venc.`
                    : null
        });
    }

    const chipClass = (chip) => {
        const base = isLight
            ? 'border-slate-200 bg-white hover:border-[#2F7BB8]/50 hover:bg-[#2F7BB8]/5'
            : 'border-slate-700/50 bg-[#0A1F30]/60 hover:border-[#65BCF7]/40 hover:bg-[#2F7BB8]/10';
        const accent = chip.accent
            ? isLight
                ? 'border-[#2F7BB8]/35 bg-[#2F7BB8]/10 hover:bg-[#2F7BB8]/15'
                : 'border-[#65BCF7]/35 bg-[#2F7BB8]/15 hover:bg-[#2F7BB8]/25'
            : base;
        const disabled = chip.count === 0 ? 'opacity-45 hover:border-inherit hover:bg-inherit cursor-default' : 'cursor-pointer';
        return `flex flex-col items-start justify-center rounded-xl border px-4 py-3 text-left transition-colors ${accent} ${disabled}`;
    };

    return (
        <div className={`${dash.card} p-4 sm:p-5`}>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                    <h2 className={`font-heading text-sm font-bold ${CINTE_HEADING}`}>
                        Seguimiento de conciliaciones
                    </h2>
                    <p className={`mt-0.5 text-xs ${labelMuted}`}>
                        Clic en un estado para ver esos servicios en Facturación
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {chips.map((chip) => (
                    <button
                        key={chip.key}
                        type="button"
                        disabled={chip.count === 0}
                        className={chipClass(chip)}
                        onClick={() => chip.count > 0 && onFilterServicio?.(chip.filter)}
                        aria-label={`Ver servicios en ${chip.label}: ${chip.count}`}
                    >
                        <span
                            className={`text-[10px] font-semibold uppercase tracking-wide ${
                                chip.accent
                                    ? isLight
                                        ? 'text-[#004D87]'
                                        : 'text-[#65BCF7]'
                                    : labelMuted
                            }`}
                        >
                            {chip.label}
                        </span>
                        <span className={`mt-1 font-heading text-2xl font-extrabold tabular-nums ${CINTE_HEADING}`}>
                            {chip.count}
                        </span>
                        {chip.hint ? (
                            <span className="mt-0.5 text-[10px] font-semibold text-red-500">{chip.hint}</span>
                        ) : null}
                    </button>
                ))}
            </div>
        </div>
    );
}
