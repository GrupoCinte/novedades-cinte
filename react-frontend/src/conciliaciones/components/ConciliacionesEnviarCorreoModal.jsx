import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, ShieldAlert, X } from 'lucide-react';
import { buildGestionTableDash } from '../../gestionTableDashTheme.js';
import { CINTE_BTN_PRIMARY } from '../conciliacionesLayout.js';
import {
    CONCILIACION_EMAIL_COLUMNS,
    applyTemplateVars,
    buildPreviewTableHtml,
    getDefaultSelectedColumnKeys,
    monthLabelLong
} from '../conciliacionEmailColumns.js';
import {
    fetchConciliacionEmailPlantilla,
    postEnviarConciliacionCorreo,
    putConciliacionEmailPlantilla
} from '../conciliacionesApi.js';

function pickDefaultLiderNombre(rows) {
    for (const row of Array.isArray(rows) ? rows : []) {
        const name = String(row?.lider || '').trim();
        if (name) return name;
    }
    return '';
}

export default function ConciliacionesEnviarCorreoModal({
    open,
    onClose,
    onSent,
    token,
    item,
    consultorRows = [],
    year,
    month,
    saving = false,
    setSaving,
    isLight
}) {
    const dash = useMemo(() => buildGestionTableDash(isLight), [isLight]);
    const [loadingPlantilla, setLoadingPlantilla] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [destEmail, setDestEmail] = useState('');
    const [destNombre, setDestNombre] = useState('');
    const [asunto, setAsunto] = useState('');
    const [introText, setIntroText] = useState('');
    const [cierreText, setCierreText] = useState('');
    const [columnas, setColumnas] = useState(() => getDefaultSelectedColumnKeys());
    const [guardarPlantilla, setGuardarPlantilla] = useState(false);

    const mesLabel = useMemo(() => monthLabelLong(year, month), [year, month]);
    const templateVars = useMemo(
        () => ({
            nombreLider: destNombre || 'Líder',
            servicio: item?.serviceName || item?.servicioId || '',
            cliente: item?.client || '',
            mes: mesLabel
        }),
        [destNombre, item, mesLabel]
    );

    const previewHtml = useMemo(
        () => buildPreviewTableHtml(consultorRows, columnas),
        [consultorRows, columnas]
    );

    useEffect(() => {
        if (!open) return;
        setErrorMsg('');
        setDestNombre(pickDefaultLiderNombre(consultorRows));
        setDestEmail('');
        setGuardarPlantilla(false);

        let cancelled = false;
        (async () => {
            setLoadingPlantilla(true);
            try {
                const plantilla = await fetchConciliacionEmailPlantilla(token);
                if (cancelled) return;
                const vars = {
                    nombreLider: pickDefaultLiderNombre(consultorRows) || 'Líder',
                    servicio: item?.serviceName || item?.servicioId || '',
                    cliente: item?.client || '',
                    mes: monthLabelLong(year, month)
                };
                setAsunto(applyTemplateVars(plantilla.asuntoTemplate, vars));
                setIntroText(applyTemplateVars(plantilla.introTemplate, vars));
                setCierreText(applyTemplateVars(plantilla.cierreTemplate || '', vars));
                setColumnas(
                    Array.isArray(plantilla.columnasDefault) && plantilla.columnasDefault.length
                        ? plantilla.columnasDefault
                        : getDefaultSelectedColumnKeys()
                );
            } catch (e) {
                if (!cancelled) setErrorMsg(e.message || 'No se pudo cargar la plantilla');
            } finally {
                if (!cancelled) setLoadingPlantilla(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [open, token, consultorRows, item, year, month]);

    const toggleColumna = useCallback((key) => {
        setColumnas((prev) => {
            const set = new Set(prev);
            if (set.has(key)) {
                set.delete(key);
            } else {
                set.add(key);
            }
            return CONCILIACION_EMAIL_COLUMNS.map((c) => c.key).filter((k) => set.has(k));
        });
    }, []);

    if (!open) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setErrorMsg('');
        const email = String(destEmail || '').trim();
        if (!email.includes('@')) {
            setErrorMsg('Indique un correo válido para el destinatario');
            return;
        }
        if (!columnas.length) {
            setErrorMsg('Seleccione al menos una columna para la tabla');
            return;
        }

        setSaving?.(true);
        try {
            if (guardarPlantilla) {
                await putConciliacionEmailPlantilla(token, {
                    asuntoTemplate: asunto,
                    introTemplate: introText,
                    cierreTemplate: cierreText,
                    columnasDefault: columnas
                });
            }

            const result = await postEnviarConciliacionCorreo(token, {
                servicioId: item?.servicioId || item?.id,
                anio: year,
                mes: month,
                destinatario: { nombre: destNombre.trim(), email },
                asunto,
                introText,
                cierreText,
                columnas
            });

            await onSent?.(result);
            onClose?.();
        } catch (err) {
            setErrorMsg(err.message || 'No se pudo enviar el correo');
        } finally {
            setSaving?.(false);
        }
    };

    const inputCls = isLight ? 'field-control bg-white text-slate-900' : 'field-control';

    return (
        <div className={dash.modalBackdrop} role="dialog" aria-modal="true" aria-labelledby="modal-correo-title">
            <button type="button" className="modal-glass-scrim absolute inset-0" aria-label="Cerrar" onClick={onClose} />
            <div className={`${dash.modalCardWide} max-w-3xl font-body`}>
                <div className={dash.modalHeadBorder}>
                    <div>
                        <h2 id="modal-correo-title" className={`font-heading ${dash.title2xl} flex items-center gap-2`}>
                            <Mail size={20} className="text-[#65BCF7]" />
                            Enviar conciliación por correo
                        </h2>
                        <p className={`mt-0.5 text-xs ${dash.modalMuted}`}>
                            {item?.serviceName} · {mesLabel}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className={dash.modalClose} aria-label="Cerrar">
                        <X size={18} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                    <div className={`${dash.modalBodyScroll} space-y-4 px-1 pb-1`}>
                        {errorMsg ? (
                            <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-900/30 p-3 text-sm text-red-400">
                                <ShieldAlert size={16} />
                                {errorMsg}
                            </div>
                        ) : null}

                        {loadingPlantilla ? (
                            <p className={`text-sm ${dash.modalMuted}`}>Cargando plantilla…</p>
                        ) : null}

                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="flex flex-col gap-1 text-xs font-bold">
                                Nombre del líder
                                <input
                                    type="text"
                                    value={destNombre}
                                    onChange={(e) => setDestNombre(e.target.value)}
                                    className={`rounded-lg border px-3 py-2 text-sm ${inputCls}`}
                                />
                            </label>
                            <label className="flex flex-col gap-1 text-xs font-bold">
                                Correo destinatario <span className="text-red-500">*</span>
                                <input
                                    type="email"
                                    required
                                    value={destEmail}
                                    onChange={(e) => setDestEmail(e.target.value)}
                                    placeholder="correo@cliente.com"
                                    className={`rounded-lg border px-3 py-2 text-sm ${inputCls}`}
                                />
                            </label>
                        </div>

                        <label className="flex flex-col gap-1 text-xs font-bold">
                            Asunto
                            <input
                                type="text"
                                value={asunto}
                                onChange={(e) => setAsunto(e.target.value)}
                                className={`rounded-lg border px-3 py-2 text-sm ${inputCls}`}
                            />
                        </label>

                        <label className="flex flex-col gap-1 text-xs font-bold">
                            Mensaje introductorio
                            <textarea
                                rows={4}
                                value={introText}
                                onChange={(e) => setIntroText(e.target.value)}
                                className={`resize-y rounded-lg border px-3 py-2 text-sm ${inputCls}`}
                            />
                        </label>

                        <div>
                            <p className="mb-2 text-xs font-bold">Columnas en la tabla</p>
                            <div className="flex flex-wrap gap-2">
                                {CONCILIACION_EMAIL_COLUMNS.map((col) => {
                                    const checked = columnas.includes(col.key);
                                    return (
                                        <label
                                            key={col.key}
                                            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                                                checked
                                                    ? 'border-[#2F7BB8]/40 bg-[#2F7BB8]/10 text-[#004D87]'
                                                    : isLight
                                                      ? 'border-slate-200 text-slate-600'
                                                      : 'border-slate-600/40 text-slate-300'
                                            }`}
                                        >
                                            <input
                                                type="checkbox"
                                                className="sr-only"
                                                checked={checked}
                                                onChange={() => toggleColumna(col.key)}
                                            />
                                            {col.label}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div
                            className={`overflow-x-auto rounded-lg border p-3 ${isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-700/50 bg-slate-900/40'}`}
                        >
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                Vista previa tabla
                            </p>
                            {previewHtml ? (
                                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
                            ) : (
                                <p className="text-xs text-slate-500">Seleccione columnas para previsualizar.</p>
                            )}
                        </div>

                        <label className="flex flex-col gap-1 text-xs font-bold">
                            Cierre / firma
                            <textarea
                                rows={3}
                                value={cierreText}
                                onChange={(e) => setCierreText(e.target.value)}
                                className={`resize-y rounded-lg border px-3 py-2 text-sm ${inputCls}`}
                            />
                        </label>

                        <label className="flex cursor-pointer items-center gap-2 text-xs">
                            <input
                                type="checkbox"
                                checked={guardarPlantilla}
                                onChange={(e) => setGuardarPlantilla(e.target.checked)}
                            />
                            Guardar textos y columnas como plantilla predeterminada del equipo
                        </label>
                    </div>

                    <div className={`${dash.modalFooter} px-1`}>
                        <button type="button" onClick={onClose} className={dash.borrarFiltros}>
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || loadingPlantilla}
                            className={`${CINTE_BTN_PRIMARY} inline-flex items-center gap-1.5 disabled:opacity-50`}
                        >
                            <Mail size={14} />
                            {saving ? 'Enviando…' : 'Enviar correo'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
