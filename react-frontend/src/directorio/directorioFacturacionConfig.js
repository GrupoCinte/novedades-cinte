/** Espejo de src/directorio/directorioFacturacionConfig.js (mantener en sync). */

export const DEFAULT_FACTURACION_FORM = {
    diaCorte: '30',
    reglaTipo: 'CALENDARIO_30',
    reglaDetalle: '',
    horasBase: '',
    slaDiasVerde: '10',
    slaDiasAmarillo: '5'
};

export function facturacionFormFromApiRow(row) {
    if (!row) return { ...DEFAULT_FACTURACION_FORM };
    return {
        diaCorte: String(row.dia_corte ?? 30),
        reglaTipo: String(row.regla_tipo || 'CALENDARIO_30'),
        reglaDetalle: String(row.regla_detalle || ''),
        horasBase: row.horas_base != null ? String(row.horas_base) : '',
        slaDiasVerde: String(row.sla_dias_verde ?? 10),
        slaDiasAmarillo: String(row.sla_dias_amarillo ?? 5)
    };
}

export function formatSlaBandsPreview(slaDiasVerde, slaDiasAmarillo) {
    const verde = Number(slaDiasVerde);
    const amarillo = Number(slaDiasAmarillo);
    if (!Number.isFinite(verde) || !Number.isFinite(amarillo) || verde <= amarillo) {
        return 'Verde: ≥? · Amarillo: ?–? · Rojo: ≤?';
    }
    const rojoMax = amarillo - 1;
    return `Verde: ≥${verde} · Amarillo: ${amarillo}–${verde - 1} · Rojo: ≤${rojoMax}`;
}

export function validateFacturacionForm(form) {
    const errors = {};
    const diaRaw = String(form?.diaCorte ?? '').trim();
    const dia = diaRaw === '' ? NaN : Number(diaRaw);
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
        errors.diaCorte = 'Día de corte: entero entre 1 y 31.';
    }
    if (form?.reglaTipo === 'HORAS_BASE') {
        const hb = Number(form.horasBase);
        if (!Number.isFinite(hb) || hb <= 0) {
            errors.horasBase = 'Horas base obligatorias y mayor que 0 para regla HORAS_BASE.';
        }
    }
    const slaVerde = Number(form?.slaDiasVerde);
    const slaAmarillo = Number(form?.slaDiasAmarillo);
    if (!Number.isInteger(slaVerde) || slaVerde < 0 || slaVerde > 60) {
        errors.slaDiasVerde = 'Días verde: entero entre 0 y 60.';
    }
    if (!Number.isInteger(slaAmarillo) || slaAmarillo < 0 || slaAmarillo > 60) {
        errors.slaDiasAmarillo = 'Días amarillo: entero entre 0 y 60.';
    }
    if (
        Number.isInteger(slaVerde) &&
        Number.isInteger(slaAmarillo) &&
        !errors.slaDiasVerde &&
        !errors.slaDiasAmarillo &&
        slaVerde <= slaAmarillo
    ) {
        errors.slaDiasVerde = 'Debe ser mayor que los días amarillo.';
    }
    return { ok: Object.keys(errors).length === 0, errors };
}

export function buildFacturacionPayload(form) {
    return {
        diaCorte: Number(form.diaCorte),
        reglaTipo: form.reglaTipo,
        reglaDetalle: String(form.reglaDetalle || '').trim() || null,
        horasBase:
            form.reglaTipo === 'HORAS_BASE' && form.horasBase !== ''
                ? Number(form.horasBase)
                : null,
        slaDiasVerde: Number(form.slaDiasVerde ?? 10),
        slaDiasAmarillo: Number(form.slaDiasAmarillo ?? 5)
    };
}
