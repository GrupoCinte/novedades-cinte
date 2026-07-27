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
### 2026-07-27 12:21:51 · `fix/AUT-214-eliminar-bolitas-facturacion` · `bf5a1a01`
- **Commit:** `bf5a1a01c40b3de7627f23825e16963ac99c5ff1`
- **Ticket:** AUT-214
- **Requerimiento funcional:** En la cola de cierres de Facturación ya no se muestran las bolitas/stepper de estados de facturación; la tarjeta conserva progreso, estado de servicio y totales.
- **Componente técnico:** `ConciliacionesColaCierresCard.jsx`, eliminado `ConciliacionesFacturacionEstadosResumen.jsx`, helper `shouldShowFacturacionEstadosResumen` en `facturacionLogic.js`.
- **Cambios (uno a uno):**
  - Removido el stepper de chulos/conteos de la tarjeta de cola.
  - Eliminado el componente y el helper sin consumidores.

### 2026-07-24 18:18:42 · `testing` · `e9f7a21f`
- **Commit:** `e9f7a21f6cbe26a293c4539c82b50f706734fba7`
- **Ticket:** —
- **Requerimiento funcional:** En Mallas de turnos y Turnos nocturnos, el calendario ya no se recorta en pantallas pequeñas: se puede hacer scroll para ver todo el mes.
- **Componente técnico:** `react-frontend/src/MallasTurnosPage.jsx` (layout del grid del calendario y panel de asignación masiva).
- **Cambios (uno a uno):**
  - Grid del calendario con altura intrínseca (`minmax(…, auto)`) y sin `overflow-hidden` que impedía el scroll.
  - Panel de asignación apilado bajo el calendario en móvil (`flex-col` / `md:flex-row`) con tope de altura.

### 2026-07-24 11:57:46 · `testing` · `f8324c53`
- **Commit:** `f8324c536ab13ea286806156e1511d250bb1b5e9`
- **Ticket:** —
- **Requerimiento funcional:** Bajas con la misma presentación que Personal Activo (sin Puesto), filtros avanzados equivalentes más los propios de baja, y pantallas de Capital Humano sin título/descripción de página (acciones en la barra de filtros). Además se reactivó en prod el sync Dynamo→ficha de Novedades Zoho.
- **Componente técnico:** `views.jsx`, `OnboardingListView.jsx`, `FichaNovedadesView.jsx`, `CancelacionesView.jsx`, `CapitalHumanoModule.jsx`; env prod `FICHA_NOVEDADES_DYNAMO_SYNC_*`.
- **Cambios (uno a uno):**
  - Columnas Bajas: Cédula…Tipo contrato + Tipo + Motivo/F. baja/Permanencia (sin Puesto/País/Activo).
  - Filtros Bajas = Activo (sin Puesto) + motivo, tipo personal, rango baja; catálogos DISTINCT también en Bajas.
  - Eliminados headers h2/descripción; botones (Agregar, tabs Zoho, Aplicar analítica) al nivel de filtros.
  - Prod: sync Zoho on start + cada 5 min; backfill ~278 fichas a staging.

### 2026-07-24 11:37:38 · `testing` · `0ba2586c`
- **Commit:** `0ba2586c97d49570c466e50a3796cd1c0af2cebd`
- **Ticket:** —
- **Requerimiento funcional:** Corregir fallo al tramitar baja desde la ficha (error genérico al confirmar motivo y fecha).
- **Componente técnico:** `registerOnboardingRoutes.js` (PATCH `/personal/:cedula/baja`, cálculo de `tiempo_permanencia_meses`).
- **Cambios (uno a uno):**
  - Resta de fechas casteada a `timestamp` para que `EXTRACT(EPOCH …)` reciba intervalo y no entero.

### 2026-07-24 11:27:17 · `testing` · `10441c0d`
- **Commit:** `10441c0df3ef250a06a52c731c8c97283fd7ef05`
- **Ticket:** —
- **Requerimiento funcional:** En Personal Activo, los filtros avanzados vuelven a mostrar opciones reales (Sexo, Tipo de contrato, Profesión, etc.) en lugar de solo “Todos”.
- **Componente técnico:** `react-frontend/src/onboarding/views.jsx` (carga de catálogos DISTINCT).
- **Cambios (uno a uno):**
  - Se deja de exigir `auth.token` para cargar catálogos; la sesión ya autentica por cookie HttpOnly con `credentials: include`.

