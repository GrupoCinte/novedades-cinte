/**
 * Metadatos UI para campos extendidos de consultores (alineado a `src/colaboradores/colaboradoresExtendedColumns.js`).
 * kind: text | textarea | date | number | money | int | bool
 */
import { formatMoneyAmountOnly, parseMoneyInput } from '../multiCurrencyMoney.js';

const RAW_FIELDS = [
    ['codigo', 'Código', 'text'],
    ['estado_catalogo', 'Estado (catálogo)', 'text'],
    ['primer_apellido', 'Primer apellido', 'text'],
    ['segundo_apellido', 'Segundo apellido', 'text'],
    ['nombres', 'Nombres', 'text'],
    ['esquema_contrato', 'Esquema de contrato', 'text'],
    ['empleador', 'Empleador', 'text'],
    ['pais', 'País', 'text'],
    ['cliente_proyecto', 'Cliente / proyecto', 'text'],
    ['fecha_reclutamiento', 'F. reclutamiento', 'date'],
    ['comercial', 'Comercial', 'text'],
    ['fecha_ingreso', 'Fecha de ingreso', 'date'],
    ['fecha_notificacion_termino', 'Fecha notificación del término', 'date'],
    ['fecha_termino', 'Fecha de término', 'date'],
    ['tipo_contrato', 'Tipo de contrato', 'text'],
    ['modalidad_contrato', 'Modalidad (contrato)', 'text'],
    ['costo_empresa', 'Costo empresa', 'money'],
    ['tarifa_cliente', 'Tarifa (cliente)', 'money'],
    ['utilidad', 'Utilidad', 'money'],
    ['rt_aprox', 'RT / aprox.', 'money'],
    ['periodicidad_pago', 'Periodicidad de pago', 'text'],
    ['moneda', 'Moneda', 'text'],
    ['sueldo_nomina', 'Sueldo nómina', 'money'],
    ['auxilio_transporte_obligatorio', 'Auxilio transporte obligatorio', 'text'],
    ['auxilios_no_prestacionales', 'Auxilios no prestacionales', 'text'],
    ['honorarios', 'Honorarios', 'text'],
    ['facturas', 'Facturas', 'text'],
    ['dotacion', 'Dotación', 'text'],
    ['costo_licencias_teams_correo', 'Costos licencias Teams / correo', 'money'],
    ['costo_equipo_computo', 'Costo equipo de cómputo', 'money'],
    ['puesto', 'Puesto', 'text'],
    ['descriptivo_puesto_sig', 'Descriptivo puesto SIG', 'textarea'],
    ['tipo_identificacion', 'Tipo de identificación', 'text'],
    ['numero_identidad', 'N° identidad', 'text'],
    ['lugar_nacimiento', 'Lugar de nacimiento', 'text'],
    ['fecha_nacimiento', 'Fecha de nacimiento', 'date'],
    ['edad', 'Edad', 'int'],
    ['eps', 'EPS', 'text'],
    ['afp', 'AFP', 'text'],
    ['ccf', 'CCF', 'text'],
    ['arl', 'ARL', 'text'],
    ['cesantias', 'Cesantías', 'text'],
    ['direccion_domicilio', 'Dirección domicilio', 'text'],
    ['ciudad', 'Ciudad', 'text'],
    ['departamento', 'Departamento', 'text'],
    ['celular_personal', 'Celular personal', 'text'],
    ['modalidad_trabajo', 'Modalidad de trabajo', 'text'],
    ['reporte_arl_teletrabajo', '# Reporte ARL teletrabajo', 'text'],
    ['email_personal', 'E-mail personal', 'text'],
    ['profesion', 'Profesión', 'text'],
    ['primer_contacto_familiar', 'Primer contacto (familiar)', 'text'],
    ['segundo_contacto_familiar', 'Segundo contacto (familiar)', 'text'],
    ['datos_bancarios', 'Datos bancarios', 'textarea'],
    ['gerente_servicio', 'Gerente de servicio', 'text'],
    ['controller_staff', 'Controller', 'text'],
    ['email_gerente_servicio', 'E-mail gerente de servicio', 'text'],
    ['seguimiento_pp', 'Seguimiento (PP)', 'text'],
    ['desempeno_ed_servicio', 'Desempeño (ED) / servicio', 'text'],
    ['sexo', 'Sexo', 'text'],
    ['estado_civil', 'Estado civil', 'text'],
    ['tiene_dependientes', '¿Dependientes?', 'bool'],
    ['tiene_hijos', 'Tiene hijos', 'bool'],
    ['edades_hijos', 'Edades hijos', 'text'],
    ['medicina_prepagada', 'Medicina prepagada', 'text'],
    ['afc_voluntario', 'AFC voluntario', 'text'],
    ['leasing_habitacional', 'Leasing habitacional', 'text'],
    ['ficha_extension_proyecto', 'Ficha extensión de proyecto', 'textarea'],
    ['frente_proyecto', 'Frente y/o proyecto', 'text'],
    ['afiliado_foneh', 'Afiliado a FONEH', 'bool'],
    ['teletrabajo', 'Teletrabajo', 'text'],
    ['modalidad_adicional', 'Modalidad (adic.)', 'text'],
    ['anexo1', 'Anexo 1', 'text'],
    ['anexo2', 'Acuerdo / Anexo 2', 'text'],
    ['documentos_complementarios', 'Documentos complementarios', 'textarea'],
    ['reversibilidad', 'Reversibilidad', 'text'],
    ['dia_familia', 'Día familia', 'text'],
    ['fecha_tentativa_grado', 'Fecha tentativa de grado', 'date'],
    ['iso_9001_contextualizacion', 'Contextualización ISO 9001', 'textarea'],
    ['sgsti_descripcion', 'Sistema gestión seguridad de la información', 'textarea'],
    ['iso_14001_ambiental', 'ISO 14001 ambiental', 'textarea'],
    // --- Campos Agente Extractor Ficha (I–VIII), paridad Dynamo/modal ---
    ['tipo_servicio', 'Tipo de servicio', 'text'],
    ['tipo_ingreso', 'Tipo de ingreso', 'text'],
    ['duracion_servicio', 'Duración del servicio', 'text'],
    ['analista_at', 'Analista AT', 'text'],
    ['tarifa_promedio_mes', 'Tarifa promedio / mes', 'money'],
    ['venta_total', 'Venta total', 'money'],
    ['costos_personal', 'Costos personal', 'money'],
    ['otros_costos', 'Otros costos', 'money'],
    ['facturar_servicio_a', 'Facturar servicio a', 'text'],
    ['consideraciones_financieras', 'Consideraciones financieras', 'textarea'],
    ['clasificacion_candidato', 'Clasificación candidato', 'text'],
    ['segundo_idioma', 'Segundo idioma', 'text'],
    ['telefono_fijo', 'Teléfono fijo', 'text'],
    ['emergencia_1_nombre', 'Emergencia 1 — nombre', 'text'],
    ['emergencia_1_parentesco', 'Emergencia 1 — parentesco', 'text'],
    ['emergencia_1_telefono', 'Emergencia 1 — teléfono', 'text'],
    ['emergencia_1_email', 'Emergencia 1 — e-mail', 'text'],
    ['emergencia_2_nombre', 'Emergencia 2 — nombre', 'text'],
    ['emergencia_2_parentesco', 'Emergencia 2 — parentesco', 'text'],
    ['emergencia_2_telefono', 'Emergencia 2 — teléfono', 'text'],
    ['emergencia_2_email', 'Emergencia 2 — e-mail', 'text'],
    ['perfil_cargo', 'Perfil del cargo', 'text'],
    ['ingreso_flexible', 'Ingreso flexible', 'text'],
    ['recargos_nocturnos', 'Recargos nocturnos', 'text'],
    ['otros_ingresos', 'Otros ingresos', 'text'],
    ['carga_prestacional', 'Carga prestacional aplicable', 'text'],
    ['ingreso_basico_letras', 'Ingreso básico en letras', 'text'],
    ['funciones_puesto', 'Funciones del puesto', 'textarea'],
    ['ejecucion_horario_no_habil', 'Ejecución horario no hábil', 'text'],
    ['horario_laboral', 'Horario laboral', 'textarea'],
    ['direccion_proyecto', 'Dirección del proyecto', 'text'],
    ['politica_viaticos', 'Política de viáticos', 'text'],
    ['consideraciones_gch', 'Consideraciones GCH', 'textarea'],
    ['consideraciones_gos', 'Consideraciones GOS', 'textarea'],
    ['contacto_focal_1_nombre', 'Focal 1 — nombre', 'text'],
    ['contacto_focal_1_cargo', 'Focal 1 — cargo', 'text'],
    ['contacto_focal_1_movil', 'Focal 1 — móvil', 'text'],
    ['contacto_focal_1_email', 'Focal 1 — e-mail', 'text'],
    ['contacto_focal_2_nombre', 'Focal 2 — nombre', 'text'],
    ['contacto_focal_2_cargo', 'Focal 2 — cargo', 'text'],
    ['contacto_focal_2_movil', 'Focal 2 — móvil', 'text'],
    ['contacto_focal_2_email', 'Focal 2 — e-mail', 'text'],
    ['contacto_admin_nombre', 'Contacto admin — nombre', 'text'],
    ['contacto_admin_cargo', 'Contacto admin — cargo', 'text'],
    ['contacto_admin_movil', 'Contacto admin — móvil', 'text'],
    ['contacto_admin_email', 'Contacto admin — e-mail', 'text'],
    ['requiere_pc', 'Requiere PC', 'text'],
    ['requiere_correo_corp', 'Requiere correo corporativo', 'text'],
    ['requiere_antivirus', 'Requiere antivirus', 'text'],
    ['requerimientos_dotacion', 'Requerimientos especiales dotación', 'textarea']
];

