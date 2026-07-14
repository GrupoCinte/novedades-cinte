import { Users, Eye } from 'lucide-react';
import { GESTION_TOOLBAR_PRIMARY_BTN } from '../../gestionTableDashTheme.js';

export default function ConciliacionesServiciosList({ rows, loading, onVerDetalles, headingAccent, labelMuted, isLight }) {
    if (loading) {
        return (
            <div className="flex h-32 items-center justify-center p-4">
                <span className={`text-sm ${labelMuted} animate-pulse`}>Cargando servicios...</span>
            </div>
        );
    }

    if (!rows || rows.length === 0) {
        return (
            <div className="flex h-32 items-center justify-center p-4">
                <span className={`text-sm ${labelMuted}`}>No se encontraron servicios</span>
            </div>
        );
    }

    const thClass = `sticky top-0 z-10 whitespace-nowrap bg-opacity-95 px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm ${
        isLight ? 'bg-slate-50 text-slate-500 shadow-[0_1px_0_rgba(203,213,225,0.8)]' : 'bg-[#0A1F30] text-slate-400 shadow-[0_1px_0_rgba(15,35,55,0.8)]'
    }`;
    const tdClass = `whitespace-nowrap px-4 py-3 text-sm transition-colors ${
        isLight ? 'border-b border-slate-100 group-hover:bg-slate-50 text-slate-700' : 'border-b border-[#0F2337] group-hover:bg-[#0F2337] text-slate-300'
    }`;

    const getModoFacturacionLabel = (val) => {
        switch (val) {
            case 'HOURS': return 'Horas';
            case 'CALENDAR_DAYS': return 'Días calendario';
            case 'BUSINESS_DAYS': return 'Días hábiles';
            default: return val || '';
        }
    };

    return (
        <table className="w-full min-w-[800px] border-collapse text-left">
            <thead>
                <tr>
                    <th className={thClass}>Cliente</th>
                    <th className={thClass}>Nombre del Servicio</th>
                    <th className={thClass}>Inicio Conciliación</th>
                    <th className={thClass}>Día de Cierre</th>
                    <th className={thClass}>Modo Facturación</th>
                    <th className={thClass}>Líder(es)</th>
                    <th className={thClass}>Consultores</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((row) => (
                    <tr key={row.id} className="group cursor-pointer" onClick={() => onVerDetalles(row)}>
                        <td className={`${tdClass} font-semibold ${headingAccent}`}>{row.client}</td>
                        <td className={tdClass}>{row.serviceName}</td>
                        <td className={tdClass}>{row.initDate}</td>
                        <td className={tdClass}>{row.closingDay}</td>
                        <td className={tdClass}>
                            {getModoFacturacionLabel(row.billingMode)}
                            {row.baseHours ? ` (${row.baseHours} hrs)` : ''}
                        </td>
                        <td className={tdClass}>
                            {Array.isArray(row.lideresAsociados) && row.lideresAsociados.length
                                ? row.lideresAsociados.join(', ')
                                : 'Todos'}
                        </td>
                        <td className={tdClass}>{row.consultoresCount || 0}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
