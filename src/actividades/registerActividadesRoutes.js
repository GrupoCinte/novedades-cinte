const { formatDateBogota, formatScheduleBogota } = require('../utils/formatDateTimeBogota');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function buildEntryDataForEmail(activity) {
    if (!activity) return null;
    return {
        date: formatDateBogota(activity.fecha || activity.inicio),
        description: activity.descripcion,
        client: activity.cliente,
        schedule: formatScheduleBogota(activity.inicio, activity.fin)
    };
}

function parseBogotaDateTime(dateValue, timeValue) {
    const date = String(dateValue || '').trim();
    const time = String(timeValue || '').trim();
    if (!DATE_PATTERN.test(date) || !TIME_PATTERN.test(time)) return null;

    const [year, month, day] = date.split('-').map(Number);
    const calendarDate = new Date(Date.UTC(year, month - 1, day));
    if (
        calendarDate.getUTCFullYear() !== year ||
        calendarDate.getUTCMonth() !== month - 1 ||
        calendarDate.getUTCDate() !== day
    ) {
        return null;
    }

    const candidate = new Date(`${date}T${time}:00-05:00`);
    if (Number.isNaN(candidate.getTime())) return null;
    return candidate;
}

function getTimeInMinutes(value) {
    const [hours, minutes] = String(value).split(':').map(Number);
    return hours * 60 + minutes;
}

function validateActividadPayload(req) {
    const body = req.body || {};
    const descripcion = String(body.descripcion || '').trim();
    const fecha = String(body.fecha || '').trim();
    const horaInicio = String(body.horaInicio || '').trim();
    const horaFin = String(body.horaFin || '').trim();

    if (!descripcion) {
        return { error: 'La descripción es obligatoria.', status: 400 };
    }
    if (descripcion.length > 2000) {
        return { error: 'La descripción no puede superar 2000 caracteres.', status: 400 };
    }
    if (!DATE_PATTERN.test(fecha) || !parseBogotaDateTime(fecha, '00:00')) {
        return { error: 'La fecha debe ser válida.', status: 400 };
    }
    
    const year = Number(fecha.split('-')[0]);
    const currentYear = new Date().getFullYear();
    if (year < currentYear) {
        return { error: `Solo se permite registrar actividades del año en curso (${currentYear}) en adelante.`, status: 400 };
    }
    if (!TIME_PATTERN.test(horaInicio)) {
        return { error: 'La hora de inicio debe ser válida.', status: 400 };
    }
    if (!TIME_PATTERN.test(horaFin)) {
        return { error: 'La hora de fin debe ser válida.', status: 400 };
    }
    if (getTimeInMinutes(horaFin) <= getTimeInMinutes(horaInicio)) {
        return { error: 'La hora de fin debe ser mayor que la hora de inicio.', status: 400 };
    }

    const inicio = parseBogotaDateTime(fecha, horaInicio);
    const fin = parseBogotaDateTime(fecha, horaFin);
    if (!inicio || !fin || fin <= inicio) {
        return { error: 'El rango de horas no es válido.', status: 400 };
    }

    return { ok: true, data: { descripcion, inicio, fin } };
}

function getCedulaOrError(req, res) {
    const cedula = String(req.user?.cedula || '').trim();
    if (!cedula) {
        res.status(403).json({ ok: false, error: 'Sesión de consultor sin cédula asociada.' });
        return null;
    }
    return cedula;
}

/**
 * Publica eventos de confirmación para consultor y administradores.
 * Fallos de publish no deben tumbar la respuesta HTTP de la mutación.
 */
