import { atraccionAuthHeaders, parseAtraccionApiError } from './atraccionApi.js';

const PROVIDER_WORKSPACE = {
    elempleo: 'https://www.elempleo.com/co/empresas/buscar',
    linkedin: 'https://www.linkedin.com/feed/'
};

const PROVIDER_LOGIN = {
    elempleo: 'https://www.elempleo.com/co/iniciar-sesion',
    linkedin: 'https://www.linkedin.com/login'
};

export function isConnectExtensionAvailable() {
    if (typeof document === 'undefined') return false;
    return document.documentElement?.getAttribute('data-cinte-connect-extension') === '1';
}

export function isConnectExtensionStale() {
    if (typeof document === 'undefined') return false;
    return document.documentElement?.getAttribute('data-cinte-connect-extension') === '0';
}

export function openProviderWorkspaceTab(provider) {
    const url = PROVIDER_WORKSPACE[provider] || PROVIDER_LOGIN[provider];
    if (!url) return null;
    return window.open(url, '_blank', 'noopener,noreferrer');
}

/** @deprecated Use openProviderWorkspaceTab — mantiene compatibilidad con imports existentes. */
export function openProviderLoginTab(provider) {
    return openProviderWorkspaceTab(provider);
}

function requestCookiesFromExtension(provider) {
    return new Promise((resolve, reject) => {
        if (!isConnectExtensionAvailable()) {
            reject(new Error(
                isConnectExtensionStale()
                    ? 'Conector actualizado: recargue esta página (F5) e intente de nuevo.'
                    : 'Conector CINTE no detectado. Recargue esta página (F5) tras instalar la extensión.'
            ));
            return;
        }

        const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        function onMessage(event) {
            if (event.source !== window) return;
            const msg = event.data;
            if (!msg || msg.type !== 'CINTE_CAPTURE_SESSION_RESULT' || msg.requestId !== requestId) return;
            window.removeEventListener('message', onMessage);
            if (msg.ok && Array.isArray(msg.cookies) && msg.cookies.length) {
                resolve(msg.cookies);
            } else {
                reject(new Error(msg.error || 'No se pudieron leer las cookies de la sesión'));
            }
        }

        window.addEventListener('message', onMessage);
        window.postMessage(
            { type: 'CINTE_CAPTURE_SESSION', requestId, provider },
            window.location.origin
        );

        setTimeout(() => {
            window.removeEventListener('message', onMessage);
            reject(new Error('Tiempo agotado. Recargue la página e intente de nuevo.'));
        }, 20000);
    });
}

/** Lee cookies vía extensión y las guarda con la sesión CINTE (cookie HttpOnly + CSRF). */
export async function captureSessionViaExtension(provider, token) {
    const cookies = await requestCookiesFromExtension(provider);
    const res = await fetch(`/api/atraccion/integraciones/${provider}/session`, {
        method: 'POST',
        headers: atraccionAuthHeaders(token),
        credentials: 'include',
        body: JSON.stringify({ cookies })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseAtraccionApiError(data, res.statusText));
    return data;
}
