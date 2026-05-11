const { calcularCotizacion, generarDashboardData } = require('./cotizadorEngine');
const { buildCotizacionPdfBuffer } = require('./cotizadorPdf');
const { formatDateTimeBogota } = require('../utils/formatDateTimeBogota');
const { resolveCargosLista, pickCargosPorClienteRaw } = require('./resolveCargosLista');
const { normalizeCatalogValue } = require('../utils');

function registerCotizadorRoutes(deps) {
    const {
        app,
        verificarToken,
        allowAnyPanel,
        adminActionLimiter,
        pdfLimiter,
        catalogLimiter,
        cotizadorStore,
        getClientesList,
        getClientesNitMapFromLideres
    } = deps;

    const guard = [verificarToken, allowAnyPanel(['dashboard', 'gestion', 'comercial', 'admin'])];

    /**
     * Lista de clientes para el cotizador: nombres desde `clientes_lideres` + claves de `cargos_por_cliente`;
     * NIT solo desde columna `clientes_lideres.nit` (no desde JSON del catálogo).
     */
    async function buildCotizadorClientesItems() {
        const catalogos = await cotizadorStore.getCatalogos();
        const nitByCliente =
            typeof getClientesNitMapFromLideres === 'function' ? await getClientesNitMapFromLideres() : new Map();
        const byKey = new Map();
        const add = (nombreRaw) => {
            const nombre = String(nombreRaw || '').trim();
            if (!nombre) return;
            const k = nombre.toLowerCase();
            const canon = normalizeCatalogValue(nombre);
            const nit = canon ? nitByCliente.get(canon) || '' : '';
            if (!byKey.has(k)) {
                byKey.set(k, { nombre, nit });
            } else if (nit && !byKey.get(k).nit) {
                byKey.set(k, { nombre: byKey.get(k).nombre, nit });
            }
        };
        if (typeof getClientesList === 'function') {
            const names = await getClientesList();
            for (const n of Array.isArray(names) ? names : []) add(n);
        }
        const cpc = pickCargosPorClienteRaw(catalogos);
        if (cpc && typeof cpc === 'object' && !Array.isArray(cpc)) {
            for (const key of Object.keys(cpc)) add(key);
        } else if (Array.isArray(cpc)) {
            for (const entry of cpc) {
                add(entry?.cliente || entry?.CLIENTE || entry?.nombre || entry?.name || entry?.client);
            }
        }
        return [...byKey.values()].sort((a, b) =>
            a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
        );
    }

    app.get('/api/cotizador/catalogos', ...guard, catalogLimiter, async (req, res) => {
        try {
            const catalogos = await cotizadorStore.getCatalogos();
            return res.json({ ok: true, ...catalogos });
        } catch (error) {
            console.error('Error cotizador/catalogos:', error);
            return res.status(500).json({ ok: false, error: 'No se pudieron cargar catálogos del cotizador' });
        }
    });

    /** Clientes = `clientes_lideres` + claves de `cargos_por_cliente`; NIT en columnas `clientes_lideres.nit`. */
    app.get('/api/cotizador/clientes-formulario', ...guard, catalogLimiter, async (req, res) => {
        try {
            if (typeof getClientesList !== 'function') {
                return res.status(500).json({ ok: false, error: 'Catálogo de clientes no disponible' });
            }
            const items = await buildCotizadorClientesItems();
            return res.json({ ok: true, items });
        } catch (error) {
            console.error('Error cotizador/clientes-formulario:', error);
            return res.status(500).json({ ok: false, error: 'No se pudieron cargar clientes' });
        }
    });

    app.post('/api/cotizador/cotizar', ...guard, adminActionLimiter, async (req, res) => {
        try {
            const payload = req.body || {};
            const catalogos = await cotizadorStore.getCatalogos();
            const cargos = resolveCargosLista(catalogos, payload?.cliente);
            const cliente = String(payload?.cliente || '').trim();
            const perfilesBody = Array.isArray(payload?.perfiles) ? payload.perfiles : [];
            const permiteSinTarifasCatalogo = perfilesBody.some(
                (p) =>
                    String(p?.modo || '').toUpperCase() === 'MANUAL' &&
                    String(p?.cargo_manual || '').trim().length > 0
            );
            if (cliente && cargos.length === 0 && !permiteSinTarifasCatalogo) {
                return res.status(400).json({
                    ok: false,
                    error: 'Sin tarifas configuradas para el cliente seleccionado.'
                });
            }
            const generatedAt = new Date();
            const result = calcularCotizacion(payload, { ...catalogos, cargos });
            return res.json({
                ok: true,
                ...result,
                fecha_generacion_iso: generatedAt.toISOString(),
                fecha: formatDateTimeBogota(generatedAt)
            });
        } catch (error) {
            const status = Number(error?.status || 500);
            return res.status(status).json({ ok: false, error: error?.message || 'Error al calcular cotización' });
        }
    });

    app.post('/api/cotizador/guardar', ...guard, adminActionLimiter, async (req, res) => {
        try {
            const payload = req.body || {};
            const row = await cotizadorStore.saveCotizacion(payload);
            return res.json({ ok: true, id: row.id, codigo: row.codigo, fecha: row.fecha });
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

    app.get('/api/cotizador/pdf/:id', ...guard, pdfLimiter, async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isFinite(id)) {
                return res.status(400).json({ ok: false, error: 'Identificador de cotización inválido' });
            }
            const row = await cotizadorStore.getCotizacionById(id);
            if (!row?.resultados?.length) {
                return res.status(404).json({ ok: false, error: 'Cotización no encontrada o sin resultados' });
            }
            const payload = {
                cliente: row.cliente,
                nit: row.nit,
                comercial: row.comercial,
                plazo: row.plazo,
                margen: row.margen,
                meses: row.meses,
                moneda: row.moneda,
                codigo: row.codigo || '',
                resultados: row.resultados,
                fecha: row.fecha,
                fecha_generacion_iso: row.fecha_generacion_iso
            };
            const pdfBuffer = await buildCotizacionPdfBuffer(payload);
            const baseName = row.codigo ? `${String(row.codigo).replace(/[^\w\-]+/g, '_')}.pdf` : `cotizacion_${id}.pdf`;
            const download = String(req.query.download || '') === '1' || String(req.query.download || '').toLowerCase() === 'true';
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${baseName}"`);
            return res.send(pdfBuffer);
        } catch (error) {
            console.error('Error cotizador/pdf/:id:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo generar el PDF de la cotización' });
        }
    });

    app.post('/api/cotizador/pdf', ...guard, pdfLimiter, async (req, res) => {
        try {
            const raw = req.body || {};
            const wantDownload = Boolean(raw.download);
            const payload = { ...raw };
            delete payload.download;
            if (!Array.isArray(payload?.resultados) || payload.resultados.length === 0) {
                return res.status(400).json({ ok: false, error: 'No hay resultados para generar el PDF' });
            }
            const pdfBuffer = await buildCotizacionPdfBuffer(payload);
            const safeClient = String(payload?.cliente || 'cliente').replace(/[^\w\-]+/g, '_').slice(0, 50) || 'cliente';
            const codigo = String(payload?.codigo || '').trim();
            const fileName = codigo ? `${codigo.replace(/[^\w\-]+/g, '_')}.pdf` : `cotizacion_${safeClient}_${Date.now()}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `${wantDownload ? 'attachment' : 'inline'}; filename="${fileName}"`);
            return res.send(pdfBuffer);
        } catch (error) {
            console.error('Error cotizador/pdf:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo generar el PDF de la cotización' });
        }
    });
}

module.exports = { registerCotizadorRoutes };

