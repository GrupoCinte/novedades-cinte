const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand, PutCommand, DeleteCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

function getDynamoClient() {
    const region = process.env.AWS_REGION || 'us-east-1';
    const config = { region };
    if (process.env.AWS_ENDPOINT_URL_DYNAMODB || process.env.DYNAMODB_ENDPOINT) {
        config.endpoint = process.env.AWS_ENDPOINT_URL_DYNAMODB || process.env.DYNAMODB_ENDPOINT;
    }
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        config.credentials = {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {})
        };
    }
    const client = new DynamoDBClient(config);
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
        mutation PutService($client: String!, $serviceName: String!, $initDate: AWSDate!, $closingDay: Int!, $billingMode: BillingMode!, $baseHours: Int!, $billingType: BillingType!, $collabs: [String!]) {
            putService(client: $client, serviceName: $serviceName, initDate: $initDate, closingDay: $closingDay, billingMode: $billingMode, baseHours: $baseHours, billingType: $billingType, collabs: $collabs) {
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
        billingType: payloadData.billingType,
        collabs: payloadData.collabs || []
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
    
    // Try decoding composite id
    let client, serviceName;
    try {
        const decoded = Buffer.from(id, 'base64').toString('utf8');
        if (decoded.includes('|')) {
            [client, serviceName] = decoded.split('|');
        }
    } catch(e) {}

    if (client && serviceName) {
        const cmd = new GetCommand({
            TableName: TABLE_NAME,
            Key: { client, serviceName }
        });
        const { Item } = await docClient.send(cmd);
        return Item || null;
    }

    // Fallback for old UUIDs using Scan
    const cmd = new ScanCommand({
        TableName: TABLE_NAME
    });
    const { Items } = await docClient.send(cmd);
    return (Items || []).find(i => i.id === id) || null;
}

async function listServicios(deps, scope) {
    const allowedClients = await _getAllowedClients(deps, scope);
    if (!allowedClients.length) return [];

    const docClient = getDynamoClient();
    const cmd = new ScanCommand({
        TableName: TABLE_NAME
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

    return filtered.map(r => ({
        id: r.id || Buffer.from(`${r.client}|${r.serviceName}`).toString('base64'),
        client: String(r.client || '').trim(),
        serviceName: String(r.serviceName || '').trim(),
        initDate: r.initDate || '',
        closingDay: Number(r.closingDay),
        billingMode: String(r.billingMode || '').trim(),
        billingType: r.billingType ? String(r.billingType).trim() : '',
        baseHours: r.baseHours != null ? Number(r.baseHours) : null,
        consultoresCount: Array.isArray(r.collabs) ? r.collabs.length : (Array.isArray(r.consultores_asociados) ? r.consultores_asociados.length : 0),
        createdAt: r.created_at ? new Date(r.created_at) : new Date()
    }));
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

    const item = {
        client: chk.canon,
        serviceName: nombreServicio,
        initDate: initDate,
        closingDay: closingDay,
        billingMode: billingMode,
        billingType: billingType,
        baseHours: baseHours,
        collabs: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    const cmd = new PutCommand({
        TableName: TABLE_NAME,
        Item: item
    });

    // 1. Invocar la API de AppSync para registrar la programación del "profesor batch"
    await callAppSyncPutService(item);

    // 2. Insertar/Actualizar en DynamoDB
    await docClient.send(cmd);

    return {
        id: Buffer.from(`${item.client}|${item.serviceName}`).toString('base64'),
        client: item.client,
        serviceName: item.serviceName,
        initDate: item.initDate,
        closingDay: item.closingDay,
        billingMode: item.billingMode,
        billingType: item.billingType ? String(item.billingType).trim() : '',
        baseHours: item.baseHours != null ? Number(item.baseHours) : null
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
        initDate: payload.initDate || oldService.initDate || null,
        closingDay: closingDayRaw !== undefined ? Number(closingDayRaw) : (oldService.closingDay ?? null),
        billingMode: payload.billingMode || oldService.billingMode || null,
        billingType: payload.billingType || oldService.billingType || null,
        baseHours: payload.baseHours !== undefined ? payload.baseHours : (oldService.baseHours ?? null),
        collabs: oldService.collabs || [],
        created_at: oldService.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    if (oldService.consultores_asociados && (!oldService.collabs || oldService.collabs.length === 0)) {
        item.collabs = oldService.consultores_asociados.map(c => c.cedula);
    }

    const putCmd = new PutCommand({
        TableName: TABLE_NAME,
        Item: item
    });

    // 1. Invocar la API de AppSync
    await callAppSyncPutService(item);

    // 2. Insertar/Actualizar en DynamoDB
    await docClient.send(putCmd);

    return {
        id: idServicio,
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

    const service = await _getServiceById(servicioId);
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
    const collabs = service.collabs || (service.consultores_asociados ? service.consultores_asociados.map(c => c.cedula) : []);
    for (const ced of collabs) {
        asociadosMap[String(ced).trim()] = true;
    }

    return q.rows.map(r => {
        const cedStr = String(r.cedula).trim();
        const asoc = asociadosMap[cedStr];
        return {
            cedula: r.cedula,
            nombre: r.nombre,
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

    // Actualizamos el array embebido en el servicio
    oldService.collabs = Array.isArray(consultoresAsociados) ? consultoresAsociados : (consultoresAsociados?.collabs || []);
    if ('consultores_asociados' in oldService) delete oldService.consultores_asociados;
    if ('id' in oldService) delete oldService.id;
    if ('entityType' in oldService) delete oldService.entityType;
    oldService.updated_at = new Date().toISOString();

    const docClient = getDynamoClient();
    const putCmd = new PutCommand({
        TableName: TABLE_NAME,
        Item: oldService
    });

    await callAppSyncPutService(oldService);
    await docClient.send(putCmd);
    return { updated: true };
}

module.exports = {
    listServicios,
    createServicio,
    updateServicio,
    deleteServicio,
    listServicioConsultores,
    upsertServicioConsultores
};
