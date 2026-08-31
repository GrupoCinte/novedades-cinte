const test = require('node:test');
const assert = require('node:assert');
const { sincronizarConPipeline } = require('../../src/reubicaciones/reubicacionesSyncService');
const { ESTADOS } = require('../../src/reubicaciones/reubicacionesEstados');

test('HU-02 Sincronización Idempotente de Reubicaciones (AUT-293)', async (t) => {
    let mockPool;
    let mockClient;
    let notifyService;
    let mockCalls = [];

    // Helper para configurar la base de datos mockeada
    const setupDB = (overrides = {}) => {
        mockClient.query = async (sql, params) => {
            mockCalls.push([sql, params]);
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
            if (sql.includes('reubicaciones_source_events') && sql.includes('FOR UPDATE')) {
                return overrides.sourceEventExists ? { rows: [{ source_event_id: 'dup' }] } : { rows: [] };
            }
            if (sql.includes('SELECT') && sql.includes('colaboradores')) {
                return overrides.colabExists === false ? { rows: [] } : { rows: [{ nombre: 'Juan', cliente: 'A', lider_catalogo: 'B' }] };
            }
            if (sql.includes('clientes_lideres')) {
                return overrides.gpExists === false ? { rows: [] } : { rows: [{ gp_user_id: 'gp123' }] };
            }
            if (sql.includes('SELECT') && sql.includes('reubicaciones_pipeline')) {
                return overrides.pipeExists ? { rows: [{ id: 'pipe1', estado: ESTADOS.EN_PROCESO, fecha_fin: '2020-01-01', tipo_ficha: 'SALIDA' }] } : { rows: [] };
            }
            if (sql.includes('INSERT INTO reubicaciones_pipeline')) {
                return { rows: [{ id: 'pipe_new' }] };
            }
            return { rows: [] };
        };
        mockPool.query = async (sql) => {
            if (sql.includes('users')) return { rows: [{ email: 'gp@cinte.com' }] };
            return { rows: [] };
        };
    };

    t.beforeEach(() => {
        mockCalls = [];
        mockClient = {
            query: async () => ({ rows: [] }),
            release: () => {}
        };
        mockPool = {
            connect: async () => mockClient,
            query: async () => ({ rows: [] })
        };
        notifyService = {
            sendEmail: async () => { notifyService.called = true; }
        };
        notifyService.called = false;
    });

    await t.test('CA-01: La primera ficha crea un único caso en el pipeline', async () => {
        setupDB();

        const res = await sincronizarConPipeline({
            cedula: '12345678',
            tipo_novedad: 'salida',
            normalized: { fecha_termino: '2050-01-01', causal: 'Renuncia voluntaria' },
            external_id: 'evt1',
            pool: mockPool
        });

        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.pipeline_id, 'pipe_new');
        assert.strictEqual(res.estado, ESTADOS.PENDIENTE);
        
        const insertPipe = mockCalls.find(c => c[0].includes('INSERT INTO reubicaciones_pipeline'));
        assert.ok(insertPipe);
        
        const insertSource = mockCalls.find(c => c[0].includes('INSERT INTO reubicaciones_source_events') && c[0].includes('DO NOTHING'));
        assert.ok(insertSource);
    });

    await t.test('CA-02: Salida con fecha de hoy queda En proceso', async () => {
        setupDB();
        const hoy = new Date().toISOString().slice(0, 10);
        
        const res = await sincronizarConPipeline({
            cedula: '12345678',
            tipo_novedad: 'salida',
            normalized: { fecha_termino: hoy, causal: 'Renuncia voluntaria' },
            external_id: 'evt2',
            pool: mockPool
        });

        assert.strictEqual(res.estado, ESTADOS.EN_PROCESO);
    });

    await t.test('CA-03/CA-04: Extensión conserva el caso, registra fecha anterior/nueva y alerta', async () => {
        setupDB({ pipeExists: true });

        const res = await sincronizarConPipeline({
            cedula: '12345678',
            tipo_novedad: 'extension',
            normalized: { fecha_termino: '2050-01-01' },
            external_id: 'evt3',
            pool: mockPool,
            notifyService
        });

        assert.strictEqual(res.es_extension, true);
        assert.strictEqual(res.estado, ESTADOS.PENDIENTE);
        
        const updateCall = mockCalls.find(c => c[0].includes('UPDATE reubicaciones_pipeline'));
        assert.ok(updateCall);
        
        const sourceEventCall = mockCalls.find(c => c[0].includes('INSERT INTO reubicaciones_source_events') && c[0].includes('DO NOTHING'));
        assert.strictEqual(sourceEventCall[1][3], '2020-01-01'); // fecha_anterior
        assert.strictEqual(sourceEventCall[1][4], '2050-01-01'); // fecha_nueva

        assert.strictEqual(notifyService.called, true);
    });

    await t.test('CA-05: Mismo source_event_id no duplica ni modifica el caso (Idempotencia)', async () => {
        setupDB({ sourceEventExists: true });

        const res = await sincronizarConPipeline({
            cedula: '12345678',
            tipo_novedad: 'salida',
            normalized: { fecha_termino: '2050-01-01', causal: 'Renuncia voluntaria' },
            external_id: 'evt_dup',
            pool: mockPool
        });

        assert.strictEqual(res.idempotent, true);
        const rollbackCall = mockCalls.find(c => c[0] === 'ROLLBACK');
        assert.ok(rollbackCall);
    });

    await t.test('CA-05: Datos incompletos dejan el caso Con Novedad con el motivo', async () => {
        setupDB({ colabExists: false });

        const res = await sincronizarConPipeline({
            cedula: '12345678',
            tipo_novedad: 'salida',
            normalized: { fecha_termino: '2050-01-01', causal: 'Renuncia voluntaria' },
            external_id: 'evt4',
            pool: mockPool
        });

        assert.strictEqual(res.estado, ESTADOS.CON_NOVEDAD);
        assert.strictEqual(res.motivo, 'Colaborador no encontrado en base de datos');
    });

    await t.test('Ficha sin fecha de término registra la novedad con todos los campos faltantes', async () => {
        setupDB();

        const res = await sincronizarConPipeline({
            cedula: '12345678',
            tipo_novedad: 'salida',
            normalized: { },
            external_id: 'evt5',
            pool: mockPool
        });

        assert.strictEqual(res.estado, ESTADOS.CON_NOVEDAD);
        assert.strictEqual(res.motivo, 'Faltan datos obligatorios: Fecha de término, Causal de salida');
    });

    await t.test('CA-06: Corrección de fecha actualiza el único caso y conserva el historial técnico', async () => {
        setupDB({ pipeExists: true });

        const res = await sincronizarConPipeline({
            cedula: '12345678',
            tipo_novedad: 'salida',
            normalized: { fecha_termino: '2050-01-03', causal: 'Renuncia voluntaria' },
            external_id: 'evt_correccion_fecha',
            pool: mockPool,
            notifyService
        });

        assert.strictEqual(res.ok, true);
        assert.strictEqual(res.pipeline_id, 'pipe1');
        assert.strictEqual(res.es_extension, true);
        assert.strictEqual(mockCalls.some(([sql]) => sql.includes('INSERT INTO reubicaciones_pipeline')), false);

        const updateCall = mockCalls.find(([sql]) => sql.includes('UPDATE reubicaciones_pipeline'));
        assert.ok(updateCall);
        assert.strictEqual(updateCall[1][0], '2050-01-03');
        assert.strictEqual(updateCall[1][7], 'pipe1');

        const sourceEventCall = mockCalls.find(([sql]) => sql.includes('INSERT INTO reubicaciones_source_events'));
        assert.ok(sourceEventCall);
        assert.deepStrictEqual(sourceEventCall[1].slice(1, 5), ['pipe1', 'salida', '2020-01-01', '2050-01-03']);
    });
});
