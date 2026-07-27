/**
 * Columnas extendidas de `colaboradores` (Opción A: DDL explícito).
 * Ver docs/colaboradores_campos_extendidos.md para etiquetas UI ↔ SQL.
 *
 * @type {Array<{ key: string, sqlType: string, label: string }>}
 */
const COLABORADORES_EXTENDED_COLUMNS = [
    { key: 'codigo', sqlType: 'TEXT', label: 'Código' },
    { key: 'estado_catalogo', sqlType: 'TEXT', label: 'Estado (catálogo)' },
    { key: 'primer_apellido', sqlType: 'TEXT', label: 'Primer apellido' },
    { key: 'segundo_apellido', sqlType: 'TEXT', label: 'Segundo apellido' },
    { key: 'nombres', sqlType: 'TEXT', label: 'Nombres' },
    { key: 'esquema_contrato', sqlType: 'TEXT', label: 'Esquema de contrato' },
    { key: 'empleador', sqlType: 'TEXT', label: 'Empleador' },
    { key: 'pais', sqlType: 'TEXT', label: 'País' },
    { key: 'cliente_proyecto', sqlType: 'TEXT', label: 'Cliente / Proyecto' },
    { key: 'fecha_reclutamiento', sqlType: 'DATE', label: 'F. reclutamiento' },
    { key: 'comercial', sqlType: 'TEXT', label: 'Comercial' },
    { key: 'fecha_ingreso', sqlType: 'DATE', label: 'Fecha de ingreso' },
    { key: 'fecha_notificacion_termino', sqlType: 'DATE', label: 'Fecha notificación del término' },
    { key: 'fecha_termino', sqlType: 'DATE', label: 'Fecha de término' },
    { key: 'tipo_contrato', sqlType: 'TEXT', label: 'Tipo de contrato' },
    { key: 'modalidad_contrato', sqlType: 'TEXT', label: 'Modalidad (contrato)' },
    { key: 'costo_empresa', sqlType: 'NUMERIC(18,2)', label: 'Costo empresa' },
    { key: 'tarifa_cliente', sqlType: 'NUMERIC(18,2)', label: 'Tarifa (cliente)' },
    { key: 'utilidad', sqlType: 'NUMERIC(18,2)', label: 'Utilidad' },
    { key: 'rt_aprox', sqlType: 'NUMERIC(18,2)', label: 'RT / aprox.' },
    { key: 'periodicidad_pago', sqlType: 'TEXT', label: 'Periodicidad de pago' },
    { key: 'moneda', sqlType: 'TEXT', label: 'Moneda' },
    { key: 'sueldo_nomina', sqlType: 'NUMERIC(18,2)', label: 'Sueldo nómina' },
    { key: 'auxilio_transporte_obligatorio', sqlType: 'TEXT', label: 'Auxilio transporte obligatorio' },
    { key: 'auxilios_no_prestacionales', sqlType: 'TEXT', label: 'Auxilios no prestacionales' },
    { key: 'honorarios', sqlType: 'TEXT', label: 'Honorarios' },
    { key: 'facturas', sqlType: 'TEXT', label: 'Facturas' },
    { key: 'dotacion', sqlType: 'TEXT', label: 'Dotación' },
    { key: 'costo_licencias_teams_correo', sqlType: 'NUMERIC(18,2)', label: 'Costos licencias Teams / correo' },
    { key: 'costo_equipo_computo', sqlType: 'NUMERIC(18,2)', label: 'Costo equipo de cómputo' },
    { key: 'puesto', sqlType: 'TEXT', label: 'Puesto' },
    { key: 'descriptivo_puesto_sig', sqlType: 'TEXT', label: 'Descriptivo puesto SIG' },
    { key: 'tipo_identificacion', sqlType: 'TEXT', label: 'Tipo de identificación' },
    { key: 'numero_identidad', sqlType: 'TEXT', label: 'N° identidad' },
    { key: 'lugar_nacimiento', sqlType: 'TEXT', label: 'Lugar de nacimiento' },
    { key: 'fecha_nacimiento', sqlType: 'DATE', label: 'Fecha de nacimiento' },
    { key: 'edad', sqlType: 'INTEGER', label: 'Edad' },
    { key: 'eps', sqlType: 'TEXT', label: 'EPS' },
    { key: 'afp', sqlType: 'TEXT', label: 'AFP' },
    { key: 'ccf', sqlType: 'TEXT', label: 'CCF' },
    { key: 'arl', sqlType: 'TEXT', label: 'ARL' },
    { key: 'cesantias', sqlType: 'TEXT', label: 'Cesantías' },
    { key: 'direccion_domicilio', sqlType: 'TEXT', label: 'Dirección domicilio' },
    { key: 'ciudad', sqlType: 'TEXT', label: 'Ciudad' },
    { key: 'departamento', sqlType: 'TEXT', label: 'Departamento' },
    { key: 'celular_personal', sqlType: 'TEXT', label: 'Celular personal' },
    { key: 'modalidad_trabajo', sqlType: 'TEXT', label: 'Modalidad de trabajo' },
    { key: 'reporte_arl_teletrabajo', sqlType: 'TEXT', label: '# Reporte ARL teletrabajo' },
    { key: 'email_personal', sqlType: 'TEXT', label: 'E-mail personal' },
    { key: 'profesion', sqlType: 'TEXT', label: 'Profesión' },
    { key: 'primer_contacto_familiar', sqlType: 'TEXT', label: 'Primer contacto (familiar)' },
    { key: 'segundo_contacto_familiar', sqlType: 'TEXT', label: 'Segundo contacto (familiar)' },
    { key: 'datos_bancarios', sqlType: 'TEXT', label: 'Datos bancarios' },
    { key: 'gerente_servicio', sqlType: 'TEXT', label: 'Gerente de servicio' },
    { key: 'controller_staff', sqlType: 'TEXT', label: 'Controller' },
    { key: 'email_gerente_servicio', sqlType: 'TEXT', label: 'E-mail gerente de servicio' },
    { key: 'seguimiento_pp', sqlType: 'TEXT', label: 'Seguimiento (PP)' },
    { key: 'desempeno_ed_servicio', sqlType: 'TEXT', label: 'Desempeño (ED) / servicio' },
    { key: 'sexo', sqlType: 'TEXT', label: 'Sexo' },
    { key: 'estado_civil', sqlType: 'TEXT', label: 'Estado civil' },
    { key: 'tiene_dependientes', sqlType: 'BOOLEAN', label: '¿Dependientes?' },
    { key: 'tiene_hijos', sqlType: 'BOOLEAN', label: 'Tiene hijos' },
    { key: 'edades_hijos', sqlType: 'TEXT', label: 'Edades hijos' },
    { key: 'medicina_prepagada', sqlType: 'TEXT', label: 'Medicina prepagada' },
    { key: 'afc_voluntario', sqlType: 'TEXT', label: 'AFC voluntario' },
    { key: 'leasing_habitacional', sqlType: 'TEXT', label: 'Leasing habitacional' },
    { key: 'ficha_extension_proyecto', sqlType: 'TEXT', label: 'Ficha extensión de proyecto' },
    { key: 'frente_proyecto', sqlType: 'TEXT', label: 'Frente y/o proyecto' },
    { key: 'afiliado_foneh', sqlType: 'BOOLEAN', label: 'Afiliado a FONEH' },
    { key: 'teletrabajo', sqlType: 'TEXT', label: 'Teletrabajo' },
    { key: 'modalidad_adicional', sqlType: 'TEXT', label: 'Modalidad (adic.)' },
    { key: 'anexo1', sqlType: 'TEXT', label: 'Anexo 1' },
    { key: 'anexo2', sqlType: 'TEXT', label: 'Acuerdo / Anexo 2' },
    { key: 'documentos_complementarios', sqlType: 'TEXT', label: 'Documentos complementarios' },
    { key: 'reversibilidad', sqlType: 'TEXT', label: 'Reversibilidad' },
    { key: 'dia_familia', sqlType: 'TEXT', label: 'Día familia' },
    { key: 'fecha_tentativa_grado', sqlType: 'DATE', label: 'Fecha tentativa de grado' },
    { key: 'iso_9001_contextualizacion', sqlType: 'TEXT', label: 'Contextualización ISO 9001' },
    { key: 'sgsti_descripcion', sqlType: 'TEXT', label: 'Sistema gestión seguridad de la información' },
    { key: 'iso_14001_ambiental', sqlType: 'TEXT', label: 'ISO 14001 ambiental' },
    { key: 'tipo_servicio', sqlType: 'TEXT', label: 'Tipo de servicio' },
    { key: 'tipo_ingreso', sqlType: 'TEXT', label: 'Tipo de ingreso' },
    { key: 'duracion_servicio', sqlType: 'TEXT', label: 'Duración del servicio' },
    { key: 'analista_at', sqlType: 'TEXT', label: 'Analista AT' },
    { key: 'tarifa_promedio_mes', sqlType: 'NUMERIC(18,2)', label: 'Tarifa promedio / mes' },
    { key: 'venta_total', sqlType: 'NUMERIC(18,2)', label: 'Venta total' },
    { key: 'costos_personal', sqlType: 'NUMERIC(18,2)', label: 'Costos personal' },
    { key: 'otros_costos', sqlType: 'NUMERIC(18,2)', label: 'Otros costos' },
    { key: 'facturar_servicio_a', sqlType: 'TEXT', label: 'Facturar servicio a' },
    { key: 'consideraciones_financieras', sqlType: 'TEXT', label: 'Consideraciones financieras' },
    { key: 'clasificacion_candidato', sqlType: 'TEXT', label: 'Clasificación candidato' },
    { key: 'segundo_idioma', sqlType: 'TEXT', label: 'Segundo idioma' },
    { key: 'telefono_fijo', sqlType: 'TEXT', label: 'Teléfono fijo' },
    { key: 'emergencia_1_nombre', sqlType: 'TEXT', label: 'Emergencia 1 — nombre' },
    { key: 'emergencia_1_parentesco', sqlType: 'TEXT', label: 'Emergencia 1 — parentesco' },
    { key: 'emergencia_1_telefono', sqlType: 'TEXT', label: 'Emergencia 1 — teléfono' },
    { key: 'emergencia_1_email', sqlType: 'TEXT', label: 'Emergencia 1 — e-mail' },
    { key: 'emergencia_2_nombre', sqlType: 'TEXT', label: 'Emergencia 2 — nombre' },
    { key: 'emergencia_2_parentesco', sqlType: 'TEXT', label: 'Emergencia 2 — parentesco' },
    { key: 'emergencia_2_telefono', sqlType: 'TEXT', label: 'Emergencia 2 — teléfono' },
    { key: 'emergencia_2_email', sqlType: 'TEXT', label: 'Emergencia 2 — e-mail' },
    { key: 'perfil_cargo', sqlType: 'TEXT', label: 'Perfil del cargo' },
    { key: 'ingreso_flexible', sqlType: 'TEXT', label: 'Ingreso flexible' },
    { key: 'recargos_nocturnos', sqlType: 'TEXT', label: 'Recargos nocturnos' },
    { key: 'otros_ingresos', sqlType: 'TEXT', label: 'Otros ingresos' },
    { key: 'carga_prestacional', sqlType: 'TEXT', label: 'Carga prestacional aplicable' },
    { key: 'ingreso_basico_letras', sqlType: 'TEXT', label: 'Ingreso básico en letras' },
    { key: 'funciones_puesto', sqlType: 'TEXT', label: 'Funciones del puesto' },
    { key: 'ejecucion_horario_no_habil', sqlType: 'TEXT', label: 'Ejecución horario no hábil' },
    { key: 'horario_laboral', sqlType: 'TEXT', label: 'Horario laboral' },
    { key: 'direccion_proyecto', sqlType: 'TEXT', label: 'Dirección del proyecto' },
    { key: 'politica_viaticos', sqlType: 'TEXT', label: 'Política de viáticos' },
    { key: 'consideraciones_gch', sqlType: 'TEXT', label: 'Consideraciones GCH' },
    { key: 'consideraciones_gos', sqlType: 'TEXT', label: 'Consideraciones GOS' },
    { key: 'contacto_focal_1_nombre', sqlType: 'TEXT', label: 'Focal 1 — nombre' },
    { key: 'contacto_focal_1_cargo', sqlType: 'TEXT', label: 'Focal 1 — cargo' },
    { key: 'contacto_focal_1_movil', sqlType: 'TEXT', label: 'Focal 1 — móvil' },
    { key: 'contacto_focal_1_email', sqlType: 'TEXT', label: 'Focal 1 — e-mail' },
    { key: 'contacto_focal_2_nombre', sqlType: 'TEXT', label: 'Focal 2 — nombre' },
    { key: 'contacto_focal_2_cargo', sqlType: 'TEXT', label: 'Focal 2 — cargo' },
    { key: 'contacto_focal_2_movil', sqlType: 'TEXT', label: 'Focal 2 — móvil' },
    { key: 'contacto_focal_2_email', sqlType: 'TEXT', label: 'Focal 2 — e-mail' },
    { key: 'contacto_admin_nombre', sqlType: 'TEXT', label: 'Contacto admin — nombre' },
    { key: 'contacto_admin_cargo', sqlType: 'TEXT', label: 'Contacto admin — cargo' },
    { key: 'contacto_admin_movil', sqlType: 'TEXT', label: 'Contacto admin — móvil' },
    { key: 'contacto_admin_email', sqlType: 'TEXT', label: 'Contacto admin — e-mail' },
    { key: 'requiere_pc', sqlType: 'TEXT', label: 'Requiere PC' },
    { key: 'requiere_correo_corp', sqlType: 'TEXT', label: 'Requiere correo corporativo' },
    { key: 'requiere_antivirus', sqlType: 'TEXT', label: 'Requiere antivirus' },
    { key: 'requerimientos_dotacion', sqlType: 'TEXT', label: 'Requerimientos especiales dotación' },
    /** ISO 4217 por campo monetario extendido (COP | CLP | USD). Solo campos con monto informado. */
    { key: 'montos_divisa', sqlType: 'JSONB', label: 'Divisas montos' }
];

