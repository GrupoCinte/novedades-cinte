const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { formatDateTimeBogota } = require('../utils/formatDateTimeBogota');

function money(value, moneda = 'COP') {
    const n = Number(value || 0);
    if (moneda === 'USD') return `USD ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (moneda === 'CLP') return `CLP ${Math.round(n).toLocaleString('es-CL')}`;
    return `COP ${Math.round(n).toLocaleString('es-CO')}`;
}

function resolveLogoPath() {
    const names = ['logo-cinte-header-light.png', 'logo-cinte-header.png'];
    const roots = [path.join(process.cwd(), 'assets'), path.join(__dirname, '..', '..', 'assets')];
    for (const name of names) {
        for (const root of roots) {
            const p = path.join(root, name);
            if (fs.existsSync(p)) return p;
        }
    }
    return null;
}

/** Etiqueta de “fecha de generación”: misma lógica que creación en BD / respuesta de cotizar (Bogotá). */
function resolveFechaGeneracionLabel(cotizacion) {
    const iso = cotizacion?.fecha_generacion_iso || cotizacion?.created_at;
    if (iso) {
        const d = new Date(iso);
        if (!Number.isNaN(d.getTime())) return formatDateTimeBogota(d);
    }
    const f = cotizacion?.fecha;
    if (f && typeof f === 'string' && f.trim()) {
        if (f.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(f.trim())) {
            const d = new Date(f);
            if (!Number.isNaN(d.getTime())) return formatDateTimeBogota(d);
        }
        return f.trim();
    }
    return formatDateTimeBogota(new Date());
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
        const fechaLabel = resolveFechaGeneracionLabel(cotizacion);

        const marginLeft = 40;
        const contentW = 515;
        const logoY = 36;
        /** Alto máximo del bloque del logo; el título va debajo, no al costado. */
        const logoBoxH = 54;
        const logoPath = resolveLogoPath();

        if (logoPath) {
            try {
                doc.image(logoPath, marginLeft, logoY, { fit: [220, logoBoxH], align: 'left', valign: 'top' });
            } catch {
                /* sin logo */
            }
        }

        let curY = logoPath ? logoY + logoBoxH + 10 : logoY;
        doc.fontSize(16).fillColor('#0f2437').text('COTIZACION COMERCIAL - CINTE', marginLeft, curY, {
            width: contentW,
            align: 'left'
        });
        curY += 22;
        doc.fontSize(10).fillColor('#475569').text(`Fecha de generacion: ${fechaLabel}`, marginLeft, curY, {
            width: contentW,
            align: 'left'
        });
        curY += 16;
        if (refCodigo) {
            doc.fontSize(11).fillColor('#0f2437').text(`Referencia: ${refCodigo}`, marginLeft, curY, {
                width: contentW,
                align: 'left'
            });
            curY += 18;
        }

        const headerBlockBottom = curY;
        doc.y = headerBlockBottom + 8;
        doc.moveDown(0.5);

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
