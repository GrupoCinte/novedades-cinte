require('dotenv').config({ override: true });
const express = require('express');
const { logger } = require('./src/logger');
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { CognitoJwtVerifier } = require('aws-jwt-verify');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { LambdaClient } = require('@aws-sdk/client-lambda');
const { CognitoIdentityProviderClient } = require('@aws-sdk/client-cognito-identity-provider');
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
    normalizeCedula,
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
const { createCotizadorStore } = require('./src/cotizador/cotizadorStore');
const { createTiRolesStore } = require('./src/cotizador/tiRolesStore');
const { registerCotizadorRoutes } = require('./src/cotizador/registerCotizadorRoutes');
const { registerTiRolesRoutes } = require('./src/cotizador/registerTiRolesRoutes');
const { registerContratacionRoutes } = require('./src/contratacion/registerContratacionRoutes');
const { registerDirectorioRoutes } = require('./src/directorio/registerDirectorioRoutes');
const { registerConciliacionesRoutes } = require('./src/conciliaciones/registerConciliacionesRoutes');
const { createEmailNotificationsPublisher } = require('./src/notifications/emailNotificationsPublisher');
const { createResolveApproverEmailsFromCognito } = require('./src/notifications/resolveApproverEmailsFromCognito');

const app = express();
const PORT = process.env.PORT || 3005;
/** Producción real (EC2, etc.): `NODE_ENV=production`. En local deja `development` o sin definir. */
const isProduction = process.env.NODE_ENV === 'production';
/**
 * Orígenes `*.trycloudflare.com` (Quick Tunnel): permitidos siempre en no-producción.
 * Si por error tienes `NODE_ENV=production` en tu PC pero sigues usando el túnel, define `CORS_ALLOW_TRY_CLOUDFLARE=1`.
 * En el servidor de producción no actives esto salvo que sepas por qué.
 */
const corsAllowTryCloudflare =
    !isProduction ||
    String(process.env.CORS_ALLOW_TRY_CLOUDFLARE || '').toLowerCase() === 'true' ||
    String(process.env.CORS_ALLOW_TRY_CLOUDFLARE || '').trim() === '1';

