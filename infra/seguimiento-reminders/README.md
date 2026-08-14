# AUT-286 — Recordatorios T-5 / T-1 (AWS)

Pipeline diario desacoplado del portal Node (sin cron en `server.js`).

## Componentes

| Pieza | Path / recurso |
| --- | --- |
| Selector | `lambda/seguimiento-reminders/selector` |
| Worker | `lambda/seguimiento-reminders/worker` |
| Cola | SQS + DLQ |
| Schedule | EventBridge Scheduler `cron(0 13 * * ? *)` o equivalente 08:00 America/Bogota |

## Flujo

1. EventBridge dispara selector 1×/día (zona `America/Bogota`).
2. Selector lista actas elegibles (días exactos 5 y 1; flags null) vía PG o `GET /api/seguimiento/internal/elegibles-recordatorio`.
3. Encola `{ seguimientoId, kind: "T5"|"T1", cicloVenceAt }`.
4. Worker llama `POST /api/seguimiento/internal/process-reminder` (publisher + flags).

## Variables

- Selector: `QUEUE_URL`, `DATABASE_URL` **o** (`API_BASE_URL` + `INTERNAL_TOKEN`)
- Worker: `API_BASE_URL`, `INTERNAL_TOKEN` (secreto aleatorio M2M; no usar un JWT de usuario)
- El portal también acepta JWT de CAC / Super administrador en esas rutas internas (uso manual). El token de las Lambdas debe ser el secreto, no la sesión de una persona.

## Nota

El portal solo muestra UI “Próximos a vencer” (lectura PG). El envío de correo de vencimiento corre aquí.
