'use strict';

const https = require('https');
const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const { NodeHttpHandler } = require('@smithy/node-http-handler');

const DEFAULT_MODEL_ID = 'global.amazon.nova-2-lite-v1:0';

function isNovaModel(modelId) {
    return String(modelId || '').includes('amazon.nova');
}

function isAwsTlsInsecure() {
    const flags = [
        process.env.AWS_BEDROCK_TLS_INSECURE,
        process.env.SOURCING_BEDROCK_TLS_INSECURE,
        process.env.AWS_TLS_INSECURE
    ];
    return flags.some((value) => {
        const normalized = String(value || '').trim().toLowerCase();
        return normalized === '1' || normalized === 'true';
    });
}

function buildBedrockClientConfig() {
    const region = String(process.env.AWS_REGION || 'us-east-1').trim() || 'us-east-1';
    const config = { region };
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        config.credentials = {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {})
        };
    }
    if (isAwsTlsInsecure()) {
        config.requestHandler = new NodeHttpHandler({
            httpsAgent: new https.Agent({ rejectUnauthorized: false })
        });
    }
    return config;
}

function getBedrockModelId() {
    return String(
        process.env.SOURCING_BEDROCK_MODEL_ID || process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL_ID
    ).trim();
}

function isBedrockConfigured() {
    const disabled =
        String(process.env.SOURCING_BEDROCK_ENABLED || 'true').trim().toLowerCase() === 'false';
    if (disabled) return false;
    return Boolean(getBedrockModelId());
}

function extractConverseText(response) {
    const blocks = response?.output?.message?.content;
    if (!Array.isArray(blocks)) return '';
    return blocks
        .map((block) => (block && typeof block.text === 'string' ? block.text : ''))
        .join('')
        .trim();
}

/**
 * @param {{ system?: string, user: string, maxTokens?: number, temperature?: number }} opts
 */
async function bedrockConverse({ system, user, maxTokens = 1024, temperature = 0.2 }) {
    const client = new BedrockRuntimeClient(buildBedrockClientConfig());
    const messages = [{ role: 'user', content: [{ text: String(user || '') }] }];
    const modelId = getBedrockModelId();
    const input = {
        modelId,
        messages,
        inferenceConfig: {
            maxTokens: Math.min(Math.max(Number(maxTokens) || 1024, 256), 4096),
            temperature: Math.min(Math.max(Number(temperature) || 0.2, 0), 1)
        }
    };
    if (system && String(system).trim()) {
        input.system = [{ text: String(system).trim() }];
    }
    if (isNovaModel(modelId)) {
        // Parse/scoring estructurado: reasoning off = más rápido y barato.
        input.additionalModelRequestFields = {
            reasoningConfig: { type: 'disabled' }
        };
    }
    const response = await client.send(new ConverseCommand(input));
    return extractConverseText(response);
}

module.exports = {
    bedrockConverse,
    buildBedrockClientConfig,
    getBedrockModelId,
    isAwsTlsInsecure,
    isBedrockConfigured,
    isNovaModel,
    extractConverseText,
    DEFAULT_MODEL_ID
};
