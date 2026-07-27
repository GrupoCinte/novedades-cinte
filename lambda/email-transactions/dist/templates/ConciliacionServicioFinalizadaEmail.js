import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components';
import { Tailwind } from '@react-email/tailwind';
import { resolveGestionPublicUrl, resolveLogoUrl } from './branding.js';
function formatCop(n) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        maximumFractionDigits: 0
    }).format(Number(n) || 0);
}
function monthLabel(anio, mes) {
    const names = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const m = Math.max(1, Math.min(12, Number(mes) || 1));
    return `${names[m - 1]} ${anio}`;
}
export function ConciliacionServicioFinalizadaEmail({ payload }) {
    const logoUrl = resolveLogoUrl();
    const actionUrl = String(payload.admin?.actionUrl || '').trim() || resolveGestionPublicUrl();
    const svc = payload.servicio;
    const tot = payload.totales;
    const ml = monthLabel(svc.anio, svc.mes);
    return (_jsxs(Html, { children: [_jsx(Head, {}), _jsxs(Preview, { children: ["Servicio ", svc.serviceName, " (", svc.cliente, ") \u2014 cierre completo ", ml] }), _jsx(Tailwind, { children: _jsx(Body, { className: "bg-slate-100 py-8 font-sans", children: _jsxs(Container, { className: "mx-auto max-w-[640px] rounded-xl border border-slate-200 bg-white p-8", children: [_jsx(Section, { className: "mb-6 text-center", children: _jsx("img", { src: logoUrl, alt: "Grupo Cinte", width: 200, style: { display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' } }) }), _jsx(Heading, { className: "m-0 text-2xl text-slate-900", children: "Conciliaci\u00F3n de servicio finalizada" }), _jsxs(Text, { className: "mb-0 mt-4 text-slate-700", children: ["Todos los consultores del servicio fueron aprobados por Finanzas para ", ml, "."] }), _jsxs(Section, { className: "mt-6 rounded-lg bg-slate-50 p-4", children: [_jsxs(Text, { className: "m-0 text-sm text-slate-700", children: [_jsx("strong", { children: "Cliente:" }), " ", svc.cliente] }), _jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Servicio:" }), " ", svc.serviceName] }), _jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Mes facturaci\u00F3n:" }), " ", ml] }), payload.approvedBy?.nombre || payload.approvedBy?.email ? (_jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Aprobado por Finanzas:" }), ' ', [payload.approvedBy?.nombre, payload.approvedBy?.email].filter(Boolean).join(' — ')] })) : null] }), _jsxs(Section, { className: "mt-4 rounded-lg border border-slate-200 p-4", children: [_jsx(Text, { className: "m-0 text-sm font-semibold text-slate-800", children: "Totales del servicio" }), _jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Tarifas:" }), " ", formatCop(tot.tarifaSum)] }), _jsxs(Text, { className: "m-0 mt-1 text-sm text-slate-700", children: [_jsx("strong", { children: "Deducci\u00F3n:" }), " ", formatCop(tot.deduccionSum)] }), _jsxs(Text, { className: "m-0 mt-1 text-sm text-slate-700", children: [_jsx("strong", { children: "Incremento:" }), " ", formatCop(tot.incrementoSum)] }), _jsxs(Text, { className: "m-0 mt-1 text-sm font-semibold text-slate-900", children: [_jsx("strong", { children: "Factura neta:" }), " ", formatCop(tot.facturaSum)] })] }), payload.consultores?.length ? (_jsxs(Section, { className: "mt-4", children: [_jsxs(Text, { className: "m-0 text-sm font-semibold text-slate-800", children: ["Consultores (", payload.consultores.length, ")"] }), payload.consultores.slice(0, 25).map((c) => (_jsxs(Text, { className: "m-0 mt-1 text-xs text-slate-600", children: [c.nombre, " \u2014 ", c.cedula, ": ", formatCop(c.facturaCop), " (", c.estado, ")"] }, `${c.cedula}-${c.nombre}`))), payload.consultores.length > 25 ? (_jsxs(Text, { className: "m-0 mt-2 text-xs text-slate-500", children: ["\u2026 y ", payload.consultores.length - 25, " consultor(es) m\u00E1s en la plataforma."] })) : null] })) : null, _jsx(Section, { className: "mt-7 text-center", children: _jsx(Button, { href: actionUrl, className: "rounded-md bg-[#004D87] px-6 py-3 text-sm font-semibold text-white", children: "Abrir conciliaci\u00F3n del servicio" }) }), _jsxs(Text, { className: "mt-4 break-all text-center text-xs text-slate-500", children: ["Si el bot\u00F3n no funciona, copia y pega este enlace: ", actionUrl] }), _jsx(Hr, { className: "my-6 border-slate-200" })] }) }) })] }));
}
