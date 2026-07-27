import { buildGestionTableDash } from '../gestionTableDashTheme.js';

/**
 * Tabla reutilizable con la línea visual del módulo "Gestión de Novedades":
 *  - Card envolvente rounded-2xl + sombra.
 *  - <thead> sticky con tracking-wider y fondo slate.
 *  - Filas con p-4, divide-y y hover.
 *
 * Contrato (igual al DataTable que vivía dentro de OnboardingModule.jsx):
 *  - columns: [{ key, label, render?(row) }]
 *  - rows: array de objetos
 *  - isLight: bool (tema)
 *  - emptyText: texto cuando rows está vacío
 *  - onRowClick?: si está definido, las filas son clickeables (cursor-pointer)
 */
export default function GestionDataTable({ columns, rows, isLight, emptyText, onRowClick }) {
    const G = buildGestionTableDash(Boolean(isLight));
    const clickable = typeof onRowClick === 'function';

    if (!rows || rows.length === 0) {
        return (
            <div className={`${G.card} px-4 py-10 text-center text-sm ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {emptyText || 'Sin registros'}
            </div>
        );
    }

    return (
        <div className={`${G.card} overflow-hidden`}>
            <div className="overflow-x-auto">
                <table className="min-w-full">
                    <thead className={G.thead}>
                        <tr>
                            {columns.map((c) => (
                                <th key={c.key} className="px-4 py-3 text-left">
                                    {c.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className={G.tbody}>
                        {rows.map((row, idx) => (
                            <tr
                                key={row.id || row.cedula || idx}
                                className={`${G.trHover} ${clickable ? 'cursor-pointer' : ''}`}
                                onClick={clickable ? () => onRowClick(row) : undefined}
                            >
                                {columns.map((c) => {
                                    const cellCls =
                                        c.cellClassName ??
                                        (c.key === columns[0]?.key ? G.tdName : G.tdCell);
                                    return (
                                        <td key={c.key} className={cellCls}>
                                            {c.render ? c.render(row) : String(row[c.key] ?? '')}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
