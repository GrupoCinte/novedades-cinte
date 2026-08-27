# AUT-319 — Contratos por vencer (AWS)

Pipeline diario desacoplado del portal Node y de `email-transactions` / `seguimiento-reminders`.

## Componentes

| Pieza | Recurso |
| --- | --- |
| Procesador | `lambda/contratos-vencimiento` |
| Schedule | EventBridge `cron(0 13 * * ? *)` America/Bogota (08:00) — **regla propia**, no la de actas |

## Flujo

1. EventBridge dispara la Lambda 1×/día.
2. Recorre tandas **T30 → T15 → T5** (día exacto).
3. Por tanda pide al portal `GET /api/onboarding/internal/elegibles-vencimiento`.
4. Si hay contratos y destinatarios (Admin CH + Team CH), envía **un** correo SES con el listado.
5. Si SES pegó, `POST /api/onboarding/internal/marcar-vencimiento` marca la bandera. Si SES falló, no marca. La tanda siguiente sigue.

## Variables

- `API_BASE_URL` + `CONTRATOS_VENCIMIENTO_TOKEN` (propio; no reutilizar el de actas)
- `SES_FROM_EMAIL`
- `AS_OF_DATE` opcional, solo fuera de production

El portal no registra cron. La pastilla y la lista **Por vencer** viven en Capital Humano (ventana 30/15/5).

## Deploy (cuando se autorice)

```powershell
node infra/contratos-vencimiento/deploy.js
```
