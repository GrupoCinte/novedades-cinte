# Historial de cambios — novedades-cinte

Bitácora oficial y **única** de cambios del repositorio. Se agrega **una entrada por cada commit remoto** (tras `git push`), con rama, número de commit, fecha, hora, requerimiento funcional y componente técnico.

> Documento **append-only**: las entradas nuevas van al inicio de "## Registro" (lo más reciente arriba). No se reescriben ni borran entradas anteriores.

## Formato de cada entrada

```markdown
### <fecha YYYY-MM-DD> <hora HH:MM:SS> · `<rama>` · `<hash_corto>`
- **Commit:** `<hash_completo>`
- **Ticket:** AUT-### (o "—")
- **Requerimiento funcional:** qué resuelve para el negocio/usuario (no técnico).
- **Componente técnico:** archivos, módulos, endpoints o tablas afectadas y qué se cambió.
- **Cambios (uno a uno):**
  - <cambio 1>
  - <cambio 2>
```

## Registro

<!-- Las nuevas entradas se agregan aquí arriba, en orden cronológico inverso. -->

### 2026-07-21 18:44:54 · `fix/AUT-575-recargo-tope-7h-jornada-42` · `e44f93ac`
- **Commit:** `e44f93ac571b6450e8cfa9c7b820079539c2c5b1`
- **Ticket:** AUT-575
- **Requerimiento funcional:** Desde el 15 de julio de 2026 la jornada máxima es 42 h/semana: el tope de horas clasificadas como recargo dominical/festivo baja de 7,33 a 7,00. Además, los textos de política de compensación reflejan el recargo del 90 % (coeficientes 0,90 / 1,90) desde julio 2026.
- **Componente técnico:** `src/heBogotaSplit.js` (tope por `dayKey`), `react-frontend/src/heNovedadBogotaClient.js` (mirror), `src/heDomingoBogota.js` (textos coeficiente), `scripts/backfill-recargo-tope-jornada-42.js` (recompute HE + observaciones), tests HE asociados y `package.json` (incluye `heDomingoRecargoGroup.test.js`).
- **Cambios (uno a uno):**
  - Tope de recargo por día Bogotá: 7,33 h hasta 2026-07-14; 7,00 h desde 2026-07-15 (presupuesto compartido multi-fila usa el tope del día).
  - Textos `buildHeDomingoPolicyText`: 0,80/1,80 antes de 2026-07; 0,90/1,90 desde 2026-07.
  - Script dry-run/apply para recomputar HE con domingo/festivo ≥ 15-jul y actualizar observaciones con coeficientes viejos.
  - Tests pre/post corte y coeficientes; suite `heDomingoRecargoGroup` añadida a `npm test`.

### 2026-07-16 16:59:14 · `fix/novedades-export-excel` · `6ee5c8f1`
- **Commit:** `6ee5c8f15c5ccb1b40f86833a65b7ef1d67e7220`
- **Ticket:** —
- **Requerimiento funcional:** Simplificar el descargue en Excel del módulo de Novedades para que sea más legible para nómina: se quitan columnas de detalle de horas que ya no se necesitan y se agrega, junto a la fecha de creación, cuándo y quién aprobó la novedad.
- **Componente técnico:** Endpoint `GET /api/novedades/export-excel` en `src/registerRoutes.js` (definición de columnas del reporte y funciones `buildExcelRowHoraExtraSlice`, `buildExcelRowHoraExtraLegacy`, `buildExcelRowOtroTipo`).
- **Cambios (uno a uno):**
  - Se eliminan del Excel las columnas: ID novedad, Horas diurnas, Horas nocturnas, Horas recargo domingo, Recargo dominical/festivos — diurno, Recargo dominical/festivos — nocturno, Recargo nocturno y Observación HE domingo.
  - Se agregan, justo después de "Fecha Creación", las columnas "Fecha Aprobación" y "Aprobado por".
  - Se elimina la columna duplicada "Aprobado / rechazado por (correo)" que estaba al final del reporte.
  - Se agrega el helper `resolveFechaAprobacionExcel` para formatear la fecha de aprobación/rechazo (vacío si sigue pendiente).
