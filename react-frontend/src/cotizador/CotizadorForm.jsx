import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { formatSalarioMoneda, parseSalarioLoose, formatMoney } from './salarioFormat';
import { mergeCotizadorClienteRows } from './cotizadorClientesMerge.js';
import { useModuleTheme } from '../moduleTheme.js';
import { calcularCotizacionFront } from './cotizadorEngineClient';

export default function CotizadorForm({
    catalogos,
    cargosResueltos,
    clientesLista,
    form,
    setForm,
    loading,
    onSave,
    onCancel,
    onDelete,
    isDeleting,
    deleteDisabled
}) {
    const {
        cardPanel,
        field,
        fieldManual,
        labelMuted,
        insetWell,
        ghostBtn,
        panelTitle,
        infoCallout,
        infoCalloutAccent,
        formErrorBox,
        dangerSoftBtn,
        primaryBtn,
        isLight
    } = useModuleTheme();

    const segmentBtn = (active) =>
        `flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-all ${
            active
                ? 'bg-[#088DC6] text-white shadow-[0_4px_12px_rgba(8,141,198,0.3)]'
                : isLight
                  ? 'border border-slate-200 text-slate-600 hover:bg-slate-100'
                  : 'border border-[#1a3a56] text-slate-300 hover:bg-[#0f2942]/60'
        }`;

    const cargos = Array.isArray(cargosResueltos) ? cargosResueltos : [];
    const prevClienteRef = useRef(form.cliente);
    const [salarioFocusedIdx, setSalarioFocusedIdx] = useState(null);
    const [formError, setFormError] = useState('');
    const [expandedItems, setExpandedItems] = useState({});
    const isClientSelected = Boolean(form.cliente);

    const toggleExpand = (idx) => {
        setExpandedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
    };

    useEffect(() => {
        if (prevClienteRef.current === form.cliente) return;
        prevClienteRef.current = form.cliente;
        setForm((prev) => ({
            ...prev,
            perfiles: prev.perfiles.map((p) => ({ ...p, indice: 0 }))
        }));
    }, [form.cliente, setForm]);

    useEffect(() => {
        const max = Math.max(0, cargos.length - 1);
        setForm((prev) => {
            let changed = false;
            const perfiles = prev.perfiles.map((p) => {
                if (String(p.modo || '').toUpperCase() === 'AUTO' && p.indice > max) {
                    changed = true;
                    return { ...p, indice: 0 };
                }
                return p;
            });
            return changed ? { ...prev, perfiles } : prev;
        });
    }, [cargos.length, setForm]);

    const clientes = useMemo(
        () => mergeCotizadorClienteRows(clientesLista, catalogos || {}),
        [clientesLista, catalogos]
    );

    const comerciales = Array.isArray(catalogos?.comerciales) ? catalogos.comerciales : [];
    const monedas = catalogos?.parametros?.monedas || {};
    const tasas = catalogos?.parametros?.tasas || {};
    const margenMin = Number(catalogos?.parametros?.margen_minimo || 0);

    const tasaFin = useMemo(() => Number(tasas[String(form.plazo)] || 0), [tasas, form.plazo]);
    const tasaConv = useMemo(() => Number(monedas?.[form.moneda]?.tasa || 1), [monedas, form.moneda]);

    const updatePerfil = (idx, patch) => {
        setForm((prev) => ({
            ...prev,
            perfiles: prev.perfiles.map((p, i) => (i === idx ? { ...p, ...patch } : p))
        }));
    };

    const addPerfil = () => {
        setForm((prev) => ({
            ...prev,
            perfiles: [...prev.perfiles, { indice: 0, cantidad: 1, modo: 'AUTO', salario_manual: '', cargo_manual: '' }]
        }));
    };

    const removePerfil = (idx) => {
        setSalarioFocusedIdx(null);
        setForm((prev) => ({
            ...prev,
            perfiles: prev.perfiles.filter((_, i) => i !== idx)
        }));
    };

    const onModoChange = (idx, modoNuevo, p) => {
        setSalarioFocusedIdx(null);
        const modo = String(modoNuevo || 'AUTO').toUpperCase();
        if (modo === 'MANUAL') {
            const sel = cargos.length > 0 ? cargos[p.indice] : null;
            updatePerfil(idx, {
                modo: 'MANUAL',
                cargo_manual: String(p.cargo_manual || '').trim() || String(sel?.cargo || '')
            });
        } else {
            updatePerfil(idx, { modo: 'AUTO', salario_manual: '', cargo_manual: '' });
        }
    };

    const cotizacionCalculada = useMemo(() => {
        if (!form.cliente || !form.perfiles?.length) return null;
        const margen = Number(form.margenPct || 0) / 100;
        const clienteObj = clientes.find((c) => c.nombre === form.cliente) || {};

        const payload = {
            id: form.id || undefined,
            cliente: form.cliente,
            nit: clienteObj.nit || '',
            comercial: form.comercial,
            plazo: form.plazo,
            margen,
            meses: Number(form.meses || 1),
            moneda: form.moneda,
            titulo: form.titulo || '',
            notas: form.notas || '',
            terminos: form.terminos || '',
            estado: form.estado || 'Borrador',
            tasa_conversion: Number(monedas[form.moneda]?.tasa || 1),
            nombre_moneda: monedas[form.moneda]?.nombre || form.moneda,
            contacto_nombre: form.contacto_nombre || '',
            contacto_correo: form.contacto_correo || '',
            contacto_cargo: form.contacto_cargo || '',
            perfiles: form.perfiles.map((p) => {
                if (String(p?.modo || 'AUTO').toUpperCase() === 'MANUAL') {
                    return { ...p, salario_manual: parseSalarioLoose(p.salario_manual) };
                }
                return p;
            })
        };

        try {
            const calculado = calcularCotizacionFront(payload, { ...catalogos, cargos: cargos });
            return { ...payload, ...calculado };
        } catch (e) {
            console.error('Error calculando en vivo:', e);
            return null;
        }
    }, [form, catalogos, cargos, clientes, monedas]);

    const composicionCostos = useMemo(() => {
        if (!cotizacionCalculada?.resultados?.length) return null;
        let nomina = 0;
        let equipamiento = 0;
        let operaciones = 0;
        for (const r of cotizacionCalculada.resultados) {
            const cant = Number(r.cantidad || 1);
            nomina += Number(r.total_nomina || 0) * cant;
            equipamiento += Number(r.equipo_costo || 0) * cant;
            operaciones += (Number(r.gto_vinculacion || 0) + Number(r.staff_cinte || 0) + Number(r.provi_indem || 0)) * cant;
        }
        const total = nomina + equipamiento + operaciones;
        if (total <= 0) return null;
        const nPct = Math.round((nomina / total) * 100);
        const ePct = Math.round((equipamiento / total) * 100);
        const oPct = 100 - nPct - ePct;
        return {
            nominaPct: nPct,
            equipamientoPct: ePct,
            operacionesPct: oPct,
            nomina,
            equipamiento,
            operaciones
        };
    }, [cotizacionCalculada]);

    const handleSaveClick = () => {
        setFormError('');
        const cliente = String(form.cliente || '').trim();
        if (!cliente) {
            setFormError('Seleccione un cliente.');
            return;
        }
        const titulo = String(form.titulo || '').trim();
        if (!titulo) {
            setFormError('Ingrese un título o asunto para la cotización.');
            return;
        }
        if (!form.perfiles?.length) {
            setFormError('Agregue al menos un perfil.');
            return;
        }
        for (let i = 0; i < form.perfiles.length; i++) {
            const p = form.perfiles[i];
            const modo = String(p?.modo || 'AUTO').toUpperCase();
            if (modo === 'MANUAL') {
                if (!String(p?.cargo_manual || '').trim()) {
                    setFormError(`Perfil ${i + 1}: escriba el nombre del cargo (modo MANUAL).`);
                    return;
                }
            } else {
                if (!cargos.length) {
                    setFormError('Sin tarifas importadas para este cliente. Use modo MANUAL.');
                    return;
                }
            }
        }
        const margen = Number(form.margenPct || 0) / 100;
        if (margen < margenMin) {
            setFormError(`El margen mínimo permitido es ${Math.round(margenMin * 100)}%.`);
            return;
        }

        if (cotizacionCalculada && onSave) {
            onSave(cotizacionCalculada);
        }
    };

    const clientNit = clientes.find((c) => c.nombre === form.cliente)?.nit || '';

    return (
        <div className="space-y-4">
            <div className={cardPanel}>
                <div className="mb-4">
                    <h3 className={panelTitle}>Información básica</h3>
                    <p className={`text-xs ${labelMuted}`}>Datos principales de la cotización</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                        <label className={`text-xs ${labelMuted}`}>Cliente</label>
                        <select
                            className={`w-full ${field}`}
                            value={form.cliente}
                            onChange={(e) => setForm((p) => ({ ...p, cliente: e.target.value }))}
                        >
                            <option value="">Selecciona cliente</option>
                            {clientes.map((c) => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={`text-xs ${labelMuted}`}>NIT</label>
                        <input
                            value={clientNit}
                            readOnly
                            className={`w-full ${field} cursor-default tabular-nums opacity-90`}
                        />
                    </div>
                    <div>
                        <label className={`text-xs ${labelMuted}`}>Comercial</label>
                        <select
                            className={`w-full ${field} disabled:opacity-50`}
                            value={form.comercial}
                            onChange={(e) => setForm((p) => ({ ...p, comercial: e.target.value }))}
                            disabled={!isClientSelected}
                        >
                            <option value="">Selecciona comercial</option>
                            {comerciales.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>

                    <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className={`text-xs ${labelMuted}`}>Nombre Contacto</label>
                            <input
                                type="text"
                                placeholder="Nombre completo"
                                className={`w-full ${field} disabled:opacity-50`}
                                value={form.contacto_nombre || ''}
                                onChange={(e) => setForm((p) => ({ ...p, contacto_nombre: e.target.value }))}
                                disabled={!isClientSelected}
                            />
                        </div>
                        <div>
                            <label className={`text-xs ${labelMuted}`}>Correo Contacto</label>
                            <input
                                type="email"
                                placeholder="correo@empresa.com"
                                className={`w-full ${field} disabled:opacity-50`}
                                value={form.contacto_correo || ''}
                                onChange={(e) => setForm((p) => ({ ...p, contacto_correo: e.target.value }))}
                                disabled={!isClientSelected}
                            />
                        </div>
                        <div>
                            <label className={`text-xs ${labelMuted}`}>Cargo Contacto</label>
                            <input
                                type="text"
                                placeholder="Ej. Gerente de TI"
                                className={`w-full ${field} disabled:opacity-50`}
                                value={form.contacto_cargo || ''}
                                onChange={(e) => setForm((p) => ({ ...p, contacto_cargo: e.target.value }))}
                                disabled={!isClientSelected}
                            />
                        </div>
                    </div>

                    <div className="md:col-span-4">
                        <label className={`text-xs ${labelMuted}`}>Título / Asunto</label>
                        <input
                            type="text"
                            placeholder="Ej. Propuesta Desarrollo Software CINTE"
                            className={`w-full ${field} disabled:opacity-50`}
                            value={form.titulo || ''}
                            onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
                            disabled={!isClientSelected}
                        />
                    </div>

                    <div className="md:col-span-2">
                        <label className={`text-xs ${labelMuted}`}>Plazo de pago (días)</label>
                        <div className="flex gap-2 mt-0.5">
                            {['30', '45', '60'].map((pl) => (
                                <button
                                    key={pl}
                                    type="button"
                                    className={`${segmentBtn(form.plazo === pl)} disabled:opacity-50 disabled:cursor-not-allowed`}
                                    onClick={() => setForm((p) => ({ ...p, plazo: pl }))}
                                    disabled={!isClientSelected}
                                >
                                    {pl} días
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className={`text-xs ${labelMuted}`}>Margen (%) min {Math.round(margenMin * 100)}</label>
                        <input
                            type="number"
                            min={Math.round(margenMin * 100)}
                            className={`w-full ${field} disabled:opacity-50`}
                            value={form.margenPct || ''}
                            onChange={(e) => setForm((p) => ({ ...p, margenPct: Number(e.target.value || 0) }))}
                            disabled={!isClientSelected}
                        />
                    </div>
                    <div>
                        <label className={`text-xs ${labelMuted}`}>Meses</label>
                        <input
                            type="number"
                            min="1"
                            className={`w-full ${field} disabled:opacity-50`}
                            value={form.meses || 1}
                            onChange={(e) => setForm((p) => ({ ...p, meses: Number(e.target.value || 1) }))}
                            disabled={!isClientSelected}
                        />
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                        <label className={`text-xs ${labelMuted}`}>Moneda</label>
                        <select
                            className={`w-full ${field} disabled:opacity-50`}
                            value={form.moneda || 'COP'}
                            onChange={(e) => setForm((p) => ({ ...p, moneda: e.target.value }))}
                            disabled={!isClientSelected}
                        >
                            {Object.entries(monedas).map(([k, m]) => (
                                <option key={k} value={k}>{m.nombre || k}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className={`mt-2 md:col-span-4 text-xs flex gap-4 ${labelMuted}`}>
                    <span>Tasa financiera: {(tasaFin * 100).toFixed(2)}%</span>
                    <span>Tasa conversión: {form.moneda === 'COP' ? 'N/A' : tasaConv.toLocaleString('es-CO')}</span>
                </div>
            </div>

            <div className={cardPanel}>
                <div className="mb-3">
                    <h3 className={panelTitle}>Items de la Cotización</h3>
                    <p className={`text-xs ${labelMuted}`}>Cargos incluidos en esta cotización</p>
                </div>
                <div className="space-y-3">
                {!form.cliente && (
                    <p className={`text-xs ${labelMuted} p-2 ${insetWell}`}>
                        Seleccione un cliente para cargar las tarifas disponibles.
                    </p>
                )}
                {form.cliente && cargos.length === 0 && (
                    <div className={infoCallout} role="status">
                        Sin tarifas en catálogo para este cliente. Puede usar modo{' '}
                        <strong className={infoCalloutAccent}>MANUAL</strong> para escribir cargo y salario.
                    </div>
                )}
                {form.perfiles.map((p, idx) => {
                    const esManual = String(p.modo || '').toUpperCase() === 'MANUAL';
                    const ix = Number(p?.indice ?? 0);
                    const selected = cargos.length > 0 ? (cargos[ix] || {}) : {};
                    const salarioCatalogo = Number(selected.salario ?? 0);
                    return (
                        <div key={`perfil-${idx}`} className={`${insetWell} p-3`}>
                            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 md:items-end">
                                <div>
                                    <label className={`text-xs ${labelMuted}`}>Modo</label>
                                    <select
                                        className={`w-full ${field} disabled:opacity-50`}
                                        value={p.modo}
                                        onChange={(e) => onModoChange(idx, e.target.value, p)}
                                        disabled={!isClientSelected}
                                    >
                                        <option value="AUTO">AUTO</option>
                                        <option value="MANUAL">MANUAL</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className={`text-xs ${labelMuted}`}>Cargo</label>
                                    {esManual ? (
                                        <input
                                            type="text"
                                            className={`${fieldManual} disabled:opacity-50`}
                                            placeholder="Escriba el nombre del cargo"
                                            value={p.cargo_manual || ''}
                                            onChange={(e) => updatePerfil(idx, { cargo_manual: e.target.value })}
                                            disabled={!isClientSelected}
                                        />
                                    ) : (
                                        <select
                                            className={`w-full ${field} disabled:opacity-60`}
                                            disabled={cargos.length === 0 || !isClientSelected}
                                            value={cargos.length === 0 ? '' : String(ix)}
                                            onChange={(e) => updatePerfil(idx, { indice: Number(e.target.value) })}
                                        >
                                            {cargos.length === 0 ? (
                                                <option value="">— Sin opciones —</option>
                                            ) : (
                                                cargos.map((c, i) => {
                                                    const ro = String(c.rol_original_cinte || '').trim();
                                                    const cg = String(c.cargo || '').trim();
                                                    const label =
                                                        ro && ro !== cg ? `${ro} — ${cg}` : cg || ro || `Cargo ${i + 1}`;
                                                    return (
                                                        <option key={`${c.cargo}-${i}`} value={String(i)}>
                                                            {label}
                                                        </option>
                                                    );
                                                })
                                            )}
                                        </select>
                                    )}
                                </div>
                                <div>
                                    <label className={`text-xs ${labelMuted}`}>Cantidad</label>
                                    <input type="number" min="1" className={`w-full ${field} disabled:opacity-50`} value={p.cantidad} onChange={(e) => updatePerfil(idx, { cantidad: Number(e.target.value || 1) })} disabled={!isClientSelected} />
                                </div>
                                <div>
                                    <label className={`text-xs ${labelMuted}`}>{esManual ? 'Salario Mes' : 'Salario'}</label>
                                    {esManual ? (
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            autoComplete="off"
                                            className={`${fieldManual} text-right tabular-nums tracking-tight disabled:opacity-50`}
                                            value={
                                                salarioFocusedIdx === idx
                                                    ? (p.salario_manual ?? '')
                                                    : p.salario_manual === '' || p.salario_manual === undefined
                                                      ? ''
                                                      : formatSalarioMoneda(Number(p.salario_manual))
                                            }
                                            onFocus={() => setSalarioFocusedIdx(idx)}
                                            onBlur={() => {
                                                setSalarioFocusedIdx(null);
                                                updatePerfil(idx, { salario_manual: parseSalarioLoose(p.salario_manual) });
                                            }}
                                            onChange={(e) => updatePerfil(idx, { salario_manual: e.target.value })}
                                            placeholder="$ 0"
                                            disabled={!isClientSelected}
                                        />
                                    ) : (
                                        <div
                                            className={`w-full ${field} flex items-center justify-end tabular-nums tracking-tight cursor-default`}
                                            title="Salario según catálogo del cliente"
                                        >
                                            {cargos.length ? formatSalarioMoneda(salarioCatalogo) : '—'}
                                        </div>
                                    )}
                                </div>
                                {esManual ? (
                                    <div>
                                        <label className={`text-xs ${labelMuted}`}>Valor Hora</label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            autoComplete="off"
                                            className={`${fieldManual} text-right tabular-nums tracking-tight disabled:opacity-50`}
                                            value={
                                                horaFocusedIdx === idx
                                                    ? (p.valor_hora_manual ?? '')
                                                    : p.valor_hora_manual === '' || p.valor_hora_manual === undefined
                                                      ? ''
                                                      : formatSalarioMoneda(Number(p.valor_hora_manual))
                                            }
                                            onFocus={() => setHoraFocusedIdx(idx)}
                                            onBlur={() => {
                                                setHoraFocusedIdx(null);
                                                updatePerfil(idx, { valor_hora_manual: parseSalarioLoose(p.valor_hora_manual) });
                                            }}
                                            onChange={(e) => updatePerfil(idx, { valor_hora_manual: e.target.value })}
                                            placeholder="$ 0"
                                            disabled={!isClientSelected}
                                        />
                                    </div>
                                ) : (
                                    <div className="hidden md:block"></div>
                                )}
                                <div className="flex items-end pb-0.5">
                                    <button type="button" onClick={() => removePerfil(idx)} className={`${dangerSoftBtn} disabled:opacity-50`} disabled={!isClientSelected}>
                                        Quitar
                                    </button>
                                </div>
                            </div>

                            {/* Toggle de Desglose de Costos */}
                            <div className="mt-2.5 flex items-center justify-between border-t pt-2 border-slate-700/10">
                                <button
                                    type="button"
                                    onClick={() => toggleExpand(idx)}
                                    className="text-xs font-semibold text-[#088DC6] hover:text-[#0b7cad] transition-all flex items-center gap-1 focus:outline-none"
                                >
                                    {expandedItems[idx] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    {expandedItems[idx] ? 'Ocultar desglose detallado' : 'Ver desglose detallado de costos'}
                                </button>
                                {!esManual && cargos.length > 0 && (
                                    <span className={`text-[10px] ${labelMuted}`}>
                                        Tarifa catálogo base: {formatSalarioMoneda(salarioCatalogo)}/mes
                                    </span>
                                )}
                            </div>

                            {/* Desglose detallado expandible */}
                            {expandedItems[idx] && cotizacionCalculada?.resultados?.[idx] && (() => {
                                const itemCalculado = cotizacionCalculada.resultados[idx];
                                return (
                                    <div className={`mt-3 p-3 rounded-lg border text-xs grid grid-cols-2 md:grid-cols-4 gap-3 transition-all duration-300 ${isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-[#04141E]/40 border-[#1a3a56]/50 text-slate-300'}`}>
                                        <div>
                                            <span className={labelMuted}>Costo Nómina:</span>
                                            <p className="font-bold tabular-nums text-sm mt-0.5">{formatMoney(itemCalculado.total_nomina, form.moneda)}</p>
                                            <span className={`text-[10px] ${labelMuted} block`}>(Salario + Auxs + SS + Prest)</span>
                                        </div>
                                        <div>
                                            <span className={labelMuted}>Equipamiento (Dotación):</span>
                                            <p className="font-bold tabular-nums text-sm mt-0.5">{formatMoney(itemCalculado.equipo_costo, form.moneda)}</p>
                                            <span className={`text-[10px] ${labelMuted} block`}>(Tipo de equipo: {itemCalculado.equipo_tipo})</span>
                                        </div>
                                        <div>
                                            <span className={labelMuted}>Gastos y Staff:</span>
                                            <p className="font-bold tabular-nums text-sm mt-0.5">{formatMoney(itemCalculado.gto_vinculacion + itemCalculado.staff_cinte + itemCalculado.provi_indem, form.moneda)}</p>
                                            <span className={`text-[10px] ${labelMuted} block`}>(Vinculación + Staff + Prov)</span>
                                        </div>
                                        <div>
                                            <span className={labelMuted}>Costo Financiado:</span>
                                            <p className="font-bold tabular-nums text-sm mt-0.5">{formatMoney(itemCalculado.costo_financiado, form.moneda)}</p>
                                            <span className={`text-[10px] ${labelMuted} block`}>(Plazo: {form.plazo} días, +{(itemCalculado.tasa_financiera * 100).toFixed(1)}%)</span>
                                        </div>
                                        <div className="col-span-2 md:col-span-4 border-t pt-2 border-slate-700/20 grid grid-cols-1 md:grid-cols-3 gap-2">
                                            <div>
                                                <span className={labelMuted}>Tarifa Mensual Unitario:</span>
                                                <p className="text-sm font-black text-[#088DC6] tabular-nums mt-0.5">{formatMoney(itemCalculado.tarifa_mes, form.moneda)}</p>
                                            </div>
                                            <div>
                                                <span className={labelMuted}>Tarifa Día Unitario:</span>
                                                <p className="text-sm font-semibold tabular-nums mt-0.5">{formatMoney(itemCalculado.tarifa_dia, form.moneda)}</p>
                                            </div>
                                            <div>
                                                <span className={labelMuted}>Tarifa Hora Unitario:</span>
                                                <p className="text-sm font-semibold tabular-nums mt-0.5">{formatMoney(itemCalculado.tarifa_hora, form.moneda)}</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    );
                })}
                <button type="button" onClick={addPerfil} className={`${ghostBtn} disabled:opacity-50`} disabled={!isClientSelected}>+ Agregar item</button>
                </div>
            </div>

            <div className={cardPanel}>
                <div className="mb-4">
                    <h3 className={panelTitle}>Información adicional</h3>
                    <p className={`text-xs ${labelMuted}`}>Notas y condiciones particulares de la propuesta</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className={`text-xs ${labelMuted}`}>Notas comerciales</label>
                        <textarea
                            rows={3}
                            placeholder="Notas de aclaración generales..."
                            className={`w-full ${field} mt-1 disabled:opacity-50`}
                            value={form.notas || ''}
                            onChange={(e) => setForm((p) => ({ ...p, notas: e.target.value }))}
                            disabled={!isClientSelected}
                        />
                    </div>
                    <div>
                        <label className={`text-xs ${labelMuted}`}>Términos de pago</label>
                        <textarea
                            rows={3}
                            placeholder="Condiciones específicas, cobro de servicios, etc..."
                            className={`w-full ${field} mt-1 disabled:opacity-50`}
                            value={form.terminos || ''}
                            onChange={(e) => setForm((p) => ({ ...p, terminos: e.target.value }))}
                            disabled={!isClientSelected}
                        />
                    </div>
                </div>

                {cotizacionCalculada && (
                    <div className={`mt-6 p-4 rounded-xl border ${isLight ? 'border-sky-100 bg-sky-50/50' : 'border-[#1a3a56]/50 bg-[#04141E]/40'} space-y-4`}>
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                            <div className="flex flex-col gap-1 w-full md:w-auto">
                                <span className={`text-xs uppercase tracking-wider font-bold ${labelMuted}`}>Resumen Comercial (En vivo)</span>
                                <div className="flex gap-6 mt-1 flex-wrap">
                                    <div>
                                        <span className={`text-xs ${labelMuted}`}>Subtotal:</span>
                                        <p className="text-base font-bold tabular-nums">{formatMoney(cotizacionCalculada.subtotal, form.moneda)}</p>
                                    </div>
                                    <div>
                                        <span className={`text-xs ${labelMuted}`}>IVA (19%):</span>
                                        <p className="text-base font-bold tabular-nums">{formatMoney(cotizacionCalculada.iva, form.moneda)}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="w-full md:w-auto text-right">
                                <span className={`text-xs uppercase tracking-wider font-bold ${labelMuted}`}>Total Estimado ({form.meses} {Number(form.meses) === 1 ? 'mes' : 'meses'})</span>
                                <p className="text-3xl font-black text-[#088DC6] tracking-tight tabular-nums mt-1">
                                    {formatMoney(cotizacionCalculada.total, form.moneda)}
                                </p>
                            </div>
                        </div>

                        {composicionCostos && (
                            <div className="border-t pt-3 border-slate-700/20 space-y-2">
                                <span className={`text-[10px] uppercase tracking-wider font-bold ${labelMuted}`}>Composición del Costo Total</span>
                                <div className="h-2 w-full rounded-full overflow-hidden flex bg-slate-800">
                                    {composicionCostos.nominaPct > 0 && (
                                        <div
                                            style={{ width: `${composicionCostos.nominaPct}%` }}
                                            className="bg-[#088DC6] h-full transition-all duration-500"
                                            title={`Nómina: ${composicionCostos.nominaPct}%`}
                                        />
                                    )}
                                    {composicionCostos.equipamientoPct > 0 && (
                                        <div
                                            style={{ width: `${composicionCostos.equipamientoPct}%` }}
                                            className="bg-amber-500 h-full transition-all duration-500"
                                            title={`Equipamiento: ${composicionCostos.equipamientoPct}%`}
                                        />
                                    )}
                                    {composicionCostos.operacionesPct > 0 && (
                                        <div
                                            style={{ width: `${composicionCostos.operacionesPct}%` }}
                                            className="bg-emerald-500 h-full transition-all duration-500"
                                            title={`Gastos / Operaciones: ${composicionCostos.operacionesPct}%`}
                                        />
                                    )}
                                </div>
                                <div className="flex flex-wrap gap-4 text-[10px] font-semibold">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-[#088DC6]" />
                                        <span className={labelMuted}>Nómina: {composicionCostos.nominaPct}%</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                                        <span className={labelMuted}>Equipamiento: {composicionCostos.equipamientoPct}%</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                        <span className={labelMuted}>Operaciones: {composicionCostos.operacionesPct}%</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {formError && <div className={formErrorBox}>{formError}</div>}

                <div className="mt-6 flex items-center justify-between border-t pt-4 border-slate-700/20">
                    <div>
                        {onDelete && (
                            <button
                                type="button"
                                onClick={onDelete}
                                disabled={isDeleting || deleteDisabled}
                                title={deleteDisabled ? 'Solo las cotizaciones en Borrador pueden ser eliminadas' : ''}
                                className={
                                    isLight
                                        ? 'inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50'
                                        : 'inline-flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-slate-800 px-3 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50'
                                }
                            >
                                <Trash2 size={16} /> <span className="hidden sm:inline">Eliminar</span>
                            </button>
                        )}
                    </div>
                    <div className="flex justify-end gap-3">
                        {onCancel && (
                            <button
                                type="button"
                                onClick={onCancel}
                                className={ghostBtn}
                            >
                                Cancelar
                            </button>
                        )}
                        <button
                            type="button"
                            disabled={loading || !isClientSelected}
                            onClick={handleSaveClick}
                            className={`${primaryBtn} disabled:opacity-50`}
                        >
                            {loading ? 'Guardando…' : 'Guardar Cotización'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
