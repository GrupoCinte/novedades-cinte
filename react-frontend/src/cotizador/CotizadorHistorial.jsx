import { formatMoney } from './salarioFormat';
import { useModuleTheme } from '../moduleTheme.js';

export default function CotizadorHistorial({
    historial,
    token,
    onDelete,
    deletingId,
    onHistorialPdf
}) {
    const { cardPanel, panelTitle, tableHeadRow, tableBodyRow, isLight } = useModuleTheme();
    return (
        <div className={cardPanel}>
            <h3 className={`${panelTitle} mb-3`}>Historial cotizador</h3>
            <div className="overflow-auto max-h-[380px]">
                <table className="w-full text-sm">
                    <thead>
                        <tr className={tableHeadRow}>
                            <th className="text-left py-2">ID</th>
                            <th className="text-left py-2">Fecha</th>
                            <th className="text-left py-2">Cliente</th>
                            <th className="text-left py-2">Comercial</th>
                            <th className="text-right py-2">Perfiles</th>
                            <th className="text-right py-2">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {historial.map((it) => {
                            const total = (it.resultados || []).reduce(
                                (acc, r) =>
                                    acc + Number(r.tarifa_mes || 0) * Number(r.cantidad || 1) * Number(it.meses || 1),
                                0
                            );
                            return (
                                <tr key={it.id} className={tableBodyRow}>
                                    <td className={`py-2 font-mono ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>{it.codigo || it.id}</td>
                                    <td className="py-2">{it.fecha}</td>
                                    <td className="py-2">{it.cliente || '-'}</td>
                                    <td className="py-2">{it.comercial || '-'}</td>
                                    <td className="py-2 text-right">
                                        {it.resultados?.length || 0} ({formatMoney(total)})
                                    </td>
                                    <td className="py-2 text-right whitespace-nowrap">
                                        <button
                                            type="button"
                                            disabled={!token}
                                            onClick={() => onHistorialPdf?.(it, 'inline')}
                                            className="px-2 py-1 mr-1 rounded border border-sky-500/50 text-sky-300 hover:bg-sky-500/10 disabled:opacity-50 text-xs"
                                        >
                                            Ver PDF
                                        </button>
                                        <button
                                            type="button"
                                            disabled={!token}
                                            onClick={() => onHistorialPdf?.(it, 'download')}
                                            className="px-2 py-1 mr-1 rounded border border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-50 text-xs"
                                        >
                                            Descargar
                                        </button>
                                        <button
                                            type="button"
                                            disabled={deletingId === it.id}
                                            onClick={() => onDelete(it.id)}
                                            className="px-2 py-1 rounded border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50 text-xs"
                                        >
                                            {deletingId === it.id ? '…' : 'Eliminar'}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
