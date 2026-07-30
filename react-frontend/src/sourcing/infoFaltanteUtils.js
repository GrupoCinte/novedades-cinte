import { CAMPOS_OBLIGATORIOS } from './filtrosObligatorios.js';

function hasText(v) {
    return typeof v === 'string' && v.trim().length > 0;
}

/** ¿El campo referenciado en un aviso IA ya está cubierto en el payload en vivo? */
export function isInfoCampoResuelto(campo, payload) {
    const c = payload || {};
    const key = String(campo || '').toLowerCase();
    const oblig = CAMPOS_OBLIGATORIOS.find((f) => f.campo === key);
    if (oblig) {
        try {
            return oblig.presente(c);
        } catch {
            return false;
        }
    }
    if (key === 'cargo' || key === 'titulo') return hasText(c.cargo);
    if (key === 'cargos_equivalentes' || key === 'cargo_equivalente') {
        return Array.isArray(c.cargos_equivalentes) && c.cargos_equivalentes.length > 0;
    }
    if (key === 'skills' || key === 'skills_requeridas') {
        return Array.isArray(c.skills_requeridas) && c.skills_requeridas.length > 0;
    }
    if (key === 'palabras_clave' || key === 'palabras_clave_hv') {
        return Array.isArray(c.palabras_clave_hv) && c.palabras_clave_hv.length > 0;
    }
    if (key === 'profesion') return hasText(c.profesion);
    if (key === 'idioma') return hasText(c.idioma);
    return false;
}

export function filterInfoFaltanteVisible(infoFaltante, payload) {
    const list = Array.isArray(infoFaltante) ? infoFaltante : [];
    return list.filter((item) => !isInfoCampoResuelto(item.campo, payload));
}
