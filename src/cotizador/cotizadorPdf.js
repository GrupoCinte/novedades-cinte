const PDFDocument = require('pdfkit');

function money(value, moneda = 'COP') {
    const n = Number(value || 0);
    if (moneda === 'USD') return `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (moneda === 'CLP') return `CLP ${Math.round(n).toLocaleString('es-CL')}`;
    return `COP ${Math.round(n).toLocaleString('es-CO')}`;
}

function fmtDate(now = new Date()) {
    return now.toISOString().slice(0, 19).replace('T', ' ');
}

async function buildCotizacionPdfBuffer(cotizacion = {}) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const moneda = String(cotizacion?.moneda || 'COP');
        const cliente = String(cotizacion?.cliente || 'Sin cliente');
        const nit = String(cotizacion?.nit || '-');
        const comercial = String(cotizacion?.comercial || '-');
        const plazo = String(cotizacion?.plazo || '45');
        const margenPct = Number(cotizacion?.margen || 0) * 100;
        const meses = Number(cotizacion?.meses || 1);
        const resultados = Array.isArray(cotizacion?.resultados) ? cotizacion.resultados : [];
        const refCodigo = String(cotizacion?.codigo || '').trim();

        doc.fontSize(18).fillColor('#0f2437').text('COTIZACION COMERCIAL - CINTE', { align: 'left' });
        doc.moveDown(0.3);
        doc.fontSize(10).fillColor('#475569').text(`Fecha de generacion: ${fmtDate()}`);
        if (refCodigo) {
            doc.fontSize(11).fillColor('#0f2437').text(`Referencia: ${refCodigo}`);
            doc.moveDown(0.2);
        }
        doc.moveDown(1);

        doc.fontSize(11).fillColor('#111827').text(`Cliente: ${cliente}`);
        doc.text(`NIT: ${nit}`);
        doc.text(`Comercial: ${comercial}`);
        doc.text(`Plazo de pago: ${plazo} dias`);
        doc.text(`Margen aplicado: ${margenPct.toFixed(2)}%`);
        doc.text(`Meses de servicio: ${meses}`);
        doc.text(`Moneda: ${moneda}`);
        doc.moveDown(1);

        doc.fontSize(12).fillColor('#0f2437').text('Detalle de perfiles cotizados');
        doc.moveDown(0.5);

        const startX = 40;
        let y = doc.y;
        const cols = [startX, 230, 280, 380, 470];
        doc.fontSize(9).fillColor('#334155');
        doc.text('Cargo', cols[0], y);
        doc.text('Cant.', cols[1], y, { width: 40, align: 'right' });
        doc.text('Tarifa Mes', cols[2], y, { width: 90, align: 'right' });
        doc.text('Tarifa Hora', cols[3], y, { width: 80, align: 'right' });
        doc.text('Subtotal', cols[4], y, { width: 85, align: 'right' });
        y += 16;
        doc.moveTo(startX, y - 4).lineTo(555, y - 4).strokeColor('#cbd5e1').stroke();

        let total = 0;
        doc.fillColor('#0f172a');
        for (const item of resultados) {
            if (y > 760) {
                doc.addPage();
                y = 50;
            }
            const cant = Number(item?.cantidad || 1);
            const tarifaMes = Number(item?.tarifa_mes || 0);
            const subtotal = tarifaMes * cant * meses;
            total += subtotal;

            doc.fontSize(9).text(String(item?.cargo || '-'), cols[0], y, { width: 180 });
            doc.text(String(cant), cols[1], y, { width: 40, align: 'right' });
            doc.text(money(tarifaMes, moneda), cols[2], y, { width: 90, align: 'right' });
            doc.text(money(item?.tarifa_hora || 0, moneda), cols[3], y, { width: 80, align: 'right' });
            doc.text(money(subtotal, moneda), cols[4], y, { width: 85, align: 'right' });
            y += 16;
        }

        y += 8;
        doc.moveTo(startX, y).lineTo(555, y).strokeColor('#94a3b8').stroke();
        y += 10;
        doc.fontSize(12).fillColor('#0f2437').text(`Total estimado (${meses} meses): ${money(total, moneda)}`, startX, y, { align: 'right' });

        y += 32;
        doc.fontSize(9).fillColor('#475569').text(
            'Este documento es una propuesta comercial referencial sujeta a validacion contractual, alcance del servicio y condiciones finales acordadas con el cliente.',
            startX,
            y,
            { width: 515, align: 'justify' }
        );

        doc.end();
    });
}

module.exports = { buildCotizacionPdfBuffer };

