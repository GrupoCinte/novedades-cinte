function getCedulaOrError(req, res) {
    const cedula = String(req.user?.cedula || '').trim();
    if (!cedula) {
        res.status(403).json({ ok: false, error: 'Sesión de consultor sin cédula asociada.' });
        return null;
    }
    return cedula;
}

function registerConsultorSeguimientoRoutes({
    app,
    verificarToken,
    requireEntraConsultor,
    seguimientoConsultorService
}) {
    if (!app || typeof app.get !== 'function') {
        throw new TypeError('registerConsultorSeguimientoRoutes: app es obligatorio.');
    }
    if (typeof verificarToken !== 'function') {
        throw new TypeError('registerConsultorSeguimientoRoutes: verificarToken es obligatorio.');
    }
    if (typeof requireEntraConsultor !== 'function') {
        throw new TypeError('registerConsultorSeguimientoRoutes: requireEntraConsultor es obligatorio.');
    }
    if (!seguimientoConsultorService || typeof seguimientoConsultorService.listActasConsultor !== 'function') {
        throw new TypeError('registerConsultorSeguimientoRoutes: seguimientoConsultorService es obligatorio.');
    }

    const consultorAuth = [verificarToken, requireEntraConsultor];

    app.get('/api/consultor/seguimientos', ...consultorAuth, async (req, res) => {
        try {
            const cedula = getCedulaOrError(req, res);
            if (!cedula) return;

            const email = req.user?.email || null;

            const seguimientos = await seguimientoConsultorService.listActasConsultor({ cedula, email });
            return res.json({ ok: true, seguimientos });
        } catch (error) {
            console.error('Error GET /api/consultor/seguimientos:', error);
            return res.status(500).json({ ok: false, error: 'Error interno al obtener los seguimientos.' });
        }
    });

    app.get('/api/consultor/seguimientos/:id', ...consultorAuth, async (req, res) => {
        try {
            const id = String(req.params.id || '').trim();
            if (!id) {
                return res.status(400).json({ ok: false, error: 'ID de acta requerido.' });
            }

            const cedula = getCedulaOrError(req, res);
            if (!cedula) return;

            const email = req.user?.email || null;

            const acta = await seguimientoConsultorService.getActaConsultor({ id, cedula, email });
            if (!acta) {
                return res.status(404).json({ ok: false, error: 'Acta no encontrada o sin permisos.' });
            }

            return res.json({ ok: true, acta });
        } catch (error) {
            return res.status(500).json({ ok: false, error: 'Error interno al obtener el detalle del acta.' });
        }
    });

    app.post('/api/consultor/seguimientos/:id/observacion', ...consultorAuth, async (req, res) => {
        try {
            const id = String(req.params.id || '').trim();
            const observacion = req.body?.observacion || '';

            if (!id) {
                return res.status(400).json({ ok: false, error: 'ID de acta requerido.' });
            }
            if (typeof observacion !== 'string') {
                return res.status(400).json({ ok: false, error: 'La observación debe ser texto.' });
            }

            const cedula = getCedulaOrError(req, res);
            if (!cedula) return;

            const email = req.user?.email || null;

            await seguimientoConsultorService.addObservacionConsultor({ id, cedula, email, observacion });

            return res.json({ ok: true });
        } catch (error) {
            console.error('Error POST /api/consultor/seguimientos/:id/observacion:', error);
            const errMsg = error.message || 'Error interno al guardar la observación.';
            // Enviar 400 si es un error controlado, 500 si es interno
            const status = errMsg.includes('plazo') || errMsg.includes('permisos') || errMsg.includes('encontrada') ? 400 : 500;
            return res.status(status).json({ ok: false, error: errMsg });
        }
    });
}

module.exports = { registerConsultorSeguimientoRoutes };
