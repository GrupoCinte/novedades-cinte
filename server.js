require('dotenv').config({ override: true });
const express = require('express');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { CognitoJwtVerifier } = require('aws-jwt-verify');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Pool } = require('pg');
const {
    POLICY,
    normalizeRoleOrNull,
    resolveRoleFromGroups,
    getAreaFromRole,
    getNovedadRuleByType,
    canRoleViewType,
    canRoleApproveType,
    inferAreaFromNovedad
} = require('./src/rbac');
const {
    parseDateOrNull,
    parseTimeOrNull,
    normalizeCatalogValue,
    normalizeEstado,
    isStrongPassword,
    sanitizeSegment,
    sanitizeFileName,
    buildS3SupportKey,
    decodeJwtPayload
} = require('./src/utils');
const { createAuthHelpers } = require('./src/auth');
const { toClientNovedad } = require('./src/novedadesMapper');
const { createDataLayer } = require('./src/dataLayer');

const app = express();
const PORT = process.env.PORT || 3005;

const SECRET_KEY = (process.env.JWT_SECRET || '').trim();
if (!SECRET_KEY) {
    throw new Error('FATAL: JWT_SECRET es obligatorio.');
}
if (process.env.NODE_ENV === 'production' && SECRET_KEY.length < 32) {
    throw new Error('FATAL: JWT_SECRET debe tener al menos 32 caracteres en producción.');
}
if (process.env.NODE_ENV !== 'production' && SECRET_KEY.length < 32) {
    console.warn('[SECURITY] JWT_SECRET tiene menos de 32 caracteres (recomendado para desarrollo: >= 32).');
}
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5175';
const COGNITO_ENABLED = String(process.env.COGNITO_ENABLED || 'false').toLowerCase() === 'true';
if (!COGNITO_ENABLED) {
    throw new Error('FATAL: COGNITO_ENABLED=true es obligatorio. La autenticación local fue eliminada.');
}
const COGNITO_REGION = (process.env.COGNITO_REGION || '').trim();
const COGNITO_USER_POOL_ID = (process.env.COGNITO_USER_POOL_ID || '').trim();
const COGNITO_APP_CLIENT_ID = (process.env.COGNITO_APP_CLIENT_ID || '').trim();
const COGNITO_APP_CLIENT_SECRET = (process.env.COGNITO_APP_CLIENT_SECRET || '').trim();
if (!COGNITO_REGION || !COGNITO_USER_POOL_ID || !COGNITO_APP_CLIENT_ID) {
    throw new Error('FATAL: Configuración Cognito incompleta (COGNITO_REGION, COGNITO_USER_POOL_ID, COGNITO_APP_CLIENT_ID).');
}
const S3_ENABLED = String(process.env.S3_ENABLED || 'false').toLowerCase() === 'true';
const S3_BUCKET_NAME = (process.env.S3_BUCKET_NAME || '').trim();
const S3_REGION = (process.env.AWS_REGION || process.env.S3_REGION || COGNITO_REGION || 'us-east-1').trim();
const S3_SIGNED_URL_TTL_SEC = Number(process.env.S3_SIGNED_URL_TTL_SEC || 300);
const S3_AUTH_MODE = String(process.env.S3_AUTH_MODE || 'role').toLowerCase(); // role | keys
const DB_PASSWORD = (process.env.DB_PASSWORD || '').trim();
if (!DB_PASSWORD) {
    throw new Error('FATAL: DB_PASSWORD es obligatorio.');
}

const allowedCorsOrigins = new Set([
    FRONTEND_URL,
    'http://localhost:5175',
    'http://127.0.0.1:5175'
]);

app.set('trust proxy', 1);
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(cors({
    origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedCorsOrigins.has(origin)) return callback(null, true);
        try {
            const parsed = new URL(origin);
            if (parsed.hostname.endsWith('.trycloudflare.com')) {
                return callback(null, true);
            }
        } catch {
            // Ignorar origen malformado y rechazar.
        }
        return callback(new Error('Origen no permitido por CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use('/assets', express.static(path.join(__dirname, 'assets')));

const AUTH_RATE_LIMIT_WINDOW_MIN = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MIN || 15);
const AUTH_RATE_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX || 10);
const FORGOT_RATE_LIMIT_WINDOW_MIN = Number(process.env.FORGOT_RATE_LIMIT_WINDOW_MIN || 60);
const FORGOT_RATE_LIMIT_MAX = Number(process.env.FORGOT_RATE_LIMIT_MAX || 5);
const FORM_SUBMIT_RATE_LIMIT_WINDOW_MIN = Number(process.env.FORM_SUBMIT_RATE_LIMIT_WINDOW_MIN || 60);
const FORM_SUBMIT_RATE_LIMIT_MAX = Number(process.env.FORM_SUBMIT_RATE_LIMIT_MAX || 10);

const authLimiter = rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MIN * 60 * 1000,
    max: AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, message: `Demasiados intentos. Espera ${AUTH_RATE_LIMIT_WINDOW_MIN} minutos.` }
});

const forgotLimiter = rateLimit({
    windowMs: FORGOT_RATE_LIMIT_WINDOW_MIN * 60 * 1000,
    max: FORGOT_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, message: `Demasiadas solicitudes. Espera ${FORGOT_RATE_LIMIT_WINDOW_MIN} minutos.` }
});

