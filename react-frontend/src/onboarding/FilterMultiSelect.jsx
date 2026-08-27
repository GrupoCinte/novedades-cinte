import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { asFilterList, summarizeMultiSelect } from './chListFilters.js';

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
 * Desplegable con selección múltiple. Cerrado parece un select; abierto muestra checkboxes.
 * Vacío = todos.
 * Patrón portal: react-frontend/src/shared/filters/README.md (AUT-316).
 */
export default function FilterMultiSelect({
    id,
    options = [],
    value,
    onChange,
    isLight = false,
    emptyHint = 'Sin marcar = todos'
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const rootRef = useRef(null);
    const selected = new Set(asFilterList(value));
    const items = useMemo(() => normalizeOptions(options), [options]);
    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return items;
        return items.filter((opt) => opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q));
    }, [items, query]);

    useEffect(() => {
        if (!open) return undefined;
        const onDoc = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();
            setOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) setQuery('');
    }, [open]);

    const triggerCls = isLight
        ? 'flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800 focus:border-sky-400 focus:outline-none'
        : 'flex w-full items-center justify-between gap-2 rounded-md border border-slate-600 bg-slate-900/40 px-3 py-2 text-left text-sm text-slate-200 focus:border-cyan-500 focus:outline-none';
    const menuCls = isLight
        ? 'absolute z-30 mt-1 w-full rounded-md border border-slate-300 bg-white shadow-lg'
        : 'absolute z-30 mt-1 w-full rounded-md border border-slate-600 bg-[#1e293b] shadow-lg';
    const hintCls = isLight ? 'text-slate-500' : 'text-slate-400';
    const rowHover = isLight ? 'hover:bg-slate-50' : 'hover:bg-slate-800/50';
    const textCls = isLight ? 'text-slate-800' : 'text-slate-200';
    const searchCls = isLight
        ? 'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 focus:border-sky-400 focus:outline-none'
        : 'w-full rounded-md border border-slate-600 bg-slate-900/40 px-2 py-1.5 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none';

    const toggle = (v) => {
        const next = new Set(selected);
        if (next.has(v)) next.delete(v);
        else next.add(v);
        onChange([...next]);
    };

    const summary = summarizeMultiSelect(value, items, 'Todos');
    const showSearch = items.length > 8;

    return (
        <div id={id} ref={rootRef} className="relative">
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={`${id}-menu`}
                onClick={() => setOpen((v) => !v)}
                className={triggerCls}
            >
                <span className={`min-w-0 truncate ${selected.size === 0 ? hintCls : ''}`}>{summary}</span>
                {open ? (
                    <ChevronUp size={16} className="shrink-0 opacity-70" aria-hidden />
                ) : (
                    <ChevronDown size={16} className="shrink-0 opacity-70" aria-hidden />
                )}
            </button>
            {open ? (
                <div id={`${id}-menu`} className={menuCls} role="listbox" aria-multiselectable="true">
                    <p className={`px-2.5 pt-1.5 text-[10px] ${hintCls}`}>{emptyHint}</p>
                    {showSearch ? (
                        <div className="px-2 pb-1">
                            <input
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Buscar…"
                                className={searchCls}
                                aria-label="Buscar opción"
                            />
                        </div>
                    ) : null}
                    <div className="max-h-40 overflow-y-auto py-1">
                        {visible.length === 0 ? (
                            <p className={`px-2.5 py-2 text-xs ${hintCls}`}>Sin opciones</p>
                        ) : (
                            visible.map((opt) => (
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
                </div>
            ) : null}
        </div>
    );
}
