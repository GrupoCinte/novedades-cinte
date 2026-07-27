/**
 * Parseo Zoho novedad (tipos operativos): HTML/asunto → output extractor + campos planos Dynamo.
 * Fuente de verdad para tests; snippets n8n deben mantenerse alineados.
 */

const { flattenExtractorOutput } = require('../contratacion/extractorToFichaMap');
const { normalizeChListText } = require('./chTextNormalize');

const DYNAMO_EMPTY_SENTINEL = 'nada';

function stripHtml(html) {
    return String(html || '')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractIdRegistro(bodyText, idFromSubject) {
    const fromSubject = String(idFromSubject || '').replace(/\D/g, '');
    if (fromSubject) return fromSubject;
    const m = bodyText.match(/ID\s+de\s+Registro:\s*(\d+)/i);
    return m ? m[1].trim() : '';
}

function extractCedula(bodyText) {
    const patterns = [
        /C[eé]dula(?:\s+de\s+Ciudadan[ií]a)?[^:0-9]*:\s*(\d{6,12})/i,
        /Identificaci[oó]n[^:0-9]*:\s*(\d{6,12})/i
    ];
    for (const re of patterns) {
        const m = bodyText.match(re);
        if (m) return m[1].trim();
    }
    return '';
}

function extractFechaSalida(bodyText, subject) {
    const combined = `${subject || ''} ${bodyText || ''}`;
    const patterns = [
        /Fecha de salida[^A-Za-z0-9]*([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})/i,
        /\(([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})\)/,
        /(\d{1,2}\s+de\s+[A-Za-záéíóúÁÉÍÓÚ]+\s+de\s+\d{4})/i,
        /\b([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})\b/
    ];
    for (const re of patterns) {
        const m = combined.match(re);
        if (m) return String(m[1] || m[0]).trim();
    }
    return '';
}

function extractClienteFromBody(bodyText) {
    const m = bodyText.match(
        /Cliente\s+([A-ZÁÉÍÓÚÑ0-9][A-ZÁÉÍÓÚÑ0-9\s.\-/]+?)(?:\s+Sin Dato|\s+Tarifa|\s+Consultor|\s+Cargo|$)/i
    );
    if (!m) return '';
    const c = m[1].trim();
    return c && !/^sin dato$/i.test(c) ? c : '';
}

function extractPuestoFromBody(bodyText) {
    const m = bodyText.match(
        /Cargo\s+([A-Za-zÁÉÍÓÚáéíóúñ\s]+?)(?:\s+L[ií]der|\s+Ejecutivo|\s+Fecha|$)/i
    );
    return m ? m[1].trim() : '';
}

function extractNombreConsultor(bodyText) {
    const m = bodyText.match(
        /Consultor Asignado\s+([A-Za-zÁÉÍÓÚáéíóúñ\s]+?)(?:\s+Persona Natural|\s+C[eé]dula|$)/i
    );
    return m ? m[1].trim() : '';
}

function extractDuracion(bodyText) {
    const m =
        bodyText.match(/Duraci[oó]n Total\s+([\d,.]+\s*meses?)/i) ||
        bodyText.match(/Duraci[oó]n[^0-9]{0,24}([\d,.]+\s*meses?)/i);
    return m ? m[1].trim() : '';
}

function parseClienteFromSalidaSubject(subject) {
    const s = String(subject || '');
    const m = s.match(/Notificaci[oó]n de Salida de\s+.+?\s+-\s+(.+?)\s*\(/i);
    return m ? m[1].trim() : '';
}

function parseNombreFromSalidaSubject(subject) {
    const s = String(subject || '');
    const m = s.match(/Notificaci[oó]n de Salida de\s+(.+?)\s+-\s+/i);
    return m ? m[1].trim() : '';
}

function parseNombreFromCancelacionSalidaSubject(subject) {
    const s = String(subject || '');
    const m =
        s.match(/Notificaci[oó]n de Salida de\s+(.+?)\s+-\s+/i) ||
        s.match(/Salida de\s+(.+?)\s+-\s+/i);
    return m ? m[1].trim() : '';
}

function parseClienteFromCancelacionSalidaSubject(subject) {
    const s = String(subject || '');
    const m =
        s.match(/Notificaci[oó]n de Salida de\s+.+?\s+-\s+(.+?)\s*\(/i) ||
        s.match(/Salida de\s+.+?\s+-\s+(.+?)\s*\(/i);
    return m ? m[1].trim() : '';
}

/**
 * Enriquece classify con cliente/nombre desde asunto original (case preserved).
 */
function enrichSubjectClassify({
    subject,
    tipoNovedadZoho,
    nombreAsunto,
    idRegistroZoho,
    clienteAsunto
}) {
    let nombre = nombreAsunto ? String(nombreAsunto).trim() : null;
    let cliente = clienteAsunto ? String(clienteAsunto).trim() : null;
    const idRegistro = idRegistroZoho ? String(idRegistroZoho).trim() : null;

    if (tipoNovedadZoho === 'salida' && subject) {
        if (!nombre) nombre = parseNombreFromSalidaSubject(subject) || null;
        if (!cliente) cliente = parseClienteFromSalidaSubject(subject) || null;
    }
    if (tipoNovedadZoho === 'cancelacion_salida' && subject) {
        if (!nombre) nombre = parseNombreFromCancelacionSalidaSubject(subject) || null;
        if (!cliente) cliente = parseClienteFromCancelacionSalidaSubject(subject) || null;
    }

    return {
        nombreAsunto: nombre,
        clienteAsunto: cliente,
        idRegistroZoho: idRegistro
    };
}

const CLASSIFY_PATTERNS = [
    { re: /notificacion de integracion\s+(\d+)/i, tipo: 'integracion', id: 1 },
    { re: /modificacion sobre id\s+(\d+)/i, tipo: 'modificacion_id', id: 1 },
    { re: /notificacion de extension\s*-\s*(.+?)\//i, tipo: 'extension', nombre: 1 },
    { re: /notificacion de extension\s*-\s*(.+?)\s+-\s+/i, tipo: 'extension', nombre: 1 },
    { re: /cancelacion de ingreso\s+(\d+)/i, tipo: 'cancelacion_ingreso', id: 1 },
    { re: /cancelacion\/\/notificacion de salida/i, tipo: 'cancelacion_salida' },
    { re: /notificacion de salida de\s+(.+?)\s*-/i, tipo: 'salida', nombre: 1 }
];

function parseExtensionNombreCliente(subject) {
    const s = String(subject || '');
    const slash = s.match(/Notificaci[oó]n de Extensi[oó]n\s*-\s*(.+?)\/(.+)/i);
    if (slash) {
        return {
            nombreAsunto: String(slash[1] || '').trim(),
            clienteAsunto: String(slash[2] || '').trim()
        };
    }
    const dash = s.match(/Notificaci[oó]n de Extensi[oó]n\s*-\s*(.+?)\s+-\s+(.+)/i);
    if (dash) {
        return {
            nombreAsunto: String(dash[1] || '').trim(),
            clienteAsunto: String(dash[2] || '').trim()
        };
    }
    return { nombreAsunto: null, clienteAsunto: null };
}

/**
 * Clasifica asunto Zoho (fuente de verdad compartida con n8n «Code classify Zoho novedad»).
 * @param {string} subject
 */
function classifySubject(subject) {
    const subjectStr = String(subject || '').trim();
    const subjectNorm = subjectStr
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    let tipo = null;
    let idRegistroZoho = null;
    let nombreAsunto = null;
    let clienteAsunto = null;

    for (const p of CLASSIFY_PATTERNS) {
        const m = subjectNorm.match(p.re);
        if (!m) continue;
        tipo = p.tipo;
        if (p.id) idRegistroZoho = String(m[p.id] || '').trim();
        if (p.nombre) {
            const orig = subjectStr.match(new RegExp(p.re.source, 'i'));
            nombreAsunto = orig ? String(orig[p.nombre] || '').trim() : String(m[p.nombre] || '').trim();
        }
        break;
    }

    if (tipo === 'extension') {
        const ext = parseExtensionNombreCliente(subjectStr);
        if (ext.nombreAsunto) nombreAsunto = ext.nombreAsunto;
        if (ext.clienteAsunto) clienteAsunto = ext.clienteAsunto;
    }

    const enriched = enrichSubjectClassify({
        subject: subjectStr,
        tipoNovedadZoho: tipo,
        nombreAsunto,
        idRegistroZoho,
        clienteAsunto
    });

    const debeProcesarNovedadZoho = Boolean(tipo);

    return {
        tipo,
        tipoNovedadZoho: tipo,
        idRegistroZoho: enriched.idRegistroZoho || idRegistroZoho,
        nombreAsunto: enriched.nombreAsunto || nombreAsunto,
        clienteAsunto: enriched.clienteAsunto || clienteAsunto,
        debeProcesarNovedadZoho,
        zohoNovedadPipeline: debeProcesarNovedadZoho
    };
}

/**
 * @param {{ tipo: string, subject?: string, bodyHtml?: string, bodyPreview?: string, idRegistroZoho?: string, nombreAsunto?: string, clienteAsunto?: string }} input
 */
function buildLiteExtractorOutput(input) {
    const {
        tipo,
        subject = '',
        bodyHtml = '',
        bodyPreview = '',
        idRegistroZoho = '',
        nombreAsunto = '',
        clienteAsunto = ''
    } = input || {};

    const bodyText = stripHtml(bodyHtml || bodyPreview || '');
    const idRegistro = extractIdRegistro(bodyText, idRegistroZoho);
    const cedula = extractCedula(bodyText);
    const fechaSalida = extractFechaSalida(bodyText, subject);
    const clienteBody = extractClienteFromBody(bodyText);
    const puesto = extractPuestoFromBody(bodyText);
    const nombreBody = extractNombreConsultor(bodyText);
    const nombreRaw = nombreAsunto || nombreBody || '';
    const clienteRaw = clienteAsunto || clienteBody || '';

    const output = { ID_Registro: idRegistro || '' };
    const I = {};

    if (fechaSalida && (tipo === 'salida' || tipo === 'cancelacion_salida' || tipo === 'extension')) {
        I.Fecha_Salida = fechaSalida;
    }
    if (clienteRaw) I.Cliente = normalizeChListText(clienteRaw);
    if (tipo === 'extension') {
        const dur = extractDuracion(bodyText);
        if (dur) I.Duracion = dur;
    }
    if (tipo === 'cancelacion_ingreso') {
        I.Fecha_Inicio = '';
        I.Fecha_Salida = '';
    }
    if (Object.keys(I).length) output.I_Informacion_General = I;

    const III = {};
    if (nombreRaw) III.Nombre = normalizeChListText(nombreRaw);
    if (cedula) III.Identificacion_Numero = cedula;
    if (Object.keys(III).length) output.III_Informacion_Candidato = III;

    if (puesto) {
        output.IV_Informacion_Contratacion = {
            Puesto_Cargo: normalizeChListText(puesto)
        };
    }

    return output;
}

function buildFlatFieldsFromExtractorOutput(output) {
    const flat = flattenExtractorOutput(output || {});
    const III = output?.III_Informacion_Candidato || {};
    const I = output?.I_Informacion_General || {};
    const IV = output?.IV_Informacion_Contratacion || {};

    return {
        codigo: flat.codigo || output?.ID_Registro || '',
        cedula: flat.cedula || III.Identificacion_Numero || '',
        'nombre y apellido': flat.nombre || III.Nombre || '',
        cliente: flat.cliente || I.Cliente || '',
        puesto: flat.puesto || IV.Puesto_Cargo || '',
        fecha_termino: flat.fecha_termino || ''
    };
}

function applyDynamoEmptySentinels(fields) {
    const out = { ...fields };
    for (const [key, val] of Object.entries(out)) {
        if (typeof val === 'number' && Number.isFinite(val)) continue;
        if (val == null || (typeof val === 'string' && val.trim() === '')) {
            out[key] = DYNAMO_EMPTY_SENTINEL;
        }
    }
    return out;
}

/**
 * Arma el ítem completo para Put Zoho novedad Dynamo (lite y MVP).
 */
function buildZohoDynamoItem({
    output,
    classify = {},
    item = {},
    msgId,
    executionId = '',
    zohoLiteExtract = false
}) {
    const flatRaw = buildFlatFieldsFromExtractorOutput(output);
    const idRegistro =
        (flatRaw.codigo && String(flatRaw.codigo).trim()) ||
        classify.idRegistroZoho ||
        output?.ID_Registro ||
        '';

    const parsedSubject = {
        nombre:
            flatRaw['nombre y apellido'] ||
            classify.nombreAsunto ||
            null,
        cliente: flatRaw.cliente || classify.clienteAsunto || null,
        id_registro: idRegistro || null
    };

    const dynamoFlat = applyDynamoEmptySentinels(flatRaw);

    return {
        whatsapp_number: `zoho_novedad#${msgId}`,
        record_type: 'zoho_novedad',
        pk: `zoho_novedad#${msgId}`,
        tipo_novedad: classify.tipoNovedadZoho || item.tipoNovedadZoho || '',
        id_registro: idRegistro || DYNAMO_EMPTY_SENTINEL,
        external_id: msgId,
        subject: classify.subject || item.subject || '',
        received_at:
            classify.receivedDateTime ||
            item.receivedDateTime ||
            classify.sentDateTime ||
            item.sentDateTime ||
            new Date().toISOString(),
        extractor_output: JSON.stringify(output || {}),
        parsed_subject: JSON.stringify(parsedSubject),
        status: 'pendiente_revision',
        n8n_execution_id: String(executionId),
        zoho_lite_extract: Boolean(zohoLiteExtract),
        codigo: dynamoFlat.codigo,
        cedula: dynamoFlat.cedula,
        'nombre y apellido': dynamoFlat['nombre y apellido'],
        cliente: dynamoFlat.cliente,
        puesto: dynamoFlat.puesto
    };
}

module.exports = {
    DYNAMO_EMPTY_SENTINEL,
    stripHtml,
    extractIdRegistro,
    extractCedula,
    extractFechaSalida,
    extractClienteFromBody,
    extractPuestoFromBody,
    extractNombreConsultor,
    extractDuracion,
    parseClienteFromSalidaSubject,
    parseNombreFromSalidaSubject,
    parseNombreFromCancelacionSalidaSubject,
    parseClienteFromCancelacionSalidaSubject,
    enrichSubjectClassify,
    classifySubject,
    CLASSIFY_PATTERNS,
    buildLiteExtractorOutput,
    buildFlatFieldsFromExtractorOutput,
    applyDynamoEmptySentinels,
    buildZohoDynamoItem
};