const submitLimiter = rateLimit({
    windowMs: FORM_SUBMIT_RATE_LIMIT_WINDOW_MIN * 60 * 1000,
    max: FORM_SUBMIT_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: `Demasiados envíos. Espera ${FORM_SUBMIT_RATE_LIMIT_WINDOW_MIN} minutos.` }
});
const CATALOG_RATE_LIMIT_WINDOW_MIN = Number(process.env.CATALOG_RATE_LIMIT_WINDOW_MIN || 5);
const CATALOG_RATE_LIMIT_MAX = Number(process.env.CATALOG_RATE_LIMIT_MAX || 120);
const catalogLimiter = rateLimit({
    windowMs: CATALOG_RATE_LIMIT_WINDOW_MIN * 60 * 1000,
    max: CATALOG_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, error: 'Demasiadas consultas de catálogo. Intenta de nuevo en unos minutos.' }
});

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'novedades_cinte',
    user: process.env.DB_USER || 'cinte_app',
    password: DB_PASSWORD
});

const CLIENTES_LIDERES_XLSX_PATH = String(process.env.CLIENTES_LIDERES_XLSX_PATH || '').trim();

const cognitoIdVerifier = (
    COGNITO_ENABLED && COGNITO_USER_POOL_ID && COGNITO_APP_CLIENT_ID
) ? CognitoJwtVerifier.create({
    userPoolId: COGNITO_USER_POOL_ID,
    tokenUse: 'id',
    clientId: COGNITO_APP_CLIENT_ID
}) : null;

const cognitoAccessVerifier = (
    COGNITO_ENABLED && COGNITO_USER_POOL_ID && COGNITO_APP_CLIENT_ID
) ? CognitoJwtVerifier.create({
    userPoolId: COGNITO_USER_POOL_ID,
    tokenUse: 'access',
    clientId: COGNITO_APP_CLIENT_ID
}) : null;

const s3Client = (S3_ENABLED && S3_BUCKET_NAME) ? new S3Client({
    region: S3_REGION,
    ...(S3_AUTH_MODE === 'keys' && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {})
        }
    } : {})
}) : null;

const {
    resolveEffectiveRole,
    issueAppTokenFromCognito,
    buildUserFromCognitoClaims,
    buildCognitoSecretHash,
    cognitoPublicApi,
    verificarToken,
    allowPanel,
    allowAnyPanel,
    applyScope
} = createAuthHelpers({
    jwt,
    SECRET_KEY,
    COGNITO_ENABLED,
    COGNITO_REGION,
    COGNITO_APP_CLIENT_ID,
    COGNITO_APP_CLIENT_SECRET,
    cognitoIdVerifier,
    cognitoAccessVerifier,
    POLICY,
    normalizeRoleOrNull,
    resolveRoleFromGroups,
    getAreaFromRole
});

const uploadDir = path.join(__dirname, 'assets', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const allowedMimes = new Set([
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);
const allowedExt = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.xls', '.xlsx']);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 10 }
});

const {
    ensureUserRoleEnumValues,
    ensureClientesLideresTable,
    ensureNovedadesIndexes,
    migrateClientesLideresFromExcelIfNeeded,
    getClientesList,
    getLideresByCliente,
    migrateExcelIfNeeded,
    getScopedNovedades
} = createDataLayer({
    pool,
    fs,
    xlsx,
    CLIENTES_LIDERES_XLSX_PATH,
    normalizeCatalogValue,
    canRoleViewType
});

const { registerRoutes } = require('./src/registerRoutes');
const { startServer } = require('./src/startup');

registerRoutes({
    app,
    authLimiter,
    forgotLimiter,
    submitLimiter,
    catalogLimiter,
    verificarToken,
    isStrongPassword,
    COGNITO_ENABLED,
    COGNITO_APP_CLIENT_ID,
    buildCognitoSecretHash,
    cognitoPublicApi,
    decodeJwtPayload,
    buildUserFromCognitoClaims,
    resolveEffectiveRole,
    issueAppTokenFromCognito,
    allowPanel,
    applyScope,
    getScopedNovedades,
    toClientNovedad,
    allowAnyPanel,
    getClientesList,
    normalizeCatalogValue,
    getLideresByCliente,
    upload,
    getNovedadRuleByType,
    path,
    allowedMimes,
    allowedExt,
    s3Client,
    buildS3SupportKey,
    S3_BUCKET_NAME,
    sanitizeFileName,
    sanitizeSegment,
    fs,
    uploadDir,
    inferAreaFromNovedad,
    parseDateOrNull,
    parseTimeOrNull,
    pool,
    S3_SIGNED_URL_TTL_SEC,
    PutObjectCommand,
    GetObjectCommand,
    getSignedUrl,
    normalizeEstado,
    canRoleApproveType,
    FRONTEND_URL,
    POLICY
});

startServer({
    app,
    pool,
    ensureUserRoleEnumValues,
    ensureClientesLideresTable,
    ensureNovedadesIndexes,
    migrateExcelIfNeeded,
    migrateClientesLideresFromExcelIfNeeded,
    PORT,
    COGNITO_ENABLED,
    COGNITO_REGION,
    COGNITO_USER_POOL_ID,
    COGNITO_APP_CLIENT_SECRET,
    s3Client,
    S3_BUCKET_NAME,
    S3_REGION,
    S3_AUTH_MODE
}).catch((error) => {
    console.error('Fallo inicializando servidor:', error);
    process.exit(1);
});
