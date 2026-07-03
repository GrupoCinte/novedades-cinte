const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { buildDynamoLowLevelClientConfig } = require('../contratacion/awsDynamoClientConfig');

function getDynamoClient() {
    const client = new DynamoDBClient(buildDynamoLowLevelClientConfig());
    return DynamoDBDocumentClient.from(client);
}

const TABLE_NAME = process.env.DYNAMODB_TABLE_SERVICIOS || 'services';

// --- Dependencia inyectada dinámicamente para reutilizar auth ---
async function _getAllowedClients(deps, scope) {
    // Importación dinámica para evitar ciclos
    const { listConciliacionesClientes } = require('./conciliacionesQueries');
    return await listConciliacionesClientes(deps, scope);
}

// --- Helper para invocar GraphQL AppSync ---
async function callAppSyncPutService(payloadData) {
    const endpoint = process.env.APPSYNC_GRAPHQL_ENDPOINT;
    const apiKey = process.env.APPSYNC_API_KEY;
    if (!endpoint || !apiKey) {
        console.warn('No hay APPSYNC_GRAPHQL_ENDPOINT o APPSYNC_API_KEY en .env. Se omite llamada a API externa.');
        return null;
    }

    const query = `
        mutation PutService($client: String!, $serviceName: String!, $initDate: AWSDate!, $closingDay: Int!, $billingMode: BillingMode!, $baseHours: Int!, $billingType: BillingType!) {
            putService(client: $client, serviceName: $serviceName, initDate: $initDate, closingDay: $closingDay, billingMode: $billingMode, baseHours: $baseHours, billingType: $billingType) {
                success
            }
        }
    `;

    const variables = {
        client: payloadData.client,
        serviceName: payloadData.serviceName,
        initDate: payloadData.initDate,
        closingDay: Number(payloadData.closingDay),
        billingMode: payloadData.billingMode,
        baseHours: Number(payloadData.baseHours),
        billingType: payloadData.billingType
    };

    console.log('Enviando mutación a AppSync:', variables);
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            },
            body: JSON.stringify({ query, variables })
        });
        const json = await response.json();
        if (json.errors) {
            console.error('Errores de AppSync:', json.errors);
        }
        return json;
    } catch (err) {
        console.error('Error llamando a AppSync:', err);
    }
}

/**
 * Busca un servicio por su UUID recorriendo el GSI. 
 * Ya que los updates/deletes son infrecuentes y el número de servicios es manejable,
 * usar el GSI es más eficiente que no poder operar por ID.
 */
async function _getServiceById(id) {
    const docClient = getDynamoClient();
    const cmd = new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'TipoEntidad',
        KeyConditionExpression: 'entityType = :entityType',
        ExpressionAttributeValues: {
            ':entityType': 'SERVICIO'
        }
    });
    const { Items } = await docClient.send(cmd);
    return (Items || []).find(i => i.id === id) || null;
}

async function _listAllServicioItems() {
    const docClient = getDynamoClient();
    const cmd = new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'TipoEntidad',
        KeyConditionExpression: 'entityType = :entityType',
        ExpressionAttributeValues: {
            ':entityType': 'SERVICIO'
        }
    });
    const { Items } = await docClient.send(cmd);
    return Items || [];
}

function _normalizeCedulaKey(cedula) {
    return String(cedula || '').replace(/\D/g, '');
}

function _serviciosMismoCliente(items, clienteCanon) {
    const canon = String(clienteCanon || '').trim().toLowerCase();
    return (items || []).filter(
        (i) =>
            String(i.entityType || '') === 'SERVICIO' &&
            String(i.client || '').trim().toLowerCase() === canon
    );
}

function _cedulasAsociadasServicio(service) {
    const set = new Set();
    for (const a of service?.consultores_asociados || []) {
        const k = _normalizeCedulaKey(a?.cedula);
        if (k) set.add(k);
    }
    return set;
}

/** Cédulas ya asignadas a otro servicio del mismo cliente (excluye servicioId). */
function _cedulasOcupadasEnOtrosServicios(serviciosCliente, servicioId) {
    const ocupadas = new Set();
    for (const svc of serviciosCliente || []) {
        if (svc.id === servicioId) continue;
        for (const k of _cedulasAsociadasServicio(svc)) ocupadas.add(k);
    }
    return ocupadas;
}

