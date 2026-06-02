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
import { onboardingApi } from './api.js';
import { getOnboardingPermissions } from './onboardingAccess.js';
import { TipoPersonalBadge, resolveColaboradorEstado } from './onboardingBadges.jsx';

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

    const displayName = createMode ? 'Nuevo colaborador' : form.nombre || 'Ficha del colaborador';
    const displaySubtitle = createMode
        ? 'Alta manual de ficha'
        : `${form.cedula || cedula || '—'}${form.cliente ? ` · ${form.cliente}` : ''}`;

    const estadoColaborador = useMemo(
        () =>
            resolveColaboradorEstado({
                activo: esBaja ? false : true,
                motivoBaja: form.motivo_baja,
                fechaIngreso: form.fecha_ingreso
            }),
        [esBaja, form.motivo_baja, form.fecha_ingreso]
    );

    const handleLiderFetch = useCallback(async (cliente) => {
        setLiderLoading(true);
        try {
            const items = await fetchLideres(cliente);
            setLiderOptions(items);
        } finally {
            setLiderLoading(false);
        }
    }, []);

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
            setClientes(cats);
            if (mapped.cliente) {
                await handleLiderFetch(mapped.cliente);
            } else {
                setLiderOptions([]);
            }
        } catch (e) {
            const status = e?.response?.status;
            const msg = e?.response?.data?.error || e.message;
            if (status === 403) setError('No tienes permiso para ver esta ficha (fuera de scope).');
            else if (status === 404) setError('Colaborador no encontrado.');
            else setError(msg || 'Error cargando la ficha');
        } finally {
            setLoading(false);
        }
    }, [cedula, token, handleLiderFetch, createMode]);

    useEffect(() => {
        load();
    }, [load]);

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
            const payload = buildStaffColaboradorPayload(form);
            payload.nombre = String(form.nombre || '').trim();
            payload.correo_cinte = form.correo_cinte ? String(form.correo_cinte).trim().toLowerCase() : null;
            payload.cliente = form.cliente ? String(form.cliente).trim() : null;
            payload.lider_catalogo = form.lider_catalogo ? String(form.lider_catalogo).trim() : null;
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
        if (typeof onClose === 'function') onClose();
    };

    const subTabsBarCls = isLight
        ? 'mb-4 flex flex-wrap items-stretch gap-x-1 gap-y-0 border-b border-slate-200/80 px-1'
        : 'mb-4 flex flex-wrap items-stretch gap-x-1 gap-y-0 border-b border-white/10 px-1';

    const headerActions = (
        <>
            {!loading && !error && !editMode && !createMode && perms.canEditFicha ? (
                <button
                    type="button"
                    onClick={handleEdit}
                    className="inline-flex items-center justify-center rounded-lg bg-[#2F7BB8] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#004D87]"
                >
                    Editar
                </button>
            ) : null}
            {!loading && !error && !createMode && editMode && perms.canTramitarBaja && form.cedula && !esBaja ? (
                <button
                    type="button"
                    onClick={() => setBajaOpen(true)}
                    className="inline-flex items-center justify-center rounded-lg bg-rose-500/90 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-rose-500"
                >
                    Tramitar baja
                </button>
            ) : null}
        </>
    );

    const hero =
        !loading && !error && !createMode ? (
            <>
                <div className="flex min-w-fit items-center gap-3">
                    <div className="relative flex h-3.5 w-3.5">
                        <span
                            className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${estadoColaborador.ping ? 'animate-ping' : ''}`}
                            style={{ backgroundColor: estadoColaborador.dot }}
                        />
                        <span
                            className="relative inline-flex h-3.5 w-3.5 rounded-full"
                            style={{ backgroundColor: estadoColaborador.dot }}
                        />
                    </div>
                    <span
                        className={`text-[11px] font-bold uppercase tracking-widest ${isLight ? estadoColaborador.textCls.light : estadoColaborador.textCls.dark}`}
                    >
                        {estadoColaborador.label}
                    </span>
                </div>
                <div className={`hidden h-6 w-px sm:block ${isLight ? 'bg-slate-300' : 'bg-slate-700'}`} />
                <div className="flex flex-1 flex-wrap items-center gap-4">
                    {form.tipo_personal ? <TipoPersonalBadge value={form.tipo_personal} isLight={isLight} /> : null}
                    {form.puesto ? (
                        <div className={`flex items-center gap-2 text-sm font-medium ${T.textCls}`}>
                            <svg className="h-4 w-4 text-[var(--color-cinte-turquesa)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            {form.puesto}
                        </div>
                    ) : null}
                    {form.correo_cinte ? (
                        <div className={`flex items-center gap-2 text-sm ${T.textMuted}`}>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            {form.correo_cinte}
                        </div>
                    ) : null}
                </div>
            </>
        ) : null;

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
                hero={hero}
                headerActions={headerActions}
                footer={footer}
                bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6 pt-2"
            >
                {!loading && !error ? (
                    <div role="tablist" aria-label="Secciones de la ficha" className={subTabsBarCls}>
                        {CO_TABS.map((tab) => {
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
                                    className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors sm:px-4 sm:py-3 ${
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
                    ) : (
                        <ColaboradorFichaFields
                            value={form}
                            onChange={(patch) => setForm((s) => ({ ...s, ...patch }))}
                            mode={createMode ? 'create' : 'edit'}
                            readOnly={!editMode}
                            clientes={clientes}
                            liderOptions={liderOptions}
                            liderLoading={liderLoading}
                            onClienteChange={handleLiderFetch}
                            activeTabId={activeTab}
                        />
                    )}
                </form>
            </MonitorGlassModalShell>

            {bajaOpen ? (
                <BajaModal
                    auth={auth}
                    cedula={String(cedula || '').replace(/\D+/g, '')}
                    nombre={form.nombre}
                    onClose={() => setBajaOpen(false)}
                    onConfirmed={handleBajaConfirmada}
                />
            ) : null}
        </>
    );
}

function BajaModal({ auth, cedula, nombre, onClose, onConfirmed }) {
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
        if (!motivo) {
            setError('Selecciona un motivo de baja.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const body = { motivo_baja: motivo };
            if (fecha) body.fecha_termino = fecha;
            if (observaciones.trim()) body.observaciones = observaciones.trim();
            const r = await onboardingApi.marcarBaja(token, cedula, body);
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
                disabled={saving || !motivo}
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
            title="Tramitar baja"
            subtitle={`${cedula}${nombre ? ` · ${nombre}` : ''}`}
            avatarLetter={nombre || cedula}
            footer={footer}
            bodyClassName="px-6 pb-2 pt-2"
        >
            <p className={`mb-4 text-sm leading-relaxed ${T.textMuted}`}>
                Registra el motivo legal de la baja. La ficha pasará a estado inactivo.
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
                    <label className={labelCls}>Fecha de baja</label>
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
