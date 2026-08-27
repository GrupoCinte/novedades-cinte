import { asFilterList } from './chListFilters.js';

function normalizeOptions(options) {
    if (!Array.isArray(options)) return [];
    return options
        .map((o) => {
            if (typeof o === 'string' || typeof o === 'number') {
                const v = String(o).trim();
                return v ? { value: v, label: v } : null;
            }
            const value = String(o?.value ?? o?.puesto ?? o?.motivo ?? '').trim();
            const label = String(o?.label ?? o?.puesto ?? o?.motivo ?? value).trim();
            return value ? { value, label: label || value } : null;
        })
        .filter(Boolean);
}

/**
 * Lista con checkboxes para marcar varios valores. Vacío = todos.
 */
export default function FilterMultiSelect({
    id,
    options = [],
    value,
    onChange,
    isLight = false,
    emptyHint = 'Sin marcar = todos'
}) {
    const selected = new Set(asFilterList(value));
    const items = normalizeOptions(options);
    const boxCls = isLight
        ? 'max-h-40 overflow-y-auto rounded-md border border-slate-300 bg-white'
        : 'max-h-40 overflow-y-auto rounded-md border border-slate-600 bg-slate-900/40';
    const hintCls = isLight ? 'text-slate-500' : 'text-slate-400';
    const rowHover = isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/50';
    const textCls = isLight ? 'text-slate-800' : 'text-slate-200';

    const toggle = (v) => {
        const next = new Set(selected);
        if (next.has(v)) next.delete(v);
        else next.add(v);
        onChange([...next]);
    };

    return (
        <div id={id} className={boxCls} role="group">
            <p className={`px-2.5 pt-1.5 text-[10px] ${hintCls}`}>{emptyHint}</p>
            {items.length === 0 ? (
                <p className={`px-2.5 py-2 text-xs ${hintCls}`}>Sin opciones</p>
            ) : (
                items.map((opt) => (
                    <label
                        key={opt.value}
                        className={`flex cursor-pointer items-center gap-2 px-2.5 py-1 text-sm ${textCls} ${rowHover}`}
                    >
                        <input
                            type="checkbox"
                            checked={selected.has(opt.value)}
                            onChange={() => toggle(opt.value)}
                        />
                        <span className="min-w-0 truncate">{opt.label}</span>
                    </label>
                ))
            )}
        </div>
    );
}
