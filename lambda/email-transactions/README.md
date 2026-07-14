# Lambda `email-transactions`

Envía correos transaccionales vía SES. Invocada de forma asíncrona desde el backend Express (`EMAIL_LAMBDA_FUNCTION_NAME`).

## Eventos soportados

| `eventType` | Uso |
| --- | --- |
| `form_submitted` | Confirmación al consultor + aviso admin al crear novedad |
| `form_status_changed` | Aprobación / rechazo de novedad |
| `conciliacion_servicio_finalizada` | Notificación automática al analista (legacy) |
| `conciliacion_correo_lider` | Correo manual al líder con tabla HTML de conciliación |

## Variables de entorno (Lambda)

- `AWS_REGION`
- `SES_FROM_EMAIL`
- `EMAIL_ADMIN_TO` o `EMAIL_ADMIN_TO_CSV` (solo eventos novedades)
- `ADMIN_PLATFORM_URL` / `EMAIL_GESTION_URL`

## Desarrollo local

```bash
cd lambda/email-transactions
npm install
npm run check
npm run build
```

## Empaquetar para AWS

```bash
cd lambda/email-transactions
npm install
npm run package
```

Genera **`deploy.zip`** en esta carpeta con: `handler.js`, `package.json`, `dist/`, `node_modules/`.

Los archivos `email-transactions-deploy-*.zip` son copias manuales antiguas; **no** usarlas: regenerar siempre con `npm run package`.

## Despliegue (AWS Lambda)

1. Subir `deploy.zip` (consola Lambda → Code → Upload from → .zip file, o AWS CLI).
2. **Handler:** `handler.handler`
3. Runtime: Node.js 20.x (o compatible con `"type": "module"`).
4. Timeout recomendado: ≥ 30 s (render React Email + SES).
5. Variables de entorno SES arriba.
6. En el backend (`.env`): `EMAIL_NOTIFICATIONS_ENABLED=true` y `EMAIL_LAMBDA_FUNCTION_NAME` = **nombre exacto** de la función en AWS.

### AWS CLI (ejemplo)

```bash
aws lambda update-function-code \
  --function-name NOMBRE_REAL_EN_AWS \
  --zip-file fileb://deploy.zip \
  --region us-east-1
```

Verificar el nombre en la consola Lambda; un nombre incorrecto produce `ResourceNotFoundException` en el backend.

## Contrato de entrada

El handler acepta evento directo (invocación async desde backend) o API Gateway con `body` JSON.

### `form_submitted` (mínimo)

```json
{
  "eventType": "form_submitted",
  "eventId": "uuid",
  "novedadId": "id",
  "user": { "name": "Nombre", "email": "user@dominio.com" },
  "admin": { "actionUrl": "https://tu-admin/admin" },
  "formData": {
    "tipoNovedad": "Incapacidad",
    "cliente": "CINTE",
    "lider": "Lider",
    "fechaInicio": "2026-04-14",
    "fechaFin": "2026-04-15",
    "cantidadHoras": 8,
    "montoCop": null,
    "estado": "Pendiente"
  },
  "meta": { "source": "backend-express", "env": "production" }
}
```

### `conciliacion_correo_lider` (mínimo)

El backend adjunta `actions.approveUrl` y `actions.rejectUrl` (magic links al frontend). Ver seguridad y contrato API en [`docs/manual-conciliaciones/email-accion-seguridad.md`](../../docs/manual-conciliaciones/email-accion-seguridad.md).

```json
{
  "eventType": "conciliacion_correo_lider",
  "eventId": "uuid",
  "conciliacionServicioId": "svc-id",
  "recipient": { "name": "Líder", "email": "lider@cliente.com" },
  "asunto": "Conciliación Servicio — junio de 2026",
  "introHtml": "<p>Estimado/a líder…</p>",
  "tableHtml": "<table>...</table>",
  "servicio": { "id": "svc-id", "serviceName": "FABRICA", "cliente": "Cliente", "anio": 2026, "mes": 6 },
  "actions": {
    "approveUrl": "https://portal/conciliaciones/email-accion?token=…&accion=approve",
    "rejectUrl": "https://portal/conciliaciones/email-accion?token=…&accion=reject"
  },
  "meta": { "source": "backend-express", "env": "production" }
}
```
