'use strict';

const PROVIDERS = {
    elempleo: {
        label: 'El Empleo',
        descripcion: 'Base de candidatos empresarial de El Empleo Colombia.',
        loginUrl: 'https://www.elempleo.com/co/empresas/buscar',
        loginFallbackUrl: 'https://www.elempleo.com/co/iniciar-sesion',
        cookieDomain: '.elempleo.com'
    },
    linkedin: {
        label: 'LinkedIn Recruiter',
        descripcion: 'Búsqueda directa y extracción de perfiles en LinkedIn.',
        loginUrl: 'https://www.linkedin.com/login',
        cookieDomain: '.linkedin.com'
    }
};

function getProviderConfig(provider) {
    const key = String(provider || '').trim().toLowerCase();
    const cfg = PROVIDERS[key];
    if (!cfg) throw new Error(`Proveedor inválido: ${provider}`);
    return { provider: key, ...cfg };
}

module.exports = { PROVIDERS, getProviderConfig };
