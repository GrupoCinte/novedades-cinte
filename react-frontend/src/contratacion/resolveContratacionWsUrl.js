/**
 * Resuelve la base WSS del monitor En ingreso.
 * Prioridad: VITE (build) → monitor-config (runtime) → WS embebido del host.
 * (Espejo de src/contratacion/resolveContratacionWsUrl.js)
 */
export function resolveContratacionWsUrl(opts = {}) {
    const vite = String(opts.viteUrl || '')
        .trim()
        .replace(/\/$/, '');
    if (vite) return vite;

    const cfg = String(opts.configUrl || '')
        .trim()
        .replace(/\/$/, '');
    if (cfg) return cfg;

    const host = String(opts.host || '').trim();
    if (!host) return '';

    const protoRaw = String(opts.proto || 'https:');
    const isSecure =
        protoRaw === 'https:' || protoRaw === 'wss:' || protoRaw === 'https' || protoRaw === 'wss';
    const wsProto = isSecure ? 'wss:' : 'ws:';
    return `${wsProto}//${host}/api/contratacion/ws`;
}

export function buildContratacionWsConnectUrl(baseUrl, ticket) {
    const base = String(baseUrl || '')
        .trim()
        .replace(/\/$/, '');
    const t = String(ticket || '').trim();
    if (!base || !t) return '';
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}ticket=${encodeURIComponent(t)}`;
}
