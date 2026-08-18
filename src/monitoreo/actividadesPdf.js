const path = require('node:path');
const fs = require('node:fs');
const PDFDocument = require('pdfkit');
const { formatDateTimeBogota } = require('../utils/formatDateTimeBogota');

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

function formatDuration(inicio, fin) {
    if (!inicio || !fin) return '—';
    const ms = new Date(fin).getTime() - new Date(inicio).getTime();
    if (!Number.isFinite(ms) || ms < 0) return '—';
    const mins = Math.round(ms / 60000);
    const h = Math.floor(mins / 60);
    return h ? `${h} h ${mins % 60} min` : `${mins} min`;
}

function formatDate(val) {
    if (!val) return '—';
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Bogota' }).format(d);
}

function buildActividadesPdfBuffer(actividades = [], filters = {}) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const chunks = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // -- Configuración de columnas (A4 Ancho = 595, Margen = 40, Ancho Util = 515)
        const cols = {
            consultor: { x: 40, w: 90 },
            cliente: { x: 130, w: 75 },
            descripcion: { x: 205, w: 160 },
            inicio: { x: 365, w: 70 },
            fin: { x: 435, w: 70 },
            duracion: { x: 505, w: 50 }
        };

        const drawHeader = () => {
            const logoPath = resolveLogoPath();
            if (logoPath) {
                try {
                    doc.image(logoPath, 40, 36, { fit: [220, 54], align: 'left', valign: 'top' });
                } catch {
                    // sin logo
                }
            }

            let curY = 36 + 54 + 10;
            doc.fontSize(14).font('Helvetica-Bold')
               .text('Reporte de Monitoreo de Actividades', 40, curY);

            doc.fontSize(10).font('Helvetica')
               .text(`Fecha de generación: ${formatDateTimeBogota(new Date())}`, 40, curY + 20);

            let filterText = `Mes seleccionado: ${filters.fechaDesde ? filters.fechaDesde.slice(0, 7) : 'Actual'}`;
            if (filters.cliente) filterText += ` | Cliente: ${filters.cliente}`;
            if (filters.cedula) filterText += ` | Cédula: ${filters.cedula}`;
            doc.text(filterText, 40, curY + 35);

            doc.moveTo(40, curY + 55).lineTo(555, curY + 55).lineWidth(1).strokeColor('#e2e8f0').stroke();

            // Table Headers
            let y = curY + 65;
            doc.fontSize(8).font('Helvetica-Bold').fillColor('#475569');
            doc.text('Consultor', cols.consultor.x, y, { width: cols.consultor.w });
            doc.text('Cliente', cols.cliente.x, y, { width: cols.cliente.w });
            doc.text('Descripción', cols.descripcion.x, y, { width: cols.descripcion.w });
            doc.text('Inicio', cols.inicio.x, y, { width: cols.inicio.w });
            doc.text('Fin', cols.fin.x, y, { width: cols.fin.w });
            doc.text('Duración', cols.duracion.x, y, { width: cols.duracion.w });

            doc.moveTo(40, y + 15).lineTo(555, y + 15).lineWidth(1).strokeColor('#cbd5e1').stroke();
            return y + 25; // Siguiente línea en Y
        };

        let currentY = drawHeader();

        if (actividades.length === 0) {
            doc.fontSize(10).font('Helvetica').fillColor('#64748b')
               .text('No hay actividades que coincidan con los filtros seleccionados.', 40, currentY + 20, { align: 'center' });
            doc.end();
            return;
        }

        doc.fontSize(8).font('Helvetica').fillColor('#0f172a');

        for (const act of actividades) {
            const descripcion = String(act.descripcion || '—');
            const consName = String(act.consultor_nombre || act.cedula || '—');
            
            // Calculamos la altura que ocupará la fila
            const hDesc = doc.heightOfString(descripcion, { width: cols.descripcion.w - 5 });
            const hCons = doc.heightOfString(consName, { width: cols.consultor.w - 5 });
            const rowHeight = Math.max(hDesc, hCons, 12) + 10; // 10 de padding

            // Salto de página
            if (currentY + rowHeight > 780) {
                doc.addPage();
                currentY = drawHeader();
                doc.fontSize(8).font('Helvetica').fillColor('#0f172a');
            }

            const y = currentY;

            doc.text(consName, cols.consultor.x, y, { width: cols.consultor.w - 5 });
            doc.text(String(act.cliente || '—'), cols.cliente.x, y, { width: cols.cliente.w - 5 });
            doc.text(descripcion, cols.descripcion.x, y, { width: cols.descripcion.w - 5 });
            doc.text(formatDate(act.inicio), cols.inicio.x, y, { width: cols.inicio.w - 5 });
            doc.text(formatDate(act.fin), cols.fin.x, y, { width: cols.fin.w - 5 });
            doc.text(formatDuration(act.inicio, act.fin), cols.duracion.x, y, { width: cols.duracion.w - 5 });

            doc.moveTo(40, y + rowHeight - 5).lineTo(555, y + rowHeight - 5).lineWidth(0.5).strokeColor('#f1f5f9').stroke();
            currentY = y + rowHeight;
        }

        doc.end();
    });
}

module.exports = { buildActividadesPdfBuffer };
