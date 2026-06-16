# AUT-533 — QA: retiro Pólizas y Capacitaciones

## Criterios de aceptación
- CA-01: Nav sin ítems Pólizas ni Capacitaciones.
- CA-02: `GET/POST /api/onboarding/polizas` y `/capacitaciones` ya no existen (404).
- CA-03: Tablas BD históricas no eliminadas.

## Prueba manual
Verificar sidebar CH y que URLs antiguas respondan 404.