const SECRET_KEY = (process.env.JWT_SECRET || '').trim();
if (!SECRET_KEY) {
    throw new Error('FATAL: JWT_SECRET es obligatorio.');
}
if (SECRET_KEY.length < 32) {
    throw new Error('FATAL: JWT_SECRET debe tener al menos 32 caracteres en todos los entornos (HIGH-001).');
}
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5175';
const CORS_EXTRA_ORIGINS = String(process.env.CORS_EXTRA_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const COGNITO_ENABLED = String(process.env.COGNITO_ENABLED || 'true').toLowerCase() === 'true';
const COGNITO_REGION = (process.env.COGNITO_REGION || 'us-east-1').trim();
const COGNITO_USER_POOL_ID = (process.env.COGNITO_USER_POOL_ID || 'us-east-1_dev').trim();
const COGNITO_APP_CLIENT_ID = (process.env.COGNITO_APP_CLIENT_ID || 'dev-client-id').trim();
const COGNITO_APP_CLIENT_SECRET = (process.env.COGNITO_APP_CLIENT_SECRET || '').trim();
// Para desarrollo local, permita funcionar sin Cognito completo
if (isProduction && !COGNITO_ENABLED) {
    throw new Error('FATAL: COGNITO_ENABLED=true es obligatorio en producción.');
}
if (isProduction && (!COGNITO_REGION || !COGNITO_USER_POOL_ID || !COGNITO_APP_CLIENT_ID)) {
    throw new Error('FATAL: Configuración Cognito incompleta en producción.');
}
const S3_ENABLED = String(process.env.S3_ENABLED || 'false').toLowerCase() === 'true';
const S3_BUCKET_NAME = (process.env.S3_BUCKET_NAME || '').trim();
const S3_REGION = (process.env.AWS_REGION || process.env.S3_REGION || COGNITO_REGION || 'us-east-1').trim();
const S3_SIGNED_URL_TTL_SEC = Number(process.env.S3_SIGNED_URL_TTL_SEC || 300);
const S3_AUTH_MODE = String(process.env.S3_AUTH_MODE || 'role').toLowerCase(); // role | keys
const EMAIL_NOTIFICATIONS_ENABLED = String(process.env.EMAIL_NOTIFICATIONS_ENABLED || 'false').toLowerCase() === 'true';
const EMAIL_LAMBDA_FUNCTION_NAME = String(process.env.EMAIL_LAMBDA_FUNCTION_NAME || '').trim();
const DB_PASSWORD = (process.env.DB_PASSWORD || '').trim();
if (!DB_PASSWORD) {
    throw new Error('FATAL: DB_PASSWORD es obligatorio.');
}

const allowedCorsOrigins = new Set([
    FRONTEND_URL,
    'http://localhost:5175',
    'http://127.0.0.1:5175',
    // Vite elige otro puerto si 5175 está ocupado (p. ej. 5176); el proxy reenvía ese Origin.
    'http://localhost:5176',
    'http://127.0.0.1:5176',
    'http://localhost:5177',
    'http://127.0.0.1:5177'
]);
try {
    const parsedFrontend = new URL(FRONTEND_URL);
    const host = parsedFrontend.hostname || '';
    if (host.startsWith('www.')) {
        const nakedHost = host.replace(/^www\./, '');
        allowedCorsOrigins.add(`${parsedFrontend.protocol}//${nakedHost}`);
    } else if (host && host.includes('.')) {
        allowedCorsOrigins.add(`${parsedFrontend.protocol}//www.${host}`);
    }
} catch {
    // Ignorar FRONTEND_URL malformado y conservar la lista base.
}
for (const o of CORS_EXTRA_ORIGINS) {
    allowedCorsOrigins.add(o);
}

/** Orígenes de IdP Microsoft en redirecciones OIDC (GET al callback pueden traer Origin del IdP, no del SPA). */
function isMicrosoftEntraOidcOrigin(hostname) {
    const h = String(hostname || '').toLowerCase();
    if (!h) return false;
    if (h === 'login.microsoftonline.com' || h.endsWith('.login.microsoftonline.com')) return true;
    if (h === 'login.microsoft.com' || h === 'login.live.com' || h === 'sts.windows.net') return true;
    return false;
}

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
    // En producción activamos CSP para reducir superficie XSS.
    contentSecurityPolicy: isProduction ? {
        useDefaults: true,
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: ["'self'", 'https://login.microsoftonline.com'],
            fontSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            // Entra ID (OIDC): navegación y posibles comprobaciones hacia el IdP.
            formAction: ["'self'", 'https://login.microsoftonline.com']
        }
    } : false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: isProduction ? { policy: 'same-origin' } : false,
    hsts: isProduction ? {
        maxAge: 31536000, // 1 año — coincide con Caddyfile y apto para preload list
        includeSubDomains: true,
        preload: true
    } : false,
    referrerPolicy: { policy: 'no-referrer' }
}));
app.use(cors({
    origin(origin, callback) {
        if (!origin) return callback(null, true);
        // Algunos clientes envían el literal "null" en navegaciones / iframes.
        if (origin === 'null') return callback(null, true);
        if (allowedCorsOrigins.has(origin)) return callback(null, true);
        try {
            const parsed = new URL(origin);
            // Tras consentimiento / primer login, el GET a /api/auth/entra/callback a veces llega con Origin del IdP.
            // Si se rechaza aquí, cors pasa Error → Express responde 500; un F5 puede cambiar Origin y «arreglar» el flujo.
            if (isMicrosoftEntraOidcOrigin(parsed.hostname)) {
                return callback(null, true);
            }
            // Quick Tunnel (dev): el navegador envía Origin https://*.trycloudflare.com; sin esto CORS falla y el
            // manejador global devuelve «Error interno del servidor» (mensaje genérico).
            if (corsAllowTryCloudflare && parsed.hostname.endsWith('.trycloudflare.com')) {
                return callback(null, true);
            }
        } catch {
            // Ignorar origen malformado y rechazar.
        }
        return callback(new Error('Origen no permitido por CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-cinte-xsrf']
}));

app.use(express.json({ limit: '50mb' }));

/** CSRF doble envío (LOW-002): cookie legible + header en mutaciones /api. */
function readCookieValue(cookieHeader, cookieName) {
    const raw = String(cookieHeader || '');
    if (!raw) return '';
    const parts = raw.split(';');
    for (const part of parts) {
        const [k, ...rest] = part.trim().split('=');
        if (k === cookieName) return decodeURIComponent(rest.join('=') || '');
    }
    return '';
}

const CSRF_SKIP_PATHS = new Set([
    '/api/login',
    '/api/auth/complete-new-password',
    '/api/auth/forgot-password',
    '/api/auth/reset-password'
]);
const csrfCookieSameSite = isProduction ? 'strict' : 'lax';
const csrfCookieSecure =
    String(process.env.COOKIE_SECURE || (isProduction ? 'true' : 'false')).toLowerCase() === 'true';

app.use((req, res, next) => {
    if (req.method === 'OPTIONS') return next();
    const p = req.path || '';
    if (!p.startsWith('/api')) return next();
    // Compatibilidad: migra cookie antigua `cinteXsrf` (path /api) a path / para lectura desde frontend.
    const cookie = readCookieValue(req.headers.cookie, 'cinteXsrf').trim();
    if (cookie) {
        res.cookie('cinteXsrf', cookie, {
            httpOnly: false,
            secure: csrfCookieSecure,
            sameSite: csrfCookieSameSite,
            path: '/',
            maxAge: 8 * 60 * 60 * 1000
        });
    }
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
    if (String(req.get('authorization') || '').startsWith('Bearer ')) return next();
    if (CSRF_SKIP_PATHS.has(p)) return next();
    const hdr = String(req.get('x-cinte-xsrf') || req.get('x-xsrf-token') || '').trim();
    if (!hdr || !cookie || hdr !== cookie) {
        return res.status(403).json({ ok: false, error: 'CSRF token inválido o ausente' });
    }
    return next();
});

app.use('/assets', express.static(path.join(__dirname, 'assets')));

const AUTH_RATE_LIMIT_WINDOW_MIN = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MIN || 15);
const AUTH_RATE_LIMIT_MAX = Number(process.env.AUTH_RATE_LIMIT_MAX || 10);
const FORGOT_RATE_LIMIT_WINDOW_MIN = Number(process.env.FORGOT_RATE_LIMIT_WINDOW_MIN || 60);
const FORGOT_RATE_LIMIT_MAX = Number(process.env.FORGOT_RATE_LIMIT_MAX || 5);
const PUBLIC_FORM_SUBMIT_RATE_LIMIT_WINDOW_MIN = Number(process.env.PUBLIC_FORM_SUBMIT_RATE_LIMIT_WINDOW_MIN || process.env.FORM_SUBMIT_RATE_LIMIT_WINDOW_MIN || 60);
const PUBLIC_FORM_SUBMIT_RATE_LIMIT_MAX = Number(process.env.PUBLIC_FORM_SUBMIT_RATE_LIMIT_MAX || process.env.FORM_SUBMIT_RATE_LIMIT_MAX || 30);
const ADMIN_ACTION_RATE_LIMIT_WINDOW_MIN = Number(process.env.ADMIN_ACTION_RATE_LIMIT_WINDOW_MIN || 60);
/** En producción: 2000 acciones por ventana (60 min por defecto) salvo `ADMIN_ACTION_RATE_LIMIT_MAX`. En dev más alto. Aplica a mutaciones (cotizador, escrituras directorio), no a GET del directorio. */
const ADMIN_ACTION_RATE_LIMIT_MAX = Number(
    process.env.ADMIN_ACTION_RATE_LIMIT_MAX || (isProduction ? 2000 : 5000)
);
const PDF_RATE_LIMIT_WINDOW_MIN = Number(process.env.PDF_RATE_LIMIT_WINDOW_MIN || 10);
const PDF_RATE_LIMIT_MAX = Number(process.env.PDF_RATE_LIMIT_MAX || 120);

/** Tras verificarToken, agrupa por usuario; sin auth (rutas públicas) usa IP (IPv6 seguro vía ipKeyGenerator). */
function rateLimitKeyByUserOrIp(req) {
    const u = req.user;
    const id = (u && (u.sub || u.email || u.username)) ? String(u.sub || u.email || u.username) : '';
    if (id) return `u:${id}`;
    const rawIp = req.ip || '127.0.0.1';
    return `ip:${ipKeyGenerator(rawIp)}`;
}

/**
 * Login / retos Cognito: sin esto el límite es solo por IP y toda una oficina (misma IP pública detrás de NAT
 * o del balanceador) comparte la cuota → "Demasiados intentos" en producción.
 * Clave = ruta + IP + email/username cuando el cuerpo lo trae; cambio de contraseña = usuario autenticado.
 */
function authRateLimitKey(req) {
    const path = String(req.path || '');
    const ipKey = ipKeyGenerator(req.ip || '127.0.0.1');
    try {
        if (path === '/api/auth/change-password' && req.user) {
            const uid = String(req.user.sub || req.user.email || req.user.username || '').trim();
            if (uid) return `auth:change-password:${uid}`;
        }
    } catch {
        // req.user puede no existir si el orden de middleware cambia
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const identity = String(body.email || body.username || '').trim().toLowerCase().slice(0, 320);
    if (identity) return `auth:${path}:${ipKey}:${identity}`;
    return `auth:${path}:${ipKey}`;
}

/** Olvidé contraseña: misma lógica que auth (cuota por correo + IP, no solo IP). */
function forgotPasswordRateLimitKey(req) {
    const ipKey = ipKeyGenerator(req.ip || '127.0.0.1');
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const email = String(body.email || '').trim().toLowerCase().slice(0, 320);
    if (email) return `forgot:${ipKey}:${email}`;
    return `forgot:${ipKey}`;
}

const authLimiter = rateLimit({
    windowMs: AUTH_RATE_LIMIT_WINDOW_MIN * 60 * 1000,
    max: AUTH_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: authRateLimitKey,
    /** Los 200/204 no consumen cuota; solo fallos (401, 400, etc.) cuentan para frenar fuerza bruta. */
    skipSuccessfulRequests: true,
    message: { ok: false, message: `Demasiados intentos. Espera ${AUTH_RATE_LIMIT_WINDOW_MIN} minutos.` }
});

const forgotLimiter = rateLimit({
    windowMs: FORGOT_RATE_LIMIT_WINDOW_MIN * 60 * 1000,
    max: FORGOT_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: forgotPasswordRateLimitKey,
    message: { ok: false, message: `Demasiadas solicitudes. Espera ${FORGOT_RATE_LIMIT_WINDOW_MIN} minutos.` }
});

const submitLimiter = rateLimit({
    windowMs: PUBLIC_FORM_SUBMIT_RATE_LIMIT_WINDOW_MIN * 60 * 1000,
    max: PUBLIC_FORM_SUBMIT_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        ok: false,
        error: `Demasiados envíos al formulario público de novedades. Espera ${PUBLIC_FORM_SUBMIT_RATE_LIMIT_WINDOW_MIN} minutos.`
    }
});
/** Radicación consultor (tras `verificarToken`): cuota por usuario, no solo por IP. */
const consultorFormPostLimiter = rateLimit({
    windowMs: PUBLIC_FORM_SUBMIT_RATE_LIMIT_WINDOW_MIN * 60 * 1000,
    max: PUBLIC_FORM_SUBMIT_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKeyByUserOrIp,
    message: {
        ok: false,
        error: `Demasiados envíos al formulario de novedades. Espera ${PUBLIC_FORM_SUBMIT_RATE_LIMIT_WINDOW_MIN} minutos.`
    }
});
const adminActionLimiter = rateLimit({
    windowMs: ADMIN_ACTION_RATE_LIMIT_WINDOW_MIN * 60 * 1000,
    max: ADMIN_ACTION_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKeyByUserOrIp,
    message: { ok: false, error: `Demasiadas acciones en el sistema (cotizador/gestión). Espera ${ADMIN_ACTION_RATE_LIMIT_WINDOW_MIN} minutos.` }
});
const pdfLimiter = rateLimit({
    windowMs: PDF_RATE_LIMIT_WINDOW_MIN * 60 * 1000,
    max: PDF_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKeyByUserOrIp,
    message: { ok: false, error: `Demasiadas descargas de PDF. Espera ${PDF_RATE_LIMIT_WINDOW_MIN} minutos.` }
});
const CATALOG_RATE_LIMIT_WINDOW_MIN = Number(process.env.CATALOG_RATE_LIMIT_WINDOW_MIN || 5);
const CATALOG_RATE_LIMIT_MAX = Number(process.env.CATALOG_RATE_LIMIT_MAX || 120);
const catalogLimiter = rateLimit({
    windowMs: CATALOG_RATE_LIMIT_WINDOW_MIN * 60 * 1000,
    max: CATALOG_RATE_LIMIT_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKeyByUserOrIp,
    message: { ok: false, error: 'Demasiadas consultas de catálogo. Intenta de nuevo en unos minutos.' }
});

const CONTRATACION_RATE_WINDOW_MIN = Number(process.env.CONTRATACION_RATE_LIMIT_WINDOW_MIN || 15);
const CONTRATACION_MONITOR_MAX = Number(process.env.CONTRATACION_MONITOR_RATE_LIMIT_MAX || 120);
const CONTRATACION_USERS_EMAIL_MAX = Number(process.env.CONTRATACION_USERS_BY_EMAIL_RATE_LIMIT_MAX || 120);
const CONTRATACION_ELIMINAR_MAX = Number(process.env.CONTRATACION_ELIMINAR_RATE_LIMIT_MAX || 60);
const CONTRATACION_WS_TOKEN_MAX = Number(process.env.CONTRATACION_WS_TOKEN_RATE_LIMIT_MAX || 60);

const contratacionMonitorLimiter = rateLimit({
    windowMs: CONTRATACION_RATE_WINDOW_MIN * 60 * 1000,
    max: CONTRATACION_MONITOR_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKeyByUserOrIp,
    message: { success: false, message: 'Demasiadas solicitudes al monitor. Intente más tarde.' }
});

const contratacionUsersByEmailLimiter = rateLimit({
    windowMs: CONTRATACION_RATE_WINDOW_MIN * 60 * 1000,
    max: CONTRATACION_USERS_EMAIL_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKeyByUserOrIp,
    message: { success: false, message: 'Demasiadas consultas por email. Intente más tarde.' }
});

const contratacionEliminarLimiter = rateLimit({
    windowMs: CONTRATACION_RATE_WINDOW_MIN * 60 * 1000,
    max: CONTRATACION_ELIMINAR_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKeyByUserOrIp,
    message: { success: false, message: 'Demasiadas solicitudes de eliminación. Intente más tarde.' }
});

const contratacionWsTokenLimiter = rateLimit({
    windowMs: CONTRATACION_RATE_WINDOW_MIN * 60 * 1000,
    max: CONTRATACION_WS_TOKEN_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKeyByUserOrIp,
    message: { success: false, message: 'Demasiadas solicitudes de ticket WebSocket. Intente más tarde.' }
});

const CONTRATACION_WS_TICKET_TTL_SEC = Number(process.env.CONTRATACION_WS_TICKET_TTL_SEC || 300);
const contratacionWsSecret = (process.env.CONTRATACION_WS_SECRET || SECRET_KEY || '').trim();

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
const lambdaClient = new LambdaClient({ region: S3_REGION });
const cognitoIdpClient = new CognitoIdentityProviderClient({
    region: COGNITO_REGION,
    ...(S3_AUTH_MODE === 'keys' && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {})
        }
    } : {})
});
const { resolveApproverEmailsForNovedad } = createResolveApproverEmailsFromCognito({
    cognitoClient: cognitoIdpClient,
    userPoolId: COGNITO_USER_POOL_ID,
    getNovedadRuleByType
});
const emailNotificationsPublisher = createEmailNotificationsPublisher({
    lambdaClient,
    functionName: EMAIL_LAMBDA_FUNCTION_NAME,
    enabled: EMAIL_NOTIFICATIONS_ENABLED
});