export const CO_EXTENDED_META = RAW_FIELDS.map(([key, label, kind]) => ({ key, label, kind }));

/** Claves extendidas con entrada monetaria + selector COP/CLP/USD (`montos_divisa` en BD). */
export const MONEY_FIELD_KEYS = CO_EXTENDED_META.filter((m) => m.kind === 'money').map((m) => m.key);

/** Secciones del modal de ficha (solo orden visual). */
export const CO_CONSULTOR_SECTIONS = [
    {
        title: 'Identificación y nombre',
        keys: [
            'codigo',
            'estado_catalogo',
            'tipo_identificacion',
            'numero_identidad',
            'primer_apellido',
            'segundo_apellido',
            'nombres',
            'lugar_nacimiento',
            'fecha_nacimiento',
            'edad',
            'sexo',
            'estado_civil',
            'clasificacion_candidato',
            'segundo_idioma'
        ]
    },
    {
        title: 'Datos del correo / servicio',
        keys: ['tipo_servicio', 'tipo_ingreso', 'duracion_servicio', 'analista_at', 'frente_proyecto']
    },
    {
        title: 'Contactos de emergencia',
        keys: [
            'emergencia_1_nombre',
            'emergencia_1_parentesco',
            'emergencia_1_telefono',
            'emergencia_1_email',
            'emergencia_2_nombre',
            'emergencia_2_parentesco',
            'emergencia_2_telefono',
            'emergencia_2_email',
            'primer_contacto_familiar',
            'segundo_contacto_familiar'
        ]
    },
    {
        title: 'Contrato y fechas',
        keys: [
            'esquema_contrato',
            'empleador',
            'pais',
            'cliente_proyecto',
            'fecha_reclutamiento',
            'comercial',
            'fecha_ingreso',
            'fecha_notificacion_termino',
            'fecha_termino',
            'tipo_contrato',
            'modalidad_contrato',
            'modalidad_trabajo',
            'modalidad_adicional',
            'periodicidad_pago',
            'moneda'
        ]
    },
    {
        title: 'Indicadores y costos del correo',
        keys: [
            'tarifa_promedio_mes',
            'venta_total',
            'costos_personal',
            'otros_costos',
            'facturar_servicio_a',
            'consideraciones_financieras'
        ]
    },
    {
        title: 'Costos y remuneración',
        keys: [
            'costo_empresa',
            'tarifa_cliente',
            'utilidad',
            'rt_aprox',
            'sueldo_nomina',
            'ingreso_basico_letras',
            'ingreso_flexible',
            'recargos_nocturnos',
            'otros_ingresos',
            'carga_prestacional',
            'auxilio_transporte_obligatorio',
            'auxilios_no_prestacionales',
            'honorarios',
            'facturas',
            'dotacion',
            'costo_licencias_teams_correo',
            'costo_equipo_computo'
        ]
    },
    {
        title: 'Puesto y ejecución del servicio',
        keys: [
            'puesto',
            'perfil_cargo',
            'descriptivo_puesto_sig',
            'funciones_puesto',
            'horario_laboral',
            'ejecucion_horario_no_habil',
            'direccion_proyecto',
            'politica_viaticos'
        ]
    },
    {
        title: 'Seguridad social',
        keys: ['eps', 'afp', 'ccf', 'arl', 'cesantias', 'medicina_prepagada', 'afc_voluntario', 'leasing_habitacional']
    },
    {
        title: 'Ubicación y contacto',
        keys: [
            'direccion_domicilio',
            'ciudad',
            'departamento',
            'celular_personal',
            'telefono_fijo',
            'email_personal',
            'profesion',
            'datos_bancarios'
        ]
    },
    {
        title: 'Stakeholders del cliente',
        keys: [
            'contacto_focal_1_nombre',
            'contacto_focal_1_cargo',
            'contacto_focal_1_movil',
            'contacto_focal_1_email',
            'contacto_focal_2_nombre',
            'contacto_focal_2_cargo',
            'contacto_focal_2_movil',
            'contacto_focal_2_email',
            'contacto_admin_nombre',
            'contacto_admin_cargo',
            'contacto_admin_movil',
            'contacto_admin_email',
            'gerente_servicio',
            'controller_staff',
            'email_gerente_servicio'
        ]
    },
    {
        title: 'Gestión y seguimiento',
        keys: [
            'reporte_arl_teletrabajo',
            'seguimiento_pp',
            'desempeno_ed_servicio'
        ]
    },
    {
        title: 'Familia',
        keys: ['tiene_dependientes', 'tiene_hijos', 'edades_hijos']
    },
    {
        title: 'Consideraciones y dotación',
        keys: [
            'consideraciones_gch',
            'consideraciones_gos',
            'requiere_pc',
            'requiere_correo_corp',
            'requiere_antivirus',
            'requerimientos_dotacion',
            'teletrabajo'
        ]
    },
    {
        title: 'Proyecto, anexos y normas',
        keys: [
            'ficha_extension_proyecto',
            'afiliado_foneh',
            'anexo1',
            'anexo2',
            'documentos_complementarios',
            'reversibilidad',
            'dia_familia',
            'fecha_tentativa_grado',
            'iso_9001_contextualizacion',
            'sgsti_descripcion',
            'iso_14001_ambiental'
        ]
    }
];

