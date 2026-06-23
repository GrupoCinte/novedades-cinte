import { useEffect, useState, useMemo } from 'react';
import { ChevronLeft, Download, Trash2, Edit3, CheckCircle2, Send, FileText, X } from 'lucide-react';
import { formatMoney } from './salarioFormat';
import { useModuleTheme } from '../moduleTheme.js';
import { buildCsrfHeaders } from '../cognitoAuth.js';
import CotizadorForm from './CotizadorForm.jsx';
import { resolveCargosLista } from './resolveCargosLista.js';

export default function CotizadorDetalle({
    cotizacionId,
    token,
    onClose,
    onDelete,
    deletingId,
    catalogos,
    cargosResueltos,
    clientesLista,
    historial,
    onSave,
    refreshData
}) {
    const {
        cardPanel,
        insetWell,
        panelTitle,
        labelMuted,
        borderSubtle,
        tableHeadRow,
        tableBodyRow,
        primaryBtn,
        ghostBtn,
        dangerSoftBtn,
        isLight,
        chipNeutral,
        iconActionBtn,
        modalBackdrop,
        modalCardWide,
        modalHeadBorder,
        modalClose,
        modalGrid
    } = useModuleTheme();

    const [cotizacion, setCotizacion] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [statusChanging, setStatusChanging] = useState(false);
    const [descargando, setDescargando] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editForm, setEditForm] = useState(null);
    const [saving, setSaving] = useState(false);

    const cargosResueltosEdit = useMemo(() => {
        const c = editMode ? editForm?.cliente : cotizacion?.cliente;
        return resolveCargosLista(catalogos || {}, c);
    }, [editMode, editForm?.cliente, cotizacion?.cliente, catalogos]);

    useEffect(() => {
        setLoading(true);
        setError('');
        const matched = (historial || []).find((it) => Number(it.id) === Number(cotizacionId));
        if (matched) {
            setCotizacion(matched);
            setLoading(false);
        } else {
            setError('Cotización no encontrada en el historial');
            setLoading(false);
        }
    }, [historial, cotizacionId]);

    // Load PDF Preview
    useEffect(() => {
        if (!cotizacion?.resultados?.length) {
            setPdfPreviewUrl(null);
            return;
        }

        let cancelled = false;
        let createdUrl = null;

        (async () => {
            setPreviewLoading(true);
            try {
                const headers = buildCsrfHeaders({ 'Content-Type': 'application/json' });
                if (String(token || '').trim()) headers.Authorization = `Bearer ${token}`;
                const res = await fetch(`/api/cotizador/pdf/${cotizacionId}`, {
                    method: 'GET',
                    credentials: 'include',
                    headers
                });
                if (!res.ok) throw new Error('Vista previa no disponible');
                const blob = await res.blob();
                if (cancelled) return;
                createdUrl = URL.createObjectURL(blob);
                setPdfPreviewUrl(createdUrl);
            } catch (e) {
                console.error(e);
            } finally {
                if (!cancelled) setPreviewLoading(false);
            }
        })();

        return () => {
            cancelled = true;
            if (createdUrl) URL.revokeObjectURL(createdUrl);
        };
    }, [cotizacion, cotizacionId, token]);

    const changeStatus = async (nuevoEstado) => {
        if (!cotizacion) return;
        setStatusChanging(true);
        setError('');
        try {
            const headers = buildCsrfHeaders({ 'Content-Type': 'application/json' });
            if (String(token || '').trim()) headers.Authorization = `Bearer ${token}`;
            const res = await fetch(`/api/cotizador/historial/${cotizacionId}/estado`, {
                method: 'PATCH',
                credentials: 'include',
                headers,
                body: JSON.stringify({ estado: nuevoEstado })
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'No se pudo actualizar el estado');
            }
            setCotizacion(prev => prev ? { ...prev, estado: nuevoEstado } : prev);
        } catch (e) {
            setError(e.message);
        } finally {
            setStatusChanging(false);
        }
    };

    const handleDownload = async () => {
        if (!cotizacion) return;
        setDescargando(true);
        setError('');
        try {
            const headers = buildCsrfHeaders({});
            if (String(token || '').trim()) headers.Authorization = `Bearer ${token}`;
            const res = await fetch(`/api/cotizador/pdf/${cotizacionId}?download=1`, {
                method: 'GET',
                credentials: 'include',
                headers
            });
            if (!res.ok) throw new Error('Error al descargar PDF');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = cotizacion.codigo ? `${cotizacion.codigo}.pdf` : `cotizacion_${cotizacionId}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            setError(e.message || 'No se pudo descargar el PDF');
        } finally {
            setDescargando(false);
        }
    };

    const subtotal = useMemo(() => {
        if (!cotizacion?.resultados?.length) return 0;
        return cotizacion.resultados.reduce(
            (acc, r) => acc + Number(r.tarifa_mes || 0) * Number(r.cantidad || 1) * Number(cotizacion.meses || 1),
            0
        );
    }, [cotizacion]);

    const iva = subtotal * 0.19;
    const total = subtotal + iva;

    if (loading) {
        return (
            <div className={modalBackdrop}>
                <div className={`${modalCardWide} p-8 text-center`}>
                    <p className={labelMuted}>Cargando detalles de la cotización...</p>
                </div>
            </div>
        );
    }

    if (error && !cotizacion) {
        return (
            <div className={modalBackdrop}>
                <div className={`${modalCardWide} p-8 text-center space-y-4`}>
                    <p className="text-rose-600 font-semibold">{error}</p>
                    <button type="button" onClick={onClose} className={primaryBtn}>
                        Cerrar
                    </button>
                </div>
            </div>
        );
    }

    const estado = cotizacion?.estado || 'Borrador';

    const getEstadoBadgeClass = (est) => {
        const lower = String(est).toLowerCase();
        if (lower === 'aceptada') {
            return isLight 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
        }
        if (lower === 'enviada') {
            return isLight 
                ? 'bg-sky-50 text-sky-700 border border-sky-200' 
                : 'bg-[#088DC6]/20 text-sky-400 border border-[#088DC6]/30';
        }
        return isLight 
            ? 'bg-slate-100 text-slate-700 border border-slate-200' 
            : 'bg-slate-800 text-slate-400 border border-slate-700/50';
    };

    const getStatusBtnClass = (btnState) => {
        const isActive = estado === btnState;
        const isPending = statusChanging;
        
        let base = "flex-1 min-w-[90px] inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200 ";
        
        if (isActive) {
            base += "pointer-events-none ";
            if (btnState === 'Borrador') {
                base += isLight 
                    ? 'bg-slate-200 text-slate-800 border-slate-300 shadow-sm'
                    : 'bg-slate-700 text-white border-transparent shadow-[0_4px_12px_rgba(100,116,139,0.2)]';
            } else if (btnState === 'Enviada') {
                base += isLight
                    ? 'bg-sky-600 text-white border-transparent shadow-[0_4px_12px_rgba(2,132,199,0.25)]'
                    : 'bg-[#088DC6] text-white border-transparent shadow-[0_4px_12px_rgba(8,141,198,0.25)]';
            } else if (btnState === 'Aceptada') {
                base += isLight
                    ? 'bg-emerald-600 text-white border-transparent shadow-[0_4px_12px_rgba(5,150,105,0.25)]'
                    : 'bg-emerald-600 text-white border-transparent shadow-[0_4px_12px_rgba(16,185,129,0.25)]';
            }
        } else {
            if (isPending) {
                base += "opacity-50 cursor-not-allowed ";
            } else {
                base += "cursor-pointer ";
            }
            if (btnState === 'Borrador') {
                base += isLight
                    ? 'bg-transparent border-slate-300 text-slate-650 hover:bg-slate-100 hover:text-slate-800'
                    : 'bg-transparent border-slate-700 text-slate-400 hover:bg-slate-800/40 hover:text-slate-200';
            } else if (btnState === 'Enviada') {
                base += isLight
                    ? 'bg-transparent border-sky-300 text-sky-600 hover:bg-sky-50 hover:text-sky-700'
                    : 'bg-transparent border-[#088DC6]/30 text-sky-400 hover:bg-[#088DC6]/10 hover:text-sky-300';
            } else if (btnState === 'Aceptada') {
                base += isLight
                    ? 'bg-transparent border-emerald-300 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700'
                    : 'bg-transparent border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300';
            }
        }
        return base;
    };

    const handleEditClick = () => {
        const matchingCargos = Array.isArray(cargosResueltosEdit) ? cargosResueltosEdit : [];
        const perfiles = (cotizacion.resultados || []).map((r) => {
            if (String(r.modo).toUpperCase() === 'MANUAL') {
                return {
                    modo: 'MANUAL',
                    cargo_manual: r.cargo,
                    salario_manual: String(r.salario),
                    cantidad: r.cantidad,
                    indice: 0
                };
            } else {
                const normalizeStr = (s) => String(s || '').trim().toLowerCase();
                const target = normalizeStr(r.cargo);
                const idx = matchingCargos.findIndex((c) => normalizeStr(c.cargo) === target || normalizeStr(c.rol_original_cinte) === target);
                return {
                    modo: 'AUTO',
                    cargo_manual: '',
                    salario_manual: '',
                    cantidad: r.cantidad,
                    indice: idx >= 0 ? idx : 0
                };
            }
        });

        setEditForm({
            id: cotizacion.id,
            cliente: cotizacion.cliente || '',
            comercial: cotizacion.comercial || '',
            plazo: cotizacion.plazo || '45',
            margenPct: Number(cotizacion.margen || 0.3) * 100,
            meses: cotizacion.meses || 12,
            moneda: cotizacion.moneda || 'COP',
            titulo: cotizacion.titulo || '',
            notas: cotizacion.notas || '',
            terminos: cotizacion.terminos || '',
            estado: cotizacion.estado || 'Borrador',
            perfiles: perfiles.length > 0 ? perfiles : [{ indice: 0, cantidad: 1, modo: 'AUTO', salario_manual: '', cargo_manual: '' }]
        });
        setEditMode(true);
    };

    const handleSaveEdit = async (payloadCalculado) => {
        setSaving(true);
        try {
            if (typeof onSave === 'function') await onSave(payloadCalculado || editForm);
            setEditMode(false);
            if (typeof refreshData === 'function') await refreshData();
        } catch (e) {
            setError(e.message || 'Error guardando edición');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={modalBackdrop} onClick={onClose}>
            <div className={`${modalCardWide} relative`} onClick={(e) => e.stopPropagation()}>
                
                {/* Header / Barra de acciones */}
                <div className={modalHeadBorder}>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-xl md:text-2xl font-bold font-heading">
                                Detalle de Cotización
                            </h2>
                            <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${getEstadoBadgeClass(estado)}`}>
                                {estado}
                            </span>
                        </div>
                        <p className={`${labelMuted} mt-1 text-sm font-medium`}>
                            {cotizacion.codigo || `ID: ${cotizacion.id}`} · {cotizacion.titulo || 'Sin título'}
                        </p>
                    </div>

                    <div className="flex items-center gap-2">

                        {/* Botones de acción */}
                        <button
                            type="button"
                            onClick={handleEditClick}
                            className={
                                isLight
                                    ? 'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50'
                                    : 'inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50'
                            }
                        >
                            <Edit3 size={16} /> Editar
                        </button>
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={descargando}
                            className={
                                isLight
                                    ? 'inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50'
                                    : 'inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-[#088DC6] px-3 py-2 text-sm font-semibold text-white hover:bg-[#088DC6]/80 disabled:opacity-50'
                            }
                        >
                            <Download size={16} /> <span className="hidden sm:inline">{descargando ? 'Generando...' : 'Descargar PDF'}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => onDelete(cotizacion.id)}
                            disabled={deletingId === cotizacion.id}
                            className={
                                isLight
                                    ? 'inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-2 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50'
                                    : 'inline-flex items-center gap-1.5 rounded-lg border border-rose-500/50 bg-slate-800 px-3 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50'
                            }
                        >
                            <Trash2 size={16} /> <span className="hidden sm:inline">Eliminar</span>
                        </button>
                        <button type="button" onClick={onClose} className={modalClose}>
                            <X size={20} strokeWidth={2.5} />
                        </button>
                    </div>
                </div>

                {error && <div className="mx-6 mt-4 p-3 text-sm text-rose-100 bg-rose-900/40 border border-rose-500/30 rounded-xl">{error}</div>}

                <div className="p-6 overflow-y-auto max-h-[80vh] custom-scrollbar">
                    {editMode ? (
                        <div className="space-y-4">
                            <CotizadorForm
                                catalogos={catalogos || {}}
                                cargosResueltos={cargosResueltosEdit}
                                clientesLista={clientesLista}
                                form={editForm}
                                setForm={setEditForm}
                                loading={saving}
                                onSave={handleSaveEdit}
                                onCancel={() => setEditMode(false)}
                            />
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                        {/* Columna Izquierda: Información de la Cotización */}
                        <div className="lg:col-span-7 space-y-6">
                            
                            {/* Información General */}
                            <div className={modalGrid}>
                                <div><span className={labelMuted}>Cliente:</span> <span className="font-medium ml-1">{cotizacion.cliente || '—'}</span></div>
                                <div><span className={labelMuted}>NIT:</span> <span className="font-medium ml-1">{cotizacion.nit || '—'}</span></div>
                                <div><span className={labelMuted}>Comercial:</span> <span className="font-medium ml-1">{cotizacion.comercial || '—'}</span></div>
                                <div><span className={labelMuted}>Plazo de pago:</span> <span className="font-medium ml-1">{cotizacion.plazo ? `${cotizacion.plazo} días` : '—'}</span></div>
                                <div><span className={labelMuted}>Moneda:</span> <span className="font-medium ml-1">{cotizacion.moneda || 'COP'}</span></div>
                                <div><span className={labelMuted}>Margen:</span> <span className="font-medium ml-1">{cotizacion.margen ? `${(Number(cotizacion.margen) * 100).toFixed(1)}%` : '0%'}</span></div>
                                <div><span className={labelMuted}>Meses de servicio:</span> <span className="font-medium ml-1">{cotizacion.meses || 1}</span></div>
                                <div><span className={labelMuted}>Creada el:</span> <span className="font-medium ml-1">{cotizacion.fecha ? String(cotizacion.fecha).split(',')[0] : '—'}</span></div>
                            </div>

                    {/* Items */}
                    <div className={cardPanel}>
                        <h3 className={`${panelTitle} mb-3`}>Detalle de Perfiles Cotizados</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className={tableHeadRow}>
                                        <th className="text-left py-2 font-semibold">Cargo</th>
                                        <th className="text-right py-2 font-semibold">Cant.</th>
                                        <th className="text-right py-2 font-semibold">Tarifa Mes</th>
                                        <th className="text-right py-2 font-semibold">Tarifa Hora</th>
                                        <th className="text-right py-2 font-semibold">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cotizacion.resultados?.map((r, idx) => {
                                        const cant = Number(r.cantidad || 1);
                                        const sub = Number(r.tarifa_mes || 0) * cant * Number(cotizacion.meses || 1);
                                        return (
                                            <tr key={`${r.cargo}-${idx}`} className={tableBodyRow}>
                                                <td className="py-2.5 font-medium">{r.cargo}</td>
                                                <td className="py-2.5 text-right font-mono">{r.cantidad}</td>
                                                <td className="py-2.5 text-right font-mono">{formatMoney(r.tarifa_mes, cotizacion.moneda)}</td>
                                                <td className="py-2.5 text-right font-mono">{formatMoney(r.tarifa_hora, cotizacion.moneda)}</td>
                                                <td className="py-2.5 text-right font-mono font-semibold">{formatMoney(sub, cotizacion.moneda)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Totales */}
                        <div className={`mt-4 p-3 rounded-lg ${insetWell} space-y-1.5 text-sm`}>
                            <div className="flex justify-between">
                                <span className={labelMuted}>Subtotal:</span>
                                <span className="font-semibold tabular-nums">{formatMoney(subtotal, cotizacion.moneda)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className={labelMuted}>IVA (19%):</span>
                                <span className="font-semibold tabular-nums">{formatMoney(iva, cotizacion.moneda)}</span>
                            </div>
                            <div className="flex justify-between border-t border-slate-700/20 pt-1.5 text-base font-bold">
                                <span>Total Estimado:</span>
                                <span className="text-[#088DC6] tabular-nums">{formatMoney(total, cotizacion.moneda)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Notas y Condiciones */}
                    {(cotizacion.notas || cotizacion.terminos) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {cotizacion.notas && (
                                <div className={cardPanel}>
                                    <h4 className="font-semibold text-sm mb-2">Notas Comerciales</h4>
                                    <p className="text-xs whitespace-pre-wrap opacity-90 leading-relaxed">{cotizacion.notas}</p>
                                </div>
                            )}
                            {cotizacion.terminos && (
                                <div className={cardPanel}>
                                    <h4 className="font-semibold text-sm mb-2">Términos de Pago</h4>
                                    <p className="text-xs whitespace-pre-wrap opacity-90 leading-relaxed">{cotizacion.terminos}</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                        {/* Columna Derecha: Vista Previa PDF */}
                        <div className="lg:col-span-5 space-y-4">
                            <div className={`flex flex-col h-full rounded-xl overflow-hidden shadow-sm ${isLight ? 'border border-slate-200' : 'border border-[#1a3a56]'}`}>
                                <div className={`flex items-center gap-2 px-4 py-3 border-b ${isLight ? 'bg-slate-100 border-slate-200' : 'bg-[#0b1e30] border-[#1a3a56]'}`}>
                                    <FileText size={16} className={labelMuted} />
                                    <h3 className={`font-semibold text-sm ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>Documento PDF</h3>
                                </div>
                                <div className={`flex-1 min-h-[400px] lg:min-h-[600px] relative ${isLight ? 'bg-slate-200' : 'bg-[#04141E]'}`}>
                                    {previewLoading && (
                                        <div className="absolute inset-0 bg-[#04141E]/40 flex items-center justify-center text-sm font-medium text-white z-10">
                                            Generando vista previa...
                                        </div>
                                    )}
                                    {pdfPreviewUrl ? (
                                        <iframe
                                            title="Vista previa cotización"
                                            src={pdfPreviewUrl}
                                            className="absolute inset-0 w-full h-full border-0"
                                        />
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-sm text-slate-500">
                                            Vista previa no disponible
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                    )}
                </div>
            </div>
        </div>
    );
}
