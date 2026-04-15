/**
 * Panel «directorio» (cliente–líder, colaboradores, GP interno). Alineado con POLICY en src/rbac.js.
 */

import { getPanelsFromToken } from './comercialAccess';

export function userHasDirectorioPanel(token) {
    return getPanelsFromToken(token).includes('directorio');
}
