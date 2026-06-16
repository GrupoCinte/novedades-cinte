# AUT-532 — QA: mayúsculas CH

## Criterios de aceptación
- CA-01: PATCH/POST personal guarda nombre, cliente, puesto y cargo Cinte en MAYÚSCULAS.
- CA-02: Promoción n8n persiste los mismos campos en MAYÚSCULAS.
- CA-03: Script `node scripts/ch-uppercase-batch.mjs` reporta conteo; con `--apply` normaliza existentes.

## Prueba manual
1. Editar ficha: guardar nombre mixto → listado muestra MAYÚSCULAS.
2. Dry-run batch en QA antes de `--apply`.
