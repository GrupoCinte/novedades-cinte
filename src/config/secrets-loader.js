
'use strict';

/**
 * @module secrets-loader
 *
 * Carga secretos desde AWS Secrets Manager y los inyecta en process.env.
 *
 * Flujo:
 *   .env → bootstrap.js → Secrets Manager → process.env → server.js
 *
 * Alcance:
 *   - Carga de secretos al iniciar la aplicación.
 *   - Soporte para AWS Secrets Manager.
 *   - Soporte para LocalStack durante desarrollo/pruebas.
 *   - En producción, un fallo de Secrets Manager impide el arranque.
 */

const {
    SecretsManagerClient,
    GetSecretValueCommand
} = require('@aws-sdk/client-secrets-manager');

let _cachedSecrets = null;

let _metadata = {
    secretId: null,
    region: null,
    loadedAt: null,
    keyCount: 0,
    activeVersion: null,
    arn: null
};

/**
 * Construye el cliente de AWS Secrets Manager.
 *
 * En AWS:
 *   - No se define endpoint.
 *   - El SDK utiliza la cadena de credenciales de AWS,
 *     incluyendo IAM Role en producción.
 *
 * En LocalStack:
 *   - AWS_ENDPOINT_URL apunta al contenedor LocalStack.
 */
function buildClient(region) {
    const endpointUrl = (process.env.AWS_ENDPOINT_URL || '').trim();

    const clientConfig = {
        region
    };

    if (endpointUrl) {
        clientConfig.endpoint = endpointUrl;

        if (endpointUrl.startsWith('http://')) {
            clientConfig.forcePathStyle = true;
        }
    }

    return new SecretsManagerClient(clientConfig);
}

/**
 * Obtiene el secreto desde AWS Secrets Manager.
 *
 * El secreto debe contener un objeto JSON:
 *
 * {
 *   "JWT_SECRET": "...",
 *   "DB_PASSWORD": "...",
 *   "COGNITO_APP_CLIENT_SECRET": "..."
 * }
 */
async function fetchSecret(secretId, region) {
    const client = buildClient(region);

    const command = new GetSecretValueCommand({
        SecretId: secretId
    });

    const response = await client.send(command);

    const raw = response.SecretString;

    if (!raw) {
        throw new Error(
            `[secrets-loader] El secreto "${secretId}" existe pero SecretString está vacío.`
        );
    }

    let parsed;

    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error(
            `[secrets-loader] El secreto "${secretId}" no contiene un JSON válido.`
        );
    }

    if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
    ) {
        throw new Error(
            `[secrets-loader] El secreto "${secretId}" debe ser un objeto JSON.`
        );
    }

    _metadata = {
        ..._metadata,
        secretId,
        region,
        activeVersion: response.VersionId || null,
        arn: response.ARN || null
    };

    return parsed;
}

/**
 * Carga los secretos desde Secrets Manager.
 *
 * Si USE_AWS_SECRETS_MANAGER=false:
 *   no hace ninguna llamada a AWS.
 *
 * Si USE_AWS_SECRETS_MANAGER=true:
 *   obtiene el secreto y lo inyecta en process.env.
 */
async function loadSecrets() {
    const enabled =
        String(process.env.USE_AWS_SECRETS_MANAGER || 'false')
            .trim()
            .toLowerCase() === 'true';

    if (!enabled) {
        return {};
    }

    const secretId = (process.env.AWS_SECRET_NAME || '').trim();

    const region =
        (process.env.AWS_REGION || 'us-east-1').trim();

    const isProduction =
        String(process.env.NODE_ENV || '')
            .trim()
            .toLowerCase() === 'production';

    if (!secretId) {
        const message =
            '[secrets-loader] USE_AWS_SECRETS_MANAGER=true pero AWS_SECRET_NAME no está definido.';

        if (isProduction) {
            throw new Error(message);
        }

        console.warn(message);
        return {};
    }

    console.log(
        `[secrets-loader] Cargando secreto "${secretId}" desde Secrets Manager (región: ${region}).`
    );

    const secrets = await fetchSecret(secretId, region);

    let injectedCount = 0;

    for (const [key, value] of Object.entries(secrets)) {
        if (value === null || value === undefined) {
            continue;
        }

        process.env[key] =
            typeof value === 'string'
                ? value
                : String(value);

        injectedCount++;
    }

    _cachedSecrets = secrets;

    _metadata = {
        ..._metadata,
        secretId,
        region,
        loadedAt: new Date().toISOString(),
        keyCount: injectedCount
    };

    console.log(
        `[secrets-loader] ${injectedCount} claves cargadas desde Secrets Manager: [${Object.keys(secrets).join(', ')}].`
    );

    return secrets;
}

/**
 * Carga los secretos y maneja el comportamiento
 * diferente entre desarrollo y producción.
 */
async function loadSecretsIntoEnv() {
    const enabled =
        String(process.env.USE_AWS_SECRETS_MANAGER || 'false')
            .trim()
            .toLowerCase() === 'true';

    if (!enabled) {
        return;
    }

    const isProduction =
        String(process.env.NODE_ENV || '')
            .trim()
            .toLowerCase() === 'production';

    try {
        await loadSecrets();
    } catch (error) {
        if (isProduction) {
            console.error(
                '[secrets-loader] FATAL: No se pudieron cargar los secretos desde AWS Secrets Manager.'
            );

            console.error(
                `[secrets-loader] Error: ${error.code || error.name || 'UnknownError'}`
            );

            throw error;
        }

        console.warn(
            '[secrets-loader] ADVERTENCIA: No se pudo cargar Secrets Manager. Se continuará con .env local.'
        );

        console.warn(
            `[secrets-loader] Error: ${error.code || error.name || 'UnknownError'}`
        );
    }
}

/**
 * Obtiene un secreto cargado previamente.
 *
 * No realiza una nueva llamada a AWS.
 */
function get(key) {
    if (!_cachedSecrets) {
        return undefined;
    }

    return _cachedSecrets[key];
}

/**
 * Devuelve únicamente metadata de la última carga.
 *
 * No devuelve valores sensibles.
 */
function getSecretMetadata() {
    return {
        ..._metadata
    };
}

module.exports = {
    loadSecrets,
    loadSecretsIntoEnv,
    get,
    getSecretMetadata
};

