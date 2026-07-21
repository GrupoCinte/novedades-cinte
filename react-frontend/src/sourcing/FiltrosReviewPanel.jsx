import { useEffect, useMemo, useRef, useState } from 'react';

import { computeFiltrosFaltantes } from './filtrosObligatorios.js';

import CriteriosTagEditor from './CriteriosTagEditor.jsx';

import { formatSalarioCopInput, parseSalarioCopRanges } from './formatSalarioCopInput.js';

import { filterInfoFaltanteVisible } from './infoFaltanteUtils.js';



const IMPACTO_CLASS = {

    alto: 'text-red-600 bg-red-50 border-red-200',

    medio: 'text-amber-700 bg-amber-50 border-amber-200',

    bajo: 'text-slate-600 bg-slate-50 border-slate-200'

};



function toTagSet(arr) {

    return new Set(Array.isArray(arr) ? arr.filter(Boolean) : []);

}



export default function FiltrosReviewPanel({

    vacante,

    token,

    isLight,

    onUpdated,

    onSaved,

    updateVacanteCriterios

}) {

    const criterios = vacante?.criterios || {};

    const confirmed = criterios.filtros_confirmados === true;

    const aiTagsRef = useRef(null);



    const [cargo, setCargo] = useState(criterios.cargo || '');

    const [cargosEq, setCargosEq] = useState(Array.isArray(criterios.cargos_equivalentes) ? criterios.cargos_equivalentes : []);

    const [ciudad, setCiudad] = useState(criterios.ciudad || '');

    const [skillsReq, setSkillsReq] = useState(

        Array.isArray(criterios.skills_requeridas) ? criterios.skills_requeridas : (criterios.skills || [])

    );

    const [skillsDes, setSkillsDes] = useState(Array.isArray(criterios.skills_deseables) ? criterios.skills_deseables : []);

    const [palabras, setPalabras] = useState(Array.isArray(criterios.palabras_clave_hv) ? criterios.palabras_clave_hv : []);

    const [expMin, setExpMin] = useState(String(criterios.experiencia_min || 0));

    const [profesion, setProfesion] = useState(criterios.profesion || '');

    const [formacion, setFormacion] = useState(criterios.formacion || '');

    const [seniority, setSeniority] = useState(criterios.seniority || '');

    const [modalidad, setModalidad] = useState(criterios.modalidad || '');

    const [tipoContrato, setTipoContrato] = useState(criterios.tipo_contrato || '');

    const [salario, setSalario] = useState(

        formatSalarioCopInput((Array.isArray(criterios.salario_rangos_cop) ? criterios.salario_rangos_cop : []).join(', '))

    );

    const [hvAct, setHvAct] = useState(criterios.hv_actualizada || '');

    const [scope, setScope] = useState(criterios.search_in_scope || 'toda_hv');

    const [loading, setLoading] = useState(false);

    const [error, setError] = useState('');

    const [okMsg, setOkMsg] = useState('');



    useEffect(() => {

        if (aiTagsRef.current?.vacanteId === vacante?.id) return;

        aiTagsRef.current = {

            vacanteId: vacante?.id,

            cargosEq: toTagSet(criterios.cargos_equivalentes),

            skillsReq: toTagSet(criterios.skills_requeridas || criterios.skills),

            skillsDes: toTagSet(criterios.skills_deseables),

            palabras: toTagSet(criterios.palabras_clave_hv)

        };

        setCargo(criterios.cargo || '');

        setCargosEq(Array.isArray(criterios.cargos_equivalentes) ? [...criterios.cargos_equivalentes] : []);

        setCiudad(criterios.ciudad || '');

        setSkillsReq(Array.isArray(criterios.skills_requeridas) ? [...criterios.skills_requeridas] : [...(criterios.skills || [])]);

        setSkillsDes(Array.isArray(criterios.skills_deseables) ? [...criterios.skills_deseables] : []);

        setPalabras(Array.isArray(criterios.palabras_clave_hv) ? [...criterios.palabras_clave_hv] : []);

        setExpMin(String(criterios.experiencia_min || 0));

        setProfesion(criterios.profesion || '');

        setFormacion(criterios.formacion || '');

        setSeniority(criterios.seniority || '');

        setModalidad(criterios.modalidad || '');

        setTipoContrato(criterios.tipo_contrato || '');

        setSalario(formatSalarioCopInput((Array.isArray(criterios.salario_rangos_cop) ? criterios.salario_rangos_cop : []).join(', ')));

        setHvAct(criterios.hv_actualizada || '');

        setScope(criterios.search_in_scope || 'toda_hv');

    }, [vacante?.id, criterios]);



    const input = isLight

        ? 'w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900'

        : 'w-full rounded-lg border border-slate-600 bg-[#04141E] px-2.5 py-1.5 text-sm text-slate-100';

    const label = isLight ? 'text-xs font-medium text-slate-700' : 'text-xs font-medium text-slate-300';

    const muted = isLight ? 'text-slate-500' : 'text-slate-400';

    const btnPrimary = isLight

        ? 'rounded-lg bg-[#2F7BB8] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#004D87] disabled:opacity-50'

        : 'rounded-lg bg-[#2F7BB8] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#004D87] disabled:opacity-50';



    function buildPayload() {

        return {

            cargo: cargo.trim() || null,

            cargos_equivalentes: cargosEq.slice(0, 4),

            ciudad: ciudad.trim() || null,

            skills_requeridas: skillsReq,

            skills: skillsReq,

            skills_deseables: skillsDes,

            palabras_clave_hv: palabras.slice(0, 3),

            experiencia_min: Math.max(0, parseInt(expMin, 10) || 0),

            profesion: profesion.trim() || null,

            formacion: formacion.trim() || null,

            seniority: seniority.trim() || null,

            modalidad: modalidad.trim() || null,

            tipo_contrato: tipoContrato.trim() || null,

            salario_rangos_cop: parseSalarioCopRanges(salario),

            hv_actualizada: hvAct || null,

            search_in_scope: scope

        };

    }



    const livePayload = useMemo(() => buildPayload(), [

        cargo, cargosEq, ciudad, skillsReq, skillsDes, palabras, expMin, profesion, formacion,

        seniority, modalidad, tipoContrato, salario, hvAct, scope

    ]);



    const faltantes = useMemo(

        () => computeFiltrosFaltantes({ ...criterios, ...livePayload }),

        [criterios, livePayload]

    );

    const faltanCampos = new Set(faltantes.map((f) => f.campo));



    const infoFaltanteVisible = useMemo(

        () => filterInfoFaltanteVisible(criterios.info_faltante, livePayload),

        [criterios.info_faltante, livePayload]

    );



    const confEq = criterios.confianza?.cargos_equivalentes;

    const ai = aiTagsRef.current || {};



    async function handleSave() {

        if (!vacante?.id) {

            setError('Vacante sin ID. Recargue la página o vuelva a registrar la vacante.');

            return;

        }

        if (faltantes.length > 0) {

            setError(`Complete los filtros obligatorios antes de iniciar la búsqueda: ${faltantes.map((f) => f.label).join(', ')}.`);

            return;

        }

        setError('');

        setOkMsg('');

        setLoading(true);

        try {

            const data = await updateVacanteCriterios(token, vacante.id, {

                criterios: {

                    ...buildPayload(),

                    info_faltante: infoFaltanteVisible

                },

                confirmar: true

            });

            onUpdated?.(data.vacante);

            setOkMsg('Filtros guardados. Ya puede iniciar la búsqueda.');

            onSaved?.(data.vacante);

        } catch (err) {

            setError(err.message || 'No se pudieron guardar los filtros');

        } finally {

            setLoading(false);

        }

    }



    return (

        <div className="mt-4 space-y-4 border-t pt-4 border-slate-200/60 dark:border-slate-700/60">

            <div className="flex flex-wrap items-center justify-between gap-2">

                <p className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>

                    Filtros de búsqueda

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



            {faltantes.length > 0 ? (

                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">

                    <p className="font-semibold">Filtros obligatorios pendientes</p>

                    <p className="mt-0.5">

                        No se puede iniciar la búsqueda hasta completar: {faltantes.map((f) => f.label).join(', ')}.

                    </p>

                </div>

            ) : null}



            {infoFaltanteVisible.length > 0 ? (

                <ul className="space-y-1.5">

                    {infoFaltanteVisible.map((item, i) => (

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

                <div className="sm:col-span-2">

                    <CriteriosTagEditor

                        label="Cargos equivalentes"

                        tags={cargosEq}

                        onChange={setCargosEq}

                        maxTags={4}

                        variant="sky"

                        aiTagSet={ai.cargosEq}

                        placeholder="Agregar cargo equivalente"

                        isLight={isLight}

                    />

                </div>

                <label className="block">

                    <span className={label}>Ciudad{faltanCampos.has('ciudad') ? ' *' : ''}</span>

                    <input

                        className={`${input} mt-1 ${faltanCampos.has('ciudad') ? 'border-red-400' : ''}`}

                        value={ciudad}

                        onChange={(e) => setCiudad(e.target.value)}

                    />

                </label>

                <label className="block">

                    <span className={label}>Experiencia mínima (años){faltanCampos.has('experiencia') ? ' *' : ''}</span>

                    <input

                        type="number"

                        min={0}

                        className={`${input} mt-1 ${faltanCampos.has('experiencia') ? 'border-red-400' : ''}`}

                        value={expMin}

                        onChange={(e) => setExpMin(e.target.value)}

                    />

                </label>

                <label className="block">

                    <span className={label}>Seniority{faltanCampos.has('seniority') ? ' *' : ''}</span>

                    <input

                        className={`${input} mt-1 ${faltanCampos.has('seniority') ? 'border-red-400' : ''}`}

                        value={seniority}

                        placeholder="Junior / Senior / Líder"

                        onChange={(e) => setSeniority(e.target.value)}

                    />

                </label>

                <label className="block">

                    <span className={label}>Modalidad{faltanCampos.has('modalidad') ? ' *' : ''}</span>

                    <select

                        className={`${input} mt-1 ${faltanCampos.has('modalidad') ? 'border-red-400' : ''}`}

                        value={modalidad}

                        onChange={(e) => setModalidad(e.target.value)}

                    >

                        <option value="">Selecciona…</option>

                        <option value="presencial">Presencial</option>

                        <option value="remoto">Remoto</option>

                        <option value="híbrido">Híbrido</option>

                    </select>

                </label>

                <label className="block">

                    <span className={label}>Tipo de contrato{faltanCampos.has('tipo_contrato') ? ' *' : ''}</span>

                    <input

                        className={`${input} mt-1 ${faltanCampos.has('tipo_contrato') ? 'border-red-400' : ''}`}

                        value={tipoContrato}

                        placeholder="Término indefinido / fijo / prestación…"

                        onChange={(e) => setTipoContrato(e.target.value)}

                    />

                </label>

                <label className="block">

                    <span className={label}>Formación académica{faltanCampos.has('formacion') ? ' *' : ''}</span>

                    <input

                        className={`${input} mt-1 ${faltanCampos.has('formacion') ? 'border-red-400' : ''}`}

                        value={formacion}

                        placeholder="Ing. de sistemas / Tecnólogo…"

                        onChange={(e) => setFormacion(e.target.value)}

                    />

                </label>

                <label className="block">

                    <span className={label}>Salario{faltanCampos.has('salario') ? ' *' : ''}</span>

                    <input

                        className={`${input} mt-1 ${faltanCampos.has('salario') ? 'border-red-400' : ''}`}

                        value={salario}

                        placeholder="3.000.000 - 4.500.000"

                        onChange={(e) => setSalario(formatSalarioCopInput(e.target.value))}

                    />

                </label>

                <div className="sm:col-span-2">

                    <CriteriosTagEditor

                        label="Palabras clave HV — máx. 3"

                        tags={palabras}

                        onChange={setPalabras}

                        maxTags={3}

                        variant="soft"

                        aiTagSet={ai.palabras}

                        placeholder="Palabra clave"

                        isLight={isLight}

                    />

                </div>

                <div className="sm:col-span-2">

                    <CriteriosTagEditor

                        label="Skills requeridas"

                        tags={skillsReq}

                        onChange={setSkillsReq}

                        maxTags={15}

                        variant="soft"

                        aiTagSet={ai.skillsReq}

                        placeholder="Skill requerida"

                        isLight={isLight}

                    />

                </div>

                <div className="sm:col-span-2">

                    <CriteriosTagEditor

                        label="Skills deseables"

                        tags={skillsDes}

                        onChange={setSkillsDes}

                        maxTags={15}

                        variant="soft"

                        aiTagSet={ai.skillsDes}

                        placeholder="Skill deseable"

                        isLight={isLight}

                    />

                </div>

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



            {error ? <p className="text-xs text-red-500">{error}</p> : null}

            {okMsg ? <p className="text-xs text-emerald-600">{okMsg}</p> : null}



            <div className="flex flex-wrap items-center gap-2">

                <button

                    type="button"

                    className={btnPrimary}

                    disabled={loading || faltantes.length > 0}

                    onClick={handleSave}

                >

                    {loading ? 'Guardando…' : 'Guardar filtros'}

                </button>

                {faltantes.length > 0 ? (

                    <span className={`text-xs ${muted}`}>Complete los campos marcados con * para habilitar.</span>

                ) : null}

            </div>

        </div>

    );

}


