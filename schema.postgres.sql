-- Esquema inicial PostgreSQL para Novedades CINTE
-- Incluye: usuarios/RBAC, novedades (reemplazo de Excel), auditoria y reset de password.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ========= Tipos =========
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE user_role AS ENUM (
      'super_admin',
      'admin_ch',
      'admin_ops',
      'gp',
      'team_ch',
      'nomina',
      'sst'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_area') THEN
    CREATE TYPE user_area AS ENUM (
      'Global',
      'Capital Humano',
      'Operaciones'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'novedad_estado') THEN
    CREATE TYPE novedad_estado AS ENUM (
      'Pendiente',
      'Aprobado',
      'Rechazado'
    );
  END IF;
END$$;

-- ========= Usuarios =========
CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT NOT NULL UNIQUE,
  username            TEXT NOT NULL UNIQUE,
  full_name           TEXT NOT NULL,
  role                user_role NOT NULL,
  area                user_area NOT NULL,
  password_hash       TEXT NOT NULL,
  password_version    INTEGER NOT NULL DEFAULT 0,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at       TIMESTAMPTZ NULL
);

-- ========= Catalogo Clientes-Lideres =========
CREATE TABLE IF NOT EXISTS clientes_lideres (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente             TEXT NOT NULL,
    lider               TEXT NOT NULL,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_clientes_lideres UNIQUE (cliente, lider)
);

-- Directorio de colaboradores (cédula normalizada: solo dígitos). Seed desde JSON en arranque.
CREATE TABLE IF NOT EXISTS colaboradores (
    cedula              TEXT PRIMARY KEY,
    nombre              TEXT NOT NULL,
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    correo_cinte        TEXT NULL,
    cliente             TEXT NULL,
    lider_catalogo      TEXT NULL,
    gp_user_id          UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========= Novedades (reemplaza datos_novedades.xlsx) =========
CREATE TABLE IF NOT EXISTS novedades (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Datos base
  nombre                TEXT NOT NULL,
  cedula                TEXT NOT NULL,
  correo_solicitante    TEXT NULL,
  cliente               TEXT NULL,
  lider                 TEXT NULL,
  gp_user_id            UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  tipo_novedad          TEXT NOT NULL,
  area                  user_area NOT NULL,

  -- Fechas y horas
  fecha                 DATE NULL,      -- para Hora Extra
  hora_inicio           TIME NULL,      -- para Hora Extra
  hora_fin              TIME NULL,      -- para Hora Extra
  fecha_inicio          DATE NOT NULL,
  fecha_fin             DATE NULL,
  cantidad_horas        NUMERIC(8,2) NOT NULL DEFAULT 0,
  horas_diurnas         NUMERIC(8,2) NOT NULL DEFAULT 0,
  horas_nocturnas       NUMERIC(8,2) NOT NULL DEFAULT 0,
  horas_recargo_domingo           NUMERIC(8,2) NOT NULL DEFAULT 0,
  horas_recargo_domingo_diurnas   NUMERIC(8,2) NOT NULL DEFAULT 0,
  horas_recargo_domingo_nocturnas NUMERIC(8,2) NOT NULL DEFAULT 0,
  tipo_hora_extra       TEXT NULL,
  monto_cop             NUMERIC(16,2) NULL,

  -- Extensiones por tipo (compensatorio votación/jurado, permiso remunerado horas)
  modalidad             TEXT NULL,
  fecha_votacion        DATE NULL,
  unidad                TEXT NULL,

  -- Soporte
  soporte_ruta          TEXT NULL,

  -- Observaciones libres del solicitante (usadas hoy por Suspensión; reutilizable por otros tipos).
  observaciones         TEXT NULL,

  -- Estado y trazabilidad
  estado                novedad_estado NOT NULL DEFAULT 'Pendiente',
  creado_por_user_id    UUID NULL REFERENCES users(id),
  creado_en             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  aprobado_por_user_id  UUID NULL REFERENCES users(id),
  aprobado_por_rol      user_role NULL,
  aprobado_por_email    TEXT NULL,
  aprobado_en           TIMESTAMPTZ NULL,

  rechazado_por_user_id UUID NULL REFERENCES users(id),
  rechazado_por_rol     user_role NULL,
  rechazado_por_email   TEXT NULL,
  rechazado_en          TIMESTAMPTZ NULL,

  nomina_info_correcta             BOOLEAN NULL,
  nomina_verificacion_observacion  TEXT NULL,
  nomina_verificacion_en           TIMESTAMPTZ NULL,
  nomina_verificacion_por_user_id  UUID NULL,
  nomina_verificacion_por_email    TEXT NULL,

  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Reglas básicas de consistencia
  CONSTRAINT chk_fecha_fin_mayor_igual_inicio
    CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio),
  CONSTRAINT chk_hora_extra_orden
    CHECK (
      (hora_inicio IS NULL AND hora_fin IS NULL)
      OR
      (hora_inicio IS NOT NULL AND hora_fin IS NOT NULL AND hora_fin > hora_inicio)
    )
);

