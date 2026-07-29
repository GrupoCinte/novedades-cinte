const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { registerActividadesRoutes, parseBogotaDateTime } = require('../src/actividades/registerActividadesRoutes');

function createMockApp() {
    const app = express();
    app.use(express.json());
    return app;
}

const mockVerificarToken = (req, _res, next) => {
    req.user = { cedula: '123456789', role: 'consultor' };
    next();
};

const mockRequireEntraConsultor = (_req, _res, next) => {
    next();
};

test('parseBogotaDateTime convierte fecha y hora Bogota correctamente', () => {
    const dateObj = parseBogotaDateTime('2026-07-24', '14:30');
    assert.ok(dateObj instanceof Date);
    assert.equal(dateObj.toISOString(), '2026-07-24T19:30:00.000Z');

    const invalid = parseBogotaDateTime('2026-02-30', '14:30');
    assert.equal(invalid, null);
});

test('GET /api/consultor/actividades/context retorna cliente asignado', async () => {
    const app = createMockApp();
    const mockStore = {
        getConsultorContextByCedula: async (cedula) => {
            if (cedula === '123456789') return { cedula, cliente: 'CLIENTE TEST' };
            return null;
        },
        createManualActivity: async () => ({})
    };

    registerActividadesRoutes({
        app,
        verificarToken: mockVerificarToken,
        requireEntraConsultor: mockRequireEntraConsultor,
        actividadesStore: mockStore
    });

    const server = app.listen(0);
    const port = server.address().port;

    try {
        const res = await fetch(`http://localhost:${port}/api/consultor/actividades/context`);
        const json = await res.json();
        assert.equal(res.status, 200);
        assert.equal(json.ok, true);
        assert.equal(json.cliente, 'CLIENTE TEST');
    } finally {
        server.close();
    }
});

test('POST /api/consultor/actividades valida fin menor o igual a inicio', async () => {
    const app = createMockApp();
    const mockStore = {
        getConsultorContextByCedula: async () => ({ cliente: 'CLIENTE TEST' }),
        createManualActivity: async () => ({})
    };

    registerActividadesRoutes({
        app,
        verificarToken: mockVerificarToken,
        requireEntraConsultor: mockRequireEntraConsultor,
        actividadesStore: mockStore
    });

    const server = app.listen(0);
    const port = server.address().port;

    try {
        const res = await fetch(`http://localhost:${port}/api/consultor/actividades`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                descripcion: 'Reunión de avance',
                fecha: '2026-07-24',
                horaInicio: '10:00',
                horaFin: '09:00'
            })
        });
        const json = await res.json();
        assert.equal(res.status, 400);
        assert.equal(json.ok, false);
        assert.match(json.error, /hora de fin debe ser mayor/i);
    } finally {
        server.close();
    }
});

test('POST /api/consultor/actividades crea entrada correctamente', async () => {
    const app = createMockApp();
    let activityParams = null;

    const mockStore = {
        getConsultorContextByCedula: async () => ({ cliente: 'CLIENTE TEST' }),
        createManualActivity: async (params) => {
            activityParams = params;
            return {
                kind: 'created',
                activity: {
                    id: 'act-uuid-1',
                    cedula: params.cedula,
                    cliente: 'CLIENTE TEST',
                    descripcion: params.descripcion,
                    inicio: params.inicio,
                    fin: params.fin,
                    origen: 'manual',
                    estado: 'pendiente'
                }
            };
        }
    };

    registerActividadesRoutes({
        app,
        verificarToken: mockVerificarToken,
        requireEntraConsultor: mockRequireEntraConsultor,
        actividadesStore: mockStore
    });

    const server = app.listen(0);
    const port = server.address().port;

    try {
        const res = await fetch(`http://localhost:${port}/api/consultor/actividades`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                descripcion: 'Desarrollo de HU-2',
                fecha: '2026-07-24',
                horaInicio: '08:00',
                horaFin: '12:00'
            })
        });
        const json = await res.json();
        assert.equal(res.status, 201);
        assert.equal(json.ok, true);
        assert.equal(json.actividad.descripcion, 'Desarrollo de HU-2');
        assert.equal(activityParams.cedula, '123456789');
    } finally {
        server.close();
    }
});
