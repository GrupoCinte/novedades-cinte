import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { CONCILIACION_EMAIL_COLUMNS, formatNovedadesCellLines } from './conciliacionEmailColumns.js';

function readCookie(name) {
    const raw = typeof document !== 'undefined' ? document.cookie : '';
    const part = raw
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith(`${name}=`));
    return part ? decodeURIComponent(part.slice(name.length + 1)) : '';
}

function emailAccionHeaders(extra = {}) {
    const headers = { ...extra };
    const xsrf = readCookie('cinteXsrf');
    if (xsrf) headers['x-cinte-xsrf'] = xsrf;
    return headers;
}

function formatCell(row, colKey) {
    const col = CONCILIACION_EMAIL_COLUMNS.find((c) => c.key === colKey);
    if (!col) return row?.[colKey] != null ? String(row[colKey]) : '';
    if (colKey === 'diasFacturables') {
        const dias = row?.diasFacturables;
        const diasMes = row?.diasMes;
        if (row?.prorrateoAplicado && diasMes != null && diasMes !== '') {
            return `${dias ?? ''}/${diasMes}`;
        }
        if (dias != null && dias !== '') return String(dias);
        if (diasMes != null && diasMes !== '') return String(diasMes);
        return '';
    }
    if (colKey === 'novedadesTipos') {
        return formatNovedadesCellLines(row).join('\n');
    }
    const val = row?.[colKey];
    if (col.format === 'cop') {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            maximumFractionDigits: 0
        }).format(Number(val) || 0);
    }
    return val != null && val !== '' ? String(val) : '';
}

function DecisionBadge({ decision, locked }) {
    if (locked) {
        return (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Conciliada
            </span>
        );
    }
    if (decision === 'APROBADO') {
        return (
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                Aprobado
            </span>
        );
    }
    if (decision === 'RECHAZADO') {
        return (
            <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                Rechazado
            </span>
        );
    }
    return (
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            Pendiente
        </span>
    );
}

