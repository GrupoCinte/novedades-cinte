// src/reubicaciones/reubicacionesAuthService.js

/**
 * Servicio de autorización para el módulo de Reubicaciones
 * Controla quién puede hacer qué y qué puede ver cada rol
 * 
 * HU-01: Acceso colaborativo y permisos de Reubicaciones
 */

class ReubicacionesAuthService {
  
  /**
   * Verifica si un usuario tiene acceso al módulo de Reubicaciones
   * @param {Object} usuario - Usuario autenticado
   * @returns {boolean}
   */
  tieneAccesoModulo(usuario) {
    if (!usuario || !usuario.rol) return false;
    
    const rolesPermitidos = [
      'super_admin',
      'gp',
      'admin_ch',
      'team_ch',
      'atraccion_talento',
      'cac'
    ];
    
    return rolesPermitidos.includes(usuario.rol);
  }

  /**
   * Obtiene las acciones permitidas para un rol específico
   * @param {string} rol - Rol del usuario
   * @returns {string[]} Lista de acciones permitidas
   */
  getAccionesPermitidas(rol) {
    const acciones = {
      // super_admin: TODO
      super_admin: [
        'view',
        'create',
        'edit',
        'delete',
        'decide_aptitud',
        'register_observacion',
        'manage_reubicacion',
        'view_historial'
      ],
      
      // GP: Solo ve sus clientes y decide aptitud
      gp: [
        'view',
        'decide_aptitud'
      ],
      
      // CH: Ve todos y registra observaciones
      admin_ch: [
        'view',
        'register_observacion'
      ],
      
      team_ch: [
        'view',
        'register_observacion'
      ],
      
      // AT: Ve todos y gestiona reubicación
      atraccion_talento: [
        'view',
        'manage_reubicacion'
      ],
      
      // CAC: Ve, crea y edita
      cac: [
        'view',
        'create',
        'edit'
      ]
    };
    
    return acciones[rol] || [];
  }

  /**
   * Verifica si un GP tiene alcance sobre un consultor específico
   * @param {Object} usuario - Usuario GP
   * @param {string} cedulaConsultor - Cédula del consultor
   * @param {Object} pool - Pool de base de datos
   * @returns {Promise<boolean>}
   */
  async gpTieneAlcance(usuario, cedulaConsultor, pool) {
    // Solo GPs tienen alcance
    if (usuario.rol !== 'gp') return false;
    
    try {
      const query = `
        SELECT EXISTS (
          SELECT 1 
          FROM colaboradores c
          JOIN clientes_lideres cl ON c.cliente_id = cl.cliente_id
          WHERE c.cedula = $1
            AND cl.gp_user_id = $2
            AND c.estado = 'ACTIVO'
        ) as tiene_alcance
      `;
      
      const result = await pool.query(query, [cedulaConsultor, usuario.id]);
      return result.rows[0]?.tiene_alcance || false;
      
    } catch (error) {
      console.error('Error verificando alcance de GP:', error);
      return false;
    }
  }

  /**
   * Obtiene los casos filtrados por alcance de GP
   * @param {Object} usuario - Usuario GP
   * @param {Object} pool - Pool de base de datos
   * @returns {Promise<Array>}
   */
  async getCasosPorAlcanceGP(usuario, pool) {
    if (usuario.role !== 'gp') {
      throw new Error('Solo GPs pueden usar este método');
    }

    try {
      const query = `
          SELECT
              rp.id,
              rp.cedula,
              rp.fecha_fin,
              rp.cliente_destino,
              rp.causal,
              rp.created_at,
              rp.updated_at,
              c.nombre AS consultor,
              c.tipo_contrato,
              COALESCE(NULLIF(TRIM(c.cliente), ''), NULLIF(TRIM(c.cliente_proyecto), '')) AS cliente_actual,
              c.tarifa_cliente AS tarifa_actual,
              c.montos_divisa,
              c.puesto,
              c.lider_catalogo,
              u.full_name AS gp_nombre,
              c.perfil_cargo,
              c.sueldo_nomina AS salario,
              c.auxilio_transporte_obligatorio AS auxilios,
              (SELECT NULLIF(TRIM(f.tipo_novedad), '') 
               FROM ficha_novedades_staging f 
               WHERE f.colaborador_cedula_match = rp.cedula
               ORDER BY f.created_at DESC 
               LIMIT 1) AS tipo_ficha,
              (rp.fecha_fin::date - (timezone('America/Bogota', now()))::date) AS dias_restantes,
              (CASE 
                  WHEN rp.fecha_fin < CURRENT_DATE THEN 'Con novedad' 
                  ELSE 'En proceso' 
              END) AS estado,
              (CASE 
                  WHEN rp.fecha_fin < CURRENT_DATE THEN 'Vencido'
                  WHEN rp.fecha_fin > (CURRENT_DATE + 30) THEN 'Verde'
                  WHEN rp.fecha_fin >= (CURRENT_DATE + 15) THEN 'Amarillo'
                  ELSE 'Rojo'
              END) AS semaforo
          FROM reubicaciones_pipeline rp
          INNER JOIN colaboradores c ON c.cedula = rp.cedula
          INNER JOIN clientes_lideres cl ON (
              COALESCE(NULLIF(TRIM(c.cliente), ''), NULLIF(TRIM(c.cliente_proyecto), '')) = cl.cliente
          )
          LEFT JOIN users u ON cl.gp_user_id = u.id
          WHERE cl.gp_user_id = $1
            AND c.activo = true
          ORDER BY rp.fecha_fin ASC
      `;

      const result = await pool.query(query, [usuario.sub]);      
      return result.rows;
      
    } catch (error) {
      console.error('Error obteniendo casos por alcance GP:', error);
      throw error;
    }
  }

