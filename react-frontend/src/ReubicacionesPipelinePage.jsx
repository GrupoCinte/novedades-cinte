import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Pencil, Trash2 } from 'lucide-react';
import { useModuleTheme } from './moduleTheme.js';
import { currencyNarrowSymbol, formatMoneyAmountOnly } from './multiCurrencyMoney.js';

function readCookie(name) {
    const raw = typeof document !== 'undefined' ? String(document.cookie || '') : '';
    if (!raw) return '';
    const parts = raw.split(';');
    for (const part of parts) {
        const [k, ...rest] = part.trim().split('=');
        if (k === name) return decodeURIComponent(rest.join('=') || '');
    }
    return '';
}

function authHeaders(token) {
    const headers = { 'Content-Type': 'application/json' };
    const t = String(token || '').trim();
    if (t) headers.Authorization = `Bearer ${t}`;
    const xsrf = readCookie('cinteXsrf');
    if (xsrf) headers['x-cinte-xsrf'] = xsrf;
    return headers;
}

function formatTarifaDisplay(row) {
    const key = 'tarifa_cliente';
    const n = row.tarifa_cliente;
    if (n == null || n === '') return '—';
    const ccy = row.montos_divisa?.[key] || 'COP';
    const num = Number(n);
    if (!Number.isFinite(num)) return '—';
    return `${formatMoneyAmountOnly(num, ccy)}\u00A0${currencyNarrowSymbol(ccy)}`;
}

