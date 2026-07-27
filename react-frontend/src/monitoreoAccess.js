/** Permiso del panel Monitoreo de actividades, definido en src/rbac.js. */
/*revisa si el usuario autenticado tiene el permiso monitoreo dentro de auth.user.panels.*/
export function userHasMonitoreoAccess(auth) {
    const panels = auth?.user?.panels;
    return Array.isArray(panels) && panels.includes('monitoreo');
}
