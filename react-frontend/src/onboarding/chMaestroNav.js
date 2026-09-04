/** Menú maestro CH: Consultores, Staff y SENA (AUT-314). */

export const MAESTRO_NAV_IDS = ['consultores', 'staff', 'sena'];

const MAESTRO_SET = new Set(MAESTRO_NAV_IDS);

/** Enlaces viejos del sidebar. */
const LEGACY_VIEW_ALIASES = {
    personal: { view: 'consultores', tab: 'activos' },
    bajas: { view: 'consultores', tab: 'bajas' }
};

export function isMaestroNavView(viewId) {
    return MAESTRO_SET.has(String(viewId || '').trim());
}

/** `?v=personal` / `?v=bajas` → Consultores. */
export function canonicalizeChView(rawView) {
    const key = String(rawView || '').trim();
    if (LEGACY_VIEW_ALIASES[key]) return LEGACY_VIEW_ALIASES[key].view;
    return key;
}

export function resolveMaestroTab(rawView, rawTab) {
    const key = String(rawView || '').trim();
    const tab = String(rawTab || '').trim();
    if (tab === 'bajas' || tab === 'activos') return tab;
    if (key === 'bajas') return 'bajas';
    return 'activos';
}

export function resolveChMaestroNav(rawView, rawTab) {
    const key = String(rawView || '').trim();
    const alias = LEGACY_VIEW_ALIASES[key];
    const view = alias ? alias.view : key;
    const tab = resolveMaestroTab(key, rawTab);
    return { view, tab, isMaestro: isMaestroNavView(view) };
}

export function maestroTipoPersonal(viewId) {
    if (viewId === 'staff') return 'staff';
    if (viewId === 'sena') return 'sena';
    return 'consultor';
}

/** Columnas base de Activos (y de Bajas, más extras). */
export function maestroGridColumnKeys() {
    return ['cedula', 'nombre', 'cliente', 'fecha_ingreso', 'fecha_termino', 'tipo_contrato', 'puesto'];
}

/** Bajas: Permanencia calculada y Motivo. Tipo no: ya va por menú. */
export function maestroBajasExtraColumnKeys() {
    return ['motivo_baja', 'tiempo_permanencia_meses'];
}

export function maestroBajasExcludedColumnKeys() {
    return ['tipo_personal', 'fecha_baja_efectiva'];
}
