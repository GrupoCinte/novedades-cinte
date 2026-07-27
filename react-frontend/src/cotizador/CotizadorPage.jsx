import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { resolveCargosLista } from './resolveCargosLista';
import { mergeCotizadorClienteRows } from './cotizadorClientesMerge.js';
import { parseSalarioLoose } from './salarioFormat';
import CotizadorForm from './CotizadorForm';
import CotizadorResultados from './CotizadorResultados';
import CotizadorHistorial from './CotizadorHistorial';
import CotizadorDashboard from './CotizadorDashboard';
import CotizadorDetalle from './CotizadorDetalle';
import { useModuleTheme } from '../moduleTheme.js';
import { buildCsrfHeaders } from '../cognitoAuth.js';

/** Quita `ok` del JSON del API para no mezclar metadatos con el objeto de catálogos. */
function catalogosFromApiResponse(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const { ok: _ok, ...rest } = raw;
    return rest;
}

function authHeadersJson(token, extra = {}) {
    const h = buildCsrfHeaders({ 'Content-Type': 'application/json', ...extra });
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

const SECCIONES = {
    nueva: { titulo: 'Nueva Cotización', subtitulo: 'Completa los datos para crear una nueva cotización' },
    cotizaciones: { titulo: 'Cotizaciones', subtitulo: 'Gestiona tus cotizaciones y propuestas' },
    dashboard: { titulo: 'Dashboard', subtitulo: 'Indicadores del cotizador' },
    detalle: { titulo: 'Detalle de Cotización', subtitulo: 'Revisa y gestiona el estado de tu propuesta' }
};

export default function CotizadorPage({ token, vista = 'dashboard', onVistaChange }) {
    const { cotizadorCanvas, labelMuted, isLight, ghostBtn, pageErrorBanner, sectionTitle, sectionSubtitle } = useModuleTheme();
    const seccion = SECCIONES[vista] || SECCIONES.dashboard;
    const goVista = (id) => (typeof onVistaChange === 'function' ? onVistaChange(id) : undefined);
    
    const [loading, setLoading] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [deletingId, setDeletingId] = useState(null);
    const [catalogos, setCatalogos] = useState(null);
    const [clientesLista, setClientesLista] = useState([]);
    const [historial, setHistorial] = useState([]);
    const [dashboard, setDashboard] = useState({});
    const [error, setError] = useState('');
    
    const [selectedCotizacionId, setSelectedCotizacionId] = useState(null);
    const [navFilters, setNavFilters] = useState({});

    const handleNavigateWithFilters = (targetVista, filters) => {
        setNavFilters(filters || {});
        goVista(targetVista);
    };

    const [form, setForm] = useState({
        id: undefined,
        cliente: '',
        comercial: '',
        plazo: '45',
        margenPct: 30,
        meses: 12,
        moneda: 'COP',
        titulo: '',
        notas: '',
        terminos: '',
        contacto_nombre: '',
        contacto_cargo: '',
        contacto_correo: '',
        perfiles: [{ indice: 0, cantidad: 1, modo: 'AUTO', salario_manual: '', cargo_manual: '' }]
    });
    const prevClienteRef = useRef(form.cliente);

    const cargosResueltos = useMemo(
        () => resolveCargosLista(catalogos || {}, form.cliente),
        [catalogos, form.cliente]
    );

    const loadAll = async () => {
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

    const fetchDashboardFiltered = async (clienteStr) => {
        try {
            const dash = await api(`/api/cotizador/dashboard?cliente=${encodeURIComponent(clienteStr)}`, token);
            if (dash && typeof dash === 'object') {
                const { ok: _o, ...dashRest } = dash;
                setDashboard(dashRest);
            } else {
                setDashboard({});
            }
        } catch (error) {
            console.error('[Cotizador] Error dashboard filtrado:', error);
        }
    };

    useEffect(() => {
        loadAll().catch((e) => setError(e.message));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    useEffect(() => {
        const tiKey = catalogos?.ti_interno_cliente_key;
        const prev = prevClienteRef.current;
        prevClienteRef.current = form.cliente;
        if (!tiKey || form.cliente !== tiKey) return;
        if (prev === form.cliente) return;
        let cancelled = false;
        (async () => {
            try {
                const raw = await api('/api/cotizador/catalogos', token);
                if (!cancelled) setCatalogos(catalogosFromApiResponse(raw));
            } catch (e) {
                console.warn('[Cotizador] refetch catalogos (cliente TI):', e?.message || e);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [form.cliente, catalogos?.ti_interno_cliente_key, token]);

    const onGuardarDirecto = async (calculatedQuote) => {
        setGuardando(true);
        setError('');
        try {
            await api('/api/cotizador/guardar', token, {
                method: 'POST',
                body: JSON.stringify(calculatedQuote)
            });
            // Reset form
            setForm({
                id: undefined,
                cliente: '',
                comercial: '',
                plazo: '45',
                margenPct: 30,
                meses: 12,
                moneda: 'COP',
                titulo: '',
                notas: '',
                terminos: '',
                contacto_nombre: '',
                contacto_cargo: '',
                contacto_correo: '',
                perfiles: [{ indice: 0, cantidad: 1, modo: 'AUTO', salario_manual: '', cargo_manual: '' }]
            });
            await loadAll();
            goVista('cotizaciones');
        } catch (e) {
            setError(e.message);
        } finally {
            setGuardando(false);
        }
    };

    const onDeleteDirecto = async (id) => {
        if (!window.confirm('¿Está seguro de que desea eliminar esta cotización?')) return;
        setDeletingId(id);
        setError('');
        try {
            await api(`/api/cotizador/historial/${id}`, token, { method: 'DELETE' });
            await loadAll();
            goVista('cotizaciones');
        } catch (e) {
            setError(e.message);
        } finally {
            setDeletingId(null);
        }
    };

    const onEdit = (cot) => {
        const matchingCargos = resolveCargosLista(catalogos || {}, cot.cliente);
        const perfiles = (cot.resultados || []).map((r) => {
            if (String(r.modo).toUpperCase() === 'MANUAL') {
                return {
                    modo: 'MANUAL',
                    cargo_manual: r.cargo,
                    salario_manual: String(r.salario),
                    cantidad: r.cantidad,
                    indice: 0
                };
            } else {
                const idx = matchingCargos.findIndex((c) => c.cargo === r.cargo);
                return {
                    modo: 'AUTO',
                    cargo_manual: '',
                    salario_manual: '',
                    cantidad: r.cantidad,
                    indice: idx >= 0 ? idx : 0
                };
            }
        });

        setForm({
            id: cot.id,
            cliente: cot.cliente || '',
            comercial: cot.comercial || '',
            plazo: cot.plazo || '45',
            margenPct: Number(cot.margen || 0.3) * 100,
            meses: cot.meses || 12,
            moneda: cot.moneda || 'COP',
            titulo: cot.titulo || '',
            notas: cot.notas || '',
            terminos: cot.terminos || '',
            contacto_nombre: cot.contacto_nombre || '',
            contacto_cargo: cot.contacto_cargo || '',
            contacto_correo: cot.contacto_correo || '',
            perfiles: perfiles.length > 0 ? perfiles : [{ indice: 0, cantidad: 1, modo: 'AUTO', salario_manual: '', cargo_manual: '' }]
        });

        goVista('nueva');
    };

    return (
        <div className={cotizadorCanvas}>

            {error && <div className={pageErrorBanner}>{error}</div>}

            {vista === 'nueva' && (
                <div className="space-y-3 w-full flex-1">
                    <CotizadorForm
                        catalogos={catalogos || {}}
                        cargosResueltos={cargosResueltos}
                        clientesLista={clientesLista}
                        form={form}
                        setForm={setForm}
                        loading={guardando}
                        onSave={onGuardarDirecto}
                        onCancel={() => {
                            setForm({
                                id: undefined,
                                cliente: '',
                                comercial: '',
                                plazo: '45',
                                margenPct: 30,
                                meses: 12,
                                moneda: 'COP',
                                titulo: '',
                                notas: '',
                                terminos: '',
                                contacto_nombre: '',
                                contacto_cargo: '',
                                contacto_correo: '',
                                perfiles: [{ indice: 0, cantidad: 1, modo: 'AUTO', salario_manual: '', cargo_manual: '' }]
                            });
                            goVista('cotizaciones');
                        }}
                    />
                </div>
            )}

            {(vista === 'cotizaciones' || vista === 'dashboard') && (
                <>
                    {vista === 'cotizaciones' && (
                        <CotizadorHistorial
                            historial={historial}
                            initialFilters={navFilters}
                            onDelete={onDeleteDirecto}
                            deletingId={deletingId}
                            onSelect={(it) => {
                                setSelectedCotizacionId(it.id);
                            }}
                            onNuevaCotizacion={() => {
                                setForm({
                                    id: undefined,
                                    cliente: '',
                                    comercial: '',
                                    plazo: '45',
                                    margenPct: 30,
                                    meses: 12,
                                    moneda: 'COP',
                                    titulo: '',
                                    notas: '',
                                    terminos: '',
                                    contacto_nombre: '',
                                    contacto_cargo: '',
                                    contacto_correo: '',
                                    perfiles: [{ indice: 0, cantidad: 1, modo: 'AUTO', salario_manual: '', cargo_manual: '' }]
                                });
                                goVista('nueva');
                            }}
                        />
                    )}

                    {vista === 'dashboard' && <CotizadorDashboard dashboard={dashboard} onSelectCotizacion={(id) => setSelectedCotizacionId(id)} onFilterChange={fetchDashboardFiltered} onNavigateWithFilters={handleNavigateWithFilters} />}

                    {selectedCotizacionId && (
                        <CotizadorDetalle
                            cotizacionId={selectedCotizacionId}
                            token={token}
                            onClose={() => setSelectedCotizacionId(null)}
                            onDelete={(id) => {
                                onDeleteDirecto(id);
                                setSelectedCotizacionId(null);
                            }}
                            deletingId={deletingId}
                            catalogos={catalogos || {}}
                            cargosResueltos={cargosResueltos}
                            clientesLista={clientesLista}
                            historial={historial}
                            onSave={async (payload) => {
                                await onGuardarDirecto(payload);
                                // Refresh history after saving from modal
                                if (typeof loadAll === 'function') loadAll();
                            }}
                            refreshData={loadAll}
                        />
                    )}
                </>
            )}

        </div>
    );
}