async function publishActivityEvents({
    emailPublisher: publisher,
    activity,
    consultant,
    action,
    previousData = null,
    resolveAdminNotifyTo = null
}) {
    if (!activity?.id || !publisher) return;
    const { randomUUID } = require('crypto');
    const entryData = buildEntryDataForEmail(activity);
    if (!entryData?.date || !entryData?.schedule) {
        console.warn('[Publisher] Actividad sin fecha/horario formateable; se omite correo.', {
            entryId: activity.id
        });
        return;
    }

    const basePayload = {
        eventId: randomUUID(),
        entryId: activity.id,
        consultant: {
            name: consultant.nombre || consultant.name || 'Consultor',
            email: consultant.email
        },
        action,
        entryData,
        meta: {
            source: 'backend',
            env: process.env.NODE_ENV || 'development'
        }
    };

    try {
        await publisher.publishTimeEntryConfirmation({
            ...basePayload,
            eventType: 'time_entry_confirmation'
        });
    } catch (publishError) {
        console.error(`[Publisher] Error publicando evento ${action} para consultor:`, publishError);
    }

    try {
        if (typeof publisher.publishTimeEntryAdminNotification === 'function') {
            // validateTimeEntryConfirmationPayload exige eventType confirmation;
            // publishTimeEntryAdminNotification lo reescribe a time_entry_admin_notification.
            const adminPayload = {
                ...basePayload,
                eventType: 'time_entry_confirmation'
            };
            if (previousData) {
                adminPayload.previousData = buildEntryDataForEmail(previousData);
            }

            let notifyTo = [];
            if (typeof resolveAdminNotifyTo === 'function') {
                try {
                    notifyTo = await resolveAdminNotifyTo({
                        cliente: activity.cliente,
                        action
                    });
                } catch (resolveError) {
                    console.error('[Publisher] Error resolviendo destinatarios admin de actividad:', resolveError);
                }
            }
            if (!Array.isArray(notifyTo)) notifyTo = [];
            adminPayload.admin = { notifyTo };

            if (notifyTo.length === 0) {
                console.warn('[Publisher] time_entry_admin_notification sin destinatarios; se omite invoke admin.', {
                    entryId: activity.id,
                    cliente: activity.cliente
                });
            } else {
                await publisher.publishTimeEntryAdminNotification(adminPayload);
            }
        }
    } catch (publishError) {
        console.error(`[Publisher] Error publicando evento ${action} para admin:`, publishError);
    }
}

