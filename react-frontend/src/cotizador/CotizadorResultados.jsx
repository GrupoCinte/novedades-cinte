function money(value, moneda = 'COP') {
    const n = Number(value || 0);
    if (moneda === 'USD') return `US$ ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    if (moneda === 'CLP') return `CLP ${Math.round(n).toLocaleString('es-CL')}`;
    return `$ ${Math.round(n).toLocaleString('es-CO')}`;
}

export default function CotizadorResultados({ cotizacion, onGuardar, guardando, onDescargarPdf, descargandoPdf }) {
    if (!cotizacion?.resultados?.length) {
        return (
            <div className="bg-[#1e293b] border border-slate-700 rounded-xl p-4 text-slate-400">
                Ejecuta una cotización para ver resultados.
            </div>
        );
    }

    return (
        <div className="bg-[#1e293b] border border-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-white font-bold">Resultados</h3>
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
            <div className="overflow-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-slate-400 border-b border-slate-700">
                            <th className="text-left py-2">Cargo</th>
                            <th className="text-right py-2">Cant.</th>
                            <th className="text-right py-2">Tarifa mes</th>
                            <th className="text-right py-2">Tarifa día</th>
                            <th className="text-right py-2">Tarifa hora</th>
                            <th className="text-right py-2">Modo</th>
                        </tr>
                    </thead>
                    <tbody>
                        {cotizacion.resultados.map((r, idx) => (
                            <tr key={`${r.cargo}-${idx}`} className="border-b border-slate-800 text-slate-200">
                                <td className="py-2">{r.cargo}</td>
                                <td className="py-2 text-right">{r.cantidad}</td>
                                <td className="py-2 text-right">{money(r.tarifa_mes, r.moneda)}</td>
                                <td className="py-2 text-right">{money(r.tarifa_dia, r.moneda)}</td>
                                <td className="py-2 text-right">{money(r.tarifa_hora, r.moneda)}</td>
                                <td className="py-2 text-right">{r.modo}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

