export default function ClienteMesSelectors({
    clientes,
    clienteValue,
    onClienteChange,
    monthValue,
    onMonthChange,
    field,
    labelMuted,
    cardPanel
}) {
    return (
        <div className={`flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end ${cardPanel}`}>
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1.5">
                <span className={`text-[10px] font-heading font-bold uppercase tracking-wider ${labelMuted}`}>Cliente</span>
                <select className={field} value={clienteValue} onChange={(e) => onClienteChange(e.target.value)}>
                    <option value="">— Seleccionar —</option>
                    {clientes.map((c) => (
                        <option key={c} value={c}>
                            {c}
                        </option>
                    ))}
                </select>
            </label>
            <label className="flex w-full min-w-[10rem] max-w-xs flex-col gap-1.5 sm:w-auto">
                <span className={`text-[10px] font-heading font-bold uppercase tracking-wider ${labelMuted}`}>Mes de facturación</span>
                <input type="month" className={field} value={monthValue} onChange={(e) => onMonthChange(e.target.value)} />
            </label>
        </div>
    );
}
