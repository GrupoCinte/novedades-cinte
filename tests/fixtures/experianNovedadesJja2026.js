'use strict';

const {
    isNovedadElegibleParaCierreRow,
    monthRangeDates
} = require('../../src/conciliaciones/conciliacionNovedadElegibilidad');
const EXPERIAN_CLIENTE = 'EXPERIAN';
const EXPERIAN_JJA_SEED_TAG = '[seed-experian-jja-2026]';

const EXPERIAN_JJA_CEDULAS = [
    '1143140043',
    '1121857186',
    '1026156282',
    '1032364862',
    '1013617610',
    '1037617606',
    '1233492366',
    '1023932816',
    '1005716245',
    '1061724637',
    '1016109552',
    '1102379777',
    '1013623111',
    '1105615169',
    '1063156032',
    '53036759',
    '73202294',
    '1144207460',
    '1000324050',
    '1004917418',
    '1022339254'
];

/** @type {Array<object>} */
const EXPERIAN_JJA_NOVEDADES = [
    {
        cedula: EXPERIAN_JJA_CEDULAS[0],
        tipo: 'Permiso remunerado',
        fi: '2026-06-03',
        ff: '2026-06-04',
        ch: 2,
        unidad: 'dias',
        estado: 'Aprobado',
        aprobadoYmd: '2026-06-03',
        caso: 'jun-normal-dias'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[1],
        tipo: 'Bonos',
        fi: '2026-06-05',
        ff: '2026-06-05',
        ch: 0,
        monto: 520000,
        estado: 'Aprobado',
        aprobadoYmd: '2026-06-05',
        caso: 'jun-bono-suma'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[2],
        tipo: 'Hora Extra',
        fi: '2026-06-10',
        ff: '2026-06-10',
        ch: 3,
        horasDiurnas: 3,
        estado: 'Aprobado',
        aprobadoYmd: '2026-06-10',
        caso: 'jun-he-suma'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[3],
        tipo: 'Incapacidad',
        fi: '2026-06-12',
        ff: '2026-06-13',
        ch: 2,
        unidad: 'dias',
        estado: 'Pendiente',
        aprobadoYmd: null,
        caso: 'jun-pendiente-incapacidad'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[4],
        tipo: 'Licencia no remunerada',
        fi: '2026-06-15',
        ff: '2026-06-16',
        ch: 2,
        unidad: 'dias',
        estado: 'Pendiente',
        aprobadoYmd: null,
        caso: 'jun-pendiente-licencia-nr'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[5],
        tipo: 'Disponibilidad',
        fi: '2026-06-18',
        ff: '2026-06-18',
        ch: 0,
        monto: 380000,
        estado: 'Aprobado',
        aprobadoYmd: '2026-06-18',
        caso: 'jun-disponibilidad'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[6],
        tipo: 'Compensatorio por votación/jurado',
        fi: '2026-06-20',
        ff: '2026-06-20',
        ch: 1,
        modalidad: 'solo_jurado',
        fv: '2026-06-01',
        estado: 'Aprobado',
        aprobadoYmd: '2026-06-20',
        caso: 'jun-jurado'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[7],
        tipo: 'Vacaciones en tiempo',
        fi: '2026-07-02',
        ff: '2026-07-04',
        ch: 3,
        unidad: 'dias',
        estado: 'Aprobado',
        aprobadoYmd: '2026-07-02',
        caso: 'jul-vacaciones-tiempo'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[8],
        tipo: 'Suspensión',
        fi: '2026-07-07',
        ff: '2026-07-08',
        ch: 2,
        unidad: 'dias',
        estado: 'Pendiente',
        aprobadoYmd: null,
        caso: 'jul-pendiente-suspension'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[9],
        tipo: 'Calamidad domestica',
        fi: '2026-07-09',
        ff: '2026-07-09',
        ch: 1,
        unidad: 'dias',
        estado: 'Aprobado',
        aprobadoYmd: '2026-07-09',
        caso: 'jul-calamidad'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[10],
        tipo: 'Permiso compensatorio en tiempo',
        fi: '2026-07-14',
        ff: '2026-07-14',
        fecha: '2026-07-14',
        hi: '08:00:00',
        hf: '12:00:00',
        ch: 4,
        unidad: 'horas',
        estado: 'Aprobado',
        aprobadoYmd: '2026-07-14',
        caso: 'jul-compensatorio-horas'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[11],
        tipo: 'Licencia de luto',
        fi: '2026-07-16',
        ff: '2026-07-17',
        ch: 2,
        unidad: 'dias',
        estado: 'Pendiente',
        aprobadoYmd: null,
        caso: 'jul-pendiente-luto'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[12],
        tipo: 'Vacaciones en dinero',
        fi: '2026-07-21',
        ff: '2026-07-22',
        ch: 2,
        unidad: 'dias',
        estado: 'Aprobado',
        aprobadoYmd: '2026-07-21',
        caso: 'jul-vacaciones-dinero'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[13],
        tipo: 'Permiso remunerado',
        fi: '2026-05-28',
        ff: '2026-05-29',
        ch: 2,
        unidad: 'dias',
        estado: 'Aprobado',
        aprobadoYmd: '2026-07-05',
        caso: 'jul-tardia-mayo-aprob-jul'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[14],
        tipo: 'Licencia remunerada',
        fi: '2026-08-04',
        ff: '2026-08-05',
        ch: 2,
        unidad: 'dias',
        estado: 'Aprobado',
        aprobadoYmd: '2026-08-04',
        caso: 'ago-licencia-remunerada'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[15],
        tipo: 'Permiso no remunerado',
        fi: '2026-08-06',
        ff: '2026-08-07',
        ch: 2,
        unidad: 'dias',
        estado: 'Pendiente',
        aprobadoYmd: null,
        caso: 'ago-pendiente-pnr'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[16],
        tipo: 'Licencia de maternidad',
        fi: '2026-08-11',
        ff: '2026-08-14',
        ch: 4,
        unidad: 'dias',
        estado: 'Aprobado',
        aprobadoYmd: '2026-08-11',
        caso: 'ago-maternidad'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[17],
        tipo: 'Licencia de paternidad',
        fi: '2026-08-13',
        ff: '2026-08-15',
        ch: 3,
        unidad: 'dias',
        estado: 'Pendiente',
        aprobadoYmd: null,
        caso: 'ago-pendiente-paternidad'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[18],
        tipo: 'Bonos',
        fi: '2026-08-18',
        ff: '2026-08-18',
        ch: 0,
        monto: 610000,
        estado: 'Aprobado',
        aprobadoYmd: '2026-08-18',
        caso: 'ago-bono'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[19],
        tipo: 'Incapacidad',
        fi: '2026-07-10',
        ff: '2026-07-11',
        ch: 2,
        unidad: 'dias',
        estado: 'Aprobado',
        aprobadoYmd: '2026-08-05',
        caso: 'ago-tardia-jul-aprob-ago'
    },
    {
        cedula: EXPERIAN_JJA_CEDULAS[20],
        tipo: 'Permiso no remunerado',
        fi: '2026-06-25',
        ff: '2026-06-26',
        ch: 2,
        unidad: 'dias',
        estado: 'Aprobado',
        aprobadoYmd: '2026-07-20',
        caso: 'ago-backlog-jun-aprob-jul'
    }
];

