import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components';
import { Tailwind } from '@react-email/tailwind';
import { resolveGestionPublicUrl, resolveLogoUrl } from './branding.js';
function EntryDataDisplay({ entryData, entryId }) {
    return (_jsxs(Section, { className: "mt-6 rounded-lg bg-slate-50 p-4", children: [_jsxs(Text, { className: "m-0 text-sm text-slate-700", children: [_jsx("strong", { children: "ID:" }), " ", entryId] }), _jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Consultor:" }), " ", entryData.consultantName, " (", entryData.consultantEmail, ")"] }), _jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Fecha:" }), " ", entryData.date] }), _jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Descripci\u00F3n:" }), " ", entryData.description] }), _jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Cliente:" }), " ", entryData.client] }), _jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Horario:" }), " ", entryData.schedule] })] }));
}
export function AdminTimeEntryNotificationEmail({ payload }) {
    const gestionUrl = resolveGestionPublicUrl();
    const logoUrl = resolveLogoUrl();
    const actionText = {
        created: 'registrado',
        updated: 'actualizado',
        deleted: 'eliminado'
    }[payload.action];
    // ❌ ELIMINAR actionTitle (no se usa)
    return (_jsxs(Html, { children: [_jsx(Head, {}), _jsxs(Preview, { children: ["Nueva actividad ", actionText, " por ", payload.consultant.name] }), _jsx(Tailwind, { children: _jsx(Body, { className: "bg-slate-100 py-8 font-sans", children: _jsxs(Container, { className: "mx-auto max-w-[640px] rounded-xl border border-slate-200 bg-white p-8", children: [_jsx(Section, { className: "mb-6 text-center", children: _jsx("img", { src: logoUrl, alt: "Grupo Cinte", width: 200, style: { display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' } }) }), _jsxs(Heading, { className: "m-0 text-2xl text-slate-900", children: ["Nueva actividad ", actionText] }), _jsxs(Text, { className: "mb-0 mt-4 text-slate-700", children: ["El consultor ", _jsx("strong", { children: payload.consultant.name }), " ha ", actionText, " una actividad."] }), payload.action === 'created' && (_jsx(EntryDataDisplay, { entryData: {
                                    ...payload.entryData,
                                    consultantName: payload.consultant.name,
                                    consultantEmail: payload.consultant.email
                                }, entryId: payload.entryId })), payload.action === 'updated' && payload.previousData && (_jsxs(_Fragment, { children: [_jsx(Heading, { className: "m-0 mt-6 text-lg text-slate-900", children: "Cambios realizados:" }), _jsxs(Section, { className: "mt-4 rounded-lg bg-slate-50 p-4", children: [payload.previousData.date && payload.previousData.date !== payload.entryData.date && (_jsxs(Text, { className: "m-0 text-sm text-slate-700", children: [_jsx("strong", { children: "Fecha:" }), " ", payload.previousData.date, " \u2192 ", payload.entryData.date] })), payload.previousData.description && payload.previousData.description !== payload.entryData.description && (_jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Descripci\u00F3n:" }), " ", payload.previousData.description, " \u2192 ", payload.entryData.description] })), payload.previousData.client && payload.previousData.client !== payload.entryData.client && (_jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Cliente:" }), " ", payload.previousData.client, " \u2192 ", payload.entryData.client] })), payload.previousData.schedule && payload.previousData.schedule !== payload.entryData.schedule && (_jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Horario:" }), " ", payload.previousData.schedule, " \u2192 ", payload.entryData.schedule] }))] })] })), payload.action === 'deleted' && (_jsx(EntryDataDisplay, { entryData: {
                                    ...payload.entryData,
                                    consultantName: payload.consultant.name,
                                    consultantEmail: payload.consultant.email
                                }, entryId: payload.entryId })), _jsx(Section, { className: "mt-7 text-center", children: _jsx(Button, { href: gestionUrl, className: "rounded-md bg-[#004D87] px-6 py-3 text-sm font-semibold text-white", children: "Revisar en plataforma administrativa" }) }), _jsxs(Text, { className: "mt-4 break-all text-center text-xs text-slate-500", children: ["Si el bot\u00F3n no funciona, copia y pega este enlace: ", gestionUrl] }), _jsx(Hr, { className: "my-6 border-slate-200" })] }) }) })] }));
}
