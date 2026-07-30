(function initCinteConnectBridge() {
    const RELOAD_HINT =
        'Recargue esta página de CINTE (F5) después de actualizar el conector en chrome://extensions e intente de nuevo.';

    function extensionReady() {
        try {
            return Boolean(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id);
        } catch {
            return false;
        }
    }

    function markExtensionState() {
        if (extensionReady()) {
            document.documentElement.setAttribute('data-cinte-connect-extension', '1');
        } else {
            document.documentElement.setAttribute('data-cinte-connect-extension', '0');
        }
    }

    function postResult(requestId, payload) {
        window.postMessage(
            {
                type: 'CINTE_CAPTURE_SESSION_RESULT',
                requestId,
                ...payload
            },
            window.location.origin
        );
    }

    markExtensionState();

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        const msg = event.data;
        if (!msg || msg.type !== 'CINTE_CAPTURE_SESSION') return;

        if (!extensionReady()) {
            postResult(msg.requestId, {
                ok: false,
                error: RELOAD_HINT
            });
            return;
        }

        try {
            chrome.runtime.sendMessage(
                { type: 'CINTE_CAPTURE_SESSION', provider: msg.provider },
                (response) => {
                    const err = chrome.runtime.lastError;
                    if (err) {
                        const text = String(err.message || '');
                        const invalidated = /context invalidated|Extension context invalidated/i.test(text);
                        postResult(msg.requestId, {
                            ok: false,
                            error: invalidated ? RELOAD_HINT : text || 'Error del conector CINTE'
                        });
                        if (invalidated) markExtensionState();
                        return;
                    }
                    postResult(msg.requestId, response || { ok: false, error: 'Sin respuesta del conector' });
                }
            );
        } catch (exc) {
            const text = String(exc?.message || exc);
            postResult(msg.requestId, {
                ok: false,
                error: /invalidated/i.test(text) ? RELOAD_HINT : text
            });
            markExtensionState();
        }
    });
})();
