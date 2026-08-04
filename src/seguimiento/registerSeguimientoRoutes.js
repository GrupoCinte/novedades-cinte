function registerSeguimientoRoutes(deps) {
    const {
        app,
        verificarToken,
        allowPanel,
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
            const limit = parseInt(req.query.limit || '50', 10);
            const offset = parseInt(req.query.offset || '0', 10);

            // 1. Determinar el alcance del usuario. Si es GP, trae su UUID; sino, null (acceso global para CAC/SA).
            let gpId = null;
            if (role === 'gp') {
                gpId = await resolveGpInternalUserIdForScope(scope);
            }

            // 2. Delegar la consulta al servicio de negocio inyectado
            const actas = await seguimientoService.listActas({ gpId, limit, offset });

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
}

module.exports = {
    registerSeguimientoRoutes
};