/** API devuelve Verde | Amarillo | Rojo | Vencido — etiquetas e iconos para UI. */
function SemaforoBadge({ code, isLight }) {
    const s = String(code || '');
    if (s === 'Verde') {
        return (
            <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isLight ? 'bg-emerald-100 text-emerald-900' : 'bg-emerald-900/45 text-emerald-100'
                }`}
            >
                Proyectado
            </span>
        );
    }
    if (s === 'Amarillo') {
        return (
            <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isLight ? 'bg-amber-100 text-amber-950' : 'bg-amber-900/45 text-amber-100'
                }`}
            >
                En riesgo
                <AlertTriangle className={isLight ? 'h-3 w-3 shrink-0 text-amber-700' : 'h-3 w-3 shrink-0 text-amber-200'} aria-hidden />
            </span>
        );
    }
    if (s === 'Rojo') {
        return (
            <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isLight ? 'bg-red-200/95 text-red-950' : 'bg-red-950/50 text-red-100'
                }`}
            >
                Urgente
            </span>
        );
    }
    if (s === 'Vencido') {
        return (
            <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isLight ? 'bg-red-700 text-white' : 'bg-red-700 text-white'
                }`}
            >
                Vencido
                <AlertTriangle className="h-3 w-3 shrink-0 text-red-100" aria-hidden />
            </span>
        );
    }
    return (
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${isLight ? 'bg-slate-100 text-slate-700' : 'bg-slate-800 text-slate-200'}`}>
            —
        </span>
    );
}

const SEMAFORO_CODES = ['Verde', 'Amarillo', 'Rojo', 'Vencido'];
const SEMAFORO_LABELS = { Verde: 'Proyectado', Amarillo: 'En riesgo', Rojo: 'Urgente', Vencido: 'Vencido' };

function emptyForm() {
    return { cedula: '', fecha_fin: '', cliente_destino: '', causal: '' };
}

/**
 * @typedef {{ seq: number, reset?: boolean, fechaFinDesde?: string, fechaFinHasta?: string, semaforo?: string }} PipelineNavIntent
 */

export default function ReubicacionesPipelinePage({ token, navIntent }) {
    const { isLight, field, compactBtn, labelMuted, tableSurface, tableThead, tableRowBorder, headingAccent } =
        useModuleTheme();

    const [items, setItems] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [q, setQ] = useState('');
    const [appliedQ, setAppliedQ] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [msg, setMsg] = useState(null);

    const [fechaFinDesde, setFechaFinDesde] = useState('');
    const [fechaFinHasta, setFechaFinHasta] = useState('');
    /** '' = todos; valor API: Verde | Amarillo | Rojo | Vencido */
    const [semaforoFiltro, setSemaforoFiltro] = useState('');

    const [sort, setSort] = useState({ key: null, dir: 'asc' });

    const [createOpen, setCreateOpen] = useState(false);
    const [createForm, setCreateForm] = useState(emptyForm);
    const [createSaving, setCreateSaving] = useState(false);

    const [editOpen, setEditOpen] = useState(false);
    const [editRow, setEditRow] = useState(null);
    const [editForm, setEditForm] = useState(emptyForm);
    const [editSaving, setEditSaving] = useState(false);

    const totalPages = Math.max(1, Math.ceil((Number(total) || 0) / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const offset = (safePage - 1) * pageSize;

    const handleSortHeader = useCallback((columnKey) => {
        setSort((cur) => {
            if (cur.key === columnKey) {
                return { key: columnKey, dir: cur.dir === 'asc' ? 'desc' : 'asc' };
            }
            return { key: columnKey, dir: 'asc' };
        });
        setPage(1);
    }, []);

    const SortTh = useMemo(() => {
        function Cmp({ colKey, label, align = 'left' }) {
            const active = sort.key === colKey;
            const alignCls = align === 'right' ? 'text-right' : 'text-left';
            return (
                <th className={`${alignCls} p-2 whitespace-nowrap`}>
                    <button
                        type="button"
                        onClick={() => handleSortHeader(colKey)}
                        className="inline-flex items-center gap-1 cursor-pointer font-medium text-inherit bg-transparent border-0 p-0 hover:text-[#65BCF7]"
                    >
                        {label}
                        {active ? (
                            sort.dir === 'asc' ? (
                                <ArrowUp size={14} className="text-[#65BCF7] shrink-0" />
                            ) : (
                                <ArrowDown size={14} className="text-[#65BCF7] shrink-0" />
                            )
                        ) : null}
                    </button>
                </th>
            );
        }
        return Cmp;
    }, [sort, handleSortHeader]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const u = new URLSearchParams({
                limit: String(pageSize),
                offset: String(offset)
            });
            const qq = String(appliedQ || '').trim();
            if (qq) u.set('q', qq);
            if (fechaFinDesde) u.set('fecha_fin_desde', fechaFinDesde);
            if (fechaFinHasta) u.set('fecha_fin_hasta', fechaFinHasta);
            if (semaforoFiltro) u.set('semaforo', semaforoFiltro);
            if (sort.key) {
                u.set('sort', sort.key);
                u.set('dir', sort.dir);
            }
            const res = await fetch(`/api/directorio/reubicaciones-pipeline?${u}`, {
                credentials: 'include',
                headers: authHeaders(token)
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
            setItems(Array.isArray(j.items) ? j.items : []);
            setTotal(Number(j.total) || 0);
        } catch (e) {
            setMsg({ text: e.message || 'No se pudo cargar el pipeline.', ok: false });
            setItems([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [token, pageSize, offset, appliedQ, fechaFinDesde, fechaFinHasta, semaforoFiltro, sort]);

    useEffect(() => {
        load();
    }, [load]);

    /** Aplicar filtros enviados desde el dashboard (u otro módulo) al cambiar `seq`. */
    useEffect(() => {
        const seq = Number(navIntent?.seq || 0);
        if (!seq) return;
        if (navIntent?.reset) {
            setFechaFinDesde('');
            setFechaFinHasta('');
            setSemaforoFiltro('');
            setAppliedQ('');
            setQ('');
            setPage(1);
            return;
        }
        setFechaFinDesde(navIntent?.fechaFinDesde != null ? String(navIntent.fechaFinDesde) : '');
        setFechaFinHasta(navIntent?.fechaFinHasta != null ? String(navIntent.fechaFinHasta) : '');
        setSemaforoFiltro(navIntent?.semaforo != null ? String(navIntent.semaforo) : '');
        setPage(1);
    }, [navIntent?.seq]);

    const flash = useCallback((text, ok = true) => {
        setMsg({ text, ok });
        setTimeout(() => setMsg(null), 5000);
    }, []);

    const submitCreate = async (e) => {
        e.preventDefault();
        setCreateSaving(true);
        try {
            const res = await fetch('/api/directorio/reubicaciones-pipeline', {
                method: 'POST',
                credentials: 'include',
                headers: authHeaders(token),
                body: JSON.stringify({
                    cedula: createForm.cedula,
                    fecha_fin: createForm.fecha_fin,
                    cliente_destino: createForm.cliente_destino || null,
                    causal: createForm.causal || null
                })
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
            flash('Registro creado.');
            setCreateOpen(false);
            setCreateForm(emptyForm());
            await load();
        } catch (err) {
            flash(err.message || 'Error al crear.', false);
        } finally {
            setCreateSaving(false);
        }
    };

    const openEdit = (row) => {
        setEditRow(row);
        setEditForm({
            cedula: row.cedula,
            fecha_fin: String(row.fecha_fin || '').slice(0, 10),
            cliente_destino: row.cliente_destino || '',
            causal: row.causal || ''
        });
        setEditOpen(true);
    };

    const submitEdit = async (e) => {
        e.preventDefault();
        if (!editRow?.id) return;
        setEditSaving(true);
        try {
            const res = await fetch(`/api/directorio/reubicaciones-pipeline/${editRow.id}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: authHeaders(token),
                body: JSON.stringify({
                    fecha_fin: editForm.fecha_fin,
                    cliente_destino: editForm.cliente_destino || null,
                    causal: editForm.causal || null
                })
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
            flash('Cambios guardados.');
            setEditOpen(false);
            setEditRow(null);
            await load();
        } catch (err) {
            flash(err.message || 'Error al guardar.', false);
        } finally {
            setEditSaving(false);
        }
    };

    const deleteRow = async (row) => {
        if (!row?.id) return;
        if (!window.confirm(`¿Eliminar el seguimiento de reubicación para la cédula ${row.cedula}?`)) return;
        try {
            const res = await fetch(`/api/directorio/reubicaciones-pipeline/${row.id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: authHeaders(token)
            });
            const j = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`);
            flash('Registro eliminado.');
            await load();
        } catch (err) {
            flash(err.message || 'No se pudo eliminar.', false);
        }
    };

    const toolbarBtn =
        'px-4 py-2 rounded-md bg-[#2F7BB8] text-white text-sm font-semibold hover:bg-[#25649a] disabled:opacity-50';

    const modalShell = useMemo(
        () =>
            `fixed inset-0 z-50 flex items-center justify-center p-4 ${
                isLight ? 'bg-black/30' : 'bg-black/60'
            }`,
        [isLight]
    );

    const Th = SortTh;

    return (
        <div className="space-y-4 w-full max-w-[95rem]">
            <p className={`text-xs ${labelMuted}`}>
                Seguimiento de reubicaciones (PIPELINE): una fila por consultor en el directorio. Consultor, tipo de
                contrato, cliente actual y tarifa se toman en vivo de la ficha del colaborador.
            </p>

            {msg ? (
                <div
                    className={`px-3 py-2 rounded text-sm ${
                        msg.ok ? 'bg-emerald-900/40 text-emerald-200' : 'bg-red-900/40 text-red-200'
                    }`}
                >
                    {msg.text}
                </div>
            ) : null}

            <div className="flex flex-wrap gap-2 items-end justify-between w-full">
                <div className="flex flex-wrap gap-2 items-end flex-1 min-w-0">
                    <button type="button" onClick={() => setCreateOpen(true)} className={toolbarBtn}>
                        <span className="inline-flex items-center gap-2">
                            <Plus size={16} /> Nuevo registro
                        </span>
                    </button>
                    <div className="flex-1 min-w-[140px]">
                        <label className={`block text-xs ${labelMuted} mb-1`}>Buscar</label>
                        <input
                            className={`w-full ${field}`}
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Cédula, nombre, destino o causal"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setAppliedQ(q);
                            setPage(1);
                        }}
                        className={toolbarBtn}
                    >
                        Buscar
                    </button>
                    <button type="button" onClick={load} className={compactBtn}>
                        Refrescar
                    </button>
                    <div>
                        <label className={`block text-xs ${labelMuted} mb-1`}>Fecha fin desde</label>
                        <input
                            type="date"
                            className={`min-w-[10rem] ${field}`}
                            value={fechaFinDesde}
                            onChange={(e) => {
                                setFechaFinDesde(e.target.value);
                                setPage(1);
                            }}
                        />
                    </div>
                    <div>
                        <label className={`block text-xs ${labelMuted} mb-1`}>Fecha fin hasta</label>
                        <input
                            type="date"
                            className={`min-w-[10rem] ${field}`}
                            value={fechaFinHasta}
                            onChange={(e) => {
                                setFechaFinHasta(e.target.value);
                                setPage(1);
                            }}
                        />
                    </div>
                    <div className="min-w-[11rem]">
                        <label className={`block text-xs ${labelMuted} mb-1`}>Semáforo</label>
                        <select
                            className={`w-full ${field}`}
                            value={semaforoFiltro}
                            onChange={(e) => {
                                setSemaforoFiltro(e.target.value);
                                setPage(1);
                            }}
                        >
                            <option value="">Todos</option>
                            <option value="Amarillo,Rojo,Vencido">En riesgo (amarillo + urgente + vencido)</option>
                            {SEMAFORO_CODES.map((code) => (
                                <option key={code} value={code}>
                                    {SEMAFORO_LABELS[code]}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="shrink-0">
                    <label className={`block text-xs ${labelMuted} mb-1`}>Filas</label>
                    <select className={field} value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                    </select>
                </div>
            </div>

            <p className={`text-xs ${labelMuted}`}>
                Total: {total}
                {total > 0 ? ` · Página ${safePage} de ${totalPages}` : ''}
                . Clic en un encabezado de columna para ordenar (el orden aplica a todo el resultado filtrado).
            </p>

            <div className={tableSurface}>
                <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                        <thead className={tableThead}>
                            <tr>
                                <Th colKey="cedula" label="Cédula" />
                                <Th colKey="consultor" label="Consultor" />
                                <Th colKey="tipo_contrato" label="Tipo contrato" />
                                <Th colKey="cliente_actual" label="Cliente actual" />
                                <Th colKey="cliente_destino" label="Cliente destino" />
                                <Th colKey="causal" label="Causal" />
                                <Th colKey="fecha_fin" label="Fecha fin" />
                                <Th colKey="dias_restantes" label="Días rest." align="right" />
                                <Th colKey="semaforo" label="Semáforo" />
                                <Th colKey="tarifa" label="Tarifa actual" />
                                <th className="text-left p-2 whitespace-nowrap">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={11} className={`p-4 text-center ${labelMuted}`}>
                                        Cargando…
                                    </td>
                                </tr>
                            ) : items.length === 0 ? (
                                <tr>
                                    <td colSpan={11} className={`p-4 text-center ${labelMuted}`}>
                                        Sin registros. Cree uno con «Nuevo registro» (la cédula debe existir en
                                        Consultores).
                                    </td>
                                </tr>
                            ) : (
                                items.map((row) => (
                                    <tr key={row.id} className={tableRowBorder}>
                                        <td className="p-2 whitespace-nowrap">{row.cedula}</td>
                                        <td className="p-2">{row.consultor || '—'}</td>
                                        <td className="p-2">{row.tipo_contrato || '—'}</td>
                                        <td className="p-2">{row.cliente_actual || '—'}</td>
                                        <td className="p-2">{row.cliente_destino || '—'}</td>
                                        <td className="p-2 max-w-[12rem] truncate" title={row.causal || ''}>
                                            {row.causal || '—'}
                                        </td>
                                        <td className="p-2 whitespace-nowrap">{String(row.fecha_fin || '').slice(0, 10)}</td>
                                        <td className="p-2 text-right whitespace-nowrap">
                                            {row.dias_restantes != null ? row.dias_restantes : '—'}
                                        </td>
                                        <td className="p-2 whitespace-nowrap">
                                            <SemaforoBadge code={row.semaforo} isLight={isLight} />
                                        </td>
                                        <td className="p-2 whitespace-nowrap">{formatTarifaDisplay(row)}</td>
                                        <td className="p-2 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    className={`inline-flex items-center gap-1 ${headingAccent} hover:underline`}
                                                    onClick={() => openEdit(row)}
                                                >
                                                    <Pencil size={14} /> Editar
                                                </button>
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 hover:underline"
                                                    onClick={() => deleteRow(row)}
                                                >
                                                    <Trash2 size={14} /> Eliminar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {!loading && total > 0 ? (
                <div className={`flex flex-wrap items-center justify-between gap-2 ${labelMuted}`}>
                    <span>
                        Página {safePage} de {totalPages}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={safePage <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            className={compactBtn}
                        >
                            Anterior
                        </button>
                        <button
                            type="button"
                            disabled={safePage >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            className={compactBtn}
                        >
                            Siguiente
                        </button>
                    </div>
                </div>
            ) : null}

            {createOpen ? (
                <div className={modalShell}>
                    <div
                        className={`relative w-full max-w-lg rounded-2xl border p-6 shadow-xl ${
                            isLight ? 'border-slate-200 bg-white' : 'border-[var(--border)] bg-[var(--surface)]'
                        }`}
                    >
                        <h2 className={`text-lg font-heading font-bold mb-4 ${headingAccent}`}>Nuevo seguimiento</h2>
                        <form onSubmit={submitCreate} className="space-y-3">
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>Cédula *</label>
                                <input
                                    className={`w-full ${field}`}
                                    value={createForm.cedula}
                                    onChange={(e) => setCreateForm((f) => ({ ...f, cedula: e.target.value }))}
                                    required
                                    placeholder="Debe existir en Consultores / Staff"
                                />
                            </div>
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>Fecha fin *</label>
                                <input
                                    type="date"
                                    className={`w-full ${field}`}
                                    value={createForm.fecha_fin}
                                    onChange={(e) => setCreateForm((f) => ({ ...f, fecha_fin: e.target.value }))}
                                    required
                                />
                            </div>
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>Cliente destino</label>
                                <input
                                    className={`w-full ${field}`}
                                    value={createForm.cliente_destino}
                                    onChange={(e) => setCreateForm((f) => ({ ...f, cliente_destino: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>Causal</label>
                                <input
                                    className={`w-full ${field}`}
                                    value={createForm.causal}
                                    onChange={(e) => setCreateForm((f) => ({ ...f, causal: e.target.value }))}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button type="button" className={compactBtn} onClick={() => setCreateOpen(false)}>
                                    Cancelar
                                </button>
                                <button type="submit" disabled={createSaving} className={toolbarBtn}>
                                    {createSaving ? 'Guardando…' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}

            {editOpen && editRow ? (
                <div className={modalShell}>
                    <div
                        className={`relative w-full max-w-lg rounded-2xl border p-6 shadow-xl ${
                            isLight ? 'border-slate-200 bg-white' : 'border-[var(--border)] bg-[var(--surface)]'
                        }`}
                    >
                        <h2 className={`text-lg font-heading font-bold mb-4 ${headingAccent}`}>Editar seguimiento</h2>
                        <p className={`text-xs ${labelMuted} mb-3`}>
                            Cédula {editForm.cedula} · {editRow.consultor || 'Consultor'}
                        </p>
                        <form onSubmit={submitEdit} className="space-y-3">
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>Fecha fin *</label>
                                <input
                                    type="date"
                                    className={`w-full ${field}`}
                                    value={editForm.fecha_fin}
                                    onChange={(e) => setEditForm((f) => ({ ...f, fecha_fin: e.target.value }))}
                                    required
                                />
                            </div>
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>Cliente destino</label>
                                <input
                                    className={`w-full ${field}`}
                                    value={editForm.cliente_destino}
                                    onChange={(e) => setEditForm((f) => ({ ...f, cliente_destino: e.target.value }))}
                                />
                            </div>
                            <div>
                                <label className={`block text-xs ${labelMuted} mb-1`}>Causal</label>
                                <input
                                    className={`w-full ${field}`}
                                    value={editForm.causal}
                                    onChange={(e) => setEditForm((f) => ({ ...f, causal: e.target.value }))}
                                />
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    className={compactBtn}
                                    onClick={() => {
                                        setEditOpen(false);
                                        setEditRow(null);
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button type="submit" disabled={editSaving} className={toolbarBtn}>
                                    {editSaving ? 'Guardando…' : 'Guardar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
