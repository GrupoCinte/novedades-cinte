function parseErrorMessage(payload) {
    if (!payload) return 'Error de autenticacion';
    return payload.message || payload.error || payload.__type || 'Error de autenticacion';
}

function readStoredAuth() {
    try {
        return JSON.parse(localStorage.getItem('cinteAuth') || 'null');
    } catch {
        return null;
    }
}

export async function cognitoSignIn(emailOrUsername, password, roleRequested = '') {
    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: emailOrUsername,
            username: emailOrUsername,
            password,
            roleRequested
        })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.token) {
        const err = new Error(parseErrorMessage(data));
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
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.token) {
        const err = new Error(parseErrorMessage(data));
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
