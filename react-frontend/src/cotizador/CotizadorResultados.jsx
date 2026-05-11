import { useEffect, useState } from 'react';
import { formatMoney } from './salarioFormat';

export default function CotizadorResultados({
    cotizacion,
    token,
    onGuardar,
    guardando,
    onDescargarPdf,
    descargandoPdf
}) {
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');

    useEffect(() => {
        if (!cotizacion?.resultados?.length || !token) {
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
                const res = await fetch('/api/cotizador/pdf', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
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
        return (
            <div className="bg-[#0b1e30] border border-[#1a3a56] rounded-xl p-4 text-slate-400 font-body">
                Ejecuta una cotización para ver resultados.
            </div>
        );
    }

    return (
        <div className="bg-[#0b1e30] border border-[#1a3a56] rounded-xl p-4 space-y-4 font-body">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-white font-bold">Resultados</h3>
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
            <div className="rounded-lg border border-slate-600 overflow-hidden bg-slate-900/50">
                <div className="px-3 py-2 border-b border-slate-700 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    Vista previa PDF
                </div>
                {previewError && (
                    <div className="p-3 text-sm text-rose-300 border-b border-slate-700">{previewError}</div>
                )}
                {previewLoading && !pdfPreviewUrl && (
                    <div className="h-[420px] flex items-center justify-center text-slate-500 text-sm">Generando vista previa…</div>
                )}
                {pdfPreviewUrl ? (
                    <iframe title="Vista previa cotización" src={pdfPreviewUrl} className="w-full h-[min(520px,65vh)] border-0 bg-slate-200" />
                ) : null}
            </div>
            <div className="overflow-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-slate-400 border-b border-slate-700">
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
                                <tr key={`${r.cargo}-${idx}`} className="border-b border-slate-800 text-slate-200">
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
