const { calcularCotizacion, generarDashboardData } = require('./cotizadorEngine');
const { buildCotizacionPdfBuffer } = require('./cotizadorPdf');

function registerCotizadorRoutes(deps) {
    const {
        app,
        verificarToken,
        allowAnyPanel,
        adminActionLimiter,
        pdfLimiter,
        catalogLimiter,
        cotizadorStore
    } = deps;

    const guard = [verificarToken, allowAnyPanel(['dashboard', 'gestion', 'comercial', 'admin'])];

    app.get('/api/cotizador/catalogos', ...guard, catalogLimiter, async (req, res) => {
        try {
            const catalogos = await cotizadorStore.getCatalogos();
            return res.json({ ok: true, ...catalogos });
        } catch (error) {
            console.error('Error cotizador/catalogos:', error);
            return res.status(500).json({ ok: false, error: 'No se pudieron cargar catálogos del cotizador' });
        }
    });

    app.post('/api/cotizador/cotizar', ...guard, adminActionLimiter, async (req, res) => {
        try {
            const payload = req.body || {};
            const catalogos = await cotizadorStore.getCatalogos();
            const result = calcularCotizacion(payload, catalogos);
            return res.json({ ok: true, ...result });
        } catch (error) {
            const status = Number(error?.status || 500);
            return res.status(status).json({ ok: false, error: error?.message || 'Error al calcular cotización' });
        }
    });

    app.post('/api/cotizador/guardar', ...guard, adminActionLimiter, async (req, res) => {
        try {
            const payload = req.body || {};
            const row = await cotizadorStore.saveCotizacion(payload);
            return res.json({ ok: true, id: row.id, fecha: row.fecha });
        } catch (error) {
            console.error('Error cotizador/guardar:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo guardar la cotización' });
        }
    });

    app.get('/api/cotizador/historial', ...guard, catalogLimiter, async (req, res) => {
        try {
            const rows = await cotizadorStore.getHistorial();
            return res.json({ ok: true, items: [...rows].reverse() });
        } catch (error) {
            console.error('Error cotizador/historial:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo cargar el historial del cotizador' });
        }
    });

    app.delete('/api/cotizador/historial/:id', ...guard, adminActionLimiter, async (req, res) => {
        try {
            const out = await cotizadorStore.deleteCotizacion(req.params.id);
            if (!out.deleted) return res.status(404).json({ ok: false, error: 'Cotización no encontrada' });
            return res.json({ ok: true });
        } catch (error) {
            console.error('Error cotizador/delete:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo eliminar la cotización' });
        }
    });

    app.get('/api/cotizador/dashboard', ...guard, catalogLimiter, async (req, res) => {
        try {
            const rows = await cotizadorStore.getHistorial();
            return res.json({ ok: true, ...generarDashboardData(rows) });
        } catch (error) {
            console.error('Error cotizador/dashboard:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo cargar dashboard del cotizador' });
        }
    });

    app.post('/api/cotizador/pdf', ...guard, pdfLimiter, async (req, res) => {
        try {
            const payload = req.body || {};
            if (!Array.isArray(payload?.resultados) || payload.resultados.length === 0) {
                return res.status(400).json({ ok: false, error: 'No hay resultados para generar el PDF' });
            }
            const pdfBuffer = await buildCotizacionPdfBuffer(payload);
            const safeClient = String(payload?.cliente || 'cliente').replace(/[^\w\-]+/g, '_').slice(0, 50) || 'cliente';
            const fileName = `cotizacion_${safeClient}_${Date.now()}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            return res.send(pdfBuffer);
        } catch (error) {
            console.error('Error cotizador/pdf:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo generar el PDF de la cotización' });
        }
    });
}

module.exports = { registerCotizadorRoutes };

