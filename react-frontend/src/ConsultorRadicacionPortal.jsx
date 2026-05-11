import { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { HelpCircle, Loader2 } from 'lucide-react';
import { useAuthSurface } from './moduleTheme.js';
/** Misma imagen base que `FormularioNovedad.jsx`. */
const PORTAL_BG_STYLE = {
  backgroundImage:
    'linear-gradient(135deg, rgba(4,20,30,0.62) 0%, rgba(0,77,135,0.42) 100%), url(/img/bg-portal.jpg)',
  backgroundSize: 'cover',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat',
  backgroundAttachment: 'fixed'
};

function MicrosoftLogoMark({ className = 'h-5 w-5 shrink-0' }) {
  return (
    <svg className={className} viewBox="0 0 21 21" aria-hidden>
      <rect x="0" y="0" width="10" height="10" fill="#f25022" />
      <rect x="11" y="0" width="10" height="10" fill="#7fba00" />
      <rect x="0" y="11" width="10" height="10" fill="#00a4ef" />
      <rect x="11" y="11" width="10" height="10" fill="#ffb900" />
    </svg>
  );
}

function isConsultorEntra(me) {
  return Boolean(me && me.authProvider === 'entra_consultor' && String(me.role || '').toLowerCase() === 'consultor');
}

function isStaffCognito(me) {
  const ap = String(me?.authProvider || '');
  if (ap !== 'cognito' && ap !== 'cognito_app') return false;
  return Boolean(me?.role);
}

const ENTRA_ERR_MSG = {
  state: 'Sesión de login inválida o expirada. Intenta de nuevo.',
  login: 'No se pudo completar el inicio de sesión en Microsoft.',
  not_configured:
    'El inicio de sesión con Microsoft no está configurado en este servidor. Si administras el entorno, define en `.env` ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET y ENTRA_REDIRECT_URI (debe coincidir con el redirect en Azure). Ver `.env.example`.',
  no_id_token: 'Respuesta de Microsoft incompleta.',
  claims: 'No se pudo leer el correo desde Microsoft.',
  no_colaborador:
    'Tu correo no está en el directorio de colaboradores activos o no coincide con correo Cinte.',
  token: 'Error validando la sesión con Microsoft.'
};

function PortalShell({ children }) {
  return (
    <div
      className="relative min-h-screen w-full flex flex-1 flex-col items-center justify-center overflow-hidden font-body text-slate-200"
      style={PORTAL_BG_STYLE}
    >
      <div className="pointer-events-none absolute inset-0 bg-[#04141E]/30 backdrop-blur-[1px]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-[#004D87]/25" />
      <div className="relative z-10 flex w-full max-w-lg flex-col items-stretch justify-center px-4 py-10 sm:px-6">
        {children}
      </div>
    </div>
  );
}

/** Misma tarjeta que login admin (`Login.jsx` → `au.loginCard`), con ancho algo mayor para este flujo. */
function GlassCard({ children, className = '' }) {
  const au = useAuthSurface();
  return (
    <div className={`${au.loginCard} max-w-lg text-center ${className}`}>
      <div
        className="pointer-events-none absolute left-0 top-0 z-10 h-1 w-full bg-gradient-to-r from-[#004D87] to-[#65BCF7] opacity-90"
        aria-hidden
      />
      {children}
    </div>
  );
}

export default function ConsultorRadicacionPortal() {
  const au = useAuthSurface();
  const [me, setMe] = useState(undefined);
  const [entraLoginError, setEntraLoginError] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const q = new URLSearchParams(location.search || '');
    const code = String(q.get('entra_error') || '').trim();
    if (!code) return;
    const id = window.setTimeout(() => {
      setEntraLoginError(ENTRA_ERR_MSG[code] || 'No se pudo iniciar sesión.');
      navigate('/', { replace: true });
    }, 0);
    return () => window.clearTimeout(id);
  }, [location.search, navigate]);

  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok && data?.me) setMe(data.me);
      else setMe(null);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => {
      void refreshMe();
    }, 0);
    return () => window.clearTimeout(id);
  }, [refreshMe]);

  if (me === undefined) {
    return (
      <PortalShell>
        <GlassCard className="flex flex-col items-center justify-center gap-4 py-14">
          <Loader2 className="h-8 w-8 animate-spin text-[#65BCF7]" aria-hidden />
          <p className={`font-body text-sm ${au.authSubtitle}`}>Cargando sesión…</p>
        </GlassCard>
      </PortalShell>
    );
  }

  if (isStaffCognito(me)) {
    return <Navigate to="/admin" replace />;
  }

  if (isConsultorEntra(me)) {
    return <Navigate to="/consultor" replace />;
  }

  const startUrl = '/api/auth/entra/start';

  return (
    <PortalShell>
      <GlassCard>
        <header
          className={`mb-7 flex flex-col items-center border-b pb-7 sm:mb-8 sm:pb-8 ${au.isLight ? 'border-slate-200/90' : 'border-white/10'}`}
        >
          <img
            src={au.isLight ? '/assets/logo-cinte-header-light.png' : '/assets/logo-cinte-header.png'}
            alt="Grupo Cinte"
            className="h-16 w-auto drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)] sm:h-20 md:h-[5.25rem]"
          />
        </header>

        {entraLoginError ? (
          <div className={`mb-6 text-left ${au.pageErrorBanner}`} role="alert">
            {entraLoginError}
          </div>
        ) : null}

        <div className="mb-6 flex justify-center sm:mb-7" aria-hidden>
          <MicrosoftLogoMark className="h-8 w-8 sm:h-9 sm:w-9" />
        </div>

        <h1
          className={`mx-auto mb-5 max-w-md font-heading text-xl font-extrabold leading-tight tracking-tight drop-shadow-sm sm:mb-6 sm:text-2xl md:text-[1.65rem] md:leading-snug ${au.isLight ? 'text-slate-900' : 'text-white'}`}
        >
          Inicia sesión con tu misma cuenta de Microsoft
        </h1>

        <p
          className={`mx-auto mb-9 max-w-md font-body text-sm leading-relaxed sm:mb-10 sm:text-[0.95rem] md:text-base ${au.isLight ? 'text-slate-600' : 'text-white/88'}`}
        >
          Usa tu{' '}
          <strong className={`font-semibold ${au.isLight ? 'text-slate-900' : 'text-white'}`}>mismo correo corporativo</strong>{' '}
          asignado por Cinte para acceder de forma segura. No necesitas crear una cuenta nueva y tu contraseña es la
          misma que usas en el trabajo.
        </p>

        <a
          href={startUrl}
          className="mx-auto flex w-full max-w-sm items-center justify-center gap-3 rounded-xl bg-[#0078d4] px-5 py-3.5 text-center font-heading text-sm font-semibold text-white shadow-[0_8px_24px_rgba(0,120,212,0.35)] transition-colors hover:bg-[#106ebe] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#65BCF7] sm:py-4"
        >
          <MicrosoftLogoMark className="h-5 w-5" />
          Iniciar sesión con Microsoft
        </a>

        <footer className={`mt-9 border-t pt-6 sm:mt-10 ${au.isLight ? 'border-slate-200/90' : 'border-white/10'}`}>
          <div
            className={`mx-auto flex max-w-md items-start justify-center gap-2.5 font-body text-xs leading-relaxed sm:text-sm ${au.isLight ? 'text-slate-600' : 'text-white/80'}`}
          >
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#65BCF7]" strokeWidth={2} aria-hidden />
            <p className="text-left sm:text-center">
              ¿Problemas para acceder?{' '}
              <a
                href="mailto:soporte@grupocinte.com?subject=Portal%20consultores%20-%20acceso"
                className={`font-semibold underline underline-offset-2 ${au.linkAccent}`}
              >
                Contacta con Soporte.
              </a>
            </p>
          </div>
        </footer>
      </GlassCard>
    </PortalShell>
  );
}
