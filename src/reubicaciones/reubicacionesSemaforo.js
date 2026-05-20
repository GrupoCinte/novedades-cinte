/**
 * Semáforo operativo según días restantes hasta fecha fin (zona horaria ya aplicada al calcular días).
 * @param {unknown} diasRestantes — entero; negativo = vencido
 * @returns {'Verde' | 'Amarillo' | 'Rojo' | 'Vencido' | null}
 */
function semaforoFromDiasRestantes(diasRestantes) {
    if (diasRestantes === null || diasRestantes === undefined) return null;
    const n = Number(diasRestantes);
    if (!Number.isFinite(n)) return null;
    if (n < 0) return 'Vencido';
    if (n > 30) return 'Verde';
    if (n >= 15) return 'Amarillo';
    return 'Rojo';
}

module.exports = { semaforoFromDiasRestantes };
