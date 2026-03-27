const { WebSocketServer } = require('ws');
const { URL } = require('url');
const { verifyContratacionWsTicket } = require('./wsTicket');

const WS_PATH = '/api/contratacion/ws';

class ContratacionWSServer {
    constructor(server, options = {}) {
        const wsSecret = options.wsSecret ? String(options.wsSecret).trim() : '';
        const authTimeoutMs = Number(options.authTimeoutMs || 8000);
        const pathOpt = options.path || WS_PATH;
        const failOpen = options.failOpen === true;

        this.wss = new WebSocketServer({ server, path: pathOpt });
        this.clients = new Set();
        this.wsSecret = wsSecret || null;
        this.authTimeoutMs = authTimeoutMs;
        this.failOpen = failOpen;

        this.wss.on('connection', (ws, req) => {
            this.clients.add(ws);

            if (this.failOpen) {
                ws.__authenticated = true;
                this._bindClientLifecycle(ws, null, null);
                return;
            }

            if (!this.wsSecret) {
                try {
                    ws.close(4403, 'Service Unavailable');
                } catch {
                    ws.terminate();
                }
                this._bindClientLifecycle(ws, null, null);
                return;
            }

            let ticket = null;
            try {
                const u = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
                ticket = (u.searchParams.get('ticket') || '').trim() || null;
            } catch {
                ticket = null;
            }

            if (ticket) {
                try {
                    verifyContratacionWsTicket(this.wsSecret, ticket);
                    ws.__authenticated = true;
                    this._bindClientLifecycle(ws, null, null);
                    return;
                } catch {
                    try {
                        ws.close(4401, 'Unauthorized');
                    } catch {
                        ws.terminate();
                    }
                    this._bindClientLifecycle(ws, null, null);
                    return;
                }
            }

            ws.__authenticated = false;
            let authTimer = setTimeout(() => {
                if (!ws.__authenticated && ws.readyState === 1) {
                    try {
                        ws.close(4401, 'Authentication timeout');
                    } catch {
                        ws.terminate();
                    }
                }
            }, this.authTimeoutMs);

            const onMessage = (raw) => {
                if (ws.__authenticated) return;
                let payload = null;
                try {
                    payload = JSON.parse(String(raw || ''));
                } catch {
                    try {
                        ws.close(4400, 'Invalid auth payload');
                    } catch {
                        ws.terminate();
                    }
                    return;
                }
                const t = (payload?.ticket != null ? String(payload.ticket) : '').trim();
                if (payload?.type !== 'AUTH' || !t) {
                    try {
                        ws.close(4401, 'Unauthorized');
                    } catch {
                        ws.terminate();
                    }
                    return;
                }
                try {
                    verifyContratacionWsTicket(this.wsSecret, t);
                } catch {
                    try {
                        ws.close(4401, 'Unauthorized');
                    } catch {
                        ws.terminate();
                    }
                    return;
                }
                ws.__authenticated = true;
                if (authTimer) clearTimeout(authTimer);
                authTimer = null;
                ws.send(JSON.stringify({ type: 'AUTH_OK' }));
            };

            this._bindClientLifecycle(ws, onMessage, authTimer);
        });
    }

    _bindClientLifecycle(ws, onMessage, authTimer) {
        if (onMessage) {
            ws.on('message', onMessage);
        }

        ws.on('close', () => {
            this.clients.delete(ws);
            if (authTimer) clearTimeout(authTimer);
        });

        ws.on('error', (error) => {
            console.error('Contratación WebSocket cliente:', error.message);
        });
    }

    broadcast(data) {
        if (this.clients.size === 0) return;
        const message = JSON.stringify(data);
        this.clients.forEach((client) => {
            if (client.readyState === 1 && client.__authenticated) {
                client.send(message);
            }
        });
    }

    close() {
        try {
            this.wss.close();
        } catch {
            // ignore
        }
    }
}

module.exports = { ContratacionWSServer, WS_PATH };
