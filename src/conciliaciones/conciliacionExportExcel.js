'use strict';

const { resolveNovedadesBucket } = require('./facturacionAggregate');
const { aggregateServicioCierre, deriveEstadoCola } = require('./facturacionAggregate');
const { resolveDiasBaseMes } = require('./conciliacionDiasBaseMes');

function normalizeCedulaLocal(value) {
    return String(value || '').replace(/\D/g, '');
}

async function buildConciliacionServicioExcelWorkbook(deps, scope, query) {
    const ExcelJS = require('exceljs');
    const { listServicios } = deps;
    const servicioId = String(query?.servicioId || '').trim();
    const year = Number(query?.year);
    const month = Number(query?.month);
    if (!servicioId || !Number.isFinite(year) || !Number.isFinite(month)) {
        const error = new Error('servicioId, year y month son requeridos');
        error.status = 400;
        throw error;
    }

    const servicios = typeof listServicios === 'function' ? await listServicios(scope) : [];
    const serv = (Array.isArray(servicios) ? servicios : []).find((s) => String(s.id) === servicioId);
    if (!serv) {
        const error = new Error('Servicio no encontrado');
        error.status = 404;
        throw error;
    }

    const clienteCanon = String(serv.client || '').trim();
    const chk = await require('./conciliacionesQueries').assertClienteConciliacionPermitido(deps, scope, clienteCanon);
    if (!chk.ok) {
        const error = new Error(chk.error || 'No autorizado');
        error.status = chk.status || 403;
        throw error;
    }

    const novBucket = resolveNovedadesBucket(year, month, serv.billingType);
    const impactOpts = {
        novedadesYear: novBucket.year,
        novedadesMonth: novBucket.month,
        billingType: serv.billingType,
        billingMode: serv.billingMode,
        baseHours: serv.baseHours
    };

    const resumen = await require('./conciliacionesQueries').getConciliacionResumenPorClienteMes(
        deps,
        scope,
        chk.canon,
        year,
        month,
        impactOpts
    );

    const cedulas = (Array.isArray(serv.consultoresCedulas) ? serv.consultoresCedulas : [])
        .map(normalizeCedulaLocal)
        .filter(Boolean);
    const rows = (resumen.rows || []).filter((r) => cedulas.includes(normalizeCedulaLocal(r.cedula)));
    const agg = aggregateServicioCierre(resumen.rows || [], cedulas);

    const { assertServicioListoExport } = require('./conciliacionServicioCierre');
    await assertServicioListoExport(deps, scope, {
        servicioId,
        year,
        month,
        rows: resumen.rows || [],
        cedulas
    });

    let festivosSet = null;
    if (typeof deps.getFestivosSet === 'function') {
        try {
            festivosSet = await deps.getFestivosSet();
        } catch {
            festivosSet = null;
        }
    }
    const diasBase = resolveDiasBaseMes({
        billingMode: serv.billingMode,
        year,
        month,
        festivosSet
    });

    const novedadesRows = [];
    for (const row of rows) {
        const det = await require('./conciliacionesQueries').listConciliacionNovedadesDetalle(
            deps,
            scope,
            chk.canon,
            row.cedula,
            year,
            month,
            impactOpts
        );
        for (const item of det.items || []) {
            novedadesRows.push({
                consultor: row.nombre,
                cedula: row.cedula,
                lider: row.lider || '',
                ...item
            });
        }
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'CINTE Conciliaciones';
    wb.created = new Date();

    const wsResumen = wb.addWorksheet('Resumen servicio');
    wsResumen.addRow(['Campo', 'Valor']);
    wsResumen.addRow(['Cliente', clienteCanon]);
    wsResumen.addRow(['Servicio', serv.serviceName || '']);
    wsResumen.addRow(['Mes facturación', `${year}-${String(month).padStart(2, '0')}`]);
    wsResumen.addRow(['Tipo facturación', serv.billingType || '']);
    wsResumen.addRow(['Modo facturación', serv.billingMode || '']);
    if (diasBase.diasBaseLabel) {
        wsResumen.addRow([diasBase.diasBaseLabel, diasBase.diasBaseMes]);
    }
    wsResumen.addRow(['Consultores', agg.consultoresTotal]);
    wsResumen.addRow(['Tarifa total', agg.totales?.tarifaSum || 0]);
    wsResumen.addRow(['Deducción total', agg.totales?.deduccionSum || 0]);
    wsResumen.addRow(['Incremento total', agg.totales?.incrementoSum || 0]);
    wsResumen.addRow(['Factura neta total', agg.totales?.facturaSum || 0]);
    wsResumen.addRow(['Estado cola', deriveEstadoCola(agg)]);

    const wsConsultores = wb.addWorksheet('Consultores');
    wsConsultores.columns = [
        { header: 'Cédula', key: 'cedula', width: 14 },
        { header: 'Nombre', key: 'nombre', width: 28 },
        { header: 'Líder', key: 'lider', width: 22 },
        { header: 'Tarifa', key: 'tarifaCliente', width: 14 },
        { header: 'Deducción', key: 'novedadesSumCop', width: 14 },
        { header: 'Incremento', key: 'novedadesSumaCop', width: 14 },
        { header: 'Factura neta', key: 'facturaCop', width: 14 },
        { header: 'Estado', key: 'estado', width: 18 },
        { header: 'FV', key: 'facturaFv', width: 14 }
    ];
    for (const r of rows) {
        wsConsultores.addRow({
            cedula: r.cedula,
            nombre: r.nombre,
            lider: r.lider || '',
            tarifaCliente: r.tarifaCliente,
            novedadesSumCop: r.novedadesSumCop,
            novedadesSumaCop: r.novedadesSumaCop,
            facturaCop: r.facturaCop,
            estado: r.estado,
            facturaFv: r.facturaFv || ''
        });
    }

    const wsNov = wb.addWorksheet('Novedades');
    wsNov.columns = [
        { header: 'Consultor', key: 'consultor', width: 24 },
        { header: 'Cédula', key: 'cedula', width: 14 },
        { header: 'Líder', key: 'lider', width: 20 },
        { header: 'Tipo', key: 'tipoNovedad', width: 22 },
        { header: 'Fecha inicio', key: 'fechaInicio', width: 12 },
        { header: 'Fecha fin', key: 'fechaFin', width: 12 },
        { header: 'Cantidad', key: 'cantidad', width: 10 },
        { header: 'Medida', key: 'medida', width: 10 },
        { header: 'Valor hora', key: 'valorHora', width: 12 },
        { header: 'Monto COP', key: 'montoCop', width: 14 },
        { header: 'Impacto', key: 'impacto', width: 10 }
    ];
    for (const n of novedadesRows) {
        wsNov.addRow({
            consultor: n.consultor,
            cedula: n.cedula,
            lider: n.lider,
            tipoNovedad: n.tipoNovedad,
            fechaInicio: n.fechaInicio || '',
            fechaFin: n.fechaFin || '',
            cantidad: n.cantidad,
            medida: n.medida,
            valorHora: n.valorHora ?? '',
            montoCop: n.montoCop,
            impacto: n.impacto
        });
    }

    const safeName = String(serv.serviceName || 'servicio').replace(/[^\w\-]+/g, '_').slice(0, 40);
    const filename = `conciliacion_${safeName}_${year}-${String(month).padStart(2, '0')}.xlsx`;
    return { workbook: wb, filename, servicio: serv, agg, servicioId, year, month };
}

module.exports = {
    buildConciliacionServicioExcelWorkbook
};
