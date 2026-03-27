# Cotizador aislado

Este módulo implementa el cotizador como una pieza paralela al dominio de novedades.

Contrato de aislamiento:

1. Solo usa tablas nuevas con prefijo `cotizador_*`.
2. No modifica tablas existentes del sistema de novedades.
3. No altera rutas existentes de novedades.
4. No toca `schema.postgres.sql` ni migraciones actuales.
5. Todos los endpoints se exponen bajo `/api/cotizador/*`.

Objetivo: agregar funcionalidad nueva sin impacto sobre la base de datos ni la lógica actual.

