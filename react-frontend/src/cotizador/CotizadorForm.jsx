import { useEffect, useMemo, useRef, useState } from 'react';
import { formatSalarioMoneda, parseSalarioLoose } from './salarioFormat';

export default function CotizadorForm({
    catalogos,
    cargosResueltos,
    clientesLista,
    form,
    setForm,
    onCotizar,
    loading
}) {
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

    const desdeFormulario = Array.isArray(clientesLista) && clientesLista.length > 0;
    const clientes = desdeFormulario
        ? clientesLista
        : (Array.isArray(catalogos?.clientes) ? catalogos.clientes : []);
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
        <div className="bg-[#0b1e30] border border-[#1a3a56] rounded-xl p-4 font-body">
            <h3 className="text-white font-heading font-bold mb-4">Cotizador</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2">
                    <label className="text-xs text-slate-400">Cliente</label>
                    <select
                        className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-slate-200"
                        value={form.cliente}
                        onChange={(e) => setForm((p) => ({ ...p, cliente: e.target.value }))}
                    >
                        <option value="">Selecciona cliente</option>
                        {clientes.map((c) => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-slate-400">NIT</label>
                    <input value={clientNit} readOnly className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-slate-300" />
                </div>
                <div>
                    <label className="text-xs text-slate-400">Comercial</label>
                    <select
                        className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-slate-200"
                        value={form.comercial}
                        onChange={(e) => setForm((p) => ({ ...p, comercial: e.target.value }))}
                    >
                        <option value="">Selecciona comercial</option>
                        {comerciales.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-xs text-slate-400">Plazo</label>
                    <select className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-slate-200" value={form.plazo} onChange={(e) => setForm((p) => ({ ...p, plazo: e.target.value }))}>
                        <option value="30">30</option>
                        <option value="45">45</option>
                        <option value="60">60</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs text-slate-400">Margen (%) min {Math.round(margenMin * 100)}</label>
                    <input
                        type="number"
                        min={Math.round(margenMin * 100)}
                        className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-slate-200"
                        value={form.margenPct}
                        onChange={(e) => setForm((p) => ({ ...p, margenPct: e.target.value }))}
                    />
                </div>
                <div>
                    <label className="text-xs text-slate-400">Meses</label>
                    <input type="number" min="1" className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-slate-200" value={form.meses} onChange={(e) => setForm((p) => ({ ...p, meses: e.target.value }))} />
                </div>
                <div>
                    <label className="text-xs text-slate-400">Moneda</label>
                    <select className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-slate-200" value={form.moneda} onChange={(e) => setForm((p) => ({ ...p, moneda: e.target.value }))}>
                        {Object.keys(monedas).map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div className="md:col-span-4 text-xs text-slate-400 flex gap-4">
                    <span>Tasa financiera: {(tasaFin * 100).toFixed(2)}%</span>
                    <span>Tasa conversión: {form.moneda === 'COP' ? 'N/A' : tasaConv.toLocaleString('es-CO')}</span>
                </div>
            </div>

            <div className="mt-4 space-y-3">
                {!form.cliente && (
                    <p className="text-xs text-slate-400 border border-slate-600/50 rounded p-2 bg-slate-900/50">
                        Seleccione un cliente para cargar las tarifas disponibles.
                    </p>
                )}
                {form.cliente && cargos.length === 0 && (
                    <p className="text-xs text-amber-200/95 border border-amber-500/25 rounded p-2 bg-amber-950/20">
                        Sin tarifas en catálogo para este cliente. Puede usar modo MANUAL para escribir cargo y salario, o comunique al equipo de sistemas si faltan datos importados.
                    </p>
                )}
                {form.perfiles.map((p, idx) => {
                    const esManual = String(p.modo || '').toUpperCase() === 'MANUAL';
                    const ix = Number(p?.indice ?? 0);
                    const selected = cargos.length > 0 ? (cargos[ix] || {}) : {};
                    const salarioCatalogo = Number(selected.salario ?? 0);
                    return (
                        <div key={`perfil-${idx}`} className="border border-slate-700 rounded p-3 bg-slate-900/40">
                            <div className="grid grid-cols-1 md:grid-cols-6 gap-2 md:items-end">
                                <div>
                                    <label className="text-xs text-slate-400">Modo</label>
                                    <select
                                        className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-slate-200"
                                        value={p.modo}
                                        onChange={(e) => onModoChange(idx, e.target.value, p)}
                                    >
                                        <option value="AUTO">AUTO</option>
                                        <option value="MANUAL">MANUAL</option>
                                    </select>
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-xs text-slate-400">Cargo</label>
                                    {esManual ? (
                                        <input
                                            type="text"
                                            className="w-full bg-slate-800 border border-amber-500/40 rounded p-2 text-slate-200 placeholder:text-slate-500"
                                            placeholder="Escriba el nombre del cargo"
                                            value={p.cargo_manual || ''}
                                            onChange={(e) => updatePerfil(idx, { cargo_manual: e.target.value })}
                                        />
                                    ) : (
                                        <select
                                            className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-slate-200 disabled:opacity-60"
                                            disabled={cargos.length === 0}
                                            value={cargos.length === 0 ? '' : String(ix)}
                                            onChange={(e) => updatePerfil(idx, { indice: Number(e.target.value) })}
                                        >
                                            {cargos.length === 0 ? (
                                                <option value="">— Sin opciones —</option>
                                            ) : (
                                                cargos.map((c, i) => (
                                                    <option key={`${c.cargo}-${i}`} value={String(i)}>{c.cargo}</option>
                                                ))
                                            )}
                                        </select>
                                    )}
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400">Cantidad</label>
                                    <input type="number" min="1" className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-slate-200" value={p.cantidad} onChange={(e) => updatePerfil(idx, { cantidad: Number(e.target.value || 1) })} />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400">Salario</label>
                                    {esManual ? (
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            autoComplete="off"
                                            className="w-full bg-slate-800 border border-amber-500/40 rounded p-2 text-slate-200 text-right tabular-nums tracking-tight"
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
                                            className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-slate-200 text-right tabular-nums tracking-tight min-h-[42px] flex items-center justify-end px-2"
                                            title="Salario según catálogo del cliente"
                                        >
                                            {cargos.length ? formatSalarioMoneda(salarioCatalogo) : '—'}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-end pb-0.5">
                                    <button type="button" onClick={() => removePerfil(idx)} className="w-full bg-rose-600/20 border border-rose-500/40 text-rose-300 rounded p-2">Quitar</button>
                                </div>
                            </div>
                        </div>
                    );
                })}
                <button type="button" onClick={addPerfil} className="px-3 py-2 rounded border border-slate-600 text-slate-200 hover:bg-slate-800">+ Agregar perfil</button>
            </div>

            {formError && (
                <div className="mt-3 border border-rose-500/40 bg-rose-950/40 text-rose-100 rounded-lg px-3 py-2 text-sm">
                    {formError}
                </div>
            )}

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
