const PILL =
    'inline-flex w-fit max-w-full items-center truncate rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide';

function pill(lightCls, darkCls, isLight) {
    return `${PILL} ${isLight ? lightCls : darkCls}`;
}

const TIPO_PERSONAL = {
    consultor: ['border-sky-300 bg-sky-50 text-sky-900', 'border-sky-500/30 bg-sky-500/10 text-sky-200'],
    staff: ['border-violet-300 bg-violet-50 text-violet-900', 'border-violet-500/30 bg-violet-500/10 text-violet-200'],
    sena: ['border-amber-300 bg-amber-50 text-amber-900', 'border-amber-500/30 bg-amber-500/10 text-amber-200'],
    alianza: ['border-cyan-300 bg-cyan-50 text-cyan-900', 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200']
};

const MOTIVO_BAJA = {
    'renuncia voluntaria': ['border-amber-300 bg-amber-50 text-amber-900', 'border-amber-500/30 bg-amber-500/10 text-amber-200'],
    'termino de la obra o labor': ['border-blue-300 bg-blue-50 text-blue-900', 'border-blue-500/30 bg-blue-500/10 text-blue-200'],
    'termino de contrato': ['border-blue-300 bg-blue-50 text-blue-900', 'border-blue-500/30 bg-blue-500/10 text-blue-200'],
    absorcion: ['border-cyan-300 bg-cyan-50 text-cyan-900', 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'],
    'termino de servicio': ['border-slate-300 bg-slate-100 text-slate-800', 'border-slate-500/30 bg-slate-500/10 text-slate-300'],
    'periodo de prueba': ['border-violet-300 bg-violet-50 text-violet-900', 'border-violet-500/30 bg-violet-500/10 text-violet-200'],
    'mutuo acuerdo': ['border-emerald-300 bg-emerald-50 text-emerald-900', 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'],
    'notificacion termino de servicio': ['border-rose-300 bg-rose-50 text-rose-900', 'border-rose-500/30 bg-rose-500/10 text-rose-200']
};

const LICENCIA_TIPO = {
    maternidad: ['border-pink-300 bg-pink-50 text-pink-900', 'border-pink-500/30 bg-pink-500/10 text-pink-200'],
    paternidad: ['border-blue-300 bg-blue-50 text-blue-900', 'border-blue-500/30 bg-blue-500/10 text-blue-200'],
    lactancia: ['border-purple-300 bg-purple-50 text-purple-900', 'border-purple-500/30 bg-purple-500/10 text-purple-200']
};

const LICENCIA_ESTADO = {
    abierta: ['border-amber-300 bg-amber-50 text-amber-900', 'border-amber-500/30 bg-amber-500/10 text-amber-200'],
    cerrada: ['border-emerald-300 bg-emerald-50 text-emerald-900', 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'],
    cancelada: ['border-rose-300 bg-rose-50 text-rose-900', 'border-rose-500/30 bg-rose-500/10 text-rose-200']
};

const POLIZA_ESTADO = {
    activa: ['border-emerald-300 bg-emerald-50 text-emerald-900', 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'],
    cerrada: ['border-slate-300 bg-slate-100 text-slate-800', 'border-slate-500/30 bg-slate-500/10 text-slate-300'],
    cancelada: ['border-rose-300 bg-rose-50 text-rose-900', 'border-rose-500/30 bg-rose-500/10 text-rose-200']
};

function normalizeKey(v) {
    return String(v || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function lookup(map, raw, isLight, fallbackLabel) {
    const key = normalizeKey(raw);
    const pair = map[key];
    const label = fallbackLabel ?? raw;
    if (!label) return null;
    if (!pair) {
        return (
            <span className={pill('border-slate-300 bg-slate-100 text-slate-700', 'border-slate-500/30 bg-slate-500/10 text-slate-300', isLight)}>
                {String(label)}
            </span>
        );
    }
    return <span className={pill(pair[0], pair[1], isLight)}>{String(label)}</span>;
}

export function TipoPersonalBadge({ value, isLight, fixedLabel }) {
    const raw = fixedLabel || value;
    if (!raw) return null;
    const key = normalizeKey(value || fixedLabel);
    const label =
        fixedLabel ||
        ({ consultor: 'Consultor', staff: 'Staff', sena: 'SENA', alianza: 'Alianza' }[key] || value);
    return lookup(TIPO_PERSONAL, key, isLight, label);
}

export function MotivoBajaBadge({ value, isLight }) {
    if (!value) return null;
    return lookup(MOTIVO_BAJA, value, isLight, value);
}

export function LicenciaTipoBadge({ value, isLight }) {
    if (!value) return null;
    return lookup(LICENCIA_TIPO, value, isLight, value);
}

export function LicenciaEstadoBadge({ value, isLight }) {
    if (!value) return null;
    return lookup(LICENCIA_ESTADO, value, isLight, value);
}

export function PolizaEstadoBadge({ value, isLight }) {
    if (!value) return null;
    return lookup(POLIZA_ESTADO, value, isLight, value);
}

export function MonedaBadge({ value, isLight }) {
    if (!value) return null;
    const v = String(value).toUpperCase();
    const isUsd = v.includes('USD');
    return (
        <span
            className={pill(
                isUsd ? 'border-sky-300 bg-sky-50 text-sky-900' : 'border-slate-300 bg-slate-100 text-slate-700',
                isUsd ? 'border-sky-500/30 bg-sky-500/10 text-sky-200' : 'border-slate-500/30 bg-slate-500/10 text-slate-300',
                isLight
            )}
        >
            {v}
        </span>
    );
}

export function AreaFinanciaBadge({ value, isLight }) {
    if (!value) return null;
    return (
        <span className={pill('border-slate-300 bg-slate-100 text-slate-700', 'border-slate-500/30 bg-slate-500/10 text-slate-300', isLight)}>
            {String(value)}
        </span>
    );
}

export function DiasIngresoBadge({ dias, isLight }) {
    if (dias === '' || dias == null) return null;
    const d = Number(dias);
    const urgent = d <= 3;
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                urgent ? 'bg-amber-500/15 text-amber-700' : 'bg-sky-500/15 text-sky-700'
            } ${isLight ? '' : 'dark:text-white'}`}
        >
            {d === 0 ? 'Hoy' : `${d} día${d === 1 ? '' : 's'}`}
        </span>
    );
}

/** true si la fecha de ingreso es estrictamente posterior a hoy (zona local). */
export function isFechaIngresoFutura(fechaIngreso) {
    if (!fechaIngreso) return false;
    const s = String(fechaIngreso).slice(0, 10);
    const [y, m, d] = s.split('-').map((n) => Number(n));
    if (!y || !m || !d) return false;
    const target = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return target > today;
}

/** Estado operativo del colaborador para pills y modal (Baja / Próximos / Activo). */
export function resolveColaboradorEstado({ activo, motivoBaja, fechaIngreso }) {
    const esBaja = activo === false || Boolean(motivoBaja);
    if (esBaja) {
        return {
            key: 'baja',
            label: 'Baja',
            dot: '#e11d48',
            textCls: { light: 'text-rose-500', dark: 'text-rose-400' },
            ping: false
        };
    }
    if (isFechaIngresoFutura(fechaIngreso)) {
        return {
            key: 'proximos',
            label: 'Próximos a ingresar',
            dot: '#2F7BB8',
            textCls: { light: 'text-sky-700', dark: 'text-sky-300' },
            ping: true
        };
    }
    return {
        key: 'activo',
        label: 'Activo',
        dot: '#4f8831',
        textCls: { light: 'text-emerald-700', dark: 'text-emerald-400' },
        ping: true
    };
}

export function ColaboradorEstadoBadge({ activo, motivoBaja, fechaIngreso, isLight }) {
    const st = resolveColaboradorEstado({ activo, motivoBaja, fechaIngreso });
    if (st.key === 'proximos') {
        return (
            <span className={pill('border-sky-300 bg-sky-50 text-sky-900', 'border-sky-500/30 bg-sky-500/10 text-sky-200', isLight)}>
                {st.label}
            </span>
        );
    }
    if (st.key === 'baja') {
        return (
            <span className={pill('border-rose-300 bg-rose-50 text-rose-900', 'border-rose-500/30 bg-rose-500/10 text-rose-200', isLight)}>
                {st.label}
            </span>
        );
    }
    return (
        <span className={pill('border-emerald-300 bg-emerald-50 text-emerald-900', 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200', isLight)}>
            {st.label}
        </span>
    );
}

export function VencimientoDocBadge({ fecha, isLight }) {
    if (!fecha) return null;
    const s = String(fecha).slice(0, 10);
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return fmtPlain(fecha);
    const target = new Date(y, m - 1, d);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((target - today) / 86400000);
    let cls;
    if (diffDays < 0) {
        cls = pill('border-rose-300 bg-rose-50 text-rose-900', 'border-rose-500/30 bg-rose-500/10 text-rose-200', isLight);
    } else if (diffDays <= 30) {
        cls = pill('border-amber-300 bg-amber-50 text-amber-900', 'border-amber-500/30 bg-amber-500/10 text-amber-200', isLight);
    } else {
        cls = pill('border-emerald-300 bg-emerald-50 text-emerald-900', 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200', isLight);
    }
    return <span className={cls}>{s}</span>;
}

function fmtPlain(v) {
    const s = String(v);
    return s.length >= 10 ? s.slice(0, 10) : s;
}
