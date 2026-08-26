import { useMemo } from 'react';
import {
    CO_CONSULTOR_SECTIONS,
    CO_TABS,
    getFieldMeta
} from '../constants/colaboradoresConsultorFields.js';
import {
    currencyNarrowSymbol,
    formatMoneyAmountOnly,
    parseMoneyInput
} from '../multiCurrencyMoney.js';
import { nativeCalendarOnlyInputProps } from '../nativeCalendarOnlyInputProps.js';
import { useModuleTheme } from '../moduleTheme.js';

/**
 * Componente presentacional puro con el formulario completo de ficha de colaborador
 * (bloque maestro + 8 secciones extendidas). Reutilizable por Directorio y Onboarding.
 *
 * Props:
 *  - value: objeto de formulario (forma de `initialStaffForm()`).
 *  - onChange(patch): el padre mergea el patch parcial en su estado.
 *  - mode: 'create' | 'edit' — controla si `cedula` queda bloqueada y `required`.
 *  - readOnly: si true, todos los inputs/selects/textareas quedan deshabilitados.
 *  - clientes: array de strings con nombres de cliente para el `<select>` maestro.
 *  - liderOptions: array de strings con líderes filtrados por el cliente seleccionado.
 *  - liderLoading: bool, si está cargando los líderes (para deshabilitar el select).
 *  - onClienteChange(nuevoCliente): callback para que el padre dispare la carga de líderes.
 *  - activeTabId: opcional. Si se pasa un id válido de CO_TABS, renderiza solo las
 *    secciones de esa pestaña (y el bloque maestro solo si tab.masterFields === true).
 *    Si no se pasa (o no encuentra la tab), se mantiene el render completo en columna.
 */
/** Campos derivados (concat Excel); no editables si hay desglose de emergencia. */
const COMPUTED_READONLY_KEYS = new Set(['primer_contacto_familiar', 'segundo_contacto_familiar']);

