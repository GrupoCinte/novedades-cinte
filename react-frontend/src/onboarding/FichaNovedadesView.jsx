import { useCallback, useEffect, useMemo, useState } from 'react';
import { onboardingApi } from './api.js';
import SortableGestionDataTable from './SortableGestionDataTable.jsx';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';
import { fmtFecha } from './views.jsx';
import { buildMonitorGlassModalTheme, monitorGlassModalSizeCls } from '../shared/modals/monitorGlassModalTheme.js';

const TIPO_LABELS = {
    integracion: 'Integración',
    modificacion_id: 'Modificación ID',
    salida: 'Salida',
    extension: 'Extensión',
    cancelacion_ingreso: 'Cancelación ingreso',
    cancelacion_salida: 'Cancelación salida'
};

const STATUS_LABELS = {
    pendiente: 'Pendiente',
    sin_match: 'Sin match',
    aplicado: 'Aplicado',
    rechazado: 'Rechazado'
};

const MATCH_LABELS = {
    codigo: 'Código Zoho',
    cedula: 'Cédula',
    nombre_cliente: 'Nombre + cliente',
    nombre: 'Nombre',
    manual: 'Manual CH'
};

function MatchStrategyBadge({ value, isLight }) {
    const label = MATCH_LABELS[value] || value || '—';
    const title =
        'Prioridad de match: 1) código Zoho, 2) cédula, 3) nombre + cliente, 4) solo nombre. Manual = vinculado por CH.';
    if (!value) return <span className={isLight ? 'text-slate-400' : 'text-slate-500'}>—</span>;
    const cls = isLight
        ? 'bg-violet-100 text-violet-800 border border-violet-200'
        : 'bg-violet-900/40 text-violet-200 border border-violet-700/50';
    return (
        <span
            title={title}
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}
        >
            {label}
        </span>
    );
}

function extractHintsFromItem(item) {
    const raw = item?.payload_raw;
    const parsed =
        typeof raw === 'object' && raw
            ? raw
            : (() => {
                  try {
                      return typeof raw === 'string' ? JSON.parse(raw) : {};
                  } catch {
                      return {};
                  }
              })();
    const parsedSubject =
        typeof parsed.parsed_subject === 'string'
            ? (() => {
                  try {
                      return JSON.parse(parsed.parsed_subject);
                  } catch {
                      return {};
                  }
              })()
            : parsed.parsed_subject || {};
    return {
        id_registro: item?.id_registro || parsed.id_registro || parsed.codigo || parsedSubject.id_registro || '—',
        cedula: item?.cedula_detectada || parsed.cedula || '—',
        nombre:
            parsedSubject.nombre ||
            parsed['nombre y apellido'] ||
            parsed.nombreAsunto ||
            '—',
        cliente: parsedSubject.cliente || parsed.cliente || parsed.clienteAsunto || '—'
    };
}

function TipoBadge({ value, isLight }) {
    const label = TIPO_LABELS[value] || value || '—';
    const cls = isLight
        ? 'bg-sky-100 text-sky-800 border border-sky-200'
        : 'bg-sky-900/40 text-sky-200 border border-sky-700/50';
    return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{label}</span>;
}

function StatusBadgeZoho({ value, isLight }) {
    const v = String(value || '').toLowerCase();
    let cls = isLight ? 'bg-slate-100 text-slate-700' : 'bg-slate-800 text-slate-300';
    if (v === 'pendiente') cls = isLight ? 'bg-amber-100 text-amber-800' : 'bg-amber-900/40 text-amber-200';
    if (v === 'sin_match') cls = isLight ? 'bg-rose-100 text-rose-800' : 'bg-rose-900/40 text-rose-200';
    if (v === 'aplicado') cls = isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-900/40 text-emerald-200';
    if (v === 'rechazado') cls = isLight ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-400';
    return (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>
            {STATUS_LABELS[v] || value}
        </span>
    );
}

const FIELD_LABELS = {
    fecha_termino: 'Fecha de término',
    fecha_notificacion_termino: 'Fecha notificación término',
    fecha_ingreso: 'Fecha de ingreso',
    termino: 'Término',
    duracion_servicio: 'Duración servicio',
    venta_total: 'Venta total',
    costo_empresa: 'Costo empresa',
    onboarding_status: 'Estado onboarding',
    codigo: 'Código Zoho',
    activo: 'Activo',
    nombre: 'Nombre',
    cliente: 'Cliente',
    puesto: 'Puesto'
};

