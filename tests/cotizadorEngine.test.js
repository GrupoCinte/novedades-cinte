/**
 * @file cotizadorEngine.test.js
 * @description Pruebas unitarias del motor de cálculo del cotizador.
 *              Cubre lógica financiera crítica: SS, prestaciones, tarifas, monedas y dashboard.
 */
const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const {
    calcularSsDinamico,
    calcularPrestacionesDinamico,
    calcularCotizacion,
    generarDashboardData,
} = require('../src/cotizador/cotizadorEngine');

// ─── Helpers ─────────────────────────────────────────────────────────────────
const SMMLV = 1_423_500;     // 2025 Colombia
const AUX_TRANSPORTE = 200_000;

function round2(v) { return Number(Number(v).toFixed(2)); }

// Catálogo mínimo para pruebas de calcularCotizacion
function makeCatalogos(overrides = {}) {
    return {
        parametros: {
            smmlv: SMMLV,
            aux_transporte_legal: AUX_TRANSPORTE,
            dotacion: 160_000,
            dias_mes: 20,
            horas_dia: 9,
            margen_minimo: 0,
            tasas: { '45': 0.02, '30': 0.015 },
            monedas: {
                USD: { tasa: 4_100 },
                CLP: { tasa: 0.0013 }
            }
        },
        cargos: [
            {
                cargo: 'Analista Junior',
                salario: 2_000_000,
                auxilios: 100_000,
                plan_compl: 50_000,
                aux_transporte: AUX_TRANSPORTE,
                ss: 500_000,
                prestaciones: 400_000,
                equipo_tipo: '1'
            },
            {
                cargo: 'Senior Dev',
                salario: 8_000_000,
                auxilios: 0,
                plan_compl: 0,
                aux_transporte: 0,
                ss: 2_000_000,
                prestaciones: 1_500_000,
                equipo_tipo: '2'
            }
        ],
        equipos: {
            '1': { total: 300_000 },
            '2': { total: 800_000 }
        },
        gto_vinculacion: 100_000,
        staff_cinte: 50_000,
        factores_he: { diurna: 0.25, nocturna: 0.75, dom_diurna: 1.15, dom_nocturna: 2 },
        ...overrides
    };
}

// ─── calcularSsDinamico ───────────────────────────────────────────────────────
describe('calcularSsDinamico()', () => {
    it('retorna 0 para salario <= 0', () => {
        assert.equal(calcularSsDinamico(0, SMMLV), 0);
        assert.equal(calcularSsDinamico(-1000, SMMLV), 0);
    });

    it('calcula correctamente por debajo del tope (< SMMLV×10): sin salud, icbf, sena', () => {
        const salario = SMMLV * 5; // por debajo de 10×SMMLV
        const pension = salario * 0.12;
        const arl = salario * 0.0052;
        const caja = salario * 0.04;
        const expected = round2(pension + arl + caja);
        assert.equal(calcularSsDinamico(salario, SMMLV), expected);
        // No debe incluir salud (solo aplica >= 10×SMMLV)
        assert.ok(calcularSsDinamico(salario, SMMLV) < salario * 0.085 + pension + arl + caja);
    });

    it('calcula correctamente por encima del tope (>= SMMLV×10): incluye salud, icbf, sena', () => {
        const salario = SMMLV * 10; // exactamente en el tope
        const salud = salario * 0.085;
        const pension = salario * 0.12;
        const arl = salario * 0.0052;
        const caja = salario * 0.04;
        const icbf = salario * 0.03;
        const sena = salario * 0.02;
        const expected = round2(salud + pension + arl + caja + icbf + sena);
        assert.equal(calcularSsDinamico(salario, SMMLV), expected);
    });

    it('respeta riesgo ARL personalizado', () => {
        const salario = 3_000_000;
        const arlRiesgoV = 0.0174;
        const base = calcularSsDinamico(salario, SMMLV, 0.0052);
        const custom = calcularSsDinamico(salario, SMMLV, arlRiesgoV);
        assert.ok(custom > base, 'ARL mayor debe producir SS mayor');
    });

    it('resultado siempre redondeado a 2 decimales', () => {
        const result = calcularSsDinamico(1_500_001.33, SMMLV);
        assert.equal(String(result).replace(/^\d+\.?/, '').length <= 2, true);
    });
});

