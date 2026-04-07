import { useEffect, useMemo, useState } from 'react';
import { resolveCargosLista } from './resolveCargosLista';
import { parseSalarioLoose } from './salarioFormat';
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
    if (!res.ok) {
        let msg = `Error HTTP ${res.status}`;
        try {
            const j = await res.json();
            if (j?.error) msg = j.error;
        } catch { /* body not JSON */ }
        throw new Error(msg);
    }
    const data = await res.json();
    return data;
}

export default function CotizadorPage({ token, embedded = false }) {
    const [loading, setLoading] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [descargandoPdf, setDescargandoPdf] = useState(false);
    const [catalogos, setCatalogos] = useState(null);
    const [clientesLista, setClientesLista] = useState([]);
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
        perfiles: [{ indice: 0, cantidad: 1, modo: 'AUTO', salario_manual: '', cargo_manual: '' }]
    });

    const cargosResueltos = useMemo(
        () => resolveCargosLista(catalogos || {}, form.cliente),
        [catalogos, form.cliente]
    );

    const loadAll = async () => {
        if (!token) return;
        const [cat, his, dash, cli] = await Promise.all([
            api('/api/cotizador/catalogos', token),
            api('/api/cotizador/historial', token),
            api('/api/cotizador/dashboard', token),
            api('/api/cotizador/clientes-formulario', token).catch(() => ({ items: [] }))
        ]);
        setCatalogos(cat);
        setHistorial(Array.isArray(his.items) ? his.items : []);
        setDashboard(dash || {});
        setClientesLista(Array.isArray(cli.items) ? cli.items : []);
    };

    useEffect(() => {
        loadAll().catch((e) => setError(e.message));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const onCotizar = async () => {
        setError('');
        setLoading(true);
        try {
            const margen = Number(form.margenPct || 0) / 100;
            const lista = clientesLista.length > 0 ? clientesLista : (catalogos?.clientes || []);
            const clienteObj = lista.find((c) => c.nombre === form.cliente) || {};
            const perfilesNorm = (form.perfiles || []).map((p) => {
                if (String(p?.modo || 'AUTO').toUpperCase() === 'MANUAL') {
                    return { ...p, salario_manual: parseSalarioLoose(p.salario_manual) };
                }
                return p;
            });
            const body = {
                cliente: form.cliente,
                nit: clienteObj.nit || '',
                comercial: form.comercial,
                plazo: form.plazo,
                margen,
                meses: Number(form.meses || 1),
                moneda: form.moneda,
                tasa_conversion: Number(catalogos?.parametros?.monedas?.[form.moneda]?.tasa || 1),
                nombre_moneda: catalogos?.parametros?.monedas?.[form.moneda]?.nombre || form.moneda,
                perfiles: perfilesNorm
            };
            const out = await api('/api/cotizador/cotizar', token, {
                method: 'POST',
                body: JSON.stringify(body)
            });
            setCotizacion(out);
        } catch (e) {
            setError(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    };

    const onGuardar = async () => {
        if (!cotizacion) return;
        setGuardando(true);
        setError('');
        try {
            const data = await api('/api/cotizador/guardar', token, {
                method: 'POST',
                body: JSON.stringify(cotizacion)
            });
            setCotizacion((prev) =>
                prev && data?.id
                    ? { ...prev, id: data.id, codigo: data.codigo || prev.codigo, fecha: data.fecha || prev.fecha }
                    : prev
            );
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
                body: JSON.stringify({ ...cotizacion, download: true })
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
            const fileName = cotizacion?.codigo
                ? `${String(cotizacion.codigo).replace(/[^\w\-]+/g, '_')}.pdf`
                : `cotizacion_${String(cotizacion?.cliente || 'cliente').replace(/[^\w\-]+/g, '_')}.pdf`;
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

    const onHistorialPdf = async (it, mode) => {
        if (!token || it?.id == null) return;
        if (!Array.isArray(it?.resultados) || it.resultados.length === 0) {
            setError('Esta cotización no tiene resultados para generar el PDF.');
            return;
        }

        let previewTab = null;
        if (mode !== 'download') {
            previewTab = window.open('about:blank', '_blank');
            if (!previewTab) {
                setError('El navegador bloqueó la ventana emergente. Permite ventanas para este sitio e inténtalo de nuevo.');
                return;
            }
            try {
                previewTab.document.title = 'Cargando PDF…';
            } catch {
                // ignorar
            }
        }

        setError('');
        try {
            const res = await fetch('/api/cotizador/pdf', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    cliente: it.cliente,
                    nit: it.nit,
                    comercial: it.comercial,
                    plazo: it.plazo,
                    margen: it.margen,
                    meses: it.meses,
                    moneda: it.moneda,
                    nombre_moneda: it.nombre_moneda,
                    tasa_conversion: it.tasa_conversion,
                    codigo: it.codigo,
                    factores_he: it.factores_he,
                    resultados: it.resultados,
                    download: mode === 'download'
                })
            });
            if (!res.ok) {
                previewTab?.close();
                const err = await res.json().catch(() => ({}));
                if (res.status === 429) {
                    throw new Error(err?.error || 'Límite temporal de PDF alcanzado. Espera unos minutos.');
                }
                throw new Error(err?.error || `No se pudo generar el PDF (HTTP ${res.status})`);
            }
            const blob = await res.blob();
            if (!blob.size) {
                previewTab?.close();
                throw new Error('El servidor devolvió un PDF vacío.');
            }
            const url = URL.createObjectURL(blob);
            const base = it.codigo ? String(it.codigo).replace(/[^\w\-]+/g, '_') : `cotizacion_${it.id}`;
            if (mode === 'download') {
                const a = document.createElement('a');
                a.href = url;
                a.download = `${base}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
            } else if (previewTab) {
                previewTab.location.href = url;
                window.setTimeout(() => URL.revokeObjectURL(url), 300_000);
            } else {
                URL.revokeObjectURL(url);
            }
        } catch (e) {
            try {
                previewTab?.close();
            } catch {
                /* noop */
            }
            setError(e.message || 'Error con el PDF del historial');
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
                <CotizadorForm
                    catalogos={catalogos || {}}
                    cargosResueltos={cargosResueltos}
                    clientesLista={clientesLista}
                    form={form}
                    setForm={setForm}
                    onCotizar={onCotizar}
                    loading={loading}
                />
                <CotizadorResultados
                    cotizacion={cotizacion}
                    token={token}
                    onGuardar={onGuardar}
                    guardando={guardando}
                    onDescargarPdf={onDescargarPdf}
                    descargandoPdf={descargandoPdf}
                />
                <CotizadorHistorial
                    historial={historial}
                    token={token}
                    onDelete={onDelete}
                    deletingId={deletingId}
                    onHistorialPdf={onHistorialPdf}
                />
                <CotizadorDashboard dashboard={dashboard} />
            </div>
        </div>
    );
}