const {
    resolveEffectiveRole,
    issueAppTokenFromCognito,
    issueAppTokenForEntraConsultor,
    requireEntraConsultor,
    requireCatalogConsultorOrStaff,
    buildUserFromCognitoClaims,
    buildCognitoSecretHash,
    cognitoPublicApi,
    verificarToken,
    allowPanel,
    allowAnyPanel,
    allowRoles,
    disallowRoles,
    applyScope,
    revokeAppSessionToken
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
    ensureClientesLideresNitColumn,
    ensureClientesLideresGpUserColumn,
    ensureNovedadesIndexes,
    ensureNovedadesHourSplitColumns,
    ensureNovedadesMontoCopColumn,
    ensureNovedadesApproverEmailColumns,
    ensureNovedadesHoraExtraAlertColumns,
    ensureNovedadesHeDomingoObservacionColumn,
    ensureNovedadesNominaVerificacionColumns,
    ensureNovedadesHorasRecargoDomingoColumn,
    migrateClientesLideresFromExcelIfNeeded,
    ensureColaboradoresTable,
    ensureColaboradoresDirectoryColumns,
    ensureReubicacionesPipelineTable,
    ensureUsersCognitoSubColumn,
    ensureCinteLeonardoPair,
    getColaboradorByCedula,
    getColaboradorByEmail,
    getClientesList,
    getLideresByCliente,
    listClientesLideresPaged,
    listClientesLideresByClienteSummaryPaged,
    getClientesNitMapFromLideres,
    insertClienteLider,
    updateClienteLiderById,
    listColaboradoresPaged,
    insertColaborador,
    updateColaboradorByCedula,
    deleteColaboradorByCedula,
    listGpUsersForDirectorio,
    insertGpUserPlaceholder,
    updateGpUserById,
    resolveOrCreateGpUserIdForColaboradorCedula,
    clearGpUserReferences,
    linkGpCognitoSubByEmail,
    migrateExcelIfNeeded,
    getScopedNovedades,
    listScopedDistinctClientes,
    getHoraExtraAlerts,
    listHoraExtraByCedulaForDomingoPolicy,
    listConciliacionesClientesForScope,
    getConciliacionResumenPorClienteMesForScope,
    listConciliacionNovedadesDetalleForScope,
    getConciliacionesDashboardResumenForScope
} = createDataLayer({
    pool,
    fs,
    xlsx,
    CLIENTES_LIDERES_XLSX_PATH,
    normalizeCatalogValue,
    normalizeCedula,
    canRoleViewType,
    getAreaFromRole
});

