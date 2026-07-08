# Mallas/turnos aprobados → recargos (no hora extra)

> Slug: `aut-528-mallas-turnos-recargos-qa`  ·  Módulo: `Mallas y turnos`  ·  Fecha: `2026-06-16`  ·  Ticket: [AUT-528](https://cinte.atlassian.net/browse/AUT-528)

## 1. Historia de Usuario

**Como** GP o CAC que aprueba mallas o turnos nocturnos,
**quiero** que las novedades generadas reflejen recargos (nocturno y dominical/festivo) y no horas extra diurnas/nocturnas en días hábiles,
**para** que la nómina/conciliación reciba la tipología correcta sin alterar las HE radicadas manualmente.

## 2. Contexto y supuestos

- Segmentación horaria Bogotá: diurna 06:00–18:59, nocturna 19:00–06:00 (`heBogotaSplit.js`).
- Franja `14_22` incluye 3h nocturnas (19:00–22:00) en día hábil.
- Solo aplica a novedades con `malla_origen_ref`.

Precondiciones del sistema:

- Cliente con malla asignada en el mes a aprobar.
- Colaborador activo en directorio con líder válido.

## 3. Alcance

**Dentro de alcance:**

- Aprobación mallas (`variant=mallas`) y turnos nocturnos (`variant=nocturnos`).
- Columna `horas_recargo_nocturno` y export Excel.
- Re-aprobación CAC/super_admin.

**Fuera de alcance:**

- HE radicada manualmente.
- Cambio de catálogo `tipo_novedad`.
- Migración retroactiva de novedades ya exportadas.

## 4. RBAC (roles y permisos)

- Roles permitidos: GP (aprobar), CAC/super_admin (re-aprobar).
- Roles denegados: radicador sin permiso mallas.
- Comportamiento sin permiso: 403 o 409 según endpoint.

## 5. Criterios de aceptación (checklist verificable)

- [ ] **CA-01:** Celda `06_14` martes → 0 novedades nuevas.
- [ ] **CA-02:** Celda `14_22` martes → 1 novedad, `horas_recargo_nocturno=3`, HE diurna/nocturna=0.
- [ ] **CA-03:** Celda `22_06` martes → 1 novedad, `horas_recargo_nocturno=8`.
- [ ] **CA-04:** Celda domingo/festivo → recargo en `horas_recargo_domingo_*`, HE diurna/nocturna=0.
- [ ] **CA-05:** HE manual sin `malla_origen_ref` → sin regresión.
- [ ] **CA-06:** Export Excel fila «Recargo nocturno» cuando `horas_recargo_nocturno>0`.
- [ ] **CA-07:** Re-aprobación conserva deduplicación por `malla_origen_ref`.

## 6. Especificación Gherkin

```gherkin
# language: es
Característica: Recargos en aprobación de mallas y turnos
  Las novedades generadas desde malla usan columnas de recargo, no HE diurna/nocturna.

  Antecedentes:
    Dado el cliente "Cliente Demo" con malla junio 2026 aprobable
    Y el colaborador "1234567890" activo con líder válido

  Escenario: CA-01 — Franja 06_14 día hábil no genera novedad
    Dado una celda asignada "06_14" el martes 2026-06-10
    Cuando apruebo la malla del mes
    Entonces no se inserta novedad para esa celda

  Escenario: CA-02 — Franja 14_22 día hábil genera recargo nocturno 3h
    Dado una celda asignada "14_22" el martes 2026-06-10
    Cuando apruebo la malla del mes
    Entonces existe 1 novedad con malla_origen_ref
    Y horas_recargo_nocturno es 3
    Y horas_diurnas es 0
    Y horas_nocturnas es 0

  Escenario: CA-03 — Franja 22_06 día hábil genera recargo nocturno 8h
    Dado una celda asignada "22_06" el martes 2026-06-10
    Cuando apruebo la malla del mes
    Entonces horas_recargo_nocturno es 8

  Escenario: CA-04 — Domingo genera recargo dominical
    Dado una celda asignada "06_14" el domingo 2026-06-14
    Cuando apruebo la malla del mes
    Entonces horas_recargo_domingo_diurnas es mayor que 0
    Y horas_diurnas es 0
    Y horas_nocturnas es 0

  Escenario: CA-05 — HE manual sin cambios
    Dado una novedad HE radicada manualmente sin malla_origen_ref
    Cuando consulto o exporto la novedad
    Entonces conserva horas_diurnas y horas_nocturnas según split actual
```

## 7. Notas para implementación

**Archivos:** `src/mallaTurnoHeExport.js`, `src/mallaRecargoSplit.js`, `src/dataLayer.js`, `src/novedadHeExcelExport.js`, `tests/mallaTurnoHeExport.test.js`

**Datos de prueba:** Cliente Demo, cédula 1234567890, junio 2026.
