'use strict';

require('dotenv').config();

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const {
    isNovedadElegibleParaCierreRow,
    monthRangeDates,
    listNovedadesElegiblesParaCierre
} = require('../src/conciliaciones/conciliacionNovedadElegibilidad');
const {
    EXPERIAN_CLIENTE,
    EXPERIAN_JJA_SEED_TAG,
    EXPERIAN_JJA_NOVEDADES,
    EXPERIAN_JJA_ELEGIBLE_FACT_MESES,
    EXPERIAN_JJA_REGLA_POR_CASO,
    approvedExperianJjaRows,
    pendienteExperianJjaRows,
    isExperianJjaEligibleInFactMes,
    toElegibilityRow
} = require('./fixtures/experianNovedadesJja2026');

const normalizeCedula = (v) => String(v || '').replace(/\D/g, '');
const canRoleViewType = () => true;
const scope = { role: 'super_admin', canViewAllAreas: true, areas: [] };

function rangesForFactMes(factMes) {
    const mr = monthRangeDates(2026, factMes);
    return { novStart: mr.start, novEnd: mr.end, factStart: mr.start, factEnd: mr.end };
}

function mockPoolWithRows(rows) {
    return {
        query: async (sql, params = []) => {
            if (String(sql).includes('FROM novedades')) {
                let filtered = rows.filter((r) => String(r.estado || 'Aprobado') === 'Aprobado');
                const cedulaIdx = String(sql).indexOf('regexp_replace');
                if (cedulaIdx >= 0 && params.length) {
                    const cedDigits = normalizeCedula(params[params.length - 1]);
                    if (cedDigits) {
                        filtered = filtered.filter((r) => normalizeCedula(r.cedula) === cedDigits);
                    }
                }
                return { rows: filtered };
            }
            return { rows: [] };
        }
    };
}

test('fixture EXPERIAN jja: 21 novedades, 6 pendientes y casos especiales documentados', () => {
    assert.equal(EXPERIAN_JJA_NOVEDADES.length, 21);
    const pendientes = EXPERIAN_JJA_NOVEDADES.filter((n) => n.estado === 'Pendiente');
    const aprobadas = EXPERIAN_JJA_NOVEDADES.filter((n) => n.estado === 'Aprobado');
    assert.equal(pendientes.length, 6);
    assert.equal(aprobadas.length, 15);
    assert.equal(Object.keys(EXPERIAN_JJA_REGLA_POR_CASO).length, 3);
    assert.ok(EXPERIAN_JJA_SEED_TAG.includes('experian'));
});

test('EXPERIAN jja: novedades normales — regla A en su mes; regla C en meses posteriores si aprob. en mes origen', () => {
    const normals = [
        { caso: 'jun-normal-dias', mesOrigen: 6, mesesElegibles: [6, 7, 8] },
        { caso: 'jul-vacaciones-tiempo', mesOrigen: 7, mesesElegibles: [7, 8] },
        { caso: 'ago-licencia-remunerada', mesOrigen: 8, mesesElegibles: [8] }
    ];
    for (const { caso, mesesElegibles } of normals) {
        const seed = EXPERIAN_JJA_NOVEDADES.find((n) => n.caso === caso);
        const row = toElegibilityRow(seed);
        for (const factMes of [6, 7, 8]) {
            const eligible = isNovedadElegibleParaCierreRow(row, rangesForFactMes(factMes));
            assert.equal(
                eligible,
                mesesElegibles.includes(factMes),
                `${caso} factMes=${factMes} esperado=${mesesElegibles.includes(factMes)}`
            );
        }
        assert.deepEqual(EXPERIAN_JJA_ELEGIBLE_FACT_MESES[caso], mesesElegibles);
    }
});

test('EXPERIAN jja: casos tardíos y backlog según reglas B/C', () => {
    const tardiaJul = toElegibilityRow(
        EXPERIAN_JJA_NOVEDADES.find((n) => n.caso === 'jul-tardia-mayo-aprob-jul')
    );
    assert.equal(isNovedadElegibleParaCierreRow(tardiaJul, rangesForFactMes(5)), false);
    assert.equal(isNovedadElegibleParaCierreRow(tardiaJul, rangesForFactMes(6)), false);
    assert.equal(isNovedadElegibleParaCierreRow(tardiaJul, rangesForFactMes(7)), true);

    const tardiaAgo = toElegibilityRow(
        EXPERIAN_JJA_NOVEDADES.find((n) => n.caso === 'ago-tardia-jul-aprob-ago')
    );
    assert.equal(isNovedadElegibleParaCierreRow(tardiaAgo, rangesForFactMes(7)), false);
    assert.equal(isNovedadElegibleParaCierreRow(tardiaAgo, rangesForFactMes(8)), true);

    const backlog = toElegibilityRow(
        EXPERIAN_JJA_NOVEDADES.find((n) => n.caso === 'ago-backlog-jun-aprob-jul')
    );
    assert.equal(isNovedadElegibleParaCierreRow(backlog, rangesForFactMes(6)), false);
    assert.equal(isNovedadElegibleParaCierreRow(backlog, rangesForFactMes(7)), true);
    assert.equal(isNovedadElegibleParaCierreRow(backlog, rangesForFactMes(8)), true);
});