  /**
   * Obtiene el estado y acciones disponibles para un caso
   * @param {Object} usuario - Usuario autenticado
   * @param {Object} caso - Caso de reubicación
   * @returns {Object}
   */
  getEstadoYOpciones(usuario, caso) {
    const acciones = this.getAccionesPermitidas(usuario.rol);
    
    return {
      acciones_permitidas: acciones,
      
      // Acciones específicas
      puede_decidir_aptitud: acciones.includes('decide_aptitud'),
      puede_registrar_observacion: acciones.includes('register_observacion'),
      puede_gestionar_reubicacion: acciones.includes('manage_reubicacion'),
      puede_editar: acciones.includes('edit'),
      puede_eliminar: acciones.includes('delete'),
      
      // Alcance
      es_gp_con_alcance: usuario.rol === 'gp' && caso?.gp_asignado_id === usuario.id,
      tiene_alcance_limitado: usuario.rol === 'gp'
    };
  }

  /**
   * Verifica si un usuario puede realizar una acción específica
   * @param {Object} usuario - Usuario autenticado
   * @param {string} accion - Acción a verificar
   * @param {Object} caso - Caso de reubicación (opcional)
   * @returns {Object} { permitido: boolean, motivo: string }
   */
  puedeRealizarAccion(usuario, accion, caso = null) {
    const acciones = this.getAccionesPermitidas(usuario.rol);
    
    // ❌ Si la acción no está en la lista, NO puede
    if (!acciones.includes(accion)) {
      return { 
        permitido: false, 
        motivo: `Acción "${accion}" no permitida para el rol ${usuario.rol}` 
      };
    }

    // ✅ Reglas específicas por rol
    
    // 🔒 GP: solo puede decidir aptitud en SUS casos
    if (usuario.rol === 'gp') {
      if (accion === 'decide_aptitud' && caso && caso.gp_asignado_id !== usuario.id) {
        return { 
          permitido: false, 
          motivo: 'No tiene alcance sobre este caso' 
        };
      }
      // GP solo puede ver y decidir aptitud
      if (accion !== 'view' && accion !== 'decide_aptitud') {
        return { 
          permitido: false, 
          motivo: 'Los GPs solo pueden ver y decidir aptitud' 
        };
      }
    }

    // AT: solo puede ver y gestionar reubicación
    if (usuario.rol === 'atraccion_talento') {
      if (accion !== 'view' && accion !== 'manage_reubicacion') {
        return { 
          permitido: false, 
          motivo: 'AT solo puede ver y gestionar reubicación' 
        };
      }
    }

    //  CH: solo puede ver y registrar observaciones
    if (usuario.rol === 'admin_ch' || usuario.rol === 'team_ch') {
      if (accion !== 'view' && accion !== 'register_observacion') {
        return { 
          permitido: false, 
          motivo: 'CH solo puede ver y registrar observaciones' 
        };
      }
    }

    //  Todas las validaciones pasaron
    return { permitido: true };
  }

  /**
   * Obtiene información de alcance para la UI
   * @param {Object} usuario - Usuario autenticado
   * @returns {Object}
   */
  getAlcanceUI(usuario) {
    return {
      es_super_admin: usuario.rol === 'super_admin',
      es_gp: usuario.rol === 'gp',
      es_ch: usuario.rol === 'admin_ch' || usuario.rol === 'team_ch',
      es_at: usuario.rol === 'atraccion_talento',
      es_cac: usuario.rol === 'cac',
      tiene_alcance_limitado: usuario.rol === 'gp'
    };
  }
}

// Exportar una única instancia
module.exports = new ReubicacionesAuthService();