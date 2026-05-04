function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function round2(value) {
    return Number(safeNumber(value).toFixed(2));
}

function calcularSsDinamico(salarioBase, smmlv, arlRiesgo = 0.0052) {
    const salario = safeNumber(salarioBase);
    if (salario <= 0) return 0;
    const tope10 = safeNumber(smmlv) * 10;
    const salud = salario >= tope10 ? salario * 0.085 : 0;
    const pension = salario * 0.12;
    const arl = salario * safeNumber(arlRiesgo, 0.0052);
    const caja = salario * 0.04;
    const icbf = salario >= tope10 ? salario * 0.03 : 0;
    const sena = salario >= tope10 ? salario * 0.02 : 0;
    return round2(salud + pension + arl + caja + icbf + sena);
}

function calcularPrestacionesDinamico(salarioBase, smmlv, auxTransporteLegal) {
    const salario = safeNumber(salarioBase);
    if (salario <= 0) return 0;
    const tope2 = safeNumber(smmlv) * 2;
    const baseCesantias = salario + (salario <= tope2 ? safeNumber(auxTransporteLegal) : 0);
    const cesantias = baseCesantias * 0.0833;
    const intCesantias = baseCesantias * 0.01;
    const prima = baseCesantias * 0.0833;
    const vacaciones = salario * 0.0417;
    return round2(cesantias + intCesantias + prima + vacaciones);
}

function resolveEquipoCosto(equipos = {}, equipoTipo = '1') {
    const key = String(equipoTipo || '1');
    if (equipos[key]) return safeNumber(equipos[key].total);
    const fallback = equipos['1'] || Object.values(equipos)[0] || { total: 0 };
    return safeNumber(fallback.total);
}

function calcularTarifa({
    cargoData,
    parametros,
    equipos,
    gtoVinculacion,
    staffCinte,
    plazo = '45',
    margen = 0.3,
    moneda = 'COP',
    modo = 'AUTO',
    salarioManual = null
}) {
    const smmlv = safeNumber(parametros?.smmlv);
    const auxTransporteLegal = safeNumber(parametros?.aux_transporte_legal, 0);
    let salario = safeNumber(cargoData?.salario);
    let auxilios = safeNumber(cargoData?.auxilios);
    let planCompl = safeNumber(cargoData?.plan_compl);
    let auxTransporte = safeNumber(cargoData?.aux_transporte);
    let dotacion = salario > 0 && salario <= smmlv * 2 ? safeNumber(parametros?.dotacion) : 0;
    let ss = safeNumber(cargoData?.ss);
    let prestaciones = safeNumber(cargoData?.prestaciones);

    if (String(modo).toUpperCase() === 'MANUAL' && safeNumber(salarioManual) > 0) {
        salario = safeNumber(salarioManual);
        auxilios = 0;
        planCompl = 0;
        auxTransporte = salario <= smmlv * 2 ? auxTransporteLegal : 0;
        dotacion = salario <= smmlv * 2 ? safeNumber(parametros?.dotacion) : 0;
        ss = calcularSsDinamico(salario, smmlv);
        prestaciones = calcularPrestacionesDinamico(salario, smmlv, auxTransporteLegal);
    } else if (salario > smmlv * 2) {
        auxTransporte = 0;
    }

    const totalBaseAux = salario + auxilios;
    const totalNomina = totalBaseAux + planCompl + auxTransporte + dotacion + ss + prestaciones;
    const equipoTipo = String(cargoData?.equipo_tipo || '1');
    const equipoCosto = resolveEquipoCosto(equipos, equipoTipo);
    const gtoVinc = totalNomina > 0 ? safeNumber(gtoVinculacion) : 0;
    const proviIndem = totalNomina * 0.013;
    const costoTotal = totalNomina + equipoCosto + gtoVinc + safeNumber(staffCinte) + proviIndem;
    const tasa = safeNumber(parametros?.tasas?.[String(plazo)], safeNumber(parametros?.tasas?.['45']));
    const costoFinanciado = costoTotal * (1 + tasa);
    const tarifaMesCop = costoFinanciado * (1 + safeNumber(margen));

    const tasaMoneda = safeNumber(parametros?.monedas?.[String(moneda)]?.tasa, 1);
    let tarifaMes = tarifaMesCop;
    if (moneda === 'USD') tarifaMes = tasaMoneda ? tarifaMesCop / tasaMoneda : tarifaMesCop;
    if (moneda === 'CLP') tarifaMes = tarifaMesCop * tasaMoneda;
    if (moneda !== 'USD' && moneda !== 'CLP' && moneda !== 'COP') {
        tarifaMes = tasaMoneda ? tarifaMesCop / tasaMoneda : tarifaMesCop;
    }

    const diasMes = safeNumber(parametros?.dias_mes, 20);
    const horasDia = safeNumber(parametros?.horas_dia, 9);
    const tarifaDia = diasMes > 0 ? tarifaMes / diasMes : 0;
    const tarifaHora = horasDia > 0 ? tarifaDia / horasDia : 0;

    return {
        cargo: String(cargoData?.cargo || ''),
        modo: String(modo).toUpperCase() === 'MANUAL' ? 'MANUAL' : 'AUTO',
        salario: round2(salario),
        auxilios: round2(auxilios),
        total_base_aux: round2(totalBaseAux),
        plan_compl: round2(planCompl),
        aux_transporte: round2(auxTransporte),
        dotacion: round2(dotacion),
        ss: round2(ss),
        prestaciones: round2(prestaciones),
        total_nomina: round2(totalNomina),
        equipo_costo: round2(equipoCosto),
        equipo_tipo: equipoTipo,
        gto_vinculacion: round2(gtoVinc),
        staff_cinte: round2(staffCinte),
        provi_indem: round2(proviIndem),
        costo_total: round2(costoTotal),
        tasa_financiera: round2(tasa),
        costo_financiado: round2(costoFinanciado),
        margen: round2(margen),
        tarifa_mes_cop: round2(tarifaMesCop),
        tarifa_mes: round2(tarifaMes),
        tarifa_dia: round2(tarifaDia),
        tarifa_hora: round2(tarifaHora),
        moneda: String(moneda || 'COP'),
        tasa_moneda: round2(tasaMoneda)
    };
}