-- ========= Historial de cambios de estado =========
CREATE TABLE IF NOT EXISTS novedad_status_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  novedad_id         UUID NOT NULL REFERENCES novedades(id) ON DELETE CASCADE,
  estado_anterior    novedad_estado NULL,
  estado_nuevo       novedad_estado NOT NULL,
  changed_by_user_id UUID NULL REFERENCES users(id),
  changed_by_role    user_role NULL,
  changed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note               TEXT NULL
);

-- ========= Tokens de reset =========
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========= Auditoría genérica =========
CREATE TABLE IF NOT EXISTS audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id  UUID NULL REFERENCES users(id),
  actor_role     user_role NULL,
  action         TEXT NOT NULL,
  entity_type    TEXT NOT NULL, -- ejemplo: 'novedad', 'user'
  entity_id      UUID NULL,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========= Índices =========
CREATE INDEX IF NOT EXISTS idx_users_role_area ON users(role, area);
CREATE INDEX IF NOT EXISTS idx_clientes_lideres_cliente ON clientes_lideres(cliente);
CREATE INDEX IF NOT EXISTS idx_clientes_lideres_activo ON clientes_lideres(activo);
CREATE INDEX IF NOT EXISTS idx_colaboradores_activo ON colaboradores(activo);
CREATE INDEX IF NOT EXISTS idx_colaboradores_gp_user ON colaboradores(gp_user_id) WHERE gp_user_id IS NOT NULL;

-- ========= Mallas de turnos (una celda = día + franja; consultor desde colaboradores) =========
CREATE TABLE IF NOT EXISTS malla_turnos_celda (
    fecha   DATE NOT NULL,
    franja  TEXT NOT NULL CHECK (franja IN ('06_14', '14_22', '22_06')),
    cedula  TEXT NOT NULL REFERENCES colaboradores(cedula) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (fecha, franja)
);
CREATE INDEX IF NOT EXISTS idx_malla_turnos_celda_fecha ON malla_turnos_celda(fecha);

-- Mallas por cliente: varias personas por franja (máx. 10 en aplicación)
CREATE TABLE IF NOT EXISTS malla_turno_asignacion (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente    TEXT NOT NULL,
    fecha      DATE NOT NULL,
    franja     TEXT NOT NULL CHECK (franja IN ('06_14', '14_22', '22_06')),
    cedula     TEXT NOT NULL REFERENCES colaboradores(cedula) ON DELETE CASCADE,
    orden      SMALLINT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_malla_turno_asignacion UNIQUE (cliente, fecha, franja, cedula)
);
CREATE INDEX IF NOT EXISTS idx_malla_turno_asignacion_lookup ON malla_turno_asignacion (cliente, fecha, franja);

