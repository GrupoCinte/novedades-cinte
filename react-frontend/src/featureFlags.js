// Flags de funcionalidad del portal admin.
// Conciliaciones queda OFF por defecto (apagado en produccion). Para activarlo en
// QA/entornos de prueba, definir VITE_CONCILIACIONES_ENABLED=true en el build del frontend.
export const CONCILIACIONES_MODULE_ENABLED =
  String(import.meta.env.VITE_CONCILIACIONES_ENABLED || '').toLowerCase() === 'true';

// Atracción de Talento (sourcing). OFF por defecto en producción.
// QA/local: VITE_ATRACCION_TALENTO_ENABLED=true
export const ATRACCION_TALENTO_MODULE_ENABLED =
  String(import.meta.env.VITE_ATRACCION_TALENTO_ENABLED || '').toLowerCase() === 'true';
