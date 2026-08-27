# AUT-321 — Consultores con cabecera CINTE → Staff

Regla firmada: **cliente cabecera CINTE es Staff**. Gana sobre `tipo_personal = consultor` ya guardado. **SENA no se toca.** Si hay otro contrato vigente, igual prima Staff (no ocurre en la práctica).

El código ya clasifica así en altas, promote y al guardar la ficha. Este documento es el **pase de filas que ya estaban mal**.

## No ejecutar en QA ni producción sin autorización

Local se puede correr ya. **QA y prod:** no corrás el `UPDATE` hasta que Miguel (o quien autorice el ambiente) diga **sí, autorizado** en el mismo hilo, con host y ambiente.

## Qué mueve

Filas en `colaboradores` con:

- `tipo_personal = 'consultor'`
- cliente cabecera CINTE interno: `CINTE`, `Grupo CINTE`, `grupocinte`, `CINTE SAS` / `SA` / `LTDA`

No mueve SENA. No mueve textos tipo “CONSORCIO CINTE …” de un tercero.

## 1. Ver quién se iría (siempre primero)

```sql
SELECT cedula, nombre, cliente, tipo_personal, activo
FROM colaboradores
WHERE tipo_personal = 'consultor'
  AND (
    lower(btrim(cliente)) IN ('cinte', 'grupo cinte', 'grupocinte')
    OR lower(btrim(cliente)) ~* '^cinte([[:space:]]+(sas|s\.?a\.?s\.?|sa|ltda|s\.a\.))?$'
  )
ORDER BY activo DESC, nombre;
```

Guardá el resultado (cédula, nombre, activo) como evidencia.

## 2. Aplicar

```sql
UPDATE colaboradores
SET tipo_personal = 'staff', updated_at = NOW()
WHERE tipo_personal = 'consultor'
  AND (
    lower(btrim(cliente)) IN ('cinte', 'grupo cinte', 'grupocinte')
    OR lower(btrim(cliente)) ~* '^cinte([[:space:]]+(sas|s\.?a\.?s\.?|sa|ltda|s\.a\.))?$'
  )
RETURNING cedula, nombre, cliente, activo;
```

## 3. Comprobar

En el portal:

- **Staff → Activos:** aparecen los que se movieron y siguen activos.
- **Consultores → Activos:** ya no están.
- Una ficha SENA con cliente CINTE (si existiera) sigue en SENA.

## Local (ya previsto)

Desde la raíz del repo, con `.env` local:

```text
node scripts/aut-321-cinte-consultores-a-staff.js
node scripts/aut-321-cinte-consultores-a-staff.js --apply
```

El primero solo lista. El segundo escribe.

Pase local (2026-08-27): 8 filas (1 activa: Sharon Elizabeth Rodríguez Cipagauta; 7 bajas). Re-corrida quedó en 0 candidatos.

## QA / prod (cuando se autorice)

1. Backup o dump reciente del ambiente.
2. Correr el `SELECT` del §1 en ese host.
3. Con el OK explícito, el `UPDATE` del §2.
4. Captura de Staff vs Consultores en el portal de ese ambiente.
