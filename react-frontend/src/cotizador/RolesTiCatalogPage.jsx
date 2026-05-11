import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, Search, X } from 'lucide-react';
import { useModuleTheme } from '../moduleTheme.js';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';
import { buildCsrfHeaders } from '../cognitoAuth.js';
import { userHasRolesTiCatalogWrite } from '../rolesTiAccess.js';
import { TI_CATALOGO_TAXONOMIA_FIN_COLUMNAS, catalogHeadersForRow, emptyCellsOfficial } from './tiCatalogOfficialColumns.js';

/** Misma vista compacta que Gestión de novedades: solo primeras columnas; el resto en el modal. */
const PREVIEW_COL_COUNT = 5;

function authHeaders(token, json = true) {
    const h = buildCsrfHeaders(json ? { 'Content-Type': 'application/json' } : {});
    if (String(token || '').trim()) h.Authorization = `Bearer ${token}`;
    return h;
}

function cellPreview(cells, key, max = 56) {
    const c = cells && typeof cells === 'object' ? cells : {};
    const t = String(c[key] ?? '').trim();
    if (t.length <= max) return t || '—';
    return `${t.slice(0, max)}…`;
}

function cellsFromRow(row, headers) {
    const cells = row.cells && typeof row.cells === 'object' ? { ...row.cells } : {};
    const base = {};
    for (const h of headers) {
        base[h] = cells[h] != null ? String(cells[h]) : '';
    }
    return base;
}

const crearDirectorioBtn =
    'px-4 py-2 rounded-md bg-[#2F7BB8] text-white text-sm font-semibold hover:bg-[#25649a] disabled:opacity-50';

