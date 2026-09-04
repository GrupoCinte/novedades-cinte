const test = require('node:test');
const assert = require('node:assert');
const { diasHabilesTranscurridos } = require('../src/reubicaciones/reubicacionesCalendario');

// Festivos mock controlados para los tests (año 2026)
const festivosMock = new Set([
    '2026-08-07', // Viernes festivo (Batalla de Boyacá)
    '2026-08-17'  // Lunes festivo (Asunción de la Virgen)
]);

test('Día 0: fecha_fin igual a fecha_actual', () => {
    // Si la fecha actual es el mismo día en que finaliza la reubicación, ha transcurrido 0 días.
    const res = diasHabilesTranscurridos('2026-08-03', '2026-08-03', festivosMock);
    assert.strictEqual(res, 0);
});

test('Fecha futura: fecha_actual es menor a fecha_fin', () => {
    // Si la fecha fin es el 10, pero hoy es el 3, no ha transcurrido ningún día de salida
    const res = diasHabilesTranscurridos('2026-08-10', '2026-08-03', festivosMock);
    assert.strictEqual(res, 0);
});

test('Día 1: Día hábil consecutivo (lunes a martes)', () => {
    // Día 0: Lunes 3. Día 1: Martes 4.
    const res = diasHabilesTranscurridos('2026-08-03', '2026-08-04', festivosMock);
    assert.strictEqual(res, 1);
});

test('Fin de semana: Sábado y domingo no incrementan el contador (Viernes a Lunes)', () => {
    // Día 0: Viernes 31 de Julio
    // Sábado 1 (no cuenta), Domingo 2 (no cuenta)
    // Día 1: Lunes 3 de Agosto
    const res = diasHabilesTranscurridos('2026-07-31', '2026-08-03', festivosMock);
    assert.strictEqual(res, 1);
});

test('Festivo: Viernes festivo no incrementa el contador (Jueves a Lunes)', () => {
    // Día 0: Jueves 6 de Agosto
    // Viernes 7 (FESTIVO, no cuenta)
    // Sábado 8 (no cuenta), Domingo 9 (no cuenta)
    // Día 1: Lunes 10
    const res = diasHabilesTranscurridos('2026-08-06', '2026-08-10', festivosMock);
    assert.strictEqual(res, 1);
});

test('Hito 3: Jueves a Miércoles siguiente cruzando festivo', () => {
    // Día 0: Jueves 13
    // Viernes 14 (Día 1)
    // Sabado 15, Domingo 16 (no cuentan)
    // Lunes 17 (FESTIVO MOCK, no cuenta)
    // Martes 18 (Día 2)
    // Miércoles 19 (Día 3)
    const res = diasHabilesTranscurridos('2026-08-13', '2026-08-19', festivosMock);
    assert.strictEqual(res, 3);
});

test('Hito 5: Semana laboral normal de 5 días (Lunes a Lunes)', () => {
    // Día 0: Lunes 24
    // Mar 25 (1), Mie 26 (2), Jue 27 (3), Vie 28 (4)
    // Sab 29, Dom 30
    // Lunes 31 (Día 5)
    const res = diasHabilesTranscurridos('2026-08-24', '2026-08-31', festivosMock);
    assert.strictEqual(res, 5);
});

test('Hito 5 con festivo cruzado', () => {
    // Día 0: Viernes 31 Julio
    // Sab 1, Dom 2
    // Lun 3 (1), Mar 4 (2), Mie 5 (3), Jue 6 (4)
    // Vie 7 (FESTIVO, no cuenta)
    // Sab 8, Dom 9
    // Lunes 10 (Día 5)
    const res = diasHabilesTranscurridos('2026-07-31', '2026-08-10', festivosMock);
    assert.strictEqual(res, 5);
});

test('Más de 5 días: Sigue calculando sin límite artificial', () => {
    // Día 0: Lunes 24 de Agosto
    // Lun 31 de Agosto (5) -> Mar 1 Sept (6) -> Mie 2 Sept (7)
    const res = diasHabilesTranscurridos('2026-08-24', '2026-09-02', festivosMock);
    assert.strictEqual(res, 7);
});

test('Festivo + fin de semana continuo devuelve 0 si no se pisa ningún hábil', () => {
    // Día 0: Jueves 6 de Agosto
    // Vie 7 (Festivo), Sab 8, Dom 9
    // Hasta el domingo, no ha transcurrido ningún día hábil.
    const res = diasHabilesTranscurridos('2026-08-06', '2026-08-09', festivosMock);
    assert.strictEqual(res, 0);
});

test('Error al omitir el festivosSet', () => {
    assert.throws(() => {
        diasHabilesTranscurridos('2026-08-03', '2026-08-04');
    }, /Se requiere un festivosSet válido/);
});

test('CA-03 Hallazgo 1: Festivos deben ser excluidos correctamente (06/08 a 28/08)', () => {
    // Validar explícitamente que el mock incluye los festivos reportados
    assert.strictEqual(festivosMock.has('2026-08-07'), true, 'El 7 de agosto debe ser reconocido como festivo en el mock');
    assert.strictEqual(festivosMock.has('2026-08-17'), true, 'El 17 de agosto debe ser reconocido como festivo en el mock');

    // 06/08 al 28/08 debe dar 14 días con 2 festivos (7 y 17)
    const res = diasHabilesTranscurridos('2026-08-06', '2026-08-28', festivosMock);
    assert.strictEqual(res, 14);
});

test('CA-03 Hallazgo 2: La fecha_fin NO se debe contar (14/08 a 28/08)', () => {
    // 14/08 al 28/08 debe dar 9 días (el 14/08 es Día 0, 17/08 es festivo)
    const res = diasHabilesTranscurridos('2026-08-14', '2026-08-28', festivosMock);
    assert.strictEqual(res, 9);
});

test('CA-03 Regla Matemática: fecha_fin a fecha_fin === 0', () => {
    const res = diasHabilesTranscurridos('2026-08-14', '2026-08-14', festivosMock);
    assert.strictEqual(res, 0);
});
