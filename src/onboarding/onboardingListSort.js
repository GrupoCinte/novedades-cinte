/**
 * Whitelist de ORDER BY para listados del onboarding maestro (evita SQL injection).
 */

const SORT_DIR = new Set(['asc', 'desc']);

const PERSONAL_SORT_MAP = {
    cedula: 'c.cedula',
    nombre: 'c.nombre',
    cliente: 'c.cliente',
    puesto: 'c.puesto',
    pais: 'c.pais',
    tipo_personal: 'c.tipo_personal',
    fecha_ingreso: 'c.fecha_ingreso',
    fecha_termino: 'c.fecha_termino',
    fecha_baja_efectiva: 'c.fecha_termino',
    motivo_baja: 'c.motivo_baja',
    tipo_contrato: 'c.tipo_contrato',
    descriptivo_puesto_sig: 'c.descriptivo_puesto_sig',
    activo: 'c.activo',
    empleador: 'c.empleador',
    tiempo_permanencia_meses: 'c.tiempo_permanencia_meses'
};

const LICENCIAS_SORT_MAP = {
    cedula: 'l.cedula',
    nombre: 'c.nombre',
    cliente: 'c.cliente',
    tipo_licencia: 'l.tipo_licencia',
    meses_gestacion: 'l.meses_gestacion',
    parto_fecha_aproximada: 'l.parto_fecha_aproximada',
    inicio_licencia: 'l.inicio_licencia',
    fin_licencia: 'l.fin_licencia',
    eps: 'l.eps',
    estado: 'l.estado'
};

const EXTRANJEROS_SORT_MAP = {
    cedula: 'd.cedula',
    nombre: 'c.nombre',
    cliente: 'c.cliente',
    lugar_nacimiento: 'd.lugar_nacimiento',
    tipo_identificacion: 'd.tipo_identificacion',
    numero_identidad: 'd.numero_identidad',
    registro_sire: 'd.registro_sire',
    registro_rutec: 'd.registro_rutec',
    fecha_vencimiento: 'd.fecha_vencimiento',
    vigencia_renovar: 'd.vigencia_renovar',
    estado_documento: 'd.estado_documento'
};

function normalizeDir(dir) {
    return dir === 'desc' ? 'DESC' : 'ASC';
}

function buildOrderBy(sortMap, sort, dir, defaultExpr) {
    const direction = normalizeDir(dir);
    const key = sort && sortMap[sort] ? sort : null;
    if (key) {
        return `${sortMap[key]} ${direction} NULLS LAST`;
    }
    return defaultExpr;
}

function buildPersonalOrderBy(sort, dir) {
    const tieBreak = 'c.cedula ASC';
    const defaultExpr = `c.fecha_ingreso ASC NULLS LAST, ${tieBreak}`;
    const primary = buildOrderBy(PERSONAL_SORT_MAP, sort, dir, defaultExpr);
    if (sort && PERSONAL_SORT_MAP[sort]) {
        return `${primary}, ${tieBreak}`;
    }
    return primary;
}

function buildLicenciasOrderBy(sort, dir) {
    const tieBreak = 'l.created_at ASC NULLS LAST, l.cedula ASC';
    const defaultExpr = `l.inicio_licencia ASC NULLS LAST, ${tieBreak}`;
    const primary = buildOrderBy(LICENCIAS_SORT_MAP, sort, dir, defaultExpr);
    if (sort && LICENCIAS_SORT_MAP[sort]) {
        return `${primary}, ${tieBreak}`;
    }
    return primary;
}

function buildExtranjerosOrderBy(sort, dir) {
    const tieBreak = 'd.cedula ASC';
    const defaultExpr = `d.fecha_vencimiento ASC NULLS LAST, ${tieBreak}`;
    const primary = buildOrderBy(EXTRANJEROS_SORT_MAP, sort, dir, defaultExpr);
    if (sort && EXTRANJEROS_SORT_MAP[sort]) {
        return `${primary}, ${tieBreak}`;
    }
    return primary;
}

function isAllowedPersonalSort(sort) {
    return !sort || Boolean(PERSONAL_SORT_MAP[sort]);
}

function isAllowedLicenciasSort(sort) {
    return !sort || Boolean(LICENCIAS_SORT_MAP[sort]);
}

function isAllowedExtranjerosSort(sort) {
    return !sort || Boolean(EXTRANJEROS_SORT_MAP[sort]);
}

module.exports = {
    SORT_DIR,
    PERSONAL_SORT_MAP,
    LICENCIAS_SORT_MAP,
    EXTRANJEROS_SORT_MAP,
    buildPersonalOrderBy,
    buildLicenciasOrderBy,
    buildExtranjerosOrderBy,
    isAllowedPersonalSort,
    isAllowedLicenciasSort,
    isAllowedExtranjerosSort
};
