function registerRoutes(deps) {
    const {
        app,
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
        xlsx
    } = deps;

    const HORA_DIURNA_INICIO_MIN = 6 * 60;
    const HORA_NOCTURNA_INICIO_MIN = 19 * 60;

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

    function toUtcMs(dateRaw, timeRaw) {
        if (!dateRaw || !timeRaw) return null;
        const normalizedTime = String(timeRaw).slice(0, 8);
        const dateMs = Date.parse(`${dateRaw}T${normalizedTime}Z`);
        return Number.isNaN(dateMs) ? null : dateMs;
    }

    function calculateHourSplit(dateStartRaw, timeStartRaw, dateEndRaw, timeEndRaw) {
        const startMs = toUtcMs(dateStartRaw, timeStartRaw);
        const endMs = toUtcMs(dateEndRaw, timeEndRaw);
        if (startMs === null || endMs === null || endMs <= startMs) {
            return { total: 0, diurnas: 0, nocturnas: 0 };
        }

        let diurnasMin = 0;
        let nocturnasMin = 0;
        const minuteMs = 60 * 1000;
        for (let tick = startMs; tick < endMs; tick += minuteMs) {
            const current = new Date(tick);
            const minuteOfDay = (current.getUTCHours() * 60) + current.getUTCMinutes();
            if (minuteOfDay >= HORA_DIURNA_INICIO_MIN && minuteOfDay < HORA_NOCTURNA_INICIO_MIN) {
                diurnasMin += 1;
            } else {
                nocturnasMin += 1;
            }
        }

        const diurnas = Number((diurnasMin / 60).toFixed(2));
        const nocturnas = Number((nocturnasMin / 60).toFixed(2));
        return {
            total: Number(((diurnasMin + nocturnasMin) / 60).toFixed(2)),
            diurnas,
            nocturnas
        };
    }

    function resolveHoraExtraLabel(diurnas, nocturnas) {
        if (diurnas > 0 && nocturnas > 0) return 'Mixta';
        if (diurnas > 0) return 'Diurna';
        if (nocturnas > 0) return 'Nocturna';
        return null;
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
                return res.status(503).json({ ok: false, message: 'Autenticación disponible solo vía Cognito.' });
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
            const appAuth = issueAppTokenFromCognito(baseUser, auth, effectiveRole);
            return res.json({
                ok: true,
                token: appAuth.token,
                expiresIn: appAuth.expiresInSec,
                user: appAuth.user,
                claims: {
                    ...claims,
                    role: appAuth.user.role,
                    baseRole: baseUser.role
                }
            });
        } catch (error) {
            console.error('Error login:', error);
            const status = Number(error?.status) || 500;
            if (status >= 400 && status < 500) {
                return res.status(status).json({ ok: false, message: error.message || 'Error de autenticacion Cognito' });
            }
            return res.status(500).json({ ok: false, message: 'Error interno' });
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
                return res.status(400).json({ ok: false, message: 'La contrasena debe tener 8+ caracteres, mayuscula, minuscula, numero y simbolo.' });
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
            const appAuth = issueAppTokenFromCognito(baseUser, auth, effectiveRole);
            return res.json({
                ok: true,
                token: appAuth.token,
                expiresIn: appAuth.expiresInSec,
                user: appAuth.user,
                claims: {
                    ...claims,
                    role: appAuth.user.role,
                    baseRole: baseUser.role
                }
            });
        } catch (error) {
            console.error('Error complete-new-password:', error);
            const status = Number(error?.status) || 500;
            if (COGNITO_ENABLED && status >= 400 && status < 500) {
                return res.status(status).json({ ok: false, message: error.message || 'Error completando reto de contraseña' });
            }
            return res.status(500).json({ ok: false, message: 'Error interno' });
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
                return res.status(400).json({ ok: false, message: 'La contrasena debe tener 8+ caracteres, mayuscula, minuscula, numero y simbolo.' });
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
                return res.status(400).json({ ok: false, message: 'La contrasena debe tener 8+ caracteres, mayuscula, minuscula, numero y simbolo.' });
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
            const correo = String(req.query.correo || '').trim();
            const cliente = String(req.query.cliente || '').trim();
            const sortBy = String(req.query.sortBy || '').trim();
            const sortDir = String(req.query.sortDir || '').trim();
            const rows = await getScopedNovedades(req.scope, { tipo, estado, correo, cliente, sortBy, sortDir });
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

    app.get('/api/novedades/export-csv', verificarToken, allowAnyPanel(['dashboard', 'calendar', 'gestion']), applyScope, async (req, res) => {
        try {
            const tipo = String(req.query.tipo || '').trim();
            const estado = String(req.query.estado || '').trim();
            const correo = String(req.query.correo || '').trim();
            const cliente = String(req.query.cliente || '').trim();
            const sortBy = String(req.query.sortBy || '').trim();
            const sortDir = String(req.query.sortDir || '').trim();
            const rows = await getScopedNovedades(req.scope, { tipo, estado, correo, cliente, sortBy, sortDir });
            const items = rows.map(toClientNovedad);
            const headers = ['Fecha Creación', 'Nombre', 'Cédula', 'Correo', 'Cliente', 'Tipo Novedad', 'Fecha Inicio', 'Fecha Fin', 'Horas', 'Horas Diurnas', 'Horas Nocturnas', 'Turno', 'Estado'];
            const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
            const csvRows = items.map((it) => [
                new Date(it.creadoEn).toLocaleString('es-ES'),
                it.nombre,
                it.cedula,
                it.correoSolicitante || '',
                it.cliente || '',
                it.tipoNovedad,
                it.fechaInicio || '',
                it.fechaFin || '',
                it.cantidadHoras || '0',
                it.horasDiurnas || '0',
                it.horasNocturnas || '0',
                it.tipoHoraExtra || 'N/A',
                it.estado
            ]);
            const csvContent = [headers.map(csvEscape).join(','), ...csvRows.map((row) => row.map(csvEscape).join(','))].join('\n');
            const filename = `novedades_reporte_${new Date().toISOString().slice(0, 10)}.csv`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            return res.status(200).send(`\uFEFF${csvContent}`);
        } catch (error) {
            console.error('Error exportando novedades CSV:', error);
            return res.status(500).json({ ok: false, error: 'Error exportando reporte CSV' });
        }
    });

    app.get('/api/catalogos/clientes', catalogLimiter, async (req, res) => {
        try {
            const items = await getClientesList();
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
            const items = await getLideresByCliente(cliente);
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
            return res.json({ ok: true, cedula: row.cedula, nombre: row.nombre });
        } catch (error) {
            console.error('Error catalogo colaborador:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo consultar el colaborador' });
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
                if (!mimeOk || !extOk) {
                    return res.status(400).json({ ok: false, error: 'Tipo de archivo no permitido. Solo PDF, JPG, PNG, XLS o XLSX.' });
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
            const cliente = normalizeCatalogValue(body.cliente || '');
            const lider = normalizeCatalogValue(body.lider || '');
            if (!cliente || !lider) {
                return res.status(400).json({ ok: false, error: 'Cliente y lider son obligatorios.' });
            }
            const pair = await pool.query(
                `SELECT 1
                 FROM clientes_lideres
                 WHERE activo = TRUE AND cliente = $1 AND lider = $2
                 LIMIT 1`,
                [cliente, lider]
            );
            if (!pair.rows[0]) {
                return res.status(400).json({ ok: false, error: 'El lider no pertenece al cliente seleccionado.' });
            }

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

            const fecha = parseDateOrNull(body.fecha);
            const horaInicio = parseTimeOrNull(body.horaInicio);
            const horaFin = parseTimeOrNull(body.horaFin);
            const fechaInicio = parseDateOrNull(body.fechaInicio) || fecha;
            const fechaFin = parseDateOrNull(body.fechaFin);
            const novedadTypeKey = rule?.key || '';
            const todayUtc = new Date().toISOString().slice(0, 10);

            if (!fechaInicio) {
                return res.status(400).json({ ok: false, error: 'Fecha Inicio es obligatoria.' });
            }
            if (fechaFin && fechaFin < fechaInicio) {
                return res.status(400).json({ ok: false, error: 'Fecha Fin no puede ser menor a Fecha Inicio.' });
            }
            if (novedadTypeKey === 'incapacidad' && fechaInicio > todayUtc) {
                return res.status(400).json({ ok: false, error: 'Incapacidad no puede tener Fecha Inicio futura.' });
            }

            let cantidadHoras = Number(body.cantidadHoras || 0) || 0;
            let horasDiurnas = Number(body.horasDiurnas || 0) || 0;
            let horasNocturnas = Number(body.horasNocturnas || 0) || 0;
            let tipoHoraExtra = String(body.tipoHoraExtra || '').trim() || null;

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
                if (!fechaFin) {
                    return res.status(400).json({ ok: false, error: 'Vacaciones en dinero requiere Fecha Fin.' });
                }
                cantidadHoras = 0;
            }

            if (novedadTypeKey === 'hora_extra') {
                if (!horaInicio || !horaFin || !fechaInicio || !fechaFin) {
                    return res.status(400).json({ ok: false, error: 'Hora Extra requiere Fecha Inicio/Fin y Hora Inicio/Fin.' });
                }
                const split = calculateHourSplit(fechaInicio, horaInicio, fechaFin, horaFin);
                if (split.total <= 0) {
                    return res.status(400).json({ ok: false, error: 'La fecha/hora fin debe ser mayor a la fecha/hora inicio.' });
                }
                cantidadHoras = split.total;
                horasDiurnas = split.diurnas;
                horasNocturnas = split.nocturnas;
                tipoHoraExtra = resolveHoraExtraLabel(horasDiurnas, horasNocturnas);
            }

            await pool.query(
                `INSERT INTO novedades (
                    nombre, cedula, correo_solicitante, cliente, lider, tipo_novedad, area,
                    fecha, hora_inicio, hora_fin, fecha_inicio, fecha_fin,
                    cantidad_horas, horas_diurnas, horas_nocturnas, tipo_hora_extra, soporte_ruta, estado
                )
                VALUES (
                    $1, $2, $3, $4, $5, $6, $7::user_area,
                    $8::date, $9::time, $10::time, $11::date, $12::date,
                    $13, $14, $15, $16, $17, 'Pendiente'::novedad_estado
                )`,
                [
                    nombreColaborador,
                    cedulaNorm,
                    String(body.correoSolicitante || '').trim() || null,
                    cliente,
                    lider,
                    tipoNovedad,
                    area,
                    fecha,
                    horaInicio,
                    horaFin,
                    fechaInicio,
                    fechaFin,
                    cantidadHoras,
                    horasDiurnas,
                    horasNocturnas,
                    tipoHoraExtra,
                    archivoRuta
                ]
            );
            return res.json({ ok: true, success: true });
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
                    `SELECT id, area, tipo_novedad, estado
                     FROM novedades
                     WHERE id = $1::uuid
                     LIMIT 1`,
                    [id]
                );
            } else {
                q = await pool.query(
                    `SELECT id, area, tipo_novedad, estado
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

            await pool.query(
                `UPDATE novedades
                 SET estado = $1::novedad_estado,
                     aprobado_en = CASE WHEN $1::novedad_estado = 'Aprobado' THEN NOW() ELSE NULL END,
                     aprobado_por_rol = CASE WHEN $1::novedad_estado = 'Aprobado' THEN $2::user_role ELSE NULL END,
                     aprobado_por_user_id = CASE WHEN $1::novedad_estado = 'Aprobado' THEN $3::uuid ELSE NULL END,
                     rechazado_en = CASE WHEN $1::novedad_estado = 'Rechazado' THEN NOW() ELSE NULL END,
                     rechazado_por_rol = CASE WHEN $1::novedad_estado = 'Rechazado' THEN $2::user_role ELSE NULL END,
                     rechazado_por_user_id = CASE WHEN $1::novedad_estado = 'Rechazado' THEN $3::uuid ELSE NULL END
                 WHERE id = $4::uuid`,
                [estado, req.user.role, actorUserId, item.id]
            );

            await pool.query(
                `INSERT INTO novedad_status_history (novedad_id, estado_anterior, estado_nuevo, changed_by_user_id, changed_by_role)
                 VALUES ($1::uuid, $2::novedad_estado, $3::novedad_estado, $4::uuid, $5::user_role)`,
                [item.id, normalizeEstado(item.estado), estado, actorUserId, req.user.role]
            );

            return res.json({ ok: true, success: true });
        } catch (error) {
            console.error('Error al actualizar estado:', error);
            return res.status(500).json({ ok: false, error: 'Error al actualizar' });
        }
    });

    app.get('/api/debug/whoami', verificarToken, allowPanel('admin'), async (req, res) => {
        try {
            const users = await pool.query('SELECT email, username, role, area FROM users ORDER BY username ASC');
            return res.json({
                ok: true,
                frontendUrl: FRONTEND_URL,
                users: users.rows.map((u) => ({
                    email: u.email,
                    username: u.username,
                    role: u.role,
                    area: u.area,
                    panels: POLICY[u.role]?.panels || []
                }))
            });
        } catch (error) {
            console.error('Error debug/whoami:', error);
            return res.status(500).json({ ok: false, error: 'Error interno' });
        }
    });

    app.use((err, req, res, next) => {
        if (err && (err.code === 'LIMIT_FILE_SIZE' || /Tipo de archivo no permitido/i.test(err.message))) {
            const message = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera 5MB.' : 'Tipo de archivo no permitido. Solo PDF, JPG, PNG, XLS o XLSX.';
            return res.status(400).json({ ok: false, error: message });
        }
        if (err) {
            console.error('Error no controlado:', err);
            return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
        }
        return next();
    });
}

module.exports = { registerRoutes };