/**
 * Agrupación opcional de las secciones de CO_CONSULTOR_SECTIONS en pestañas para los
 * consumidores que quieran un layout con tabs (p. ej. el modal de ficha en Onboarding).
 * Si un componente ignora este export, el formulario sigue mostrándose en columna.
 *
 *  - id: identificador único, usado por los componentes para sincronizar la tab activa.
 *  - title: nombre completo de la pestaña (usado como tooltip / accessibility label).
 *  - shortTitle: etiqueta corta a renderizar dentro del botón de la TabBar para que las
 *    4 pestañas quepan sin scroll horizontal.
 *  - masterFields: si true, en esa tab se incluye el bloque maestro
 *    (cedula, nombre, correo_cinte, cliente, lider_catalogo).
 *  - sectionTitles: listado de `title` de CO_CONSULTOR_SECTIONS que componen la tab.
 */
export const CO_TABS = [
    {
        id: 'general',
        title: 'Información General',
        shortTitle: 'General',
        masterFields: true,
        sectionTitles: [
            'Identificación y nombre',
            'Datos del correo / servicio',
            'Ubicación y contacto',
            'Contactos de emergencia',
            'Familia'
        ]
    },
    {
        id: 'financiera',
        title: 'Información Financiera y administrativa',
        shortTitle: 'Financiera y admin.',
        masterFields: false,
        sectionTitles: [
            'Contrato y fechas',
            'Indicadores y costos del correo',
            'Costos y remuneración',
            'Seguridad social'
        ]
    },
    {
        id: 'candidato',
        title: 'Información del candidato',
        shortTitle: 'Candidato',
        masterFields: false,
        sectionTitles: ['Puesto y ejecución del servicio', 'Stakeholders del cliente', 'Gestión y seguimiento']
    },
    {
        id: 'complementaria',
        title: 'Información Complementaria del servicio',
        shortTitle: 'Complementaria',
        masterFields: false,
        sectionTitles: ['Consideraciones y dotación', 'Proyecto, anexos y normas']
    }
];

