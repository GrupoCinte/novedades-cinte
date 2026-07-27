export function groupActividadesByCliente(items = []) {
    const clientes = new Map();
    for (const item of items) {
        const cliente = String(item?.cliente || 'Sin cliente').trim() || 'Sin cliente';
        const cedula = String(item?.cedula || '').trim();
        const consultor = String(item?.consultor_nombre || 'Sin nombre').trim() || 'Sin nombre';
        if (!clientes.has(cliente)) clientes.set(cliente, new Map());
        const consultores = clientes.get(cliente);
        const consultantKey = `${cedula}::${consultor}`;
        if (!consultores.has(consultantKey)) consultores.set(consultantKey, { cedula, nombre: consultor, actividades: [] });
        consultores.get(consultantKey).actividades.push(item);
    }
    return [...clientes.entries()].map(([cliente, consultores]) => ({ cliente, consultores: [...consultores.values()] }));
}
