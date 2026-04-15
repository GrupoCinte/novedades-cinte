# Lambda `email-transactions`

Envía correos transaccionales vía SES para el evento `form_submitted`.

## Variables de entorno

- `AWS_REGION`
- `SES_FROM_EMAIL`
- `EMAIL_ADMIN_TO` o `EMAIL_ADMIN_TO_CSV`
- `ADMIN_PLATFORM_URL`

## Desarrollo local

```bash
cd lambda/email-transactions
npm install
npm run check
npm run build
```

## Despliegue (AWS Lambda)

- **Handler:** `handler.handler` (usa `handler.js` en la raíz del zip, que reexporta `dist/handler.js`).
- Alternativa: Handler `dist/handler.handler` si no incluyes `handler.js` en el paquete.
- El zip debe incluir al menos: `package.json`, `node_modules/`, `dist/`, y `handler.js`.

## Contrato de entrada

El handler acepta:
- Evento directo (invocación asíncrona desde backend), o
- Evento tipo API Gateway con `body` JSON.

Payload mínimo:

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
