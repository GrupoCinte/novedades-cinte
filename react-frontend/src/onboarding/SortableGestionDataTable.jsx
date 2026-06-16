import { ArrowDown, ArrowUp } from 'lucide-react';
import { buildGestionTableDash } from '../gestionTableDashTheme.js';

/**
 * Tabla onboarding con cabeceras ordenables (patrón Directorio / Reubicaciones).
 */
export default function SortableGestionDataTable({
    columns,
    rows,
    isLight,
    emptyText,
    onRowClick,
    sort,
    onSort,
    sortableKeys
}) {
    const G = buildGestionTableDash(Boolean(isLight));
    const clickable = typeof onRowClick === 'function';

    const isSortable = (col) => {
        if (!col?.key || col.sortable === false) return false;
        if (Array.isArray(sortableKeys)) return sortableKeys.includes(col.key);
        return true;
    };

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
                            {columns.map((c) => {
                                const sortKey = c.sortKey || c.key;
                                const active = sort?.key === sortKey;
                                const canSort = isSortable(c) && typeof onSort === 'function';
                                return (
                                    <th key={c.key} className="px-4 py-3 text-left whitespace-nowrap font-semibold">
                                        {canSort ? (
                                            <button
                                                type="button"
                                                onClick={() => onSort(sortKey)}
                                                className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-semibold text-inherit hover:text-[#65BCF7]"
                                            >
                                                {c.label}
                                                {active ? (
                                                    sort.dir === 'asc' ? (
                                                        <ArrowUp size={14} className="shrink-0 text-[#65BCF7]" />
                                                    ) : (
                                                        <ArrowDown size={14} className="shrink-0 text-[#65BCF7]" />
                                                    )
                                                ) : null}
                                            </button>
                                        ) : (
                                            c.label
                                        )}
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className={G.tbody}>
                        {rows.map((row, idx) => (
                            <tr
                                key={row.id || row.cedula || row.executionId || idx}
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
