'use strict';

/**
 * bootstrap.js — Punto de entrada alternativo para producción con Secrets Manager.
 *
 * Flujo:
 *   1. dotenv carga .env (si existe) → valores base en process.env
 *   2. loadSecretsIntoEnv() → si USE_AWS_SECRETS_MANAGER=true, sobreescribe con
 *      los valores de AWS Secrets Manager (IAM Role o LocalStack)
 *   3. require('./server.js') → server.js ve process.env ya completo y válido
 *
 * Para desarrollo local (USE_AWS_SECRETS_MANAGER=false o no definido):
 *   El paso 2 es un no-op y server.js funciona exactamente igual que antes.
 *
 * Uso:
 *   node --use-system-ca bootstrap.js          # producción con Secrets Manager
 *   node bootstrap.js                          # desarrollo local (igual que node server.js)
 *
 * Variables de entorno requeridas cuando USE_AWS_SECRETS_MANAGER=true:
 *   AWS_SECRET_NAME   - nombre/ARN del secreto (ej: 'cinte/production/secrets')
 *   AWS_REGION        - región AWS (ya usada en el resto del proyecto)
 *
 * Variables opcionales:
 *   AWS_ENDPOINT_URL  - endpoint de LocalStack (ej: http://localhost:4566)
 */

// Paso 1: cargar .env antes de cualquier otra cosa
require('dotenv').config({ override: true });

// Paso 2: cargar secretos de Secrets Manager si está habilitado
const { loadSecretsIntoEnv } = require('./src/config/secrets-loader');

(async () => {
    await loadSecretsIntoEnv();

    // Paso 3: requerir server.js ahora que process.env está completo
    // El require es síncrono; server.js lee process.env en el scope del módulo,
    // por lo que debe ejecutarse DESPUÉS de que loadSecretsIntoEnv() haya terminado.
    require('./server.js');
})().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[bootstrap] FATAL: No se pudo inicializar el backend.');
    // Solo imprimimos el tipo de error, no el mensaje completo (puede contener paths sensibles)
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
});
