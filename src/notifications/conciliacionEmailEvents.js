'use strict';

const { randomUUID } = require('crypto');

function buildConciliacionServicioFinalizadaEvent({
    servicioId,
    servicioName,
    cliente,
    anio,
    mes,
    billingType,
    billingMode,
    totales,
    consultores,
    recipients,
    approvedBy,
    frontendUrl
}) {
    const adminBase = String(frontendUrl || '').trim() || 'http://localhost:5175';
    const recipientList = (Array.isArray(recipients) ? recipients : [])
        .map((r) => ({
            name: String(r?.name || r?.nombre || '').trim(),
            email: String(r?.email || '').trim().toLowerCase()
        }))
        .filter((r) => r.email.includes('@'));

    return {
        eventType: 'conciliacion_servicio_finalizada',
        eventId: randomUUID(),
        occurredAt: new Date().toISOString(),
        conciliacionServicioId: String(servicioId || ''),
        recipients: recipientList,
        servicio: {
            id: String(servicioId || ''),
            serviceName: String(servicioName || '').trim(),
            cliente: String(cliente || '').trim(),
            anio: Number(anio),
            mes: Number(mes),
            billingType: String(billingType || '').trim(),
            billingMode: String(billingMode || '').trim()
        },
        totales: {
            tarifaSum: Number(totales?.tarifaSum) || 0,
            incrementoSum: Number(totales?.incrementoSum) || 0,
            deduccionSum: Number(totales?.deduccionSum) || 0,
            facturaSum: Number(totales?.facturaSum) || 0
        },
        consultores: (Array.isArray(consultores) ? consultores : []).map((c) => ({
            nombre: String(c?.nombre || '').trim(),
            cedula: String(c?.cedula || '').trim(),
            estado: String(c?.estado || '').trim(),
            facturaCop: Number(c?.facturaCop) || 0
        })),
        approvedBy: {
            email: String(approvedBy?.email || '').trim() || null,
            nombre: String(approvedBy?.nombre || approvedBy?.name || '').trim() || null
        },
        admin: {
            actionUrl: `${adminBase}/admin/conciliaciones/facturacion?cliente=${encodeURIComponent(String(cliente || ''))}`
        },
        meta: {
            source: 'backend-express',
            env: process.env.NODE_ENV || 'development'
        }
    };
}

function buildConciliacionCorreoLiderEvent({
    servicioId,
    servicioName,
    cliente,
    anio,
    mes,
    destinatario,
    asunto,
    introHtml,
    tableHtml,
    cierreHtml,
    columnas,
    sentBy,
    frontendUrl
}) {
    const email = String(destinatario?.email || '').trim().toLowerCase();
    const nombre = String(destinatario?.nombre || '').trim();

    return {
        eventType: 'conciliacion_correo_lider',
        eventId: randomUUID(),
        occurredAt: new Date().toISOString(),
        conciliacionServicioId: String(servicioId || ''),
        recipient: { email, name: nombre || email },
        asunto: String(asunto || '').trim(),
        introHtml: String(introHtml || ''),
        tableHtml: String(tableHtml || ''),
        cierreHtml: String(cierreHtml || ''),
        columnas: Array.isArray(columnas) ? columnas.map(String) : [],
        servicio: {
            id: String(servicioId || ''),
            serviceName: String(servicioName || '').trim(),
            cliente: String(cliente || '').trim(),
            anio: Number(anio),
            mes: Number(mes)
        },
        sentBy: {
            email: String(sentBy?.email || '').trim() || null,
            nombre: String(sentBy?.nombre || sentBy?.name || '').trim() || null
        },
        meta: {
            source: 'backend-express',
            env: process.env.NODE_ENV || 'development'
        }
    };
}

module.exports = {
    buildConciliacionServicioFinalizadaEvent,
    buildConciliacionCorreoLiderEvent
};
