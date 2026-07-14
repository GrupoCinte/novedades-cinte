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
    return (_jsxs(Html, { children: [_jsx(Head, {}), _jsxs(Preview, { children: ["Conciliaci\u00F3n ", svc.serviceName, " \u2014 ", ml] }), _jsx(Tailwind, { children: _jsx(Body, { className: "bg-slate-100 py-8 font-sans", children: _jsxs(Container, { className: "mx-auto max-w-[720px] rounded-xl border border-slate-200 bg-white p-8", children: [_jsx(Section, { className: "mb-6 text-center", children: _jsx("img", { src: logoUrl, alt: "Grupo Cinte", width: 200, style: { display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' } }) }), _jsxs(Text, { className: "m-0 text-sm text-slate-500", children: ["Cliente: ", svc.cliente, " \u00B7 Servicio: ", svc.serviceName, " \u00B7 Mes: ", ml] }), _jsx(Section, { className: "mt-4", children: _jsx("div", { dangerouslySetInnerHTML: { __html: payload.introHtml || '' } }) }), _jsx(Section, { children: _jsx("div", { dangerouslySetInnerHTML: { __html: payload.tableHtml || '' } }) }), payload.actions?.approveUrl || payload.actions?.rejectUrl ? (_jsx(Section, { className: "mt-6 text-center", children: _jsx("table", { role: "presentation", cellPadding: 0, cellSpacing: 0, style: { margin: '0 auto' }, children: _jsx("tbody", { children: _jsxs("tr", { children: [payload.actions?.approveUrl ? (_jsx("td", { style: { padding: '0 8px 12px' }, children: _jsx("a", { href: payload.actions.approveUrl, style: {
                                                            display: 'inline-block',
                                                            backgroundColor: '#2F7BB8',
                                                            color: '#ffffff',
                                                            fontSize: '14px',
                                                            fontWeight: 600,
                                                            textDecoration: 'none',
                                                            padding: '12px 24px',
                                                            borderRadius: '8px'
                                                        }, children: "Aprobar conciliaci\u00F3n" }) })) : null, payload.actions?.rejectUrl ? (_jsx("td", { style: { padding: '0 8px 12px' }, children: _jsx("a", { href: payload.actions.rejectUrl, style: {
                                                            display: 'inline-block',
                                                            backgroundColor: '#ffffff',
                                                            color: '#b91c1c',
                                                            fontSize: '14px',
                                                            fontWeight: 600,
                                                            textDecoration: 'none',
                                                            padding: '11px 23px',
                                                            borderRadius: '8px',
                                                            border: '1px solid #fecaca'
                                                        }, children: "Rechazar y solicitar correcci\u00F3n" }) })) : null] }) }) }) })) : null, payload.cierreHtml ? (_jsx(Section, { className: "mt-4", children: _jsx("div", { dangerouslySetInnerHTML: { __html: payload.cierreHtml } }) })) : (_jsx(Text, { className: "mb-0 mt-6 text-sm text-slate-600", children: "Saludos cordiales," })), _jsx(Text, { className: "mb-0 mt-2 text-sm font-semibold text-slate-700", children: "Equipo de Conciliaciones \u2014 Grupo Cinte" }), _jsxs(Text, { className: "mb-0 mt-6 text-xs text-slate-400", children: ["Destinatario: ", recipientName] })] }) }) })] }));
}
