function money(value) {
    return `$ ${Math.round(Number(value || 0)).toLocaleString('es-CO')}`;
}

export default function CotizadorHistorial({ historial, onDelete, deletingId }) {
    return (
        <div className="bg-[#1e293b] border border-slate-700 rounded-xl p-4">
            <h3 className="text-white font-bold mb-3">Historial cotizador</h3>
            <div className="overflow-auto max-h-[380px]">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-slate-400 border-b border-slate-700">
                            <th className="text-left py-2">Fecha</th>
                            <th className="text-left py-2">Cliente</th>
                            <th className="text-left py-2">Comercial</th>
                            <th className="text-right py-2">Perfiles</th>
                            <th className="text-right py-2">Acción</th>
                        </tr>
                    </thead>
                    <tbody>
                        {historial.map((it) => {
                            const total = (it.resultados || []).reduce((acc, r) => acc + Number(r.tarifa_mes || 0) * Number(r.cantidad || 1) * Number(it.meses || 1), 0);
                            return (
                                <tr key={it.id} className="border-b border-slate-800 text-slate-200">
                                    <td className="py-2">{it.fecha}</td>
                                    <td className="py-2">{it.cliente || '-'}</td>
                                    <td className="py-2">{it.comercial || '-'}</td>
                                    <td className="py-2 text-right">{it.resultados?.length || 0} ({money(total)})</td>
                                    <td className="py-2 text-right">
                                        <button
                                            type="button"
                                            disabled={deletingId === it.id}
                                            onClick={() => onDelete(it.id)}
                                            className="px-3 py-1 rounded border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
                                        >
                                            {deletingId === it.id ? 'Eliminando...' : 'Eliminar'}
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

