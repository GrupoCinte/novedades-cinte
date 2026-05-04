import { useMemo, useState } from 'react';
import { formatMoney } from './salarioFormat';
import { useModuleTheme } from '../moduleTheme.js';

function filaCoincideBusqueda(it, raw) {
    const q = String(raw || '').trim().toLowerCase();
    if (!q) return true;
    const idStr = String(it?.id ?? '');
    const codigo = String(it?.codigo || '').trim().toLowerCase();
    if (idStr === q) return true;
    if (codigo === q) return true;
    if (codigo.includes(q)) return true;
    if (idStr.includes(q)) return true;
    return false;
}

export default function CotizadorHistorial({
    historial,
    onDelete,
    deletingId,
    onHistorialPdf
}) {
    const { cardPanel, panelTitle, tableHeadRow, tableBodyRow, isLight, field, labelMuted } = useModuleTheme();
    const [busqueda, setBusqueda] = useState('');
    const filtrado = useMemo(() => {
        const rows = Array.isArray(historial) ? historial : [];
        return rows.filter((it) => filaCoincideBusqueda(it, busqueda));
    }, [historial, busqueda]);

    return (
        <div className={cardPanel}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between mb-3">
                <h3 className={panelTitle}>Historial cotizador</h3>
                <label className="flex flex-col gap-1 min-w-0 sm:max-w-[220px] w-full sm:w-auto">
                    <span className={`text-xs font-medium ${labelMuted}`}>Buscar por ID o código</span>
                    <input
                        type="search"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Ej. 42 o COT-012"
                        className={`${field} w-full font-mono text-xs`}
                        autoComplete="off"
                    />
                </label>
            </div>
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
                        {filtrado.length === 0 ? (
                            <tr>
                                <td colSpan={6} className={`py-6 text-center text-sm ${labelMuted}`}>
                                    {busqueda.trim()
                                        ? 'Ninguna cotización coincide con la búsqueda.'
                                        : 'No hay cotizaciones guardadas.'}
                                </td>
                            </tr>
                        ) : null}
                        {filtrado.map((it) => {
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
                                            disabled={!Array.isArray(it.resultados) || it.resultados.length === 0}
                                            title={
                                                !Array.isArray(it.resultados) || it.resultados.length === 0
                                                    ? 'Sin resultados para PDF'
                                                    : 'Abrir PDF en una pestaña nueva'
                                            }
                                            onClick={() => onHistorialPdf?.(it)}
                                            className="px-2 py-1 mr-1 rounded border border-sky-500/50 text-sky-300 hover:bg-sky-500/10 disabled:opacity-50 text-xs"
                                        >
                                            Ver PDF
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
