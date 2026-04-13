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
        tipoNovedad,
        area: row.area,
        fecha: row.fecha ? row.fecha.toISOString().slice(0, 10) : '',
        horaInicio: row.hora_inicio ? String(row.hora_inicio).slice(0, 5) : '',
        horaFin: row.hora_fin ? String(row.hora_fin).slice(0, 5) : '',
        fechaInicio: row.fecha_inicio ? row.fecha_inicio.toISOString().slice(0, 10) : '',
        fechaFin: row.fecha_fin ? row.fecha_fin.toISOString().slice(0, 10) : '',
        cantidadHoras: Number(row.cantidad_horas || 0),
        horasDiurnas: Number(row.horas_diurnas || 0),
        horasNocturnas: Number(row.horas_nocturnas || 0),
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
        asignacionRolesEtiqueta: asignacion.asignacionRolesEtiqueta
    };
}

module.exports = { toClientNovedad };
