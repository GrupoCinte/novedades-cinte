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
    return {
        id: row.id,
        nombre: decodePossiblyMisencodedText(row.nombre),
        cedula: row.cedula,
        correoSolicitante: decodePossiblyMisencodedText(row.correo_solicitante || ''),
        cliente: decodePossiblyMisencodedText(row.cliente || ''),
        lider: decodePossiblyMisencodedText(row.lider || ''),
        tipoNovedad: decodePossiblyMisencodedText(row.tipo_novedad),
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
        soporteRuta: isLocalSupport ? soportePrincipal : '',
        soporteKey: isLocalSupport ? '' : soportePrincipal,
        soportes: soportes,
        estado: row.estado,
        creadoEn: row.creado_en ? row.creado_en.toISOString() : '',
        aprobadoEn: row.aprobado_en ? row.aprobado_en.toISOString() : '',
        aprobadoPorRol: row.aprobado_por_rol || '',
        rechazadoEn: row.rechazado_en ? row.rechazado_en.toISOString() : '',
        rechazadoPorRol: row.rechazado_por_rol || ''
    };
}

module.exports = { toClientNovedad };
