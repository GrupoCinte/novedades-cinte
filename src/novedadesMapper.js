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
        nombre: row.nombre,
        cedula: row.cedula,
        correoSolicitante: row.correo_solicitante || '',
        cliente: row.cliente || '',
        lider: row.lider || '',
        tipoNovedad: row.tipo_novedad,
        area: row.area,
        fecha: row.fecha ? row.fecha.toISOString().slice(0, 10) : '',
        horaInicio: row.hora_inicio ? String(row.hora_inicio).slice(0, 5) : '',
        horaFin: row.hora_fin ? String(row.hora_fin).slice(0, 5) : '',
        fechaInicio: row.fecha_inicio ? row.fecha_inicio.toISOString().slice(0, 10) : '',
        fechaFin: row.fecha_fin ? row.fecha_fin.toISOString().slice(0, 10) : '',
        cantidadHoras: Number(row.cantidad_horas || 0),
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
