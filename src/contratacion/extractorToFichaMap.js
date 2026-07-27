/**
 * Mapeo 1:1 Agente Extractor Ficha (89 campos) → claves formulario colaborador consultor.
 */
const { isSentinel, parseFechaInicioSmart, parseSalarioCop, concatEmergencyContact } = require('../shared/n8nFieldNormalizers');

/** Campos monetarios del flatten (para diff/UI). */
const EXTRACTOR_MONEY_KEYS = [
    'tarifa_cliente',
    'tarifa_promedio_mes',
    'venta_total',
    'costo_empresa',
    'costos_personal',
    'costo_equipo_computo',
    'costo_licencias_teams_correo',
    'otros_costos',
    'sueldo_nomina'
];

const NACIONALIDAD_TO_PAIS = {
    colombiana: 'Colombia',
    colombiano: 'Colombia',
    venezuela: 'Venezuela',
    venezolana: 'Venezuela',
    venezolano: 'Venezuela',
    ecuatoriana: 'Ecuador',
    ecuatoriano: 'Ecuador',
    peruana: 'Perú',
    peruano: 'Perú',
    mexicana: 'México',
    mexicano: 'México',
    argentina: 'Argentina',
    argentino: 'Argentina',
    chilena: 'Chile',
    chileno: 'Chile',
    espanola: 'España',
    espanol: 'España',
    española: 'España',
    español: 'España',
    estadounidense: 'Estados Unidos',
    brasilena: 'Brasil',
    brasileno: 'Brasil',
    brasileña: 'Brasil',
    brasileño: 'Brasil'
};

/**
 * Nacionalidad Zoho → país canónico (evita "Colombiana" vs "Colombia" en diff).
 * @param {unknown} raw
 * @returns {string|undefined}
 */