const { registerRoutes } = require('./src/registerRoutes');
const { registerEntraRoutes } = require('./src/auth/registerEntraRoutes');
const { startServer } = require('./src/startup');
const cotizadorStore = createCotizadorStore({ pool });
const tiRolesStore = createTiRolesStore({ pool });

const secureEntraCookie = String(process.env.COOKIE_SECURE || (isProduction ? 'true' : 'false')).toLowerCase() === 'true';
const sameSiteEntra = isProduction ? 'strict' : 'lax';

registerEntraRoutes(app, {
    getColaboradorByEmail,
    issueAppTokenForEntraConsultor,
    FRONTEND_URL,
    secureCookie: secureEntraCookie,
    sameSite: sameSiteEntra,
    logger
});

registerRoutes({
    app,
    logger,
    authLimiter,
    forgotLimiter,
    submitLimiter,
    consultorFormPostLimiter,
    catalogLimiter,
    normalizeCedula,
    getColaboradorByCedula,
    verificarToken,
    revokeAppSessionToken,
    requireEntraConsultor,
    requireCatalogConsultorOrStaff,
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
    listScopedDistinctClientes,
    getHoraExtraAlerts,
    listHoraExtraByCedulaForDomingoPolicy,
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
    POLICY,
    xlsx,
    emailNotificationsPublisher,
    resolveApproverEmailsForNovedad
});

