import { useCallback, useEffect, useMemo, useState } from 'react';
import ColaboradorFichaFields from '../components/ColaboradorFichaFields.jsx';
import { useModuleTheme } from '../moduleTheme.js';
import MonitorGlassModalShell from '../shared/modals/MonitorGlassModalShell.jsx';
import { buildMonitorGlassModalTheme } from '../shared/modals/monitorGlassModalTheme.js';
import {
    initialStaffForm,
    mapRowToStaffForm,
    buildStaffColaboradorPayload,
    CO_TABS
} from '../constants/colaboradoresConsultorFields.js';

const HISTORIAL_TAB = {
    id: 'historial',
    title: 'Historial de la ficha',
    shortTitle: 'Historial'
};
import { onboardingApi } from './api.js';
import { getOnboardingPermissions } from './onboardingAccess.js';
import { TipoPersonalBadge, resolveColaboradorEstado } from './onboardingBadges.jsx';
import ContratoEstante, { contratosFromFicha } from './ContratoEstante.jsx';
import ContratoHistorialPanel from './ContratoHistorialPanel.jsx';
import { historialForFicha, matchClienteOption, pickLiderForCliente } from './contratoEstanteMap.js';

async function fetchClientes() {
    try {
        const res = await fetch('/api/catalogos/clientes', { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return [];
        return Array.isArray(data.items) ? data.items : [];
    } catch {
        return [];
    }
}

async function fetchLideres(cliente) {
    const c = String(cliente || '').trim();
    if (!c) return [];
    try {
        const res = await fetch(`/api/catalogos/lideres?cliente=${encodeURIComponent(c)}`, {
            credentials: 'include'
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return [];
        return Array.isArray(data.items) ? data.items : [];
    } catch {
        return [];
    }
}

export default function ColaboradorOnboardingModal({ auth, cedula, createMode = false, onClose, onSaved }) {
    const mt = useModuleTheme();
    const { labelMuted, isLight } = mt;
    const T = buildMonitorGlassModalTheme(isLight);
    const token = auth?.token || '';
    const perms = useMemo(() => getOnboardingPermissions(auth), [auth]);

    const [loading, setLoading] = useState(!createMode);
    const [error, setError] = useState('');
    const [form, setForm] = useState(initialStaffForm());
    const [originalForm, setOriginalForm] = useState(initialStaffForm());
    const [editMode, setEditMode] = useState(createMode);
    const [esBaja, setEsBaja] = useState(false);
    const [bajaOpen, setBajaOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [clientes, setClientes] = useState([]);
    const [liderOptions, setLiderOptions] = useState([]);
    const [liderLoading, setLiderLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(CO_TABS[0]?.id || 'general');
    const [selectedContratoId, setSelectedContratoId] = useState('cabecera');
    const [zohoHistorial, setZohoHistorial] = useState([]);

    const fichaTabs = createMode ? CO_TABS : [...CO_TABS, HISTORIAL_TAB];
    const onHistorialTab = activeTab === HISTORIAL_TAB.id;
    const displayName = createMode ? 'Nuevo colaborador' : form.nombre || 'Ficha del colaborador';
    const contratos = useMemo(() => contratosFromFicha(form, { esBaja }), [form, esBaja]);
    const contratoSeleccionado = useMemo(
        () => contratos.find((c) => c.id === selectedContratoId) || contratos.find((c) => c.esCabecera) || contratos[0],
        [contratos, selectedContratoId]
    );
    const formVista = useMemo(() => {
        const sel = contratoSeleccionado;
        const clienteVista = matchClienteOption(
            !sel || sel.esCabecera ? form.cliente : sel.cliente || form.cliente,
            clientes
        );
        const base =
            !sel || sel.esCabecera
                ? { ...form, cliente: clienteVista }
                : {
                      ...form,
                      cliente: clienteVista,
                      tipo_contrato: sel.tipo || form.tipo_contrato,
                      fecha_termino: sel.fechaTermino || form.fecha_termino,
                      fecha_ingreso: sel.fechaInicio || form.fecha_ingreso
                  };
        return {
            ...base,
            lider_catalogo: pickLiderForCliente(form.lider_catalogo, liderOptions, { loading: liderLoading })
        };
    }, [form, contratoSeleccionado, clientes, liderOptions, liderLoading]);
    const estadoColaborador = useMemo(
        () =>
            resolveColaboradorEstado({
                activo: esBaja ? false : true,
                motivoBaja: form.motivo_baja,
                fechaIngreso: form.fecha_ingreso
            }),
        [esBaja, form.motivo_baja, form.fecha_ingreso]
    );
    const displaySubtitle = createMode
        ? 'Alta manual de ficha'
        : [estadoColaborador.label, form.cedula || cedula || '—', form.cliente || null, form.correo_cinte || null]
              .filter(Boolean)
              .join(' · ');

    const load = useCallback(async () => {
        if (createMode) {
            setLoading(false);
            setError('');
            setEsBaja(false);
            const fresh = initialStaffForm();
            setForm(fresh);
            setOriginalForm(fresh);
            setLiderOptions([]);
            const cats = await fetchClientes();
            setClientes(cats);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const ced = String(cedula || '').replace(/\D+/g, '');
            const [ficha, cats] = await Promise.all([onboardingApi.getPersonal(token, ced), fetchClientes()]);
            const item = ficha?.item || {};
            setEsBaja(item.activo === false || Boolean(item.motivo_baja));
            const mapped = mapRowToStaffForm(item);
            setForm(mapped);
            setOriginalForm(mapped);
            const list = contratosFromFicha(mapped, {
                esBaja: item.activo === false || Boolean(item.motivo_baja)
            });
            const cab = list.find((c) => c.esCabecera) || list[0];
            setSelectedContratoId(cab?.id || 'cabecera');
            setClientes(cats);
        } catch (e) {
            const status = e?.response?.status;
            const msg = e?.response?.data?.error || e.message;
            if (status === 403) setError('No tienes permiso para ver esta ficha (fuera de scope).');
            else if (status === 404) setError('Colaborador no encontrado.');
            else setError(msg || 'Error cargando la ficha');
        } finally {
            setLoading(false);
        }
    }, [cedula, token, createMode]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        const cliente = createMode ? form.cliente : contratoSeleccionado?.cliente || form.cliente;
        if (!cliente) {
            setLiderOptions([]);
            setLiderLoading(false);
            return undefined;
        }
        let alive = true;
        setLiderLoading(true);
        setLiderOptions([]);
        fetchLideres(cliente)
            .then((items) => {
                if (!alive) return;
                setLiderOptions(items);
            })
            .finally(() => {
                if (alive) setLiderLoading(false);
            });
        return () => {
            alive = false;
        };
    }, [createMode, form.cliente, contratoSeleccionado?.cliente]);

    useEffect(() => {
        if (createMode || !cedula) return undefined;
        let alive = true;
        onboardingApi
            .listFichaNovedades(token, { cedula, scope: 'historico', limit: 20 })
            .then((r) => {
                if (alive) setZohoHistorial(r?.items || []);
            })
            .catch(() => {
                if (alive) setZohoHistorial([]);
            });
        return () => {
            alive = false;
        };
    }, [createMode, cedula, token]);

    const handleEdit = () => {
        if (!perms.canEditFicha) return;
        setEditMode(true);
    };

    const handleCancel = () => {
        if (createMode) {
            if (typeof onClose === 'function') onClose();
            return;
        }
        setForm(originalForm);
        setEditMode(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!perms.canEditFicha || saving) return;
        setSaving(true);
        setError('');
        try {
            const payload = buildStaffColaboradorPayload(formVista);
            payload.nombre = String(formVista.nombre || '').trim();
            payload.correo_cinte = formVista.correo_cinte ? String(formVista.correo_cinte).trim().toLowerCase() : null;
            if (payload.correo_cinte && !/@(?:grupocinte\.com)$/i.test(payload.correo_cinte)) {
                setError('El correo Cinte debe ser @grupocinte.com');
                setSaving(false);
                return;
            }
            const clienteSel = String(
                contratoSeleccionado && !contratoSeleccionado.esCabecera
                    ? contratoSeleccionado.cliente || formVista.cliente || form.cliente || ''
                    : formVista.cliente || form.cliente || ''
            ).trim();
            payload.cliente = clienteSel || null;
            const persistLiderCabecera = createMode || !contratoSeleccionado || contratoSeleccionado.esCabecera;
            payload.lider_catalogo = persistLiderCabecera
                ? formVista.lider_catalogo
                    ? String(formVista.lider_catalogo).trim()
                    : null
                : form.lider_catalogo
                  ? String(form.lider_catalogo).trim()
                  : null;
            if (createMode) {
                const cedNueva = String(form.cedula || '').replace(/\D+/g, '');
                if (!cedNueva) {
                    setError('La cédula es obligatoria.');
                    setSaving(false);
                    return;
                }
                const r = await onboardingApi.createPersonal(token, { ...payload, cedula: cedNueva });
                if (typeof onSaved === 'function') onSaved(r?.item || null);
                if (typeof onClose === 'function') onClose();
                return;
            }
            const ced = String(cedula || '').replace(/\D+/g, '');
            const r = await onboardingApi.patchPersonal(token, ced, payload);
            const mapped = mapRowToStaffForm(r?.item || {});
            setForm(mapped);
            setOriginalForm(mapped);
            const list = contratosFromFicha(mapped, { esBaja });
            const keep = list.find((c) => c.id === selectedContratoId) || list.find((c) => c.esCabecera) || list[0];
            if (keep) setSelectedContratoId(keep.id);
            setEditMode(false);
            if (typeof onSaved === 'function') onSaved(r?.item || null);
        } catch (ex) {
            const status = ex?.response?.status;
            const msg = ex?.response?.data?.error || ex.message;
            if (status === 400 && ex?.response?.data?.detail) {
                setError(`Datos inválidos: ${JSON.stringify(ex.response.data.detail).slice(0, 300)}`);
            } else {
                setError(msg || 'Error guardando los cambios');
            }
        } finally {
            setSaving(false);
        }
    };

    const handleBajaConfirmada = (item) => {
        setBajaOpen(false);
        if (typeof onSaved === 'function') onSaved(item || null);
        if (item && item.activo === false && typeof onClose === 'function') onClose();
    };

    const subTabsBarCls = isLight
        ? 'flex shrink-0 flex-nowrap items-stretch gap-x-1 overflow-x-auto border-b border-slate-200/80 px-1'
        : 'flex shrink-0 flex-nowrap items-stretch gap-x-1 overflow-x-auto border-b border-white/10 px-1';

    const headerActions = (
        <>
            {!loading && !error && !createMode && form.tipo_personal ? (
                <span className="hidden sm:inline-flex">
                    <TipoPersonalBadge value={form.tipo_personal} isLight={isLight} />
                </span>
            ) : null}
            {!loading && !error && !editMode && !createMode && perms.canEditFicha ? (
                <button
                    type="button"
                    onClick={handleEdit}
                    className="inline-flex items-center justify-center rounded-lg bg-[#2F7BB8] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#004D87] sm:px-4 sm:py-2 sm:text-sm"
                >
                    Editar
                </button>
            ) : null}
            {!loading && !error && !createMode && editMode && perms.canTramitarBaja && form.cedula && !esBaja ? (
                <button
                    type="button"
                    onClick={() => setBajaOpen(true)}
                    className="inline-flex items-center justify-center rounded-lg bg-rose-500/90 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-rose-500 sm:px-4 sm:py-2 sm:text-sm"
                >
                    Cerrar contrato
                </button>
            ) : null}
        </>
    );

    const footer =
        editMode && !loading && !error ? (
            <>
                <button type="button" disabled={saving} onClick={handleCancel} className={T.cancelBtnCls}>
                    Cancelar
                </button>
                <button
                    type="submit"
                    form="colaborador-ficha-form"
                    disabled={saving}
                    className="inline-flex items-center justify-center rounded-lg bg-[#2F7BB8] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#004D87] disabled:opacity-50"
                >
                    {saving ? (createMode ? 'Creando…' : 'Guardando…') : createMode ? 'Crear colaborador' : 'Guardar cambios'}
                </button>
            </>
        ) : null;

    return (
        <>
            <MonitorGlassModalShell
                open
                onClose={saving ? undefined : onClose}
                disableBackdropClose={saving}
                title={displayName}
                subtitle={displaySubtitle}
                avatarLetter={createMode ? '+' : displayName}
                compact
                headerActions={headerActions}
                footer={footer}
                bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-2 sm:px-6"
            >
                {!loading && !error && !createMode ? (
                    <div className="mb-2 shrink-0">
                        <ContratoEstante
                            contratos={contratos}
                            selectedId={selectedContratoId}
                            onSelect={setSelectedContratoId}
                            isLight={isLight}
                        />
                    </div>
                ) : null}
                {!loading && !error ? (
                    <div role="tablist" aria-label="Secciones de la ficha" className={subTabsBarCls}>
                        {fichaTabs.map((tab) => {
                            const isActive = tab.id === activeTab;
                            const label = tab.shortTitle || tab.title;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    title={tab.title}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-2.5 py-2 text-sm font-semibold transition-colors sm:px-4 sm:py-2.5 ${
                                        isActive
                                            ? `border-[#2F7BB8] ${isLight ? 'text-slate-900' : 'text-white'}`
                                            : `border-transparent ${labelMuted}`
                                    }`}
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                ) : null}

                <form id="colaborador-ficha-form" onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-y-auto custom-scrollbar pr-1">
                    {loading ? (
                        <p className={`text-sm ${labelMuted}`}>Cargando ficha…</p>
                    ) : error ? (
                        <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">
                            {error}
                        </div>
                    ) : onHistorialTab ? (
                        <div className="space-y-6 pb-2">
                            <ContratoHistorialPanel
                                items={historialForFicha(form)}
                                isLight={isLight}
                            />
                            {zohoHistorial.length > 0 ? (
                                <div className={`rounded-xl border p-4 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700/50 bg-[#0f172a]/50'}`}>
                                    <p className={`mb-2 text-xs font-bold uppercase tracking-wider ${labelMuted}`}>
                                        Historial novedades Zoho
                                    </p>
                                    <ul className="flex flex-col gap-2 text-sm">
                                        {zohoHistorial.map((h) => (
                                            <li key={h.id} className="flex flex-wrap items-center gap-2">
                                                <span className="font-medium">{h.tipo_novedad}</span>
                                                <span className={labelMuted}>{h.status}</span>
                                                <span className={labelMuted}>{h.subject || h.id_registro}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <ColaboradorFichaFields
                            value={formVista}
                            onChange={(patch) => {
                                const sel = contratoSeleccionado;
                                const nextPatch = { ...(patch || {}) };
                                if (sel && !sel.esCabecera && nextPatch.lider_catalogo !== undefined) {
                                    delete nextPatch.lider_catalogo;
                                }
                                if (sel && !sel.esCabecera && nextPatch.cliente !== undefined && !String(nextPatch.cliente || '').trim()) {
                                    delete nextPatch.cliente;
                                }
                                const contractKeys = ['cliente', 'tipo_contrato', 'fecha_termino', 'fecha_ingreso'];
                                const touchesContract = Object.keys(nextPatch).some((k) => contractKeys.includes(k));
                                if (sel && !sel.esCabecera && touchesContract && Array.isArray(form.contratos)) {
                                    const nextContratos = form.contratos.map((c) => {
                                        if (String(c.id) !== String(sel.id)) return c;
                                        return {
                                            ...c,
                                            cliente: nextPatch.cliente !== undefined ? nextPatch.cliente : c.cliente,
                                            tipo: nextPatch.tipo_contrato !== undefined ? nextPatch.tipo_contrato : c.tipo,
                                            tipo_contrato:
                                                nextPatch.tipo_contrato !== undefined
                                                    ? nextPatch.tipo_contrato
                                                    : c.tipo_contrato,
                                            fechaTermino:
                                                nextPatch.fecha_termino !== undefined
                                                    ? nextPatch.fecha_termino
                                                    : c.fechaTermino,
                                            fecha_termino:
                                                nextPatch.fecha_termino !== undefined
                                                    ? nextPatch.fecha_termino
                                                    : c.fecha_termino,
                                            fechaInicio:
                                                nextPatch.fecha_ingreso !== undefined
                                                    ? nextPatch.fecha_ingreso
                                                    : c.fechaInicio,
                                            fecha_inicio:
                                                nextPatch.fecha_ingreso !== undefined
                                                    ? nextPatch.fecha_ingreso
                                                    : c.fecha_inicio
                                        };
                                    });
                                    const rest = { ...nextPatch };
                                    for (const k of contractKeys) delete rest[k];
                                    if (Object.keys(rest).length === 0) {
                                        setForm((s) => ({ ...s, contratos: nextContratos }));
                                        return;
                                    }
                                    setForm((s) => ({ ...s, ...rest, contratos: nextContratos }));
                                    return;
                                }
                                if (Object.keys(nextPatch).length === 0) return;
                                setForm((s) => ({ ...s, ...nextPatch }));
                            }}
                            mode={createMode ? 'create' : 'edit'}
                            readOnly={!editMode}
                            lockCliente={Boolean(contratoSeleccionado && !contratoSeleccionado.esCabecera)}
                            clientes={clientes}
                            liderOptions={liderOptions}
                            liderLoading={liderLoading}
                            activeTabId={activeTab}
                            hideIdentityFields={!createMode}
                        />
                    )}
                </form>
            </MonitorGlassModalShell>

            {bajaOpen ? (
                <BajaModal
                    auth={auth}
                    cedula={String(form.cedula || cedula || '').replace(/\D+/g, '')}
                    nombre={form.nombre}
                    cliente={contratoSeleccionado?.cliente || formVista.cliente || form.cliente}
                    contratoId={contratoSeleccionado?.id}
                    vigentesCount={contratos.filter((c) => c.vigente !== false).length}
                    onClose={() => setBajaOpen(false)}
                    onConfirmed={handleBajaConfirmada}
                />
            ) : null}
        </>
    );
}

function BajaModal({ auth, cedula, nombre, cliente, contratoId, vigentesCount, onClose, onConfirmed }) {
    const { labelMuted, isLight } = useModuleTheme();
    const T = buildMonitorGlassModalTheme(isLight);
    const token = auth?.token || '';

    const [motivos, setMotivos] = useState([]);
    const [motivo, setMotivo] = useState('');
    const [fecha, setFecha] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const r = await onboardingApi.catalogoMotivoBaja(token);
                const items = Array.isArray(r?.items) ? r.items : [];
                if (!alive) return;
                setMotivos(items.map((it) => (typeof it === 'string' ? it : it.motivo || it.nombre || '')).filter(Boolean));
            } catch {
                if (alive) setMotivos([]);
            }
        })();
        return () => {
            alive = false;
        };
    }, [token]);

    const handleConfirm = async () => {
        if (saving) return;
        const cedNorm = String(cedula || '').replace(/\D+/g, '');
        if (!cedNorm) {
            setError('No se pudo identificar la cédula del colaborador. Cierra y vuelve a abrir la ficha.');
            return;
        }
        if (!motivo) {
            setError('Selecciona un motivo de baja.');
            return;
        }
        if (!fecha) {
            setError('Indica la fecha de término.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const body = { motivo_baja: motivo, fecha_termino: fecha };
            if (observaciones.trim()) body.observaciones = observaciones.trim();
            if (cliente) body.cliente = String(cliente).trim();
            if (contratoId && /^[0-9a-f-]{36}$/i.test(String(contratoId))) body.contrato_id = contratoId;
            const r = await onboardingApi.marcarBaja(token, cedNorm, body);
            if (typeof onConfirmed === 'function') onConfirmed(r?.item || null);
        } catch (ex) {
            const msg = ex?.response?.data?.error || ex.message;
            setError(msg || 'Error al tramitar la baja.');
        } finally {
            setSaving(false);
        }
    };

    const inputCls = isLight
        ? 'field-control w-full px-3 py-2 text-sm'
        : 'field-control w-full px-3 py-2 text-sm';
    const labelCls = `mb-1 block text-[11px] font-bold uppercase tracking-wider ${labelMuted}`;

    const footer = (
        <>
            <button type="button" disabled={saving} onClick={onClose} className={T.cancelBtnCls}>
                Cancelar
            </button>
            <button
                type="button"
                disabled={saving || !motivo || !fecha}
                onClick={handleConfirm}
                className="rounded-xl border border-red-500/65 bg-transparent px-4 py-2 text-sm font-semibold text-[var(--error)] transition hover:bg-[rgba(255,107,107,0.1)] disabled:opacity-50"
            >
                {saving ? 'Procesando…' : 'Confirmar baja'}
            </button>
        </>
    );

    return (
        <MonitorGlassModalShell
            open
            onClose={onClose}
            disableBackdropClose={saving}
            zClass="z-[170]"
            size="md"
            title={cliente ? `Cerrar contrato · ${cliente}` : 'Cerrar contrato'}
            subtitle={`${cedula}${nombre ? ` · ${nombre}` : ''}`}
            avatarLetter={nombre || cedula}
            footer={footer}
            bodyClassName="px-6 pb-2 pt-2"
        >
            <p className={`mb-4 text-sm leading-relaxed ${T.textMuted}`}>
                {cliente
                    ? vigentesCount > 1
                        ? `Se cierra solo el contrato de ${cliente}. Los demás siguen vigentes y la persona permanece en Activos.`
                        : `Este es el último contrato vigente. Al confirmar, ${nombre || 'la persona'} pasa a Bajas.`
                    : 'Se cierra el contrato seleccionado. Si queda otro vigente, la persona sigue en Activos.'}
            </p>
            {error ? (
                <div className="mb-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-300">
                    {error}
                </div>
            ) : null}
            <div className="flex flex-col gap-4">
                <div>
                    <label className={labelCls}>Motivo de baja *</label>
                    <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className={inputCls} disabled={saving}>
                        <option value="">Selecciona un motivo…</option>
                        {motivos.map((m) => (
                            <option key={m} value={m}>
                                {m}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={labelCls}>Fecha de término *</label>
                    <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={inputCls} disabled={saving} />
                </div>
                <div>
                    <label className={labelCls}>Observaciones</label>
                    <textarea
                        value={observaciones}
                        onChange={(e) => setObservaciones(e.target.value)}
                        rows={3}
                        className={`${inputCls} min-h-[80px] resize-y`}
                        placeholder="Detalle opcional de la baja…"
                        disabled={saving}
                    />
                </div>
            </div>
        </MonitorGlassModalShell>
    );
}