function nacionalidadToPais(raw) {
    if (raw == null) return undefined;
    const s = String(raw).trim();
    if (!s) return undefined;
    const fold = s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    if (NACIONALIDAD_TO_PAIS[fold]) return NACIONALIDAD_TO_PAIS[fold];
    if (fold === 'colombia') return 'Colombia';
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** @type {Array<[string, string, { date?: boolean, money?: boolean, master?: string, paisFromNacionalidad?: boolean }]>} */
const EXTRACTOR_PATH_MAP = [
    ['ID_Registro', 'codigo'],
    ['I_Informacion_General.Tipo_Servicio', 'tipo_servicio'],
    ['I_Informacion_General.Cliente', 'cliente', { master: 'cliente' }],
    ['I_Informacion_General.Proyecto', 'cliente_proyecto'],
    ['I_Informacion_General.Tipo_Ingreso', 'tipo_ingreso'],
    ['I_Informacion_General.Modalidad_Asignacion', 'modalidad_contrato'],
    ['I_Informacion_General.Servicio', 'frente_proyecto'],
    ['I_Informacion_General.Duracion', 'duracion_servicio'],
    ['I_Informacion_General.Fecha_Inicio', 'fecha_ingreso', { date: true }],
    ['I_Informacion_General.Fecha_Salida', 'fecha_termino', { date: true }],
    ['I_Informacion_General.Fecha_Salida', 'fecha_notificacion_termino', { date: true }],
    ['I_Informacion_General.Ejecutivo_Comercial', 'comercial'],
    ['I_Informacion_General.Analista_AT', 'analista_at'],
    ['II_Informacion_Financiera.Tarifa', 'tarifa_cliente', { money: true }],
    ['II_Informacion_Financiera.Tarifa_Promedio_Mes', 'tarifa_promedio_mes', { money: true }],
    ['II_Informacion_Financiera.Venta_Total', 'venta_total', { money: true }],
    ['II_Informacion_Financiera.Costo_Empresa', 'costo_empresa', { money: true }],
    ['II_Informacion_Financiera.Costos_Personal', 'costos_personal', { money: true }],
    ['II_Informacion_Financiera.Costos_Equipo_Computo', 'costo_equipo_computo', { money: true }],
    ['II_Informacion_Financiera.Costos_Correo_Antivirus', 'costo_licencias_teams_correo', { money: true }],
    ['II_Informacion_Financiera.Otros_Costos', 'otros_costos', { money: true }],
    ['II_Informacion_Financiera.Consideraciones', 'consideraciones_financieras'],
    ['II_Informacion_Financiera.Facturar_Servicio_A', 'facturar_servicio_a'],
    ['III_Informacion_Candidato.Nombre', 'nombre', { master: 'nombre' }],
    ['III_Informacion_Candidato.Primer_Nombre', 'nombres'],
    ['III_Informacion_Candidato.Segundo_Nombre', 'nombres_append'],
    ['III_Informacion_Candidato.Primer_Apellido', 'primer_apellido'],
    ['III_Informacion_Candidato.Segundo_Apellido', 'segundo_apellido'],
    ['III_Informacion_Candidato.Clasificacion', 'clasificacion_candidato'],
    ['III_Informacion_Candidato.Identificacion_Tipo', 'tipo_identificacion'],
    ['III_Informacion_Candidato.Identificacion_Numero', 'numero_identidad'],
    ['III_Informacion_Candidato.Identificacion_Numero', 'cedula', { master: 'cedula' }],
    ['III_Informacion_Candidato.Nacionalidad', 'pais', { paisFromNacionalidad: true }],
    ['III_Informacion_Candidato.Fecha_Nacimiento', 'fecha_nacimiento', { date: true }],
    ['III_Informacion_Candidato.Lugar_Nacimiento', 'lugar_nacimiento'],
    ['III_Informacion_Candidato.Edad', 'edad'],
    ['III_Informacion_Candidato.Estado_Civil', 'estado_civil'],
    ['III_Informacion_Candidato.Profesion', 'profesion'],
    ['III_Informacion_Candidato.EPS', 'eps'],
    ['III_Informacion_Candidato.AFP', 'afp'],
    ['III_Informacion_Candidato.Segundo_Idioma', 'segundo_idioma'],
    ['III_Informacion_Candidato.Telefono', 'telefono_fijo'],
    ['III_Informacion_Candidato.Movil', 'celular_personal'],
    ['III_Informacion_Candidato.Email', 'email_personal'],
    ['III_Informacion_Candidato.Direccion_Residencia', 'direccion_domicilio'],
    ['III_Informacion_Candidato.Contacto_Emergencia_1_Nombre', 'emergencia_1_nombre'],
    ['III_Informacion_Candidato.Contacto_Emergencia_1_Parentesco', 'emergencia_1_parentesco'],
    ['III_Informacion_Candidato.Contacto_Emergencia_1_Telefono', 'emergencia_1_telefono'],
    ['III_Informacion_Candidato.Contacto_Emergencia_1_Email', 'emergencia_1_email'],
    ['III_Informacion_Candidato.Contacto_Emergencia_2_Nombre', 'emergencia_2_nombre'],
    ['III_Informacion_Candidato.Contacto_Emergencia_2_Parentesco', 'emergencia_2_parentesco'],
    ['III_Informacion_Candidato.Contacto_Emergencia_2_Telefono', 'emergencia_2_telefono'],
    ['III_Informacion_Candidato.Contacto_Emergencia_2_Email', 'emergencia_2_email'],
    ['IV_Informacion_Contratacion.Puesto_Cargo', 'puesto'],
    ['IV_Informacion_Contratacion.Perfil_Cargo', 'perfil_cargo'],
    ['IV_Informacion_Contratacion.Descriptivo_CINTE', 'descriptivo_puesto_sig'],
    // Zoho "Esquema_Contratacion" (p. ej. Contrato Indefinido) = tipo_contrato CH.
    // esquema_contrato CH es otro concepto (p. ej. Nómina) y no tiene fuente 1:1 aquí.
    ['IV_Informacion_Contratacion.Esquema_Contratacion', 'tipo_contrato'],
    ['IV_Informacion_Contratacion.Tipo_Remuneracion', 'periodicidad_pago'],
    ['IV_Informacion_Contratacion.Ingreso_Basico', 'sueldo_nomina', { money: true }],
    ['IV_Informacion_Contratacion.Ingreso_Basico_letras', 'ingreso_basico_letras'],
    ['IV_Informacion_Contratacion.Ingreso_Flexible', 'ingreso_flexible'],
    ['IV_Informacion_Contratacion.Recargos_Nocturnos', 'recargos_nocturnos'],
    ['IV_Informacion_Contratacion.Prestaciones_Ley', 'auxilio_transporte_obligatorio'],
    ['IV_Informacion_Contratacion.Prestaciones_Ley', 'auxilios_no_prestacionales'],
    ['IV_Informacion_Contratacion.Prestaciones_Ley', 'dotacion'],
    ['IV_Informacion_Contratacion.Otros_Ingresos', 'otros_ingresos'],
    ['IV_Informacion_Contratacion.Carga_Prestacional_Aplicable', 'carga_prestacional'],
    ['IV_Informacion_Contratacion.Funciones', 'funciones_puesto'],
    ['IV_Informacion_Contratacion.Ejecucion_Horario_No_Habil', 'ejecucion_horario_no_habil'],
    ['IV_Informacion_Contratacion.Horario', 'horario_laboral'],
    ['IV_Informacion_Contratacion.Modalidad_Asignacion', 'modalidad_trabajo'],
    ['IV_Informacion_Contratacion.Direccion_Proyecto', 'direccion_proyecto'],
    ['IV_Informacion_Contratacion.Politica_Viaticos', 'politica_viaticos'],
    ['V_Consideraciones_GCH.Consideraciones', 'consideraciones_gch'],
    ['VI_Stakeholders.Contacto_Focal_1_Nombre', 'contacto_focal_1_nombre'],
    ['VI_Stakeholders.Contacto_Focal_1_Cargo', 'contacto_focal_1_cargo'],
    ['VI_Stakeholders.Contacto_Focal_1_Movil', 'contacto_focal_1_movil'],
    ['VI_Stakeholders.Contacto_Focal_1_Email', 'contacto_focal_1_email'],
    ['VI_Stakeholders.Contacto_Focal_2_Nombre', 'contacto_focal_2_nombre'],
    ['VI_Stakeholders.Contacto_Focal_2_Cargo', 'contacto_focal_2_cargo'],
    ['VI_Stakeholders.Contacto_Focal_2_Movil', 'contacto_focal_2_movil'],
    ['VI_Stakeholders.Contacto_Focal_2_Email', 'contacto_focal_2_email'],
    ['VI_Stakeholders.Contacto_Administrativo_Nombre', 'contacto_admin_nombre'],
    ['VI_Stakeholders.Contacto_Administrativo_Cargo', 'contacto_admin_cargo'],
    ['VI_Stakeholders.Contacto_Administrativo_Movil', 'contacto_admin_movil'],
    ['VI_Stakeholders.Contacto_Administrativo_Email', 'contacto_admin_email'],
    // Contacto Focal = stakeholder del cliente; NO es gerente_servicio CINTE.
    ['VI_Stakeholders.Contacto_Administrativo_Nombre', 'controller_staff'],
    ['VII_Dotacion_Servicio.Requiere_PC', 'requiere_pc'],
    ['VII_Dotacion_Servicio.Requiere_Correo', 'requiere_correo_corp'],
    ['VII_Dotacion_Servicio.Requiere_Antivirus', 'requiere_antivirus'],
    ['VII_Dotacion_Servicio.Requerimientos_Especiales', 'requerimientos_dotacion'],
    ['VIII_Consideraciones_GOS.Consideraciones', 'consideraciones_gos']
];

function getByPath(obj, path) {
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
        if (cur == null || typeof cur !== 'object') return undefined;
        cur = cur[p];
    }
    return cur;
}

