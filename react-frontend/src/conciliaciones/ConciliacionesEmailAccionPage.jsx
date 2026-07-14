import { useCallback, useEffect, useMemo, useState } from 'react';

import { useSearchParams } from 'react-router-dom';

import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';



function readCookie(name) {

    const raw = typeof document !== 'undefined' ? document.cookie : '';

    const part = raw.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));

    return part ? decodeURIComponent(part.slice(name.length + 1)) : '';

}



function emailAccionHeaders(extra = {}) {

    const headers = { ...extra };

    const xsrf = readCookie('cinteXsrf');

    if (xsrf) headers['x-cinte-xsrf'] = xsrf;

    return headers;

}



export default function ConciliacionesEmailAccionPage() {

    const [searchParams] = useSearchParams();

    const token = String(searchParams.get('token') || '').trim();

    const accionParam = String(searchParams.get('accion') || '').trim().toLowerCase();



    const [loading, setLoading] = useState(true);

    const [context, setContext] = useState(null);

    const [error, setError] = useState('');

    const [observacion, setObservacion] = useState('');

    const [submitting, setSubmitting] = useState(false);

    const [result, setResult] = useState(null);



    useEffect(() => {

        let meta = document.querySelector('meta[name="referrer"]');

        const created = !meta;

        if (!meta) {

            meta = document.createElement('meta');

            meta.setAttribute('name', 'referrer');

            document.head.appendChild(meta);

        }

        const prev = meta.getAttribute('content');

        meta.setAttribute('content', 'no-referrer');

        return () => {

            if (created && meta.parentNode) {

                meta.parentNode.removeChild(meta);

            } else if (prev != null) {

                meta.setAttribute('content', prev);

            } else {

                meta.removeAttribute('content');

            }

        };

    }, []);



    const accion = useMemo(() => {

        if (accionParam === 'approve' || accionParam === 'reject') return accionParam;

        if (context?.accion === 'approve' || context?.accion === 'reject') return context.accion;

        return '';

    }, [accionParam, context?.accion]);



    useEffect(() => {

        if (!token) {

            setError('Enlace inválido: falta el token.');

            setLoading(false);

            return undefined;

        }

        let cancelled = false;

        (async () => {

            setLoading(true);

            setError('');

            try {

                const res = await fetch(

                    `/api/conciliaciones/email-accion/context?token=${encodeURIComponent(token)}`,

                    { credentials: 'include' }

                );

                const data = await res.json().catch(() => ({}));

                if (!res.ok) throw new Error(data.error || 'Enlace no válido o expirado');

                if (!cancelled) setContext(data);

            } catch (e) {

                if (!cancelled) setError(e.message || 'No se pudo validar el enlace');

            } finally {

                if (!cancelled) setLoading(false);

            }

        })();

        return () => {

            cancelled = true;

        };

    }, [token]);



    const servicioLabel = useMemo(() => {

        const svc = context?.servicio;

        if (!svc) return '';

        return `${svc.serviceName || 'Servicio'} — ${svc.client || ''}`;

    }, [context]);



    const handleApprove = useCallback(async () => {

        if (!token) return;

        setSubmitting(true);

        setError('');

        try {

            const res = await fetch('/api/conciliaciones/email-accion/approve', {

                method: 'POST',

                credentials: 'include',

                headers: emailAccionHeaders({ 'Content-Type': 'application/json' }),

                body: JSON.stringify({ token })

            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) throw new Error(data.error || 'No se pudo aprobar la conciliación');

            setResult({ ok: true, message: 'Conciliación aprobada correctamente.', estado: data.estado });

        } catch (e) {

            setError(e.message || 'Error al aprobar');

        } finally {

            setSubmitting(false);

        }

    }, [token]);



    const handleReject = useCallback(async () => {

        if (!token) return;

        const obs = observacion.trim();

        if (!obs) {

            setError('La observación es obligatoria para solicitar corrección.');

            return;

        }

        setSubmitting(true);

        setError('');

        try {

            const res = await fetch('/api/conciliaciones/email-accion/reject', {

                method: 'POST',

                credentials: 'include',

                headers: emailAccionHeaders({ 'Content-Type': 'application/json' }),

                body: JSON.stringify({ token, observacion: obs })

            });

            const data = await res.json().catch(() => ({}));

            if (!res.ok) throw new Error(data.error || 'No se pudo registrar el rechazo');

            setResult({ ok: true, message: 'Solicitud de corrección registrada. El equipo revisará los ajustes.', estado: data.estado });

        } catch (e) {

            setError(e.message || 'Error al rechazar');

        } finally {

            setSubmitting(false);

        }

    }, [token, observacion]);



    return (

        <div className="min-h-screen bg-slate-100 px-4 py-10 font-body text-slate-800">

            <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-8 shadow-sm">

                <div className="mb-6 text-center">

                    <img

                        src="/assets/logo-cinte-header.png"

                        alt="Grupo Cinte"

                        className="mx-auto h-12 w-auto"

                    />

                    <h1 className="mt-4 text-xl font-bold text-[#004D87]">Conciliación de servicio</h1>

                </div>



                {loading ? (

                    <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-600">

                        <Loader2 className="animate-spin" size={18} aria-hidden />

                        Validando enlace…

                    </div>

                ) : null}



                {!loading && error && !result ? (

                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>

                ) : null}



                {!loading && !error && context && !result ? (

                    <>

                        <p className="text-sm text-slate-600">

                            {servicioLabel}

                            {context.anio && context.mes ? (

                                <span className="block mt-1">Periodo: {context.mes}/{context.anio}</span>

                            ) : null}

                        </p>



                        {accion === 'approve' ? (

                            <div className="mt-6 space-y-4">

                                <p className="text-sm text-slate-700">

                                    Confirme que desea aprobar la conciliación de este servicio.

                                </p>

                                <button

                                    type="button"

                                    onClick={handleApprove}

                                    disabled={submitting}

                                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#2F7BB8] px-4 py-3 text-sm font-semibold text-white hover:bg-[#266395] disabled:opacity-60"

                                >

                                    <CheckCircle2 size={18} aria-hidden />

                                    {submitting ? 'Procesando…' : 'Aprobar conciliación'}

                                </button>

                            </div>

                        ) : accion === 'reject' ? (

                            <div className="mt-6 space-y-4">

                                <p className="text-sm text-slate-700">

                                    Indique qué debe corregir el equipo de conciliaciones.

                                </p>

                                <textarea

                                    value={observacion}

                                    onChange={(e) => setObservacion(e.target.value)}

                                    maxLength={1000}

                                    rows={5}

                                    placeholder="Observaciones para el analista…"

                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#2F7BB8]"

                                />

                                <button

                                    type="button"

                                    onClick={handleReject}

                                    disabled={submitting}

                                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-60"

                                >

                                    <XCircle size={18} aria-hidden />

                                    {submitting ? 'Enviando…' : 'Rechazar y solicitar corrección'}

                                </button>

                            </div>

                        ) : (

                            <p className="mt-4 text-sm text-slate-600">Acción no reconocida en el enlace.</p>

                        )}

                    </>

                ) : null}



                {result?.ok ? (

                    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">

                        {result.message}

                    </div>

                ) : null}

            </div>

        </div>

    );

}


