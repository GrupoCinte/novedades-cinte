import { useMemo } from 'react';

function formatMoney(n, moneda = 'COP') {
    const value = Number(n || 0);
    if (moneda === 'USD') return `US$ ${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    if (moneda === 'CLP') return `CLP ${Math.round(value).toLocaleString('es-CL')}`;
    return `$ ${Math.round(value).toLocaleString('es-CO')}`;
}

export default function CotizadorForm({
    catalogos,
    form,
    setForm,
    onCotizar,
    loading
}) {
    const cargos = Array.isArray(catalogos?.cargos) ? catalogos.cargos : [];
    const clientes = Array.isArray(catalogos?.clientes) ? catalogos.clientes : [];
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
            perfiles: [...prev.perfiles, { indice: 0, cantidad: 1, modo: 'AUTO', salario_manual: '' }]
        }));
    };

    const removePerfil = (idx) => {
        setForm((prev) => ({
            ...prev,
            perfiles: prev.perfiles.filter((_, i) => i !== idx)
        }));
    };

    const clientNit = clientes.find((c) => c.nombre === form.cliente)?.nit || '';

    return (
        <div className="bg-[#1e293b] border border-slate-700 rounded-xl p-4">
            <h3 className="text-white font-bold mb-4">Cotizador</h3>
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
                {form.perfiles.map((p, idx) => {
                    const selected = cargos[p.indice] || {};
                    return (
                        <div key={`perfil-${idx}`} className="border border-slate-700 rounded p-3 bg-slate-900/40">
                            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                                <div className="md:col-span-2">
                                    <label className="text-xs text-slate-400">Cargo</label>
                                    <select className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-slate-200" value={p.indice} onChange={(e) => updatePerfil(idx, { indice: Number(e.target.value) })}>
                                        {cargos.map((c, i) => <option key={`${c.cargo}-${i}`} value={i}>{c.cargo}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400">Cantidad</label>
                                    <input type="number" min="1" className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-slate-200" value={p.cantidad} onChange={(e) => updatePerfil(idx, { cantidad: Number(e.target.value || 1) })} />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400">Modo</label>
                                    <select className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-slate-200" value={p.modo} onChange={(e) => updatePerfil(idx, { modo: e.target.value })}>
                                        <option value="AUTO">AUTO</option>
                                        <option value="MANUAL">MANUAL</option>
                                    </select>
                                </div>
                                <div className="flex items-end">
                                    <button type="button" onClick={() => removePerfil(idx)} className="w-full bg-rose-600/20 border border-rose-500/40 text-rose-300 rounded p-2">Quitar</button>
                                </div>
                            </div>
                            <div className="mt-2 text-xs text-slate-500">Salario base catálogo: {formatMoney(selected.salario || 0, 'COP')}</div>
                            {p.modo === 'MANUAL' && (
                                <div className="mt-2">
                                    <label className="text-xs text-amber-300">Salario manual (COP)</label>
                                    <input type="number" min="0" className="w-full bg-slate-800 border border-amber-500/40 rounded p-2 text-slate-200" value={p.salario_manual} onChange={(e) => updatePerfil(idx, { salario_manual: e.target.value })} />
                                </div>
                            )}
                        </div>
                    );
                })}
                <button type="button" onClick={addPerfil} className="px-3 py-2 rounded border border-slate-600 text-slate-200 hover:bg-slate-800">+ Agregar perfil</button>
            </div>

            <div className="mt-4">
                <button
                    type="button"
                    disabled={loading}
                    onClick={onCotizar}
                    className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold"
                >
                    {loading ? 'Calculando...' : 'Cotizar'}
                </button>
            </div>
        </div>
    );
}

