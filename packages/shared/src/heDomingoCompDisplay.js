const HE_DOMINGO_COMP_MARKER = '[HE_DOMINGO_COMP]';

/**
 * Resumen legible para gestión (alineado con backend heDomingoCompensacion).
 * @param {string} observacion
 * @returns {string}
 */
export function formatHeDomingoCompGestionResumen(observacion) {
    const raw = String(observacion || '');
    const idx = raw.indexOf(HE_DOMINGO_COMP_MARKER);
    if (idx < 0) return '';
    const line = raw.slice(idx).split(/\r?\n/)[0].trim();
    const esc = HE_DOMINGO_COMP_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(
        `${esc}\\s*modo=(tiempo|dinero|tercer_domingo);\\s*trabajado=(\\d{4}-\\d{2}-\\d{2})(?:;\\s*compensatorio=(\\d{4}-\\d{2}-\\d{2}))?`
    );
    const m = re.exec(line);
    if (!m) return '';
    const mode = m[1];
    const workedYmd = m[2];
    const compensatorioYmd = String(m[3] || '').trim();
    if (mode === 'tiempo') {
        return `Compensación dominical: tiempo — día compensatorio ${compensatorioYmd || '—'} (domingo trabajado ${workedYmd})`;
    }
    if (mode === 'dinero') {
        return `Compensación dominical: en dinero (domingo trabajado ${workedYmd})`;
    }
    if (mode === 'tercer_domingo') {
        return `Compensación dominical: tercer domingo del mes (domingo trabajado ${workedYmd})`;
    }
    return '';
}
