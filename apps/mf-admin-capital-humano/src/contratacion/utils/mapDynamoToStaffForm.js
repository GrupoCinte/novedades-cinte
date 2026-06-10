import { mapRowToStaffForm, MONEY_FIELD_KEYS } from '../../constants/colaboradoresConsultorFields.js';
import { formatMoneyAmountOnly } from '../../multiCurrencyMoney.js';
import { isSentinel, parseFechaInicioSmart, parseSalarioCop } from './n8nFieldNormalizers.js';
import {
    applyLegacyEmergencyParse,
    flattenExtractorOutput,
    parseExtractorOutputFromFullData
} from './extractorToFichaMap.js';

const SENTINELS = new Set(['cargando', 'pendiente_valor', 'nada', 'false', 'null', 'undefined', '']);

/** Campos del flujo n8n / monitor; se muestran en la pestaña «Proceso En ingreso». */
export const PIPELINE_FIELD_LABELS = {
    status: 'Estado del proceso',
    statuses: 'Estado auxiliar',
    documentos: 'Documentos',
    ts_documentos_recibidos: 'TS documentos recibidos',
    ts_validacion_completada: 'TS validación completada',
    ts_analisis_ia_completado: 'TS análisis IA completado',
    ts_primer_contacto_candidato: 'TS primer contacto',
    ts_eliminado: 'TS eliminado',
    obs_finalizado_manual: 'Obs. finalización manual',
    obs_eliminado: 'Obs. eliminación',
    canal: 'Canal',
    workflow: 'Workflow',
    origen: 'Origen',
    fuente: 'Fuente',
    codigo_opt: 'Código oportunidad (Dynamo)'
};

const HERO_KEYS = new Set([
    'correo_cinte',
    'puesto',
    'cargo',
    'whatsapp_numerico',
    'whatsapp',
    'whatsapp_number',
    'nombre y apellido',
    'nombre_y_apellido',
    'nombre',
    'apellido',
    'obs_eliminado',
    'email_personal',
    'celular_personal'
]);

/** Legacy Dynamo → clave formulario. */
const DYNAMO_TO_FICHA = {
    'nombre y apellido': 'nombre',
    nombre_y_apellido: 'nombre',
    email: 'email_personal',
    direccion: 'direccion_domicilio',
    fecha_inicio: 'fecha_ingreso',
    salario_numeros: 'sueldo_nomina',
    empresa: 'empleador',
    Descriptivo_Cinte: 'descriptivo_puesto_sig',
    whatsapp_numerico: 'celular_personal',
    whatsapp_number: 'celular_personal',
    telefono: 'telefono_fijo',
    celular: 'celular_personal',
    codigo_opt: 'codigo',
    cliente: 'cliente',
    cedula: 'cedula',
    puesto: 'puesto',
    edad: 'edad',
    tipo_contrato: 'tipo_contrato',
    salario_letras: 'ingreso_basico_letras',
    Funciones: 'funciones_puesto'
};

function isLocalSentinel(value) {
    if (isSentinel(value)) return true;
    const s = String(value).trim().toLowerCase();
    return SENTINELS.has(s);
}

function isPipelineKey(key) {
    if (PIPELINE_FIELD_LABELS[key]) return true;
    const lk = String(key).toLowerCase();
    if (lk.startsWith('ts_')) return true;
    if (lk === 'extractor_output') return true;
    return lk === 'status' || lk === 'statuses' || lk === 'documentos';
}

function mergeRowValue(row, key, value) {
    if (isLocalSentinel(value)) return;
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return;
    row[key] = value;
}

function applyLegacyDynamo(row, fullData) {
    for (const [dynamoKey, fichaKey] of Object.entries(DYNAMO_TO_FICHA)) {
        const v = fullData?.[dynamoKey];
        if (isLocalSentinel(v)) continue;
        if (fichaKey === 'fecha_ingreso') {
            const iso = parseFechaInicioSmart(v);
            mergeRowValue(row, fichaKey, iso || v);
        } else if (fichaKey === 'sueldo_nomina') {
            const n = parseSalarioCop(v);
            mergeRowValue(row, fichaKey, n != null ? n : v);
        } else {
            mergeRowValue(row, fichaKey, v);
        }
    }
}

function applyFlatDynamoPassthrough(row, fullData) {
    for (const [key, value] of Object.entries(fullData || {})) {
        if (isPipelineKey(key) || HERO_KEYS.has(key) || DYNAMO_TO_FICHA[key]) continue;
        if (isLocalSentinel(value)) continue;
        mergeRowValue(row, key, value);
    }
}

function prepareRowForStaffForm(row) {
    const out = { ...row };
    const md = { ...(out.montos_divisa || {}) };
    for (const k of MONEY_FIELD_KEYS) {
        const v = out[k];
        if (v == null || v === '') continue;
        if (typeof v === 'number' && Number.isFinite(v)) {
            md[k] = md[k] || 'COP';
            out[k] = formatMoneyAmountOnly(v, md[k]);
        }
    }
    if (out.fecha_ingreso) {
        const iso = parseFechaInicioSmart(out.fecha_ingreso);
        if (iso) out.fecha_ingreso = iso;
    }
    if (out.fecha_nacimiento) {
        const iso = parseFechaInicioSmart(out.fecha_nacimiento);
        if (iso) out.fecha_nacimiento = iso;
    }
    if (out.fecha_termino) {
        const iso = parseFechaInicioSmart(out.fecha_termino);
        if (iso) out.fecha_termino = iso;
    }
    out.montos_divisa = md;
    return out;
}

/**
 * Convierte el item Dynamo (fullData del monitor) al shape del formulario de ficha CH.
 */
export function mapDynamoToStaffForm(fullData, extras = {}) {
    const row = { ...extras };

    const extractorOut = parseExtractorOutputFromFullData(fullData);
    if (extractorOut) {
        Object.assign(row, flattenExtractorOutput(extractorOut));
    }

    applyLegacyDynamo(row, fullData);
    applyFlatDynamoPassthrough(row, fullData);

    if (!row.nombre && fullData?.nombre) {
        const n = fullData.nombre;
        const a = fullData.apellido;
        row.nombre = a ? `${n} ${a}`.trim() : String(n);
    }

    const merged = applyLegacyEmergencyParse(row);
    return mapRowToStaffForm(prepareRowForStaffForm(merged));
}

/** Entradas [label, value] para la pestaña de seguimiento del proceso En ingreso. */
export function getPipelineFieldEntries(fullData) {
    const entries = [];
    const seen = new Set();

    for (const [key, label] of Object.entries(PIPELINE_FIELD_LABELS)) {
        const value = fullData?.[key];
        if (isLocalSentinel(value)) continue;
        entries.push([label, value]);
        seen.add(key);
    }

    for (const [key, value] of Object.entries(fullData || {})) {
        if (seen.has(key) || HERO_KEYS.has(key) || DYNAMO_TO_FICHA[key]) continue;
        if (!isPipelineKey(key) || isLocalSentinel(value)) continue;
        entries.push([key.replace(/_/g, ' '), value]);
    }

    return entries;
}

export const MONITOR_PROCESO_TAB = {
    id: 'proceso_ingreso',
    title: 'Proceso En ingreso',
    shortTitle: 'En ingreso',
    masterFields: false,
    isPipelineTab: true
};
