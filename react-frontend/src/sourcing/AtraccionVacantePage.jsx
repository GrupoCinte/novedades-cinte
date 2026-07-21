import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Send, Search } from 'lucide-react';
import { useModuleTheme } from '../moduleTheme.js';
import { ATRACCION_PAGE_MAIN, CINTE_BTN_PRIMARY } from './atraccionLayout.js';
import { createVacante } from './atraccionApi.js';
import { CriteriosChips, VacanteExtrasPanel } from './atraccionVacanteShared.jsx';

export default function AtraccionVacantePage({ token }) {
    const navigate = useNavigate();
    const { isLight } = useModuleTheme();

    const card = isLight
        ? 'rounded-xl border border-slate-200 bg-white p-6 shadow-sm'
        : 'rounded-xl border border-slate-700/60 bg-[#0b1f2a]/80 p-6 shadow-lg';
    const muted = isLight ? 'text-slate-600' : 'text-slate-400';

    const [descripcion, setDescripcion] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [okMsg, setOkMsg] = useState('');
    const [lastCreated, setLastCreated] = useState(null);
    const [showHelp, setShowHelp] = useState(false);

    async function onSubmit(e) {
        e.preventDefault();
        const desc = descripcion.trim();
        if (desc.length < 20) {
            setError('Describe la vacante con un poco más de detalle (mínimo 20 caracteres).');
            return;
        }
        setError('');
        setOkMsg('');
        setLastCreated(null);
        setLoading(true);
        try {
            const result = await createVacante(token, { descripcion: desc });
            const vacante = result.vacante || result;
            setLastCreated(vacante);
            setDescripcion('');
            if (result.parseWarning) {
                setOkMsg(`Vacante guardada en borrador: ${result.parseWarning}`);
            } else {
                setOkMsg('Vacante analizada. Revisa y guarda los filtros antes de iniciar la búsqueda.');
            }
        } catch (err) {
            setError(err.message || 'No se pudo guardar');
        } finally {
            setLoading(false);
        }
    }

    function onIniciarBusqueda() {
        if (!lastCreated?.id) return;
        navigate(`/admin/atraccion-talento/shortlist?vacante=${encodeURIComponent(lastCreated.id)}`);
    }

    const infoFaltante = Array.isArray(lastCreated?.criterios?.info_faltante)
        ? lastCreated.criterios.info_faltante
        : [];

    const searchBox = isLight
        ? 'flex items-end gap-2 rounded-2xl border border-slate-300 bg-white px-4 py-3 shadow-sm focus-within:border-[#2F7BB8]'
        : 'flex items-end gap-2 rounded-2xl border border-slate-600 bg-[#04141E] px-4 py-3 shadow-lg focus-within:border-[#65BCF7]';
    const searchTextarea = isLight
        ? 'min-h-[28px] max-h-40 flex-1 resize-none bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none'
        : 'min-h-[28px] max-h-40 flex-1 resize-none bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none';

    return (
        <main className={`${ATRACCION_PAGE_MAIN} flex flex-col ${lastCreated ? '' : 'justify-center'}`}>
            <div className={card}>
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#2F7BB8]/10 text-[#2F7BB8]">
                        <Sparkles size={22} />
                    </span>
                    <div>
                        <h1 className={`text-xl font-heading font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                            Encuentra a tu candidato ideal
                        </h1>
                        <p className={`text-sm ${muted}`}>
                            Describe la vacante; la IA extrae los filtros y tú decides.
                            {' '}
                            <button
                                type="button"
                                onClick={() => setShowHelp((v) => !v)}
                                className="font-medium text-[#2F7BB8] underline hover:text-[#004D87]"
                            >
                                Ver cómo funciona
                            </button>
                        </p>
                    </div>
                </div>

                {showHelp ? (
                    <p className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                        isLight ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-slate-700 bg-[#04141E]/60 text-slate-300'
                    }`}>
                        Escribe en lenguaje natural el perfil que buscas (cargo, experiencia, skills, idioma, ciudad).
                        La IA propone los filtros; revísalos y ajústalos. Al iniciar la búsqueda pasarás al submódulo
                        Búsqueda para elegir las fuentes (El Empleo, LinkedIn, X-Ray) y lanzarla.
                    </p>
                ) : null}

                <form onSubmit={onSubmit} className="mt-4">
                    <div className={searchBox}>
                        <textarea
                            className={searchTextarea}
                            rows={1}
                            placeholder="Estoy buscando un Head of Sales con 6 años de experiencia, inglés, que haya trabajado con deals B2B, SaaS…"
                            value={descripcion}
                            onChange={(ev) => setDescripcion(ev.target.value)}
                            onKeyDown={(ev) => {
                                if (ev.key === 'Enter' && !ev.shiftKey) {
                                    ev.preventDefault();
                                    onSubmit(ev);
                                }
                            }}
                            disabled={loading}
                        />
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#2F7BB8] text-white shadow-sm transition-all hover:bg-[#004D87] disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label="Analizar vacante con IA"
                        >
                            <Send size={18} />
                        </button>
                    </div>
                    {error ? <p className="mt-3 text-sm text-red-500">{error}</p> : null}
                    {okMsg ? <p className="mt-3 text-sm text-emerald-600">{okMsg}</p> : null}
                    {loading ? <p className={`mt-3 text-sm ${muted}`}>Analizando vacante con IA…</p> : null}
                </form>
            </div>

            {lastCreated ? (
                <div className={card}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className={`text-base font-semibold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                            Criterios extraídos por la IA
                        </h2>
                        <p className={`text-sm ${muted}`}>
                            {lastCreated.titulo || 'Vacante sin título'}
                            <span className="ml-2 text-xs">({lastCreated.estado})</span>
                        </p>
                    </div>
                    <CriteriosChips criterios={lastCreated.criterios} isLight={isLight} />
                    {infoFaltante.length > 0 ? (
                        <ul className="mt-3 space-y-1.5">
                            {infoFaltante.map((item, i) => (
                                <li
                                    key={`${item.campo || 'info'}-${i}`}
                                    className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                                        isLight
                                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                                            : 'border-amber-700/60 bg-amber-950/30 text-amber-300'
                                    }`}
                                >
                                    {item.mensaje || String(item)}
                                </li>
                            ))}
                        </ul>
                    ) : null}
                    <p className={`mt-3 text-xs ${muted}`}>
                        Ajusta los filtros y elige las fuentes al iniciar la búsqueda.
                    </p>
                    <div className="mt-4 flex justify-end border-t pt-4 border-slate-200/60 dark:border-slate-700/60">
                        <button type="button" className={CINTE_BTN_PRIMARY} onClick={onIniciarBusqueda}>
                            <Search size={16} />
                            Iniciar búsqueda
                        </button>
                    </div>
                    {lastCreated.criterios?.filtros_confirmados ? (
                        <VacanteExtrasPanel vacante={lastCreated} token={token} isLight={isLight} />
                    ) : null}
                </div>
            ) : null}
        </main>
    );
}
