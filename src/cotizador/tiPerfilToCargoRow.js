const { calcularSsDinamico, calcularPrestacionesDinamico } = require('./cotizadorEngine');

/**
 * Convierte un perfil TI (salario base + equipo) en fila de cargo del cotizador.
 * Replica la idea de `rowToCargoPerfiles` en import-cotizador-cargos-excel.js usando el motor actual.
 */
function perfilFinancieroToCargoRow({ cargoLabel, salarioBase, equipoTipo = '1', parametros = {} }) {
    const smmlv = Number(parametros?.smmlv) || 1423500;
    const auxLeg = Number(parametros?.aux_transporte_legal) || 253000;
    const tarifa = Number(salarioBase) || 0;
    const ss = calcularSsDinamico(tarifa, smmlv);
    const prestaciones = calcularPrestacionesDinamico(tarifa, smmlv, auxLeg);
    const etiqueta = String(cargoLabel || '').trim() || 'Sin etiqueta';
    return {
        cargo: etiqueta,
        salario: tarifa,
        auxilios: 0,
        plan_compl: 0,
        aux_transporte: tarifa > 0 && tarifa <= smmlv * 2 ? auxLeg : 0,
        ss,
        prestaciones,
        equipo_tipo: String(equipoTipo || '1').trim() || '1'
    };
}

module.exports = { perfilFinancieroToCargoRow };