function fieldLabel(field) {
    return FIELD_LABELS[field] || field;
}

function isDateField(field) {
    return (
        field === 'fecha_ingreso' ||
        field.endsWith('_termino') ||
        field.startsWith('fecha_')
    );
}

function draftFromDiff(diffRows) {
    const draft = {};
    for (const row of diffRows) {
        if (row?.field != null) {
            draft[row.field] = row.after == null ? '' : String(row.after);
        }
    }
    return draft;
}

function DiffModal({ item, auth, isLight, readOnly = false, onClose, onUpdated, onItemChange }) {
    const G = buildMonitorGlassModalTheme(isLight);
    const token = auth?.token || '';
    const [localItem, setLocalItem] = useState(item);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [linkCedula, setLinkCedula] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    const [editMode, setEditMode] = useState(false);
    const [draftEdits, setDraftEdits] = useState({});

    useEffect(() => {
        setLocalItem(item);
        setEditMode(false);
        setDraftEdits({});
        setError('');
    }, [item]);

    const diff = useMemo(() => {
        const raw = localItem?.diff_json;
        if (Array.isArray(raw)) return raw;
        try {
            return typeof raw === 'string' ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }, [localItem]);

    const hasUnsavedEdits = useMemo(() => {
        if (!editMode) return false;
        return diff.some((row) => {
            const draftVal = draftEdits[row.field] ?? '';
            const currentVal = row.after == null ? '' : String(row.after);
            return draftVal !== currentVal;
        });
    }, [editMode, draftEdits, diff]);

    const canEdit = !readOnly && localItem?.status === 'pendiente' && diff.length > 0;
    const decisionBlocked = editMode || hasUnsavedEdits;

    const inputCls = `w-full min-w-[8rem] rounded border px-2 py-1 text-xs ${isLight ? 'border-slate-300 bg-white text-slate-900' : 'border-white/10 bg-black/20 text-slate-100'}`;

    const run = async (fn) => {
        setBusy(true);
        setError('');
        try {
            await fn();
            onUpdated();
            onClose();
        } catch (e) {
            setError(e?.response?.data?.error || e?.message || 'Error');
        } finally {
            setBusy(false);
        }
    };

    const startEdit = () => {
        setDraftEdits(draftFromDiff(diff));
        setEditMode(true);
        setError('');
    };

    const cancelEdit = () => {
        setEditMode(false);
        setDraftEdits({});
        setError('');
    };

    const saveEdits = async () => {
        const edits = {};
        for (const row of diff) {
            const draftVal = draftEdits[row.field] ?? '';
            const currentVal = row.after == null ? '' : String(row.after);
            if (draftVal !== currentVal) {
                edits[row.field] = draftVal.trim() === '' ? null : draftVal.trim();
            }
        }
        if (Object.keys(edits).length === 0) {
            setEditMode(false);
            return;
        }
        setBusy(true);
        setError('');
        try {
            const data = await onboardingApi.editarFichaNovedad(token, localItem.id, { edits });
            const updated = data?.item || localItem;
            setLocalItem(updated);
            if (typeof onItemChange === 'function') onItemChange(updated);
            onUpdated();
            setEditMode(false);
            setDraftEdits({});
        } catch (e) {
            setError(e?.response?.data?.error || e?.message || 'Error al guardar');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className={`fixed inset-0 z-[80] flex items-center justify-center p-4 ${G.overlayCls}`} role="dialog" aria-modal="true">
            <div className={`w-full ${monitorGlassModalSizeCls('lg')} flex max-h-[90vh] flex-col overflow-hidden rounded-2xl ${G.modalCls}`}>
                <header className={`flex items-start justify-between gap-3 px-5 py-4 ${G.headerCls}`}>
                    <div>
                        <p className={G.labelUpperCls}>Novedad Zoho</p>
                        <h3 className={`text-lg font-semibold ${G.textCls}`}>{localItem?.subject || 'Sin asunto'}</h3>
                        <p className={`mt-1 flex flex-wrap items-center gap-2 text-xs ${G.textMuted}`}>
                            <TipoBadge value={localItem?.tipo_novedad} isLight={isLight} />
                            <span>ID {localItem?.id_registro || '—'}</span>
                            <MatchStrategyBadge value={localItem?.match_strategy} isLight={isLight} />
                            <StatusBadgeZoho value={localItem?.status} isLight={isLight} />
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className={G.closeBtnCls} aria-label="Cerrar">
                        ✕
                    </button>
                </header>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                    <div className={`mb-4 grid gap-2 text-sm sm:grid-cols-2 ${G.textCls}`}>
                        <div>
                            <span className={G.textMuted}>Colaborador: </span>
                            {localItem?.colaborador_nombre_snap || '—'} ({localItem?.colaborador_cedula_match || 'sin vincular'})
                        </div>
                        <div>
                            <span className={G.textMuted}>Recibido: </span>
                            {fmtFecha(localItem?.received_at || localItem?.created_at)}
                        </div>
                        {localItem?.reviewed_at ? (
                            <>
                                <div>
                                    <span className={G.textMuted}>Revisado: </span>
                                    {fmtFecha(localItem.reviewed_at)}
                                </div>
                                <div>
                                    <span className={G.textMuted}>Por: </span>
                                    {localItem.reviewed_by || '—'}
                                </div>
                            </>
                        ) : null}
                    </div>

                    {!readOnly && localItem?.status === 'sin_match' ? (
                        <div className={`mb-4 rounded-xl border p-3 ${G.cardCls}`}>
                            <p className={`mb-2 text-sm font-semibold ${G.textCls}`}>Datos detectados en el correo</p>
                            {(() => {
                                const hints = extractHintsFromItem(localItem);
                                return (
                                    <ul className={`mb-3 list-inside list-disc text-xs ${G.textMuted}`}>
                                        <li>ID Zoho: {hints.id_registro}</li>
                                        <li>Cédula detectada: {hints.cedula}</li>
                                        <li>Nombre: {hints.nombre}</li>
                                        <li>Cliente: {hints.cliente}</li>
                                    </ul>
                                );
                            })()}
                            <p className={`mb-2 text-sm font-semibold ${G.textCls}`}>Vincular colaborador activo</p>
                            <input
                                type="text"
                                value={linkCedula}
                                onChange={(e) => setLinkCedula(e.target.value)}
                                placeholder="Cédula del colaborador"
                                className={`w-full rounded-lg border px-3 py-2 text-sm ${isLight ? 'border-slate-300' : 'border-white/10 bg-black/20'}`}
                            />
                            <button
                                type="button"
                                disabled={busy || !linkCedula.trim()}
                                onClick={() =>
                                    run(() =>
                                        onboardingApi.vincularFichaNovedad(token, localItem.id, { cedula: linkCedula.trim() })
                                    )
                                }
                                className="mt-2 rounded-lg bg-[#2F7BB8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                Vincular y recalcular diff
                            </button>
                        </div>
                    ) : null}

                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className={`text-xs font-bold uppercase tracking-widest ${G.textMuted}`}>Cambios propuestos</p>
                        {canEdit && !editMode ? (
                            <button
                                type="button"
                                onClick={startEdit}
                                disabled={busy}
                                className="rounded-lg border border-[#2F7BB8]/50 px-3 py-1 text-xs font-semibold text-[#2F7BB8]"
                            >
                                Editar
                            </button>
                        ) : null}
                        {editMode ? (
                            <span className={`text-xs font-semibold ${G.textMuted}`}>Modo edición</span>
                        ) : null}
                    </div>

                    {diff.length === 0 ? (
                        <p className={`text-sm ${G.textMuted}`}>Sin diferencias detectadas o pendiente de vinculación.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border border-white/10">
                            <table className="min-w-full text-left text-xs">
                                <thead className={isLight ? 'bg-slate-100' : 'bg-white/5'}>
                                    <tr>
                                        <th className="px-3 py-2 font-semibold">Campo</th>
                                        <th className="px-3 py-2 font-semibold">Actual</th>
                                        <th className="px-3 py-2 font-semibold">Propuesto</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {diff.map((row) => (
                                        <tr key={row.field} className="border-t border-white/5">
                                            <td className="px-3 py-2">
                                                <span className="block font-mono text-[10px] text-slate-400">{row.field}</span>
                                                <span className="font-medium">{fieldLabel(row.field)}</span>
                                            </td>
                                            <td className="px-3 py-2 text-rose-400">{String(row.before ?? '—')}</td>
                                            <td className="px-3 py-2">
                                                {editMode ? (
                                                    <input
                                                        type={isDateField(row.field) ? 'date' : 'text'}
                                                        value={draftEdits[row.field] ?? ''}
                                                        onChange={(e) =>
                                                            setDraftEdits((prev) => ({
                                                                ...prev,
                                                                [row.field]: e.target.value
                                                            }))
                                                        }
                                                        className={inputCls}
                                                        aria-label={`Valor propuesto ${fieldLabel(row.field)}`}
                                                    />
                                                ) : (
                                                    <span className="text-emerald-400">{String(row.after ?? '—')}</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {!readOnly && ['pendiente', 'sin_match'].includes(localItem?.status) ? (
                        <div className="mt-4">
                            <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Motivo de rechazo (opcional)"
                                rows={2}
                                disabled={editMode}
                                className={`w-full rounded-lg border px-3 py-2 text-sm ${isLight ? 'border-slate-300' : 'border-white/10 bg-black/20'}`}
                            />
                        </div>
                    ) : null}

                    {error ? <p className="mt-3 text-sm text-rose-500">{error}</p> : null}
                </div>

                <footer className={`flex flex-wrap justify-end gap-2 px-5 py-4 ${G.footerCls}`}>
                    {editMode ? (
                        <>
                            <button type="button" onClick={cancelEdit} className={G.cancelBtnCls} disabled={busy}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={saveEdits}
                                disabled={busy || !hasUnsavedEdits}
                                className="rounded-xl bg-[#2F7BB8] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                {busy ? 'Guardando…' : 'Guardar cambios'}
                            </button>
                        </>
                    ) : (
                        <>
                            <button type="button" onClick={onClose} className={G.cancelBtnCls} disabled={busy}>
                                Cerrar
                            </button>
                            {!readOnly && localItem?.status === 'pendiente' ? (
                                <>
                                    {canEdit ? (
                                        <button
                                            type="button"
                                            disabled={busy || decisionBlocked}
                                            onClick={startEdit}
                                            className="rounded-xl border border-[#2F7BB8]/50 px-4 py-2 text-sm font-semibold text-[#2F7BB8] disabled:opacity-50"
                                        >
                                            Editar
                                        </button>
                                    ) : null}
                                    <button
                                        type="button"
                                        disabled={busy || decisionBlocked}
                                        onClick={() =>
                                            run(() =>
                                                onboardingApi.rechazarFichaNovedad(token, localItem.id, {
                                                    reason: rejectReason || null
                                                })
                                            )
                                        }
                                        className="rounded-xl border border-rose-400/50 px-4 py-2 text-sm font-semibold text-rose-500 disabled:opacity-50"
                                    >
                                        Rechazar
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy || decisionBlocked}
                                        onClick={() => run(() => onboardingApi.aprobarFichaNovedad(token, localItem.id))}
                                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                                    >
                                        Aprobar
                                    </button>
                                </>
                            ) : null}
                        </>
                    )}
                </footer>
            </div>
        </div>
    );
}

export default function FichaNovedadesView({ auth, isLight, onPendingCount }) {
    const G = buildGestionTableDash(Boolean(isLight));
    const token = auth?.token || '';
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [viewMode, setViewMode] = useState('inbox');
    const [statusFilter, setStatusFilter] = useState('');
    const [historicoCount, setHistoricoCount] = useState(0);
    const [selected, setSelected] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const params = { limit: 200, scope: viewMode };
            if (viewMode === 'inbox' && statusFilter) params.status = statusFilter;
            const data = await onboardingApi.listFichaNovedades(token, params);
            setRows(data?.items || []);
            setHistoricoCount(data?.historicoCount ?? 0);
            if (typeof onPendingCount === 'function') {
                onPendingCount(data?.pendingCount ?? 0);
            }
        } catch (e) {
            setError(e?.response?.data?.error || e?.message || 'No se pudo cargar el buzón');
        } finally {
            setLoading(false);
        }
    }, [token, viewMode, statusFilter, onPendingCount]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (viewMode === 'historico') setStatusFilter('');
    }, [viewMode]);

    const columns = useMemo(() => {
        const base = [
            {
                key: viewMode === 'historico' ? 'reviewed_at' : 'created_at',
                label: viewMode === 'historico' ? 'Revisado' : 'Fecha',
                render: (r) =>
                    fmtFecha(viewMode === 'historico' ? r.reviewed_at || r.created_at : r.received_at || r.created_at)
            },
            {
                key: 'tipo_novedad',
                label: 'Tipo',
                render: (r) => <TipoBadge value={r.tipo_novedad} isLight={isLight} />
            },
            { key: 'id_registro', label: 'ID Zoho' },
            { key: 'colaborador_nombre_snap', label: 'Colaborador' },
            {
                key: 'match_strategy',
                label: 'Match por',
                render: (r) => <MatchStrategyBadge value={r.match_strategy} isLight={isLight} />
            },
            { key: 'subject', label: 'Asunto', sortable: false },
            {
                key: 'status',
                label: 'Estado',
                render: (r) => <StatusBadgeZoho value={r.status} isLight={isLight} />
            }
        ];
        if (viewMode === 'historico') {
            base.push({ key: 'reviewed_by', label: 'Revisado por' });
        } else {
            base.push({ key: 'diff_count', label: 'Cambios' });
        }
        return base;
    }, [viewMode, isLight]);

    const tabCls = (active) =>
        active
            ? isLight
                ? 'bg-[#2F7BB8] text-white'
                : 'bg-[#2F7BB8] text-white'
            : isLight
              ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              : 'bg-white/5 text-slate-300 hover:bg-white/10';

    return (
        <div className="flex flex-col gap-4">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className={G.titleXl}>Novedades Zoho</h2>
                    <p className={G.mutedSm}>
                        {viewMode === 'inbox'
                            ? 'Bandeja de revisión: salidas, extensiones, modificaciones y cancelaciones pendientes. Las integraciones se gestionan en En ingreso.'
                            : 'Histórico de novedades ya aplicadas o rechazadas por Capital Humano.'}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex rounded-lg overflow-hidden border border-white/10">
                        <button
                            type="button"
                            onClick={() => setViewMode('inbox')}
                            className={`px-3 py-1.5 text-xs font-semibold ${tabCls(viewMode === 'inbox')}`}
                        >
                            Por revisar
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('historico')}
                            className={`px-3 py-1.5 text-xs font-semibold ${tabCls(viewMode === 'historico')}`}
                        >
                            Histórico{historicoCount > 0 ? ` (${historicoCount})` : ''}
                        </button>
                    </div>
                    {viewMode === 'inbox' ? (
                        <>
                            <label className={`text-xs ${G.mutedSm}`}>Estado</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className={`rounded border px-2 py-1 text-xs ${isLight ? 'border-slate-300 bg-white' : 'border-slate-700 bg-slate-800'}`}
                            >
                                <option value="">Todos pendientes</option>
                                <option value="pendiente">Pendiente</option>
                                <option value="sin_match">Sin match</option>
                            </select>
                        </>
                    ) : null}
                    <button
                        type="button"
                        onClick={load}
                        className="rounded-lg bg-[#2F7BB8] px-3 py-1.5 text-xs font-semibold text-white"
                    >
                        Actualizar
                    </button>
                </div>
            </header>

            {error ? (
                <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
            ) : null}

            <SortableGestionDataTable
                columns={columns}
                rows={rows}
                isLight={isLight}
                emptyText={
                    loading
                        ? 'Cargando…'
                        : viewMode === 'inbox'
                          ? 'Sin novedades pendientes de revisión.'
                          : 'Sin novedades en el histórico.'
                }
                onRowClick={async (row) => {
                    try {
                        const detail = await onboardingApi.getFichaNovedad(token, row.id);
                        setSelected(detail?.item || row);
                    } catch {
                        setSelected(row);
                    }
                }}
            />

            {selected ? (
                <DiffModal
                    item={selected}
                    auth={auth}
                    isLight={isLight}
                    readOnly={viewMode === 'historico'}
                    onClose={() => setSelected(null)}
                    onUpdated={load}
                    onItemChange={setSelected}
                />
            ) : null}
        </div>
    );
}

export async function fetchFichaNovedadesPendingCount(token) {
    try {
        const data = await onboardingApi.listFichaNovedades(token, { limit: 1, scope: 'inbox' });
        return data?.pendingCount ?? 0;
    } catch {
        return 0;
    }
}
