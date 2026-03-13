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
- `react-frontend/src/`: app React (formulario publico + dashboard admin)
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

## Documentacion funcional

- Contexto completo: `docs/CONTEXTO_PROYECTO.md`
- Hallazgos y reparaciones: `docs/CODE_REVIEW.md`
- Guia consolidada: `docs/2026-03-12-guia-reparacion-consolidada.md`