const EXTENDED_KEYS = COLABORADORES_EXTENDED_COLUMNS.map((c) => c.key);

/**
 * Normaliza un valor para escritura en PostgreSQL según el tipo de columna.
 * @returns {null|boolean|number|string|undefined} `undefined` si la clave no es extendida.
 */
function normalizeExtendedFieldForDb(key, value) {
    const col = COLABORADORES_EXTENDED_COLUMNS.find((c) => c.key === key);
    if (!col) return undefined;
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const t = col.sqlType;
    if (t === 'BOOLEAN') {
        if (typeof value === 'boolean') return value;
        if (value === true || value === 'true' || value === '1') return true;
        if (value === false || value === 'false' || value === '0') return false;
        return null;
    }
    if (t.startsWith('NUMERIC')) {
        const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
        return Number.isFinite(n) ? n : null;
    }
    if (t === 'INTEGER') {
        const n = parseInt(String(value).replace(/[^\d-]/g, ''), 10);
        return Number.isFinite(n) ? n : null;
    }
    if (t === 'DATE') {
        const raw = String(value).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
        // Fechas largas n8n se parsean en onboardingPromotionService; aquí omitimos basura.
        return null;
    }
    if (t === 'JSONB') {
        if (value === null || value === '') return null;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value;
        if (typeof value === 'string') {
            try {
                const o = JSON.parse(value);
                return typeof o === 'object' && o !== null && !Array.isArray(o) ? o : null;
            } catch {
                return null;
            }
        }
        return null;
    }
    return String(value);
}

module.exports = {
    COLABORADORES_EXTENDED_COLUMNS,
    COLABORADORES_EXTENDED_KEYS: EXTENDED_KEYS,
    normalizeExtendedFieldForDb
};
