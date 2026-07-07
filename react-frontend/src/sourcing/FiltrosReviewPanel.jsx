import { useEffect, useState } from 'react';

function parseList(text) {
    return String(text || '')
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
}

function joinList(arr) {
    return Array.isArray(arr) ? arr.join(', ') : '';
}

const IMPACTO_CLASS = {
    alto: 'text-red-600 bg-red-50 border-red-200',
    medio: 'text-amber-700 bg-amber-50 border-amber-200',
    bajo: 'text-slate-600 bg-slate-50 border-slate-200'
};

export default function FiltrosReviewPanel({
    vacante,
    token,
    isLight,
    onUpdated,
    updateVacanteCriterios
}) {
    const criterios = vacante?.criterios || {};
    const confirmed = criterios.filtros_confirmados === true;

    const [cargo, setCargo] = useState(criterios.cargo || '');
    const [cargosEq, setCargosEq] = useState(joinList(criterios.cargos_equivalentes));
    const [ciudad, setCiudad] = useState(criterios.ciudad || '');
    const [skillsReq, setSkillsReq] = useState(joinList(criterios.skills_requeridas || criterios.skills));
    const [skillsDes, setSkillsDes] = useState(joinList(criterios.skills_deseables));
    const [palabras, setPalabras] = useState(joinList(criterios.palabras_clave_hv));
    const [expMin, setExpMin] = useState(String(criterios.experiencia_min || 0));
    const [profesion, setProfesion] = useState(criterios.profesion || '');
    const [hvAct, setHvAct] = useState(criterios.hv_actualizada || '');
    const [scope, setScope] = useState(criterios.search_in_scope || 'toda_hv');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [okMsg, setOkMsg] = useState('');

    useEffect(() => {
        setCargo(criterios.cargo || '');
        setCargosEq(joinList(criterios.cargos_equivalentes));
        setCiudad(criterios.ciudad || '');
        setSkillsReq(joinList(criterios.skills_requeridas || criterios.skills));
        setSkillsDes(joinList(criterios.skills_deseables));
        setPalabras(joinList(criterios.palabras_clave_hv));
        setExpMin(String(criterios.experiencia_min || 0));
        setProfesion(criterios.profesion || '');
        setHvAct(criterios.hv_actualizada || '');
        setScope(criterios.search_in_scope || 'toda_hv');
    }, [vacante?.id, criterios]);

    const input = isLight
        ? 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900'
        : 'w-full rounded-lg border border-slate-600 bg-[#04141E] px-2.5 py-1.5 text-sm text-slate-100';
    const label = isLight ? 'text-xs font-medium text-slate-700' : 'text-xs font-medium text-slate-300';
    const muted = isLight ? 'text-slate-500' : 'text-slate-400';
    const btnPrimary = isLight
        ? 'rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50'
        : 'rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-50';
    const btnSecondary = isLight
        ? 'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50'
        : 'rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50';

    function buildPayload() {
        return {
            cargo: cargo.trim() || null,
            cargos_equivalentes: parseList(cargosEq).slice(0, 4),
            ciudad: ciudad.trim() || null,
            skills_requeridas: parseList(skillsReq),
            skills: parseList(skillsReq),
            skills_deseables: parseList(skillsDes),
            palabras_clave_hv: parseList(palabras).slice(0, 3),
            experiencia_min: Math.max(0, parseInt(expMin, 10) || 0),
            profesion: profesion.trim() || null,
            hv_actualizada: hvAct || null,
            search_in_scope: scope
        };
    }

    async function handleSave(confirmar) {
        if (!vacante?.id) {
            setError('Vacante sin ID. Recargue la página o vuelva a registrar la vacante.');
            return;
        }
        setError('');
        setOkMsg('');
        setLoading(true);
        try {
            const data = await updateVacanteCriterios(token, vacante.id, {
                criterios: buildPayload(),
                confirmar
            });
            onUpdated?.(data.vacante);
            setOkMsg(confirmar ? 'Filtros confirmados. Ya puede iniciar la búsqueda.' : 'Borrador guardado.');
        } catch (err) {
            setError(err.message || 'No se pudieron guardar los filtros');
        } finally {
            setLoading(false);
        }
    }

    const infoFaltante = Array.isArray(criterios.info_faltante) ? criterios.info_faltante : [];
    const confEq = criterios.confianza?.cargos_equivalentes;

    return (
        <div className="mt-4 space-y-4 border-t pt-4 border-slate-200/60 dark:border-slate-700/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                    Revisión de filtros (El Empleo)
                </p>
                {confirmed ? (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs text-emerald-800">
                        Confirmados
                    </span>
                ) : (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs text-amber-800">
                        Pendiente confirmación
                    </span>
                )}
            </div>

            {infoFaltante.length > 0 ? (
                <ul className="space-y-1.5">
                    {infoFaltante.map((item, i) => (
                        <li
                            key={`${item.campo}-${i}`}
                            className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                                IMPACTO_CLASS[item.impacto] || IMPACTO_CLASS.medio
                            }`}
                        >
                            {item.mensaje}
                        </li>
                    ))}
                </ul>
            ) : null}

            {confEq != null && confEq < 0.7 ? (
                <p className="text-xs text-amber-600">
                    Confianza baja en cargos equivalentes ({Math.round(confEq * 100)}%). Revise antes de confirmar.
                </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                    <span className={label}>Cargo vacante</span>
                    <input className={`${input} mt-1`} value={cargo} onChange={(e) => setCargo(e.target.value)} />
                </label>
                <label className="block sm:col-span-2">
                    <span className={label}>Cargos equivalentes EE (separados por coma)</span>
                    <input className={`${input} mt-1`} value={cargosEq} onChange={(e) => setCargosEq(e.target.value)} />
                </label>
                <label className="block">
                    <span className={label}>Ciudad</span>
                    <input className={`${input} mt-1`} value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
                </label>
                <label className="block">
                    <span className={label}>Experiencia mínima (años)</span>
                    <input
                        type="number"
                        min={0}
                        className={`${input} mt-1`}
                        value={expMin}
                        onChange={(e) => setExpMin(e.target.value)}
                    />
                </label>
                <label className="block sm:col-span-2">
                    <span className={label}>Palabras clave HV — máx. 3 (La palabra en EE)</span>
                    <input className={`${input} mt-1`} value={palabras} onChange={(e) => setPalabras(e.target.value)} />
                </label>
                <label className="block sm:col-span-2">
                    <span className={label}>Skills requeridas (relevancia post-scrape)</span>
                    <input className={`${input} mt-1`} value={skillsReq} onChange={(e) => setSkillsReq(e.target.value)} />
                </label>
                <label className="block sm:col-span-2">
                    <span className={label}>Skills deseables</span>
                    <input className={`${input} mt-1`} value={skillsDes} onChange={(e) => setSkillsDes(e.target.value)} />
                </label>
                <label className="block">
                    <span className={label}>Profesión EE</span>
                    <input className={`${input} mt-1`} value={profesion} onChange={(e) => setProfesion(e.target.value)} />
                </label>
                <label className="block">
                    <span className={label}>Alcance búsqueda</span>
                    <select className={`${input} mt-1`} value={scope} onChange={(e) => setScope(e.target.value)}>
                        <option value="toda_hv">Toda la hoja de vida</option>
                        <option value="ultima_experiencia">Última experiencia</option>
                        <option value="estudios">Estudios</option>
                    </select>
                </label>
                <label className="block sm:col-span-2">
                    <span className={label}>Fecha actualización HV (opcional)</span>
                    <select className={`${input} mt-1`} value={hvAct} onChange={(e) => setHvAct(e.target.value)}>
                        <option value="">Sin filtro (solo ordenar por fecha)</option>
                        <option value="ultimo_mes">Último mes</option>
                        <option value="ultimos_3_meses">Últimos 3 meses</option>
                        <option value="ultimos_6_meses">Últimos 6 meses</option>
                        <option value="ultimo_ano">Último año</option>
                    </select>
                </label>
            </div>

            <p className={`text-xs ${muted}`}>
                Las skills requeridas no se aplican como AND en El Empleo; solo palabras clave HV (máx. 3) y cargos equivalentes.
            </p>

            {error ? <p className="text-xs text-red-500">{error}</p> : null}
            {okMsg ? <p className="text-xs text-emerald-600">{okMsg}</p> : null}

            <div className="flex flex-wrap gap-2">
                <button type="button" className={btnSecondary} disabled={loading} onClick={() => handleSave(false)}>
                    Guardar borrador
                </button>
                <button type="button" className={btnPrimary} disabled={loading} onClick={() => handleSave(true)}>
                    {loading ? 'Guardando…' : 'Confirmar filtros'}
                </button>
            </div>
        </div>
    );
}
