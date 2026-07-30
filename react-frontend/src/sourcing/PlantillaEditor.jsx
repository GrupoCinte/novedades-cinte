import { useRef } from 'react';
import { useModuleTheme } from '../moduleTheme.js';
import { PLANTILLA_FASES, VARIABLES_DISPONIBLES, renderPlantilla } from './plantillaVars.js';

export default function PlantillaEditor({ plantillas, onChange, previewCtx }) {
    const { isLight } = useModuleTheme();
    const refs = useRef({});

    const input = isLight
        ? 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900'
        : 'w-full rounded-lg border border-slate-600 bg-[#04141E] px-2.5 py-1.5 text-sm text-slate-100';
    const label = isLight ? 'text-xs font-semibold text-slate-700' : 'text-xs font-semibold text-slate-300';
    const muted = isLight ? 'text-slate-500' : 'text-slate-400';
    const chip = isLight
        ? 'rounded-md border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100'
        : 'rounded-md border border-slate-600 bg-slate-800 px-1.5 py-0.5 text-[11px] text-slate-300 hover:bg-slate-700';

    function setFase(key, value) {
        onChange({ ...(plantillas || {}), [key]: value });
    }

    function insertVar(key, variable) {
        const ta = refs.current[key];
        const current = (plantillas && plantillas[key]) || '';
        const token = `[${variable}]`;
        if (ta && typeof ta.selectionStart === 'number') {
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const next = current.slice(0, start) + token + current.slice(end);
            setFase(key, next);
            requestAnimationFrame(() => {
                ta.focus();
                const pos = start + token.length;
                ta.setSelectionRange(pos, pos);
            });
        } else {
            setFase(key, `${current}${token}`);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-1">
                <span className={`mr-1 text-[11px] ${muted}`}>Variables:</span>
                {VARIABLES_DISPONIBLES.map((v) => (
                    <span key={v} className={`${chip} cursor-default`} title="Haz clic dentro de una fase para insertarla ahí">
                        [{v}]
                    </span>
                ))}
            </div>
            {PLANTILLA_FASES.map((fase) => {
                const value = (plantillas && plantillas[fase.key]) || '';
                const preview = previewCtx ? renderPlantilla(value, previewCtx) : '';
                return (
                    <div key={fase.key} className="space-y-1">
                        <div className="flex items-center justify-between">
                            <span className={label}>{fase.label}</span>
                            <span className="flex flex-wrap gap-1">
                                {VARIABLES_DISPONIBLES.slice(0, 6).map((v) => (
                                    <button key={v} type="button" className={chip} onClick={() => insertVar(fase.key, v)}>
                                        +{v}
                                    </button>
                                ))}
                            </span>
                        </div>
                        <textarea
                            ref={(el) => { refs.current[fase.key] = el; }}
                            className={`${input} min-h-[80px]`}
                            value={value}
                            onChange={(e) => setFase(fase.key, e.target.value)}
                        />
                        {previewCtx && preview && preview !== value ? (
                            <p className={`text-[11px] ${muted}`}>Vista previa: {preview}</p>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}
