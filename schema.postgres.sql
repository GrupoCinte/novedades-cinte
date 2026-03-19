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

-- ========= Novedades (reemplaza datos_novedades.xlsx) =========
CREATE TABLE IF NOT EXISTS novedades (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Datos base
  nombre                TEXT NOT NULL,
  cedula                TEXT NOT NULL,
  correo_solicitante    TEXT NULL,
  cliente               TEXT NULL,
  lider                 TEXT NULL,
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
  tipo_hora_extra       TEXT NULL,

  -- Soporte
  soporte_ruta          TEXT NULL,

  -- Estado y trazabilidad
  estado                novedad_estado NOT NULL DEFAULT 'Pendiente',
  creado_por_user_id    UUID NULL REFERENCES users(id),
  creado_en             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  aprobado_por_user_id  UUID NULL REFERENCES users(id),
  aprobado_por_rol      user_role NULL,
  aprobado_en           TIMESTAMPTZ NULL,

  rechazado_por_user_id UUID NULL REFERENCES users(id),
  rechazado_por_rol     user_role NULL,
  rechazado_en          TIMESTAMPTZ NULL,

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
CREATE INDEX IF NOT EXISTS idx_novedades_area_estado ON novedades(area, estado);
CREATE INDEX IF NOT EXISTS idx_novedades_tipo ON novedades(tipo_novedad);
CREATE INDEX IF NOT EXISTS idx_novedades_fecha_inicio ON novedades(fecha_inicio);
CREATE INDEX IF NOT EXISTS idx_novedades_creado_en ON novedades(creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_novedades_aprobado_en ON novedades(aprobado_en DESC);
CREATE INDEX IF NOT EXISTS idx_novedades_rechazado_en ON novedades(rechazado_en DESC);
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
