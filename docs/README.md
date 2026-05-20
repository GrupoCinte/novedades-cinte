# Documentación — Novedades CINTE

> Índice maestro de toda la documentación del proyecto.  
> **Generado por barrido completo del código fuente — Abril 2026.**

---

## 📋 Para Desarrolladores

| Documento | Descripción | Audiencia |
|-----------|-------------|-----------|
| [DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md) | Setup local, ejecución, arquitectura del código, convenciones, scripts | Devs nuevos y existentes |
| [API_REFERENCE.md](./API_REFERENCE.md) | Referencia completa de todos los endpoints HTTP y WebSocket | Backend / Frontend / QA |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Arquitectura del sistema, diagramas ASCII, flujos críticos, startup | Devs senior / DevOps |
| [ENV_REFERENCE.md](./ENV_REFERENCE.md) | Todas las variables de entorno con descripción, defaults y checklist prod | Devs / DevOps |
| [RBAC_MATRIX.md](./RBAC_MATRIX.md) | Roles, paneles, aprobadores por tipo de novedad, scoping, flujo de resolución | Devs / Admin |

---

## 📖 Para Usuarios Finales

| Documento | Descripción | Audiencia |
|-----------|-------------|-----------|
| [**MANUAL_USUARIO.md**](./MANUAL_USUARIO.md) | ⭐ **Manual unificado** — colaboradores, admin, cotizador, contratación, directorio | Todos los usuarios |
| [MANUAL_USUARIO_FORMULARIO_NOVEDADES.md](./MANUAL_USUARIO_FORMULARIO_NOVEDADES.md) | Guía rápida del formulario público de novedades | Colaboradores |
| [MANUAL_ADMINISTRACION_PORTAL.md](./MANUAL_ADMINISTRACION_PORTAL.md) | Guía del portal administrativo y módulos | Usuarios admin |

---

## 🏗️ Contexto y Auditorías

| Documento | Descripción |
|-----------|-------------|
| [CONTEXTO_PROYECTO.md](./CONTEXTO_PROYECTO.md) | Estado funcional del proyecto e iteraciones anteriores |
| [CODE_REVIEW.md](./CODE_REVIEW.md) | Hallazgos de revisión de código y mejoras aplicadas |
| [2026-03-12-guia-reparacion-consolidada.md](./2026-03-12-guia-reparacion-consolidada.md) | Guía consolidada de reparaciones (marzo 2026) |

---

## 🗄️ Base de Datos y Datos

| Documento | Descripción |
|-----------|-------------|
| [../schema.postgres.sql](../schema.postgres.sql) | Esquema DDL completo de PostgreSQL |
| [colaboradores-cedulas-sinteticas.md](./colaboradores-cedulas-sinteticas.md) | Cédulas sintéticas para pruebas |
| [consultores-activos-sin-match.md](./consultores-activos-sin-match.md) | Reporte de consultores sin match en el sistema |

---

## 🔍 Navegación Rápida

| Pregunta | Ir a |
|----------|------|
| ¿Cómo arranco el proyecto? | [DEVELOPER_GUIDE.md §5 Ejecución local](./DEVELOPER_GUIDE.md#5-ejecución-local) |
| ¿Qué endpoints existen? | [API_REFERENCE.md](./API_REFERENCE.md) |
| ¿Qué variable de entorno necesito? | [ENV_REFERENCE.md](./ENV_REFERENCE.md) |
| ¿Qué puede hacer cada rol? | [RBAC_MATRIX.md](./RBAC_MATRIX.md) |
| ¿Cómo agrego un endpoint nuevo? | [DEVELOPER_GUIDE.md §10](./DEVELOPER_GUIDE.md#10-agregar-un-nuevo-endpoint-paso-a-paso) |
| ¿Cómo agrego un nuevo tipo de novedad? | [DEVELOPER_GUIDE.md §11](./DEVELOPER_GUIDE.md#11-agregar-un-nuevo-tipo-de-novedad) |
| ¿Cómo funciona WebSocket de contratación? | [ARCHITECTURE.md §7.4](./ARCHITECTURE.md#74-websocket-contratación-tiempo-real) |
| ¿Cómo usa el sistema un colaborador? | [MANUAL_USUARIO.md Parte I](./MANUAL_USUARIO.md#parte-i--colaborador-formulario-de-novedades) |
| ¿Cómo aprueba/rechaza un admin? | [MANUAL_USUARIO.md §7.3](./MANUAL_USUARIO.md#73-pestaña-gestión-tabla-principal) |
| ¿Cómo funciona la secuencia de arranque? | [ARCHITECTURE.md §8](./ARCHITECTURE.md#8-secuencia-de-arranque) |

---

## 📊 Cobertura de Documentación

| Área | Estado | Documento |
|------|:------:|-----------|
| API Endpoints (core, cotizador, contratación, directorio) | ✅ 100% | API_REFERENCE.md |
| WebSocket (protocolo, tickets, eventos) | ✅ 100% | API_REFERENCE.md §7, ARCHITECTURE.md §7.4 |
| Variables de entorno (~50 variables) | ✅ 100% | ENV_REFERENCE.md |
| Roles y permisos (7 roles, 16 tipos novedad) | ✅ 100% | RBAC_MATRIX.md |
| Arquitectura del sistema | ✅ Completa | ARCHITECTURE.md |
| Flujos críticos (login, submit, aprobar, WS) | ✅ 100% | ARCHITECTURE.md §7 |
| Secuencia de arranque | ✅ 100% | ARCHITECTURE.md §8 |
| Onboarding desarrollador | ✅ Completo | DEVELOPER_GUIDE.md |
| Manual colaborador | ✅ Completo | MANUAL_USUARIO.md Parte I |
| Manual admin / gp / nomina | ✅ Completo | MANUAL_USUARIO.md Parte II |
| Manual cotizador | ✅ Completo | MANUAL_USUARIO.md Parte III |
| Manual contratación | ✅ Completo | MANUAL_USUARIO.md Parte IV |
| Manual directorio | ✅ Completo | MANUAL_USUARIO.md Parte V |
| Base de datos (schema DDL) | ✅ DDL completo | schema.postgres.sql |
| Lambda de email | ✅ Cubierto | ARCHITECTURE.md §9 |
| Docker / Caddy / Reverse proxy | ✅ Cubierto | ARCHITECTURE.md §10 |
| Scripts de mantenimiento (15 scripts) | ✅ Cubierto | DEVELOPER_GUIDE.md §13 |

---

*Documentación generada: Abril 2026 · Proyecto Novedades CINTE — Grupo CINTE*
