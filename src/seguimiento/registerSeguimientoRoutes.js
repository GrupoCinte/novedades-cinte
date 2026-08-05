function registerSeguimientoRoutes(deps) {
    const {
        app,
        verificarToken,
        allowRoles,
        resolveGpInternalUserIdForScope,
        listAssignedClientesForGpUserId,
        seguimientoService
    } = deps;

    if (!seguimientoService) {
        throw new TypeError('registerSeguimientoRoutes: seguimientoService es obligatorio');
    }

    // Middleware base: Autenticación y Autorización para el submódulo
    const baseMiddleware = [
        verificarToken,
        allowRoles(['gp', 'cac', 'super_admin'])
    ];

    /**
     * GET /api/seguimiento/cartera
     * Retorna la lista de clientes (y contexto) asignados al rol del usuario.
     */
    app.get('/api/seguimiento/cartera', baseMiddleware, async (req, res) => {
        try {
            const role = String(req.user?.role || '').trim().toLowerCase();
            const gpEmail = req.user?.email || req.user?.cognito_username || null;
            const gpUserId = req.user?.id || req.user?.sub || null;
            const scope = { gpEmail, gpUserId };
            
            // 1. Resolver si el usuario aplica como GP y obtener su UUID interno
            let gpId = null;
            if (role === 'gp') {
                gpId = await resolveGpInternalUserIdForScope(scope);
            }
            
            // 2. Obtener la cartera (lista de strings de clientes). 
            // Si gpId es null, devolverá array vacío o todos (según la impl. de dataLayer).
            const clientes = await listAssignedClientesForGpUserId(gpId);

            // 3. Responder al cliente HTTP (sin lógica de negocio)
            res.json({
                ok: true,
                clientes
            });
        } catch (error) {
            console.error('[Seguimiento] Error en GET /api/seguimiento/cartera:', error);
            res.status(500).json({ ok: false, error: 'Error interno del servidor al consultar la cartera.' });
        }
    });

    /**
     * GET /api/seguimiento/actas
     * Lista las actas de seguimiento aplicando el filtro por cartera si aplica.
     */
    app.get('/api/seguimiento/actas', baseMiddleware, async (req, res) => {
        try {
            const role = String(req.user?.role || '').trim().toLowerCase();
            const gpEmail = req.user?.email || req.user?.cognito_username || null;
            const gpUserId = req.user?.id || req.user?.sub || null;
            const scope = { gpEmail, gpUserId };
            
            // Paginación por query string
            const limit = Number.parseInt(req.query.limit || '50', 10);
            const offset = Number.parseInt(req.query.offset || '0', 10);

            // 1. Determinar el alcance del usuario.
            let clientesAsignados = null;
            if (role === 'gp') {
                const gpId = await resolveGpInternalUserIdForScope(scope);
                clientesAsignados = await listAssignedClientesForGpUserId(gpId);
            }

            // 2. Delegar la consulta al servicio de negocio inyectado
            const actas = await seguimientoService.listActas({ clientesAsignados, limit, offset });

            // 3. Transformar respuesta HTTP
            res.json({
                ok: true,
                items: actas
            });
        } catch (error) {
            console.error('[Seguimiento] Error en GET /api/seguimiento/actas:', error);
            res.status(500).json({ ok: false, error: 'Error interno del servidor al consultar las actas.' });
        }
    });
    /**
     * POST /api/seguimiento/actas
     * Crea una nueva acta de seguimiento (Borrador o Finalizado)
     */
    app.post('/api/seguimiento/actas', baseMiddleware, async (req, res) => {
        try {
            const role = String(req.user?.role || '').trim().toLowerCase();
            const gpEmail = req.user?.email || req.user?.cognito_username || null;
            const gpUserId = req.user?.id || req.user?.sub || null;
            const scope = { gpEmail, gpUserId };
            
            let gpId = null;
            if (role === 'gp') {
                gpId = await resolveGpInternalUserIdForScope(scope);
                if (!gpId) return res.status(403).json({ ok: false, error: 'No se pudo resolver el ID del GP' });
                
                // RBAC: Solo puede crear actas para clientes asignados
                const clientesAsignados = await listAssignedClientesForGpUserId(gpId);
                if (!clientesAsignados.includes(req.body.cliente)) {
                    return res.status(403).json({ ok: false, error: 'No tienes acceso a este cliente' });
                }
            } else {
                gpId = req.body.gp_id || null;
                if (!gpId) return res.status(400).json({ ok: false, error: 'Falta gp_id para asignar el acta' });
            }

            const data = {
                ...req.body,
                gp_id: gpId,
                estado: req.body.estado === 'FINALIZADO' ? 'FINALIZADO' : 'Borrador'
            };

            const actor = { id: gpUserId, email: gpEmail, role };
            const result = await seguimientoService.createActa(data, actor);

            res.status(201).json({ ok: true, id: result.id });
        } catch (error) {
            console.error('[Seguimiento] Error en POST /api/seguimiento/actas:', error);
            res.status(400).json({ ok: false, error: error.message });
        }
    });

    /**
     * PATCH /api/seguimiento/actas/:id
     * Actualiza un acta existente
     */
    app.patch('/api/seguimiento/actas/:id', baseMiddleware, async (req, res) => {
        try {
            const role = String(req.user?.role || '').trim().toLowerCase();
            const gpEmail = req.user?.email || req.user?.cognito_username || null;
            const gpUserId = req.user?.id || req.user?.sub || null;
            const actor = { id: gpUserId, email: gpEmail, role };
            const { id } = req.params;

            if (role === 'gp') {
                const scope = { gpEmail, gpUserId };
                const gpId = await resolveGpInternalUserIdForScope(scope);
                const clientesAsignados = await listAssignedClientesForGpUserId(gpId);
                
                const acta = await seguimientoService.getActa(id, clientesAsignados);
                if (!acta) return res.status(404).json({ ok: false, error: 'Acta no encontrada o no pertenece a tu cartera' });

                // RBAC: No puede cambiar el acta a un cliente que no le pertenece
                if (req.body.cliente && !clientesAsignados.includes(req.body.cliente)) {
                    return res.status(403).json({ ok: false, error: 'No tienes acceso a este cliente' });
                }
            } else {
                const acta = await seguimientoService.getActa(id);
                if (!acta) return res.status(404).json({ ok: false, error: 'Acta no encontrada' });
            }

            const data = {
                ...req.body,
                estado: req.body.estado === 'FINALIZADO' ? 'FINALIZADO' : 'Borrador'
            };

            await seguimientoService.updateActa(id, data, actor);
            res.json({ ok: true });
        } catch (error) {
            console.error('[Seguimiento] Error en PATCH /api/seguimiento/actas/:id:', error);
            res.status(400).json({ ok: false, error: error.message });
        }
    });

    /**
     * DELETE /api/seguimiento/actas/:id
     * Soft-delete de un acta (solo CAC o SA)
     */
    app.delete('/api/seguimiento/actas/:id', baseMiddleware, async (req, res) => {
        try {
            const role = String(req.user?.role || '').trim().toLowerCase();
            if (role === 'gp') return res.status(403).json({ ok: false, error: 'Un GP no puede eliminar actas' });

            const gpEmail = req.user?.email || req.user?.cognito_username || null;
            const gpUserId = req.user?.id || req.user?.sub || null;
            const actor = { id: gpUserId, email: gpEmail, role };
            const { id } = req.params;

            await seguimientoService.softDeleteActa(id, actor);
            res.json({ ok: true });
        } catch (error) {
            console.error('[Seguimiento] Error en DELETE /api/seguimiento/actas/:id:', error);
            res.status(400).json({ ok: false, error: error.message });
        }
    });
    /**
     * PATCH /api/seguimiento/actas/:id/observaciones-consultor
     * Permite a un consultor agregar observaciones a un acta enviada (dentro de los 3 días de plazo).
     */
    app.patch('/api/seguimiento/actas/:id/observaciones-consultor', baseMiddleware, async (req, res) => {
        try {
            const role = String(req.user?.role || '').trim().toLowerCase();
            const gpEmail = req.user?.email || req.user?.cognito_username || null;
            const gpUserId = req.user?.id || req.user?.sub || null;
            const actor = { id: gpUserId, email: gpEmail, role };
            const { id } = req.params;
            const { observacion } = req.body;

            if (!observacion || typeof observacion !== 'string') {
                return res.status(400).json({ ok: false, error: 'La observación es obligatoria y debe ser texto' });
            }

            await seguimientoService.addObservacionConsultor(id, observacion, actor);
            res.json({ ok: true });
        } catch (error) {
            console.error('[Seguimiento] Error en PATCH /api/seguimiento/actas/:id/observaciones-consultor:', error);
            // Si el error contiene 'plazo', retornar 403, sino 400
            const isForbidden = error.message.includes('plazo') || error.message.includes('Solo se pueden agregar');
            res.status(isForbidden ? 403 : 400).json({ ok: false, error: error.message });
        }
    });
}

module.exports = {
    registerSeguimientoRoutes
};
