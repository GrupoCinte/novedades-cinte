import { Activity } from 'lucide-react';
import { useModuleTheme } from './moduleTheme.js';

/** Contenido temporal del submódulo dentro del Módulo de administración. */
export default function MonitoreoActividadesView() {
    const { cardPanel, sectionSubtitle, sectionTitle } = useModuleTheme();

    return (
        <div className="flex min-h-full items-center justify-center">
            <div className={`w-full max-w-2xl p-6 text-center sm:p-10 ${cardPanel}`}>
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2F7BB8]/40 bg-[#2F7BB8]/15 text-[#65BCF7]">
                    <Activity size={28} />
                </div>
                <h1 className={sectionTitle}>Monitoreo de actividades</h1>
                <p className={`mt-3 ${sectionSubtitle}`}>
                    Módulo en construcción — Próximamente verás las actividades agrupadas por cliente.
                </p>
            </div>
        </div>
    );
}
