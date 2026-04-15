function parseErrorMessage(payload) {
    if (!payload) return 'Error de autenticacion';
    return payload.message || payload.error || payload.__type || 'Error de autenticacion';
}

/**
 * Lee el cuerpo como texto y parsea JSON. Si falla, devuelve un objeto marcado para mensajes claros
 * (evita el genérico «Error de autenticacion» cuando el proxy devuelve HTML o el backend no responde).
 */
async function readResponseJson(res) {
    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed) return { _emptyBody: true };
    try {
        return JSON.parse(text);
    } catch {
        return { _nonJson: true, _snippet: trimmed.replace(/\s+/g, ' ').slice(0, 100) };
    }
}

function messageFromLoginFailure(res, data) {
    if (data && typeof data === 'object') {
        const fromApi = data.message || data.error || data.__type;
        if (fromApi) return String(fromApi);
        if (data._nonJson) {
            return res.ok
                ? 'El servidor respondió con algo que no es JSON (suele pasar si /api/login devuelve la página web en lugar de la API: revisa que el backend esté en marcha y el proxy de Vite en react-frontend/vite.config.js).'
                : `Error HTTP ${res.status}${res.statusText ? ` (${res.statusText})` : ''}; la respuesta no es JSON.`;
        }
        if (data._emptyBody && !res.ok) {
            return `Error HTTP ${res.status}${res.statusText ? ` (${res.statusText})` : ''}`;
        }
    }
    if (!res.ok) {
        return `Error HTTP ${res.status}${res.statusText ? ` (${res.statusText})` : ''}`;
    }
    return 'No se recibió token de sesión. Revisa la consola del servidor (log «Error login») o vuelve a intentar.';
}

function readStoredAuth() {
    try {
        return JSON.parse(localStorage.getItem('cinteAuth') || 'null');
    } catch {
        return null;
    }
}

export async function cognitoSignIn(emailOrUsername, password, roleRequested = '') {
    let res;
    try {
        res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: emailOrUsername,
                username: emailOrUsername,
                password,
                roleRequested
            })
        });
    } catch (e) {
        const raw = e && e.message ? String(e.message) : 'Error de red';
        const hint =
            /failed to fetch|networkerror|load failed/i.test(raw) && import.meta.env.DEV
                ? ' Comprueba que el backend esté en ejecución (p. ej. puerto 3005) y que Vite esté proxyando /api.'
                : '';
        throw new Error(`${raw}.${hint}`);
    }
    const data = await readResponseJson(res);
    if (!res.ok || !data?.token) {
        const err = new Error(messageFromLoginFailure(res, data));
        err.status = res.status;
        err.payload = data;
        throw err;
    }
    return data;
}

export async function cognitoCompleteNewPassword(emailOrUsername, session, newPassword, phoneNumber = '', roleRequested = '') {
    const res = await fetch('/api/auth/complete-new-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: emailOrUsername,
            session,
            newPassword,
            phoneNumber,
            roleRequested
        })
    });
    const data = await readResponseJson(res);
    if (!res.ok || !data?.token) {
        const err = new Error(messageFromLoginFailure(res, data));
        err.status = res.status;
        err.payload = data;
        throw err;
    }
    return data;
}

export async function cognitoForgotPassword(emailOrUsername) {
    const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailOrUsername })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(parseErrorMessage(data));
    return data;
}

export async function cognitoResetPassword(emailOrUsername, code, newPassword) {
    const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailOrUsername, code, newPassword })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(parseErrorMessage(data));
    return data;
}

export async function cognitoChangePassword(currentPassword, newPassword) {
    const auth = readStoredAuth();
    const token = auth?.token || '';
    if (!token) throw new Error('Sesion no valida');

    const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) throw new Error(parseErrorMessage(data));
    return data;
}

export function cognitoSignOut() {
    // Backend stateless con JWT: basta con limpiar storage del cliente.
}
