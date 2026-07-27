/** Valores n8n/Dynamo que no deben participar en el orden “real” (van al final). */
export function isCancelacionSortSentinel(value) {
    const s = String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    return !s || s === 'cargando' || s === 'pendiente' || s === 'pendiente_valor' || s === 'n/a' || s === 'na';
}

/**
 * Compara filas de Cancelaciones para sort de tabla (AUT-545 / AUT-193).
 * Sentinels al final en ambos sentidos; cédula numérica cuando aplica.
 */
export function compareCancellationRows(a, b, key, dir) {
    const mul = dir === 'desc' ? -1 : 1;

    if (key === 'fecha_evento') {
        const am = Number(a?._eventMs) || 0;
        const bm = Number(b?._eventMs) || 0;
        if (am !== bm) return (am - bm) * mul;
        return String(a?.executionId ?? '').localeCompare(String(b?.executionId ?? ''), 'es');
    }

    if (key === 'fecha_inicio') {
        const av = String(a?.fecha_inicio || '');
        const bv = String(b?.fecha_inicio || '');
        const aEmpty = !av;
        const bEmpty = !bv;
        if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
        if (av !== bv) return av.localeCompare(bv, 'es') * mul;
        return String(a?.executionId ?? '').localeCompare(String(b?.executionId ?? ''), 'es');
    }

    const avRaw = a?.[key];
    const bvRaw = b?.[key];
    const aSent = isCancelacionSortSentinel(avRaw);
    const bSent = isCancelacionSortSentinel(bvRaw);
    if (aSent !== bSent) return aSent ? 1 : -1;

    if (key === 'cedula') {
        const ad = String(avRaw ?? '').replace(/\D+/g, '');
        const bd = String(bvRaw ?? '').replace(/\D+/g, '');
        if (ad && bd && /^\d+$/.test(ad) && /^\d+$/.test(bd)) {
            const an = Number(ad);
            const bn = Number(bd);
            if (an !== bn) return (an - bn) * mul;
        }
    }

    const av = String(avRaw ?? '');
    const bv = String(bvRaw ?? '');
    const cmp = av.localeCompare(bv, 'es', { sensitivity: 'base', numeric: true });
    if (cmp !== 0) return cmp * mul;
    return String(a?.executionId ?? '').localeCompare(String(b?.executionId ?? ''), 'es');
}