### 2026-07-24 11:22:14 · `testing` · `2b0a9855`
- **Commit:** `2b0a98557bf6bc5e9edb084dd408588e98ec037c`
- **Ticket:** —
- **Requerimiento funcional:** En Personal Activo, los filtros avanzados pasan a desplegables (Sexo, Tipo de contrato, Profesión, Tipo de identificación, Departamento, Ciudad) y se quita País.
- **Componente técnico:** `registerOnboardingRoutes.js` (filtros + catálogo DISTINCT), `views.jsx`, `api.js`.
- **Cambios (uno a uno):**
  - Endpoint `GET /api/onboarding/catalogos/colaborador-valores/:campo`.
  - Query de personal acepta los nuevos filtros.
  - UI Personal Activo: selects desde valores reales de `colaboradores`; sin País.


### 2026-07-24 11:10:56 · `testing` · `977b6474`
- **Commit:** `977b6474865c7428f1accf2f63c12ce808c9b6a2`
- **Ticket:** —
- **Requerimiento funcional:** En Personal Activo, la columna deja de llamarse Cargo Cinte y muestra el Puesto del colaborador, igual que en el resto del módulo.
- **Componente técnico:** `react-frontend/src/onboarding/views.jsx` (columnas `isPersonalActivo`).
- **Cambios (uno a uno):**
  - Columna `descriptivo_puesto_sig` / Cargo Cinte reemplazada por `puesto` / Puesto.

### 2026-07-24 10:58:52 · `testing` · `ce7fda15`
- **Commit:** `ce7fda15294baef5d829d827e521c6ae73b0223e`
- **Ticket:** —
- **Requerimiento funcional:** Evitar que candidatos con fecha de ingreso ya pasada (Danny, Sara, Marlon, Christiane) aparezcan en Próximos por interpretar mal `11/03/2026` como noviembre.
- **Componente técnico:** `parseFechaInicioSmart` / `toIsoYmd` en `onboardingPromotionService.js`; `tests/parseFechaInicioSmart.test.js`.
- **Cambios (uno a uno):**
  - Fechas numéricas con `/` `.` `-` se leen siempre como DD/MM/YYYY (Colombia).
  - Se bloquea el fallback `new Date('MM/DD/YYYY')` de V8.
  - Tests de regresión con los 4 casos del incidente y formatos largo/abreviado/ISO.

### 2026-07-24 10:46:11 · `testing` · `91fafe21`
- **Commit:** `91fafe21f770e4b87ac75531cbce2d144c2e917e`
- **Ticket:** —
- **Requerimiento funcional:** Evitar que la promoción automática falle cuando Dynamo trae edad o fechas en texto libre (p. ej. “25 años”, “29 de septiembre de 2026”).
- **Componente técnico:** `onboardingPromotionService.js` (`sanitizeExtendedPayloadForDb`), `colaboradoresExtendedColumns.js`.
- **Cambios (uno a uno):**
  - Sanitiza campos extended tipados antes del UPDATE a `colaboradores`.
  - Omite valores no coerceables para no hacer rollback del upsert base.

### 2026-07-24 10:40:55 · `testing` · `ca37edb0`
- **Commit:** `ca37edb0aabee8967a7042982cf78b956aa39b89`
- **Ticket:** —
- **Requerimiento funcional:** Los candidatos que finalizan el proceso n8n (estado Finalizado en Dynamo) vuelven a reflejarse en Capital Humano → Próximos a ingresar, tras el desacople del poller a Lambda.
- **Componente técnico:** `lambda/contratacion-stream` (intake onboarding en estados terminales), `src/onboarding/onboardingPromotionService.js` (parser fecha larga), `src/onboarding/onboardingDynamoPromotionSync.js` + `initContratacionRealtime.js` (reconcile con AUTOPROMOTE), `POST /api/onboarding/intake`, `scripts/backfill-onboarding-promocion-dynamo.js`.
- **Cambios (uno a uno):**
  - Lambda stream: además del WebSocket, llama `POST /api/onboarding/intake` cuando el status es terminal.
  - Portal: reconcile periódico Dynamo→Postgres si `ONBOARDING_AUTOPROMOTE=true` aunque el poller esté apagado.
  - Parser de `fecha_inicio` acepta formato n8n `"27 de julio de 2026"`.
  - Script de backfill dry-run/`--apply` para recuperar Finalizados ya cerrados.

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
