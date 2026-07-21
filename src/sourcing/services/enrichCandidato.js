'use strict';

/**
 * Enriquecimiento on-demand (GitHub API + placeholder LinkedIn vía EnrichLayer en ruta).
 */
async function enrichGithubProfile(url) {
    const match = String(url || '').match(/github\.com\/([^/?#]+)/i);
    if (!match) return { status: 'sin_datos', mensaje: 'URL de GitHub inválida' };
    const user = match[1];
    const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'CINTE-Sourcing' };
    const resultado = {};
    const ghRes = await fetch(`https://api.github.com/users/${encodeURIComponent(user)}`, { headers });
    if (ghRes.ok) {
        const d = await ghRes.json();
        resultado.email = d.email || '';
        resultado.resumen_perfil = d.bio || '';
        resultado.portafolio_url = d.blog || '';
        resultado.foto_url = d.avatar_url || '';
        resultado.nombre = d.name || user;
    }
    try {
        const socRes = await fetch(
            `https://api.github.com/users/${encodeURIComponent(user)}/social_accounts`,
            { headers }
        );
        if (socRes.ok) {
            for (const red of await socRes.json()) {
                if (String(red.provider || '').toLowerCase().includes('linkedin')) {
                    resultado.linkedin_url = red.url || '';
                    break;
                }
            }
        }
    } catch {
        /* optional */
    }
    if (!Object.values(resultado).some(Boolean)) {
        return { status: 'sin_datos', mensaje: 'Sin datos públicos adicionales en GitHub.' };
    }
    return { status: 'ok', ...resultado };
}

module.exports = { enrichGithubProfile };