function calcularCotizacion(payload, catalogos) {
    const parametros = catalogos?.parametros || {};
    const cargos = Array.isArray(catalogos?.cargos) ? catalogos.cargos : [];
    const equipos = catalogos?.equipos || {};
    const resultados = [];
    const perfiles = Array.isArray(payload?.perfiles) ? payload.perfiles : [];
    const margen = safeNumber(payload?.margen);

    if (margen < safeNumber(parametros?.margen_minimo, 0)) {
        const err = new Error('Margen minimo no alcanzado');
        err.status = 400;
        throw err;
    }

    for (const p of perfiles) {
        const modoPerfil = String(p?.modo || 'AUTO').toUpperCase();
        const cantidad = Math.max(1, Number(p?.cantidad || 1));
        let cargoData;

        if (modoPerfil === 'MANUAL') {
            const nombreCargo = String(p?.cargo_manual || '').trim();
            if (!nombreCargo) continue;
            cargoData = {
                cargo: nombreCargo,
                salario: 0,
                auxilios: 0,
                plan_compl: 0,
                aux_transporte: 0,
                ss: 0,
                prestaciones: 0,
                equipo_tipo: '1'
            };
        } else {
            const idx = Number(p?.indice);
            if (!Number.isInteger(idx) || idx < 0 || idx >= cargos.length) continue;
            cargoData = cargos[idx];
        }

        const item = calcularTarifa({
            cargoData,
            parametros,
            equipos,
            gtoVinculacion: safeNumber(catalogos?.gto_vinculacion),
            staffCinte: safeNumber(catalogos?.staff_cinte),
            plazo: String(payload?.plazo || '45'),
            margen,
            moneda: String(payload?.moneda || 'COP'),
            modo: modoPerfil === 'MANUAL' ? 'MANUAL' : 'AUTO',
            salarioManual: p?.salario_manual
        });
        item.cantidad = cantidad;
        resultados.push(item);
    }

    if (resultados.length === 0) {
        const err = new Error('No hay perfiles válidos para cotizar');
        err.status = 400;
        throw err;
    }

    return {
        cliente: String(payload?.cliente || ''),
        nit: String(payload?.nit || ''),
        comercial: String(payload?.comercial || ''),
        plazo: String(payload?.plazo || '45'),
        margen,
        meses: Math.max(1, Number(payload?.meses || 1)),
        moneda: String(payload?.moneda || 'COP'),
        tasa_conversion: payload?.tasa_conversion ?? null,
        nombre_moneda: String(payload?.nombre_moneda || ''),
        factores_he: catalogos?.factores_he || { diurna: 0.25, nocturna: 0.75, dom_diurna: 1.15, dom_nocturna: 2 },
        resultados
    };
}

