'use strict';

const https = require('https');
const { NodeHttpHandler } = require('@smithy/node-http-handler');

/**
 * Configuración compartida para DynamoDBClient / Streams (región, credenciales opcionales, endpoint opcional).
 * Endpoint: LocalStack / DynamoDB Local vía `DYNAMODB_ENDPOINT` o `AWS_ENDPOINT_URL_DYNAMODB`.
 *
 * TLS: en Windows/red corporativa con proxy MITM, usar `AWS_DYNAMODB_TLS_INSECURE=true` solo en local.
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

    const tlsInsecure =
        String(process.env.AWS_DYNAMODB_TLS_INSECURE || '').trim() === '1' ||
        String(process.env.AWS_DYNAMODB_TLS_INSECURE || '').trim().toLowerCase() === 'true';
    if (tlsInsecure) {
        clientConfig.requestHandler = new NodeHttpHandler({
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });
    }

    return clientConfig;
}

module.exports = { buildDynamoLowLevelClientConfig };
