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

COMMIT;