function normalizeMappedValue(raw, opts = {}) {
    if (isSentinel(raw)) return undefined;
    if (opts.date) {
        const iso = parseFechaInicioSmart(raw);
        return iso || undefined;
    }
    if (opts.money) {
        const n = parseSalarioCop(raw);
        return n != null ? n : String(raw).trim();
    }
    if (opts.paisFromNacionalidad) {
        return nacionalidadToPais(raw);
    }
    const s = String(raw).trim();
    return s || undefined;
}

/**
 * @param {object} output Salida del Agente Extractor Ficha (`json.output`).
 * @returns {Record<string, string|number>} fila plana para formulario / Dynamo
 */
function flattenExtractorOutput(output) {
    if (!output || typeof output !== 'object') return {};
    const row = {};
    let segundoNombre = '';

    for (const entry of EXTRACTOR_PATH_MAP) {
        const [path, key, opts = {}] = entry;
        const raw = getByPath(output, path);
        if (key === 'nombres_append') {
            if (!isSentinel(raw)) segundoNombre = String(raw).trim();
            continue;
        }
        const val = normalizeMappedValue(raw, opts);
        if (val === undefined) continue;
        if (key === 'nombres' && row.nombres && segundoNombre) {
            row.nombres = `${row.nombres} ${segundoNombre}`.trim();
            continue;
        }
        if (opts.money && typeof val === 'number') {
            row[key] = val;
            row._moneyKeys = row._moneyKeys || [];
            row._moneyKeys.push(key);
        } else {
            row[key] = val;
        }
    }

    if (row.nombres && segundoNombre) {
        row.nombres = `${row.nombres} ${segundoNombre}`.trim();
    }

    row.primer_contacto_familiar = concatEmergencyContact(
        row.emergencia_1_nombre,
        row.emergencia_1_parentesco,
        row.emergencia_1_telefono
    );
    row.segundo_contacto_familiar = concatEmergencyContact(
        row.emergencia_2_nombre,
        row.emergencia_2_parentesco,
        row.emergencia_2_telefono
    );

    delete row.nombres_append;
    delete row._moneyKeys;
    return row;
}

