const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { mapDynamoItemToExecution } = require('./utils/mappers');
const { scanAllItems, queryAllItems } = require('./utils/dynamoPaged');
const { validate, validateQuery } = require('./middleware/validate');
const { emailQuerySchema } = require('./schemas/users');
const { eliminarCandidatoSchema } = require('./schemas/eliminarCandidato');
const { signContratacionWsTicket } = require('./wsTicket');

function buildKpiBaseline() {
    return {
        humanProcessTimeMinutes: Number(process.env.KPI_HUMAN_PROCESS_TIME_MINUTES || 783.5),
        humanHourCostCop: Number(process.env.KPI_HUMAN_HOUR_COST_COP || 20000),
        autoCostUsd: Number(process.env.KPI_AUTO_COST_USD || 0.45),
        trmCop: Number(process.env.KPI_TRM_COP || 4200)
    };
}

function createDynamoDocClient() {
    const awsRegion = process.env.AWS_REGION || 'us-east-1';
    const clientConfig = { region: awsRegion };
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        clientConfig.credentials = {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {})
        };
    }
    const client = new DynamoDBClient(clientConfig);
    return DynamoDBDocumentClient.from(client);
}

function registerContratacionRoutes(deps) {
    const {
        app,
        verificarToken,
        allowPanel,
        allowRoles,
        contratacionMonitorLimiter,
        contratacionUsersByEmailLimiter,
        contratacionEliminarLimiter,
        contratacionWsTokenLimiter,
        wsSecret,
        wsTicketTtlSec
    } = deps;

    const tableName = (process.env.DYNAMODB_TABLE_NAME || '').trim();
    const gsiName = process.env.DYNAMODB_GSI_NAME || 'email';
    const configured = Boolean(tableName);
    const docClient = configured ? createDynamoDocClient() : null;
    const kpi = buildKpiBaseline();

    const guard = [verificarToken, allowPanel('contratacion')];

    function notConfigured(res) {
        return res.status(503).json({
            success: false,
            message: 'Módulo Contratación: DYNAMODB_TABLE_NAME no configurada en el servidor.'
        });
    }

    app.get('/api/contratacion/monitor', ...guard, contratacionMonitorLimiter, async (req, res) => {
        if (!configured || !docClient) return notConfigured(res);
        try {
            const items = await scanAllItems(docClient, tableName);
            const executions = items.map(mapDynamoItemToExecution);
            return res.json({
                success: true,
                count: executions.length,
                executions,
                meta: {
                    region: process.env.AWS_REGION || 'us-east-1',
                    dynamoScanItemCount: items.length
                }
            });
        } catch (error) {
            console.error('Contratación GET /monitor:', error.message);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch monitoring data',
                message: error.message
            });
        }
    });

    app.get('/api/contratacion/users-by-email', ...guard, contratacionUsersByEmailLimiter, validateQuery(emailQuerySchema), async (req, res) => {
        if (!configured || !docClient) return notConfigured(res);
        try {
            const { email } = req.query;
            const queryInput = {
                TableName: tableName,
                IndexName: gsiName,
                KeyConditionExpression: 'email = :emailValue',
                ExpressionAttributeValues: {
                    ':emailValue': email
                },
                ProjectionExpression: 'nombre_y_apellido, #nya, email, edad, puesto, #st',
                ExpressionAttributeNames: {
                    '#st': 'status',
                    '#nya': 'nombre y apellido'
                }
            };

            const items = await queryAllItems(docClient, queryInput);

            const safeUsers = items.map((user) => ({
                email: user.email,
                nombre_y_apellido: user.nombre_y_apellido ?? user['nombre y apellido'],
                puesto: user.puesto,
                status: user.status,
                edad: user.edad
            }));

            return res.json({
                success: true,
                count: safeUsers.length,
                users: safeUsers
            });
        } catch (error) {
            console.error('Contratación users-by-email:', error.message);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch user data',
                message: error.message
            });
        }
    });

    app.get('/api/contratacion/monitor-config', ...guard, contratacionMonitorLimiter, (req, res) => {
        return res.json({
            success: true,
            kpi
        });
    });

    app.get('/api/contratacion/ws-token', ...guard, contratacionWsTokenLimiter, (req, res) => {
        if (!wsSecret) {
            return res.status(503).json({ success: false, message: 'WebSocket no configurado (secreto ausente).' });
        }
        const ticket = signContratacionWsTicket({ wsSecret, ttlSec: wsTicketTtlSec }, req.user);
        if (!ticket) {
            return res.status(403).json({ success: false, message: 'No se pudo emitir ticket WS.' });
        }
        return res.json({ success: true, ticket });
    });

    app.get('/api/contratacion/health', ...guard, contratacionMonitorLimiter, (req, res) => {
        return res.json({
            success: true,
            dynamoConfigured: configured,
            streamPollerFlag: String(process.env.CONTRATACION_STREAM_POLLER_ENABLED || '').toLowerCase() === 'true',
            timestamp: new Date().toISOString()
        });
    });

    app.post(
        '/api/contratacion/eliminar-candidato',
        ...guard,
        allowRoles(['super_admin', 'admin_ch']),
        contratacionEliminarLimiter,
        validate(eliminarCandidatoSchema),
        async (req, res) => {
            if (!configured || !docClient) return notConfigured(res);
            try {
                const { executionId, obs_eliminado } = req.body;
                const ts = new Date().toISOString();

                const command = new UpdateCommand({
                    TableName: tableName,
                    Key: { whatsapp_number: executionId },
                    UpdateExpression: 'SET #st = :st, obs_eliminado = :obs, ts_eliminado = :ts',
                    ExpressionAttributeNames: { '#st': 'status' },
                    ExpressionAttributeValues: {
                        ':st': 'eliminado',
                        ':obs': obs_eliminado,
                        ':ts': ts
                    },
                    ConditionExpression: 'attribute_exists(whatsapp_number)',
                    ReturnValues: 'ALL_NEW'
                });

                const out = await docClient.send(command);
                const execution = mapDynamoItemToExecution(out.Attributes);

                return res.json({
                    success: true,
                    execution
                });
            } catch (error) {
                if (error.name === 'ConditionalCheckFailedException') {
                    return res.status(404).json({
                        success: false,
                        message: 'No se encontró el candidato (whatsapp_number).'
                    });
                }
                console.error('Contratación eliminar-candidato:', error.message);
                return res.status(500).json({
                    success: false,
                    message: error.message || 'No se pudo actualizar el registro.'
                });
            }
        }
    );
}

module.exports = { registerContratacionRoutes };