export default function ColaboradorFichaFields({
    value,
    onChange,
    mode = 'edit',
    readOnly = false,
    clientes = [],
    lockCliente = false,
    liderOptions = [],
    liderLoading = false,
    onClienteChange,
    activeTabId,
    /** AUT-312: cédula/nombre/correo ya van en el header; no repetir en vista/edición. */
    hideIdentityFields = false
}) {
    const mt = useModuleTheme();
    const { field, labelMuted } = mt;

    const coForm = value || {};
    const set = (patch) => {
        if (typeof onChange === 'function') onChange(patch);
    };

    const activeTab = useMemo(
        () => (activeTabId ? CO_TABS.find((t) => t.id === activeTabId) || null : null),
        [activeTabId]
    );

    const sections = useMemo(() => {
        if (!activeTab) return CO_CONSULTOR_SECTIONS;
        const allowed = new Set(activeTab.sectionTitles || []);
        return CO_CONSULTOR_SECTIONS.filter((sec) => allowed.has(sec.title));
    }, [activeTab]);

    const showMaster = activeTab ? activeTab.masterFields === true : true;
    const showExtendedHeader = sections.length > 0;
    const clienteSelectOptions = useMemo(() => {
        const list = (Array.isArray(clientes) ? clientes : []).map((c) => String(c || '').trim()).filter(Boolean);
        const cur = String(coForm.cliente || '').trim();
        if (cur && !list.some((c) => c.toLocaleLowerCase('es') === cur.toLocaleLowerCase('es'))) {
            return [cur, ...list];
        }
        return list;
    }, [clientes, coForm.cliente]);

    return (
        <div className="space-y-4">
            {showMaster ? (
                <div className="grid gap-3 sm:grid-cols-2">
                    {hideIdentityFields ? null : (
                        <>
                    <div>
                        <label className={`block text-xs ${labelMuted} mb-1`}>Cédula (solo dígitos)</label>
                        <input
                            className={`w-full ${field} disabled:opacity-50`}
                            value={coForm.cedula || ''}
                            onChange={(e) => set({ cedula: e.target.value })}
                            disabled={mode === 'edit' || readOnly}
                            required={mode === 'create' && !readOnly}
                        />
                    </div>
                    <div className="sm:col-span-2">
                        <label className={`block text-xs ${labelMuted} mb-1`}>Nombres y Apellidos</label>
                        <input
                            className={`w-full ${field}`}
                            value={coForm.nombre || ''}
                            onChange={(e) => set({ nombre: e.target.value })}
                            disabled={readOnly}
                            required={!readOnly}
                        />
                    </div>
                    <div className="sm:col-span-2">
                        <label className={`block text-xs ${labelMuted} mb-1`}>Correo Cinte</label>
                        <input
                            className={`w-full ${field}`}
                            value={coForm.correo_cinte || ''}
                            onChange={(e) => set({ correo_cinte: e.target.value })}
                            disabled={readOnly}
                        />
                    </div>
                        </>
                    )}
                    <div>
                        <label className={`block text-xs ${labelMuted} mb-1`}>
                            {lockCliente ? 'Cliente' : 'Cliente (cabecera)'}
                        </label>
                        <select
                            className={`w-full ${field}`}
                            value={coForm.cliente || ''}
                            onChange={(e) => {
                                const v = e.target.value;
                                if (lockCliente) return;
                                set({ cliente: v, lider_catalogo: '' });
                                if (typeof onClienteChange === 'function') onClienteChange(v);
                            }}
                            disabled={readOnly || lockCliente}
                        >
                            <option value="">— Seleccionar —</option>
                            {clienteSelectOptions.map((c) => (
                                <option key={c} value={c}>
                                    {c}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className={`block text-xs ${labelMuted} mb-1`}>Líder</label>
                        <select
                            className={`w-full ${field}`}
                            value={coForm.lider_catalogo || ''}
                            onChange={(e) => set({ lider_catalogo: e.target.value })}
                            disabled={readOnly || !coForm.cliente || liderLoading}
                        >
                            <option value="">
                                {!coForm.cliente
                                    ? 'Elige un cliente primero'
                                    : liderLoading
                                      ? 'Cargando…'
                                      : '— Seleccionar —'}
                            </option>
                            {liderOptions.map((l) => (
                                <option key={l} value={l}>
                                    {l}
                                </option>
                            ))}
                        </select>
                    </div>
                    <p className={`text-xs ${labelMuted} sm:col-span-2`}>
                        El GP se toma automáticamente del par cliente–líder en el catálogo (si está definido).
                    </p>
                </div>
            ) : null}

            <div
                className={`space-y-6 ${
                    showMaster && showExtendedHeader
                        ? 'border-t border-[var(--border)] pt-4 mt-4'
                        : ''
                }`}
            >
                {showMaster && showExtendedHeader ? (
                    <p className="text-sm font-semibold text-[var(--text)]">Ficha extendida</p>
                ) : null}
                {sections.map((sec) => (
                    <div key={sec.title} className="space-y-3">
                        <h3 className={`text-xs font-bold uppercase tracking-wide ${labelMuted}`}>
                            {sec.title}
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {sec.keys.map((key) => {
                                const meta = getFieldMeta(key);
                                if (!meta) return null;
                                const val = coForm[key] ?? '';
                                const cellWide = meta.kind === 'textarea' ? 'sm:col-span-2' : '';
                                const fieldDisabled = readOnly || COMPUTED_READONLY_KEYS.has(key);
                                let control;
                                if (meta.kind === 'bool') {
                                    control = (
                                        <select
                                            className={`w-full ${field}`}
                                            value={val}
                                            onChange={(e) => set({ [key]: e.target.value })}
                                            disabled={fieldDisabled}
                                        >
                                            <option value="">Sin especificar</option>
                                            <option value="true">Sí</option>
                                            <option value="false">No</option>
                                        </select>
                                    );
                                } else if (meta.kind === 'date') {
                                    control = (
                                        <input
                                            {...nativeCalendarOnlyInputProps}
                                            type="date"
                                            className={`w-full ${field}`}
                                            value={val}
                                            onChange={(e) => set({ [key]: e.target.value })}
                                            disabled={fieldDisabled}
                                        />
                                    );
                                } else if (meta.kind === 'money') {
                                    const ccy = coForm.montos_divisa?.[key] || 'COP';
                                    const sym = currencyNarrowSymbol(ccy);
                                    control = (
                                        <div className="flex flex-wrap gap-2 items-center">
                                            <select
                                                className={`w-[4.75rem] shrink-0 rounded-md border px-2 py-2 text-sm ${field}`}
                                                value={ccy}
                                                onChange={(e) => {
                                                    const next = e.target.value;
                                                    const prevCcy =
                                                        coForm.montos_divisa?.[key] || 'COP';
                                                    const rawVal = coForm[key];
                                                    const n = parseMoneyInput(rawVal, prevCcy);
                                                    const nextMd = {
                                                        ...(coForm.montos_divisa || {}),
                                                        [key]: next
                                                    };
                                                    if (n != null && Number.isFinite(n)) {
                                                        set({
                                                            montos_divisa: nextMd,
                                                            [key]: formatMoneyAmountOnly(n, next)
                                                        });
                                                    } else {
                                                        set({ montos_divisa: nextMd });
                                                    }
                                                }}
                                                disabled={fieldDisabled}
                                            >
                                                <option value="COP">COP</option>
                                                <option value="CLP">CLP</option>
                                                <option value="USD">USD</option>
                                            </select>
                                            <span
                                                className={`text-sm tabular-nums shrink-0 ${labelMuted}`}
                                                title={ccy}
                                            >
                                                {sym}
                                            </span>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                className={`min-w-0 flex-1 rounded-md border px-3 py-2 ${field}`}
                                                value={val}
                                                onChange={(e) => set({ [key]: e.target.value })}
                                                onBlur={(e) => {
                                                    const rawBlur = e.target.value;
                                                    const cur =
                                                        coForm.montos_divisa?.[key] || 'COP';
                                                    const n = parseMoneyInput(rawBlur, cur);
                                                    if (n == null || !Number.isFinite(n)) {
                                                        set({ [key]: '' });
                                                    } else {
                                                        set({
                                                            [key]: formatMoneyAmountOnly(n, cur)
                                                        });
                                                    }
                                                }}
                                                disabled={fieldDisabled}
                                            />
                                        </div>
                                    );
                                } else if (meta.kind === 'number' || meta.kind === 'int') {
                                    control = (
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            className={`w-full ${field}`}
                                            value={val}
                                            onChange={(e) => set({ [key]: e.target.value })}
                                            disabled={fieldDisabled}
                                        />
                                    );
                                } else if (meta.kind === 'textarea') {
                                    control = (
                                        <textarea
                                            rows={3}
                                            className={`w-full ${field}`}
                                            value={val}
                                            onChange={(e) => set({ [key]: e.target.value })}
                                            disabled={fieldDisabled}
                                        />
                                    );
                                } else {
                                    control = (
                                        <input
                                            type="text"
                                            className={`w-full ${field}`}
                                            value={val}
                                            onChange={(e) => set({ [key]: e.target.value })}
                                            disabled={fieldDisabled}
                                        />
                                    );
                                }
                                return (
                                    <div key={key} className={cellWide}>
                                        <label className={`block text-xs ${labelMuted} mb-1`}>
                                            {meta.label}
                                        </label>
                                        {control}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
