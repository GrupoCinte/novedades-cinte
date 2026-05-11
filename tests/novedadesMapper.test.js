const test = require('node:test');
const assert = require('node:assert/strict');
const { toClientNovedad } = require('../src/novedadesMapper');

test('toClientNovedad separa soporte local y decodifica campos', () => {
  const out = toClientNovedad({
    id: '1',
    nombre: 'JosÃ©',
    correo_solicitante: 'u@x.com',
    cliente: 'Cliente',
    lider: 'Lider',
    tipo_novedad: 'Incapacidad',
    fecha: new Date('2026-01-02T00:00:00.000Z'),
    cantidad_horas: 4,
    soporte_ruta: '/assets/uploads/a.pdf',
    estado: 'Pendiente',
    creado_en: new Date('2026-01-01T00:00:00.000Z'),
  });
  assert.equal(out.nombre, 'José');
  assert.equal(out.soporteRuta, '/assets/uploads/a.pdf');
  assert.equal(out.soporteKey, '');
  assert.equal(out.cantidadHoras, 4);
});

test('toClientNovedad parsea múltiples soportes JSON', () => {
  const out = toClientNovedad({
    id: '2',
    tipo_novedad: 'Hora Extra',
    soporte_ruta: JSON.stringify(['k1', 'k2']),
    estado: 'Pendiente',
    creado_en: new Date('2026-01-01T00:00:00.000Z'),
  });
  assert.deepEqual(out.soportes, ['k1', 'k2']);
  assert.equal(out.soporteKey, 'k1');
});
