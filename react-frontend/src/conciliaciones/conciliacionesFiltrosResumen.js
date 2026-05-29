/** Trunca texto para el chip de filtros (misma idea que Gestión en Dashboard). */
function trunc(s, max) {
    const t = String(s || '').trim();
    if (!t) return '';
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** Etiqueta legible para input type="month" (YYYY-MM). */
export function formatConciliacionesMonthLabel(monthValue) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(monthValue || '').trim());
    if (!m) return '';
    const monthIdx = Number(m[2]) - 1;
    if (monthIdx < 0 || monthIdx > 11) return m[0];
    return `${MESES[monthIdx]} ${m[1]}`;
}

/**
 * Resumen de filtros activos (chip + contador) alineado con Gestión Operativa de Novedades.
 */
export function buildConciliacionesFiltrosResumen({
    clienteValue = '',
    monthValue = '',
    isFacturacion = false,
    fSearch = '',
    fEstado = '',
    fCerrado = 'TODOS',
    fProyecto = '',
    fNovedades = 'TODOS'
} = {}) {
    const parts = [];
    let n = 0;

    const cliente = String(clienteValue || '').trim();
    if (isFacturacion && !cliente) {
        n += 1;
        parts.push('Todos los clientes');
    } else if (cliente) {
        n += 1;
        parts.push(trunc(cliente, 26));
    }

    const mesLabel = formatConciliacionesMonthLabel(monthValue);
    if (mesLabel) {
        n += 1;
        parts.push(mesLabel);
    }

    if (isFacturacion) {
        const nom = String(fSearch || '').trim();
        if (nom) {
            n += 1;
            parts.push(trunc(nom, 22));
        }
        if (String(fEstado || '').trim()) {
            n += 1;
            parts.push(`Estado: ${fEstado}`);
        }
        if (String(fCerrado || '').trim() && fCerrado !== 'TODOS') {
            n += 1;
            parts.push(`Cierre: ${fCerrado === 'CERRADO' ? 'Cerrado' : 'Pendiente'}`);
        }
        if (String(fProyecto || '').trim()) {
            n += 1;
            parts.push('Proyecto');
        }
        if (String(fNovedades || '').trim() && fNovedades !== 'TODOS') {
            n += 1;
            parts.push('Novedades');
        }
    }

    const head = parts.slice(0, 2).join(' · ');
    const more = parts.length > 2 ? '…' : '';

    let chipLabel;
    if (n === 0) {
        chipLabel = isFacturacion ? 'Sin filtros activos' : 'Seleccione cliente y mes';
    } else if (n <= 2 && head) {
        chipLabel = head;
    } else {
        chipLabel = `${n} filtro${n === 1 ? '' : 's'} activo${n === 1 ? '' : 's'}${head ? ` (${head}${more})` : ''}`;
    }

    return { chipLabel, activeCount: n };
}
