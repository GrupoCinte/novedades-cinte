import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Body, Container, Head, Heading, Hr, Html, Preview, Section, Text } from '@react-email/components';
import { Tailwind } from '@react-email/tailwind';
import { resolveLogoUrl } from './branding.js';
// ===== COMPONENTE REUTILIZABLE =====
function EntryDataDisplay({ entryData, entryId }) {
    return (_jsxs(Section, { className: "mt-6 rounded-lg bg-slate-50 p-4", children: [_jsxs(Text, { className: "m-0 text-sm text-slate-700", children: [_jsx("strong", { children: "ID:" }), " ", entryId] }), _jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Fecha:" }), " ", entryData.date] }), _jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Descripci\u00F3n:" }), " ", entryData.description] }), _jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Cliente:" }), " ", entryData.client] }), _jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Horario:" }), " ", entryData.schedule] })] }));
}
export function TimeEntryConfirmationEmail({ payload }) {
    const logoUrl = resolveLogoUrl();
    const actionMap = {
        created: 'creada',
        updated: 'actualizada',
        deleted: 'eliminada'
    };
    const actionTitleMap = {
        created: 'Creada',
        updated: 'Actualizada',
        deleted: 'Eliminada'
    };
    const actionText = actionMap[payload.action];
    const actionTitle = actionTitleMap[payload.action];
    return (_jsxs(Html, { children: [_jsx(Head, {}), _jsxs(Preview, { children: ["Confirmaci\u00F3n: entrada ", actionText] }), _jsx(Tailwind, { children: _jsx(Body, { className: "bg-slate-100 py-8 font-sans", children: _jsxs(Container, { className: "mx-auto max-w-[600px] rounded-xl border border-slate-200 bg-white p-8", children: [_jsx(Section, { className: "mb-6 text-center", children: _jsx("img", { src: logoUrl, alt: "Grupo Cinte", width: 200, style: { display: 'block', margin: '0 auto', maxWidth: '100%', height: 'auto' } }) }), _jsxs(Heading, { className: "m-0 text-2xl text-slate-900", children: ["Confirmaci\u00F3n: Entrada ", actionTitle] }), _jsxs(Text, { className: "mb-0 mt-4 text-slate-700", children: ["Hola ", payload.consultant.name || 'consultor', ","] }), _jsxs(Text, { className: "mt-2 text-slate-700", children: ["Tu entrada de tiempo ha sido ", _jsx("strong", { children: actionText }), " correctamente."] }), payload.action === 'created' && (_jsx(EntryDataDisplay, { entryData: payload.entryData, entryId: payload.entryId })), payload.action === 'updated' && payload.previousData && (_jsxs(_Fragment, { children: [_jsx(Heading, { className: "m-0 mt-6 text-lg text-slate-900", children: "Cambios realizados:" }), _jsxs(Section, { className: "mt-4 rounded-lg bg-slate-50 p-4", children: [payload.previousData.date && payload.previousData.date !== payload.entryData.date && (_jsxs(Text, { className: "m-0 text-sm text-slate-700", children: [_jsx("strong", { children: "Fecha:" }), " ", payload.previousData.date, " \u2192 ", payload.entryData.date] })), payload.previousData.description && payload.previousData.description !== payload.entryData.description && (_jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Descripci\u00F3n:" }), " ", payload.previousData.description, " \u2192 ", payload.entryData.description] })), payload.previousData.client && payload.previousData.client !== payload.entryData.client && (_jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Cliente:" }), " ", payload.previousData.client, " \u2192 ", payload.entryData.client] })), payload.previousData.schedule && payload.previousData.schedule !== payload.entryData.schedule && (_jsxs(Text, { className: "m-0 mt-2 text-sm text-slate-700", children: [_jsx("strong", { children: "Horario:" }), " ", payload.previousData.schedule, " \u2192 ", payload.entryData.schedule] }))] })] })), payload.action === 'deleted' && (_jsx(EntryDataDisplay, { entryData: payload.entryData, entryId: payload.entryId })), _jsx(Hr, { className: "my-6 border-slate-200" }), _jsx(Text, { className: "m-0 text-xs text-slate-500", children: "Este es un correo transaccional autom\u00E1tico. No respondas a este mensaje." })] }) }) })] }));
}
