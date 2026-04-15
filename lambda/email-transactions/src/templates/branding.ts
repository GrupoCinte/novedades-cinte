/** Vive junto a las plantillas en `dist/templates/` para que el zip de Lambda siempre lo incluya. */
const DEFAULT_PUBLIC_ORIGIN = 'https://novedades.grupocinte.com';

export function resolveLogoUrl(): string {
  const fromEnv = String(process.env.EMAIL_LOGO_URL || '').trim();
  if (fromEnv) return fromEnv;
  return `${DEFAULT_PUBLIC_ORIGIN}/assets/logo-cinte-header.png`;
}

/** Enlace del botón «gestionar» en el correo admin. */
export function resolveGestionPublicUrl(): string {
  const fromEnv = String(process.env.EMAIL_GESTION_URL || '').trim();
  if (fromEnv) return fromEnv;
  return `${DEFAULT_PUBLIC_ORIGIN}/`;
}
