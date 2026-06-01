import { useModuleTheme } from '../../moduleTheme.js';
import { normalizeStatus } from '../hooks/useMonitorData';
import MonitorGlassModalShell from '../../shared/modals/MonitorGlassModalShell.jsx';
import { buildMonitorGlassModalTheme } from '../../shared/modals/monitorGlassModalTheme.js';

/** Si VITE_MASK_SENSITIVE_UI=true, enmascara email/tel/salario en pantalla (mismo modelo de datos). */
function formatDetailDisplay(key, value) {
    const mask = import.meta.env.VITE_MASK_SENSITIVE_UI === 'true';
    const raw = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
    if (!mask) return raw;
    const lk = String(key).toLowerCase();
    if (lk.includes('email')) {
        const at = raw.indexOf('@');
        if (at <= 1) return '••••';
        return `${raw[0]}•••••${raw.slice(at)}`;
    }
    if (lk.includes('telefono') || lk.includes('whatsapp') || lk.includes('celular') || lk.includes('phone') || lk.includes('numerico')) {
        const d = raw.replace(/\D/g, '');
        if (d.length < 4) return '••••';
        return `••••${d.slice(-4)}`;
    }
    if (lk.includes('salario') || lk.includes('direccion') || lk.includes('dirección')) return '••••';
    return raw;
}

export default function CandidateModal({ selectedUser, onClose }) {
    const { isLight } = useModuleTheme();
    const T = buildMonitorGlassModalTheme(isLight);

    if (!selectedUser) return null;

    const obsElim = selectedUser.fullData?.obs_eliminado;
    const isEliminado = normalizeStatus(selectedUser.realStatus) === 'eliminado' || Boolean(obsElim);
    const fullData = selectedUser.fullData || {};

    const extractField = (keywords) => {
        const key = Object.keys(fullData).find((k) => keywords.some((kw) => k.toLowerCase().includes(kw)));
        return key ? { key, value: fullData[key] } : null;
    };

    const mainEmail = extractField(['email', 'correo']);
    const mainPhone = extractField(['whatsapp_numerico', 'whatsapp', 'telefono', 'celular']);
    const mainRole = extractField(['puesto', 'cargo', 'rol']);
    const mainName =
        extractField(['nombre_y_apellido', 'nombre y apellido', 'nombre'])?.value || selectedUser.workflowName;

    const excludeKeys = [
        mainEmail?.key,
        mainPhone?.key,
        mainRole?.key,
        'obs_eliminado',
        'nombre_y_apellido',
        'nombre y apellido'
    ].filter(Boolean);

    const detailEntries = Object.entries(fullData).filter(([k]) => !excludeKeys.includes(k));

    const dotColor =
        selectedUser.realStatus === 'finalizado'
            ? '#4f8831'
            : selectedUser.realStatus === 'contactado'
              ? '#004D87'
              : '#f59e0b';

    const statusLabel = selectedUser.realStatus || 'Sin Estado';

    const hero = (
        <>
            <div className="flex min-w-fit items-center gap-3">
                <div className="relative flex h-3.5 w-3.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75" style={{ backgroundColor: dotColor }} />
                    <span className="relative inline-flex h-3.5 w-3.5 rounded-full" style={{ backgroundColor: dotColor }} />
                </div>
                <span
                    className={`text-[11px] font-bold uppercase tracking-widest ${
                        selectedUser.realStatus === 'finalizado'
                            ? 'text-[#4f8831]'
                            : selectedUser.realStatus === 'contactado'
                              ? isLight
                                  ? 'text-[#004D87]'
                                  : 'text-[#65BCF7]'
                              : isLight
                                ? 'text-[#f59e0b]'
                                : 'text-[#f59e0b]'
                    }`}
                >
                    {statusLabel}
                </span>
            </div>
            <div className={`hidden h-6 w-px sm:block ${isLight ? 'bg-slate-300' : 'bg-slate-700'}`} />
            <div className="flex flex-1 flex-wrap gap-4">
                {mainRole ? (
                    <div className={`flex items-center gap-2 text-sm font-medium ${T.textCls}`}>
                        <svg className="h-4 w-4 text-[var(--color-cinte-turquesa)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        {mainRole.value}
                    </div>
                ) : null}
                {mainEmail ? (
                    <div className={`flex items-center gap-2 text-sm ${T.textMuted}`}>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        {formatDetailDisplay(mainEmail.key, mainEmail.value)}
                    </div>
                ) : null}
                {mainPhone ? (
                    <div className={`flex items-center gap-2 text-sm ${T.textMuted}`}>
                        <svg className="h-4 w-4 text-[var(--color-cinte-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        {formatDetailDisplay(mainPhone.key, mainPhone.value)}
                    </div>
                ) : null}
            </div>
        </>
    );

    return (
        <MonitorGlassModalShell
            open
            onClose={onClose}
            title={mainName}
            subtitle={`ID: ${selectedUser.executionId}`}
            avatarLetter={mainName}
            hero={hero}
        >
            {isEliminado && obsElim ? (
                <div className="mb-6 flex items-start gap-3 rounded-xl border border-[var(--color-cinte-red)]/40 bg-[var(--color-cinte-red)]/10 p-4">
                    <svg className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-cinte-red)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-cinte-red)]">Motivo de eliminación</p>
                        <p className={`mt-1 text-sm leading-relaxed ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>{obsElim}</p>
                    </div>
                </div>
            ) : null}

            <p className={`${T.labelUpperCls} mb-3`}>Toda la información adicional</p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {detailEntries.length > 0 ? (
                    detailEntries.map(([key, value]) => {
                        const isDate = key.toLowerCase().includes('ts_') || key.toLowerCase().includes('fecha');
                        return (
                            <div key={key} className={`group rounded-xl p-4 transition-all duration-300 ${T.cardCls}`}>
                                <div
                                    className={`mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${isLight ? 'text-[var(--color-cinte-turquesa)]' : 'text-[var(--color-cinte-cyan)]'}`}
                                >
                                    {key.replace(/_/g, ' ')}
                                </div>
                                <div className={`break-words text-sm font-medium leading-relaxed ${T.textCls} ${isDate ? 'font-mono text-xs' : ''}`}>
                                    {formatDetailDisplay(key, value)}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="col-span-full rounded-xl border border-dashed border-slate-500/30 p-8 text-center">
                        <p className={`text-sm italic ${T.textMuted}`}>No hay más detalles disponibles para este candidato.</p>
                    </div>
                )}
            </div>
        </MonitorGlassModalShell>
    );
}