const metaByKey = new Map(CO_EXTENDED_META.map((m) => [m.key, m]));

export function emptyExtendedForm() {
    const o = {};
    for (const m of CO_EXTENDED_META) {
        o[m.key] = '';
    }
    return o;
}

export function initialStaffForm() {
    return {
        cedula: '',
        nombre: '',
        correo_cinte: '',
        cliente: '',
        lider_catalogo: '',
        ...emptyExtendedForm(),
        montos_divisa: {}
    };
}

/** Normaliza fila API → estado del formulario (inputs controlados como string). */
export function mapRowToStaffForm(row) {
    const base = initialStaffForm();
    if (!row) return base;
    const out = { ...base };
    out.cedula = row.cedula || '';
    out.nombre = row.nombre || '';
    out.correo_cinte = row.correo_cinte || '';
    out.cliente = row.cliente || '';
    out.lider_catalogo = row.lider_catalogo || '';
    let md = row.montos_divisa;
    if (md != null && typeof md === 'string') {
        try {
            md = JSON.parse(md);
        } catch {
            md = {};
        }
    }
    out.montos_divisa =
        md && typeof md === 'object' && md !== null && !Array.isArray(md) ? { ...md } : {};

    for (const m of CO_EXTENDED_META) {
        const v = row[m.key];
        if (m.kind === 'bool') {
            if (v === true) out[m.key] = 'true';
            else if (v === false) out[m.key] = 'false';
            else out[m.key] = '';
        } else if (m.kind === 'date' && v) {
            const s = typeof v === 'string' ? v : new Date(v).toISOString();
            out[m.key] = s.slice(0, 10);
        } else if (m.kind === 'money') {
            const ccy = out.montos_divisa[m.key] || 'COP';
            if (v !== null && v !== undefined && v !== '') {
                const num = typeof v === 'number' ? v : Number(v);
                if (Number.isFinite(num)) out[m.key] = formatMoneyAmountOnly(num, ccy);
                else out[m.key] = String(v);
            } else {
                out[m.key] = '';
            }
        } else if (v !== null && v !== undefined && v !== '') {
            out[m.key] = String(v);
        }
    }
    return out;
}

