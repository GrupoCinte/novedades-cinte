/** 
 * Lee una cookie por nombre.
 */
import { authHeaders as mallasAuthHeaders } from '../mallasTurnosApi.js';
import { readCookieFromDocument } from '../sourcing/atraccionApi.js';

/** 
 * Lee una cookie por nombre (reutilizando atraccionApi).
 */
export const readCookie = readCookieFromDocument;

/** 
 * Construye headers de autenticación siguiendo el patrón del proyecto (Bearer + XSRF) (reutilizando mallasTurnosApi).
 */
export const authHeaders = mallasAuthHeaders;
