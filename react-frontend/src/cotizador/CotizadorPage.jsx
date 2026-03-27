import { useEffect, useMemo, useState } from 'react';
import CotizadorForm from './CotizadorForm';
import CotizadorResultados from './CotizadorResultados';
import CotizadorHistorial from './CotizadorHistorial';
import CotizadorDashboard from './CotizadorDashboard';

async function api(path, token, options = {}) {
    const res = await fetch(path, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...(options.headers || {})
        }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Error en cotizador');
    return data;
}

export default function CotizadorPage({ token, embedded = false }) {
    const [loading, setLoading] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [descargandoPdf, setDescargandoPdf] = useState(false);
    const [catalogos, setCatalogos] = useState(null);
    const [historial, setHistorial] = useState([]);
    const [dashboard, setDashboard] = useState({});
    const [error, setError] = useState('');
    const [cotizacion, setCotizacion] = useState(null);

    const [form, setForm] = useState({
        cliente: '',
        comercial: '',
        plazo: '45',
        margenPct: 30,
        meses: 12,
        moneda: 'COP',
        perfiles: [{ indice: 0, cantidad: 1, modo: 'AUTO', salario_manual: '' }]
    });

    const payload = useMemo(() => {
        const margen = Number(form.margenPct || 0) / 100;
        const clienteObj = (catalogos?.clientes || []).find((c) => c.nombre === form.cliente) || {};
        return {
            cliente: form.cliente,
            nit: clienteObj.nit || '',
            comercial: form.comercial,
            plazo: form.plazo,
            margen,
            meses: Number(form.meses || 1),
            moneda: form.moneda,
            tasa_conversion: Number(catalogos?.parametros?.monedas?.[form.moneda]?.tasa || 1),
            nombre_moneda: catalogos?.parametros?.monedas?.[form.moneda]?.nombre || form.moneda,
            perfiles: form.perfiles
        };
    }, [form, catalogos]);

    const loadAll = async () => {
        if (!token) return;
        const [cat, his, dash] = await Promise.all([
            api('/api/cotizador/catalogos', token),
            api('/api/cotizador/historial', token),
            api('/api/cotizador/dashboard', token)
        ]);
        setCatalogos(cat);
        setHistorial(Array.isArray(his.items) ? his.items : []);
        setDashboard(dash || {});
    };

    useEffect(() => {
        loadAll().catch((e) => setError(e.message));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const onCotizar = async () => {
        setError('');
        setLoading(true);
        try {
            const out = await api('/api/cotizador/cotizar', token, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            setCotizacion(out);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const onGuardar = async () => {
        if (!cotizacion) return;
        setGuardando(true);
        setError('');
        try {
            await api('/api/cotizador/guardar', token, {
                method: 'POST',
                body: JSON.stringify(cotizacion)
            });
            await loadAll();
        } catch (e) {
            setError(e.message);
        } finally {
            setGuardando(false);
        }
    };

    const onDelete = async (id) => {
        setDeletingId(id);
        setError('');
        try {
            await api(`/api/cotizador/historial/${id}`, token, { method: 'DELETE' });
            await loadAll();
        } catch (e) {
            setError(e.message);
        } finally {
            setDeletingId(null);
        }
    };

    const onDescargarPdf = async () => {
        if (!cotizacion) return;
        setDescargandoPdf(true);
        setError('');
        try {
            const res = await fetch('/api/cotizador/pdf', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(cotizacion)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                if (res.status === 429) {
                    throw new Error(err?.error || 'Límite temporal de descargas alcanzado. Intenta nuevamente en unos minutos.');
                }
                if (res.status >= 500) {
                    throw new Error(err?.error || 'Error interno generando PDF. Revisa logs del backend.');
                }
                throw new Error(err?.error || `No se pudo generar el PDF (HTTP ${res.status})`);
            }
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const fileName = `cotizacion_${String(cotizacion?.cliente || 'cliente').replace(/[^\w\-]+/g, '_')}.pdf`;
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            setError(e.message || 'No se pudo descargar el PDF');
        } finally {
            setDescargandoPdf(false);
        }
    };

    return (
        <div className="h-full w-full bg-[#0f172a] text-slate-200 p-4 md:p-6 overflow-y-auto pb-8">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl md:text-2xl font-black text-white">Cotizador Web</h2>
                {!embedded && (
                    <span className="text-xs text-slate-400">Módulo comercial</span>
                )}
            </div>
            {error && <div className="mb-4 border border-rose-500/30 bg-rose-900/20 text-rose-200 rounded p-3">{error}</div>}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <CotizadorForm catalogos={catalogos || {}} form={form} setForm={setForm} onCotizar={onCotizar} loading={loading} />
                <CotizadorResultados
                    cotizacion={cotizacion}
                    onGuardar={onGuardar}
                    guardando={guardando}
                    onDescargarPdf={onDescargarPdf}
                    descargandoPdf={descargandoPdf}
                />
                <CotizadorHistorial historial={historial} onDelete={onDelete} deletingId={deletingId} />
                <CotizadorDashboard dashboard={dashboard} />
            </div>
        </div>
    );
}

