import { Link } from 'react-router-dom';
import { Receipt } from 'lucide-react';
import ConciliacionesColaCierresCard from './ConciliacionesColaCierresCard.jsx';
import { CINTE_BTN_PRIMARY } from '../conciliacionesLayout.js';

export default function ConciliacionesColaCierres({
    items,
    loading,
    year,
    month,
    userRole,
    onAbrirCierre,
    onExportExcel,
    onEnviarCorreo,
    onMarcarConciliada,
    exportandoId = '',
    conciliandoId = '',
    headingAccent,
    labelMuted,
    isLight
}) {
    if (loading) {
        return (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div
                        key={i}
                        className={`h-64 animate-pulse rounded-xl border ${isLight ? 'border-slate-200 bg-slate-100' : 'border-slate-700/50 bg-slate-800/40'}`}
                        aria-hidden
                    />
                ))}
                <span className={`sr-only ${labelMuted}`}>Cargando cola de cierres…</span>
            </div>
        );
    }

    if (!items?.length) {
        return (
            <div
                className={`flex flex-col items-center justify-center rounded-xl border px-6 py-16 text-center ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700/50 bg-slate-800/20'}`}
            >
                <Receipt size={40} className={`mb-3 opacity-40 ${labelMuted}`} aria-hidden />
                <p className={`text-sm font-semibold ${headingAccent}`}>No hay servicios en la cola de cierres</p>
                <p className={`mt-1 max-w-md text-xs ${labelMuted}`}>
                    Crea servicios y asocia consultores en el módulo Servicios para comenzar a conciliar.
                </p>
                <Link to="/admin/conciliaciones/servicios" className={`${CINTE_BTN_PRIMARY} mt-4`}>
                    Ir a Servicios
                </Link>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
                <ConciliacionesColaCierresCard
                    key={item.servicioId}
                    item={item}
                    year={year}
                    month={month}
                    userRole={userRole}
                    onAbrirCierre={onAbrirCierre}
                    onExportExcel={onExportExcel}
                    onEnviarCorreo={onEnviarCorreo}
                    onMarcarConciliada={onMarcarConciliada}
                    exportandoId={exportandoId}
                    conciliandoId={conciliandoId}
                    headingAccent={headingAccent}
                    labelMuted={labelMuted}
                    isLight={isLight}
                />
            ))}
        </div>
    );
}
