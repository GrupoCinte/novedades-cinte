import { useEffect, useState } from 'react';
import { userHasDirectorioPanel } from './directorioAccess.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Consulta periódicamente cuántas reubicaciones están en estado Urgente (Rojo) o Vencido.
 * Solo activo si el usuario tiene acceso al panel Directorio.
 *
 * @param {{ auth: object|null }} params
 * @returns {{ alertCount: number }}
 */
export function useReubicacionesAlerts({ auth }) {
    const [alertCount, setAlertCount] = useState(0);

    const hasAccess = Boolean(auth?.user && userHasDirectorioPanel(auth));

    useEffect(() => {
        if (!hasAccess) {
            setAlertCount(0);
            return;
        }

        let cancelled = false;

        async function fetchCount() {
            try {
                const res = await fetch('/api/directorio/reubicaciones-pipeline/alertas-count', {
                    credentials: 'include'
                });
                if (!res.ok || cancelled) return;
                const j = await res.json().catch(() => ({}));
                if (!cancelled) setAlertCount(Number(j.count) || 0);
            } catch {
                // fallo silencioso — la campana simplemente no muestra badge
            }
        }

        fetchCount();
        const timer = setInterval(fetchCount, POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [hasAccess]);

    return { alertCount };
}
