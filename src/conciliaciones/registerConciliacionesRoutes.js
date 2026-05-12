/**
 * Rutas GET del módulo Conciliaciones (solo lectura v1).
 * Mismo alcance de paneles que Novedades admin en front (`userHasNovedadesAdminAccess`).
 */

const NOVEDADES_ADMIN_PANELS = ['dashboard', 'calendar', 'gestion', 'admin'];

function parseYearMonth(q) {
    const year = Number(q.year);
    const month = Number(q.month);
    if (!Number.isFinite(year) || year < 1970 || year > 2100) return null;
    if (!Number.isFinite(month) || month < 1 || month > 12) return null;
    return { year, month };
}

function registerConciliacionesRoutes(deps) {
    const {
        app,
        verificarToken,
        allowAnyPanel,
        applyScope,
        listConciliacionesClientesForScope,
        getConciliacionResumenPorClienteMesForScope,
        listConciliacionNovedadesDetalleForScope,
        getConciliacionesDashboardResumenForScope
    } = deps;

    const guardChain = [verificarToken, allowAnyPanel(NOVEDADES_ADMIN_PANELS), applyScope];

    app.get('/api/conciliaciones/clientes', ...guardChain, async (req, res) => {
        try {
            const clientes = await listConciliacionesClientesForScope(req.scope);
            return res.json({ ok: true, clientes });
        } catch (e) {
            console.error('[conciliaciones/clientes]', e);
            return res.status(500).json({ ok: false, error: 'Error al listar clientes' });
        }
    });

    app.get('/api/conciliaciones/dashboard-resumen', ...guardChain, async (req, res) => {
        const ym = parseYearMonth(req.query);
        if (!ym) return res.status(400).json({ ok: false, error: 'year y month válidos requeridos (1-12)' });
        try {
            const out = await getConciliacionesDashboardResumenForScope(req.scope, ym.year, ym.month);
            if (!out.ok) return res.status(500).json({ ok: false, error: 'Error' });
            return res.json({
                ok: true,
                year: ym.year,
                month: ym.month,
                clientesCount: out.clientesCount,
                globalTotales: out.globalTotales,
                rows: out.rows
            });
        } catch (e) {
            console.error('[conciliaciones/dashboard-resumen]', e);
            return res.status(500).json({ ok: false, error: 'Error al armar dashboard' });
        }
    });

    app.get('/api/conciliaciones/por-cliente', ...guardChain, async (req, res) => {
        const cliente = String(req.query.cliente || '').trim();
        const ym = parseYearMonth(req.query);
        if (!cliente) return res.status(400).json({ ok: false, error: 'Parámetro cliente requerido' });
        if (!ym) return res.status(400).json({ ok: false, error: 'year y month válidos requeridos (1-12)' });
        try {
            const out = await getConciliacionResumenPorClienteMesForScope(req.scope, cliente, ym.year, ym.month);
            if (!out.ok) return res.status(out.status || 400).json({ ok: false, error: out.error || 'Error' });
            return res.json({
                ok: true,
                clienteCanon: out.clienteCanon,
                year: ym.year,
                month: ym.month,
                rows: out.rows,
                totales: out.totales
            });
        } catch (e) {
            console.error('[conciliaciones/por-cliente]', e);
            return res.status(500).json({ ok: false, error: 'Error al armar resumen' });
        }
    });

    app.get('/api/conciliaciones/novedades-detalle', ...guardChain, async (req, res) => {
        const cliente = String(req.query.cliente || '').trim();
        const cedula = String(req.query.cedula || '').trim();
        const ym = parseYearMonth(req.query);
        if (!cliente) return res.status(400).json({ ok: false, error: 'Parámetro cliente requerido' });
        if (!cedula) return res.status(400).json({ ok: false, error: 'Parámetro cedula requerido' });
        if (!ym) return res.status(400).json({ ok: false, error: 'year y month válidos requeridos (1-12)' });
        try {
            const out = await listConciliacionNovedadesDetalleForScope(req.scope, cliente, cedula, ym.year, ym.month);
            if (!out.ok) return res.status(out.status || 400).json({ ok: false, error: out.error || 'Error' });
            return res.json({ ok: true, clienteCanon: out.clienteCanon, items: out.items });
        } catch (e) {
            console.error('[conciliaciones/novedades-detalle]', e);
            return res.status(500).json({ ok: false, error: 'Error al listar detalle' });
        }
    });
}

module.exports = { registerConciliacionesRoutes, NOVEDADES_ADMIN_PANELS };