/** Casos especiales con regla dominante (documentación / asserts). */
const EXPERIAN_JJA_REGLA_POR_CASO = {
    'jul-tardia-mayo-aprob-jul': 'B',
    'ago-tardia-jul-aprob-ago': 'B',
    'ago-backlog-jun-aprob-jul': 'C'
};

function stableUuidFromCaso(caso) {
    const hex = Buffer.from(String(caso)).toString('hex').padEnd(32, '0').slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a000-${hex.slice(16, 28)}`;
}

/** Fila tipo BD para mocks de elegibilidad. */
function toElegibilityRow(seed, index = 0) {
    const aprobadoYmd = seed.aprobadoYmd;
    return {
        id: stableUuidFromCaso(seed.caso || `row-${index}`),
        cedula: seed.cedula,
        tipo_novedad: seed.tipo,
        monto_cop: seed.monto != null ? String(seed.monto) : null,
        cantidad_horas: seed.ch,
        unidad: seed.unidad || null,
        modalidad: seed.modalidad || null,
        hora_inicio: seed.hi || null,
        hora_fin: seed.hf || null,
        fecha_inicio: seed.fi,
        fecha_fin: seed.ff,
        aprobado_en: aprobadoYmd ? new Date(`${aprobadoYmd}T20:00:00.000Z`) : null,
        estado: seed.estado,
        caso: seed.caso
    };
}

/**
 * Meses de facturación (6–8 / 2026) en los que cada caso aprobado es elegible
 * con mes corriente (sin regla C de backlog entre meses distintos al de facturación).
 */
const EXPERIAN_JJA_ELEGIBLE_FACT_MESES = Object.fromEntries(
    EXPERIAN_JJA_NOVEDADES.filter((n) => n.estado === 'Aprobado').map((seed) => {
        const row = toElegibilityRow(seed);
        const meses = [6, 7, 8].filter((factMes) => {
            const mr = monthRangeDates(2026, factMes);
            return isNovedadElegibleParaCierreRow(row, {
                    novStart: mr.start,
                    novEnd: mr.end,
                    factStart: mr.start,
                    factEnd: mr.end
                });
        });
        return [seed.caso, meses];
    })
);

function approvedExperianJjaRows() {
    return EXPERIAN_JJA_NOVEDADES.filter((n) => n.estado === 'Aprobado').map((n) => toElegibilityRow(n));
}

function pendienteExperianJjaRows() {
    return EXPERIAN_JJA_NOVEDADES.filter((n) => n.estado === 'Pendiente').map((n) => toElegibilityRow(n));
}

function isExperianJjaEligibleInFactMes(caso, factMes) {
    const allowed = EXPERIAN_JJA_ELEGIBLE_FACT_MESES[caso];
    return Array.isArray(allowed) && allowed.includes(Number(factMes));
}

module.exports = {
    EXPERIAN_CLIENTE,
    EXPERIAN_JJA_SEED_TAG,
    EXPERIAN_JJA_CEDULAS,
    EXPERIAN_JJA_NOVEDADES,
    EXPERIAN_JJA_ELEGIBLE_FACT_MESES,
    EXPERIAN_JJA_REGLA_POR_CASO,
    toElegibilityRow,
    approvedExperianJjaRows,
    pendienteExperianJjaRows,
    isExperianJjaEligibleInFactMes,
    stableUuidFromCaso
};
