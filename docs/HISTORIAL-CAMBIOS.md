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
### 2026-08-05 17:05:46 · `release/actividades-prod-main` · `4f4d6e6d`
- **Commit:** `4f4d6e6df93a52bdc5b6040251b9e0f46bff01eb`
- **Ticket:** AUT-259 (suite AUT-260..267, AUT-581, AUT-268..271)
- **Requerimiento funcional:** Permite a consultores registrar tiempo (manual y cronómetro) y a admin/CAC/GP monitorear, aprobar o rechazar actividades, con correos de confirmación, sin llevar a producción el módulo de Atracción de talento que sigue solo en testing.
- **Componente técnico:** `src/actividades/*`, `src/monitoreo/*`, rutas consultor/admin, RBAC panel `monitoreo`, `schema.postgres.sql` (`actividades_consultor`), FE Mis actividades + Monitoreo, `emailNotificationsPublisher`, Lambda `email-transactions` (plantillas time-entry + dist sincronizado con admin).
- **Cambios (uno a uno):**
  - Promueve a rama release sobre `main` el cargue de actividades del consultor y el monitoreo en administración.
  - Incluye DDL/startup de `actividades_consultor`, validaciones/UI (duplicados, año en curso, etc.) y publisher/Lambda con `AdminTimeEntryNotificationEmail` en `dist`.
  - Excluye Atracción/sourcing y demás cambios ajenos de `testing`.

### 2026-08-05 19:17:39 · `main` · `09baa9a8`
- **Commit:** `09baa9a8896be89fe8846988de4c45f554d2c2d1`
- **Ticket:** —
- **Requerimiento funcional:** Integra en producción el ajuste de CSP para que En ingreso pueda abrir el WebSocket de API Gateway y actualizar estados en vivo.
- **Componente técnico:** merge PR #139 (`hotfix/contratacion-ws-csp-connect-src` → `main`).
- **Cambios (uno a uno):**
  - Merge a `main` del fix CSP `connect-src` con `wss://*.execute-api.us-east-1.amazonaws.com`.

### 2026-08-05 19:16:47 · `hotfix/contratacion-ws-csp-connect-src` · `a64e9929`
- **Commit:** `a64e992985a0effd4b8c3b7c71d2a11fee9ead9c`
- **Ticket:** —
- **Requerimiento funcional:** El navegador bloqueaba el WebSocket hacia AWS (CSP), por eso En ingreso no se actualizaba sin refrescar aunque Dynamo y la Lambda sí procesaban el cambio.
- **Componente técnico:** `Caddyfile` (Content-Security-Policy `connect-src`).
- **Cambios (uno a uno):**
  - Permite `wss://*.execute-api.us-east-1.amazonaws.com` además de `wss://novedades.grupocinte.com`.

### 2026-08-05 19:00:54 · `main` · `d65e9665`
- **Commit:** `d65e9665409a086b3e0902d845fe592a48977db2`
- **Ticket:** —
- **Requerimiento funcional:** Integra en producción el cableado del monitor En ingreso al WebSocket de API Gateway para ver cambios de estado sin recargar.
- **Componente técnico:** merge PR #137 (`hotfix/contratacion-monitor-ws-apigw` → `main`).
- **Cambios (uno a uno):**
  - Merge a `main` del fix WS En ingreso + `CONTRATACION_WS_PUBLIC_URL` en monitor-config.

### 2026-08-05 18:59:42 · `hotfix/contratacion-monitor-ws-apigw` · `4cdddd40`
- **Commit:** `4cdddd40ee318e37139c4db0259244960101ff21`
- **Ticket:** —
- **Requerimiento funcional:** El listado En ingreso debe actualizarse solo (sin F5) cuando n8n/Dynamo cambia el estado de un candidato, usando el mismo canal donde ya publica la Lambda.
- **Componente técnico:** `react-frontend/src/contratacion/hooks/useMonitorData.js`, `react-frontend/src/contratacion/resolveContratacionWsUrl.js`, `src/contratacion/resolveContratacionWsUrl.js`, `src/contratacion/registerContratacionRoutes.js`, `tests/resolveContratacionWsUrl.test.js`, `.env.example`, `lambda/contratacion-stream/README.md`.
- **Cambios (uno a uno):**
  - Backend expone `wsUrl` en `GET /api/contratacion/monitor-config` desde `CONTRATACION_WS_PUBLIC_URL`.
  - Front conecta a API Gateway WSS con ticket; fallback al WS embebido del portal.
  - Prioridad VITE → monitor-config → mismo host; tests del helper de URL.

