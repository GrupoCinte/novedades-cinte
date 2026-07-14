function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function round2(value) {
    return Number(safeNumber(value).toFixed(2));
}

export function calcularSsDinamico(salarioBase, smmlv, arlRiesgo = 0.0052) {
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

export function calcularPrestacionesDinamico(salarioBase, smmlv, auxTransporteLegal) {
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

export function calcularTarifa({
    cargoData,
    parametros,
    equipos,
    gtoVinculacion,
    staffCinte,
    plazo = '45',
    margen = 0.3,
    moneda = 'COP',
    modo = 'AUTO',
    salarioManual = null,
    valorHoraManual = null
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
    let tarifaHora = horasDia > 0 ? tarifaDia / horasDia : 0;

    if (String(modo).toUpperCase() === 'MANUAL' && safeNumber(valorHoraManual) > 0) {
        const vHora = safeNumber(valorHoraManual);
        // Costo base hora (incluyendo provisión indemnización similar a la mensual)
        const costoTotalHora = vHora + (vHora * 0.013);
        const costoFinHora = costoTotalHora * (1 + tasa);
        const tarifaHoraCop = costoFinHora * (1 + safeNumber(margen));
        
        let tHora = tarifaHoraCop;
        if (moneda === 'USD') tHora = tasaMoneda ? tarifaHoraCop / tasaMoneda : tarifaHoraCop;
        else if (moneda === 'CLP') tHora = tarifaHoraCop * tasaMoneda;
        else if (moneda !== 'COP') tHora = tasaMoneda ? tarifaHoraCop / tasaMoneda : tarifaHoraCop;
        
        tarifaHora = tHora;
    }

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

export function calcularCotizacionFront(payload, catalogos) {
    const parametros = catalogos?.parametros || {};
    const cargos = Array.isArray(catalogos?.cargos) ? catalogos.cargos : [];
    const equipos = catalogos?.equipos || {};
    const resultados = [];
    const perfiles = Array.isArray(payload?.perfiles) ? payload.perfiles : [];
    const margen = safeNumber(payload?.margen);

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
            salarioManual: p?.salario_manual,
            valorHoraManual: p?.valor_hora_manual
        });
        item.cantidad = cantidad;
        resultados.push(item);
    }

    const subtotal = resultados.reduce((acc, r) => acc + (r.tarifa_mes * r.cantidad * safeNumber(payload?.meses, 1)), 0);
    const iva = subtotal * 0.19;
    const total = subtotal + iva;

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
        resultados,
        subtotal: round2(subtotal),
        iva: round2(iva),
        total: round2(total)
    };
}
