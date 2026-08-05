/** Permiso del submódulo Monitoreo de actividades, definido en src/rbac.js. */
export function userHasMonitoreoAccess(auth) {
    const panels = auth?.user?.panels;
    return Array.isArray(panels) && panels.includes('monitoreo');
}