### 2026-08-05 12:26:32 · `main` · `446813f0`
- **Commit:** `446813f04d83da1170b7410cb752828821254940`
- **Ticket:** —
- **Requerimiento funcional:** Integra en producción el hotfix que desbloquea el intake de la Lambda (CSRF) para poder cortar los Scan masivos a Dynamo.
- **Componente técnico:** merge PR #134 (`hotfix/csrf-onboarding-intake-dynamo` → `main`).
- **Cambios (uno a uno):**
  - Merge a `main` del fix CSRF intake + docs de intervalos Dynamo en 0.

### 2026-08-05 12:25:37 · `hotfix/csrf-onboarding-intake-dynamo` · `c38ee98f`
- **Commit:** `c38ee98f1153ac05b0258aa8b6d677a0dd7cb028`
- **Ticket:** —
- **Requerimiento funcional:** Permite que la Lambda de contratación entregue novedades Zoho y promociones al portal sin ser bloqueada por CSRF, base para apagar los Scan periódicos que consumían ~370k RCU/día.
- **Componente técnico:** `server.js`, `src/csrfDoubleSubmit.js`, `tests/csrfOnboardingIntake.test.js`, `.env.example`, `lambda/contratacion-stream/README.md`, `package.json`.
- **Cambios (uno a uno):**
  - Skip CSRF condicional en intakes onboarding solo con `x-onboarding-key`.
  - Tests de no-regresión CSRF.
  - Documenta `*_INTERVAL_MS=0` con flujo por eventos.

### 2026-07-29 16:46:04 · `fix/AUT-587-prod-main` · `1b0cce68`
- **Commit:** `1b0cce682fadbbd2801e10a19c17e7b080c4db42`
- **Ticket:** AUT-587
- **Requerimiento funcional:** Corrige el Excel de horas extras/recargos en producción: sobrante en festivo como HE dominical, horarios de medianoche coherentes y vuelto post-tope tipificado con horario real.
- **Componente técnico:** `src/novedadHeExcelExport.js`, `tests/novedadHeExcelExport.test.js` (cherry-pick a main).
- **Cambios (uno a uno):**
  - Etiqueta sobrante HE con domingo o festivo en export.
  - Une segmentos contiguos al asignar franja del slice.
  - Vuelto `horas_recargo_nocturno` tras tope dom/fest como HE Nocturna Dominical.

### 2026-07-27 16:48:47 · `testing` · `7f98345d`
- **Commit:** `7f98345d6cb01e44487a15b3625e8304377d49d2`
- **Ticket:** AUT-214 (origen AUT-573)
- **Requerimiento funcional:** En la cola de cierres de facturación ya no se muestran las bolitas/stepper de estados; se mantienen progreso, estado de servicio y totales.
- **Componente técnico:** eliminado `ConciliacionesFacturacionEstadosResumen.jsx`; tarjeta `ConciliacionesColaCierresCard.jsx`; limpieza en `facturacionLogic.js`.
- **Cambios (uno a uno):**
  - Se quitó el stepper visual de bolitas en la tarjeta de cola.
  - Se eliminó el componente y helpers asociados sin uso.

### 2026-07-27 16:12:09 · `fix/AUT-545-cancelaciones-sort-keys-asc-desc` · `31762cee`
- **Commit:** `31762ceee46eb3ba72cd6fd341f16ae41246eb0e`
- **Ticket:** AUT-545
- **Requerimiento funcional:** En Cancelaciones, al hacer clic en el nombre de una columna la tabla ordena de forma ascendente/descendente de verdad (ya no parece “congelada” o desordenada cuando hay varias filas CARGANDO o con la misma cédula).
- **Componente técnico:** `CancelacionesView.jsx` (rowKey por executionId), `cancelacionesSort.js` (comparador), `SortableGestionDataTable.jsx` (key por defecto), tests `cancelacionesSort.test.js`.
- **Cambios (uno a uno):**
  - Keys de fila estables por ejecución para que React reordene el DOM.
  - Comparador numérico de cédula; sentinels CARGANDO/vacío al final; desempate por executionId.
  - Tests de asc/desc y toggleSort.

### 2026-07-27 15:50:30 · `fix/AUT-552-listo-export-tras-aprobacion` · `c0e12189`
- **Commit:** `c0e12189bea8472de057f0c4ecab2362f1088d9a`
- **Ticket:** AUT-552
- **Requerimiento funcional:** Tras aprobar el último consultor en facturación, el servicio pasa a listo para exportar y la cola se actualiza, desbloqueando el paso 3 sin quedar atascado en revisión.
- **Componente técnico:** `src/conciliaciones/conciliacionesQueries.js` (`ensureListoExportTrasAprobacion` en revisión/masiva), `react-frontend/src/conciliaciones/facturacionLogic.js` (`resolveRefreshTargets` refresca cola), `tests/facturacionRefreshLogic.test.js`.
- **Cambios (uno a uno):**
  - Tras COMMIT de aprobación individual/masiva se promueve a LISTO_EXPORT si el agregado está completo.
  - Masiva usa `skipListoExport` por fila y un ensure al final.
  - El portal refresca la cola en background tras revisión/masiva.

