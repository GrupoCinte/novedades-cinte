/**
 * Montos con divisas COP / CLP / USD para fichas extendidas de consultores.
 * El valor del input debe ser solo la parte numérica (sin símbolo); el símbolo va aparte.
 */
import { parseMontoCOPInput } from './copMoneyFormat';

export const MONEY_ISO_CODES = ['COP', 'CLP', 'USD'];

const LOCALE_BY_CODE = { COP: 'es-CO', CLP: 'es-CL', USD: 'en-US' };

/**
 * Solo agrupa dígitos (sin símbolo de moneda) — evita duplicar $ y problemas de espacio Intl.
 */
export function formatMoneyAmountOnly(value, currencyCode) {
    const code = String(currencyCode || 'COP').toUpperCase();
    const v = Number(value);
    if (!Number.isFinite(v)) return '';
    const locale = LOCALE_BY_CODE[code] || 'es-CO';
    const maxFrac = code === 'CLP' ? 0 : 2;
    try {
        return new Intl.NumberFormat(locale, {
            minimumFractionDigits: 0,
            maximumFractionDigits: maxFrac
        }).format(v);
    } catch {
        return String(v);
    }
}

/** Símbolo compacto junto al selector (Intl). */
export function currencyNarrowSymbol(currencyCode) {
    const code = String(currencyCode || 'COP').toUpperCase();
    const locale = LOCALE_BY_CODE[code] || 'es-CO';
    try {
        const parts = new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: code,
            currencyDisplay: 'narrowSymbol'
        }).formatToParts(0);
        const sym = parts.find((p) => p.type === 'currency');
        return sym ? sym.value : code;
    } catch {
        return code === 'USD' ? 'US$' : '$';
    }
}

/** en-US: las comas son miles; el punto es decimal. */
function parseUSDNumberOnly(str) {
    let s = String(str || '')
        .replace(/[\u00a0\u202f\u2009]/g, ' ')
        .replace(/\$/g, '')
        .replace(/US/gi, '')
        .replace(/\s/g, '')
        .trim();
    if (!s) return null;
    s = s.replace(/,/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
}

/**
 * Parsea el contenido del campo (solo número formateado, sin prefijo de moneda).
 * COP/CLP: si el texto trae comas de miles estilo en-US (p. ej. pegado) y no hay patrón 1.234.567, usa parser USD.
 */
export function parseMoneyInput(str, currencyCode) {
    const c = String(currencyCode || 'COP').toUpperCase();
    const s = String(str || '');
    if (c === 'USD') {
        const u = parseUSDNumberOnly(str);
        if (u !== null) return u;
        return parseMontoCOPInput(str);
    }
    // COP / CLP
    const looksCOChileDots = /\d{1,3}(\.\d{3})+/.test(s);
    const looksUSCommas = /,\d{3}/.test(s);
    if (looksUSCommas && !looksCOChileDots) {
        const u = parseUSDNumberOnly(str);
        if (u !== null) return u;
    }
    const cop = parseMontoCOPInput(str);
    if (cop !== null) return cop;
    return parseUSDNumberOnly(str);
}
