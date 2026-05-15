import { buildCsrfHeaders } from './cognitoAuth';

let installed = false;

/** AbortController / remount (p. ej. StrictMode): no es fallo de red ni “desconexión”. */
function isBenignFetchAbort(e) {
    if (!e) return false;
    if (e.name === 'AbortError') return true;
    const msg = String(e.message || e);
    return /aborted/i.test(msg);
}

/** HMR de Vite en dev: ruido en `unhandledrejection`, no aporta al diagnóstico de la app. */
function isBenignViteWsRejection(msg, stack) {
    const m = String(msg || '');
    const s = String(stack || '');
    if (!m.includes('WebSocket') && !m.includes('websocket')) return false;
    return s.includes('@vite/client') || s.includes('vite') || m.includes('without opened');
}

function postTrace(payload) {
    const route = typeof window !== 'undefined' ? window.location.pathname : '';
    const body = { ...payload, route: payload.route || route };
    fetch('/api/dev/client-trace', {
        method: 'POST',
        credentials: 'include',
        headers: buildCsrfHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body)
    }).catch(() => {});
}

/**
 * Solo desarrollo: errores de ventana, promesas no manejadas y fallos de red/5xx en fetch a /api.
 * Los eventos se guardan en el backend en `logs/client-trace.jsonl` (RUNTIME_AUDIT).
 */
export function installRuntimeClientTrace() {
    if (!import.meta.env.DEV || installed || typeof window === 'undefined') return;
    installed = true;

    window.addEventListener('error', (ev) => {
        postTrace({
            kind: 'window_error',
            message: String(ev.message || ''),
            stack: ev.error && ev.error.stack ? String(ev.error.stack) : '',
            detail: { filename: ev.filename, lineno: ev.lineno, colno: ev.colno }
        });
    });

    window.addEventListener('unhandledrejection', (ev) => {
        const r = ev.reason;
        let msg;
        let stack = '';
        if (r instanceof Error) {
            msg = r.message;
            stack = r.stack || '';
        } else {
            msg = typeof r === 'object' ? JSON.stringify(r) : String(r);
        }
        if (isBenignViteWsRejection(msg, stack)) return;
        postTrace({
            kind: 'unhandledrejection',
            message: msg,
            stack
        });
    });

    const orig = window.fetch.bind(window);
    window.fetch = async (...args) => {
        try {
            const res = await orig(...args);
            const url = String(args[0] instanceof Request ? args[0].url : args[0] || '');
            if (url.includes('/api/') && !url.includes('/api/dev/client-trace')) {
                const rid = res.headers.get('x-request-id') || '';
                if (!res.ok && res.status >= 500) {
                    postTrace({
                        kind: 'fetch_http',
                        reqId: rid,
                        message: `HTTP ${res.status}`,
                        url: url.slice(0, 400),
                        detail: { status: res.status }
                    });
                }
            }
            return res;
        } catch (e) {
            if (isBenignFetchAbort(e)) throw e;
            const url = String(args[0] instanceof Request ? args[0].url : args[0] || '');
            if (url.includes('/api/')) {
                postTrace({
                    kind: 'fetch_network',
                    message: e && e.message ? String(e.message) : 'fetch failed',
                    url: url.slice(0, 400)
                });
            }
            throw e;
        }
    };
}
