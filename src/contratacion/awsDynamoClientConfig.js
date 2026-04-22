'use strict';

/**
 * Configuración compartida para DynamoDBClient / Streams (región, credenciales opcionales, endpoint opcional).
 * Endpoint: LocalStack / DynamoDB Local vía `DYNAMODB_ENDPOINT` o `AWS_ENDPOINT_URL_DYNAMODB`.
 */
function buildDynamoLowLevelClientConfig(overrides = {}) {
    const awsRegion = String(overrides.region || process.env.AWS_REGION || 'us-east-1').trim() || 'us-east-1';
    const clientConfig = { region: awsRegion };
    const endpoint = String(
        overrides.endpoint != null
            ? overrides.endpoint
            : process.env.AWS_ENDPOINT_URL_DYNAMODB || process.env.DYNAMODB_ENDPOINT || ''
    ).trim();
    if (endpoint) {
        clientConfig.endpoint = endpoint;
    }
    const creds =
        overrides.credentials != null
            ? overrides.credentials
            : process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
              ? {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {})
                }
              : null;
    if (creds) {
        clientConfig.credentials = creds;
    }
    return clientConfig;
}

module.exports = { buildDynamoLowLevelClientConfig };
