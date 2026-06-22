import { 
    signIn, 
    signOut, 
    confirmSignIn, 
    resetPassword, 
    confirmResetPassword, 
    updatePassword, 
    fetchAuthSession 
} from 'aws-amplify/auth';

/**
 * Lee la sesión actual de Amplify y extrae el usuario y rol.
 */
async function getAuthUser() {
    try {
        const session = await fetchAuthSession();
        if (!session || !session.tokens || !session.tokens.idToken) return null;
        
        const payload = session.tokens.idToken.payload;
        const groups = payload['cognito:groups'] || [];
        
        // Simular la respuesta legacy del backend
        return {
            id: payload.sub,
            email: payload.email,
            name: payload.name || payload.email,
            role: groups[0] || 'consultor',
            permissions: []
        };
    } catch (e) {
        return null;
    }
}

// Mantener esto por retrocompatibilidad temporal con el SPA si es necesario
export function buildCsrfHeaders(headers = {}) {
    return headers; 
}

export async function cognitoSignIn(emailOrUsername, password, roleRequested = '') {
    try {
        const { isSignedIn, nextStep } = await signIn({
            username: emailOrUsername,
            password
        });

        if (nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
            const err = new Error('NEW_PASSWORD_REQUIRED');
            err.status = 409;
            err.payload = { challenge: 'NEW_PASSWORD_REQUIRED', session: 'amplify_internal' };
            throw err;
        }

        if (isSignedIn) {
            const user = await getAuthUser();
            return { ok: true, user };
        }
        
        throw new Error('No se recibió confirmación de sesión.');
    } catch (e) {
        if (e.status === 409) throw e;
        const msg = String(e.message || 'Error en red');
        throw new Error(msg);
    }
}

export async function cognitoCompleteNewPassword(emailOrUsername, session, newPassword, phoneNumber = '', roleRequested = '') {
    try {
        const { isSignedIn, nextStep } = await confirmSignIn({
            challengeResponse: newPassword
        });

        if (isSignedIn) {
            const user = await getAuthUser();
            return { ok: true, user };
        }
        
        throw new Error('No se pudo confirmar el cambio de contraseña');
    } catch (e) {
        throw new Error(e.message || 'Error confirmando contraseña');
    }
}

export async function cognitoForgotPassword(emailOrUsername) {
    try {
        const output = await resetPassword({ username: emailOrUsername });
        return { ok: true, nextStep: output.nextStep };
    } catch (e) {
        throw new Error(e.message || 'Error solicitando restablecimiento');
    }
}

export async function cognitoResetPassword(emailOrUsername, code, newPassword) {
    try {
        await confirmResetPassword({
            username: emailOrUsername,
            confirmationCode: code,
            newPassword
        });
        return { ok: true };
    } catch (e) {
        throw new Error(e.message || 'Error restableciendo contraseña');
    }
}

export async function cognitoChangePassword(currentPassword, newPassword) {
    try {
        await updatePassword({ oldPassword: currentPassword, newPassword });
        return { ok: true };
    } catch (e) {
        throw new Error(e.message || 'Error cambiando contraseña');
    }
}

export async function cognitoSignOut() {
    try {
        await signOut();
    } catch (e) {
        console.error('Error durante el cierre de sesión', e);
    }
}
