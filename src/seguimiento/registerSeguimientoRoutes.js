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

    // Helper to reduce SonarQube duplication
    async function extractUserContext(req) {
        const role = String(req.user?.role || '').trim().toLowerCase();
        const gpEmail = req.user?.email || req.user?.cognito_username || null;
        const gpUserId = req.user?.id || req.user?.sub || null;
        const scope = { gpEmail, gpUserId };
        const internalActorId = await seguimientoService.getInternalUserIdByEmail(gpEmail);
        const actor = { id: internalActorId || null, email: gpEmail, role };
        return { role, gpEmail, gpUserId, scope, actor };
    }

    /**
     * GET /api/seguimiento/cartera
     * Retorna la lista de clientes (y contexto) asignados al rol del usuario.
     */
    app.get('/api/seguimiento/cartera', baseMiddleware, async (req, res) => {
        try {
            const { role, scope } = await extractUserContext(req);
            console.log('[DEBUG /cartera] req.user:', req.user);
            console.log('[DEBUG /cartera] scope:', scope);
            
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
            const { role, scope, gpUserId } = await extractUserContext(req);
            
            // Paginación por query string
            const limit = Number.parseInt(req.query.limit || '50', 10);
            const offset = Number.parseInt(req.query.offset || '0', 10);

            // 1. Determinar el alcance del usuario.
            let clientesAsignados = null;
            let gpId = null;
            if (role === 'gp') {
                gpId = await resolveGpInternalUserIdForScope(scope);
                clientesAsignados = await listAssignedClientesForGpUserId(gpId);
            }

            // 2. Delegar la consulta al servicio de negocio inyectado
            const actas = await seguimientoService.listActas({ clientesAsignados, limit, offset });

            // 3. Transformar respuesta HTTP y agregar permisos dinámicos (can_edit)
            const actasWithPermissions = actas.map(acta => {
                let can_edit = false;
                if (role === 'cac' || role === 'super_admin') {
                    can_edit = true;
                } else if (role === 'gp') {
                    if (acta.estado !== 'FINALIZADO' && String(acta.gp_id) === String(gpId)) {
                        can_edit = true;
                    }
                }
                console.log(`[DEBUG /actas map] actaId: ${acta.id}, gp_id: ${acta.gp_id}, gpId: ${gpId}, estado: ${acta.estado}, can_edit: ${can_edit}`);
                return { ...acta, can_edit };
            });

            res.json({
                ok: true,
                items: actasWithPermissions
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
            const { role, scope, actor } = await extractUserContext(req);
            
            let gpId = await resolveGpInternalUserIdForScope(scope);
            if (!gpId && role === 'gp') return res.status(403).json({ ok: false, error: 'No se pudo resolver el ID del usuario para asignar el acta' });

            if (role === 'gp') {
                // RBAC: Solo puede crear actas para clientes asignados
                const clientesAsignados = await listAssignedClientesForGpUserId(gpId);
                if (!clientesAsignados.includes(req.body.cliente)) {
                    return res.status(403).json({ ok: false, error: 'No tienes acceso a este cliente' });
                }
            }

            const data = {
                ...req.body,
                gp_id: gpId,
                estado: req.body.estado === 'FINALIZADO' ? 'FINALIZADO' : 'Borrador'
            };

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
            const { role, scope, actor } = await extractUserContext(req);
            const { id } = req.params;

            const acta = await seguimientoService.getActa(id);
            if (!acta) return res.status(404).json({ ok: false, error: 'Acta no encontrada' });

            if (role === 'gp') {
                if (acta.estado === 'FINALIZADO') {
                    return res.status(403).json({ ok: false, error: 'Los Gerentes de Proyecto no pueden editar actas finalizadas.' });
                }
                const scope = { gpEmail, gpUserId };
                const currentGpId = await resolveGpInternalUserIdForScope(scope);
                if (String(acta.gp_id) !== String(currentGpId)) {
                    return res.status(403).json({ ok: false, error: 'No tienes permisos para editar el borrador de otro Gerente de Proyecto.' });
                }
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
            const { role, scope, actor } = await extractUserContext(req);
            const { id } = req.params;

            const existingActa = await seguimientoService.getActa(id);
            if (!existingActa) return res.status(404).json({ ok: false, error: 'Acta no encontrada' });

            if (role === 'gp') {
                const gpId = await resolveGpInternalUserIdForScope(scope);
                if (String(existingActa.gp_id) !== String(gpId)) {
                    return res.status(403).json({ ok: false, error: 'No tienes permisos para descartar este borrador' });
                }
                if (existingActa.estado === 'FINALIZADO') {
                    return res.status(403).json({ ok: false, error: 'Un GP no puede eliminar actas finalizadas' });
                }
            }

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
            const { actor } = await extractUserContext(req);
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

    /**
     * POST /api/seguimiento/actas/:id/reintentar-correo
     * Reintenta enviar el correo de cierre a los participantes.
     */
    app.post('/api/seguimiento/actas/:id/reintentar-correo', baseMiddleware, async (req, res) => {
        try {
            const { role, scope, actor } = await extractUserContext(req);
            const { id } = req.params;

            const acta = await seguimientoService.getActa(id);
            if (!acta) return res.status(404).json({ ok: false, error: 'Acta no encontrada' });
            if (acta.estado !== 'FINALIZADO') {
                return res.status(400).json({ ok: false, error: 'Solo se pueden reintentar correos de actas finalizadas' });
            }

            if (role === 'gp') {
                const scope = { gpEmail, gpUserId };
                const currentGpId = await resolveGpInternalUserIdForScope(scope);
                if (String(acta.gp_id) !== String(currentGpId)) {
                    return res.status(403).json({ ok: false, error: 'No tienes permisos para reintentar el correo de esta acta.' });
                }
            }

            const updatedStatus = await seguimientoService.reintentarCorreoCierre(id, actor);
            res.json({ ok: true, correo_cierre_estado: updatedStatus });
        } catch (error) {
            console.error('[Seguimiento] Error en POST /api/seguimiento/actas/:id/reintentar-correo:', error);
            res.status(400).json({ ok: false, error: error.message });
        }
    });
}

module.exports = {
    registerSeguimientoRoutes
};
