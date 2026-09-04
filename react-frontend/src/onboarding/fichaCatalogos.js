/** Catálogos cerrados y edad de la ficha CH (AUT-315). */

export const FICHA_HIDDEN_KEYS = ['estado_catalogo', 'segundo_idioma', 'modalidad_adicional'];

export const FICHA_SECCION_INDICADORES = 'Indicadores y costos';

export const SEXO_OPTIONS = ['Masculino', 'Femenino', 'No refiere'];

export const ESTADO_CIVIL_OPTIONS = ['Soltero', 'Unión libre', 'Casado', 'Viudo/a'];

export const TIPO_IDENTIFICACION_OPTIONS = [
    'Cédula de ciudadanía',
    'DNI',
    'Pasaporte',
    'Cédula de extranjería',
    'PPT',
    'NIT'
];

export const ESQUEMA_CONTRATO_OPTIONS = ['Nómina', 'Prestación de servicios', 'Comercial'];

export const TIPO_CONTRATO_OPTIONS = ['Indefinido', 'Obra o labor', 'Fijo'];

export const MODALIDAD_CONTRATO_OPTIONS = ['OPS', 'Ordinario', 'Integral'];

export const MODALIDAD_TRABAJO_OPTIONS = ['Híbrido', 'Remoto', 'Presencial'];

export const DEPARTAMENTO_OPTIONS = [
    'Amazonas',
    'Antioquia',
    'Arauca',
    'Atlántico',
    'Bogotá D.C.',
    'Bolívar',
    'Boyacá',
    'Caldas',
    'Caquetá',
    'Casanare',
    'Cauca',
    'Cesar',
    'Chocó',
    'Córdoba',
    'Cundinamarca',
    'Guainía',
    'Guaviare',
    'Huila',
    'La Guajira',
    'Magdalena',
    'Meta',
    'Nariño',
    'Norte de Santander',
    'Putumayo',
    'Quindío',
    'Risaralda',
    'San Andrés y Providencia',
    'Santander',
    'Sucre',
    'Tolima',
    'Valle del Cauca',
    'Vaupés',
    'Vichada'
];

export const FICHA_SELECT_OPTIONS = {
    sexo: SEXO_OPTIONS,
    estado_civil: ESTADO_CIVIL_OPTIONS,
    tipo_identificacion: TIPO_IDENTIFICACION_OPTIONS,
    departamento: DEPARTAMENTO_OPTIONS,
    esquema_contrato: ESQUEMA_CONTRATO_OPTIONS,
    tipo_contrato: TIPO_CONTRATO_OPTIONS,
    modalidad_contrato: MODALIDAD_CONTRATO_OPTIONS,
    modalidad_trabajo: MODALIDAD_TRABAJO_OPTIONS
};

/** Años cumplidos hasta `hoy` (civil). Vacío si la fecha no sirve. */
export function edadEnAniosHastaHoy(fechaNacimiento, hoy = new Date()) {
    const s = String(fechaNacimiento || '').slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return '';
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    const hy = hoy.getFullYear();
    const hm = hoy.getMonth() + 1;
    const hd = hoy.getDate();
    let age = hy - year;
    if (hm < month || (hm === month && hd < day)) age -= 1;
    if (age < 0 || age > 130) return '';
    return String(age);
}

/** Si el valor guardado no está en el catálogo, se lista para no perderlo. */
export function optionsWithCurrent(options, current) {
    const list = Array.isArray(options) ? [...options] : [];
    const cur = String(current || '').trim();
    if (cur && !list.includes(cur)) list.unshift(cur);
    return list;
}
