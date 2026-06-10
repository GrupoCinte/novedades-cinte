# Novedades CINTE

Sistema unificado para radicacion y gestion de novedades laborales.

## Stack

- Backend: Node.js + Express
- Frontend: React + Vite
- Autenticacion: AWS Cognito (gestionada en backend) + JWT de aplicacion
- Base de datos: PostgreSQL
- Adjuntos: AWS S3 privado (fallback local en `assets/uploads`)

## Estructura del proyecto

- `server.js`: bootstrap y composicion de dependencias backend
- `src/registerRoutes.js`: rutas y validaciones API
- `src/auth.js`: helpers de autenticacion/autorizacion
- `src/rbac.js`: politica de roles y reglas por tipo de novedad
- `src/dataLayer.js`: acceso a datos, migraciones iniciales e indices
- `src/notifications/emailNotificationsPublisher.js`: publicador desacoplado de eventos de correo a Lambda
- `apps/`: microfrontends del sistema (shell y módulos remotos)
- `packages/`: librerías y configuraciones compartidas (@cinte/shared, @cinte/ui-shell, @cinte/api-client)
- `lambda/email-transactions/`: Lambda TypeScript para render de emails y envio con SES
- `tests/`: pruebas backend (unitarias + integracion + matriz RBAC)
- `docs/`: contexto funcional y auditorias tecnicas

## Requisitos

- Node.js 20+
- PostgreSQL 14+
- Credenciales/configuracion AWS Cognito (obligatorio)
- AWS S3 (opcional, segun `S3_ENABLED`)

## Variables de entorno

- Backend: copiar `.env.example` a `.env` y completar valores reales.
- Shell (Frontend): copiar `apps/shell/.env.example` a `apps/shell/.env` si es necesario (el shell usa defaults para localhost en desarrollo).

Nunca subir archivos `.env` al repositorio.

## Ejecucion local

### 1) Backend

```bash
npm install
npm run dev:backend
```

API: `http://localhost:3005`

### 2) Frontend (MFE Shell + Remotos)

```bash
npm install
npm run dev
```

UI: `http://localhost:5175` (Shell principal)

## Scripts principales

Las utilidades que antes estaban en `scripts/` no se versionan en este repositorio; permanecen en el repositorio de operaciones interno y se ejecutan desde el entorno de desarrollo autorizado, no desde el despliegue del código de aplicación.

### Backend y Monorepo (Raíz)

- `npm run dev:backend`: backend en modo watch
- `npm run dev`: arranca todos los frontends en paralelo usando Turborepo
- `npm run build`: compila todos los paquetes y aplicaciones del monorepo
- `npm run test:all`: ejecuta toda la suite de pruebas (backend + frontend)
- `npm run test`: ejecuta las pruebas del backend con node:test (con auto-descubrimiento por glob)
- `npm run test:frontend`: ejecuta las pruebas de frontend con Vitest
- `npm run build:frontend`: compila el host y sus dependencias MFE
- `npm run start`: backend normal en producción

## Seguridad aplicada

- `helmet` activo en backend
- `express-rate-limit` activo (auth, forgot, submit y catalogos)
- CORS restringido a origenes permitidos
- JWT de app obligatorio
- Tokens sensibles de Cognito no expuestos al frontend en login
- Cambio de contrasena Cognito gestionado server-side
- Auditoria de cambios de estado con `actorUserId` desde `req.user.sub`

## Flujo de correos transaccionales (SES + Lambda)

- Trigger: al registrar formulario en `POST /api/enviar-novedad`, el backend publica un evento `form_submitted`.
- Publicador: `src/notifications/emailNotificationsPublisher.js` invoca Lambda en modo asíncrono (`InvocationType=Event`).
- Lambda de correo: `lambda/email-transactions/src/handler.ts`.
- Plantillas React Email:
  - `UserConfirmationEmail` (confirmación al usuario)
  - `AdminNotificationEmail` (notificación admin con CTA)
- Envío paralelo: el handler usa `Promise.all` para enviar ambos correos con SES.

### Variables de entorno para este flujo

Backend (`.env`):
- `EMAIL_NOTIFICATIONS_ENABLED=true|false`
- `EMAIL_LAMBDA_FUNCTION_NAME=<nombre-o-arn>`
- `AWS_REGION=<region>`

Lambda (`email-transactions`):
- `SES_FROM_EMAIL=<correo-verificado-en-SES>`
- `EMAIL_ADMIN_TO=<correo-admin>` o `EMAIL_ADMIN_TO_CSV=a@x.com,b@y.com`
- `ADMIN_PLATFORM_URL=<url-dashboard-admin>`
- `AWS_REGION=<region>`

## Que debe ir a Git

- Codigo fuente (`server.js`, `src/`, `apps/`, `packages/`)
- Configuracion de proyecto (`package.json`, `turbo.json`, `packages/*/package.json`, `apps/*/package.json`)
- Tests (`tests/`, `packages/*/src/*.test.js`)
- SQL y docs utiles (`schema.postgres.sql`, `docs/`, `.env.example`)
- Lockfiles (`package-lock.json`)

## Que NO debe ir a Git

- `scripts/`, `tooling/` (operaciones locales o en repo ops interno)
- `node_modules/`
- `.env`, `.env.*` (excepto `.env.example`)
- builds y reportes: `apps/*/dist/`, `packages/*/dist/`
- temporales y logs (`*.log`, `*.tmp`, `*.temp`)
- adjuntos locales (`assets/uploads/`)

## Estado de limpieza aplicado

Se eliminaron artefactos y archivos legacy que no aportaban al uso o mantenimiento actual:

- reportes generados y builds del monolito antiguo
- readmes/metadata obsoletos de plantilla
- la carpeta física `react-frontend`

## Documentacion

> **Índice completo → [`docs/README.md`](docs/README.md)**

| Documento | Descripcion |
|-----------|------------|
| [`docs/MFE_MIGRATION.md`](docs/MFE_MIGRATION.md) | Detalles de la migración y arquitectura de Microfrontends |
| [`docs/RBAC_MATRIX.md`](docs/RBAC_MATRIX.md) | Matriz de permisos por rol |
| [`docs/plan_flujo_conciliacion.md`](docs/plan_flujo_conciliacion.md) | Plan y flujo de la funcionalidad de conciliación |