async function _desasociarCedulasDeOtrosServicios(docClient, serviciosCliente, servicioId, cedulaKeys) {
    const keys = cedulaKeys instanceof Set ? cedulaKeys : new Set(cedulaKeys || []);
    if (!keys.size) return;

    for (const svc of serviciosCliente || []) {
        if (svc.id === servicioId) continue;
        const antes = Array.isArray(svc.consultores_asociados) ? svc.consultores_asociados : [];
        const despues = antes.filter((a) => !keys.has(_normalizeCedulaKey(a?.cedula)));
        if (despues.length === antes.length) continue;
        svc.consultores_asociados = despues;
        svc.updated_at = new Date().toISOString();
        await docClient.send(
            new PutCommand({
                TableName: TABLE_NAME,
                Item: svc
            })
        );
    }
}

async function listServicios(deps, scope) {
    const allowedClients = await _getAllowedClients(deps, scope);
    if (!allowedClients.length) return [];

    const docClient = getDynamoClient();
    const cmd = new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'TipoEntidad',
        KeyConditionExpression: 'entityType = :entityType',
        ExpressionAttributeValues: {
            ':entityType': 'SERVICIO'
        }
    });
    
    const { Items } = await docClient.send(cmd);
    
    // Filtrar por clientes permitidos y mapear al formato del frontend
    const lowerAllowed = new Set(allowedClients.map(c => c.toLowerCase()));
    
    const filtered = (Items || []).filter(item => {
        const c = String(item.client || '').toLowerCase();
        return lowerAllowed.has(c);
    });

    // Ordenar por created_at desc (como en PostgreSQL)
    filtered.sort((a, b) => {
        const tA = new Date(a.created_at || 0).getTime();
        const tB = new Date(b.created_at || 0).getTime();
        return tB - tA;
    });

    return filtered.map(r => {
        const asociados = Array.isArray(r.consultores_asociados) ? r.consultores_asociados : [];
        return {
            id: r.id,
            client: String(r.client || '').trim(),
            serviceName: String(r.serviceName || '').trim(),
            initDate: r.initDate || '',
            closingDay: Number(r.closingDay),
            billingMode: String(r.billingMode || '').trim(),
            billingType: r.billingType ? String(r.billingType).trim() : '',
            baseHours: r.baseHours != null ? Number(r.baseHours) : null,
            consultoresCount: asociados.length,
            consultoresCedulas: asociados.map((a) => String(a.cedula || '').trim()).filter(Boolean),
            createdAt: r.created_at ? new Date(r.created_at) : new Date()
        };
    });
}