registerDirectorioRoutes({
    app,
    pool,
    verificarToken,
    allowPanel,
    adminActionLimiter,
    getLideresByCliente,
    getAreaFromRole,
    listClientesLideresPaged,
    listClientesLideresByClienteSummaryPaged,
    insertClienteLider,
    updateClienteLiderById,
    listColaboradoresPaged,
    insertColaborador,
    updateColaboradorByCedula,
    deleteColaboradorByCedula,
    listGpUsersForDirectorio,
    insertGpUserPlaceholder,
    updateGpUserById,
    resolveOrCreateGpUserIdForColaboradorCedula,
    clearGpUserReferences,
    linkGpCognitoSubByEmail,
    normalizeCedula
});

registerConciliacionesRoutes({
    app,
    verificarToken,
    allowAnyPanel,
    applyScope,
    listConciliacionesClientesForScope,
    getConciliacionResumenPorClienteMesForScope,
    listConciliacionNovedadesDetalleForScope,
    getConciliacionesDashboardResumenForScope
});

registerCotizadorRoutes({
    app,
    verificarToken,
    disallowRoles,
    allowPanel,
    adminActionLimiter,
    pdfLimiter,
    catalogLimiter,
    cotizadorStore,
    getClientesList,
    getClientesNitMapFromLideres
});

