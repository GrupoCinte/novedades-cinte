import { useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

/**
 * Editor de tags con estilo chips del portal (sky / soft).
 * Eliminar: botón × siempre visible (no hover-only) o Backspace en input vacío.
 */
export default function CriteriosTagEditor({
    label,
    tags = [],
    onChange,
    maxTags = 20,
    variant = 'soft',
    aiTagSet = null,
    placeholder = 'Escriba y pulse Enter',
    isLight = true
}) {
    const [draft, setDraft] = useState('');
    const inputRef = useRef(null);

    const chipSky = isLight
        ? 'inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs text-sky-800'
        : 'inline-flex items-center gap-1 rounded-full border border-sky-800 bg-sky-950/60 px-2 py-0.5 text-xs text-sky-200';
    const chipSoft = isLight
        ? 'inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-700'
        : 'inline-flex items-center gap-1 rounded-full border border-slate-600 bg-slate-800/60 px-2 py-0.5 text-xs text-slate-300';
    const chipCls = variant === 'sky' ? chipSky : chipSoft;
    const labelCls = isLight ? 'text-xs font-medium text-slate-700' : 'text-xs font-medium text-slate-300';
    const inputCls = isLight
        ? 'min-w-[8rem] flex-1 border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400'
        : 'min-w-[8rem] flex-1 border-0 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500';
    const boxCls = isLight
        ? 'mt-1 flex min-h-[2.25rem] flex-wrap items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2 py-1.5'
        : 'mt-1 flex min-h-[2.25rem] flex-wrap items-center gap-1.5 rounded-lg border border-slate-600 bg-[#04141E] px-2 py-1.5';

    function addTag(raw) {
        const t = String(raw || '').trim();
        if (!t || tags.length >= maxTags) return;
        if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) return;
        onChange([...tags, t]);
        setDraft('');
    }

    function removeTag(idx) {
        onChange(tags.filter((_, i) => i !== idx));
    }

    function onKeyDown(e) {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addTag(draft);
        } else if (e.key === 'Backspace' && !draft && tags.length) {
            removeTag(tags.length - 1);
        }
    }

    return (
        <label className="block">
            {label ? <span className={labelCls}>{label}</span> : null}
            <div className={boxCls} onClick={() => inputRef.current?.focus()} role="presentation">
                {tags.map((tag, idx) => (
                    <span key={`${tag}-${idx}`} className={chipCls}>
                        {aiTagSet?.has(tag) ? (
                            <Sparkles size={10} className="opacity-70" aria-label="Generado por IA" />
                        ) : null}
                        <span>{tag}</span>
                        <button
                            type="button"
                            className={`inline-flex opacity-70 hover:opacity-100 ${isLight ? 'text-slate-600' : 'text-slate-300'}`}
                            aria-label={`Quitar ${tag}`}
                            onClick={(e) => { e.stopPropagation(); removeTag(idx); }}
                        >
                            <X size={12} />
                        </button>
                    </span>
                ))}
                {tags.length < maxTags ? (
                    <input
                        ref={inputRef}
                        className={inputCls}
                        value={draft}
                        placeholder={tags.length ? '' : placeholder}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onKeyDown}
                        onBlur={() => { if (draft.trim()) addTag(draft); }}
                    />
                ) : null}
            </div>
        </label>
    );
}
