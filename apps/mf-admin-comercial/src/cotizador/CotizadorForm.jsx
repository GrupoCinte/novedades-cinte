import { useEffect, useMemo, useRef, useState } from 'react';
import { formatSalarioMoneda, parseSalarioLoose } from './salarioFormat';
import { mergeCotizadorClienteRows } from './cotizadorClientesMerge.js';
import { useModuleTheme } from '../moduleTheme.js';

export default function CotizadorForm({
    catalogos,
    cargosResueltos,
    clientesLista,
    form,
    setForm,
    onCotizar,
    loading
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
        dangerSoftBtn
    } = useModuleTheme();
    const cargos = Array.isArray(cargosResueltos) ? cargosResueltos : [];
    const prevClienteRef = useRef(form.cliente);
    const [salarioFocusedIdx, setSalarioFocusedIdx] = useState(null);
    const [formError, setFormError] = useState('');

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

    const handleCotizarClick = () => {
        setFormError('');
        const cliente = String(form.cliente || '').trim();
        if (!cliente) {
            setFormError('Seleccione un cliente.');
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
        onCotizar();
    };

    const clientNit = clientes.find((c) => c.nombre === form.cliente)?.nit || '';

    return (
        <div className={cardPanel}>
            <h3 className={`${panelTitle} mb-4`}>Cotizador</h3>
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
                        className={`w-full ${field}`}
                        value={form.comercial}
                        onChange={(e) => setForm((p) => ({ ...p, comercial: e.target.value }))}
                    >
                        <option value="">Selecciona comercial</option>
                        {comerciales.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label className={`text-xs ${labelMuted}`}>Plazo</label>
                    <select className={`w-full ${field}`} value={form.plazo} onChange={(e) => setForm((p) => ({ ...p, plazo: e.target.value }))}>
                        <option value="30">30</option>
                        <option value="45">45</option>
                        <option value="60">60</option>
                    </select>
                </div>
                <div>
                    <label className={`text-xs ${labelMuted}`}>Margen (%) min {Math.round(margenMin * 100)}</label>
                    <input
                        type="number"
                        min={Math.round(margenMin * 100)}
                        className={`w-full ${field}`}
                        value={form.margenPct}
                        onChange={(e) => setForm((p) => ({ ...p, margenPct: e.target.value }))}
                    />
                </div>
                <div>
                    <label className={`text-xs ${labelMuted}`}>Meses</label>
                    <input type="number" min="1" className={`w-full ${field}`} value={form.meses} onChange={(e) => setForm((p) => ({ ...p, meses: e.target.value }))} />
                </div>
                <div>
                    <label className={`text-xs ${labelMuted}`}>Moneda</label>
                    <select className={`w-full ${field}`} value={form.moneda} onChange={(e) => setForm((p) => ({ ...p, moneda: e.target.value }))}>
                        {Object.keys(monedas).map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div className={`md:col-span-4 text-xs flex gap-4 ${labelMuted}`}>
                    <span>Tasa financiera: {(tasaFin * 100).toFixed(2)}%</span>
                    <span>Tasa conversión: {form.moneda === 'COP' ? 'N/A' : tasaConv.toLocaleString('es-CO')}</span>
                </div>
            </div>

            <div className="mt-4 space-y-3">
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
                                        className={`w-full ${field}`}
                                        value={p.modo}
                                        onChange={(e) => onModoChange(idx, e.target.value, p)}
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
                                            className={fieldManual}
                                            placeholder="Escriba el nombre del cargo"
                                            value={p.cargo_manual || ''}
                                            onChange={(e) => updatePerfil(idx, { cargo_manual: e.target.value })}
                                        />
                                    ) : (
                                        <select
                                            className={`w-full ${field} disabled:opacity-60`}
                                            disabled={cargos.length === 0}
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
                                    <input type="number" min="1" className={`w-full ${field}`} value={p.cantidad} onChange={(e) => updatePerfil(idx, { cantidad: Number(e.target.value || 1) })} />
                                </div>
                                <div>
                                    <label className={`text-xs ${labelMuted}`}>Salario</label>
                                    {esManual ? (
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            autoComplete="off"
                                            className={`${fieldManual} text-right tabular-nums tracking-tight`}
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
                                <div className="flex items-end pb-0.5">
                                    <button type="button" onClick={() => removePerfil(idx)} className={dangerSoftBtn}>
                                        Quitar
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
                <button type="button" onClick={addPerfil} className={ghostBtn}>+ Agregar perfil</button>
            </div>

            {formError && <div className={formErrorBox}>{formError}</div>}

            <div className="mt-4">
                <button
                    type="button"
                    disabled={loading}
                    onClick={handleCotizarClick}
                    className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold"
                >
                    {loading ? 'Calculando...' : 'Cotizar'}
                </button>
            </div>
        </div>
    );
}