// ─── calcularPrestacionesDinamico ────────────────────────────────────────────
describe('calcularPrestacionesDinamico()', () => {
    it('retorna 0 para salario <= 0', () => {
        assert.equal(calcularPrestacionesDinamico(0, SMMLV, AUX_TRANSPORTE), 0);
    });

    it('incluye auxilio de transporte en base cesantías si salario <= 2×SMMLV', () => {
        const salario = SMMLV; // 1×SMMLV → <= 2×SMMLV
        const baseCon = salario + AUX_TRANSPORTE;
        const sinAux = salario;
        const conAux = calcularPrestacionesDinamico(salario, SMMLV, AUX_TRANSPORTE);
        const sinAuxVal = calcularPrestacionesDinamico(SMMLV * 3, SMMLV, AUX_TRANSPORTE);
        assert.ok(conAux > sinAuxVal / 3, 'con aux transporte prestaciones mayores en proporción');
        // cesantías = baseCon × 0.0833
        const cesantiasEsperadas = round2(baseCon * 0.0833);
        const intEsperados = round2(baseCon * 0.01);
        const primaEsperada = round2(baseCon * 0.0833);
        const vacEsperadas = round2(sinAux * 0.0417);
        const expected = round2(cesantiasEsperadas + intEsperados + primaEsperada + vacEsperadas);
        assert.equal(conAux, expected);
    });

    it('NO incluye auxilio de transporte si salario > 2×SMMLV', () => {
        const salario = SMMLV * 3;
        const base = salario; // sin aux
        const cesantias = round2(base * 0.0833);
        const intCesantias = round2(base * 0.01);
        const prima = round2(base * 0.0833);
        const vacaciones = round2(base * 0.0417);
        const expected = round2(cesantias + intCesantias + prima + vacaciones);
        assert.equal(calcularPrestacionesDinamico(salario, SMMLV, AUX_TRANSPORTE), expected);
    });
});

// ─── calcularCotizacion ───────────────────────────────────────────────────────
describe('calcularCotizacion()', () => {
    it('lanza error 400 si margen < margen_minimo', () => {
        const catalogos = makeCatalogos({ parametros: { ...makeCatalogos().parametros, margen_minimo: 0.25 } });
        try {
            calcularCotizacion({ perfiles: [{ indice: 0, cantidad: 1 }], margen: 0.1 }, catalogos);
            assert.fail('Debería lanzar error');
        } catch (e) {
            assert.equal(e.status, 400);
            assert.match(e.message, /margen/i);
        }
    });

    it('lanza error 400 si no hay perfiles válidos', () => {
        const catalogos = makeCatalogos();
        try {
            calcularCotizacion({ perfiles: [], margen: 0.3 }, catalogos);
            assert.fail('Debería lanzar error');
        } catch (e) {
            assert.equal(e.status, 400);
        }
    });

    it('calcula cotización correctamente en modo AUTO con un perfil', () => {
        const catalogos = makeCatalogos();
        const result = calcularCotizacion({
            cliente: 'ACME',
            nit: '900123456',
            comercial: 'Juan',
            plazo: '45',
            margen: 0.3,
            meses: 3,
            moneda: 'COP',
            perfiles: [{ indice: 0, cantidad: 2 }]
        }, catalogos);
        assert.equal(result.cliente, 'ACME');
        assert.equal(result.resultados.length, 1);
        assert.equal(result.resultados[0].cantidad, 2);
        assert.equal(result.resultados[0].modo, 'AUTO');
        assert.ok(result.resultados[0].tarifa_mes > 0);
        assert.ok(result.resultados[0].tarifa_dia > 0);
        assert.ok(result.resultados[0].tarifa_hora > 0);
    });

    it('calcula cotización en modo MANUAL con salario manual', () => {
        const catalogos = makeCatalogos();
        const salarioManual = 5_000_000;
        const result = calcularCotizacion({
            perfiles: [{ modo: 'MANUAL', cargo_manual: 'Especialista', salario_manual: salarioManual, cantidad: 1 }],
            margen: 0.3,
            plazo: '45',
            moneda: 'COP'
        }, catalogos);
        assert.equal(result.resultados[0].modo, 'MANUAL');
        assert.equal(result.resultados[0].salario, salarioManual);
        assert.equal(result.resultados[0].auxilios, 0);
    });

    it('convierte tarifa a USD dividiendo entre tasa COP/USD', () => {
        const catalogos = makeCatalogos();
        const cop = calcularCotizacion({
            perfiles: [{ indice: 0, cantidad: 1 }], margen: 0.3, plazo: '45', moneda: 'COP'
        }, catalogos);
        const usd = calcularCotizacion({
            perfiles: [{ indice: 0, cantidad: 1 }], margen: 0.3, plazo: '45', moneda: 'USD'
        }, catalogos);
        const tasaUSD = 4_100;
        assert.equal(
            usd.resultados[0].tarifa_mes,
            round2(cop.resultados[0].tarifa_mes_cop / tasaUSD),
            'tarifa USD debe ser COP/tasa'
        );
    });

    it('salta perfiles MANUAL sin cargo_manual', () => {
        const catalogos = makeCatalogos();
        const result = calcularCotizacion({
            perfiles: [
                { modo: 'MANUAL', cargo_manual: '', salario_manual: 3000000, cantidad: 1 }, // inválido
                { indice: 0, cantidad: 1 }  // válido
            ],
            margen: 0.3, plazo: '45', moneda: 'COP'
        }, catalogos);
        assert.equal(result.resultados.length, 1);
    });

    it('salta perfiles AUTO con índice fuera de rango', () => {
        const catalogos = makeCatalogos();
        const result = calcularCotizacion({
            perfiles: [
                { indice: 99, cantidad: 1 }, // fuera de rango
                { indice: 0, cantidad: 1 }   // válido
            ],
            margen: 0.3, plazo: '45', moneda: 'COP'
        }, catalogos);
        assert.equal(result.resultados.length, 1);
    });

    it('incluye factores_he en el resultado', () => {
        const catalogos = makeCatalogos();
        const result = calcularCotizacion({
            perfiles: [{ indice: 0, cantidad: 1 }], margen: 0.3, plazo: '45', moneda: 'COP'
        }, catalogos);
        assert.ok(result.factores_he);
        assert.ok(typeof result.factores_he.diurna === 'number');
    });
});

