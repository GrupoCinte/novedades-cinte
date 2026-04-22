-- Seed sintético de colaboradores (sin PII real) para ambientes de desarrollo/pruebas.
-- Aplicar manualmente cuando sea necesario: psql "$DATABASE_URL" -f migrations/seed_colaboradores.sql

INSERT INTO colaboradores (cedula, nombre, activo) VALUES
('100000001', 'COLABORADOR DEMO 001', TRUE),
('100000002', 'COLABORADOR DEMO 002', TRUE),
('100000003', 'COLABORADOR DEMO 003', TRUE),
('100000004', 'COLABORADOR DEMO 004', TRUE),
('100000005', 'COLABORADOR DEMO 005', TRUE),
('100000006', 'COLABORADOR DEMO 006', TRUE),
('100000007', 'COLABORADOR DEMO 007', TRUE),
('100000008', 'COLABORADOR DEMO 008', TRUE),
('100000009', 'COLABORADOR DEMO 009', TRUE),
('100000010', 'COLABORADOR DEMO 010', TRUE)
ON CONFLICT (cedula) DO UPDATE
SET
    nombre = EXCLUDED.nombre,
    activo = EXCLUDED.activo;
