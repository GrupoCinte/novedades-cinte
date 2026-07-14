import { useEffect, useMemo, useState } from 'react';

/**
 * Multi-select de líderes del catálogo.
 * `value` vacío = todos los líderes (persistencia backend).
 * En UI, desmarcar «Todos» activa selección individual.
 */
export default function LideresMultiSelect({
    lideres = [],
    value = [],
    onChange,
    onAllLeadersModeChange,
    disabled = false,
    isLight,
    className = ''
}) {
    const selected = useMemo(
        () => new Set((Array.isArray(value) ? value : []).map((v) => String(v || '').trim())),
        [value]
    );

    const [individualMode, setIndividualMode] = useState(() => selected.size > 0);

    useEffect(() => {
        if (selected.size > 0) setIndividualMode(true);
    }, [selected.size]);

    const allSelected = !individualMode && selected.size === 0;

    useEffect(() => {
        onAllLeadersModeChange?.(allSelected);
    }, [allSelected, onAllLeadersModeChange]);

    const toggleAll = () => {
        if (allSelected) {
            setIndividualMode(true);
            onChange([]);
            return;
        }
        setIndividualMode(false);
        onChange([]);
    };

    const toggleOne = (lider) => {
        setIndividualMode(true);
        const next = new Set(selected);
        if (next.has(lider)) next.delete(lider);
        else next.add(lider);
        onChange([...next]);
    };

    const boxClass = isLight
        ? 'rounded-lg border border-slate-200 bg-white'
        : 'rounded-lg border border-slate-700/50 bg-slate-900/40';

    if (!lideres.length) {
        return (
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Seleccione un cliente para cargar líderes.
            </p>
        );
    }

    return (
        <div className={`${boxClass} max-h-40 overflow-y-auto p-2 ${className}`}>
            <label
                className={`mb-1 flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm font-semibold ${isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/50'}`}
            >
                <input type="checkbox" checked={allSelected} disabled={disabled} onChange={toggleAll} />
                <span>Todos los líderes</span>
            </label>
            {lideres.map((lider) => {
                const checked = allSelected || selected.has(lider);
                const rowDisabled = disabled || allSelected;
                return (
                    <label
                        key={lider}
                        className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
                            rowDisabled
                                ? 'cursor-default opacity-70'
                                : `cursor-pointer ${isLight ? 'hover:bg-slate-50 text-slate-700' : 'hover:bg-slate-800/50 text-slate-300'}`
                        }`}
                    >
                        <input
                            type="checkbox"
                            checked={checked}
                            disabled={rowDisabled}
                            onChange={() => toggleOne(lider)}
                        />
                        <span className="truncate">{lider}</span>
                    </label>
                );
            })}
            {individualMode && !selected.size ? (
                <p className={`px-2 pt-1 text-xs ${isLight ? 'text-amber-700' : 'text-amber-300'}`}>
                    Seleccione al menos un líder, o marque «Todos los líderes».
                </p>
            ) : null}
        </div>
    );
}
