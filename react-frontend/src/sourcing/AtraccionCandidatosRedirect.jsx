import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchJob } from './atraccionApi.js';

/** Compatibilidad: /candidatos y /candidatos?job= → Shortlist con modal de vacante. */
export default function AtraccionCandidatosRedirect({ token }) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const jobId = searchParams.get('job');

    useEffect(() => {
        let cancelled = false;

        (async () => {
            if (!jobId) {
                navigate('/admin/atraccion-talento/shortlist', { replace: true });
                return;
            }
            try {
                const data = await fetchJob(token, jobId);
                const vacanteId = data?.job?.vacante_id;
                if (!cancelled && vacanteId) {
                    navigate(
                        `/admin/atraccion-talento/shortlist?vacante=${encodeURIComponent(vacanteId)}&tab=candidatos`,
                        { replace: true }
                    );
                    return;
                }
            } catch {
                /* fallback abajo */
            }
            if (!cancelled) {
                navigate('/admin/atraccion-talento/shortlist', { replace: true });
            }
        })();

        return () => { cancelled = true; };
    }, [jobId, navigate, token]);

    return null;
}