function registerActividadesRoutes({
    app,
    verificarToken,
    requireEntraConsultor,
    actividadesStore,
    emailNotificationsPublisher = null,
    listEmailsInGroups = null,
    listGpEmailsForCliente = null
}) {
    if (!app || typeof app.get !== 'function' || typeof app.post !== 'function') {
        throw new TypeError('registerActividadesRoutes: app es obligatorio.');
    }
    if (typeof verificarToken !== 'function') {
        throw new TypeError('registerActividadesRoutes: verificarToken es obligatorio.');
    }
    if (typeof requireEntraConsultor !== 'function') {
        throw new TypeError('registerActividadesRoutes: requireEntraConsultor es obligatorio.');
    }
    if (!actividadesStore || typeof actividadesStore.getConsultorContextByCedula !== 'function' || typeof actividadesStore.createManualActivity !== 'function') {
        throw new TypeError('registerActividadesRoutes: actividadesStore es obligatorio.');
    }

    const emailPublisher = emailNotificationsPublisher;
    const consultorAuth = [verificarToken, requireEntraConsultor];

    async function resolveAdminNotifyTo({ cliente } = {}) {
        const emails = new Set();
        if (typeof listEmailsInGroups === 'function') {
            const fromGroups = await listEmailsInGroups(['super_admin', 'cac']);
            for (const email of fromGroups?.emails || []) {
                const e = String(email || '').trim().toLowerCase();
                if (e.includes('@')) emails.add(e);
            }
        }
        const clienteNorm = String(cliente || '').trim();
        if (clienteNorm && typeof listGpEmailsForCliente === 'function') {
            const gpEmails = await listGpEmailsForCliente(clienteNorm);
            for (const email of gpEmails || []) {
                const e = String(email || '').trim().toLowerCase();
                if (e.includes('@')) emails.add(e);
            }
        }
        return Array.from(emails);
    }

    app.get('/api/consultor/actividades/context', ...consultorAuth, async (req, res) => {
        try {
            const cedula = getCedulaOrError(req, res);
            if (!cedula) return;

            const context = await actividadesStore.getConsultorContextByCedula(cedula);
            if (!context) {
                return res.status(404).json({ ok: false, error: 'No se encontró tu ficha activa de colaborador.' });
            }

            return res.json({
                ok: true,
                cliente: String(context.cliente || '').trim() || null
            });
        } catch (error) {
            console.error('consultor actividades context:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo consultar el contexto del consultor.' });
        }
    });

    app.get('/api/consultor/actividades', ...consultorAuth, async (req, res) => {
        try {
            const cedula = getCedulaOrError(req, res);
            if (!cedula) return;

            const actividades = typeof actividadesStore.listActividadesByCedula === 'function'
                ? await actividadesStore.listActividadesByCedula(cedula)
                : [];
            return res.json({ ok: true, actividades });
        } catch (error) {
            console.error('consultor actividades list:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo consultar el historial de actividades.' });
        }
    });

    app.post('/api/consultor/actividades', ...consultorAuth, async (req, res) => {
        try {
            const payloadResult = validateActividadPayload(req);
            if (!payloadResult.ok) {
                return res.status(payloadResult.status).json({ ok: false, error: payloadResult.error });
            }
            const { descripcion, inicio, fin } = payloadResult.data;

            const cedula = getCedulaOrError(req, res);
            if (!cedula) return;

            const result = await actividadesStore.createManualActivity({
                cedula,
                descripcion,
                inicio: inicio.toISOString(),
                fin: fin.toISOString()
            });
            if (result.kind === 'consultor_not_found') {
                return res.status(404).json({ ok: false, error: 'No se encontró tu ficha activa de colaborador.' });
            }
            if (result.kind === 'client_not_assigned') {
                return res.status(400).json({ ok: false, error: 'Debes tener un cliente asignado en tu ficha para registrar una actividad.' });
            }
            if (result.kind === 'duplicate') {
                return res.status(409).json({ ok: false, error: 'Ya existe una actividad con la misma información (fecha, hora y descripción).' });
            }

            await publishActivityEvents({
                emailPublisher,
                activity: result.activity,
                consultant: req.user,
                action: 'created',
                resolveAdminNotifyTo
            });

            return res.status(201).json({ ok: true, actividad: result.activity });
        } catch (error) {
            console.error('consultor actividades create:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo crear la entrada de tiempo.' });
        }
    });

    app.put('/api/consultor/actividades/:id', ...consultorAuth, async (req, res) => {
        try {
            const id = String(req.params.id || '').trim();
            if (!id) {
                return res.status(400).json({ ok: false, error: 'El ID de la actividad es obligatorio.' });
            }

            const payloadResult = validateActividadPayload(req);
            if (!payloadResult.ok) {
                return res.status(payloadResult.status).json({ ok: false, error: payloadResult.error });
            }
            const { descripcion, inicio, fin } = payloadResult.data;

            const cedula = getCedulaOrError(req, res);
            if (!cedula) return;

            const actividadAnterior = typeof actividadesStore.getActividadPropia === 'function'
                ? await actividadesStore.getActividadPropia({ id, cedula })
                : null;

            const result = await actividadesStore.updateActividadPropia({
                id,
                cedula,
                descripcion,
                inicio: inicio.toISOString(),
                fin: fin.toISOString()
            });

            if (result.kind === 'not_found') {
                return res.status(404).json({ ok: false, error: 'No se encontró la actividad o no tienes permisos para editarla.' });
            }
            if (result.kind === 'duplicate') {
                return res.status(409).json({ ok: false, error: 'Ya existe una actividad con la misma información (fecha, hora y descripción).' });
            }

            await publishActivityEvents({
                emailPublisher,
                activity: result.activity,
                consultant: req.user,
                action: 'updated',
                previousData: actividadAnterior,
                resolveAdminNotifyTo
            });

            return res.json({ ok: true, actividad: result.activity });
        } catch (error) {
            console.error('consultor actividades update:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo actualizar la actividad.' });
        }
    });

    app.delete('/api/consultor/actividades/:id', ...consultorAuth, async (req, res) => {
        try {
            const id = String(req.params.id || '').trim();
            if (!id) {
                return res.status(400).json({ ok: false, error: 'El ID de la actividad es obligatorio.' });
            }

            const cedula = getCedulaOrError(req, res);
            if (!cedula) return;

            const result = await actividadesStore.deleteActividadPropia({ id, cedula });
            if (result.kind === 'not_found') {
                return res.status(404).json({ ok: false, error: 'No se encontró la actividad o no tienes permisos para eliminarla.' });
            }

            await publishActivityEvents({
                emailPublisher,
                activity: result.activity,
                consultant: req.user,
                action: 'deleted',
                resolveAdminNotifyTo
            });

            return res.json({ ok: true, mensaje: 'Actividad eliminada exitosamente.' });
        } catch (error) {
            console.error('consultor actividades delete:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo eliminar la actividad.' });
        }
    });

    app.get('/api/consultor/actividades/cronometro/activo', ...consultorAuth, async (req, res) => {
        try {
            const cedula = getCedulaOrError(req, res);
            if (!cedula) return;

            const activo = typeof actividadesStore.getCronometroActivoByCedula === 'function'
                ? await actividadesStore.getCronometroActivoByCedula(cedula)
                : null;

            return res.json({ ok: true, activo });
        } catch (error) {
            console.error('consultor actividades cronometro activo:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo consultar el estado del cronómetro.' });
        }
    });

    app.post('/api/consultor/actividades/cronometro/iniciar', ...consultorAuth, async (req, res) => {
        try {
            const cedula = getCedulaOrError(req, res);
            if (!cedula) return;

            const body = req.body || {};
            const descripcion = String(body.descripcion || '').trim();
            if (!descripcion) {
                return res.status(400).json({ ok: false, error: 'La descripción es obligatoria para iniciar el cronómetro.' });
            }
            if (descripcion.length > 2000) {
                return res.status(400).json({ ok: false, error: 'La descripción no puede superar los 2000 caracteres.' });
            }

            const result = await actividadesStore.iniciarCronometro({ cedula, descripcion });
            if (result.kind === 'consultor_not_found') {
                return res.status(404).json({ ok: false, error: 'No se encontró tu ficha activa de colaborador.' });
            }
            if (result.kind === 'client_not_assigned') {
                return res.status(400).json({ ok: false, error: 'Debes tener un cliente asignado en tu ficha para iniciar el cronómetro.' });
            }
            if (result.kind === 'already_active') {
                return res.status(409).json({ ok: false, error: 'Ya tienes un cronómetro en curso. Debes detenerlo o cancelarlo antes de iniciar otro.' });
            }

            return res.status(201).json({ ok: true, actividad: result.activity });
        } catch (error) {
            console.error('consultor actividades cronometro iniciar:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo iniciar el cronómetro.' });
        }
    });

    app.post('/api/consultor/actividades/cronometro/detener', ...consultorAuth, async (req, res) => {
        try {
            const cedula = getCedulaOrError(req, res);
            if (!cedula) return;

            const result = await actividadesStore.detenerCronometro({ cedula });
            if (result.kind === 'no_active_timer') {
                return res.status(400).json({ ok: false, error: 'No tienes ningún cronómetro en curso para detener.' });
            }

            await publishActivityEvents({
                emailPublisher,
                activity: result.activity,
                consultant: req.user,
                action: 'created',
                resolveAdminNotifyTo
            });

            return res.json({ ok: true, actividad: result.activity });
        } catch (error) {
            console.error('consultor actividades cronometro detener:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo detener el cronómetro.' });
        }
    });

    app.post('/api/consultor/actividades/cronometro/cancelar', ...consultorAuth, async (req, res) => {
        try {
            const cedula = getCedulaOrError(req, res);
            if (!cedula) return;

            const result = await actividadesStore.cancelarCronometro({ cedula });
            if (result.kind === 'no_active_timer') {
                return res.status(400).json({ ok: false, error: 'No tienes ningún cronómetro en curso para cancelar.' });
            }

            return res.json({ ok: true, mensaje: 'Cronómetro cancelado exitosamente.' });
        } catch (error) {
            console.error('consultor actividades cronometro cancelar:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo cancelar el cronómetro.' });
        }
    });
}

module.exports = { registerActividadesRoutes, parseBogotaDateTime };    