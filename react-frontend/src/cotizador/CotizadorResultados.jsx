import { useEffect, useState } from 'react';
import { formatMoney } from './salarioFormat';
import { useModuleTheme } from '../moduleTheme.js';
import { buildCsrfHeaders } from '../cognitoAuth.js';

export default function CotizadorResultados({
    cotizacion,
    token,
    onGuardar,
    guardando,
    onDescargarPdf,
    descargandoPdf,
    /** Sin tarjeta exterior (p. ej. dentro del modal cristal del cotizador). */
    embedded = false
}) {
    const { cardPanel, insetWell, panelTitle, labelMuted, borderSubtle, tableHeadRow, tableBodyRow } = useModuleTheme();
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');

    useEffect(() => {
        if (!cotizacion?.resultados?.length) {
            setPdfPreviewUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
            });
            setPreviewLoading(false);
            setPreviewError('');
            return;
        }

        let cancelled = false;
        let createdUrl = null;

        (async () => {
            setPreviewLoading(true);
            setPreviewError('');
            try {
                const headers = buildCsrfHeaders({ 'Content-Type': 'application/json' });
                if (String(token || '').trim()) headers.Authorization = `Bearer ${token}`;
                const res = await fetch('/api/cotizador/pdf', {
                    method: 'POST',
                    credentials: 'include',
                    headers,
                    body: JSON.stringify({ ...cotizacion, download: false })
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err?.error || `Error PDF (${res.status})`);
                }
                const blob = await res.blob();
                if (cancelled) return;
                createdUrl = URL.createObjectURL(blob);
                setPdfPreviewUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return createdUrl;
                });
            } catch (e) {
                if (!cancelled) setPreviewError(e.message || 'No se pudo generar la vista previa');
            } finally {
                if (!cancelled) setPreviewLoading(false);
            }
        })();

        return () => {
            cancelled = true;
            if (createdUrl) URL.revokeObjectURL(createdUrl);
        };
    }, [cotizacion, token]);

    if (!cotizacion?.resultados?.length) {
        if (embedded) return null;
        return (
            <div className={`${cardPanel} ${labelMuted}`}>
                Ejecuta una cotización para ver resultados.
            </div>
        );
    }

    const surfaceClass = embedded ? 'space-y-4' : `${cardPanel} space-y-4`;

    return (
        <div className={surfaceClass}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className={`${panelTitle} font-bold`}>Resultados</h3>
                    {cotizacion.codigo ? (
                        <p className="text-xs text-emerald-400/90 mt-1 font-semibold">{cotizacion.codigo}</p>
                    ) : null}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onDescargarPdf}
                        disabled={descargandoPdf}
                        className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white"
                    >
                        {descargandoPdf ? 'Generando PDF...' : 'Descargar PDF'}
                    </button>
                    <button
                        type="button"
                        onClick={onGuardar}
                        disabled={guardando}
                        className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white"
                    >
                        {guardando ? 'Guardando...' : 'Guardar cotización'}
                    </button>
                </div>
            </div>
            <div className={`overflow-hidden rounded-lg ${insetWell}`}>
                <div className={`px-3 py-2 text-xs font-semibold uppercase tracking-wide border-b ${borderSubtle} ${labelMuted}`}>
                    Vista previa PDF
                </div>
                {previewError && (
                    <div className={`p-3 text-sm text-rose-600 border-b ${borderSubtle}`}>{previewError}</div>
                )}
                {previewLoading && !pdfPreviewUrl && (
                    <div className={`h-[min(560px,72vh)] flex items-center justify-center text-sm ${labelMuted}`}>
                        Generando vista previa…
                    </div>
                )}
                {pdfPreviewUrl ? (
                    <iframe
                        title="Vista previa cotización"
                        src={pdfPreviewUrl}
                        className={`w-full border-0 bg-slate-200 ${embedded ? 'h-[min(720px,78vh)]' : 'h-[min(560px,70vh)]'}`}
                    />
                ) : null}
            </div>
            <div className="overflow-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className={tableHeadRow}>
                            <th className="text-left py-2">Cargo</th>
                            <th className="text-right py-2">Cant.</th>
                            <th className="text-right py-2">Tarifa mes</th>
                            <th className="text-right py-2">Tarifa día</th>
                            <th className="text-right py-2">Tarifa hora</th>
                            <th className="text-right py-2">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        {cotizacion.resultados.map((r, idx) => {
                            const cant = Number(r.cantidad || 1);
                            const meses = Number(cotizacion.meses || 1);
                            const subtotal = Number(r.tarifa_mes || 0) * cant * meses;
                            return (
                                <tr key={`${r.cargo}-${idx}`} className={tableBodyRow}>
                                    <td className="py-2">{r.cargo}</td>
                                    <td className="py-2 text-right">{r.cantidad}</td>
                                    <td className="py-2 text-right">{formatMoney(r.tarifa_mes, r.moneda)}</td>
                                    <td className="py-2 text-right">{formatMoney(r.tarifa_dia, r.moneda)}</td>
                                    <td className="py-2 text-right">{formatMoney(r.tarifa_hora, r.moneda)}</td>
                                    <td className="py-2 text-right font-semibold">{formatMoney(subtotal, r.moneda)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
