const PROVIDER_CAPTURE_URLS = {
    elempleo: [
        'https://www.elempleo.com/co/empresas/buscar',
        'https://www.elempleo.com/co/empresas',
        'https://www.elempleo.com/co/iniciar-sesion',
        'https://www.elempleo.com/co/',
        'https://www.elempleo.com/',
        'https://elempleo.com/'
    ],
    linkedin: [
        'https://www.linkedin.com/feed/',
        'https://www.linkedin.com/',
        'https://www.linkedin.com/login'
    ]
};

const PROVIDER_TAB_PATTERNS = {
    elempleo: ['*://*.elempleo.com/*', '*://elempleo.com/*'],
    linkedin: ['*://*.linkedin.com/*']
};

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
    '__cf_bm'
]);

const ANALYTICS_NAME_RE = /^(_ga|_gid|_gat|_gcl|_hj|_fbp|_dc_gtm)/i;

const EE_AUTH_NAME_RE =
    /^(ASP\.NET_SessionId|\.ASPXAUTH|__RequestVerificationToken|FedAuth|\.AspNet\.|AuthToken|SessionToken|Usuario|ee[_-]|EE[_-])/i;

function toPayloadCookie(c) {
    return {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        expirationDate: c.expirationDate,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite
    };
}

function dedupeCookies(cookies) {
    const map = new Map();
    for (const c of cookies) {
        if (!c?.name) continue;
        const key = `${c.name}|${c.domain || ''}|${c.path || '/'}`;
        map.set(key, c);
    }
    return [...map.values()];
}

function isAnalytics(name) {
    const n = String(name || '').trim();
    if (!n) return true;
    if (ANALYTICS_COOKIE_NAMES.has(n)) return true;
    return ANALYTICS_NAME_RE.test(n);
}

function cookieSummary(cookies) {
    return cookies.map((c) => c.name).sort().join(', ');
}

function validateElempleo(cookies) {
    const names = cookies.map((c) => String(c.name));
    const nonAnalytics = cookies.filter((c) => !isAnalytics(c.name));
    const authLike = cookies.filter((c) => EE_AUTH_NAME_RE.test(String(c.name)));
    const httpOnly = cookies.filter((c) => c.httpOnly === true);
    const hasEmpresasTab = cookies.some((c) => String(c.path || '').includes('/empresas') || String(c.domain || '').includes('elempleo'));

    if (nonAnalytics.length < 2) {
        throw new Error(
            `Solo cookies publicitarias (${cookieSummary(cookies)}). ` +
            'El Empleo no expuso sesión a la extensión. Use «Conectar (navegador automático)» ' +
            'o inicie sesión en /co/empresas/buscar y reintente.'
        );
    }

    const hasAspxAuth = cookies.some((c) => {
        const n = String(c.name || '');
        return n === '.ASPXAUTH' || n.startsWith('.ASPXAUTH');
    });
    if (!hasAspxAuth) {
        throw new Error(
            `Falta cookie .ASPXAUTH (detectadas: ${cookieSummary(cookies)}). ` +
            'Use «Conectar (navegador automático)» e inicie sesión completa en /co/empresas/buscar.'
        );
    }

    if (authLike.length === 0 && httpOnly.length === 0) {
        throw new Error(
            `No hay cookies HttpOnly de sesión (detectadas: ${cookieSummary(cookies)}). ` +
            'Cierre sesión en El Empleo, vuelva a entrar como Administrador en /co/empresas/buscar y guarde de nuevo.'
        );
    }

    if (authLike.length === 0 && nonAnalytics.length < 3) {
        throw new Error(
            `Pocas cookies útiles (${cookieSummary(cookies)}). ` +
            'Confirme la pestaña empresarial abierta y reintente.'
        );
    }

    return { names, nonAnalytics: nonAnalytics.length, authLike: authLike.length, httpOnly: httpOnly.length, hasEmpresasTab };
}

function validateLinkedin(cookies) {
    const names = new Set(cookies.map((c) => c.name));
    if (!names.has('li_at')) {
        throw new Error('Falta cookie li_at. Inicie sesión en LinkedIn y guarde de nuevo.');
    }
}

async function cookiesForUrl(url) {
    if (!url) return [];
    try {
        return await chrome.cookies.getAll({ url });
    } catch {
        return [];
    }
}

async function gatherFromOpenTabs(provider) {
    const patterns = PROVIDER_TAB_PATTERNS[provider] || [];
    let merged = [];
    try {
        const tabs = await chrome.tabs.query({ url: patterns });
        for (const tab of tabs || []) {
            if (!tab.url || tab.url.startsWith('chrome')) continue;
            merged = merged.concat(await cookiesForUrl(tab.url));
        }
    } catch {
        /* tabs permission or query failed */
    }
    return merged;
}

async function gatherAllDomainCookies(provider) {
    const needle = provider === 'elempleo' ? 'elempleo' : 'linkedin';
    try {
        const all = await chrome.cookies.getAll({});
        return all.filter((c) => String(c.domain || '').toLowerCase().includes(needle));
    } catch {
        return [];
    }
}

async function gatherProviderCookies(provider) {
    const urls = PROVIDER_CAPTURE_URLS[provider];
    if (!urls?.length) throw new Error('Proveedor desconocido');

    let merged = await gatherFromOpenTabs(provider);

    for (const url of urls) {
        merged = merged.concat(await cookiesForUrl(url));
    }

    const domain = provider === 'elempleo' ? 'elempleo.com' : 'linkedin.com';
    try {
        merged = merged.concat(await chrome.cookies.getAll({ domain }));
    } catch {
        /* ignore */
    }

    merged = merged.concat(await gatherAllDomainCookies(provider));

    return dedupeCookies(merged);
}

async function readProviderCookies(provider) {
    const cookies = await gatherProviderCookies(provider);
    if (!cookies.length) {
        throw new Error(
            `No hay cookies de ${provider === 'elempleo' ? 'El Empleo' : 'LinkedIn'}. ` +
            'Abra e inicie sesión en el portal y deje esa pestaña abierta.'
        );
    }

    if (provider === 'elempleo') validateElempleo(cookies);
    if (provider === 'linkedin') validateLinkedin(cookies);

    console.info(`[CINTE connect] ${provider}: ${cookies.length} cookies (${cookieSummary(cookies)})`);
    return cookies.map(toPayloadCookie);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'CINTE_CAPTURE_SESSION') return undefined;
    readProviderCookies(message.provider)
        .then((cookies) => sendResponse({ ok: true, cookies }))
        .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
});
