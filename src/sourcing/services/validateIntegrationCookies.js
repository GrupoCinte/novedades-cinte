'use strict';

/** Cookies de tracking que no autentican por sí solas. */
const ANALYTICS_COOKIE_NAMES = new Set([
    '_scor_uid',
    'permutive-id',
    'connectId',
    '_ga',
    '_gid',
    '_gat',
    '_fbp',
    '_gcl_au',
    'optimizelyEndUserId',
    '__cf_bm',
    '_hjSessionUser',
    '_hjSession',
    'AMP_TOKEN',
    'FPID',
    'FPLC'
]);

const ANALYTICS_NAME_RE = /^(_ga|_gid|_gat|_gcl|_hj|_fbp|_dc_gtm)/i;

/** Patrones típicos de sesión El Empleo / ASP.NET empresarial. */
const EE_AUTH_NAME_RE =
    /^(ASP\.NET_SessionId|\.ASPXAUTH|__RequestVerificationToken|FedAuth|\.AspNet\.|AuthToken|SessionToken|Usuario|ee[_-]|EE[_-])/i;

const LI_REQUIRED = new Set(['li_at']);

function isAnalyticsCookie(name) {
    const n = String(name || '').trim();
    if (!n) return true;
    if (ANALYTICS_COOKIE_NAMES.has(n)) return true;
    return ANALYTICS_NAME_RE.test(n);
}

function normalizeCookieList(cookies) {
    if (!Array.isArray(cookies)) return [];
    return cookies.filter((c) => c && String(c.name || '').trim() && String(c.value || '').length > 0);
}

/**
 * @returns {{ ok: true, cookies: object[], summary: object } | { ok: false, error: string }}
 */
function validateIntegrationCookies(provider, rawCookies) {
    const cookies = normalizeCookieList(rawCookies);
    if (!cookies.length) {
        return {
            ok: false,
            error: 'No se recibieron cookies. Inicie sesión en el portal e intente de nuevo.'
        };
    }

    if (provider === 'elempleo') {
        return validateElempleoCookies(cookies);
    }
    if (provider === 'linkedin') {
        return validateLinkedinCookies(cookies);
    }
    return { ok: false, error: `Proveedor no soportado: ${provider}` };
}

function validateElempleoCookies(cookies) {
    const names = cookies.map((c) => String(c.name));
    const nonAnalytics = cookies.filter((c) => !isAnalyticsCookie(c.name));
    const authLike = cookies.filter((c) => EE_AUTH_NAME_RE.test(String(c.name)));
    const httpOnly = cookies.filter((c) => c.httpOnly === true);

    const summary = {
        total: cookies.length,
        nonAnalytics: nonAnalytics.length,
        authLike: authLike.length,
        httpOnly: httpOnly.length,
        names
    };

    if (nonAnalytics.length < 2) {
        return {
            ok: false,
            error:
                'Sesión incompleta: solo se detectaron cookies de publicidad. ' +
                'Use «Conectar (navegador automático)» en Integraciones, o abra ' +
                'https://www.elempleo.com/co/empresas/buscar (cuenta empresa) y guarde de nuevo.',
            summary
        };
    }

    if (authLike.length === 0 && httpOnly.length === 0) {
        return {
            ok: false,
            error:
                'No se detectó cookie de sesión empresarial (faltan cookies HttpOnly de autenticación). ' +
                'Inicie sesión en El Empleo → zona empresas → buscar candidatos, y guarde de nuevo.',
            summary
        };
    }

    if (authLike.length === 0 && nonAnalytics.length < 3) {
        return {
            ok: false,
            error:
                'La sesión guardada parece insuficiente para el worker. ' +
                'Use la pestaña de búsqueda empresarial antes de guardar.',
            summary
        };
    }

    return { ok: true, cookies, summary };
}

function validateLinkedinCookies(cookies) {
    const names = new Set(cookies.map((c) => String(c.name)));
    if (!LI_REQUIRED.has('li_at') || !names.has('li_at')) {
        return {
            ok: false,
            error:
                'Falta la cookie de sesión LinkedIn (li_at). Inicie sesión en linkedin.com y guarde de nuevo.'
        };
    }
    return {
        ok: true,
        cookies,
        summary: { total: cookies.length, names: [...names] }
    };
}

module.exports = {
    validateIntegrationCookies,
    isAnalyticsCookie,
    ANALYTICS_COOKIE_NAMES,
    EE_AUTH_NAME_RE
};