async function createServicio(deps, scope, payload) {
    const { randomUUID } = require('crypto');
    const docClient = getDynamoClient();
    
    const cliente = payload.client;
    const nombreServicio = payload.serviceName;
    const initDate = payload.initDate;
    const closingDayRaw = payload.closingDay;
    const billingMode = payload.billingMode;
    const billingType = payload.billingType;
    const baseHours = payload.baseHours;

    const closingDay = Number(closingDayRaw);
    if (isNaN(closingDay) || closingDay < 1 || closingDay > 31) {
        const error = new Error('El día de cierre debe ser un número entero entre 1 y 31');
        error.status = 400;
        throw error;
    }

    const { assertClienteConciliacionPermitido } = require('./conciliacionesQueries');
    const chk = await assertClienteConciliacionPermitido(deps, scope, cliente);
    if (!chk.ok) {
        const error = new Error(chk.error || 'No autorizado para este cliente');
        error.status = chk.status || 403;
        throw error;
    }

    const newId = randomUUID();
    const item = {
        client: chk.canon,
        serviceName: nombreServicio,
        entityType: 'SERVICIO',
        id: newId,
        initDate: initDate,
        closingDay: closingDay,
        billingMode: billingMode,
        billingType: billingType,
        baseHours: baseHours,
        consultores_asociados: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    const cmd = new PutCommand({
        TableName: TABLE_NAME,
        Item: item
    });

    // 1. Invocar la API de AppSync para registrar la programación del "profesor batch"
    await callAppSyncPutService(item);

    // 2. Insertar/Actualizar en DynamoDB para garantizar que nuestro frontend tenga los campos id y entityType (GSI)
    await docClient.send(cmd);

    return {
        id: item.id,
        client: item.client,
        serviceName: item.serviceName,
        initDate: item.initDate,
        closingDay: item.closingDay,
        billingMode: item.billingMode,
        billingType: item.billingType ? String(item.billingType).trim() : '',
        baseHours: item.baseHours != null ? Number(item.baseHours) : null,
        consultoresCount: 0
    };
}

async function updateServicio(deps, scope, idServicio, payload) {
    const { assertClienteConciliacionPermitido } = require('./conciliacionesQueries');
    
    // Buscar viejo servicio para validación y eliminación si cambia la PK/SK
    const oldService = await _getServiceById(idServicio);
    if (!oldService) {
        const err = new Error('Servicio no encontrado');
        err.status = 404;
        throw err;
    }

    const chkOld = await assertClienteConciliacionPermitido(deps, scope, oldService.client);
    if (!chkOld.ok) {
        const error = new Error('No autorizado para modificar este servicio');
        error.status = 403;
        throw error;
    }

    const cliente = payload.client;
    const nombreServicio = payload.serviceName;
    
    const chkNew = await assertClienteConciliacionPermitido(deps, scope, cliente);
    if (!chkNew.ok) {
        const error = new Error('No autorizado para asignar a este nuevo cliente');
        error.status = 403;
        throw error;
    }

    const docClient = getDynamoClient();

    // Si la Partition Key o Sort Key cambia, en DynamoDB NO se puede actualizar, se debe borrar y recrear.
    if (oldService.client !== chkNew.canon || oldService.serviceName !== nombreServicio) {
        const delCmd = new DeleteCommand({
            TableName: TABLE_NAME,
            Key: {
                client: oldService.client,
                serviceName: oldService.serviceName
            }
        });
        await docClient.send(delCmd);
    }

    const closingDayRaw = payload.closingDay !== undefined ? payload.closingDay : undefined;
    const item = {
        client: chkNew.canon,
        serviceName: nombreServicio,
        entityType: 'SERVICIO',
        id: idServicio,
        initDate: payload.initDate || oldService.initDate || null,
        closingDay: closingDayRaw !== undefined ? Number(closingDayRaw) : (oldService.closingDay ?? null),
        billingMode: payload.billingMode || oldService.billingMode || null,
        billingType: payload.billingType || oldService.billingType || null,
        baseHours: payload.baseHours !== undefined ? payload.baseHours : (oldService.baseHours ?? null),
        consultores_asociados: oldService.consultores_asociados || [],
        created_at: oldService.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    const putCmd = new PutCommand({
        TableName: TABLE_NAME,
        Item: item
    });

    // 1. Invocar la API de AppSync
    await callAppSyncPutService(item);

    // 2. Insertar/Actualizar en DynamoDB
    await docClient.send(putCmd);

    return {
        id: item.id,
        client: item.client,
        serviceName: item.serviceName,
        initDate: item.initDate,
        closingDay: item.closingDay,
        billingMode: item.billingMode,
        billingType: item.billingType ? String(item.billingType).trim() : '',
        baseHours: item.baseHours != null ? Number(item.baseHours) : null
    };
}

async function deleteServicio(deps, scope, idServicio) {
    const { assertClienteConciliacionPermitido } = require('./conciliacionesQueries');
    
    const oldService = await _getServiceById(idServicio);
    if (!oldService) {
        const err = new Error('Servicio no encontrado');
        err.status = 404;
        throw err;
    }

    const chk = await assertClienteConciliacionPermitido(deps, scope, oldService.client);
    if (!chk.ok) {
        const error = new Error('No autorizado para eliminar este servicio');
        error.status = 403;
        throw error;
    }

    const docClient = getDynamoClient();
    const delCmd = new DeleteCommand({
        TableName: TABLE_NAME,
        Key: {
            client: oldService.client,
            serviceName: oldService.serviceName
        }
    });

    await docClient.send(delCmd);
    return { success: true };
}

async function listServicioConsultores(deps, scope, servicioId) {
    const { pool } = deps;
    const { assertClienteConciliacionPermitido } = require('./conciliacionesQueries');

    const allServicios = await _listAllServicioItems();
    const service = allServicios.find((i) => i.id === servicioId) || null;
    if (!service) {
        const err = new Error('Servicio no encontrado');
        err.status = 404;
        throw err;
    }

    const chk = await assertClienteConciliacionPermitido(deps, scope, service.client);
    if (!chk.ok) {
        const error = new Error(chk.error || 'No autorizado');
        error.status = chk.status || 403;
        throw error;
    }

    // Obtenemos los activos actuales en Postgres (directorio fuente)
    const q = await pool.query(
        `SELECT c.cedula, c.nombre, c.tarifa_cliente, c.costo_empresa, c.moneda
         FROM colaboradores c
         WHERE c.activo IS NOT FALSE
           AND lower(btrim(COALESCE(c.cliente, ''))) = lower(btrim($1::text))
         ORDER BY c.nombre ASC`,
        [chk.canon]
    );

    const asociadosMap = {};
    for (const asc of service.consultores_asociados || []) {
        asociadosMap[String(asc.cedula).trim()] = asc;
    }

    const serviciosCliente = _serviciosMismoCliente(allServicios, chk.canon);
    const ocupadasEnOtros = _cedulasOcupadasEnOtrosServicios(serviciosCliente, servicioId);

    return q.rows
        .filter((r) => {
            const cedStr = String(r.cedula).trim();
            if (asociadosMap[cedStr]) return true;
            return !ocupadasEnOtros.has(_normalizeCedulaKey(r.cedula));
        })
        .map((r) => {
        const cedStr = String(r.cedula).trim();
        const asoc = asociadosMap[cedStr];
        return {
            cedula: r.cedula,
            nombre: r.nombre,
            licencias: asoc ? asoc.licencias : '',
            equipo: asoc ? asoc.equipo : '',
            otrasDotaciones: asoc ? asoc.otras_dotaciones : '',
            tarifaCliente: r.tarifa_cliente != null ? Number(r.tarifa_cliente) : null,
            costoCinte: r.costo_empresa != null ? Number(r.costo_empresa) : null,
            moneda: r.moneda ? String(r.moneda).trim() : 'COP',
            asociado: Boolean(asoc)
        };
    });
}

async function upsertServicioConsultores(deps, scope, servicioId, consultoresAsociados) {
    const { assertClienteConciliacionPermitido } = require('./conciliacionesQueries');

    const oldService = await _getServiceById(servicioId);
    if (!oldService) {
        const err = new Error('Servicio no encontrado');
        err.status = 404;
        throw err;
    }

    const chk = await assertClienteConciliacionPermitido(deps, scope, oldService.client);
    if (!chk.ok) {
        const error = new Error(chk.error || 'No autorizado');
        error.status = chk.status || 403;
        throw error;
    }

    const docClient = getDynamoClient();

    const nuevasCedulas = new Set(
        (consultoresAsociados || []).map((c) => _normalizeCedulaKey(c?.cedula)).filter(Boolean)
    );

    const allServicios = await _listAllServicioItems();
    const serviciosCliente = _serviciosMismoCliente(allServicios, oldService.client);

    // Un consultor solo puede pertenecer a un servicio por cliente: quitar de los demás.
    await _desasociarCedulasDeOtrosServicios(docClient, serviciosCliente, servicioId, nuevasCedulas);

    // Actualizamos el array embebido en el servicio
    oldService.consultores_asociados = consultoresAsociados.map(c => ({
        cedula: c.cedula,
        licencias: c.licencias ?? null,
        equipo: c.equipo ?? null,
        otras_dotaciones: (c.otrasDotaciones !== undefined ? c.otrasDotaciones : c.otras_dotaciones) ?? null
    }));
    oldService.updated_at = new Date().toISOString();

    const putCmd = new PutCommand({
        TableName: TABLE_NAME,
        Item: oldService
    });

    await docClient.send(putCmd);
    return { updated: true };
}

module.exports = {
    listServicios,
    createServicio,
    updateServicio,
    deleteServicio,
    listServicioConsultores,
    upsertServicioConsultores,
    // Helpers expuestos para tests de exclusividad
    _normalizeCedulaKey,
    _serviciosMismoCliente,
    _cedulasAsociadasServicio,
    _cedulasOcupadasEnOtrosServicios
};