function generarDashboardData(historial = []) {
    if (!Array.isArray(historial) || historial.length === 0) {
        return {
            empty: true,
            total_cot: 0,
            total_valor: 0,
            promedio: 0,
            total_perfiles: 0,
            por_comercial_count: {},
            por_comercial_valor: {},
            top_cargos: [],
            tendencia: [],
            modo_stats: { AUTO: 0, MANUAL: 0 },
            ultimas: []
        };
    }

    let totalValor = 0;
    let totalPerfiles = 0;
    const porComercialCount = {};
    const porComercialValor = {};
    const cargoCount = {};
    const modoStats = { AUTO: 0, MANUAL: 0 };
    const tendencia = {};

    for (const cot of historial) {
        const comercial = String(cot?.comercial || 'Sin asignar') || 'Sin asignar';
        porComercialCount[comercial] = (porComercialCount[comercial] || 0) + 1;
        let cotValor = 0;
        const meses = Number(cot?.meses || 1);

        for (const r of (cot?.resultados || [])) {
            const cant = Number(r?.cantidad || 1);
            const valor = Number(r?.tarifa_mes || 0) * cant * meses;
            cotValor += valor;
            totalPerfiles += cant;
            const cargo = String(r?.cargo || 'N/A');
            cargoCount[cargo] = (cargoCount[cargo] || 0) + cant;
            const modo = String(r?.modo || 'AUTO').toUpperCase() === 'MANUAL' ? 'MANUAL' : 'AUTO';
            modoStats[modo] = (modoStats[modo] || 0) + cant;
        }

        totalValor += cotValor;
        porComercialValor[comercial] = (porComercialValor[comercial] || 0) + cotValor;
        const iso = String(cot?.fecha_generacion_iso || '');
        const legacyFecha = String(cot?.fecha || '');
        const fechaKey =
            iso.length >= 7
                ? iso.slice(0, 7)
                : /^\d{4}-\d{2}/.test(legacyFecha)
                  ? legacyFecha.slice(0, 7)
                  : '';
        if (fechaKey) tendencia[fechaKey] = (tendencia[fechaKey] || 0) + 1;
    }

    const topCargos = Object.entries(cargoCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const tendenciaSorted = Object.entries(tendencia).sort((a, b) => a[0].localeCompare(b[0]));
    const ultimas = [...historial].reverse().slice(0, 10).map((cot) => {
        const meses = Number(cot?.meses || 1);
        const valor = (cot?.resultados || []).reduce((acc, r) => acc + Number(r?.tarifa_mes || 0) * Number(r?.cantidad || 1) * meses, 0);
        return {
            id: cot?.id,
            fecha: cot?.fecha || '',
            cliente: cot?.cliente || '',
            comercial: cot?.comercial || 'N/A',
            perfiles: Array.isArray(cot?.resultados) ? cot.resultados.length : 0,
            valor: round2(valor)
        };
    });

    return {
        empty: false,
        total_cot: historial.length,
        total_valor: round2(totalValor),
        promedio: historial.length ? round2(totalValor / historial.length) : 0,
        total_perfiles: totalPerfiles,
        por_comercial_count: porComercialCount,
        por_comercial_valor: Object.fromEntries(Object.entries(porComercialValor).map(([k, v]) => [k, round2(v)])),
        top_cargos: topCargos,
        tendencia: tendenciaSorted,
        modo_stats: modoStats,
        ultimas
    };
}

module.exports = {
    calcularSsDinamico,
    calcularPrestacionesDinamico,
    calcularCotizacion,
    generarDashboardData
};

