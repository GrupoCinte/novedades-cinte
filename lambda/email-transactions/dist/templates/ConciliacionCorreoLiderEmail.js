import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Body, Container, Head, Html, Preview, Section, Text } from '@react-email/components';
import { Tailwind } from '@react-email/tailwind';
import { resolveLogoUrl } from './branding.js';
function monthLabel(anio, mes) {
    const names = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const m = Math.max(1, Math.min(12, Number(mes) || 1));
    return `${names[m - 1]} ${anio}`;
}
export function ConciliacionCorreoLiderEmail({ payload }) {
    const logoUrl = resolveLogoUrl();
    const svc = payload.servicio;
    const ml = monthLabel(svc.anio, svc.mes);
    const recipientName = payload.recipient?.name || 'Líder';
    const viewUrl = payload.actions?.viewUrl;
    const plazoLabel = payload.plazoLabel || (payload.ttlHours ? `${payload.ttlHours} horas` : null);
    return (_jsxs(Html, { children: [_jsx(Head, {}), _jsxs(Preview, { children: ["Conciliaci\u00F3n ", svc.serviceName, " \u2014 ", ml] }), _jsx(Tailwind, { children: _jsx(Body, { className: "bg-slate-100 py-8 font-sans", children: _jsxs(Container, { className: "mx-auto max-w-[720px] rounded-xl border border-slate-200 bg-white p-8", children: [_jsx(Section, { className: "mb-6 text-center", children: _jsx("img", { src: logoUrl, alt: "Grupo Cinte", width: 200, style: { display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' } }) }), _jsxs(Text, { className: "m-0 text-sm text-slate-500", children: ["Cliente: ", svc.cliente, " \u00B7 Servicio: ", svc.serviceName, " \u00B7 Mes: ", ml] }), _jsx(Section, { className: "mt-4", children: _jsx("div", { dangerouslySetInnerHTML: { __html: payload.introHtml || '' } }) }), _jsx(Section, { children: _jsx("div", { dangerouslySetInnerHTML: { __html: payload.tableHtml || '' } }) }), viewUrl ? (_jsxs(Section, { className: "mt-6 text-center", children: [_jsx("a", { href: viewUrl, style: {
                                            display: 'inline-block',
                                            backgroundColor: '#2F7BB8',
                                            color: '#ffffff',
                                            fontSize: '14px',
                                            fontWeight: 600,
                                            textDecoration: 'none',
                                            padding: '12px 24px',
                                            borderRadius: '8px'
                                        }, children: "Visualizar la conciliaci\u00F3n" }), plazoLabel ? (_jsxs(Text, { className: "mb-0 mt-4 text-sm text-slate-600", children: ["Tienes ", plazoLabel, " para revisar y decidir. Tras ese plazo el enlace caduca."] })) : null] })) : null, payload.cierreHtml ? (_jsx(Section, { className: "mt-4", children: _jsx("div", { dangerouslySetInnerHTML: { __html: payload.cierreHtml } }) })) : (_jsx(Text, { className: "mb-0 mt-6 text-sm text-slate-600", children: "Saludos cordiales," })), _jsx(Text, { className: "mb-0 mt-2 text-sm font-semibold text-slate-700", children: "Equipo de Conciliaciones \u2014 Grupo Cinte" }), _jsxs(Text, { className: "mb-0 mt-6 text-xs text-slate-400", children: ["Destinatario: ", recipientName] })] }) }) })] }));
}
