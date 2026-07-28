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

test('POST /api/consultor/actividades/cronometro/iniciar crea temporizador activo', async () => {
    const app = createMockApp();
    const mockStore = {
        getConsultorContextByCedula: async () => ({ cliente: 'CLIENTE TEST' }),
        createManualActivity: async () => ({}),
        iniciarCronometro: async ({ cedula, descripcion }) => ({
            kind: 'started',
            activity: {
                id: 'crono-uuid-1',
                cedula,
                cliente: 'CLIENTE TEST',
                descripcion,
                inicio: new Date().toISOString(),
                fin: null,
                origen: 'cronometro',
                estado: 'pendiente'
            }
        })
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
        const res = await fetch(`http://localhost:${port}/api/consultor/actividades/cronometro/iniciar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ descripcion: 'Trabajando en desarrollo HU-3' })
        });
        const json = await res.json();
        assert.equal(res.status, 201);
        assert.equal(json.ok, true);
        assert.equal(json.actividad.descripcion, 'Trabajando en desarrollo HU-3');
        assert.equal(json.actividad.fin, null);
        assert.equal(json.actividad.origen, 'cronometro');
    } finally {
        server.close();
    }
});

test('POST /api/consultor/actividades/cronometro/iniciar rechaza con 409 si ya existe uno activo', async () => {
    const app = createMockApp();
    const mockStore = {
        getConsultorContextByCedula: async () => ({ cliente: 'CLIENTE TEST' }),
        createManualActivity: async () => ({}),
        iniciarCronometro: async () => ({ kind: 'already_active' })
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
        const res = await fetch(`http://localhost:${port}/api/consultor/actividades/cronometro/iniciar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ descripcion: 'Segundo cronómetro' })
        });
        const json = await res.json();
        assert.equal(res.status, 409);
        assert.equal(json.ok, false);
        assert.match(json.error, /Ya tienes un cronómetro en curso/i);
    } finally {
        server.close();
    }
});

test('POST /api/consultor/actividades/cronometro/detener finaliza el temporizador', async () => {
    const app = createMockApp();
    const mockStore = {
        getConsultorContextByCedula: async () => ({ cliente: 'CLIENTE TEST' }),
        createManualActivity: async () => ({}),
        detenerCronometro: async ({ cedula }) => ({
            kind: 'stopped',
            activity: {
                id: 'crono-uuid-1',
                cedula,
                cliente: 'CLIENTE TEST',
                descripcion: 'Tarea finalizada',
                inicio: new Date(Date.now() - 3600000).toISOString(),
                fin: new Date().toISOString(),
                origen: 'cronometro',
                estado: 'pendiente'
            }
        })
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
        const res = await fetch(`http://localhost:${port}/api/consultor/actividades/cronometro/detener`, {
            method: 'POST'
        });
        const json = await res.json();
        assert.equal(res.status, 200);
        assert.equal(json.ok, true);
        assert.ok(json.actividad.fin != null);
    } finally {
        server.close();
    }
});

test('POST /api/consultor/actividades/cronometro/cancelar elimina el temporizador sin guardar', async () => {
    const app = createMockApp();
    const mockStore = {
        getConsultorContextByCedula: async () => ({ cliente: 'CLIENTE TEST' }),
        createManualActivity: async () => ({}),
        cancelarCronometro: async () => ({ kind: 'cancelled' })
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
        const res = await fetch(`http://localhost:${port}/api/consultor/actividades/cronometro/cancelar`, {
            method: 'POST'
        });
        const json = await res.json();
        assert.equal(res.status, 200);
        assert.equal(json.ok, true);
        assert.match(json.mensaje, /cancelado exitosamente/i);
    } finally {
        server.close();
    }
});

test('PUT /api/consultor/actividades/:id actualiza actividad existente (happy path)', async () => {
    const app = createMockApp();
    let updateParams = null;

    const mockStore = {
        getConsultorContextByCedula: async () => ({ cliente: 'CLIENTE TEST' }),
        createManualActivity: async () => ({}),
        updateActividadPropia: async (params) => {
            updateParams = params;
            return {
                kind: 'updated',
                activity: {
                    id: params.id,
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
        const res = await fetch(`http://localhost:${port}/api/consultor/actividades/act-123`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                descripcion: 'Descripción actualizada',
                fecha: '2026-07-24',
                horaInicio: '08:00',
                horaFin: '12:00'
            })
        });
        const json = await res.json();
        assert.equal(res.status, 200);
        assert.equal(json.ok, true);
        assert.equal(json.actividad.descripcion, 'Descripción actualizada');
        assert.equal(updateParams.cedula, '123456789');
    } finally {
        server.close();
    }
});

test('PUT /api/consultor/actividades/:id retorna 404 para actividad inexistente o ajena', async () => {
    const app = createMockApp();
    const mockStore = {
        getConsultorContextByCedula: async () => ({ cliente: 'CLIENTE TEST' }),
        createManualActivity: async () => ({}),
        updateActividadPropia: async () => ({ kind: 'not_found' })
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
        const res = await fetch(`http://localhost:${port}/api/consultor/actividades/act-999`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                descripcion: 'Descripción',
                fecha: '2026-07-24',
                horaInicio: '08:00',
                horaFin: '12:00'
            })
        });
        const json = await res.json();
        assert.equal(res.status, 404);
        assert.equal(json.ok, false);
    } finally {
        server.close();
    }
});

test('DELETE /api/consultor/actividades/:id elimina actividad existente (happy path)', async () => {
    const app = createMockApp();
    let deleteParams = null;

    const mockStore = {
        getConsultorContextByCedula: async () => ({ cliente: 'CLIENTE TEST' }),
        createManualActivity: async () => ({}),
        deleteActividadPropia: async (params) => {
            deleteParams = params;
            return { kind: 'deleted' };
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
        const res = await fetch(`http://localhost:${port}/api/consultor/actividades/act-123`, {
            method: 'DELETE'
        });
        const json = await res.json();
        assert.equal(res.status, 200);
        assert.equal(json.ok, true);
        assert.equal(deleteParams.id, 'act-123');
        assert.equal(deleteParams.cedula, '123456789');
    } finally {
        server.close();
    }
});

test('DELETE /api/consultor/actividades/:id retorna 404 para actividad inexistente o ajena', async () => {
    const app = createMockApp();
    const mockStore = {
        getConsultorContextByCedula: async () => ({ cliente: 'CLIENTE TEST' }),
        createManualActivity: async () => ({}),
        deleteActividadPropia: async () => ({ kind: 'not_found' })
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
        const res = await fetch(`http://localhost:${port}/api/consultor/actividades/act-999`, {
            method: 'DELETE'
        });
        const json = await res.json();
        assert.equal(res.status, 404);
        assert.equal(json.ok, false);
    } finally {
        server.close();
    }
});
