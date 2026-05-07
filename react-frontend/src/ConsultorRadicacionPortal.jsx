import { useCallback, useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { HelpCircle, LayoutGrid, Loader2, UserSquare } from 'lucide-react';
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
      <div className="relative z-10 flex w-full max-w-md flex-col items-stretch justify-center px-5 py-10 sm:px-6">
        {children}
      </div>
    </div>
  );
}

/** Tarjeta glass compartida (login + carga): translúcida para que el fondo se filtre. */
function GlassCard({ children, className = '' }) {
  return (
    <div
      className={`rounded-2xl border border-white/25 bg-gradient-to-b from-white/[0.14] to-white/[0.05] p-8 shadow-[0_12px_48px_rgba(0,0,0,0.28)] ring-1 ring-inset ring-white/15 backdrop-blur-2xl backdrop-saturate-150 md:p-10 ${className}`}
    >
      {children}
    </div>
  );
}

export default function ConsultorRadicacionPortal() {
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
        <GlassCard className="flex flex-col items-center justify-center gap-4 py-14 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#65BCF7]" aria-hidden />
          <p className="font-body text-sm text-[#9fb3c8]">Cargando sesión…</p>
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
      <GlassCard className="text-left">
        <header className="mb-8 flex justify-center border-b border-white/10 pb-6">
          <img
            src="/assets/logo-cinte-header.png"
            alt="Cinte"
            className="h-11 w-auto drop-shadow-md sm:h-12"
          />
        </header>

        <h1 className="mb-8 text-center font-heading text-xl font-bold leading-snug tracking-wide text-white md:text-2xl">
          Portal Consultores y Staff Grupo Cinte
        </h1>

        {entraLoginError ? (
          <div
            className="mb-6 rounded-lg border border-amber-500/40 bg-amber-950/40 px-4 py-3 font-body text-sm text-amber-100"
            role="alert"
          >
            {entraLoginError}
          </div>
        ) : null}

        <ul className="mb-10 space-y-5">
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
              <LayoutGrid className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <p className="font-body text-sm leading-relaxed text-[#9fb3c8]">
              {`Utiliza tu `}
              <strong className="font-semibold text-white">{`cuenta de Microsoft corporativa`}</strong>.
            </p>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white">
              <UserSquare className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <p className="font-body text-sm leading-relaxed text-[#9fb3c8]">
              {`Debes estar como `}
              <strong className="font-semibold text-white">{`consultor activo`}</strong>
              {` y con `}
              <strong className="font-semibold text-white">{`correo Cinte`}</strong>
              {` asignado.`}
            </p>
          </li>
        </ul>

        <a
          href={startUrl}
          className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#0078d4] px-5 py-3.5 text-center font-body text-sm font-semibold text-white shadow-lg shadow-black/25 transition-colors hover:bg-[#106ebe] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#65BCF7]"
        >
          <MicrosoftLogoMark />
          Iniciar sesión con Microsoft
        </a>

        <footer className="mt-10 border-t border-white/10 pt-6">
          <div className="flex gap-2.5 font-body text-xs leading-relaxed text-[#9fb3c8]">
            <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#65BCF7]/90" strokeWidth={2} aria-hidden />
            <p>
              {'¿Problemas para acceder? '}
              <a
                href="mailto:soporte@grupocinte.com?subject=Portal%20consultores%20-%20acceso"
                className="font-semibold text-[#65BCF7] underline decoration-[#65BCF7]/50 underline-offset-2 transition-colors hover:text-white hover:decoration-white"
              >
                Contacta con Soporte
              </a>
              .
            </p>
          </div>
        </footer>
      </GlassCard>
    </PortalShell>
  );
}
