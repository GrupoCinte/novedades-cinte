# Contratación realtime — DynamoDB Streams → Lambda → API Gateway WebSocket

Reemplaza el `StreamPoller` Node (GetRecords periódico) por push de AWS:

1. n8n escribe en `n8n_table_state_users`
2. DynamoDB Stream invoca `StreamFunction`
3. Candidato **En ingreso** → `postToConnection` a clientes WS
4. Candidato en estado terminal (`Finalizado`, etc.) → además `POST {PORTAL_BASE_URL}/api/onboarding/intake` (promoción a Próximos / Personal)
5. Ítem `zoho_novedad` → `POST {PORTAL_BASE_URL}/api/onboarding/ficha-novedades/intake`

## Contrato mensaje WebSocket (UI En ingreso)

Misma forma que consumía el WS embebido / `useMonitorData`:

```json
{
  "type": "MODIFY",
  "data": {
    "executionId": "573001234567",
    "workflowName": "Ana Pérez",
    "currentNodeName": "Documentos Recibidos",
    "status": "running",
    "timestamp": 1710000000000,
    "email": "ana@example.com",
    "puesto": "Analista",
    "realStatus": "Documentos Recibidos",
    "statusId": 4,
    "fullData": { }
  }
}
```

- `type`: `INSERT` | `MODIFY` | `REMOVE` (también se acepta `DELETE` en el front)
- `AUTH_OK`: opcional; el front lo ignora
- Ítems Zoho **no** se emiten por este canal

Secuencia: **n8n update Dynamo → Stream → Lambda → WS message** (JSON arriba).

## Auth `$connect`

Query `?ticket=<JWT>` emitido por `GET /api/contratacion/ws-token` del portal.
Claims: `{ typ: "contratacion_ws", sub: "<user>" }`, secreto `CONTRATACION_WS_SECRET` / `JWT_SECRET` (parámetro SAM `ContratacionWsSecret`).

## Deploy (SAM)

Prerrequisitos: AWS CLI, SAM CLI, Node 20, stream ARN de la tabla.

```powershell
cd lambda/contratacion-stream
npm install
npm test

# Obtener stream ARN
aws dynamodb describe-table --table-name n8n_table_state_users --query "Table.LatestStreamArn" --output text

sam build
sam deploy --guided `
  --parameter-overrides `
    "DynamoStreamArn=arn:aws:dynamodb:...:stream/..." `
    "PortalBaseUrl=https://novedades.grupocinte.com" `
    "OnboardingIngestKey=***" `
    "ContratacionWsSecret=***" `
    "StageName=prod"
```

Salida importante: **`WebSocketUrl`** → configurar en el build del front:

```text
VITE_CONTRATACION_WS_URL=wss://xxxx.execute-api.region.amazonaws.com/prod
```

Portal / backend:

```text
CONTRATACION_STREAM_POLLER_ENABLED=false
CONTRATACION_EMBEDDED_WS_ENABLED=false
CONTRATACION_WS_SECRET=<mismo que SAM>
ONBOARDING_INGEST_KEY=<mismo que SAM>
PORTAL_BASE_URL=https://...
FICHA_NOVEDADES_DYNAMO_SYNC_ON_START=true
FICHA_NOVEDADES_DYNAMO_SYNC_INTERVAL_MS=0
ONBOARDING_DYNAMO_PROMOTE_ON_START=true
ONBOARDING_DYNAMO_PROMOTE_INTERVAL_MS=0
```

Con el intake por eventos (Stream → Lambda → portal) los intervalos periódicos deben quedar en `0`.
Un Scan al arrancar (`*_ON_START=true`) basta como red de seguridad puntual.

## Checklist smoke

1. Abrir Capital Humano → En ingreso con usuario autorizado; WS conecta (`isConnected`).
2. Cambiar `status` de un candidato en Dynamo/n8n → la fila en UI se actualiza sin F5.
3. Insertar ítem de prueba `zoho_novedad#…` → aparece en buzón Novedades Zoho; segundo evento mismo `external_id` → no duplica.
4. CloudWatch: Lambda `Invocations` ≈ eventos reales; **cero** GetRecords desde el proceso Node del portal.

## Rollback

1. `CONTRATACION_STREAM_POLLER_ENABLED=true`
2. `CONTRATACION_EMBEDDED_WS_ENABLED=true`
3. Quitar o vaciar `VITE_CONTRATACION_WS_URL` (front usa `/api/contratacion/ws` del host)
4. (Opcional) deshabilitar event source mapping de la Lambda stream en AWS

El código del poller y del WS embebido se conserva deprecated una release.

## Tests

```powershell
npm test
```

## Empaquetado manual

```powershell
npm run package
```

Genera `deploy.zip` (alternativa a `sam build`).
