/** Vive junto a las plantillas en `dist/templates/` para que el zip de Lambda siempre lo incluya. */
const DEFAULT_PUBLIC_ORIGIN = 'https://novedades.grupocinte.com';

/** Content-ID del PNG embebido por `sendHtmlEmailWithInlineLogo` (handler). */
export const LOGO_CID = 'cinte-logo';

/**
 * URL del logo en plantillas.
 * - Por defecto: `cid:cinte-logo` (adjunto inline en SES; no depende de CORP del portal).
 * - Override: `EMAIL_LOGO_URL` (https público). Preferir `logo-cinte-header-light.png` (fondo claro).
 */
export function resolveLogoUrl(): string {
  if (typeof process === "undefined") {
    return resolveLogoPublicUrl();
  }

  const fromEnv = String(process.env.EMAIL_LOGO_URL || "").trim();

  if (fromEnv) {
    return fromEnv;
  }

  return `cid:${LOGO_CID}`;
}

/** Fallback remoto (solo documentación / env). Logo claro para fondos blancos de correo. */
export function resolveLogoPublicUrl(): string {
  return `${DEFAULT_PUBLIC_ORIGIN}/assets/logo-cinte-header-light.png`;
}

/** Enlace del botón «gestionar» en el correo admin. */
export function resolveGestionPublicUrl(): string {
  const fromEnv = String(process.env.EMAIL_GESTION_URL || '').trim();
  if (fromEnv) return fromEnv;
  return `${DEFAULT_PUBLIC_ORIGIN}/`;
}
