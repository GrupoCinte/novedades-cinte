/** Espejo de `src/onboarding/contratoCostoCalc.js` para el overlay de la ficha. */

const FACTOR_NOMINA = 1.3936;
const FACTOR_SALARIO_INTEGRAL = 0.7;
const FACTOR_OPS_APORTES = 0.3002;
const FACTOR_OPS_SALARIO = 0.0517;

export function parseMoney(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const cleaned = String(value).trim().replace(/[$\s]/g, '');
    if (!cleaned) return 0;
    if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
        return Number(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
    }
    if (cleaned.includes(',') && cleaned.includes('.')) {
        if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
            return Number(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
        }
        return Number(cleaned.replace(/,/g, '')) || 0;
    }
    if (cleaned.includes(',')) return Number(cleaned.replace(',', '.')) || 0;
    return Number(cleaned) || 0;
}

function roundMoney(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
}

function foldEsquema(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

export function isEsquemaOps(esquema) {
    const e = foldEsquema(esquema);
    return (
        e.includes('ops') ||
        e.includes('prestacion') ||
        e.includes('honorario') ||
        e === 'cuenta propia'
    );
}

export function costoEmpresaNomina(sueldo) {
    return roundMoney(parseMoney(sueldo) * FACTOR_NOMINA);
}

export function costoEmpresaOps(input = {}) {
    const honorarios = parseMoney(input.honorarios);
    const salario = parseMoney(input.sueldoNomina ?? input.sueldo_nomina);
    const licencias = parseMoney(input.costoLicencias ?? input.costo_licencias_teams_correo);
    const equipo = parseMoney(input.costoEquipo ?? input.costo_equipo_computo);
    const auxilios = parseMoney(input.auxilios ?? input.auxilios_no_prestacionales);
    const bonos = parseMoney(input.bonos ?? input.otros_ingresos);
    const salarioIntegral = salario * FACTOR_SALARIO_INTEGRAL;
    const aportes = (honorarios + salarioIntegral) * FACTOR_OPS_APORTES;
    const aporteSalario = salario * FACTOR_OPS_SALARIO;
    return roundMoney(
        honorarios + salarioIntegral + aportes + aporteSalario + licencias + auxilios + bonos + equipo
    );
}

export function computeContratoEconomia(input = {}) {
    const tarifa = parseMoney(input.tarifaCliente ?? input.tarifa_cliente);
    const esquema = input.esquemaContrato ?? input.esquema_contrato;
    const tipo = input.tipoContrato ?? input.tipo_contrato;
    const ops = isEsquemaOps(esquema) || foldEsquema(tipo).includes('ops');
    const costo = ops
        ? costoEmpresaOps(input)
        : costoEmpresaNomina(input.sueldoNomina ?? input.sueldo_nomina);
    const utilidad = tarifa || costo ? roundMoney(tarifa - costo) : null;
    const rentabilidad =
        tarifa > 0 && utilidad != null ? Math.round((utilidad / tarifa) * 10000) / 10000 : null;
    return {
        modo: ops ? 'ops' : 'nomina',
        costo_empresa: costo || null,
        utilidad,
        rt_aprox: rentabilidad
    };
}

export function formatRentabilidadPct(value) {
    if (value == null || value === '') return '';
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return '';
    return `${(n * 100).toFixed(2)} %`;
}