/** Construye payload JSON para POST/PATCH (valores null si vacío). */
export function buildStaffColaboradorPayload(coForm) {
    const ext = {};
    for (const m of CO_EXTENDED_META) {
        const raw = coForm[m.key];
        if (m.kind === 'bool') {
            if (raw === '' || raw === undefined) ext[m.key] = null;
            else ext[m.key] = raw === true || raw === 'true';
        } else if (m.kind === 'money') {
            if (raw === '' || raw === undefined || raw === null) ext[m.key] = null;
            else {
                const ccy = coForm.montos_divisa?.[m.key] || 'COP';
                const n = parseMoneyInput(raw, ccy);
                ext[m.key] = Number.isFinite(n) ? n : null;
            }
        } else if (m.kind === 'number') {
            if (raw === '' || raw === undefined || raw === null) ext[m.key] = null;
            else {
                const n = Number(String(raw).replace(',', '.'));
                ext[m.key] = Number.isFinite(n) ? n : null;
            }
        } else if (m.kind === 'int') {
            if (raw === '' || raw === undefined || raw === null) ext[m.key] = null;
            else {
                const n = parseInt(String(raw), 10);
                ext[m.key] = Number.isFinite(n) ? n : null;
            }
        } else if (m.kind === 'date') {
            ext[m.key] = raw === '' || raw === undefined ? null : String(raw).slice(0, 10);
        } else {
            ext[m.key] = raw === '' || raw === undefined ? null : String(raw);
        }
    }

    const md = {};
    for (const k of MONEY_FIELD_KEYS) {
        const ccy = coForm.montos_divisa?.[k] || 'COP';
        const n = parseMoneyInput(coForm[k], ccy);
        if (n !== null && Number.isFinite(n) && ['COP', 'CLP', 'USD'].includes(ccy)) {
            md[k] = ccy;
        }
    }
    ext.montos_divisa = Object.keys(md).length ? md : null;

    const e1 = [
        coForm.emergencia_1_nombre,
        coForm.emergencia_1_parentesco,
        coForm.emergencia_1_telefono
    ]
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .join('-');
    const e2 = [
        coForm.emergencia_2_nombre,
        coForm.emergencia_2_parentesco,
        coForm.emergencia_2_telefono
    ]
        .map((x) => String(x || '').trim())
        .filter(Boolean)
        .join('-');
    if (e1) ext.primer_contacto_familiar = e1;
    if (e2) ext.segundo_contacto_familiar = e2;

    return ext;
}

export function getFieldMeta(key) {
    return metaByKey.get(key);
}