registerTiRolesRoutes({
    app,
    verificarToken,
    disallowRoles,
    allowPanel,
    allowRoles,
    adminActionLimiter,
    catalogLimiter,
    tiRolesStore
});

registerContratacionRoutes({
    app,
    verificarToken,
    allowPanel,
    allowRoles,
    contratacionMonitorLimiter,
    contratacionUsersByEmailLimiter,
    contratacionEliminarLimiter,
    contratacionWsTokenLimiter,
    wsSecret: contratacionWsSecret,
    wsTicketTtlSec: CONTRATACION_WS_TICKET_TTL_SEC
});

startServer({
    app,
    pool,
    ensureUserRoleEnumValues,
    ensureClientesLideresTable,
    ensureClientesLideresNitColumn,
    ensureClientesLideresGpUserColumn,
    ensureNovedadesIndexes,
    ensureNovedadesHourSplitColumns,
    ensureNovedadesMontoCopColumn,
    ensureNovedadesApproverEmailColumns,
    ensureNovedadesHoraExtraAlertColumns,
    ensureNovedadesHeDomingoObservacionColumn,
    ensureNovedadesNominaVerificacionColumns,
    ensureNovedadesHorasRecargoDomingoColumn,
    migrateExcelIfNeeded,
    migrateClientesLideresFromExcelIfNeeded,
    ensureColaboradoresTable,
    ensureColaboradoresDirectoryColumns,
    ensureReubicacionesPipelineTable,
    ensureUsersCognitoSubColumn,
    ensureCinteLeonardoPair,
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