test('EXPERIAN jja: matriz de elegibilidad por caso y mes de facturación', () => {
    for (const [caso, meses] of Object.entries(EXPERIAN_JJA_ELEGIBLE_FACT_MESES)) {
        const seed = EXPERIAN_JJA_NOVEDADES.find((n) => n.caso === caso);
        assert.ok(seed, `caso ${caso} en fixture`);
        const row = toElegibilityRow(seed);
        for (const factMes of [6, 7, 8]) {
            const expected = meses.includes(factMes);
            assert.equal(
                isNovedadElegibleParaCierreRow(row, rangesForFactMes(factMes)),
                expected,
                `${caso} @ factMes ${factMes}`
            );
            assert.equal(isExperianJjaEligibleInFactMes(caso, factMes), expected);
        }
    }
});

test('EXPERIAN jja: listNovedadesElegiblesParaCierre respeta cédula y excluye pendientes', async () => {
    const allRows = [...approvedExperianJjaRows(), ...pendienteExperianJjaRows()];
    const deps = { pool: mockPoolWithRows(allRows), normalizeCedula, canRoleViewType };

    const target = EXPERIAN_JJA_NOVEDADES.find((n) => n.caso === 'jun-normal-dias');
    const jun = await listNovedadesElegiblesParaCierre(deps, scope, {
        clienteCanon: EXPERIAN_CLIENTE,
        cedulaRaw: target.cedula,
        factAnio: 2026,
        factMes: 6
    });
    assert.equal(jun.length, 1);
    assert.equal(jun[0].caso, 'jun-normal-dias');

    const pendiente = EXPERIAN_JJA_NOVEDADES.find((n) => n.caso === 'jun-pendiente-incapacidad');
    const none = await listNovedadesElegiblesParaCierre(deps, scope, {
        clienteCanon: EXPERIAN_CLIENTE,
        cedulaRaw: pendiente.cedula,
        factAnio: 2026,
        factMes: 6
    });
    assert.equal(none.length, 0);
});

test('EXPERIAN jja: cierre julio incluye tardía de mayo y backlog de junio', async () => {
    const deps = {
        pool: mockPoolWithRows(approvedExperianJjaRows()),
        normalizeCedula,
        canRoleViewType
    };
    const jul = await listNovedadesElegiblesParaCierre(deps, scope, {
        clienteCanon: EXPERIAN_CLIENTE,
        factAnio: 2026,
        factMes: 7
    });
    const casos = new Set(jul.map((r) => r.caso));
    assert.ok(casos.has('jul-tardia-mayo-aprob-jul'));
    assert.ok(casos.has('ago-backlog-jun-aprob-jul'));
    assert.ok(casos.has('jun-normal-dias'), 'regla C: junio aprobado en junio reaparece en julio');
});