// ─── generarDashboardData ─────────────────────────────────────────────────────
describe('generarDashboardData()', () => {
    it('retorna objeto vacío si historial es [] o no es array', () => {
        const empty = generarDashboardData([]);
        assert.equal(empty.empty, true);
        assert.equal(empty.total_cot, 0);
        assert.equal(empty.total_valor, 0);
        assert.equal(empty.total_perfiles, 0);

        const nonArray = generarDashboardData(null);
        assert.equal(nonArray.empty, true);
    });

    it('agrega correctamente múltiples cotizaciones', () => {
        const historial = [
            {
                id: '1', comercial: 'Ana', meses: 2, fecha: '2025-01-15',
                resultados: [{ cargo: 'Analista', tarifa_mes: 5_000_000, cantidad: 2, modo: 'AUTO' }]
            },
            {
                id: '2', comercial: 'Juan', meses: 1, fecha: '2025-02-10',
                resultados: [{ cargo: 'Senior', tarifa_mes: 10_000_000, cantidad: 1, modo: 'MANUAL' }]
            }
        ];
        const data = generarDashboardData(historial);
        assert.equal(data.empty, false);
        assert.equal(data.total_cot, 2);
        // Ana: 5M × 2 perfiles × 2 meses = 20M; Juan: 10M × 1 × 1 = 10M → total 30M
        assert.equal(data.total_valor, 30_000_000);
        assert.equal(data.total_perfiles, 3); // 2 + 1
        assert.equal(data.por_comercial_count['Ana'], 1);
        assert.equal(data.por_comercial_count['Juan'], 1);
        assert.equal(data.modo_stats.AUTO, 2);  // 2 cantidad × AUTO
        assert.equal(data.modo_stats.MANUAL, 1);
    });

    it('top_cargos ordenado por cantidad descendente', () => {
        const historial = [
            { id: '1', comercial: 'X', meses: 1, resultados: [{ cargo: 'A', tarifa_mes: 1, cantidad: 5, modo: 'AUTO' }] },
            { id: '2', comercial: 'X', meses: 1, resultados: [{ cargo: 'B', tarifa_mes: 1, cantidad: 10, modo: 'AUTO' }] },
            { id: '3', comercial: 'X', meses: 1, resultados: [{ cargo: 'C', tarifa_mes: 1, cantidad: 1, modo: 'AUTO' }] }
        ];
        const data = generarDashboardData(historial);
        assert.equal(data.top_cargos[0][0], 'B');
        assert.equal(data.top_cargos[0][1], 10);
        assert.equal(data.top_cargos[1][0], 'A');
    });

    it('ultimas devuelve máximo 10 elementos en orden inverso', () => {
        const historial = Array.from({ length: 15 }, (_, i) => ({
            id: String(i), comercial: 'X', meses: 1, fecha: `2025-01-${String(i + 1).padStart(2, '0')}`,
            resultados: [{ tarifa_mes: 1000, cantidad: 1, modo: 'AUTO' }]
        }));
        const data = generarDashboardData(historial);
        assert.equal(data.ultimas.length, 10);
        // Las últimas deben ser las más recientes (último insertado primero)
        assert.equal(data.ultimas[0].id, '14');
    });

    it('calcula promedio correcto', () => {
        const historial = [
            { id: '1', comercial: 'X', meses: 1, resultados: [{ tarifa_mes: 100, cantidad: 1, modo: 'AUTO' }] },
            { id: '2', comercial: 'X', meses: 1, resultados: [{ tarifa_mes: 300, cantidad: 1, modo: 'AUTO' }] }
        ];
        const data = generarDashboardData(historial);
        assert.equal(data.total_valor, 400);
        assert.equal(data.promedio, 200);
    });

    it('tendencia agrupa por mes YYYY-MM', () => {
        const historial = [
            { id: '1', comercial: 'X', meses: 1, fecha: '2025-01-10', resultados: [{ tarifa_mes: 1, cantidad: 1, modo: 'AUTO' }] },
            { id: '2', comercial: 'X', meses: 1, fecha: '2025-01-20', resultados: [{ tarifa_mes: 1, cantidad: 1, modo: 'AUTO' }] },
            { id: '3', comercial: 'X', meses: 1, fecha: '2025-02-05', resultados: [{ tarifa_mes: 1, cantidad: 1, modo: 'AUTO' }] }
        ];
        const data = generarDashboardData(historial);
        const tendenciaMap = Object.fromEntries(data.tendencia);
        assert.equal(tendenciaMap['2025-01'], 2);
        assert.equal(tendenciaMap['2025-02'], 1);
    });
});
