import { useMemo, useState } from 'react';
import { Eye, Download, Trash2, Plus, Search } from 'lucide-react';
import { formatMoney } from './salarioFormat';
import { useModuleTheme } from '../moduleTheme.js';

function filaCoincideBusqueda(it, raw) {
    const q = String(raw || '').trim().toLowerCase();
    if (!q) return true;
    const idStr = String(it?.id ?? '');
    const codigo = String(it?.codigo || '').trim().toLowerCase();
    const cliente = String(it?.cliente || '').trim().toLowerCase();
    const comercial = String(it?.comercial || '').trim().toLowerCase();
    if (idStr === q || codigo === q) return true;
    return codigo.includes(q) || idStr.includes(q) || cliente.includes(q) || comercial.includes(q);
}

function totalCotizacion(it) {
    return (it?.resultados || []).reduce(
        (acc, r) => acc + Number(r?.tarifa_mes || 0) * Number(r?.cantidad || 1) * Number(it?.meses || 1),
        0
    );
}

export default function CotizadorHistorial({
    historial,
    onDelete,
    deletingId,
    onHistorialPdf,
    onHistorialPdfDownload,
    descargandoHistId,
    onNuevaCotizacion
}) {
    const {
        cardPanel,
        tableSurface,
        tableThead,
        tableRowBorder,
        field,
        labelMuted,
        isLight,
        primaryBtn,
        chipNeutral,
        iconActionBtn,
        iconActionDanger
    } = useModuleTheme();
    const [busqueda, setBusqueda] = useState('');
    const filtrado = useMemo(() => {
        const rows = Array.isArray(historial) ? historial : [];
        return rows.filter((it) => filaCoincideBusqueda(it, busqueda));
    }, [historial, busqueda]);

    const codigoText = isLight ? 'text-emerald-700' : 'text-emerald-300';

    return (
        <div className={`${cardPanel} space-y-4`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <label className="relative flex-1 sm:max-w-md">
                    <Search size={16} className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ${labelMuted}`} />
                    <input
                        type="search"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        placeholder="Buscar cotizaciones por código, cliente o comercial…"
                        className={`${field} w-full pl-9`}
                        autoComplete="off"
                    />
                </label>
                {typeof onNuevaCotizacion === 'function' && (
                    <button type="button" onClick={onNuevaCotizacion} className={`${primaryBtn} shrink-0`}>
                        <Plus size={16} />
                        <span>Nueva Cotización</span>
                    </button>
                )}
            </div>

            <div className={tableSurface}>
                <table className="w-full text-sm">
                    <thead className={tableThead}>
                        <tr className="text-left">
                            <th className="px-4 py-3 font-semibold">Número</th>
                            <th className="px-4 py-3 font-semibold">Cliente</th>
                            <th className="px-4 py-3 font-semibold">Comercial</th>
                            <th className="px-4 py-3 font-semibold text-right">Total</th>
                            <th className="px-4 py-3 font-semibold">Moneda</th>
                            <th className="px-4 py-3 font-semibold">Creada</th>
                            <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtrado.length === 0 ? (
                            <tr>
                                <td colSpan={7} className={`px-4 py-8 text-center text-sm ${labelMuted}`}>
                                    {busqueda.trim()
                                        ? 'Ninguna cotización coincide con la búsqueda.'
                                        : 'No hay cotizaciones guardadas todavía.'}
                                </td>
                            </tr>
                        ) : null}
                        {filtrado.map((it) => {
                            const moneda = it.moneda || it.resultados?.[0]?.moneda || 'COP';
                            const total = totalCotizacion(it);
                            const sinResultados = !Array.isArray(it.resultados) || it.resultados.length === 0;
                            return (
                                <tr key={it.id} className={tableRowBorder}>
                                    <td className={`px-4 py-3 font-mono font-semibold ${codigoText}`}>{it.codigo || it.id}</td>
                                    <td className="px-4 py-3">{it.cliente || '-'}</td>
                                    <td className="px-4 py-3">{it.comercial || '-'}</td>
                                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatMoney(total, moneda)}</td>
                                    <td className="px-4 py-3">
                                        <span className={chipNeutral}>{moneda}</span>
                                    </td>
                                    <td className={`px-4 py-3 whitespace-nowrap ${labelMuted}`}>{it.fecha || '-'}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <button
                                                type="button"
                                                disabled={sinResultados}
                                                title={sinResultados ? 'Sin resultados para PDF' : 'Ver PDF en una pestaña nueva'}
                                                onClick={() => onHistorialPdf?.(it)}
                                                className={iconActionBtn}
                                                aria-label="Ver PDF"
                                            >
                                                <Eye size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                disabled={sinResultados || descargandoHistId === it.id}
                                                title={sinResultados ? 'Sin resultados para PDF' : 'Descargar PDF'}
                                                onClick={() => onHistorialPdfDownload?.(it)}
                                                className={iconActionBtn}
                                                aria-label="Descargar PDF"
                                            >
                                                <Download size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                disabled={deletingId === it.id}
                                                title="Eliminar cotización"
                                                onClick={() => onDelete(it.id)}
                                                className={iconActionDanger}
                                                aria-label="Eliminar cotización"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
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