export default function RolesTiCatalogPage({ token, auth, embedInDirectorio = false }) {
    const navigate = useNavigate();
    const { cotizadorCanvas, ghostBtn, pageErrorBanner, isLight, field, compactBtn } = useModuleTheme();
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const canWrite = userHasRolesTiCatalogWrite(auth);

    const [catalogoVigente, setCatalogoVigente] = useState(null);
    const [loadingFilas, setLoadingFilas] = useState(false);
    const [msg, setMsg] = useState('');
    const [err, setErr] = useState('');
    const [q, setQ] = useState('');
    const [qDebounced, setQDebounced] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(20);
    const [filas, setFilas] = useState([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);

    const [detailOpen, setDetailOpen] = useState(false);
    const [detailRow, setDetailRow] = useState(null);
    const [detailEditing, setDetailEditing] = useState(false);
    const [editCells, setEditCells] = useState({});
    const [editSaving, setEditSaving] = useState(false);

    /** Columnas fijas en código (37 + extras si la fila trae claves no listadas). */
    const columnHeaders = TI_CATALOGO_TAXONOMIA_FIN_COLUMNAS;
    const tablePreviewHeaders = useMemo(() => columnHeaders.slice(0, PREVIEW_COL_COUNT), [columnHeaders]);

    const detailColumnHeaders = useMemo(() => (detailRow ? catalogHeadersForRow(detailRow) : []), [detailRow]);

    const activeCatalogId = catalogoVigente?.id != null ? Number(catalogoVigente.id) : null;

    const loadMeta = useCallback(async () => {
        try {
            const r = await fetch('/api/cotizador/ti-catalog/interno-cliente', {
                credentials: 'include',
                headers: authHeaders(token)
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
            setCatalogoVigente(j.catalogo_vigente || null);
            setErr('');
        } catch (e) {
            setErr(e.message || String(e));
            setCatalogoVigente(null);
        }
    }, [token]);

    const loadFilas = useCallback(async () => {
        setLoadingFilas(true);
        try {
            const qs = new URLSearchParams({
                versionId: 'active',
                page: String(page),
                limit: String(limit),
                q: qDebounced
            });
            const r = await fetch(`/api/cotizador/ti-catalog/filas?${qs}`, {
                credentials: 'include',
                headers: authHeaders(token)
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
            setFilas(Array.isArray(j.items) ? j.items : []);
            setTotal(Number(j.total) || 0);
            setTotalPages(Math.max(1, Number(j.totalPages) || 1));
            setErr('');
        } catch (e) {
            setErr(e.message || String(e));
            setFilas([]);
            setTotal(0);
            setTotalPages(1);
        } finally {
            setLoadingFilas(false);
        }
    }, [token, page, limit, qDebounced]);

    useEffect(() => {
        const t = setTimeout(() => setQDebounced(q.trim()), 300);
        return () => clearTimeout(t);
    }, [q]);

    useEffect(() => {
        loadMeta();
    }, [loadMeta]);

    useEffect(() => {
        setPage(1);
    }, [qDebounced]);

    useEffect(() => {
        loadFilas();
    }, [loadFilas]);

    useEffect(() => {
        if (page > totalPages) setPage(totalPages);
    }, [totalPages, page]);

    const openDetail = async (row, startInEdit = false) => {
        try {
            const metaRes = await fetch('/api/cotizador/ti-catalog/interno-cliente', {
                credentials: 'include',
                headers: authHeaders(token)
            });
            const meta = await metaRes.json();
            if (metaRes.ok && meta.catalogo_vigente) setCatalogoVigente(meta.catalogo_vigente);
        } catch {
            /* sigue con catálogo en estado */
        }
        let freshRow = row;
        try {
            const res = await fetch(`/api/cotizador/ti-catalog/filas/${encodeURIComponent(row.id)}`, {
                credentials: 'include',
                headers: authHeaders(token)
            });
            const j = await res.json();
            if (res.ok && j.item) freshRow = j.item;
        } catch {
            /* usa fila de la tabla */
        }
        const headers = catalogHeadersForRow(freshRow);
        setDetailRow(freshRow);
        setEditCells(cellsFromRow(freshRow, headers));
        setDetailEditing(Boolean(startInEdit));
        setDetailOpen(true);
    };

    const closeDetail = () => {
        setDetailOpen(false);
        setDetailRow(null);
        setDetailEditing(false);
        setEditCells({});
    };

    const onSaveEdit = async () => {
        if (!canWrite || !detailRow) return;
        setEditSaving(true);
        try {
            const r = await fetch(`/api/cotizador/ti-catalog/filas/${encodeURIComponent(detailRow.id)}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: authHeaders(token),
                body: JSON.stringify({ cells: editCells })
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
            setMsg('Cambios guardados.');
            setDetailEditing(false);
            if (j.item) {
                setDetailRow(j.item);
                setEditCells(cellsFromRow(j.item, catalogHeadersForRow(j.item)));
            }
            await loadFilas();
            await loadMeta();
        } catch (e) {
            setErr(e.message || String(e));
        } finally {
            setEditSaving(false);
        }
    };

    const onDeleteFila = async () => {
        if (!canWrite || !detailRow || !window.confirm('¿Eliminar esta fila del catálogo?')) return;
        try {
            const r = await fetch(`/api/cotizador/ti-catalog/filas/${encodeURIComponent(detailRow.id)}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: authHeaders(token)
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
            setMsg('Fila eliminada.');
            closeDetail();
            await loadFilas();
            await loadMeta();
        } catch (e) {
            setErr(e.message || String(e));
        }
    };

    const onAddFila = async () => {
        if (!canWrite || !Number.isFinite(activeCatalogId)) {
            setErr(
                'No hay un catálogo vigente disponible para agregar roles. Cuando el catálogo esté cargado en el sistema, podrá usar esta acción. Si lo necesita con urgencia, contacte al administrador de la plataforma.'
            );
            return;
        }
        setErr('');
        const empty = emptyCellsOfficial();
        try {
            const r = await fetch('/api/cotizador/ti-catalog/filas', {
                method: 'POST',
                credentials: 'include',
                headers: authHeaders(token),
                body: JSON.stringify({ versionId: activeCatalogId, cells: empty })
            });
            const j = await r.json();
            if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
            setMsg('Rol agregado.');
            await loadFilas();
            await loadMeta();
            if (j.item) openDetail(j.item, true);
        } catch (e) {
            setErr(e.message || String(e));
        }
    };

    const clearFilters = () => {
        setQ('');
        setQDebounced('');
        setPage(1);
    };

    const colCount = PREVIEW_COL_COUNT + 1;
    const safePage = Math.min(page, totalPages);

    /** En directorio: mismo ancho/alto útil que clientes/consultores (sin doble padding ni lienzo cotizador). */
    const rootShell = embedInDirectorio ? 'w-full min-h-0 font-body' : cotizadorCanvas;
    const catalogCardClass = embedInDirectorio
        ? `${dash.card} flex min-h-[calc(100dvh-11rem)] flex-col overflow-hidden`
        : `${dash.cardFlex} min-h-[min(72vh,680px)]`;

    return (
        <div className={rootShell}>
            <div className="mb-4 flex flex-wrap items-center gap-3">
                {embedInDirectorio ? (
                    canWrite ? (
                        <button
                            type="button"
                            className={crearDirectorioBtn}
                            onClick={onAddFila}
                            disabled={!Number.isFinite(activeCatalogId)}
                        >
                            Agregar ROL
                        </button>
                    ) : (
                        <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Solo lectura.</p>
                    )
                ) : (
                    <button
                        type="button"
                        className={ghostBtn}
                        onClick={() => {
                            navigate('/admin');
                        }}
                    >
                        <span className="inline-flex items-center gap-2">
                            <ArrowLeft size={16} />
                            Volver al portal
                        </span>
                    </button>
                )}
            </div>

            {err ? <div className={pageErrorBanner}>{err}</div> : null}
            {msg ? (
                <div
                    className={
                        isLight
                            ? 'mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900'
                            : 'mb-4 rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100'
                    }
                >
                    {msg}
                </div>
            ) : null}

            <div className={catalogCardClass}>
                <div className={`sticky top-0 z-20 shrink-0 p-4 ${dash.gestionHead}`}>
                    <p className={dash.labelUpper}>Directorio</p>
                    <h2 className={`${dash.titleXl} mb-4 mt-1`}>Gestión del catálogo TI</h2>
                    <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-[200px] flex-1">
                            <div className="relative">
                                <Search
                                    className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}
                                    aria-hidden
                                />
                                <input
                                    type="search"
                                    className={`w-full pl-9 ${field} text-sm`}
                                    value={q}
                                    onChange={(e) => setQ(e.target.value)}
                                    placeholder="Cualquier celda…"
                                    aria-label="Buscar en cualquier celda"
                                />
                            </div>
                        </div>
                        <div>
                            <label className={dash.labelFilter}>Por página</label>
                            <select
                                className={`mt-1 block min-w-[120px] ${field} text-sm`}
                                value={String(limit)}
                                onChange={(e) => {
                                    setLimit(Number(e.target.value) || 20);
                                    setPage(1);
                                }}
                            >
                                <option value="10">10 por página</option>
                                <option value="20">20 por página</option>
                                <option value="50">50 por página</option>
                            </select>
                        </div>
                        <button type="button" className={dash.borrarFiltros} onClick={clearFilters}>
                            <span className="inline-flex items-center gap-1">
                                <X size={14} /> Borrar filtros
                            </span>
                        </button>
                        {canWrite && !embedInDirectorio ? (
                            <button type="button" className={dash.toolbarBtn} onClick={onAddFila} disabled={!Number.isFinite(activeCatalogId)}>
                                Agregar ROL
                            </button>
                        ) : !embedInDirectorio ? (
                            <p className={`self-center text-xs ${dash.muted}`}>Solo lectura.</p>
                        ) : null}
                    </div>
                </div>

                <div className={`${dash.tableWrap} min-h-0 flex-1`}>
                    <div className="flex min-h-0 flex-1 overflow-x-auto overflow-y-auto">
                        {loadingFilas ? (
                            <p className={`p-12 text-center font-medium ${dash.muted}`}>Cargando base de datos…</p>
                        ) : (
                            <table className="w-full border-collapse text-left whitespace-nowrap md:min-w-full">
                                <thead>
                                    <tr className={dash.thead}>
                                        {tablePreviewHeaders.map((h, idx) => (
                                            <th key={h} className={`p-4 font-semibold normal-case ${idx === 0 ? 'pl-6' : ''}`}>
                                                {h}
                                            </th>
                                        ))}
                                        <th className="p-4 pr-6 text-right font-semibold">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className={dash.tbody}>
                                    {filas.length === 0 ? (
                                        <tr>
                                            <td colSpan={colCount} className={`p-12 text-center font-medium ${dash.muted}`}>
                                                No se encontraron registros.
                                            </td>
                                        </tr>
                                    ) : (
                                        filas.map((row) => (
                                            <tr key={row.id} className={dash.trHover}>
                                                {tablePreviewHeaders.map((h, idx) => {
                                                    const tdClass =
                                                        idx === 0 ? dash.tdDate : idx === 1 ? dash.tdName : dash.tdCell;
                                                    return (
                                                        <td key={h} className={tdClass} title={String(row.cells?.[h] ?? '')}>
                                                            {cellPreview(row.cells, h)}
                                                        </td>
                                                    );
                                                })}
                                                <td className="p-4 pr-6">
                                                    <div className="flex justify-end">
                                                        <button type="button" className={dash.actionBtn} onClick={() => openDetail(row, false)}>
                                                            <Eye size={14} /> Ver detalle
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                    {!loadingFilas && columnHeaders.length > 0 ? (
                        <div className={dash.footerBar}>
                            <span>
                                Mostrando {filas.length} de {total} registros
                            </span>
                            <div className="flex flex-wrap items-center gap-2">
                                <button type="button" className={compactBtn} disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                                    Anterior
                                </button>
                                <span>
                                    Página {safePage} de {totalPages}
                                </span>
                                <button
                                    type="button"
                                    className={compactBtn}
                                    disabled={safePage >= totalPages}
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                >
                                    Siguiente
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            {detailOpen && detailRow ? (
                <div className={dash.modalBackdrop} role="dialog" aria-modal="true" onClick={closeDetail}>
                    <div
                        className={`${dash.modalCardWide} relative max-h-[min(92vh,900px)] min-h-0 overflow-hidden`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={`${dash.modalHeadBorder} shrink-0`}>
                            <div className="min-w-0 pr-2">
                                <h2 className={dash.title2xl}>{detailEditing ? 'Editar fila' : 'Detalle de fila'}</h2>
                                <p className={`${dash.modalMuted} mt-1 text-sm`}>
                                    <strong>{TI_CATALOGO_TAXONOMIA_FIN_COLUMNAS.length}</strong> columnas fijas del formulario
                                    {detailColumnHeaders.length > TI_CATALOGO_TAXONOMIA_FIN_COLUMNAS.length
                                        ? ` + ${detailColumnHeaders.length - TI_CATALOGO_TAXONOMIA_FIN_COLUMNAS.length} adicionales en esta fila`
                                        : ''}
                                    .
                                </p>
                            </div>
                            <button type="button" onClick={closeDetail} className={dash.modalClose} aria-label="Cerrar">
                                <X size={20} strokeWidth={2.5} />
                            </button>
                        </div>

                        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                            {!detailEditing ? (
                                <div className={dash.modalGrid}>
                                    {detailColumnHeaders.map((h) => (
                                        <div key={h} className="min-w-0">
                                            <span className={dash.modalMuted}>{h}:</span>{' '}
                                            <span className="whitespace-pre-wrap break-words">
                                                {String(editCells[h] ?? '').trim() || '—'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className={dash.modalGrid}>
                                    {detailColumnHeaders.map((h) => (
                                        <label key={h} className="block min-w-0">
                                            <span className={`text-xs font-semibold ${dash.modalMuted}`}>{h}</span>
                                            <textarea
                                                className={`mt-1 min-h-[2.5rem] w-full resize-y ${field} text-sm`}
                                                rows={2}
                                                value={editCells[h] ?? ''}
                                                onChange={(e) => setEditCells((prev) => ({ ...prev, [h]: e.target.value }))}
                                            />
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className={`${dash.modalFooter} shrink-0`}>
                            <div className="flex flex-wrap gap-2">
                                {canWrite && !detailEditing ? (
                                    <>
                                        <button
                                            type="button"
                                            className={
                                                isLight
                                                    ? 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50'
                                                    : 'inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50'
                                            }
                                            onClick={() => setDetailEditing(true)}
                                        >
                                            Editar
                                        </button>
                                        <button
                                            type="button"
                                            className={
                                                isLight
                                                    ? 'inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50'
                                                    : 'inline-flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-slate-800 px-3 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50'
                                            }
                                            onClick={onDeleteFila}
                                        >
                                            Eliminar fila
                                        </button>
                                    </>
                                ) : null}
                                {canWrite && detailEditing ? (
                                    <>
                                        <button
                                            type="button"
                                            className={
                                                isLight
                                                    ? 'rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50'
                                                    : 'rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50'
                                            }
                                            onClick={() => {
                                                setDetailEditing(false);
                                                if (detailRow) {
                                                    setEditCells(cellsFromRow(detailRow, catalogHeadersForRow(detailRow)));
                                                }
                                            }}
                                            disabled={editSaving}
                                        >
                                            Cancelar edición
                                        </button>
                                        <button
                                            type="button"
                                            className={dash.btnPrimaryCinte}
                                            onClick={onSaveEdit}
                                            disabled={editSaving}
                                        >
                                            {editSaving ? 'Guardando…' : 'Guardar'}
                                        </button>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