-- ========= Reubicaciones PIPELINE (administración; datos maestros via JOIN colaboradores) =========
CREATE TABLE IF NOT EXISTS reubicaciones_pipeline (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cedula              TEXT NOT NULL REFERENCES colaboradores(cedula) ON DELETE CASCADE,
    fecha_fin           DATE NOT NULL,
    cliente_destino     TEXT NULL,
    causal              TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_reubicaciones_pipeline_cedula UNIQUE (cedula)
);
CREATE INDEX IF NOT EXISTS idx_reubicaciones_pipeline_fecha_fin ON reubicaciones_pipeline(fecha_fin);

CREATE INDEX IF NOT EXISTS idx_novedades_area_estado ON novedades(area, estado);
CREATE INDEX IF NOT EXISTS idx_novedades_tipo ON novedades(tipo_novedad);
CREATE INDEX IF NOT EXISTS idx_novedades_fecha_inicio ON novedades(fecha_inicio);
CREATE INDEX IF NOT EXISTS idx_novedades_creado_en ON novedades(creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_novedades_gp_user ON novedades(gp_user_id) WHERE gp_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_novedades_aprobado_en ON novedades(aprobado_en DESC);
CREATE INDEX IF NOT EXISTS idx_novedades_rechazado_en ON novedades(rechazado_en DESC);

-- Anti-duplicados de radicación: una sola novedad Pendiente por (cédula, tipo normalizado, fecha_inicio,
-- fecha_fin, hora_inicio, hora_fin). Excluye `Compensatorio por votación/jurado`, que conserva su llave
-- propia por `fecha_votacion` (ver POST /api/enviar-novedad).
CREATE UNIQUE INDEX IF NOT EXISTS uq_novedades_pendiente_dedup
  ON novedades (
    cedula,
    lower(regexp_replace(trim(coalesce(tipo_novedad, '')), '\s+', ' ', 'g')),
    fecha_inicio,
    COALESCE(fecha_fin, fecha_inicio),
    COALESCE(hora_inicio, TIME '00:00:00'),
    COALESCE(hora_fin,    TIME '00:00:00')
  )
  WHERE estado = 'Pendiente'
    AND lower(regexp_replace(trim(coalesce(tipo_novedad, '')), '\s+', ' ', 'g'))
        <> 'compensatorio por votación/jurado';

CREATE INDEX IF NOT EXISTS idx_hist_novedad_fecha ON novedad_status_history(novedad_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reset_user_expires ON password_reset_tokens(user_id, expires_at DESC);

-- ========= Trigger updated_at =========
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_novedades_updated_at ON novedades;
CREATE TRIGGER trg_novedades_updated_at
BEFORE UPDATE ON novedades
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_clientes_lideres_updated_at ON clientes_lideres;
CREATE TRIGGER trg_clientes_lideres_updated_at
BEFORE UPDATE ON clientes_lideres
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========= Conciliaciones Facturacion =========
CREATE TABLE IF NOT EXISTS conciliaciones_facturacion (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cedula              TEXT NOT NULL REFERENCES colaboradores(cedula) ON DELETE CASCADE,
    anio                INTEGER NOT NULL CHECK (anio >= 2000 AND anio <= 2100),
    mes                 INTEGER NOT NULL CHECK (mes >= 1 AND mes <= 12),
    proyecto            TEXT NULL,
    observaciones       TEXT NULL,
    fecha_cierre        DATE NOT NULL DEFAULT CURRENT_DATE,
    horas_facturadas    NUMERIC(8,2) NOT NULL DEFAULT 0,
    estado              VARCHAR(50) NOT NULL DEFAULT 'PENDIENTE',
    factura_fv          VARCHAR(100) NULL,
    fecha_radicacion    DATE NULL,
    motivo_devolucion   TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_conciliaciones_facturacion_colab_mes UNIQUE (cedula, anio, mes)
);

CREATE INDEX IF NOT EXISTS idx_conciliaciones_facturacion_mes_anio ON conciliaciones_facturacion(anio, mes);

DROP TRIGGER IF EXISTS trg_conciliaciones_facturacion_updated_at ON conciliaciones_facturacion;
CREATE TRIGGER trg_conciliaciones_facturacion_updated_at
BEFORE UPDATE ON conciliaciones_facturacion
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========= Servicios (Facturacion) =========
CREATE TABLE IF NOT EXISTS servicios (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente             TEXT NOT NULL,
    nombre_servicio     TEXT NOT NULL,
    inicio_contrato     DATE NOT NULL,
    dia_cierre          INTEGER NOT NULL,
    modo_facturacion    VARCHAR(100) NOT NULL,
    horas_base          NUMERIC(8,2) NULL,
    tipo_facturacion    VARCHAR(100) NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_servicios_updated_at ON servicios;
CREATE TRIGGER trg_servicios_updated_at
BEFORE UPDATE ON servicios
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========= Servicio Consultores (Asignaciones) =========
CREATE TABLE IF NOT EXISTS servicio_consultores (
    servicio_id         UUID NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
    cedula              TEXT NOT NULL REFERENCES colaboradores(cedula) ON DELETE CASCADE,
    licencias           TEXT NULL,
    equipo              TEXT NULL,
    otras_dotaciones    TEXT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (servicio_id, cedula)
);

DROP TRIGGER IF EXISTS trg_servicio_consultores_updated_at ON servicio_consultores;
CREATE TRIGGER trg_servicio_consultores_updated_at
BEFORE UPDATE ON servicio_consultores
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========= Actividades Consultor =========
CREATE TABLE IF NOT EXISTS actividades_consultor (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cedula TEXT NOT NULL REFERENCES colaboradores(cedula) ON DELETE CASCADE,
    cliente TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    inicio TIMESTAMPTZ NOT NULL,
    fin TIMESTAMPTZ NULL,
    origen TEXT NOT NULL CHECK (origen IN ('manual', 'cronometro')),
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),

    -- Auditoría de decisión (aprobación / rechazo)
    aprobado_por_user_id    UUID NULL REFERENCES users(id),
    aprobado_por_rol        user_role NULL,
    aprobado_por_email      TEXT NULL,
    aprobado_en             TIMESTAMPTZ NULL,
    rechazado_por_user_id   UUID NULL REFERENCES users(id),
    rechazado_por_rol       user_role NULL,
    rechazado_por_email     TEXT NULL,
    rechazado_en            TIMESTAMPTZ NULL,
    observaciones_rechazo   TEXT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_actividad_fin_posterior CHECK (fin IS NULL OR fin > inicio)
);

CREATE INDEX IF NOT EXISTS idx_actividades_consultor_listado ON actividades_consultor (cedula, inicio DESC) WHERE estado IN ('pendiente', 'aprobado', 'rechazado');
CREATE UNIQUE INDEX IF NOT EXISTS uq_actividad_cronometro_activo ON actividades_consultor (cedula) WHERE origen = 'cronometro' AND fin IS NULL AND estado = 'pendiente';

DROP TRIGGER IF EXISTS trg_actividades_consultor_updated_at ON actividades_consultor;
CREATE TRIGGER trg_actividades_consultor_updated_at
BEFORE UPDATE ON actividades_consultor
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ========= Atracción de Talento (sourcing) =========
CREATE TABLE IF NOT EXISTS sourcing_vacantes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo          TEXT NULL,
    descripcion     TEXT NOT NULL,
    criterios       JSONB NOT NULL DEFAULT '{}'::jsonb,
    estado          TEXT NOT NULL DEFAULT 'borrador'
                    CHECK (estado IN ('borrador', 'activa', 'cerrada', 'archivada')),
    created_by      UUID NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sourcing_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vacante_id      UUID NOT NULL REFERENCES sourcing_vacantes(id) ON DELETE CASCADE,
    estado          TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'en_progreso', 'parcial', 'completado', 'fallido', 'cancelado')),
    fuentes         JSONB NOT NULL DEFAULT '{"elempleo":true,"linkedin":false,"xray":false}'::jsonb,
    progreso        JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_mensaje   TEXT NULL,
    created_by      UUID NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sourcing_candidatos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id          UUID NOT NULL REFERENCES sourcing_jobs(id) ON DELETE CASCADE,
    vacante_id      UUID NOT NULL REFERENCES sourcing_vacantes(id) ON DELETE CASCADE,
    fuente          TEXT NOT NULL,
    url_perfil      TEXT NULL,
    nombre          TEXT NULL,
    perfil          JSONB NOT NULL DEFAULT '{}'::jsonb,
    score           INTEGER NULL CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
    resumen_score   TEXT NULL,
    decision        TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (decision IN ('pendiente', 'aprobado', 'rechazado')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sourcing_jobs_vacante ON sourcing_jobs (vacante_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sourcing_candidatos_job ON sourcing_candidatos (job_id, score DESC NULLS LAST);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sourcing_candidatos_dedup
    ON sourcing_candidatos (job_id, fuente, COALESCE(url_perfil, ''), COALESCE(nombre, ''));

-- ========= Seguimiento Actas =========
CREATE TABLE IF NOT EXISTS seguimiento_acta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('consultor', 'cliente')),
  estado TEXT NOT NULL CHECK (estado IN ('borrador', 'finalizado')),
  cliente_nombre TEXT NOT NULL,
  gp_user_id UUID NULL,
  creado_por_user_id UUID NULL,
  creado_por_email TEXT NULL,
  fecha_seguimiento DATE NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  finalizado_at TIMESTAMPTZ NULL,
  correo_cierre_estado TEXT NOT NULL DEFAULT 'no_aplica'
    CHECK (correo_cierre_estado IN ('no_aplica', 'pendiente', 'enviado', 'fallido')),
  correos_cierre_enviados_at TIMESTAMPTZ NULL,
  correo_cierre_last_error TEXT NULL,
  ciclo_vence_at DATE NULL,
  reminder_t5_sent_at TIMESTAMPTZ NULL,
  reminder_t1_sent_at TIMESTAMPTZ NULL,
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_gp
  ON seguimiento_acta (gp_user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_ciclo
  ON seguimiento_acta (ciclo_vence_at)
  WHERE deleted_at IS NULL
    AND correo_cierre_estado = 'enviado'
    AND estado = 'finalizado';

CREATE TABLE IF NOT EXISTS seguimiento_participante (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acta_id UUID NOT NULL REFERENCES seguimiento_acta(id) ON DELETE CASCADE,
  rol TEXT NOT NULL CHECK (rol IN ('consultor', 'lider')),
  cedula TEXT NULL,
  email TEXT NULL,
  nombre TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_part_cedula
  ON seguimiento_participante (cedula);

CREATE INDEX IF NOT EXISTS idx_seguimiento_part_acta
  ON seguimiento_participante (acta_id);

CREATE TABLE IF NOT EXISTS seguimiento_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  acta_id UUID NOT NULL REFERENCES seguimiento_acta(id) ON DELETE CASCADE,
  accion TEXT NOT NULL CHECK (accion IN (
    'crear', 'actualizar', 'finalizar', 'eliminar', 'restaurar', 'reintentar_correo'
  )),
  actor_user_id UUID NULL,
  actor_email TEXT NULL,
  actor_role TEXT NULL,
  diff_json JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;


-- ========= CINTE Actas de Seguimiento y Evaluaciones =========
CREATE TABLE IF NOT EXISTS seguimiento_acta (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gp_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    cliente TEXT NOT NULL,
    fecha_acta DATE NOT NULL DEFAULT CURRENT_DATE,
    estado VARCHAR(50) NOT NULL DEFAULT 'Borrador',
    compromisos TEXT NULL,
    observaciones TEXT NULL,
    deleted_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    tipo TEXT NOT NULL DEFAULT 'consultor',
    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    correo_cierre_estado TEXT NOT NULL DEFAULT 'no_aplica',
    finalizado_at TIMESTAMPTZ NULL,
    ciclo_vence_at DATE NULL
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_gp ON seguimiento_acta(gp_id);
CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_cliente ON seguimiento_acta(cliente);
CREATE INDEX IF NOT EXISTS idx_seguimiento_acta_deleted ON seguimiento_acta(deleted_at) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS seguimiento_participante (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    acta_id UUID NOT NULL REFERENCES seguimiento_acta(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    rol VARCHAR(100) NOT NULL,
    cedula TEXT NULL,
    email TEXT NULL,
    observacion TEXT NULL,
    observacion_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_participante_acta ON seguimiento_participante(acta_id);

CREATE TABLE IF NOT EXISTS seguimiento_historial (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    acta_id UUID NOT NULL REFERENCES seguimiento_acta(id) ON DELETE CASCADE,
    accion VARCHAR(50) NOT NULL,
    estado_anterior VARCHAR(50) NULL,
    estado_nuevo VARCHAR(50) NULL,
    actor_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    actor_email TEXT NOT NULL,
    actor_role VARCHAR(50) NOT NULL,
    detalle JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seguimiento_historial_acta ON seguimiento_historial(acta_id);

-- ========= Reubicaciones =========
CREATE TABLE IF NOT EXISTS reubicaciones_pipeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cedula VARCHAR(20) NOT NULL UNIQUE REFERENCES colaboradores(cedula) ON DELETE CASCADE,
    fecha_fin DATE NOT NULL,
    cliente_destino TEXT,
    causal TEXT,
    estado TEXT,
    tipo_ficha TEXT,
    motivo_novedad TEXT,
    ultimo_evento_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reubicaciones_source_events (
    source_event_id TEXT PRIMARY KEY,
    pipeline_id UUID NOT NULL REFERENCES reubicaciones_pipeline(id) ON DELETE CASCADE,
    tipo_evento TEXT NOT NULL,
    fecha_anterior DATE NULL,
    fecha_nueva DATE NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reubicaciones_observaciones (
    id UUID PRIMARY KEY,
    pipeline_id UUID NOT NULL REFERENCES reubicaciones_pipeline(id) ON DELETE CASCADE,
    version INT NOT NULL,
    observacion TEXT NOT NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_role TEXT,
    fecha TIMESTAMPTZ DEFAULT NOW(),
    idempotency_key TEXT UNIQUE,
    UNIQUE(pipeline_id, version)
);

CREATE TABLE IF NOT EXISTS reubicaciones_decisiones (
    id UUID PRIMARY KEY,
    pipeline_id UUID NOT NULL REFERENCES reubicaciones_pipeline(id) UNIQUE ON DELETE CASCADE,
    decision TEXT NOT NULL,
    justificacion TEXT,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_role TEXT,
    fecha TIMESTAMPTZ DEFAULT NOW(),
    idempotency_key TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS reubicaciones_historial (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caso_id UUID NOT NULL,
    consultor_id TEXT REFERENCES colaboradores(cedula) ON DELETE SET NULL,
    tipo TEXT NOT NULL,
    actor_nombre TEXT NOT NULL,
    actor_rol TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    before_data JSONB,
    after_data JSONB,
    origen TEXT NOT NULL,
    source_event_id TEXT NOT NULL,
    fecha TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_reub_hist_source_event UNIQUE (caso_id, source_event_id)
);

CREATE INDEX IF NOT EXISTS idx_reub_historial_caso ON reubicaciones_historial(caso_id, fecha DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_reub_historial_consultor ON reubicaciones_historial(consultor_id);

CREATE OR REPLACE FUNCTION prevent_update_delete_reub_historial()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'reubicaciones_historial es una tabla append-only. No se permiten UPDATE ni DELETE.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reub_hist_append_only ON reubicaciones_historial;
CREATE TRIGGER trg_reub_hist_append_only
BEFORE UPDATE OR DELETE ON reubicaciones_historial
FOR EACH ROW EXECUTE FUNCTION prevent_update_delete_reub_historial();