/**
 * Dynamo plano: claves formulario + legacy n8n + extractor_output JSON string.
 */
function flattenExtractorForDynamo(output, pipeline = {}) {
    const flat = flattenExtractorOutput(output);
    const legacy = {
        'nombre y apellido': flat.nombre,
        edad: flat.edad != null ? String(flat.edad) : undefined,
        cedula: flat.cedula,
        puesto: flat.puesto,
        email: flat.email_personal,
        whatsapp_numerico: flat.celular_personal,
        direccion: flat.direccion_domicilio,
        fecha_inicio: output?.I_Informacion_General?.Fecha_Inicio,
        salario_numeros: output?.IV_Informacion_Contratacion?.Ingreso_Basico,
        salario_letras: flat.ingreso_basico_letras,
        Descriptivo_Cinte: flat.descriptivo_puesto_sig,
        Funciones: flat.funciones_puesto,
        tipo_contrato: flat.tipo_contrato,
        cliente: flat.cliente,
        codigo_opt: output?.I_Informacion_General?.Codigo_Oportunidad
    };

    const out = { ...pipeline };
    for (const [k, v] of Object.entries(legacy)) {
        if (v != null && !isSentinel(v)) out[k] = v;
    }
    for (const [k, v] of Object.entries(flat)) {
        if (v != null && v !== '' && !isSentinel(v)) out[k] = v;
    }
    try {
        out.extractor_output = JSON.stringify(output);
    } catch {
        /* ignore */
    }
    return out;
}

function applyLegacyEmergencyParse(row) {
    if (!row) return row;
    const out = { ...row };
    const { parseLegacyContactConcat } = require('../shared/n8nFieldNormalizers');
    if (!out.emergencia_1_nombre && out.primer_contacto_familiar) {
        const p = parseLegacyContactConcat(out.primer_contacto_familiar);
        if (p) {
            out.emergencia_1_nombre = p.nombre;
            out.emergencia_1_parentesco = p.parentesco;
            out.emergencia_1_telefono = p.telefono;
        }
    }
    if (!out.emergencia_2_nombre && out.segundo_contacto_familiar) {
        const p = parseLegacyContactConcat(out.segundo_contacto_familiar);
        if (p) {
            out.emergencia_2_nombre = p.nombre;
            out.emergencia_2_parentesco = p.parentesco;
            out.emergencia_2_telefono = p.telefono;
        }
    }
    return out;
}

module.exports = {
    EXTRACTOR_PATH_MAP,
    EXTRACTOR_MONEY_KEYS,
    flattenExtractorOutput,
    flattenExtractorForDynamo,
    applyLegacyEmergencyParse,
    getByPath,
    nacionalidadToPais
};
