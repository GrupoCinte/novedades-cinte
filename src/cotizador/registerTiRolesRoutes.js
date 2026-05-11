function registerTiRolesRoutes(deps) {
    const {
        app,
        verificarToken,
        disallowRoles,
        allowPanel,
        allowRoles,
        adminActionLimiter,
        catalogLimiter,
        tiRolesStore
    } = deps;

    const readGuard = [verificarToken, disallowRoles(['gp']), allowPanel('comercial')];
    const writeGuard = [verificarToken, allowRoles(['super_admin']), adminActionLimiter];

    app.get('/api/cotizador/ti-catalog/versions', ...readGuard, catalogLimiter, async (req, res) => {
        try {
            const items = await tiRolesStore.listVersions();
            return res.json({ ok: true, items });
        } catch (e) {
            console.error('ti-catalog/versions:', e);
            return res.status(500).json({ ok: false, error: 'No se pudieron listar versiones' });
        }
    });

    app.get('/api/cotizador/ti-catalog/nodos', ...readGuard, catalogLimiter, async (req, res) => {
        try {
            const versionId = Number(req.query.versionId);
            if (!Number.isFinite(versionId)) {
                return res.status(400).json({ ok: false, error: 'versionId requerido' });
            }
            const items = await tiRolesStore.getNodosByVersion(versionId);
            return res.json({ ok: true, items });
        } catch (e) {
            console.error('ti-catalog/nodos:', e);
            return res.status(500).json({ ok: false, error: 'No se pudieron listar nodos' });
        }
    });

    app.get('/api/cotizador/ti-catalog/perfiles', ...readGuard, catalogLimiter, async (req, res) => {
        try {
            const versionId = Number(req.query.versionId);
            if (!Number.isFinite(versionId)) {
                return res.status(400).json({ ok: false, error: 'versionId requerido' });
            }
            const items = await tiRolesStore.getPerfilesByVersion(versionId);
            return res.json({ ok: true, items });
        } catch (e) {
            console.error('ti-catalog/perfiles:', e);
            return res.status(500).json({ ok: false, error: 'No se pudieron listar perfiles' });
        }
    });

    app.get('/api/cotizador/ti-catalog/interno-cliente', ...readGuard, catalogLimiter, async (req, res) => {
        try {
            const row = await tiRolesStore.getActiveCatalogRow();
            const catalogo_vigente = row
                ? {
                      id: row.id,
                      label: row.label,
                      created_at: row.created_at,
                      sheet_headers: row.sheet_headers
                  }
                : null;
            return res.json({
                ok: true,
                cliente_key: tiRolesStore.getInternoTiClienteKey(),
                catalogo_vigente
            });
        } catch (e) {
            return res.status(500).json({ ok: false, error: String(e?.message || e) });
        }
    });

    app.get('/api/cotizador/ti-catalog/filas', ...readGuard, catalogLimiter, async (req, res) => {
        try {
            const raw = req.query.versionId;
            const useActive = raw == null || String(raw).trim() === '' || String(raw).toLowerCase() === 'active';
            let versionId = useActive ? await tiRolesStore.getActiveVersionId() : Number(raw);
            const page = Number(req.query.page) || 1;
            const limit = Number(req.query.limit) || 20;
            const q = String(req.query.q || '').trim();
            if (!Number.isFinite(versionId)) {
                return res.json({ ok: true, items: [], total: 0, page, limit, totalPages: 1 });
            }
            const out = await tiRolesStore.listHojaFilasPaged(versionId, { page, limit, q });
            return res.json({ ok: true, ...out });
        } catch (e) {
            console.error('ti-catalog/filas:', e);
            return res.status(500).json({ ok: false, error: 'No se pudieron listar filas' });
        }
    });

    app.get('/api/cotizador/ti-catalog/filas/:id', ...readGuard, catalogLimiter, async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Id inválido' });
            const row = await tiRolesStore.getHojaFila(id);
            if (!row) return res.status(404).json({ ok: false, error: 'Fila no encontrada' });
            return res.json({ ok: true, item: row });
        } catch (e) {
            return res.status(500).json({ ok: false, error: String(e?.message || e) });
        }
    });

    app.post('/api/cotizador/ti-catalog/filas', ...writeGuard, async (req, res) => {
        try {
            const row = await tiRolesStore.insertHojaFila(req.body || {});
            return res.json({ ok: true, item: row });
        } catch (e) {
            const st = Number(e?.status) || 500;
            return res.status(st).json({ ok: false, error: e?.message || 'Error al crear fila' });
        }
    });

    app.patch('/api/cotizador/ti-catalog/filas/:id', ...writeGuard, async (req, res) => {
        try {
            const id = Number(req.params.id);
            const row = await tiRolesStore.updateHojaFila(id, req.body || {});
            if (!row) return res.status(404).json({ ok: false, error: 'Fila no encontrada o cells inválido' });
            return res.json({ ok: true, item: row });
        } catch (e) {
            return res.status(500).json({ ok: false, error: String(e?.message || e) });
        }
    });

    app.delete('/api/cotizador/ti-catalog/filas/:id', ...writeGuard, async (req, res) => {
        try {
            const id = Number(req.params.id);
            const out = await tiRolesStore.deleteHojaFila(id);
            return res.json({ ok: true, ...out });
        } catch (e) {
            return res.status(500).json({ ok: false, error: String(e?.message || e) });
        }
    });

    app.post('/api/cotizador/ti-catalog/versions', ...writeGuard, async (req, res) => {
        try {
            const row = await tiRolesStore.createVersion(req.body || {});
            return res.json({ ok: true, item: row });
        } catch (e) {
            console.error('ti-catalog/versions POST:', e);
            return res.status(500).json({ ok: false, error: 'No se pudo crear la versión' });
        }
    });

    app.patch('/api/cotizador/ti-catalog/versions/:id', ...writeGuard, async (req, res) => {
        try {
            const id = Number(req.params.id);
            if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'Id inválido' });
            if (req.body?.activo === true) {
                const row = await tiRolesStore.setVersionActive(id);
                if (!row) return res.status(404).json({ ok: false, error: 'Versión no encontrada' });
                return res.json({ ok: true, item: row });
            }
            return res.status(400).json({ ok: false, error: 'Solo se admite activar versión (activo: true)' });
        } catch (e) {
            console.error('ti-catalog/versions PATCH:', e);
            return res.status(500).json({ ok: false, error: 'No se pudo actualizar' });
        }
    });

    app.post('/api/cotizador/ti-catalog/nodos', ...writeGuard, async (req, res) => {
        try {
            const row = await tiRolesStore.insertNodo(req.body || {});
            return res.json({ ok: true, item: row });
        } catch (e) {
            const st = Number(e?.status) || 500;
            return res.status(st).json({ ok: false, error: e?.message || 'Error al crear nodo' });
        }
    });

    app.patch('/api/cotizador/ti-catalog/nodos/:id', ...writeGuard, async (req, res) => {
        try {
            const id = Number(req.params.id);
            const row = await tiRolesStore.updateNodo(id, req.body || {});
            if (!row) return res.status(404).json({ ok: false, error: 'Nodo no encontrado' });
            return res.json({ ok: true, item: row });
        } catch (e) {
            return res.status(500).json({ ok: false, error: String(e?.message || e) });
        }
    });

    app.delete('/api/cotizador/ti-catalog/nodos/:id', ...writeGuard, async (req, res) => {
        try {
            const id = Number(req.params.id);
            const out = await tiRolesStore.deleteNodoCascade(id);
            return res.json({ ok: true, ...out });
        } catch (e) {
            return res.status(500).json({ ok: false, error: String(e?.message || e) });
        }
    });

    app.post('/api/cotizador/ti-catalog/perfiles', ...writeGuard, async (req, res) => {
        try {
            const row = await tiRolesStore.upsertPerfil(req.body || {});
            return res.json({ ok: true, item: row });
        } catch (e) {
            const st = Number(e?.status) || 500;
            return res.status(st).json({ ok: false, error: e?.message || 'Error al guardar perfil' });
        }
    });

    app.patch('/api/cotizador/ti-catalog/perfiles/:id', ...writeGuard, async (req, res) => {
        try {
            const id = Number(req.params.id);
            const row = await tiRolesStore.updatePerfil(id, req.body || {});
            if (!row) return res.status(404).json({ ok: false, error: 'Perfil no encontrado' });
            return res.json({ ok: true, item: row });
        } catch (e) {
            return res.status(500).json({ ok: false, error: String(e?.message || e) });
        }
    });

    app.delete('/api/cotizador/ti-catalog/perfiles/:id', ...writeGuard, async (req, res) => {
        try {
            const id = Number(req.params.id);
            const out = await tiRolesStore.deletePerfil(id);
            return res.json({ ok: true, ...out });
        } catch (e) {
            return res.status(500).json({ ok: false, error: String(e?.message || e) });
        }
    });
}

module.exports = { registerTiRolesRoutes };
