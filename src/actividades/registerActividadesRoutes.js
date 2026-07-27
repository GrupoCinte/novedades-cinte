const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

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

function registerActividadesRoutes({
    app,
    verificarToken,
    requireEntraConsultor,
    actividadesStore
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

    const consultorAuth = [verificarToken, requireEntraConsultor];

    app.get('/api/consultor/actividades/context', ...consultorAuth, async (req, res) => {
        try {
            const cedula = String(req.user?.cedula || '').trim();
            if (!cedula) {
                return res.status(403).json({ ok: false, error: 'Sesión de consultor sin cédula asociada.' });
            }

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
            const cedula = String(req.user?.cedula || '').trim();
            if (!cedula) {
                return res.status(403).json({ ok: false, error: 'Sesión de consultor sin cédula asociada.' });
            }

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
            const body = req.body || {};
            const descripcion = String(body.descripcion || '').trim();
            const fecha = String(body.fecha || '').trim();
            const horaInicio = String(body.horaInicio || '').trim();
            const horaFin = String(body.horaFin || '').trim();

            if (!descripcion) {
                return res.status(400).json({ ok: false, error: 'La descripción es obligatoria.' });
            }
            if (descripcion.length > 2000) {
                return res.status(400).json({ ok: false, error: 'La descripción no puede superar 2000 caracteres.' });
            }
            if (!DATE_PATTERN.test(fecha) || !parseBogotaDateTime(fecha, '00:00')) {
                return res.status(400).json({ ok: false, error: 'La fecha debe ser válida.' });
            }
            if (!TIME_PATTERN.test(horaInicio)) {
                return res.status(400).json({ ok: false, error: 'La hora de inicio debe ser válida.' });
            }
            if (!TIME_PATTERN.test(horaFin)) {
                return res.status(400).json({ ok: false, error: 'La hora de fin debe ser válida.' });
            }
            if (getTimeInMinutes(horaFin) <= getTimeInMinutes(horaInicio)) {
                return res.status(400).json({ ok: false, error: 'La hora de fin debe ser mayor que la hora de inicio.' });
            }

            const inicio = parseBogotaDateTime(fecha, horaInicio);
            const fin = parseBogotaDateTime(fecha, horaFin);
            if (!inicio || !fin || fin <= inicio) {
                return res.status(400).json({ ok: false, error: 'El rango de horas no es válido.' });
            }

            const cedula = String(req.user?.cedula || '').trim();
            if (!cedula) {
                return res.status(403).json({ ok: false, error: 'Sesión de consultor sin cédula asociada.' });
            }

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

            return res.status(201).json({ ok: true, actividad: result.activity });
        } catch (error) {
            console.error('consultor actividades create:', error);
            return res.status(500).json({ ok: false, error: 'No se pudo crear la entrada de tiempo.' });
        }
    });
}

module.exports = { registerActividadesRoutes, parseBogotaDateTime };
