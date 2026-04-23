const { normalizeNovedadTypeKey } = require('./rbac');
const { toUtcMsFromDateAndTime, resolveFallbackDateKeyFromRow } = require('./novedadHeTime');
const { buildSundayReportedSetsFromHeRows, computeHeDomingoObservacionForRow } = require('./heDomingoBogota');
const { computeHoraExtraSplitBogota, resolveHoraExtraLabel } = require('./heBogotaSplit');
const { formatCantidadNovedad, getCantidadMedidaKind } = require('./novedadCantidadFormat');
const { parseTimeOrNull: parseTimeOrNullForExport } = require('./utils');
const {
    computeHeDomingoCompensacionPreview,
    buildHeDomingoCompObservacionLine,
    formatHeDomingoCompTipoSuffix,
    buildSyntheticHoraExtraRow,
    isYmdEnVentanaCompensatorio
} = require('./heDomingoCompensacion');

/** HH:MM para Excel; tolera hora de un dígito desde BD. */
function formatHoraMinutaParaExcel(value) {
    const t = parseTimeOrNullForExport(value);
    if (t) return t.slice(0, 5);
    const raw = String(value || '').trim();
    const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
    if (!m) return '';
    const h = Math.min(23, Math.max(0, Number(m[1])));
    const min = Math.min(59, Math.max(0, Number(m[2])));
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function buildConsultantKeyHeDomingo(row) {
    const cedula = String(row?.cedula || '').trim() || 'sin-cedula';
    const nombre = String(row?.nombre || '').trim() || 'Sin nombre';
    return `${cedula}|||${nombre}`;
}

function rowIsHoraExtraTipo(row) {
    return String(row?.tipo_novedad || '').trim().toLowerCase().replace(/\s+/g, ' ') === 'hora extra';
}

/** Misma clave canónica que `rowIsHoraExtraTipo` pero sobre objeto cliente (`toClientNovedad`). */
function itemIsHoraExtraTipo(it) {
    return String(it?.tipoNovedad || '').trim().toLowerCase().replace(/\s+/g, ' ') === 'hora extra';
}

/**
 * Solo export Excel: enriquece «Tipo Novedad» para Hora Extra listando tipologías (nunca «Mixta»).
 */
function formatTipoNovedadParaExportExcel(it) {
    const tipo = String(it?.tipoNovedad || '').trim();
    if (!itemIsHoraExtraTipo(it)) return tipo;
    const partes = [];
    const hd = Number(it?.horasDiurnas || 0);
    const hn = Number(it?.horasNocturnas || 0);
    const rdd = Number(it?.horasRecargoDomingoDiurnas || 0);
    const rdn = Number(it?.horasRecargoDomingoNocturnas || 0);
    const rTot = Number(it?.horasRecargoDomingo || 0);
    if (hd > 0) partes.push('Hora Diurna');
    if (hn > 0) partes.push('Hora Nocturna');
    if (rdd > 0) partes.push('Recargo dominical diurno');
    if (rdn > 0) partes.push('Recargo dominical nocturno');
    if (rTot > 0 && rdd === 0 && rdn === 0) partes.push('Recargo dominical');
    if (partes.length === 0) {
        const raw = String(it?.tipoHoraExtra || '').trim();
        const fold = raw
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
        if (fold === 'diurna') partes.push('Hora Diurna');
        else if (fold === 'nocturna') partes.push('Hora Nocturna');
        else if (fold === 'mixta') {
            partes.push('Hora Diurna', 'Hora Nocturna');
        } else if (raw) partes.push(raw);
    }
    let base;
    if (partes.length === 0) base = tipo || 'Hora Extra';
    else base = `Hora Extra / ${partes.join(', ')}`;
    const suf = formatHeDomingoCompTipoSuffix(String(it?.heDomingoObservacion || ''));
    return suf ? base + suf : base;
}

const { randomUUID } = require('node:crypto');
const { resolvePostedContactFromColaborador } = require('./colaboradorDirectory');
const { buildFoldToCanonicoMap, matchExcelClienteABd, foldForMatch } = require('./cotizador/clienteNombreMatch');

/**
 * Solo campos serializables que el front puede guardar en localStorage; evita 500 si res.json falla
 * al expandir claims Cognito con estructuras inesperadas.
 */
function buildSafeLoginClaimsForClient(claims, appRole, baseRole) {
    const c = claims && typeof claims === 'object' && !Array.isArray(claims) ? claims : {};
    const groups = c['cognito:groups'];
    return {
        sub: c.sub != null ? String(c.sub) : null,
        email: c.email != null ? String(c.email) : null,
        name: c.name != null ? String(c.name) : null,
        'cognito:username': c['cognito:username'] != null ? String(c['cognito:username']) : null,
        'cognito:groups': Array.isArray(groups) ? groups.map((g) => String(g)) : null,
        aud: c.aud != null ? (Array.isArray(c.aud) ? c.aud.map(String) : String(c.aud)) : null,
        iss: c.iss != null ? String(c.iss) : null,
        token_use: c.token_use != null ? String(c.token_use) : null,
        auth_time: typeof c.auth_time === 'number' ? c.auth_time : null,
        iat: typeof c.iat === 'number' ? c.iat : null,
        exp: typeof c.exp === 'number' ? c.exp : null,
        role: appRole,
        baseRole
    };
}

function parseMontoCopFromBody(raw) {
    if (raw == null) return NaN;
    const s = String(raw)
        .replace(/\$/g, '')
        .replace(/\s/g, '')
        .trim();
    if (!s) return NaN;
    const lastComma = s.lastIndexOf(',');
    let normalized;
    if (lastComma >= 0) {
        const whole = s.slice(0, lastComma).replace(/\./g, '').replace(/[^\d]/g, '');
        const frac = s.slice(lastComma + 1).replace(/[^\d]/g, '').slice(0, 2);
        if (!whole && !frac) return NaN;
        normalized = frac !== '' ? `${whole || '0'}.${frac}` : whole;
    } else {
        normalized = s.replace(/\./g, '').replace(/[^\d]/g, '');
    }
    if (normalized === '' || normalized === '.') return NaN;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : NaN;
}

function registerRoutes(deps) {
    const {
        app,
        logger,
        authLimiter,
        forgotLimiter,
        submitLimiter,
        catalogLimiter,
        normalizeCedula,
        getColaboradorByCedula,
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
        resolveApproverEmailsForNovedad,
        revokeAppSessionToken
    } = deps;
    const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
    const exposeInternalErrors = String(process.env.EXPOSE_INTERNAL_ERRORS || '').toLowerCase() === 'true';
    const isDeployedEnv = isProduction || String(process.env.NODE_ENV || '').toLowerCase() === 'staging';
    const secureCookie = String(process.env.COOKIE_SECURE || (isProduction ? 'true' : 'false')).toLowerCase() === 'true';
    const sameSite = isProduction ? 'strict' : 'lax';
    const exportMaxRows = Math.max(1, Number(process.env.EXPORT_MAX_ROWS || 5000));

    function setSessionCookie(res, token, maxAgeSec) {
        const ms = Number(maxAgeSec || 0) > 0 ? Number(maxAgeSec) * 1000 : 8 * 60 * 60 * 1000;
        res.cookie('cinteSession', token, {
            httpOnly: true,
            secure: secureCookie,
            sameSite,
            path: '/api',
            maxAge: ms
        });
    }

    function setXsrfCookie(res) {
        const value = randomUUID();
        res.cookie('cinteXsrf', value, {
            httpOnly: false,
            secure: secureCookie,
            sameSite,
            // Se lee desde frontend (document.cookie) para doble envío CSRF.
            path: '/',
            maxAge: 8 * 60 * 60 * 1000
        });
    }

    async function validateUploadMagicBytes(file) {
        const ext = path.extname(file?.originalname || '').toLowerCase();
        const buf = file?.buffer || Buffer.alloc(0);
        const startsWith = (bytes) => bytes.every((b, i) => buf[i] === b);

        if (ext === '.xls') {
            const hasOleMagic = buf.length >= 8
                && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0
                && buf[4] === 0xa1 && buf[5] === 0xb1 && buf[6] === 0x1a && buf[7] === 0xe1;
            return hasOleMagic;
        }
        if (ext === '.pdf') return buf.length >= 5 && startsWith([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
        if (ext === '.jpg' || ext === '.jpeg') return buf.length >= 3 && startsWith([0xff, 0xd8, 0xff]);
        if (ext === '.png') return buf.length >= 8 && startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        if (ext === '.xlsx') return buf.length >= 4 && startsWith([0x50, 0x4b, 0x03, 0x04]); // zip container
        return false;
    }

    function matchFoldToCandidate(raw, candidates) {
        const f = foldForMatch(raw);
        if (!f) return null;
        for (const c of candidates) {
            if (foldForMatch(c) === f) return c;
        }
        return null;
    }

    function parseDateAtUtcStart(value) {
        if (!value) return null;
        const dateValue = new Date(`${value}T00:00:00Z`);
        if (Number.isNaN(dateValue.getTime())) return null;
        return dateValue;
    }

    function countBusinessDaysInclusive(startDateRaw, endDateRaw) {
        const start = parseDateAtUtcStart(startDateRaw);
        const end = parseDateAtUtcStart(endDateRaw);
        if (!start || !end || end < start) return 0;
        let count = 0;
        const cursor = new Date(start);
        while (cursor <= end) {
            const day = cursor.getUTCDay();
            if (day !== 0 && day !== 6) count += 1; // Sunday/Saturday excluded.
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        return count;
    }

    function buildFormSubmittedNotificationEvent({
        novedadId,
        body,
        nombreColaborador,
        cliente,
        lider,
        tipoNovedad,
        fechaInicio,
        fechaFin,
        cantidadHoras,
        montoCop,
        correoSolicitanteResolved
    }) {
        const userEmail = String(
            correoSolicitanteResolved != null && correoSolicitanteResolved !== ''
                ? correoSolicitanteResolved
                : body?.correoSolicitante || ''
        )
            .trim()
            .toLowerCase();
        const adminBaseUrl = String(FRONTEND_URL || '').trim() || 'http://localhost:5175';
        return {
            eventType: 'form_submitted',
            eventId: randomUUID(),
            occurredAt: new Date().toISOString(),
            novedadId: String(novedadId || ''),
            user: {
                name: String(nombreColaborador || '').trim(),
                email: userEmail
            },
            admin: {
                actionUrl: `${adminBaseUrl}/admin`
            },
            formData: {
                tipoNovedad: String(tipoNovedad || '').trim(),
                cliente: String(cliente || '').trim(),
                lider: String(lider || '').trim(),
                fechaInicio: fechaInicio || null,
                fechaFin: fechaFin || null,
                cantidadHoras: Number(cantidadHoras || 0),
                montoCop: montoCop == null ? null : Number(montoCop),
                estado: 'Pendiente'
            },
            meta: {
                source: 'backend-express',
                env: process.env.NODE_ENV || 'development'
            }
        };
    }

    function buildFormStatusChangedNotificationEvent({
        novedadId,
        nombreColaborador,
        correoSolicitante,
        cliente,
        lider,
        tipoNovedad,
        fechaInicio,
        fechaFin,
        cantidadHoras,
        montoCop,
        previousEstado,
        newEstado,
        changedByEmail
    }) {
        const userEmail = String(correoSolicitante || '').trim().toLowerCase();
        const adminBaseUrl = String(FRONTEND_URL || '').trim() || 'http://localhost:5175';
        return {
            eventType: 'form_status_changed',
            eventId: randomUUID(),
            occurredAt: new Date().toISOString(),
            novedadId: String(novedadId || ''),
            user: {
                name: String(nombreColaborador || '').trim(),
                email: userEmail
            },
            admin: {
                actionUrl: `${adminBaseUrl}/admin`
            },
            formData: {
                tipoNovedad: String(tipoNovedad || '').trim(),
                cliente: String(cliente || '').trim(),
                lider: String(lider || '').trim(),
                fechaInicio: fechaInicio || null,
                fechaFin: fechaFin || null,
                cantidadHoras: Number(cantidadHoras || 0),
                montoCop: montoCop == null ? null : Number(montoCop),
                estado: String(newEstado || '').trim()
            },
            statusChange: {
                previousEstado: String(previousEstado || '').trim() || 'Pendiente',
                newEstado: String(newEstado || '').trim(),
                changedByEmail: String(changedByEmail || '').trim() || null,
                changedAt: new Date().toISOString()
            },
            meta: {
                source: 'backend-express',
                env: process.env.NODE_ENV || 'development'
            }
        };
    }

    async function streamToBuffer(stream) {
        if (!stream) return Buffer.alloc(0);
        if (Buffer.isBuffer(stream)) return stream;
        const chunks = [];
        for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    }

    app.post('/api/login', authLimiter, async (req, res) => {
        try {
            const { username, email, password, roleRequested } = req.body || {};
            const identity = email || username;
            if (!identity || !password) {
                return res.status(400).json({ ok: false, message: 'Credenciales incompletas' });
            }
            if (!COGNITO_ENABLED) {
                return res.status(503).json({ ok: false, message: 'Cognito no está habilitado en el servidor.' });
            }

            const authParams = {
                USERNAME: String(identity).trim(),
                PASSWORD: String(password)
            };
            const secretHash = buildCognitoSecretHash(authParams.USERNAME);
            if (secretHash) authParams.SECRET_HASH = secretHash;

            const out = await cognitoPublicApi('InitiateAuth', {
                ClientId: COGNITO_APP_CLIENT_ID,
                AuthFlow: 'USER_PASSWORD_AUTH',
                AuthParameters: authParams
            });

            if (out.ChallengeName) {
                if (out.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
                    return res.status(409).json({
                        ok: false,
                        message: 'Cognito requiere cambio de contraseña inicial.',
                        challenge: out.ChallengeName,
                        session: out.Session || ''
                    });
                }
                return res.status(409).json({
                    ok: false,
                    message: `Reto de autenticación no soportado: ${out.ChallengeName}`,
                    challenge: out.ChallengeName,
                    session: out.Session || ''
                });
            }

            const auth = out.AuthenticationResult || {};
            const idToken = auth.IdToken || '';
            const accessToken = auth.AccessToken || '';
            if (!idToken || !accessToken) {
                return res.status(401).json({ ok: false, message: 'No se recibieron tokens de Cognito' });
            }

            const claims = decodeJwtPayload(idToken);
            if (!claims) {
                return res.status(401).json({ ok: false, message: 'Token Cognito inválido.' });
            }
            const baseUser = buildUserFromCognitoClaims(claims);
            const effectiveRole = resolveEffectiveRole(baseUser.role, roleRequested);
            const loginIdentity = String(identity || '').trim();
            const appAuth = issueAppTokenFromCognito(baseUser, auth, effectiveRole, loginIdentity);
            setSessionCookie(res, appAuth.token, appAuth.expiresInSec);
            setXsrfCookie(res);
            return res.json({
                ok: true,
                expiresIn: appAuth.expiresInSec,
                user: appAuth.user,
                claims: buildSafeLoginClaimsForClient(claims, appAuth.user.role, baseUser.role)
            });
        } catch (error) {
            console.error('Error login:', error);
            const status = Number(error?.status);
            const isClientError = Number.isFinite(status) && status >= 400 && status < 500;
            if (isClientError) {
                return res.status(status).json({ ok: false, message: error.message || 'Error de autenticacion Cognito' });
            }
            return res.status(500).json({
                ok: false,
                message: (!isDeployedEnv && exposeInternalErrors && error?.message) ? String(error.message) : 'Error interno'
            });
        }
    });

    app.post('/api/auth/complete-new-password', authLimiter, async (req, res) => {
        try {
            const { email, newPassword, session, phoneNumber, roleRequested } = req.body || {};
            const username = String(email || '').trim();
            const challengeSession = String(session || '').trim();
            if (!username || !newPassword || !challengeSession) {
                return res.status(400).json({ ok: false, message: 'Email, session y nueva contraseña son obligatorios' });
            }
            if (!isStrongPassword(newPassword)) {
                return res.status(400).json({ ok: false, message: 'La contrasena debe tener 12+ caracteres, mayuscula, minuscula, numero y simbolo.' });
            }
            if (!COGNITO_ENABLED) {
                return res.status(400).json({ ok: false, message: 'Cognito no está habilitado' });
            }

            const challengeResponses = {
                USERNAME: username,
                NEW_PASSWORD: newPassword
            };
            const rawPhone = String(phoneNumber || '').trim();
            if (rawPhone) {
                challengeResponses['userAttributes.phone_number'] = rawPhone;
            }
            const secretHash = buildCognitoSecretHash(username);
            if (secretHash) challengeResponses.SECRET_HASH = secretHash;

            const out = await cognitoPublicApi('RespondToAuthChallenge', {
                ClientId: COGNITO_APP_CLIENT_ID,
                ChallengeName: 'NEW_PASSWORD_REQUIRED',
                Session: challengeSession,
                ChallengeResponses: challengeResponses
            });

            const auth = out.AuthenticationResult || {};
            const idToken = auth.IdToken || '';
            const accessToken = auth.AccessToken || '';
            if (!idToken || !accessToken) {
                return res.status(401).json({ ok: false, message: 'No se recibieron tokens de Cognito' });
            }

            const claims = decodeJwtPayload(idToken);
            if (!claims) {
                return res.status(401).json({ ok: false, message: 'Token Cognito inválido.' });
            }
            const baseUser = buildUserFromCognitoClaims(claims);
            const effectiveRole = resolveEffectiveRole(baseUser.role, roleRequested);
            const loginIdentity = username;
            const appAuth = issueAppTokenFromCognito(baseUser, auth, effectiveRole, loginIdentity);
            setSessionCookie(res, appAuth.token, appAuth.expiresInSec);
            setXsrfCookie(res);
            return res.json({
                ok: true,
                expiresIn: appAuth.expiresInSec,
                user: appAuth.user,
                claims: buildSafeLoginClaimsForClient(claims, appAuth.user.role, baseUser.role)
            });
        } catch (error) {
            console.error('Error complete-new-password:', error);
            const status = Number(error?.status);
            const isClientError = COGNITO_ENABLED && Number.isFinite(status) && status >= 400 && status < 500;
            if (isClientError) {
                return res.status(status).json({ ok: false, message: error.message || 'Error completando reto de contraseña' });
            }
            return res.status(500).json({
                ok: false,
                message: (!isDeployedEnv && exposeInternalErrors && error?.message) ? String(error.message) : 'Error interno'
            });
        }
    });

    app.get('/api/me', verificarToken, (req, res) => {
        res.json({ ok: true, me: req.user });
    });

    app.post('/api/auth/forgot-password', forgotLimiter, async (req, res) => {
        try {
            const { email } = req.body || {};
            if (!email) return res.status(400).json({ ok: false, message: 'Email es obligatorio' });
            if (!COGNITO_ENABLED) {
                return res.status(503).json({ ok: false, message: 'Recuperación disponible solo vía Cognito.' });
            }

            const username = String(email).trim();
            const body = {
                ClientId: COGNITO_APP_CLIENT_ID,
                Username: username
            };
            const secretHash = buildCognitoSecretHash(username);
            if (secretHash) body.SecretHash = secretHash;
            await cognitoPublicApi('ForgotPassword', body);
            return res.json({ ok: true, message: 'Si el email existe, se envio instruccion' });
        } catch (error) {
            console.error('Error forgot-password:', error);
            const status = Number(error?.status) || 500;
            if (status >= 400 && status < 500) {
                return res.status(status).json({ ok: false, message: error.message || 'Error de recuperacion Cognito' });
            }
            return res.status(500).json({ ok: false, message: 'Error interno' });
        }
    });

    app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
        try {
            const { email, code, newPassword } = req.body || {};
            if (!newPassword) return res.status(400).json({ ok: false, message: 'Nueva contrasena es obligatoria' });
            if (!isStrongPassword(newPassword)) {
                return res.status(400).json({ ok: false, message: 'La contrasena debe tener 12+ caracteres, mayuscula, minuscula, numero y simbolo.' });
            }
            if (!COGNITO_ENABLED) {
                return res.status(503).json({ ok: false, message: 'Reset disponible solo vía Cognito.' });
            }

            const username = String(email || '').trim();
            const confirmationCode = String(code || '').trim();
            if (!username || !confirmationCode) {
                return res.status(400).json({ ok: false, message: 'Correo y codigo son obligatorios' });
            }
            const body = {
                ClientId: COGNITO_APP_CLIENT_ID,
                Username: username,
                ConfirmationCode: confirmationCode,
                Password: newPassword
            };
            const secretHash = buildCognitoSecretHash(username);
            if (secretHash) body.SecretHash = secretHash;
            await cognitoPublicApi('ConfirmForgotPassword', body);
            return res.json({ ok: true, message: 'Contrasena actualizada. Inicia sesion nuevamente.' });
        } catch (error) {
            console.error('Error reset-password:', error);
            const status = Number(error?.status) || 500;
            if (status >= 400 && status < 500) {
                return res.status(status).json({ ok: false, message: error.message || 'Error de reset Cognito' });
            }
            return res.status(500).json({ ok: false, message: 'Error interno' });
        }
    });

    app.post('/api/auth/change-password', verificarToken, authLimiter, async (req, res) => {
        try {
            const { currentPassword, newPassword } = req.body || {};
            if (!currentPassword || !newPassword) {
                return res.status(400).json({ ok: false, message: 'Contrasena actual y nueva son obligatorias' });
            }
            if (!isStrongPassword(newPassword)) {
                return res.status(400).json({ ok: false, message: 'La contrasena debe tener 12+ caracteres, mayuscula, minuscula, numero y simbolo.' });
            }

            if (!COGNITO_ENABLED) {
                return res.status(503).json({ ok: false, message: 'Cambio de contraseña disponible solo vía Cognito.' });
            }
            const username = String(req.user?.username || req.user?.email || '').trim();
            if (!username) {
                return res.status(400).json({ ok: false, message: 'No se pudo resolver el usuario autenticado para cambio de contraseña.' });
            }
            const authParams = {
                USERNAME: username,
                PASSWORD: String(currentPassword)
            };
            const secretHash = buildCognitoSecretHash(authParams.USERNAME);
            if (secretHash) authParams.SECRET_HASH = secretHash;
            const authOut = await cognitoPublicApi('InitiateAuth', {
                ClientId: COGNITO_APP_CLIENT_ID,
                AuthFlow: 'USER_PASSWORD_AUTH',
                AuthParameters: authParams
            });
            const cognitoAccessToken = String(authOut?.AuthenticationResult?.AccessToken || '').trim();
            if (!cognitoAccessToken) {
                return res.status(401).json({ ok: false, message: 'No se pudo validar la contraseña actual en Cognito.' });
            }
            await cognitoPublicApi('ChangePassword', {
                PreviousPassword: String(currentPassword),
                ProposedPassword: String(newPassword),
                AccessToken: cognitoAccessToken
            });
            return res.json({ ok: true, message: 'Contrasena actualizada. Vuelve a iniciar sesion.' });
        } catch (error) {
            console.error('Error change-password:', error);
            const status = Number(error?.status) || 500;
            if (status >= 400 && status < 500) {
                return res.status(status).json({ ok: false, message: error.message || 'Error de cambio de clave Cognito' });
            }
            return res.status(500).json({ ok: false, message: 'Error interno' });
        }
    });

    app.post('/api/auth/logout', verificarToken, async (req, res) => {
        revokeAppSessionToken(req.authToken);
        res.clearCookie('cinteSession', { path: '/api', sameSite, secure: secureCookie });
        res.clearCookie('cinteXsrf', { path: '/', sameSite, secure: secureCookie });
        return res.json({ ok: true });
    });

    app.get('/api/dashboard/metrics', verificarToken, allowPanel('dashboard'), applyScope, async (req, res) => {
        try {
            const scopedRows = await getScopedNovedades(req.scope);
            const total = scopedRows.length;
            const porEstado = scopedRows.reduce((acc, n) => {
                const estado = String(n.estado || 'Pendiente');
                acc[estado] = (acc[estado] || 0) + 1;
                return acc;
            }, {});
            return res.json({ ok: true, data: { total, porEstado, areaScope: req.scope.areas[0] || 'Sin área' } });
        } catch (error) {
            console.error('Error metrics:', error);
            return res.status(500).json({ ok: false, error: 'Error consultando métricas' });
        }
    });

    app.get('/api/novedades', verificarToken, allowAnyPanel(['dashboard', 'calendar', 'gestion']), applyScope, async (req, res) => {
        try {
            const tipo = String(req.query.tipo || '').trim();
            const estado = String(req.query.estado || '').trim();
            const nombre = String(req.query.nombre || '').trim();
            const cliente = String(req.query.cliente || '').trim();
            const createdFrom = String(req.query.createdFrom || '').trim();
            const createdTo = String(req.query.createdTo || '').trim();
            const rows = await getScopedNovedades(req.scope, { tipo, estado, nombre, cliente, createdFrom, createdTo });
            const page = Math.max(1, Number(req.query.page || 1));
            const limitRaw = Number(req.query.limit || 0);
            const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 0;
            const total = rows.length;
            const start = limit > 0 ? (page - 1) * limit : 0;
            const end = limit > 0 ? start + limit : total;
            const pagedRows = rows.slice(start, end);
            const items = pagedRows.map(toClientNovedad);
            const totalPages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;
            return res.json({
                ok: true,
                items,
                data: items,
                pagination: {
                    page,
                    limit: limit || total,
                    total,
                    totalPages
                }
            });
        } catch (error) {
            console.error('Error novedades:', error);
            return res.status(500).json({ ok: false, error: 'Error consultando novedades' });
        }
    });

    app.get('/api/novedades/export-excel', verificarToken, allowAnyPanel(['dashboard', 'calendar', 'gestion']), applyScope, async (req, res) => {
        try {
            const ExcelJS = require('exceljs');
            const tipo = String(req.query.tipo || '').trim();
            const estado = String(req.query.estado || '').trim();
            const nombre = String(req.query.nombre || '').trim();
            const cliente = String(req.query.cliente || '').trim();
            const createdFrom = String(req.query.createdFrom || '').trim();
            const createdTo = String(req.query.createdTo || '').trim();
            const rows = await getScopedNovedades(req.scope, { tipo, estado, nombre, cliente, createdFrom, createdTo });
            if (rows.length > exportMaxRows) {
                return res.status(413).json({
                    ok: false,
                    error: `La exportación supera el límite permitido (${exportMaxRows} registros). Ajusta filtros o exporta por rangos.`
                });
            }
            const items = rows.map(toClientNovedad);
            const heDomingoDep = { toUtcMsFromDateAndTime, resolveFallbackDateKeyFromRow };
            const sundaySetsExport = buildSundayReportedSetsFromHeRows(
                rows.filter(rowIsHoraExtraTipo),
                buildConsultantKeyHeDomingo,
                heDomingoDep
            );

            const columns = [
                { header: 'Fecha Creación', key: 'fechaCreacion', width: 20 },
                { header: 'Nombre', key: 'nombre', width: 28 },
                { header: 'Cédula', key: 'cedula', width: 14 },
                { header: 'Correo', key: 'correo', width: 30 },
                { header: 'Cliente', key: 'cliente', width: 22 },
                { header: 'Tipo Novedad', key: 'tipoNovedad', width: 24 },
                { header: 'Fecha Inicio', key: 'fechaInicio', width: 14 },
                { header: 'Fecha Fin', key: 'fechaFin', width: 14 },
                { header: 'Cantidad', key: 'cantidad', width: 18 },
                { header: 'Hora inicial', key: 'horaInicial', width: 12 },
                { header: 'Hora final', key: 'horaFinal', width: 12 },
                { header: 'Horas diurnas', key: 'horasDiurnas', width: 14 },
                { header: 'Horas nocturnas', key: 'horasNocturnas', width: 14 },
                { header: 'Horas recargo domingo', key: 'horasRecargoDomingo', width: 18 },
                { header: 'Recargo dominical/festivos — diurno', key: 'horasRecargoDomingoDiurnas', width: 22 },
                { header: 'Recargo dominical/festivos — nocturno', key: 'horasRecargoDomingoNocturnas', width: 24 },
                { header: 'Observación HE domingo', key: 'observacionHeDomingo', width: 48 },
                { header: 'Valor bonificación (COP)', key: 'valorCop', width: 22 },
                { header: 'Estado', key: 'estado', width: 14 },
                { header: 'Asignado a (roles)', key: 'asignadoRoles', width: 36 },
                { header: 'Aprobado / rechazado por (correo)', key: 'aprobadoPorCorreo', width: 32 }
            ];

            const wb = new ExcelJS.Workbook();
            wb.creator = 'CINTE Novedades';
            wb.created = new Date();
            const ws = wb.addWorksheet('Reporte Novedades');
            ws.columns = columns;

            const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF004D87' } };
            const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Montserrat' };
            const thinBorder = {
                top: { style: 'thin', color: { argb: 'FF1A3A56' } },
                left: { style: 'thin', color: { argb: 'FF1A3A56' } },
                bottom: { style: 'thin', color: { argb: 'FF1A3A56' } },
                right: { style: 'thin', color: { argb: 'FF1A3A56' } }
            };

            const headerRow = ws.getRow(1);
            headerRow.eachCell((cell) => {
                cell.fill = headerFill;
                cell.font = headerFont;
                cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
                cell.border = thinBorder;
            });
            headerRow.height = 24;

            for (let i = 0; i < items.length; i++) {
                const it = items[i];
                const row = rows[i];
                const correoActor = it.estado === 'Rechazado' ? (it.rechazadoPorCorreo || '') : (it.aprobadoPorCorreo || '');
                const esPorHoras = getCantidadMedidaKind(it.tipoNovedad) === 'hours';
                let observacionHeDomingo = '';
                if (rowIsHoraExtraTipo(row)) {
                    observacionHeDomingo = computeHeDomingoObservacionForRow(row, sundaySetsExport, buildConsultantKeyHeDomingo, heDomingoDep);
                    if (!observacionHeDomingo && String(row.he_domingo_observacion || '').trim()) {
                        observacionHeDomingo = String(row.he_domingo_observacion || '').trim();
                    }
                }
                ws.addRow({
                    fechaCreacion: new Date(it.creadoEn).toLocaleString('es-ES'),
                    nombre: it.nombre || '',
                    cedula: it.cedula || '',
                    correo: it.correoSolicitante || '',
                    cliente: it.cliente || '',
                    tipoNovedad: formatTipoNovedadParaExportExcel(it),
                    fechaInicio: it.fechaInicio || '',
                    fechaFin: it.fechaFin || '',
                    cantidad: formatCantidadNovedad(it.tipoNovedad, it.cantidadHoras, it),
                    horaInicial: esPorHoras ? formatHoraMinutaParaExcel(it.horaInicio) : '',
                    horaFinal: esPorHoras ? formatHoraMinutaParaExcel(it.horaFin) : '',
                    horasDiurnas: Number(it.horasDiurnas || 0) > 0 ? Number(it.horasDiurnas) : '',
                    horasNocturnas: Number(it.horasNocturnas || 0) > 0 ? Number(it.horasNocturnas) : '',
                    horasRecargoDomingo: Number(it.horasRecargoDomingo || 0) > 0 ? Number(it.horasRecargoDomingo) : '',
                    horasRecargoDomingoDiurnas:
                        Number(it.horasRecargoDomingoDiurnas || 0) > 0 ? Number(it.horasRecargoDomingoDiurnas) : '',
                    horasRecargoDomingoNocturnas:
                        Number(it.horasRecargoDomingoNocturnas || 0) > 0 ? Number(it.horasRecargoDomingoNocturnas) : '',
                    observacionHeDomingo,
                    valorCop: it.montoCop != null && Number(it.montoCop) > 0 ? Number(it.montoCop) : '',
                    estado: it.estado || '',
                    asignadoRoles: it.asignacionRolesEtiqueta || '—',
                    aprobadoPorCorreo: it.estado === 'Pendiente' ? '' : correoActor
                });
            }

            ws.eachRow((row, rowNum) => {
                if (rowNum === 1) return;
                row.eachCell((cell) => {
                    cell.border = thinBorder;
                    cell.alignment = { vertical: 'middle' };
                    cell.font = { size: 10, name: 'Montserrat' };
                });
            });

            columns.forEach((col, idx) => {
                let maxLen = col.header.length;
                ws.getColumn(idx + 1).eachCell({ includeEmpty: false }, (cell) => {
                    const len = String(cell.value || '').length;
                    if (len > maxLen) maxLen = len;
                });
                ws.getColumn(idx + 1).width = Math.min(maxLen + 4, 50);
            });

            const excelColName = (index1Based) => {
                let n = Number(index1Based || 1);
                let name = '';
                while (n > 0) {
                    const rem = (n - 1) % 26;
                    name = String.fromCharCode(65 + rem) + name;
                    n = Math.floor((n - 1) / 26);
                }
                return name || 'A';
            };
            ws.autoFilter = { from: 'A1', to: `${excelColName(columns.length)}1` };

            const filename = `novedades_reporte_${new Date().toISOString().slice(0, 10)}.xlsx`;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
            );
            await wb.xlsx.write(res);
            res.end();
        } catch (error) {
            console.error('Error exportando novedades Excel:', error);
            if (!res.headersSent) {
                return res.status(500).json({ ok: false, error: 'Error exportando reporte Excel' });
            }
        }
    });

    app.get('/api/novedades/hora-extra-alertas', verificarToken, allowPanel('gestion'), applyScope, async (req, res) => {
        try {
            const createdFrom = String(req.query.createdFrom || '').trim();
            const createdTo = String(req.query.createdTo || '').trim();
            const data = await getHoraExtraAlerts(req.scope, {
                createdFrom,
                createdTo,
                maxDailyHours: 2,
                maxMonthlyHours: 48
            });
            return res.json({ ok: true, data });
        } catch (error) {
            console.error('Error hora-extra-alertas:', error);
            return res.status(500).json({ ok: false, error: 'Error consultando alertas de hora extra' });
        }
    });

    app.get('/api/catalogos/clientes', catalogLimiter, async (req, res) => {
        try {
            const rawItems = await getClientesList();
            const items = rawItems.slice(0, 500).map((v) => String(v || '').trim()).filter(Boolean);
            return res.json({ ok: true, items });
        } catch (error) {
            console.error('Error catalogo clientes:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo consultar catalogo de clientes' });
        }
    });

    app.get('/api/catalogos/lideres', catalogLimiter, async (req, res) => {
        try {
            const cliente = normalizeCatalogValue(req.query?.cliente || '');
            if (!cliente) return res.status(400).json({ ok: false, error: 'Parametro cliente es obligatorio' });
            const items = (await getLideresByCliente(cliente))
                .slice(0, 500)
                .map((v) => String(v || '').trim())
                .filter(Boolean);
            return res.json({ ok: true, items, cliente });
        } catch (error) {
            console.error('Error catalogo lideres:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo consultar catalogo de lideres' });
        }
    });

    app.get('/api/catalogos/colaborador', catalogLimiter, async (req, res) => {
        try {
            const cedula = normalizeCedula(req.query?.cedula || '');
            if (!cedula) {
                return res.status(400).json({ ok: false, error: 'Cédula requerida (solo números, sin puntos ni comas).' });
            }
            const row = await getColaboradorByCedula(cedula);
            if (!row) {
                return res.status(404).json({ ok: false, error: 'Cédula no registrada en el directorio de colaboradores.' });
            }
            const clienteRaw = String(row.cliente || '').trim();
            const liderRaw = String(row.lider_catalogo || '').trim();
            const clienteNorm = normalizeCatalogValue(clienteRaw);
            const liderNorm = normalizeCatalogValue(liderRaw);
            let clienteOut = clienteNorm;
            let liderOut = liderNorm;
            const clientesList = await getClientesList();
            const { map: foldClienteMap } = buildFoldToCanonicoMap(clientesList);
            const clienteCanon = matchExcelClienteABd(clienteNorm, foldClienteMap);
            if (clienteCanon) clienteOut = clienteCanon;
            const lideresLista = await getLideresByCliente(clienteNorm);
            if (liderNorm && lideresLista.length > 0) {
                const liderMatch = matchFoldToCandidate(liderNorm, lideresLista);
                if (liderMatch) liderOut = liderMatch;
            }
            const lockCliente = Boolean(clienteNorm);
            const lockLider = Boolean(liderNorm);
            const correoOut = String(row.correo_cinte || '').trim().toLowerCase();
            const lockCorreo = Boolean(correoOut);
            return res.json({
                ok: true,
                cedula: row.cedula,
                nombre: row.nombre,
                // Precarga el correo Cinte en el formulario público. Riesgo de enumeración mitigado con
                // catalogLimiter; el POST /api/enviar-novedad sigue resolviendo el correo desde BD (no confía solo en el cliente).
                correo: correoOut,
                lockCorreo,
                cliente: clienteOut,
                lider: liderOut,
                lockCliente,
                lockLider
            });
        } catch (error) {
            console.error('Error catalogo colaborador:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo consultar el colaborador' });
        }
    });

    app.post('/api/hora-extra-domingo-preview', submitLimiter, async (req, res) => {
        try {
            const body = req.body || {};
            const cedula = normalizeCedula(body.cedula || '');
            if (!cedula) {
                return res.status(400).json({ ok: false, error: 'Cédula requerida (solo números).' });
            }
            const col = await getColaboradorByCedula(cedula);
            if (!col) {
                return res.status(404).json({ ok: false, error: 'Cédula no registrada en el directorio de colaboradores.' });
            }
            const fi = parseDateOrNull(body.fechaInicio);
            const ff = parseDateOrNull(body.fechaFin);
            const hi = parseTimeOrNull(body.horaInicio);
            const hf = parseTimeOrNull(body.horaFin);
            if (!fi || !ff || !hi || !hf) {
                return res.status(400).json({ ok: false, error: 'Indica fecha inicio, fecha fin, hora inicio y hora fin de Hora Extra.' });
            }
            const nombreCol = String(col.nombre || body.nombre || '').trim();
            const rowsHe = await listHoraExtraByCedulaForDomingoPolicy(cedula);
            const synthetic = buildSyntheticHoraExtraRow({
                nombre: nombreCol,
                cedula,
                fechaInicio: fi,
                fechaFin: ff,
                horaInicio: hi,
                horaFin: hf
            });
            const dep = { toUtcMsFromDateAndTime, resolveFallbackDateKeyFromRow };
            const prev = computeHeDomingoCompensacionPreview(rowsHe, synthetic, dep, buildConsultantKeyHeDomingo);
            if (prev.requiereEleccionCompensacion && !prev.domingoTrabajadoYmd) {
                return res.status(400).json({
                    ok: false,
                    error: 'No se pudo determinar el domingo trabajado para la ventana de compensación. Revisa el lapso de Hora Extra.'
                });
            }
            return res.json({
                ok: true,
                requiereEleccionCompensacion: prev.requiereEleccionCompensacion,
                esTercerDomingoOMas: prev.esTercerDomingoOMas,
                domingoTrabajadoYmd: prev.domingoTrabajadoYmd,
                compensatorioTiempoMinYmd: prev.compensatorioTiempoMinYmd,
                compensatorioTiempoMaxYmd: prev.compensatorioTiempoMaxYmd,
                maxTier: prev.maxTier
            });
        } catch (error) {
            console.error('hora-extra-domingo-preview:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo calcular la política de domingo.' });
        }
    });

    app.post('/api/enviar-novedad', submitLimiter, upload.any(), async (req, res) => {
        try {
            const body = req.body || {};
            const files = (Array.isArray(req.files) ? req.files : [])
                .filter((f) => ['soporte', 'soportes'].includes(String(f.fieldname || '').toLowerCase()));
            const tipoNovedad = String(body.tipoNovedad || body.tipo || '').trim();
            const rule = getNovedadRuleByType(tipoNovedad);
            const requiredMinSupports = Number(rule?.requiredMinSupports || 0);
            if (requiredMinSupports > 0 && files.length < requiredMinSupports) {
                return res.status(400).json({
                    ok: false,
                    error: `Debes adjuntar al menos ${requiredMinSupports} soporte(s) para ${rule.displayName || tipoNovedad}.`
                });
            }

            for (const file of files) {
                const ext = path.extname(file.originalname || '').toLowerCase();
                const mimeOk = !file.mimetype || allowedMimes.has(file.mimetype);
                const extOk = allowedExt.has(ext);
                const contentOk = await validateUploadMagicBytes(file);
                if (!mimeOk || !extOk || !contentOk) {
                    return res.status(400).json({ ok: false, error: 'Tipo de archivo no permitido. Solo PDF, JPG, PNG, XLS o XLSX.' });
                }
            }

            const tipoKeyPostAdjuntos = String(rule?.key || normalizeNovedadTypeKey(tipoNovedad) || '');
            if (tipoKeyPostAdjuntos === 'vacaciones_dinero') {
                if (files.length < 1) {
                    return res.status(400).json({
                        ok: false,
                        error:
                            'Vacaciones en dinero requiere adjuntar la carta con firma manuscrita (solicitud formal) en formato PDF.'
                    });
                }
                for (const file of files) {
                    const ext = path.extname(file.originalname || '').toLowerCase();
                    const mime = String(file.mimetype || '').toLowerCase();
                    if (ext !== '.pdf' || (mime && mime !== 'application/pdf')) {
                        return res.status(400).json({
                            ok: false,
                            error:
                                'Vacaciones en dinero solo admite archivos PDF para la carta de solicitud formal con firma manuscrita.'
                        });
                    }
                }
            }

            const rutasSoporte = [];
            for (const file of files) {
                if (s3Client) {
                    const s3Key = buildS3SupportKey(body, file.originalname);
                    await s3Client.send(new PutObjectCommand({
                        Bucket: S3_BUCKET_NAME,
                        Key: s3Key,
                        Body: file.buffer,
                        ContentType: file.mimetype || 'application/octet-stream',
                        Metadata: {
                            originalname: sanitizeFileName(file.originalname || ''),
                            uploader: sanitizeSegment(body.correoSolicitante || body.nombre || 'anonimo')
                        }
                    }));
                    rutasSoporte.push(s3Key);
                } else {
                    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
                    const ext = path.extname(file.originalname || '') || '.bin';
                    const fallbackName = `soporte-${uniqueSuffix}${ext}`;
                    await fs.promises.writeFile(path.join(uploadDir, fallbackName), file.buffer);
                    rutasSoporte.push(`/assets/uploads/${fallbackName}`);
                }
            }
            let archivoRuta = null;
            if (rutasSoporte.length === 1) {
                archivoRuta = rutasSoporte[0];
            } else if (rutasSoporte.length > 1) {
                archivoRuta = JSON.stringify(rutasSoporte);
            }
            const area = inferAreaFromNovedad(body);

            const cedulaNorm = normalizeCedula(body.cedula || '');
            if (!cedulaNorm) {
                return res.status(400).json({ ok: false, error: 'Cédula inválida. Usa solo números, sin puntos ni comas.' });
            }
            const colaborador = await getColaboradorByCedula(cedulaNorm);
            if (!colaborador) {
                return res.status(400).json({
                    ok: false,
                    error: 'La cédula no está registrada en el directorio de colaboradores. No se puede enviar la novedad.'
                });
            }
            const nombreColaborador = String(colaborador.nombre || '').trim();

            const merged = resolvePostedContactFromColaborador(body, colaborador, normalizeCatalogValue);
            const cliente = merged.cliente;
            const lider = merged.lider;
            const correoSolicitanteFinal = merged.correo;

            if (!cliente || !lider) {
                return res.status(400).json({
                    ok: false,
                    error: 'Cliente y líder son obligatorios. Completa el directorio del colaborador o selecciona cliente y líder válidos.'
                });
            }
            const lideresValidos = await getLideresByCliente(cliente);
            const liderNormPost = normalizeCatalogValue(lider);
            const liderOk =
                Boolean(liderNormPost) &&
                lideresValidos.some((li) => foldForMatch(li) === foldForMatch(liderNormPost));
            if (!liderOk) {
                return res.status(400).json({ ok: false, error: 'El lider no pertenece al cliente seleccionado.' });
            }

            const fecha = parseDateOrNull(body.fecha);
            const horaInicio = parseTimeOrNull(body.horaInicio);
            const horaFin = parseTimeOrNull(body.horaFin);
            const fechaInicio = parseDateOrNull(body.fechaInicio) || fecha;
            const fechaFin = parseDateOrNull(body.fechaFin);
            const novedadTypeKey = String(rule?.key || normalizeNovedadTypeKey(tipoNovedad) || '');
            const todayUtc = new Date().toISOString().slice(0, 10);

            if (novedadTypeKey !== 'vacaciones_dinero' && !fechaInicio) {
                return res.status(400).json({ ok: false, error: 'Fecha Inicio es obligatoria.' });
            }
            if (fechaFin && fechaInicio && fechaFin < fechaInicio) {
                return res.status(400).json({ ok: false, error: 'Fecha Fin no puede ser menor a Fecha Inicio.' });
            }
            if (novedadTypeKey === 'incapacidad' && fechaInicio > todayUtc) {
                return res.status(400).json({ ok: false, error: 'Incapacidad no puede tener Fecha Inicio futura.' });
            }

            let cantidadHoras = Number(body.cantidadHoras || 0) || 0;
            let horasDiurnas = Number(body.horasDiurnas || 0) || 0;
            let horasNocturnas = Number(body.horasNocturnas || 0) || 0;
            let horasRecargoDomingo = 0;
            let horasRecargoDomingoDiurnas = 0;
            let horasRecargoDomingoNocturnas = 0;
            let tipoHoraExtra = String(body.tipoHoraExtra || '').trim() || null;
            let heDomingoObservacionInsert = null;

            if (novedadTypeKey === 'vacaciones_tiempo') {
                if (!fechaFin) {
                    return res.status(400).json({ ok: false, error: 'Vacaciones en tiempo requiere Fecha Fin.' });
                }
                const businessDays = countBusinessDaysInclusive(fechaInicio, fechaFin);
                if (businessDays <= 0) {
                    return res.status(400).json({ ok: false, error: 'El rango de fechas no contiene días hábiles para vacaciones.' });
                }
                cantidadHoras = businessDays;
            }

            if (novedadTypeKey === 'vacaciones_dinero') {
                const diasRaw = Number(body.diasSolicitados ?? body.cantidadHoras ?? 0);
                if (!Number.isFinite(diasRaw) || diasRaw < 1 || Math.floor(diasRaw) !== diasRaw) {
                    return res.status(400).json({
                        ok: false,
                        error: 'Vacaciones en dinero requiere cantidad de días (entero mayor o igual a 1).'
                    });
                }
                cantidadHoras = Math.floor(diasRaw);
            }

            if (novedadTypeKey === 'hora_extra') {
                if (!horaInicio || !horaFin || !fechaInicio || !fechaFin) {
                    return res.status(400).json({ ok: false, error: 'Hora Extra requiere Fecha Inicio/Fin y Hora Inicio/Fin.' });
                }
                const startMs = toUtcMsFromDateAndTime(fechaInicio, horaInicio);
                const endMs = toUtcMsFromDateAndTime(fechaFin, horaFin);
                const MAX_HORA_EXTRA_MS = 168 * 60 * 60 * 1000;
                if (
                    startMs != null &&
                    endMs != null &&
                    Number.isFinite(endMs - startMs) &&
                    endMs - startMs > MAX_HORA_EXTRA_MS
                ) {
                    return res.status(400).json({
                        ok: false,
                        error: 'Hora Extra: el lapso entre inicio y fin no puede superar 168 horas (7 días).'
                    });
                }
                const split = computeHoraExtraSplitBogota(startMs, endMs);
                if (split.total <= 0) {
                    return res.status(400).json({ ok: false, error: 'La fecha/hora fin debe ser mayor a la fecha/hora inicio.' });
                }
                cantidadHoras = split.total;
                horasDiurnas = split.diurnas;
                horasNocturnas = split.nocturnas;
                horasRecargoDomingo = split.horasRecargoDomingo;
                horasRecargoDomingoDiurnas = split.horasRecargoDomingoDiurnas;
                horasRecargoDomingoNocturnas = split.horasRecargoDomingoNocturnas;
                tipoHoraExtra = resolveHoraExtraLabel(
                    horasDiurnas,
                    horasNocturnas,
                    horasRecargoDomingoDiurnas,
                    horasRecargoDomingoNocturnas
                );

                const rowsHeDom = await listHoraExtraByCedulaForDomingoPolicy(cedulaNorm);
                const syntheticHeDom = buildSyntheticHoraExtraRow({
                    nombre: nombreColaborador,
                    cedula: cedulaNorm,
                    fechaInicio,
                    fechaFin,
                    horaInicio,
                    horaFin
                });
                const depHeDom = { toUtcMsFromDateAndTime, resolveFallbackDateKeyFromRow };
                const prevHeDom = computeHeDomingoCompensacionPreview(
                    rowsHeDom,
                    syntheticHeDom,
                    depHeDom,
                    buildConsultantKeyHeDomingo
                );
                const rawCompHe = String(body.heDomingoCompensacion || '').trim().toLowerCase();
                const rawDiaComp = String(body.diaCompensatorioYmd || body.domingoCompensatorioYmd || '').trim();
                if (prevHeDom.requiereEleccionCompensacion) {
                    if (rawCompHe !== 'tiempo' && rawCompHe !== 'dinero') {
                        return res.status(400).json({
                            ok: false,
                            error: 'Hora Extra (segundo domingo con HE en el mes): elige compensación en tiempo o en dinero.'
                        });
                    }
                    if (rawCompHe === 'tiempo') {
                        if (!prevHeDom.domingoTrabajadoYmd) {
                            return res.status(400).json({
                                ok: false,
                                error: 'No se pudo determinar el domingo trabajado para validar el día compensatorio.'
                            });
                        }
                        if (!isYmdEnVentanaCompensatorio(prevHeDom.domingoTrabajadoYmd, rawDiaComp)) {
                            return res.status(400).json({
                                ok: false,
                                error: `Indica un día compensatorio entre ${prevHeDom.compensatorioTiempoMinYmd} y ${prevHeDom.compensatorioTiempoMaxYmd} (15 días calendario posteriores al domingo trabajado).`
                            });
                        }
                        heDomingoObservacionInsert = buildHeDomingoCompObservacionLine({
                            mode: 'tiempo',
                            workedYmd: prevHeDom.domingoTrabajadoYmd,
                            compensatorioYmd: rawDiaComp
                        });
                    } else {
                        heDomingoObservacionInsert = buildHeDomingoCompObservacionLine({
                            mode: 'dinero',
                            workedYmd: prevHeDom.domingoTrabajadoYmd
                        });
                    }
                } else if (prevHeDom.esTercerDomingoOMas && prevHeDom.domingoTrabajadoYmd) {
                    heDomingoObservacionInsert = buildHeDomingoCompObservacionLine({
                        mode: 'tercer_domingo',
                        workedYmd: prevHeDom.domingoTrabajadoYmd
                    });
                } else if (rawCompHe || rawDiaComp) {
                    return res.status(400).json({
                        ok: false,
                        error: 'Esta Hora Extra no aplica elección de compensación dominical; no envíes compensación en tiempo/dinero.'
                    });
                }
            }

            let montoCop = null;
            if (novedadTypeKey === 'bonos' || novedadTypeKey === 'apoyo') {
                const rawMonto = body.montoCop ?? body.montoBono ?? body.valorBonificacion;
                const parsed = parseMontoCopFromBody(rawMonto);
                if (!Number.isFinite(parsed) || parsed <= 0) {
                    const tipoLabel = novedadTypeKey === 'bonos' ? 'Bonos' : 'Disponibilidad';
                    return res.status(400).json({ ok: false, error: `${tipoLabel} requiere un valor en pesos mayor a cero.` });
                }
                montoCop = Number(parsed.toFixed(2));
                cantidadHoras = 0;
            }

            const gpUserIdSnapshot = colaborador.gp_user_id || null;

            let insertFechaInicio = fechaInicio;
            let insertFechaFin = fechaFin;
            if (novedadTypeKey === 'vacaciones_dinero') {
                insertFechaInicio = fechaInicio || todayUtc;
                insertFechaFin = null;
            }

            const insertResult = await pool.query(
                `INSERT INTO novedades (
                    nombre, cedula, correo_solicitante, cliente, lider, gp_user_id, tipo_novedad, area,
                    fecha, hora_inicio, hora_fin, fecha_inicio, fecha_fin,
                    cantidad_horas, horas_diurnas, horas_nocturnas, horas_recargo_domingo, horas_recargo_domingo_diurnas, horas_recargo_domingo_nocturnas, tipo_hora_extra, soporte_ruta, monto_cop, he_domingo_observacion, estado
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8::user_area,
                    $9::date, $10::time, $11::time, $12::date, $13::date,
                    $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, 'Pendiente'::novedad_estado
                )
                RETURNING id`,
                [
                    nombreColaborador,
                    cedulaNorm,
                    correoSolicitanteFinal,
                    cliente,
                    lider,
                    gpUserIdSnapshot,
                    tipoNovedad,
                    area,
                    fecha,
                    horaInicio,
                    horaFin,
                    insertFechaInicio,
                    insertFechaFin,
                    cantidadHoras,
                    horasDiurnas,
                    horasNocturnas,
                    horasRecargoDomingo,
                    horasRecargoDomingoDiurnas,
                    horasRecargoDomingoNocturnas,
                    tipoHoraExtra,
                    archivoRuta,
                    montoCop,
                    heDomingoObservacionInsert || null
                ]
            );
            const novedadId = insertResult?.rows?.[0]?.id || '';
            const emailPayload = buildFormSubmittedNotificationEvent({
                novedadId,
                body,
                nombreColaborador,
                cliente,
                lider,
                tipoNovedad,
                fechaInicio: insertFechaInicio,
                fechaFin: insertFechaFin,
                cantidadHoras,
                montoCop,
                correoSolicitanteResolved: correoSolicitanteFinal
            });
            try {
                if (typeof resolveApproverEmailsForNovedad === 'function') {
                    const { emails, reason, insights } = await resolveApproverEmailsForNovedad(tipoNovedad);
                    emailPayload.admin.notifyTo = emails;
                    if (emails.length === 0) {
                        console.warn(
                            '[email-notifications] notifyTo vacío desde Cognito; la Lambda no usará EMAIL_ADMIN_TO* (solo correo al solicitante).',
                            { novedadId, tipoNovedad, reason, insights }
                        );
                    }
                }
            } catch (resolverErr) {
                emailPayload.admin.notifyTo = [];
                console.error('[email-notifications] Error resolviendo correos de approvers (Cognito)', {
                    novedadId,
                    tipoNovedad,
                    message: resolverErr?.message || String(resolverErr)
                });
            }
            try {
                const publishResult = await emailNotificationsPublisher?.publishFormSubmitted?.(emailPayload);
                if (publishResult?.accepted) {
                    console.log('[email-notifications] Evento form_submitted aceptado.', {
                        eventId: emailPayload.eventId,
                        requestId: publishResult.requestId
                    });
                } else if (!publishResult?.skipped) {
                    console.warn('[email-notifications] Evento no aceptado.', {
                        eventId: emailPayload.eventId,
                        statusCode: publishResult?.statusCode || 0
                    });
                }
            } catch (notifyError) {
                console.error('[email-notifications] Error publicando evento form_submitted', {
                    eventId: emailPayload.eventId,
                    message: notifyError?.message || String(notifyError)
                });
            }
            return res.json({ ok: true, success: true, id: novedadId });
        } catch (error) {
            console.error('Error al guardar:', error);
            return res.status(500).json({ ok: false, error: 'Error al guardar' });
        }
    });

    app.get('/api/soportes/url', verificarToken, allowAnyPanel(['dashboard', 'calendar', 'gestion']), async (req, res) => {
        try {
            const key = String(req.query.key || '').trim();
            if (!key) return res.status(400).json({ ok: false, error: 'Key de soporte requerida' });

            if (key.startsWith('/assets/')) {
                const safePath = path.posix.normalize(key.replace(/\\/g, '/'));
                if (!safePath.startsWith('/assets/uploads/')) {
                    return res.status(400).json({ ok: false, error: 'Clave de soporte inválida' });
                }
                const origin = `${req.protocol}://${req.get('host')}`;
                return res.json({ ok: true, url: `${origin}${safePath}`, source: 'local' });
            }

            if (!s3Client) {
                return res.status(400).json({ ok: false, error: 'S3 no está configurado en backend' });
            }

            const command = new GetObjectCommand({
                Bucket: S3_BUCKET_NAME,
                Key: key
            });
            const url = await getSignedUrl(s3Client, command, { expiresIn: S3_SIGNED_URL_TTL_SEC });
            return res.json({ ok: true, url, source: 's3', expiresIn: S3_SIGNED_URL_TTL_SEC });
        } catch (error) {
            console.error('Error firmando URL de soporte:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo generar URL firmada' });
        }
    });

    app.get('/api/soportes/preview', verificarToken, allowAnyPanel(['dashboard', 'calendar', 'gestion']), async (req, res) => {
        try {
            const key = String(req.query.key || '').trim();
            if (!key) return res.status(400).json({ ok: false, error: 'Key de soporte requerida' });
            const lower = key.toLowerCase();
            if (!(lower.endsWith('.xls') || lower.endsWith('.xlsx'))) {
                return res.status(400).json({ ok: false, error: 'La previsualización aplica solo para Excel (XLS/XLSX).' });
            }

            let workbookBuffer = null;
            if (key.startsWith('/assets/')) {
                const safePath = path.posix.normalize(key.replace(/\\/g, '/'));
                if (!safePath.startsWith('/assets/uploads/')) {
                    return res.status(400).json({ ok: false, error: 'Clave de soporte inválida' });
                }
                const absolutePath = path.join(process.cwd(), safePath.replace(/^\/+/, ''));
                workbookBuffer = await fs.promises.readFile(absolutePath);
            } else {
                if (!s3Client) {
                    return res.status(400).json({ ok: false, error: 'S3 no está configurado en backend' });
                }
                const s3Out = await s3Client.send(new GetObjectCommand({
                    Bucket: S3_BUCKET_NAME,
                    Key: key
                }));
                workbookBuffer = await streamToBuffer(s3Out.Body);
            }

            const workbook = xlsx.read(workbookBuffer, { type: 'buffer' });
            const sheetName = workbook.SheetNames?.[0];
            if (!sheetName) {
                return res.status(404).json({ ok: false, error: 'El archivo Excel no contiene hojas.' });
            }
            const sheet = workbook.Sheets[sheetName];
            const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            const limited = rows.slice(0, 100).map((row) => (Array.isArray(row) ? row.slice(0, 20) : []));
            return res.json({
                ok: true,
                sheetName,
                rows: limited,
                totalRows: rows.length,
                truncated: rows.length > 100
            });
        } catch (error) {
            console.error('Error previsualizando Excel:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo previsualizar el archivo Excel.' });
        }
    });

    app.post('/api/actualizar-estado', verificarToken, allowPanel('gestion'), applyScope, async (req, res) => {
        try {
            const { id, nuevoEstado } = req.body || {};
            const fromHoraExtraAlert = Boolean(req.body?.fromHoraExtraAlert);
            const estado = normalizeEstado(nuevoEstado);
            const actorSub = String(req.user?.sub || '').trim();
            const actorUserIdRaw = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorSub)
                ? actorSub
                : null;

            let actorUserId = null;
            if (actorUserIdRaw || req.user?.email) {
                try {
                    const uq = await pool.query(
                        'SELECT id FROM users WHERE id = $1 OR email = $2 LIMIT 1',
                        [actorUserIdRaw, req.user?.email || '']
                    );
                    actorUserId = uq.rows[0]?.id || null;
                } catch {
                    actorUserId = null;
                }
            }

            let q;
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id || ''))) {
                q = await pool.query(
                    `SELECT id, area, tipo_novedad, estado, nombre, correo_solicitante, cliente, lider, fecha_inicio, fecha_fin, cantidad_horas, monto_cop
                     FROM novedades
                     WHERE id = $1::uuid
                     LIMIT 1`,
                    [id]
                );
            } else {
                q = await pool.query(
                    `SELECT id, area, tipo_novedad, estado, nombre, correo_solicitante, cliente, lider, fecha_inicio, fecha_fin, cantidad_horas, monto_cop
                     FROM novedades
                     WHERE creado_en = $1::timestamptz
                     LIMIT 1`,
                    [id]
                );
            }
            const item = q.rows[0];
            if (!item) return res.status(404).json({ ok: false, error: 'Registro no encontrado' });

            if (!req.scope.canViewAllAreas && (!item.area || !req.scope.areas.includes(item.area))) {
                return res.status(403).json({ ok: false, error: 'No autorizado sobre esta área' });
            }
            if (!canRoleApproveType(req.user.role, item.tipo_novedad)) {
                return res.status(403).json({ ok: false, error: 'Este rol no puede aprobar/rechazar este tipo de novedad' });
            }

            const emailOk = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
            // Derivar actor exclusivamente del token/sesión validado en backend (MED-006).
            let actorEmail = String(req.user?.email || '').trim();
            if (!emailOk(actorEmail) && String(req.user?.username || '').includes('@')) {
                actorEmail = String(req.user.username).trim();
            }
            if (!actorEmail) {
                const payload = decodeJwtPayload(req.authToken) || {};
                const un = String(payload.username || '').trim();
                const cognitoU = String(payload['cognito:username'] || '').trim();
                actorEmail =
                    String(payload.email || '').trim()
                    || (emailOk(payload.preferred_username) ? String(payload.preferred_username).trim() : '')
                    || (un.includes('@') ? un : '')
                    || (cognitoU.includes('@') ? cognitoU : '')
                    || '';
            }
            if (!actorEmail) {
                console.warn('[actualizar-estado] actorEmail vacío tras fallbacks', {
                    sub: req.user?.sub,
                    role: req.user?.role
                });
            }
            await pool.query(
                `UPDATE novedades
                 SET estado = $1::novedad_estado,
                     aprobado_en = CASE WHEN $1::novedad_estado = 'Aprobado' THEN NOW() ELSE NULL END,
                     aprobado_por_rol = CASE WHEN $1::novedad_estado = 'Aprobado' THEN $2::user_role ELSE NULL END,
                     aprobado_por_user_id = CASE WHEN $1::novedad_estado = 'Aprobado' THEN $3::uuid ELSE NULL END,
                     aprobado_por_email = CASE WHEN $1::novedad_estado = 'Aprobado' THEN NULLIF($4::text, '') ELSE NULL END,
                     rechazado_en = CASE WHEN $1::novedad_estado = 'Rechazado' THEN NOW() ELSE NULL END,
                     rechazado_por_rol = CASE WHEN $1::novedad_estado = 'Rechazado' THEN $2::user_role ELSE NULL END,
                     rechazado_por_user_id = CASE WHEN $1::novedad_estado = 'Rechazado' THEN $3::uuid ELSE NULL END,
                     rechazado_por_email = CASE WHEN $1::novedad_estado = 'Rechazado' THEN NULLIF($4::text, '') ELSE NULL END,
                     alerta_he_origen = CASE WHEN $6::boolean THEN TRUE ELSE alerta_he_origen END,
                     alerta_he_resuelta_estado = CASE WHEN $6::boolean THEN $1::text ELSE alerta_he_resuelta_estado END,
                     alerta_he_resuelta_en = CASE WHEN $6::boolean THEN NOW() ELSE alerta_he_resuelta_en END,
                     alerta_he_resuelta_por_email = CASE WHEN $6::boolean THEN NULLIF($4::text, '') ELSE alerta_he_resuelta_por_email END
                 WHERE id = $5::uuid`,
                [estado, req.user.role, actorUserId, actorEmail, item.id, fromHoraExtraAlert]
            );

            await pool.query(
                `INSERT INTO novedad_status_history (novedad_id, estado_anterior, estado_nuevo, changed_by_user_id, changed_by_role)
                 VALUES ($1::uuid, $2::novedad_estado, $3::novedad_estado, $4::uuid, $5::user_role)`,
                [item.id, normalizeEstado(item.estado), estado, actorUserId, req.user.role]
            );

            const submitterEmail = String(item.correo_solicitante || '').trim().toLowerCase();
            if (submitterEmail.includes('@') && (estado === 'Aprobado' || estado === 'Rechazado')) {
                const statusPayload = buildFormStatusChangedNotificationEvent({
                    novedadId: item.id,
                    nombreColaborador: item.nombre,
                    correoSolicitante: submitterEmail,
                    cliente: item.cliente,
                    lider: item.lider,
                    tipoNovedad: item.tipo_novedad,
                    fechaInicio: item.fecha_inicio,
                    fechaFin: item.fecha_fin,
                    cantidadHoras: item.cantidad_horas,
                    montoCop: item.monto_cop,
                    previousEstado: normalizeEstado(item.estado),
                    newEstado: estado,
                    changedByEmail: actorEmail
                });
                try {
                    const publishResult = await emailNotificationsPublisher?.publishFormStatusChanged?.(statusPayload);
                    if (publishResult?.accepted) {
                        console.log('[email-notifications] Evento form_status_changed aceptado.', {
                            eventId: statusPayload.eventId,
                            requestId: publishResult.requestId,
                            novedadId: item.id
                        });
                    } else if (!publishResult?.skipped) {
                        console.warn('[email-notifications] Evento form_status_changed no aceptado.', {
                            eventId: statusPayload.eventId,
                            statusCode: publishResult?.statusCode || 0,
                            novedadId: item.id
                        });
                    }
                } catch (notifyError) {
                    console.error('[email-notifications] Error publicando evento form_status_changed', {
                        eventId: statusPayload.eventId,
                        novedadId: item.id,
                        message: notifyError?.message || String(notifyError)
                    });
                }
            }

            return res.json({
                ok: true,
                success: true,
                persistedEmail: estado === 'Aprobado' || estado === 'Rechazado' ? actorEmail || null : null,
                fromHoraExtraAlert
            });
        } catch (error) {
            console.error('Error al actualizar estado:', error);
            return res.status(500).json({ ok: false, error: 'Error al actualizar' });
        }
    });

    app.get('/api/debug/whoami', verificarToken, allowPanel('admin'), async (req, res) => {
        if (isDeployedEnv) {
            return res.status(404).json({ ok: false, error: 'No encontrado' });
        }
        return res.json({ ok: true, me: req.user });
    });

    app.use((err, req, res, next) => {
        const requestId = String(req.headers['x-request-id'] || randomUUID());
        if (err && (err.code === 'LIMIT_FILE_SIZE' || /Tipo de archivo no permitido/i.test(err.message))) {
            const message = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera 5MB.' : 'Tipo de archivo no permitido. Solo PDF, JPG, PNG, XLS o XLSX.';
            return res.status(400).json({ ok: false, error: message });
        }
        if (err) {
            logger.error({
                requestId,
                path: req.path,
                method: req.method,
                actor: req.user?.email || req.user?.sub || null,
                message: err?.message || String(err),
                stack: err?.stack
            }, 'Error no controlado');
            const publicMessage = (!isDeployedEnv && exposeInternalErrors && err?.message)
                ? String(err.message)
                : 'Error interno del servidor';
            return res.status(500).json({ ok: false, error: publicMessage, requestId });
        }
        return next();
    });
}

module.exports = { registerRoutes };