export default function ConciliacionesEmailAccionPage() {
    const [searchParams] = useSearchParams();
    const token = String(searchParams.get('token') || '').trim();

    const [loading, setLoading] = useState(true);
    const [context, setContext] = useState(null);
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState(null);

    const [rejectModal, setRejectModal] = useState(null);
    const [observacion, setObservacion] = useState('');
    const [showFinalizeModal, setShowFinalizeModal] = useState(false);

    useEffect(() => {
        let meta = document.querySelector('meta[name="referrer"]');
        const created = !meta;
        if (!meta) {
            meta = document.createElement('meta');
            meta.setAttribute('name', 'referrer');
            document.head.appendChild(meta);
        }
        const prev = meta.getAttribute('content');
        meta.setAttribute('content', 'no-referrer');
        return () => {
            if (created && meta.parentNode) meta.parentNode.removeChild(meta);
            else if (prev != null) meta.setAttribute('content', prev);
            else meta.removeAttribute('content');
        };
    }, []);

    const loadContext = useCallback(async () => {
        if (!token) {
            setError('Enlace inválido: falta el token.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const res = await fetch(
                `/api/conciliaciones/email-accion/context?token=${encodeURIComponent(token)}`,
                { credentials: 'include', headers: emailAccionHeaders() }
            );
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) {
                throw new Error(data.error || 'No se pudo cargar la conciliación');
            }
            setContext(data);
            if (data.todosDecididos && data.puedeFinalizar) {
                setShowFinalizeModal(true);
            }
        } catch (e) {
            setError(e.message || 'Enlace no válido');
            setContext(null);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        loadContext();
    }, [loadContext]);

    const columnas = useMemo(() => {
        const keys = Array.isArray(context?.columnas) ? context.columnas : [];
        return keys
            .map((k) => CONCILIACION_EMAIL_COLUMNS.find((c) => c.key === k))
            .filter(Boolean);
    }, [context?.columnas]);

    const rows = Array.isArray(context?.rows) ? context.rows : [];
    const rowsEditables = useMemo(() => rows.filter((r) => !r.locked), [rows]);
    const puedeAccionMasiva = rowsEditables.length > 0;

    const applyRowsUpdate = (data) => {
        if (data?.rows) {
            setContext((prev) =>
                prev
                    ? {
                          ...prev,
                          rows: data.rows,
                          todosDecididos: Boolean(data.todosDecididos),
                          puedeFinalizar: Boolean(data.puedeFinalizar)
                      }
                    : prev
            );
        }
        if (data?.todosDecididos && data?.puedeFinalizar) {
            setShowFinalizeModal(true);
        }
    };

    const postDecide = async (body) => {
        setSubmitting(true);
        setError('');
        try {
            const res = await fetch('/api/conciliaciones/email-accion/decide', {
                method: 'POST',
                credentials: 'include',
                headers: emailAccionHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ token, ...body })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo registrar');
            applyRowsUpdate(data);
            return data;
        } finally {
            setSubmitting(false);
        }
    };

    const postDecideMasivo = async (body) => {
        setSubmitting(true);
        setError('');
        try {
            const res = await fetch('/api/conciliaciones/email-accion/decide-masivo', {
                method: 'POST',
                credentials: 'include',
                headers: emailAccionHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ token, ...body })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo registrar');
            applyRowsUpdate(data);
            return data;
        } finally {
            setSubmitting(false);
        }
    };

    const handleApprove = async (cedula) => {
        try {
            await postDecide({ cedula, decision: 'APROBADO' });
        } catch (e) {
            setError(e.message || 'Error al aprobar');
        }
    };

    const openReject = (mode, cedula = null) => {
        setObservacion('');
        setRejectModal({ mode, cedula });
    };

    const confirmReject = async () => {
        const obs = String(observacion || '').trim();
        if (!obs) {
            setError('La observación es obligatoria para rechazar');
            return;
        }
        try {
            if (rejectModal?.mode === 'masivo') {
                const cedulas = rowsEditables.map((r) => r.cedula).filter(Boolean);
                if (!cedulas.length) {
                    setError('No hay consultores pendientes para rechazar');
                    return;
                }
                await postDecideMasivo({ decision: 'RECHAZADO', observacion: obs, cedulas });
            } else {
                await postDecide({
                    cedula: rejectModal?.cedula,
                    decision: 'RECHAZADO',
                    observacion: obs
                });
            }
            setRejectModal(null);
            setObservacion('');
            setError('');
        } catch (e) {
            setError(e.message || 'Error al rechazar');
        }
    };

    const handleApproveAll = async () => {
        try {
            const cedulas = rowsEditables.map((r) => r.cedula).filter(Boolean);
            if (!cedulas.length) {
                setError('No hay consultores pendientes: los ya conciliados no se pueden volver a decidir');
                return;
            }
            await postDecideMasivo({ decision: 'APROBADO', cedulas });
        } catch (e) {
            setError(e.message || 'Error al aprobar todo');
        }
    };

    const handleFinalize = async () => {
        setSubmitting(true);
        setError('');
        try {
            const res = await fetch('/api/conciliaciones/email-accion/finalize', {
                method: 'POST',
                credentials: 'include',
                headers: emailAccionHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ token })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.ok) throw new Error(data.error || 'No se pudo finalizar');
            setShowFinalizeModal(false);
            setResult(data);
        } catch (e) {
            setError(e.message || 'Error al finalizar');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50">
                <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
            </div>
        );
    }

    if (result) {
        const okAll = result.kind === 'aprobada';
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
                <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                    {okAll ? (
                        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
                    ) : (
                        <XCircle className="mx-auto h-12 w-12 text-amber-500" />
                    )}
                    <h1 className="mt-4 text-xl font-semibold text-slate-800">Conciliación enviada</h1>
                    <p className="mt-2 text-sm text-slate-600">
                        {result.kind === 'aprobada'
                            ? 'Todos los consultores fueron aprobados. El servicio quedó conciliado.'
                            : result.kind === 'rechazada'
                              ? 'Todos los consultores fueron rechazados. El servicio volvió a revisión.'
                              : `Cierre parcial: ${result.aprobados || 0} aprobados y ${result.rechazados || 0} rechazados.`}
                    </p>
                </div>
            </div>
        );
    }

    if (error && !context) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
                <div className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-8 text-center shadow-sm">
                    <XCircle className="mx-auto h-10 w-10 text-red-500" />
                    <p className="mt-4 text-sm text-slate-700">{error}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 px-4 py-8">
            <div className="mx-auto max-w-6xl">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <h1 className="text-xl font-semibold text-slate-800">Revisar conciliación</h1>
                    <p className="mt-2 text-sm text-slate-600">
                        Cliente: <strong>{context?.servicio?.client || '—'}</strong>
                        {' · '}
                        Servicio: <strong>{context?.servicio?.serviceName || '—'}</strong>
                        {' · '}
                        Periodo: <strong>{context?.mesLabel || `${context?.mes}/${context?.anio}`}</strong>
                    </p>
                    {context?.plazoLabel ? (
                        <p className="mt-1 text-sm text-slate-500">
                            Plazo del enlace: {context.plazoLabel}
                            {context.expiraAt
                                ? ` (vence ${new Date(context.expiraAt).toLocaleString('es-CO')})`
                                : ''}
                        </p>
                    ) : null}

                    {error ? (
                        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {error}
                        </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={submitting || !puedeAccionMasiva}
                            onClick={handleApproveAll}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                            Aprobar todo
                        </button>
                        <button
                            type="button"
                            disabled={submitting || !puedeAccionMasiva}
                            onClick={() => openReject('masivo')}
                            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                            Rechazar todo
                        </button>
                        {context?.puedeFinalizar ? (
                            <button
                                type="button"
                                disabled={submitting}
                                onClick={() => setShowFinalizeModal(true)}
                                className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                            >
                                Enviar / cerrar conciliación
                            </button>
                        ) : null}
                    </div>

                    <div className="mt-6 overflow-x-auto">
                        <table className="min-w-full border-collapse text-left text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50">
                                    {columnas.map((c) => (
                                        <th key={c.key} className="px-3 py-2 font-semibold text-slate-700">
                                            {c.label}
                                        </th>
                                    ))}
                                    <th className="px-3 py-2 font-semibold text-slate-700">Estado</th>
                                    <th className="px-3 py-2 font-semibold text-slate-700">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row.cedula} className="border-b border-slate-100">
                                        {columnas.map((c) => (
                                            <td
                                                key={c.key}
                                                className={`px-3 py-2 text-slate-700 ${c.key === 'novedadesTipos' ? 'whitespace-pre-line' : ''}`}
                                            >
                                                {formatCell(row, c.key)}
                                            </td>
                                        ))}
                                        <td className="px-3 py-2">
                                            <DecisionBadge decision={row.decision} locked={row.locked} />
                                        </td>
                                        <td className="px-3 py-2">
                                            {row.locked ? (
                                                <span className="text-xs text-slate-500">Ya conciliado</span>
                                            ) : (
                                                <div className="flex flex-col gap-1 sm:flex-row">
                                                    <button
                                                        type="button"
                                                        disabled={submitting}
                                                        onClick={() => handleApprove(row.cedula)}
                                                        className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                                    >
                                                        Aprobar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={submitting}
                                                        onClick={() => openReject('uno', row.cedula)}
                                                        className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                                                    >
                                                        Rechazar
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {!rows.length ? (
                                    <tr>
                                        <td
                                            colSpan={columnas.length + 2}
                                            className="px-3 py-8 text-center text-slate-500"
                                        >
                                            No hay consultores en esta conciliación.
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {rejectModal ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                        <h2 className="text-lg font-semibold text-slate-800">Motivo del rechazo</h2>
                        <p className="mt-1 text-sm text-slate-600">
                            {rejectModal.mode === 'masivo'
                                ? 'Indica el motivo para rechazar los consultores pendientes (los ya conciliados no se incluyen).'
                                : 'Indica el motivo del rechazo de este consultor.'}
                        </p>
                        <textarea
                            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            rows={4}
                            maxLength={1000}
                            value={observacion}
                            onChange={(e) => setObservacion(e.target.value)}
                            placeholder="Observación obligatoria"
                        />
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                                onClick={() => setRejectModal(null)}
                                disabled={submitting}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                onClick={confirmReject}
                                disabled={submitting}
                            >
                                Confirmar rechazo
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {showFinalizeModal && context?.puedeFinalizar ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
                        <h2 className="text-lg font-semibold text-slate-800">Enviar conciliación</h2>
                        <p className="mt-2 text-sm text-slate-600">
                            Ya decidiste todos los consultores. ¿Deseas enviar / cerrar la conciliación ahora?
                        </p>
                        <div className="mt-4 flex justify-end gap-2">
                            <button
                                type="button"
                                className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
                                onClick={() => setShowFinalizeModal(false)}
                                disabled={submitting}
                            >
                                Seguir revisando
                            </button>
                            <button
                                type="button"
                                className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                                onClick={handleFinalize}
                                disabled={submitting}
                            >
                                {submitting ? 'Enviando…' : 'Sí, enviar'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
