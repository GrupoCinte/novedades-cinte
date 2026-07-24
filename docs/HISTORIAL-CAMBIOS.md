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

### 2026-07-24 18:12:41 · `feat/AUT-262-cronometro-actividades-consultor` · `35d072d`
- **Commit:** `35d072d7f6cbfcd1aa41501fb70d243f066d3e27`
- **Ticket:** AUT-262
- **Requerimiento funcional:** Registro de tiempo de trabajo mediante cronómetro en tiempo real para el consultor con persisistencia de estado al recargar, control de unicidad de temporizador activo y opción de cancelación sin guardar.
- **Componente técnico:** `src/actividades/actividadesStore.js`, `src/actividades/registerActividadesRoutes.js`, `react-frontend/src/consultor/actividades/actividadesApi.js`, `react-frontend/src/consultor/actividades/MisActividadesModule.jsx`, `tests/actividadesRoutes.test.js`.
- **Cambios (uno a uno):**
  - Implementación de store de datos en Postgres para `getCronometroActivoByCedula`, `iniciarCronometro`, `detenerCronometro` y `cancelarCronometro` aprovechando el índice único `uq_actividad_cronometro_activo`.
  - Rutas HTTP backend `/api/consultor/actividades/cronometro*` (GET activo, POST iniciar, POST detener, POST cancelar) protegidas con RBAC consultor y CSRF.
  - Widget UI de Cronómetro en vivo (HH:MM:SS) en `MisActividadesModule.jsx` con sincronización automática de estado al recargar el portal (CA-3) y descarte de temporizador en curso (CA-4).
  - Pruebas unitarias backend para inicio, detención, rechazo 409 de cronómetros duplicados y cancelación (`8/8 PASS`).



### 2026-07-24 16:57:10 · `feat/AUT-261-carga-manual-actividades-consultor` · `70f776f`
- **Commit:** `70f776f1e29e92ffca33dbbfa1bc655cbb4125b7`
- **Ticket:** AUT-261
- **Requerimiento funcional:** Carga manual de horas trabajadas para consultores con validación de cliente asignado en ficha, hora fin > hora inicio y visualización del historial de actividades con flujo de estados (pendiente, aprobado, rechazado).
- **Componente técnico:** `src/actividades/actividadesStore.js`, `src/actividades/registerActividadesRoutes.js`, `schema.postgres.sql`, `src/startup.js`, `server.js`, `react-frontend/src/consultor/actividades/MisActividadesModule.jsx`, `react-frontend/src/consultor/actividades/actividadesApi.js`, `tests/actividadesRoutes.test.js`.
- **Cambios (uno a uno):**
  - Creación de tabla y migraciones PostgreSQL para `actividades_consultor` con restricción CHECK de estado (`'pendiente'`, `'aprobado'`, `'rechazado'`).
  - Endpoints backend `GET /api/consultor/actividades/context`, `GET /api/consultor/actividades` y `POST /api/consultor/actividades` protegidos con RBAC consultor y CSRF.
  - UI de Mis Actividades refactorizada reutilizando exactamente los tokens y componentes del Administrador (`buildGestionTableDash`, `GESTION_MODULE_PAGE_PADDING`, `GESTION_TOOLBAR_PRIMARY_BTN`).
  - Modal de registro manual de horas con cliente asignado en solo lectura, fecha, hora inicio, hora fin y descripción libre.
  - Barra de filtros con chip reactivo, selector de fecha, selector de cliente, buscador por descripción y menú desplegable para filtros avanzados.
  - Pruebas unitarias backend para validaciones de horario, cliente y persistencia de actividades (`4/4 PASS`).


### 2026-07-21 19:12:34 · `fix/AUT-576-gp-acceso-mallas` · `74ee8be1`
- **Commit:** `74ee8be1162fde532b29e28b3604b704e8980320`
- **Ticket:** AUT-576
- **Requerimiento funcional:** Corregir fallo en runtime al cargar clientes de mallas como GP (`resolveGpInternalUserIdForScope is not a function`).
- **Componente técnico:** `src/dataLayer.js` — exportación de `listAssignedClientesForGpUserId` y `resolveGpInternalUserIdForScope` en el return de `createDataLayer`.
- **Cambios (uno a uno):**
  - Las helpers de alcance GP ya existían internamente pero no salían del data layer; ahora `server.js` las recibe como funciones.

### 2026-07-21 19:06:03 · `fix/AUT-576-gp-acceso-mallas` · `63bb71c6`
- **Commit:** `63bb71c680e0f3443c3145df9ffa0fdb5e91e9f5`
- **Ticket:** AUT-576
- **Requerimiento funcional:** Registrar en la bitácora el hotfix de acceso GP a Mallas.
- **Componente técnico:** `docs/HISTORIAL-CAMBIOS.md`.
- **Cambios (uno a uno):**
  - Entrada append-only del commit `41fe6e2a` (AUT-576).

### 2026-07-21 19:05:58 · `fix/AUT-576-gp-acceso-mallas` · `41fe6e2a`
- **Commit:** `41fe6e2aaac3f3896e58a6094aa9a2110b3ad64a`
- **Ticket:** AUT-576
- **Requerimiento funcional:** El rol GP puede entrar a Mallas de turnos, editar y aprobar/reaprobar solo sobre sus clientes asignados en directorio, sin abrir el resto del módulo de administración.
- **Componente técnico:** `src/directorio/registerDirectorioRoutes.js` (guards mallas + alcance GP), `src/mallaTurnoHeExport.js` (reaprobación GP), `server.js` (deps alcance), frontend `mallasAccess.js` / tile / sidebar / selector scoped, tests de rutas mallas y RBAC, `docs/RBAC_MATRIX.md`.
- **Cambios (uno a uno):**
  - Rutas `mallas-turnos*` accesibles a GP sin panel `directorio`; assert de cliente asignado.
  - Endpoints `…/clientes` y `…/colaboradores` para el selector de mallas.
  - Aprobación/reaprobación con paridad CAC/super_admin; `PUT` nocturno-config sigue bloqueado a GP.
  - UI: tile «Mallas» para GP y sidebar reducido solo a mallas.

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
