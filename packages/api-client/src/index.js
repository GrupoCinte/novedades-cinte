import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from 'aws-amplify/auth';
import { buildCsrfHeaders } from '@cinte/shared/cognitoAuth.js';

/**
 * Configuración global de Amplify para el entorno de Micro Frontends.
 * Se alimenta de las variables de entorno de Vite (.env.local).
 */
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || 'us-east-1_F4XM1LUlf',
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '6rp314ha30sfibmveie4d0d10f',
    }
  }
});

/**
 * Cliente HTTP estandarizado para hacer peticiones al backend Express autoalojado.
 * Inyecta automáticamente el token JWT de Cognito si la sesión está activa.
 */
export async function apiFetch(path, options = {}) {
  let token = null;
  try {
    const session = await fetchAuthSession();
    if (session && session.tokens && session.tokens.idToken) {
      token = session.tokens.idToken.toString();
    }
  } catch (e) {
    // Fallback: si Amplify falla en el MFE (por falta de env vars en el build), leer directamente de localStorage
    try {
      const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID || '6rp314ha30sfibmveie4d0d10f';
      const lastUser = localStorage.getItem(`CognitoIdentityServiceProvider.${clientId}.LastAuthUser`);
      if (lastUser) {
        token = localStorage.getItem(`CognitoIdentityServiceProvider.${clientId}.${lastUser}.idToken`);
      }
    } catch(err2) {
      // Ignorar fallos de fallback
    }
  }

  const headers = buildCsrfHeaders({
    'Content-Type': 'application/json',
    'Bypass-Tunnel-Reminder': 'true',
    ...(options.headers || {}),
  });

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Prepend API URL si el path es relativo
  const baseUrl = import.meta.env.VITE_API_URL || 'https://small-bobcats-throw.loca.lt';
  const fullPath = path.startsWith('http') ? path : `${baseUrl}${path}`;

  const finalCredentials = options.credentials || 'omit';

  return fetch(fullPath, {
    ...options,
    credentials: finalCredentials, // Respetar si el llamador envía 'include'
    headers,
  });
}
