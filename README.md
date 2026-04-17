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
- `react-frontend/src/`: app React (formulario publico + dashboard admin)
- `lambda/email-transactions/`: Lambda TypeScript para render de emails y envio con SES
- `tests/`: pruebas backend (unitarias + integracion + matriz RBAC)
- `react-frontend/src/test/`: pruebas unitarias frontend
- `react-frontend/e2e/`: pruebas E2E Playwright
- `docs/`: contexto funcional y auditorias tecnicas

## Requisitos

- Node.js 20+
- PostgreSQL 14+
- Credenciales/configuracion AWS Cognito (obligatorio)
- AWS S3 (opcional, segun `S3_ENABLED`)

## Variables de entorno

- Backend: copiar `.env.example` a `.env` y completar valores reales.
- Frontend: copiar `react-frontend/.env.example` a `react-frontend/.env` solo si aplica.

Nunca subir archivos `.env` al repositorio.

## Ejecucion local

### 1) Backend

```bash
npm install
npm run dev
```

API: `http://localhost:3005`

### 2) Frontend

```bash
cd react-frontend
npm install
npm run dev
```

UI: `http://localhost:5175`

## Scripts principales

### Backend (`/`)

- `npm run dev`: backend en modo watch
- `npm run start`: backend normal
- `npm run test:all`: unit + integration + RBAC
- `node --test src/notifications/emailNotificationsPublisher.test.js`: test unitario del publisher

### Frontend (`/react-frontend`)

- `npm run dev`: frontend en desarrollo
- `npm run build`: build de produccion
- `npm run test`: unit tests
- `npm run test:coverage`: cobertura de modulos de negocio
- `npm run test:e2e`: pruebas E2E Playwright

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

- Codigo fuente (`server.js`, `src/`, `react-frontend/src/`)
- Configuracion de proyecto (`package.json`, `vitest.config.js`, `playwright.config.js`)
- Tests (`tests/`, `react-frontend/src/test/`, `react-frontend/e2e/`)
- SQL y docs utiles (`schema.postgres.sql`, `docs/`, `.env.example`)
- Lockfiles (`package-lock.json`, `react-frontend/package-lock.json`)

## Que NO debe ir a Git

- `node_modules/`
- `.env`, `.env.*` (excepto `.env.example`)
- builds y reportes: `react-frontend/dist/`, `react-frontend/coverage/`, `react-frontend/playwright-report/`, `react-frontend/test-results/`
- temporales y logs (`*.log`, `*.tmp`, `*.temp`)
- adjuntos locales (`assets/uploads/`)

## Estado de limpieza aplicado

Se eliminaron artefactos y archivos legacy que no aportaban al uso o mantenimiento actual:

- reportes generados (`coverage`, `playwright-report`, `test-results`, `dist`)
- readmes/metadata obsoletos de plantilla
- utilitarios legacy no referenciados

## Documentacion

> **Índice completo → [`docs/README.md`](docs/README.md)**

| Documento | Descripcion |
|-----------|------------|
| [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md) | Setup, workflow, convenciones de codigo |
| [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) | Referencia completa de endpoints HTTP |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Arquitectura del sistema y diagramas |
| [`docs/ENV_REFERENCE.md`](docs/ENV_REFERENCE.md) | Todas las variables de entorno |
| [`docs/RBAC_MATRIX.md`](docs/RBAC_MATRIX.md) | Matriz de permisos por rol |
| [`docs/CONTEXTO_PROYECTO.md`](docs/CONTEXTO_PROYECTO.md) | Contexto funcional del proyecto |
| [`docs/CODE_REVIEW.md`](docs/CODE_REVIEW.md) | Hallazgos y reparaciones aplicadas |
