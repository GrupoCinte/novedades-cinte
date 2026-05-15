const crypto = require('crypto');

function parseBoolEnv(v, defaultWhenUnset) {
    if (v === undefined || v === null || String(v).trim() === '') return defaultWhenUnset;
    const s = String(v).toLowerCase().trim();
    if (['1', 'true', 'yes', 'on'].includes(s)) return true;
    if (['0', 'false', 'no', 'off'].includes(s)) return false;
    return defaultWhenUnset;
}

/**
 * Auditoría de runtime (HTTP + trazas de cliente): activa por defecto en no-producción.
 * En producción solo si `RUNTIME_AUDIT=1` (evita escribir JSONL con PII sin intención).
 */
function isRuntimeAuditEnabled(isProduction) {
    const raw = process.env.RUNTIME_AUDIT;
    if (isProduction) return parseBoolEnv(raw, false);
    return parseBoolEnv(raw, true);
}

function ensureLogsDir(fs, pathMod, rootDir) {
    const d = pathMod.join(rootDir, 'logs');
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    return d;
}

/**
 * Escritura JSONL **asíncrona** (nunca `appendFileSync` en el camino caliente).
 * El I/O síncrono en cada `res.finish` bajo ráfagas de clics bloqueaba el event loop de Node;
 * el proxy de Vite veía `read ECONNRESET` aunque las rutas respondieran 200 cuando el proceso volvía.
 */
function appendJsonlAsync(fs, pathMod, rootDir, filename, obj, logger) {
    const line = `${JSON.stringify(obj)}\n`;
    let dir;
    try {
        dir = ensureLogsDir(fs, pathMod, rootDir);
    } catch (e) {
        try {
            logger.warn({ err: e && e.message }, 'runtime_audit_dir_failed');
        } catch {
            // ignorar
        }
        return;
    }
    const filePath = pathMod.join(dir, filename);
    fs.appendFile(filePath, line, { encoding: 'utf8' }, (err) => {
        if (!err) return;
        try {
            logger.warn({ err: err.message, file: filename }, 'runtime_audit_append_failed');
        } catch {
            // ignorar
        }
    });
}

function pickUserFields(u) {
    if (!u || typeof u !== 'object') return { userEmail: '', userSub: '', role: '' };
    const ident = u.email || u.username;
    return {
        userEmail: ident ? String(ident).slice(0, 200) : '',
        userSub: u.sub ? String(u.sub).slice(0, 120) : '',
        role: u.role ? String(u.role).slice(0, 80) : ''
    };
}

function createRuntimeAuditMiddleware({ logger, fs, path: pathMod, rootDir, isProduction }) {
    const enabled = isRuntimeAuditEnabled(isProduction);
    if (!enabled) {
        return function runtimeAuditDisabled(_req, _res, next) {
            next();
        };
    }
    return function runtimeAuditMiddleware(req, res, next) {
        const url = String(req.originalUrl || req.url || '');
        if (!url.startsWith('/api')) return next();
        const incoming = String(req.get('x-request-id') || '').trim();
        const reqId = incoming && incoming.length <= 80 ? incoming.slice(0, 80) : crypto.randomUUID();
        req.runtimeAuditId = reqId;
        res.setHeader('X-Request-Id', reqId);
        const started = process.hrtime.bigint();
        res.on('finish', () => {
            try {
                const ms = Number(process.hrtime.bigint() - started) / 1e6;
                const u = req.user;
                const { userEmail, userSub, role } = pickUserFields(u);
                const record = {
                    ts: new Date().toISOString(),
                    kind: 'http',
                    reqId,
                    method: req.method,
                    path: req.path || url.split('?')[0],
                    status: res.statusCode,
                    ms: Math.round(ms * 10) / 10,
                    userEmail,
                    userSub,
                    role
                };
                appendJsonlAsync(fs, pathMod, rootDir, 'http-audit.jsonl', record, logger);
                logger.info({ runtimeAudit: record }, 'runtime_audit_http');
            } catch (e) {
                try {
                    logger.warn({ err: e && e.message }, 'runtime_audit_http_write_failed');
                } catch {
                    // ignorar
                }
            }
        });
        next();
    };
}

function registerRuntimeClientTraceRoute(app, deps) {
    const {
        verificarToken,
        clientTraceLimiter,
        logger,
        fs,
        path: pathMod,
        rootDir,
        isProduction
    } = deps;
    if (!isRuntimeAuditEnabled(isProduction)) return;

    app.post('/api/dev/client-trace', verificarToken, clientTraceLimiter, (req, res) => {
        try {
            const body = req.body && typeof req.body === 'object' ? req.body : {};
            const u = req.user;
            const { userEmail, userSub, role } = pickUserFields(u);
            const rid = String(req.runtimeAuditId || body.reqId || '').slice(0, 80);
            let detailStr = '';
            if (body.detail != null) {
                if (typeof body.detail === 'string') detailStr = body.detail.slice(0, 2000);
                else {
                    try {
                        detailStr = JSON.stringify(body.detail).slice(0, 2000);
                    } catch {
                        detailStr = '';
                    }
                }
            }
            const line = {
                ts: new Date().toISOString(),
                kind: 'client',
                reqId: rid,
                clientKind: String(body.kind || 'event').slice(0, 80),
                message: String(body.message || body.msg || '').slice(0, 800),
                route: String(body.route || body.path || '').slice(0, 300),
                url: String(body.url || '').slice(0, 500),
                stack: String(body.stack || '').slice(0, 4000),
                userEmail,
                userSub,
                role,
                detail: detailStr
            };
            appendJsonlAsync(fs, pathMod, rootDir, 'client-trace.jsonl', line, logger);
            logger.info({ runtimeAudit: line }, 'runtime_audit_client');
            res.json({ ok: true });
        } catch {
            res.status(500).json({ ok: false });
        }
    });
}

module.exports = {
    isRuntimeAuditEnabled,
    createRuntimeAuditMiddleware,
    registerRuntimeClientTraceRoute
};