test('EXPERIAN jja ADVANCE: junio no liquida novedades; julio ajusta backlog jun-aprob-jul', async () => {
    const deps = {
        pool: mockPoolWithRows(approvedExperianJjaRows()),
        normalizeCedula,
        canRoleViewType
    };
    const { aggregateAdvanceFactura } = require('../src/conciliaciones/conciliacionAdvanceMonth');
    const { getConciliacionResumenPorClienteMes } = require('../src/conciliaciones/conciliacionesQueries');

    const backlog = EXPERIAN_JJA_NOVEDADES.find((n) => n.caso === 'ago-backlog-jun-aprob-jul');
    const junRows = await listNovedadesElegiblesParaCierre(deps, scope, {
        clienteCanon: EXPERIAN_CLIENTE,
        cedulaRaw: backlog.cedula,
        factAnio: 2026,
        factMes: 6,
        billingType: 'ADVANCE_MONTH'
    });
    assert.ok(junRows.length >= 1, 'junio muestra novedades informativas');

    const tarifa = 10_000_000;
    const junAgg = aggregateAdvanceFactura(tarifa, junRows, {}, { factAnio: 2026, factMes: 6 });
    assert.equal(junAgg.facturaCop, tarifa);
    assert.equal(junAgg.pendingAdjustmentCount, junRows.length);

    const julRows = await listNovedadesElegiblesParaCierre(deps, scope, {
        clienteCanon: EXPERIAN_CLIENTE,
        cedulaRaw: backlog.cedula,
        factAnio: 2026,
        factMes: 7,
        billingType: 'ADVANCE_MONTH'
    });
    assert.ok(
        julRows.some((r) => r.caso === 'ago-backlog-jun-aprob-jul' || String(r.fecha_inicio || '').startsWith('2026-06')),
        'julio incluye ajuste de junio'
    );

    const julAgg = aggregateAdvanceFactura(tarifa, julRows, {}, { factAnio: 2026, factMes: 7 });
    assert.ok(julAgg.ajusteAnticipoSumCop > 0 || julAgg.ajusteAnticipoSumaCop > 0);
    assert.ok(julAgg.facturaCop !== tarifa || julAgg.saldoAnticipoTipo != null);

    const poolMock = {
        query: async (sql, params) => {
            const s = String(sql);
            if (s.includes('FROM novedades')) {
                const ced = normalizeCedula(backlog.cedula);
                const filtered = approvedExperianJjaRows().filter(
                    (r) => normalizeCedula(r.cedula) === ced
                );
                if (params?.[1] === '2026-06-01') {
                    return {
                        rows: filtered.filter((r) => String(r.fecha_inicio || '').startsWith('2026-06'))
                    };
                }
                return { rows: filtered };
            }
            if (s.includes('FROM colaboradores')) {
                return {
                    rows: [
                        {
                            cedula: backlog.cedula,
                            nombre: 'Experian Test',
                            cliente: EXPERIAN_CLIENTE,
                            tarifa_cliente: String(tarifa),
                            moneda: 'COP'
                        }
                    ]
                };
            }
            return { rows: [] };
        }
    };
    const qDeps = { pool: poolMock, normalizeCedula, canRoleViewType };
    const resJul = await getConciliacionResumenPorClienteMes(qDeps, scope, EXPERIAN_CLIENTE, 2026, 7, {
        billingType: 'ADVANCE_MONTH'
    });
    assert.equal(resJul.rows[0].billingAdvanceMode, true);
    assert.ok(resJul.rows[0].ajusteAnticipoSumCop > 0 || resJul.rows[0].saldoAnticipoNetCop !== 0);
});

const hasDb = Boolean(String(process.env.DB_PASSWORD || '').trim());

function poolFromEnv() {
    const password = String(process.env.DB_PASSWORD || '').trim();
    if (!password) {
        throw new Error('DB_PASSWORD es obligatorio en .env (ver .env.example).');
    }
    return new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME || 'novedades_cinte',
        user: process.env.DB_USER || 'cinte_app',
        password
    });
}

test(
    'integración BD: seed EXPERIAN jja presente y elegibilidad real',
    { skip: !hasDb ? 'DB_PASSWORD no definido en .env' : false },
    async () => {
        const pool = poolFromEnv();

        try {
            const countQ = await pool.query(
                `SELECT estado, COUNT(*)::int AS n
                 FROM novedades
                 WHERE observaciones LIKE $1
                 GROUP BY estado`,
                [`%${EXPERIAN_JJA_SEED_TAG}%`]
            );
            const byEstado = Object.fromEntries(countQ.rows.map((r) => [r.estado, r.n]));
            assert.equal(byEstado.Pendiente, 6, 'ejecuta: node logs/seed-novedades-experian-jun-jul-ago.js');
            assert.equal(byEstado.Aprobado, 15);

            const deps = { pool, normalizeCedula, canRoleViewType };

            for (const [caso, meses] of Object.entries(EXPERIAN_JJA_ELEGIBLE_FACT_MESES)) {
                const seed = EXPERIAN_JJA_NOVEDADES.find((n) => n.caso === caso);
                for (const factMes of meses) {
                    const rows = await listNovedadesElegiblesParaCierre(deps, scope, {
                        clienteCanon: EXPERIAN_CLIENTE,
                        cedulaRaw: seed.cedula,
                        factAnio: 2026,
                        factMes
                    });
                    const hit = rows.some((r) => String(r.tipo_novedad) === seed.tipo);
                    assert.ok(hit, `BD: ${caso} debe aparecer en cierre ${factMes}/2026`);
                }
            }

            const pend = EXPERIAN_JJA_NOVEDADES.find((n) => n.caso === 'ago-pendiente-pnr');
            const pendRows = await listNovedadesElegiblesParaCierre(deps, scope, {
                clienteCanon: EXPERIAN_CLIENTE,
                cedulaRaw: pend.cedula,
                factAnio: 2026,
                factMes: 8
            });
            const incluyePendiente = pendRows.some((r) => String(r.tipo_novedad) === pend.tipo);
            assert.equal(incluyePendiente, false, 'la novedad pendiente no debe ser elegible');
        } finally {
            await pool.end();
        }
    }
);
