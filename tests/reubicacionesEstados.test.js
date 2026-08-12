const test = require('node:test');
const assert = require('node:assert');
const { calcularEstado, ESTADOS, contarDiasHabilesColombia } = require('../src/reubicaciones/reubicacionesEstados');

test('CA-01: fecha futura → Pendiente', () => {
    const resultado = calcularEstado({
        fecha_fin: '2026-08-17',
        cliente_destino: 'Cliente X',
        causal: 'Cambio de cliente',
        gp_user_id: '11111111-1111-4111-8111-111111111111',
        colaborador_existe: true
    }, null, new Date('2026-08-12'));
    assert.strictEqual(resultado.estado, ESTADOS.PENDIENTE);
    assert.strictEqual(resultado.motivo, null);
});

test('CA-02: fecha hoy → En proceso, día 0', () => {
    const resultado = calcularEstado({
        fecha_fin: '2026-08-12',
        cliente_destino: 'Cliente X',
        causal: 'Cambio de cliente',
        gp_user_id: '11111111-1111-4111-8111-111111111111',
        colaborador_existe: true
    }, null, new Date('2026-08-12'));
    assert.strictEqual(resultado.estado, ESTADOS.EN_PROCESO);
    assert.strictEqual(resultado.diasTranscurridos, 0);
});

test('CA-03: días hábiles Colombia excluye sábado, domingo y feriados', () => {
    const dias = contarDiasHabilesColombia('2026-06-26', '2026-06-30');
    assert.strictEqual(dias, 2);
});

test('CA-04: el conteo de días hábiles no incluye fines de semana ni feriados', () => {
    const fechaHoy = new Date('2026-08-10');
    const cuatro = calcularEstado({
        fecha_fin: '2026-08-03',
        cliente_destino: 'Cliente X',
        causal: 'Cambio de cliente',
        gp_user_id: '11111111-1111-4111-8111-111111111111',
        colaborador_existe: true
    }, null, fechaHoy);
    const cinco = calcularEstado({
        fecha_fin: '2026-08-01',
        cliente_destino: 'Cliente X',
        causal: 'Cambio de cliente',
        gp_user_id: '11111111-1111-4111-8111-111111111111',
        colaborador_existe: true
    }, null, fechaHoy);
    assert.strictEqual(cuatro.estado, ESTADOS.EN_PROCESO);
    assert.strictEqual(cuatro.diasTranscurridos, 4);
    assert.strictEqual(cinco.diasTranscurridos, 5);
});

test('CA-05/CA-06: Con novedad solo por datos faltantes o inconsistentes', () => {
    const sinGp = calcularEstado({
        fecha_fin: '2026-07-30',
        cliente_destino: 'Cliente X',
        causal: 'Cambio de cliente',
        gp_user_id: null,
        colaborador_existe: true
    }, null, new Date('2026-08-10'));
    const fechaInvalida = calcularEstado({
        fecha_fin: null,
        cliente_destino: 'Cliente X',
        causal: 'Cambio de cliente',
        gp_user_id: '11111111-1111-4111-8111-111111111111',
        colaborador_existe: true
    }, null, new Date('2026-08-10'));
    const fechaVencidaValida = calcularEstado({
        fecha_fin: '2026-08-06',
        cliente_destino: 'Cliente X',
        causal: 'Cambio de cliente',
        gp_user_id: '11111111-1111-4111-8111-111111111111',
        colaborador_existe: true
    }, null, new Date('2026-08-10'));

    assert.strictEqual(sinGp.estado, ESTADOS.CON_NOVEDAD);
    assert.strictEqual(fechaInvalida.estado, ESTADOS.CON_NOVEDAD);
    assert.strictEqual(fechaVencidaValida.estado, ESTADOS.EN_PROCESO);
});

test('CA-07: después del día 5 sigue activo hasta inhabilitación manual', () => {
    const resultado = calcularEstado({
        fecha_fin: '2026-07-31',
        cliente_destino: 'Cliente X',
        causal: 'Cambio de cliente',
        gp_user_id: '11111111-1111-4111-8111-111111111111',
        colaborador_existe: true
    }, null, new Date('2026-08-10'));

    assert.strictEqual(resultado.estado, ESTADOS.EN_PROCESO);
    assert.ok(resultado.diasTranscurridos >= 5);
});