import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Body, Container, Head, Html, Preview, Section, Text } from '@react-email/components';
import { Tailwind } from '@react-email/tailwind';
import { resolveLogoUrl } from './branding.js';
function monthLabel(anio, mes) {
    const names = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const m = Math.max(1, Math.min(12, Number(mes) || 1));
    return `${names[m - 1]} ${anio}`;
}
function kindTitle(kind) {
    if (kind === 'enviada')
        return 'Correo de conciliación enviado al líder';
    if (kind === 'aprobada')
        return 'Conciliación aprobada por el líder';
    if (kind === 'rechazada')
        return 'Conciliación rechazada por el líder';
    if (kind === 'parcial')
        return 'Conciliación cerrada con aprobaciones y rechazos';
    return 'Aviso de conciliación';
}
export function ConciliacionStakeholdersAvisoEmail({ payload }) {
    const logoUrl = resolveLogoUrl();
    const svc = payload.servicio;
    const ml = monthLabel(svc.anio, svc.mes);
    const title = kindTitle(payload.kind);
    return (_jsxs(Html, { children: [_jsx(Head, {}), _jsxs(Preview, { children: [title, " \u2014 ", svc.cliente] }), _jsx(Tailwind, { children: _jsx(Body, { className: "bg-slate-100 py-8 font-sans", children: _jsxs(Container, { className: "mx-auto max-w-[640px] rounded-xl border border-slate-200 bg-white p-8", children: [_jsx(Section, { className: "mb-6 text-center", children: _jsx("img", { src: logoUrl, alt: "Grupo Cinte", width: 180, style: { display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' } }) }), _jsx(Text, { className: "m-0 text-lg font-semibold text-slate-800", children: title }), _jsxs(Text, { className: "mt-3 text-sm text-slate-600", children: ["Cliente: ", _jsx("strong", { children: svc.cliente }), _jsx("br", {}), "Servicio: ", _jsx("strong", { children: svc.serviceName }), _jsx("br", {}), "Periodo: ", _jsx("strong", { children: ml })] }), payload.lider?.email ? (_jsxs(Text, { className: "mt-3 text-sm text-slate-600", children: ["L\u00EDder: ", payload.lider.nombre || payload.lider.email, " (", payload.lider.email, ")"] })) : null, payload.kind !== 'enviada' ? (_jsxs(Text, { className: "mt-3 text-sm text-slate-600", children: ["Aprobados: ", payload.resumen?.aprobados ?? 0, " \u00B7 Rechazados: ", payload.resumen?.rechazados ?? 0] })) : null, payload.admin?.actionUrl ? (_jsx(Section, { className: "mt-6 text-center", children: _jsx("a", { href: payload.admin.actionUrl, style: {
                                        display: 'inline-block',
                                        backgroundColor: '#2F7BB8',
                                        color: '#ffffff',
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        textDecoration: 'none',
                                        padding: '10px 20px',
                                        borderRadius: '8px'
                                    }, children: "Abrir conciliaci\u00F3n" }) })) : null, _jsx(Text, { className: "mb-0 mt-8 text-xs text-slate-400", children: "Equipo de Conciliaciones \u2014 Grupo Cinte" })] }) }) })] }));
}