### 2026-07-27 15:37:03 · `fix/AUT-207-ficha-campos-zoho-vs-bd` · `fb2ec369`
- **Commit:** `fb2ec369c55617ad914e5f7eb585ea8f5baea031`
- **Ticket:** AUT-207
- **Requerimiento funcional:** En Novedades Zoho, más fichas encuentran al consultor cuando el correo trae nombre con tildes o el payload viene vacío (lee el asunto); las salidas también cruzan inactivos. Los filtros del buzón usan el mismo patrón del resto de Capital Humano (barra + panel Estado/Tipo/Match).
- **Componente técnico:** `src/onboarding/fichaNovedadesService.js` (fold nombre, subject hints, código persona), `FichaNovedadesView.jsx` (OnboardingFiltersBar/Drawer), `extractorToFichaMap` espejo, tests.
- **Cambios (uno a uno):**
  - Match por nombre con fold de tildes; extracción de nombre/cliente desde subject Zoho.
  - No usa IDs de ticket como código de persona; salidas/cancelación permiten colaborador inactivo.
  - Filtros UI: drawer Estado/Tipo/Match + búsqueda; badges de estrategia de match.

### 2026-07-27 13:32:59 · `fix/AUT-207-ficha-campos-zoho-vs-bd` · `3e0b2854`
- **Commit:** `3e0b28542a86bb0323980fd354d06162538f43bb`
- **Ticket:** AUT-207
- **Requerimiento funcional:** En Novedades Zoho, el buzón agrupa por consultor (cédula) en lugar de acumular filas; dentro del modal se elige qué ficha revisar; al aprobar se puede cerrar (rechazar) las demás pendientes del mismo consultor.
- **Componente técnico:** `fichaNovedadesService.js` (`groupInboxByCedula`, `approveNovedad` closeSiblings), rutas aprobar, `FichaNovedadesView.jsx`, tests.
- **Cambios (uno a uno):**
  - Listado inbox agrupado: badge Fichas + cambios de la más reciente; `sin_match` sueltas.
  - Selector de ficha en el modal; confirmación al aprobar con hermanas.
  - Conteo de cambios del listado recalculado vivo (incluido en el mismo flujo).

### 2026-07-27 13:11:23 · `fix/AUT-207-ficha-campos-zoho-vs-bd` · `0ecc4d57`
- **Commit:** `0ecc4d57dc2c57c1bf67bc7c3bb5372081526e12`
- **Ticket:** AUT-207
- **Requerimiento funcional:** En Novedades Zoho, el diff deja de marcar falsos cambios (solo mayúsculas, país/nacionalidad, empleador=cliente) y muestra montos en pesos; el código Zoho de modificaciones usa el ID de persona; fichas pendientes se re-aplanan al abrir.
- **Componente técnico:** `src/contratacion/extractorToFichaMap.js`, `src/onboarding/fichaNovedadesService.js`, `react-frontend/src/onboarding/FichaNovedadesView.jsx`, espejo frontend del mapa, tests.
- **Cambios (uno a uno):**
  - Mapa: sin Cliente→empleador; sin Codigo_Oportunidad→codigo; Esquema_Contratacion→tipo+esquema; Modalidad solo modalidad; nacionalidad→país canónico.
  - Diff case-insensitive y money numérico; UI con formato COP.
  - Enrich fuerza código de persona; rebuild retroactivo en GET pendiente/sin_match con `__manual_edits`.

### 2026-07-27 12:23:36 · `fix/AUT-207-ficha-campos-zoho-vs-bd` · `814e4e82`
- **Commit:** `814e4e8254edf7f40f3b872822a7788a218fde6f`
- **Ticket:** AUT-207
- **Requerimiento funcional:** En Novedades Zoho, tras un match correcto, la ficha muestra Actual alineado a Personal Activo y Propuesto enriquecido con datos del correo/Dynamo (no solo el extractor vacío).
- **Componente técnico:** `src/onboarding/fichaNovedadesService.js`, `tests/fichaNovedadesService.test.js`.
- **Cambios (uno a uno):**
  - `enrichNormalizedFromMapped` fusiona planos Dynamo/`parsed_subject` en `payload_normalizado`.
  - `getNovedadById` recalcula `diff_json` contra `colaboradores` en vivo.
  - Comparación de fechas/números más robusta en `normalizeComparable`.

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
