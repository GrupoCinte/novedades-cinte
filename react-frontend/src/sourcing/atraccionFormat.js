// Formato de IDs visibles del módulo Atracción de Talento.
// Vacante: VAC-000123 · Ejecución (job) de esa vacante: VAC-000123-E01

export function formatVacanteCodigo(codigo) {
    const n = Number(codigo);
    if (!Number.isFinite(n) || n <= 0) return '';
    return `VAC-${String(n).padStart(6, '0')}`;
}

export function formatJobCodigo(vacanteCodigo, jobCodigo) {
    const vac = formatVacanteCodigo(vacanteCodigo);
    const j = Number(jobCodigo);
    if (!vac) return '';
    if (!Number.isFinite(j) || j <= 0) return vac;
    return `${vac}-E${String(j).padStart(2, '0')}`;
}
