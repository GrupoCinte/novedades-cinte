import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Mail, RefreshCw } from 'lucide-react';

async function apiJson(token, path, options = {}) {
    const res = await fetch(path, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(options.headers || {})
        }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(data?.error || `HTTP ${res.status}`);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

function CorreoBadge({ estado }) {
    const e = String(estado || 'no_aplica');
    const styles = {
        enviado: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        pendiente: 'bg-amber-100 text-amber-900 border-amber-200',
        fallido: 'bg-rose-100 text-rose-800 border-rose-200',
        no_aplica: 'bg-slate-100 text-slate-600 border-slate-200'
    };
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${styles[e] || styles.no_aplica}`}>
            <Mail size={12} />
            {e}
        </span>
    );
}

const emptyForm = {
    tipo: 'consultor',
    clienteNombre: '',
    fechaSeguimiento: new Date().toISOString().slice(0, 10),
    consultorCedulas: '',
    modalidad: 'virtual',
    temasTratados: '',
    feedback: '',
    compromiso: ''
};

export default function SeguimientoView({ token }) {
    const [tab, setTab] = useState('actas');
    const [items, setItems] = useState([]);
    const [proximos, setProximos] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [retryingId, setRetryingId] = useState(null);

    const loadActas = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await apiJson(token, '/api/seguimiento/actas');
            setItems(Array.isArray(data.items) ? data.items : []);
        } catch (e) {
            setError(e.message || 'No se pudo cargar el listado');
        } finally {
            setLoading(false);
        }
    }, [token]);

    const loadProximos = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await apiJson(token, '/api/seguimiento/actas?proximosVencer=true&maxDias=5');
            setProximos(Array.isArray(data.items) ? data.items : []);
        } catch (e) {
            setError(e.message || 'No se pudo cargar próximos a vencer');
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        if (tab === 'proximos') loadProximos();
        else loadActas();
    }, [tab, loadActas, loadProximos]);

    const proximosCount = useMemo(() => proximos.length, [proximos]);

    async function submitActa(confirmar) {
        setSaving(true);
        setError('');
        try {
            const body = {
                tipo: form.tipo,
                clienteNombre: form.clienteNombre.trim(),
                fechaSeguimiento: form.fechaSeguimiento,
                consultorCedulas:
                    form.tipo === 'consultor'
                        ? form.consultorCedulas
                              .split(/[,;\s]+/)
                              .map((s) => s.trim())
                              .filter(Boolean)
                        : undefined,
                payload: {
                    modalidad: form.modalidad,
                    temasTratados: form.temasTratados,
                    feedback: form.feedback,
                    compromisos: form.compromiso.trim()
                        ? [{ descripcion: form.compromiso.trim(), responsable: '', fecha: null }]
                        : []
                },
                confirmar
            };
            await apiJson(token, '/api/seguimiento/actas', {
                method: 'POST',
                body: JSON.stringify(body)
            });
            setForm(emptyForm);
            await loadActas();
            if (confirmar) setTab('actas');
        } catch (e) {
            setError(e.message || 'Error al guardar');
        } finally {
            setSaving(false);
        }
    }

    async function reintentar(id) {
        setRetryingId(id);
        setError('');
        try {
            await apiJson(token, `/api/seguimiento/actas/${id}/reintentar-correo`, { method: 'POST', body: '{}' });
            await loadActas();
            if (tab === 'proximos') await loadProximos();
        } catch (e) {
            setError(e.message || 'No se pudo reintentar el correo');
        } finally {
            setRetryingId(null);
        }
    }

    const rows = tab === 'proximos' ? proximos : items;

    return (
        <div className="space-y-6 p-4 md:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Seguimiento</h2>
                    <p className="text-sm text-slate-500">Actas mensuales a consultores y clientes</p>
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                            tab === 'actas' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'
                        }`}
                        onClick={() => setTab('actas')}
                    >
                        Actas
                    </button>
                    <button
                        type="button"
                        className={`rounded-lg px-3 py-1.5 text-sm font-medium inline-flex items-center gap-2 ${
                            tab === 'proximos' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700'
                        }`}
                        onClick={() => setTab('proximos')}
                    >
                        Próximos a vencer
                        {proximosCount > 0 || tab === 'proximos' ? (
                            <span className="rounded-full bg-white/20 px-1.5 text-xs">{proximos.length}</span>
                        ) : null}
                    </button>
                </div>
            </div>

            {error ? (
                <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                    <span>{error}</span>
                </div>
            ) : null}

            {tab === 'actas' ? (
                <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">Nueva acta</h3>
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="text-sm">
                            Tipo
                            <select
                                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                                value={form.tipo}
                                onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
                            >
                                <option value="consultor">Consultor</option>
                                <option value="cliente">Cliente</option>
                            </select>
                        </label>
                        <label className="text-sm">
                            Fecha
                            <input
                                type="date"
                                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                                value={form.fechaSeguimiento}
                                onChange={(e) => setForm((f) => ({ ...f, fechaSeguimiento: e.target.value }))}
                            />
                        </label>
                        <label className="text-sm md:col-span-2">
                            Cliente
                            <input
                                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                                value={form.clienteNombre}
                                onChange={(e) => setForm((f) => ({ ...f, clienteNombre: e.target.value }))}
                                placeholder="Nombre del cliente"
                            />
                        </label>
                        {form.tipo === 'consultor' ? (
                            <label className="text-sm md:col-span-2">
                                Cédulas consultor(es)
                                <input
                                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                                    value={form.consultorCedulas}
                                    onChange={(e) => setForm((f) => ({ ...f, consultorCedulas: e.target.value }))}
                                    placeholder="123, 456"
                                />
                            </label>
                        ) : null}
                        <label className="text-sm">
                            Modalidad
                            <input
                                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                                value={form.modalidad}
                                onChange={(e) => setForm((f) => ({ ...f, modalidad: e.target.value }))}
                            />
                        </label>
                        <label className="text-sm">
                            Compromiso
                            <input
                                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                                value={form.compromiso}
                                onChange={(e) => setForm((f) => ({ ...f, compromiso: e.target.value }))}
                            />
                        </label>
                        <label className="text-sm md:col-span-2">
                            Temas tratados
                            <textarea
                                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                                rows={2}
                                value={form.temasTratados}
                                onChange={(e) => setForm((f) => ({ ...f, temasTratados: e.target.value }))}
                            />
                        </label>
                        <label className="text-sm md:col-span-2">
                            Feedback
                            <textarea
                                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                                rows={2}
                                value={form.feedback}
                                onChange={(e) => setForm((f) => ({ ...f, feedback: e.target.value }))}
                            />
                        </label>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={saving}
                            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
                            onClick={() => submitActa(false)}
                        >
                            Guardar borrador
                        </button>
                        <button
                            type="button"
                            disabled={saving}
                            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                            onClick={() => submitActa(true)}
                        >
                            Finalizar y enviar correo
                        </button>
                    </div>
                </section>
            ) : null}

            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        {tab === 'proximos' ? 'Próximos a vencer (≤ 5 días)' : 'Listado de actas'}
                    </h3>
                    <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                        onClick={() => (tab === 'proximos' ? loadProximos() : loadActas())}
                    >
                        <RefreshCw size={14} /> Actualizar
                    </button>
                </div>
                {loading ? (
                    <div className="p-6 text-sm text-slate-500">Cargando…</div>
                ) : rows.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500">Sin registros.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                                <tr>
                                    <th className="px-3 py-2">Cliente</th>
                                    <th className="px-3 py-2">Tipo</th>
                                    <th className="px-3 py-2">Estado</th>
                                    <th className="px-3 py-2">Correo</th>
                                    <th className="px-3 py-2">Vence</th>
                                    <th className="px-3 py-2">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row.id} className="border-t border-slate-100">
                                        <td className="px-3 py-2 font-medium text-slate-800">{row.clienteNombre}</td>
                                        <td className="px-3 py-2 capitalize">{row.tipo}</td>
                                        <td className="px-3 py-2 capitalize">{row.estado}</td>
                                        <td className="px-3 py-2">
                                            <CorreoBadge estado={row.correoCierreEstado} />
                                            {row.correoCierreLastError ? (
                                                <div className="mt-1 max-w-xs truncate text-xs text-rose-600" title={row.correoCierreLastError}>
                                                    {row.correoCierreLastError}
                                                </div>
                                            ) : null}
                                        </td>
                                        <td className="px-3 py-2">
                                            {row.cicloVenceAt ? (
                                                <span className="inline-flex items-center gap-1 text-slate-700">
                                                    <Clock3 size={14} />
                                                    {row.cicloVenceAt}
                                                    {row.diasRestantes != null ? (
                                                        <span className="text-xs text-slate-500">({row.diasRestantes}d)</span>
                                                    ) : null}
                                                </span>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                        <td className="px-3 py-2">
                                            {row.estado === 'finalizado' &&
                                            ['pendiente', 'fallido'].includes(row.correoCierreEstado) ? (
                                                <button
                                                    type="button"
                                                    disabled={retryingId === row.id}
                                                    className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-50"
                                                    onClick={() => reintentar(row.id)}
                                                >
                                                    <RefreshCw size={12} />
                                                    Reintentar
                                                </button>
                                            ) : row.correoCierreEstado === 'enviado' ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                                                    <CheckCircle2 size={14} /> OK
                                                </span>
                                            ) : (
                                                '—'
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
