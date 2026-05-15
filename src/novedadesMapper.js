const { getNovedadRuleByType } = require('./rbac');

const ETIQUETA_ROL_GESTION = {
    super_admin: 'Super Admin',
    cac: 'CAC (Capital Humano)',
    admin_ch: 'Admin Capital Humano',
    team_ch: 'Equipo Capital Humano',
    gp: 'Gestión de proyectos',
    nomina: 'Nómina',
    comercial: 'Comercial'
};

function buildAsignacionGestionPorTipo(tipoNovedadTexto) {
    const rule = getNovedadRuleByType(tipoNovedadTexto);
    const approvers = Array.isArray(rule?.approvers) ? rule.approvers : [];
    const seen = new Set();
    const labels = [];
    for (const r of approvers) {
        if (seen.has(r)) continue;
        seen.add(r);
        labels.push(ETIQUETA_ROL_GESTION[r] || String(r).replace(/_/g, ' '));
    }
    return {
        asignacionRolesEtiqueta: labels.length ? labels.join(' · ') : '—'
    };
}

/** Solo expone texto como correo si parece email (evita mostrar roles/ét. en aprobado_por_correo). */
function pickEmailLikeOnly(raw) {
    const s = String(raw || '').trim();
    if (!s || !s.includes('@')) return '';
    return s;
}

function normalizeTipoRaw(value) {
    return String(value || '')
        .replace(/\u00A0/g, ' ')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim();
}

/** Fecha DATE/TIMESTAMP de PostgreSQL → YYYY-MM-DD (calendario Bogotá si viene como Date). */
function pgDateToYmd(value) {
    if (value == null || value === '') return '';
    const s = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        try {
            return value.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
        } catch {
            const y = value.getUTCFullYear();
            const m = String(value.getUTCMonth() + 1).padStart(2, '0');
            const d = String(value.getUTCDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
    }
    return '';
}

function decodePossiblyMisencodedText(value) {
    const raw = String(value || '');
    if (!raw) return '';
    // Recover common mojibake produced by UTF-8 bytes interpreted as latin1.
    if (/[ÃÂ]/.test(raw)) {
        try {
            return Buffer.from(raw, 'latin1').toString('utf8');
        } catch {
            return raw;
        }
    }
    return raw;
}

function toClientNovedad(row) {
    const soporteStored = String(row.soporte_ruta || '');
    let soportes = [];
    if (soporteStored) {
        if (soporteStored.startsWith('[')) {
            try {
                const parsed = JSON.parse(soporteStored);
                if (Array.isArray(parsed)) {
                    soportes = parsed.filter(Boolean).map((v) => String(v));
                }
            } catch {
                soportes = [soporteStored];
            }
        } else {
            soportes = [soporteStored];
        }
    }
    const soportePrincipal = soportes[0] || '';
    const isLocalSupport = soportePrincipal.startsWith('/assets/');
    const tipoRaw = normalizeTipoRaw(row.tipo_novedad);
    const tipoNovedad = decodePossiblyMisencodedText(tipoRaw || row.tipo_novedad);
    let asignacion = buildAsignacionGestionPorTipo(tipoNovedad);
    if (asignacion.asignacionRolesEtiqueta === '—' && tipoRaw) {
        asignacion = buildAsignacionGestionPorTipo(tipoRaw);
    }
    return {
        id: row.id,
        nombre: decodePossiblyMisencodedText(row.nombre),
        cedula: row.cedula,
        correoSolicitante: decodePossiblyMisencodedText(row.correo_solicitante || ''),
        cliente: decodePossiblyMisencodedText(row.cliente || ''),
        lider: decodePossiblyMisencodedText(row.lider || ''),
        gpUserId: row.gp_user_id ? String(row.gp_user_id) : null,
        tipoNovedad,
        area: row.area,
        fecha: pgDateToYmd(row.fecha),
        horaInicio: row.hora_inicio ? String(row.hora_inicio).slice(0, 5) : '',
        horaFin: row.hora_fin ? String(row.hora_fin).slice(0, 5) : '',
        fechaInicio: pgDateToYmd(row.fecha_inicio),
        fechaFin: pgDateToYmd(row.fecha_fin),
        cantidadHoras: Number(row.cantidad_horas || 0),
        horasDiurnas: Number(row.horas_diurnas || 0),
        horasNocturnas: Number(row.horas_nocturnas || 0),
        horasRecargoDomingo: Number(row.horas_recargo_domingo || 0),
        horasRecargoDomingoDiurnas: Number(row.horas_recargo_domingo_diurnas || 0),
        horasRecargoDomingoNocturnas: Number(row.horas_recargo_domingo_nocturnas || 0),
        tipoHoraExtra: row.tipo_hora_extra || '',
        montoCop: row.monto_cop != null && row.monto_cop !== '' ? Number(row.monto_cop) : null,
        soporteRuta: isLocalSupport ? soportePrincipal : '',
        soporteKey: isLocalSupport ? '' : soportePrincipal,
        soportes: soportes,
        estado: row.estado,
        creadoEn: row.creado_en ? row.creado_en.toISOString() : '',
        aprobadoEn: row.aprobado_en ? row.aprobado_en.toISOString() : '',
        aprobadoPorRol: row.aprobado_por_rol || '',
        aprobadoPorCorreo: pickEmailLikeOnly(row.aprobado_por_correo),
        rechazadoEn: row.rechazado_en ? row.rechazado_en.toISOString() : '',
        rechazadoPorRol: row.rechazado_por_rol || '',
        rechazadoPorCorreo: pickEmailLikeOnly(row.rechazado_por_correo),
        alertaHeOrigen: Boolean(row.alerta_he_origen),
        alertaHeResueltaEstado: String(row.alerta_he_resuelta_estado || '').trim(),
        alertaHeResueltaEn: row.alerta_he_resuelta_en ? row.alerta_he_resuelta_en.toISOString() : '',
        alertaHeResueltaPorCorreo: pickEmailLikeOnly(row.alerta_he_resuelta_por_email),
        heDomingoObservacion: decodePossiblyMisencodedText(String(row.he_domingo_observacion || '').trim()),
        nominaInfoCorrecta:
            row.nomina_info_correcta === null || row.nomina_info_correcta === undefined
                ? null
                : Boolean(row.nomina_info_correcta),
        nominaVerificacionObservacion: decodePossiblyMisencodedText(
            String(row.nomina_verificacion_observacion || '').trim()
        ),
        nominaVerificacionEn: row.nomina_verificacion_en ? row.nomina_verificacion_en.toISOString() : '',
        nominaVerificacionPorEmail: pickEmailLikeOnly(row.nomina_verificacion_por_email),
        asignacionRolesEtiqueta: asignacion.asignacionRolesEtiqueta,
        modalidad: row.modalidad != null ? String(row.modalidad).trim() : '',
        fechaVotacion: pgDateToYmd(row.fecha_votacion),
        unidad: row.unidad != null ? String(row.unidad).trim() : ''
    };
}

module.exports = { toClientNovedad, decodePossiblyMisencodedText };
