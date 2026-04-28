import { useEffect, useMemo, useState } from 'react';
import { resolveCargosLista } from './resolveCargosLista';
import { mergeCotizadorClienteRows } from './cotizadorClientesMerge.js';
import { parseSalarioLoose } from './salarioFormat';
import CotizadorForm from './CotizadorForm';
import CotizadorResultados from './CotizadorResultados';
import CotizadorHistorial from './CotizadorHistorial';
import CotizadorDashboard from './CotizadorDashboard';
import { useModuleTheme } from '../moduleTheme.js';

/** Quita `ok` del JSON del API para no mezclar metadatos con el objeto de catálogos. */
function catalogosFromApiResponse(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const { ok: _ok, ...rest } = raw;
    return rest;
}

function authHeadersJson(token, extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    if (String(token || '').trim()) h.Authorization = `Bearer ${token}`;
    return h;
}

/** Misma lista que el formulario de novedades: `clientes_lideres` vía API de catálogo. */
async function fetchClientesDesdeBdCatalogo(token) {
    const res = await fetch('/api/catalogos/clientes', {
        credentials: 'include',
        headers: authHeadersJson(token)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `Error HTTP ${res.status}`);
    const items = Array.isArray(json.items) ? json.items : [];
    return items
        .map((nombre) => ({ nombre: String(nombre || '').trim(), nit: '' }))
        .filter((r) => r.nombre);
}

function mergeClienteRowsDedupe(rowsA, rowsB) {
    const byKey = new Map();
    const add = (r) => {
        const nombre = String(r?.nombre || r?.name || '').trim();
        if (!nombre) return;
        const k = nombre.toLowerCase();
        const nit = String(r?.nit || '').trim();
        if (!byKey.has(k)) byKey.set(k, { nombre, nit });
        else if (nit && !byKey.get(k).nit) byKey.set(k, { nombre: byKey.get(k).nombre, nit });
    };
    for (const r of rowsA || []) add(r);
    for (const r of rowsB || []) add(r);
    return [...byKey.values()];
}

async function api(path, token, options = {}) {
    const res = await fetch(path, {
        credentials: 'include',
        ...options,
        headers: {
            ...authHeadersJson(token),
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
    const { cotizadorCanvas, labelMuted, isLight } = useModuleTheme();
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
        /**
         * No exigir `token` en memoria: tras F5 la sesión puede ir solo por cookie `cinteSession`
         * (`/api/me` no devuelve JWT). El backend acepta cookie o Bearer.
         */
        const settled = await Promise.allSettled([
            api('/api/cotizador/catalogos', token),
            api('/api/cotizador/historial', token),
            api('/api/cotizador/dashboard', token),
            api('/api/cotizador/clientes-formulario', token),
            fetchClientesDesdeBdCatalogo(token)
        ]);
        const catRes = settled[0];
        const hisRes = settled[1];
        const dashRes = settled[2];
        const cliRes = settled[3];
        const bdCliRes = settled[4];

        if (catRes.status === 'fulfilled') {
            setCatalogos(catalogosFromApiResponse(catRes.value));
        } else {
            console.warn('[Cotizador] catalogos:', catRes.reason?.message || catRes.reason);
            setCatalogos(null);
        }

        if (hisRes.status === 'fulfilled') {
            const his = hisRes.value;
            setHistorial(Array.isArray(his?.items) ? his.items : []);
        } else {
            console.warn('[Cotizador] historial:', hisRes.reason?.message || hisRes.reason);
            setHistorial([]);
        }

        if (dashRes.status === 'fulfilled') {
            const dash = dashRes.value;
            if (dash && typeof dash === 'object') {
                const { ok: _o, ...dashRest } = dash;
                setDashboard(dashRest);
            } else {
                setDashboard({});
            }
        } else {
            console.warn('[Cotizador] dashboard:', dashRes.reason?.message || dashRes.reason);
            setDashboard({});
        }

        const fromFormulario = cliRes.status === 'fulfilled' && Array.isArray(cliRes.value?.items) ? cliRes.value.items : [];
        if (cliRes.status === 'rejected') {
            console.warn('[Cotizador] clientes-formulario:', cliRes.reason?.message || cliRes.reason);
        }
        const fromBdCatalogo = bdCliRes.status === 'fulfilled' ? bdCliRes.value : [];
        if (bdCliRes.status === 'rejected') {
            console.warn('[Cotizador] /api/catalogos/clientes:', bdCliRes.reason?.message || bdCliRes.reason);
        }
        setClientesLista(mergeClienteRowsDedupe(fromFormulario, fromBdCatalogo));

        if (catRes.status === 'rejected' && cliRes.status === 'rejected' && bdCliRes.status === 'rejected') {
            const a = catRes.reason?.message || String(catRes.reason);
            const b = cliRes.reason?.message || String(cliRes.reason);
            const c = bdCliRes.reason?.message || String(bdCliRes.reason);
            setError(`${a} · ${b} · ${c}`);
        }
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
            const lista = mergeCotizadorClienteRows(clientesLista, catalogos || {});
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
                credentials: 'include',
                headers: authHeadersJson(token),
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
        if (it?.id == null) return;
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
                credentials: 'include',
                headers: authHeadersJson(token),
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
        <div className={cotizadorCanvas}>
            <div className="flex items-center justify-between mb-4">
                <h2 className={`text-xl md:text-2xl font-black font-heading ${isLight ? 'text-slate-900' : 'text-white'}`}>Cotizador Web</h2>
                {!embedded && (
                    <span className={`text-xs font-subtitle font-extralight ${labelMuted}`}>Módulo comercial</span>
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
