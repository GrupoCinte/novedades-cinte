import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import UserAccountMenu from './UserAccountMenu.jsx';
import Dashboard from './Dashboard';
import ConsultorRadicacionPortal from './ConsultorRadicacionPortal.jsx';
import ConsultorProtectedLayout from './ConsultorProtectedLayout.jsx';
import ConsultorPortalHome from './ConsultorPortalHome.jsx';
import ConsultorNovedadesPage from './ConsultorNovedadesPage.jsx';
import ConsultorModulePlaceholder from './ConsultorModulePlaceholder.jsx';
import Login from './Login';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import ChangePassword from './ChangePassword';
import ComercialModule from './ComercialModule';
import ContratacionModule from './ContratacionModule';
import DirectorioClienteColaboradorModule from './DirectorioClienteColaboradorModule';
import ConciliacionesModule from './conciliaciones/ConciliacionesModule.jsx';
import ConciliacionesDashboardPage from './conciliaciones/ConciliacionesDashboardPage.jsx';
import ConciliacionesPage from './conciliaciones/ConciliacionesPage.jsx';
import FormularioNovedad from './FormularioNovedad.jsx';
import AdminPortalHome from './AdminPortalHome';
import { userHasContratacionPanel } from './contratacion/contratacionAccess';
import { userHasNovedadesAdminAccess, userHasCotizadorAccess } from './comercialAccess';
import { userHasDirectorioPanel } from './directorioAccess';
import { cognitoSignOut } from './cognitoAuth';
import { useUiTheme } from './UiThemeContext.jsx';
import { pathIsAdminModuleShell, ADMIN_PORTAL_UNIFIED_TITLE } from './AdminModuleSidebarBrand.jsx';

function AdminPortalSinModulos({ onLogout }) {
  const { theme } = useUiTheme();
  const isLight = theme === 'light';
  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center font-body ${
        isLight ? 'bg-slate-50 text-slate-800' : 'bg-[#04141E] text-[#e6edf3]'
      }`}
    >
      <p className={`max-w-md text-sm ${isLight ? 'text-slate-600' : 'text-[#9fb3c8]'}`}>
        Tu sesión es válida, pero no hay ningún módulo del portal asociado a tu usuario. Si acabas de
        cambiar de rol en Cognito, vuelve a iniciar sesión. Si el problema continúa, contacta a
        administración.
      </p>
      <button
        type="button"
        onClick={onLogout}
        className="rounded-md bg-[#2F7BB8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#25649a]"
      >
        Cerrar sesión
      </button>
    </div>
  );
}

function adminPortalModuleCount(auth) {
  let n = 0;
  if (userHasNovedadesAdminAccess(auth)) {
    n += 1;
    n += 1;
  }
  if (userHasCotizadorAccess(auth)) n += 1;
  if (userHasContratacionPanel(auth)) n += 1;
  if (userHasDirectorioPanel(auth)) n += 1;
  return n;
}

/**
 * Guard de ruta protegida. Verifica existencia Y validez temporal del token.
 * Si no hay token válido, redirige a /admin (que renderiza el Login).
 */
function ProtectedRoute({ children, auth }) {
  if (!auth?.user) {
    return <Navigate to="/admin" replace />;
  }
  return children;
}

function App() {
  const { theme } = useUiTheme();
  const isLight = theme === 'light';

  // CRIT-002 — La sesión se hidrata exclusivamente desde /api/me (cookie HttpOnly).
  // No se lee localStorage en el arranque para evitar exposición de tokens a XSS.
  const [auth, setAuth] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isFormularioPublico = location.pathname === '/';
  const isConsultorShell = location.pathname.startsWith('/consultor');
  const isAdminRoute = location.pathname.startsWith('/admin');
  const moduleCount = adminPortalModuleCount(auth);
  /** Hub con tarjetas: sin cabecera duplicada; logo/título van sobre el banner en AdminPortalHome. */
  const isAdminHubHome = Boolean(auth?.user && location.pathname === '/admin' && moduleCount > 0);
  /** Módulos con sidebar propio: logo y título van en el panel lateral, no en el header global. */
  const isAdminModuleShell = Boolean(auth?.user) && pathIsAdminModuleShell(location.pathname);
  /** Login / forgot / reset: sin cabecera global para usar viewport completo. */
  const showGlobalHeader =
    !isFormularioPublico &&
    !isConsultorShell &&
    !(isAdminRoute && !auth?.user) &&
    !isAdminHubHome;

  const handleLogout = useCallback(async () => {
    // CRIT-002 + LOW-005: Logout diferenciado por proveedor de identidad.
    const isEntraConsultor = auth?.user?.authProvider === 'entra_consultor';

    if (isEntraConsultor) {
      // Consultor Entra ID: redirigir al endpoint de Single Sign-Out.
      // El endpoint limpia las cookies locales y luego redirige a Microsoft
      // para cerrar la sesión en todo el tenant (Outlook, Teams, etc.).
      window.location.href = '/api/auth/entra/logout';
      return;
    }

    // Administradores Cognito: flujo existente (fetch + cognitoSignOut).
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignora error de red en logout */ }
    cognitoSignOut();
    setAuth(null);
    navigate('/admin', { replace: true });
  }, [navigate, auth]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (!mounted) return;
        if (res.ok && data?.ok && data?.me) {
          setAuth((prev) => prev || { ok: true, user: data.me, claims: data.me });
        } else {
          setAuth(null);
        }
      } catch {
        if (mounted) setAuth(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /** Sincronizar `auth` al entrar al hub consultor (p. ej. tras redirect Entra con cookie recién fijada). */
  useEffect(() => {
    if (!isConsultorShell) return;
    let mounted = true;
    (async () => {
      try {
        const res = await fetch('/api/me', { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (!mounted) return;
        if (res.ok && data?.ok && data?.me) {
          setAuth({ ok: true, user: data.me, claims: data.me });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isConsultorShell, location.pathname]);

  /** Tema global: variables CSS (`index.css`). Radicación pública `/` no usa el toggle. Portal Entra consultor sí. */
  useEffect(() => {
    const root = document.documentElement;
    if (isFormularioPublico) {
      root.classList.remove('cinte-ui-light');
      return;
    }
    root.classList.toggle('cinte-ui-light', isLight);
  }, [isFormularioPublico, isLight]);

  // CRIT-002 — No se persiste auth en localStorage. La sesión vive solo en la cookie HttpOnly.

  const onLoggedIn = (authData) => setAuth(authData);
  const headerTitle = auth?.user && isAdminRoute ? ADMIN_PORTAL_UNIFIED_TITLE : 'PORTAL DE RADICACIÓN DE NOVEDADES';

  const subtitleClass =
    auth?.user && isAdminRoute
      ? isLight
        ? 'text-[#004D87]'
        : 'text-white'
      : isLight
        ? 'text-slate-700'
        : 'text-[#9fb3c8]';

  const headerLayoutClass = isAdminModuleShell
    ? 'justify-end py-2'
    : 'justify-between py-3';

  const headerBarClass = isLight
    ? 'bg-slate-50/95 backdrop-blur-md border-b border-slate-200'
    : 'bg-[#04141E]/95 backdrop-blur-md border-b border-[#1a3a56]';

  const mainShell = isLight
    ? 'flex-1 min-h-0 bg-slate-50 text-slate-900'
    : 'flex-1 min-h-0 bg-[#04141E] text-slate-200';

  /** Radicación pública (`/`): look fijo oscuro. Portal consultor Entra sigue `UiThemeContext` como el admin. */
  const appRootClass =
    isFormularioPublico
      ? 'flex h-screen flex-col overflow-hidden font-body bg-[#04141E] text-slate-200'
      : `flex h-screen flex-col overflow-hidden font-body ${
          isLight ? 'bg-slate-100 text-slate-900' : 'bg-[#04141E] text-slate-200'
        }`;

  return (
    <div className={appRootClass}>
      {showGlobalHeader && (
      <header className={`${headerBarClass} px-4 sm:px-8 flex items-center gap-4 sticky top-0 z-50 ${headerLayoutClass}`}>
        {!isAdminModuleShell ? (
        <div className="flex flex-col gap-1 min-w-0 shrink">
          <div className="flex h-[4.75rem] w-[min(100%,15rem)] max-h-[5.5rem] max-w-full items-center justify-start overflow-visible px-1 py-1 sm:h-[5.5rem] sm:max-h-[6.25rem] sm:w-[min(100%,17.5rem)] sm:px-1.5 sm:py-1.5">
            <img
              src={isLight ? '/assets/logo-cinte-header-light.png' : '/assets/logo-cinte-header.png'}
              className={`h-full w-full max-h-full object-contain object-left ${
                isLight ? 'origin-left scale-[1.66] sm:scale-[1.58]' : ''
              }`}
              alt="CINTE"
            />
          </div>
          <p
            className={`font-heading font-extrabold uppercase tracking-wide text-[10px] sm:text-xs leading-tight ${subtitleClass}`}
          >
            {headerTitle}
          </p>
        </div>
        ) : null}
        <div className="flex shrink-0 items-center justify-end">
          {auth?.user ? (
            <UserAccountMenu auth={auth} onLogout={handleLogout} surface="header" notificationCount={0} />
          ) : null}
        </div>
      </header>
      )}

      <main
        className={
          isFormularioPublico
            ? 'flex-1 min-h-0 flex flex-col overflow-hidden'
            : isConsultorShell
              ? `${mainShell} flex flex-col overflow-hidden`
              : isAdminRoute
                ? `${mainShell} flex flex-col overflow-hidden`
                : `${mainShell} w-full overflow-y-auto p-6 md:p-10`
        }
      >
        <Routes>
          <Route path="/" element={<FormularioNovedad />} />
          <Route path="/consultor" element={<ConsultorProtectedLayout />}>
            <Route index element={<ConsultorPortalHome />} />
            <Route path="novedades" element={<ConsultorNovedadesPage />} />
            <Route
              path="vacaciones"
              element={<ConsultorModulePlaceholder title="Gestión de Vacaciones" />}
            />
            <Route
              path="examenes-evaluaciones"
              element={<ConsultorModulePlaceholder title="Exámenes y Evaluaciones" />}
            />
            <Route
              path="documentacion"
              element={<ConsultorModulePlaceholder title="Documentación" />}
            />
          </Route>
          <Route
            path="/admin/novedades"
            element={(
              <ProtectedRoute auth={auth}>
                {userHasNovedadesAdminAccess(auth) ? (
                  <Dashboard token={auth?.token || ''} auth={auth} onLogout={handleLogout} />
                ) : (
                  <Navigate to="/admin" replace />
                )}
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/conciliaciones"
            element={(
              <ProtectedRoute auth={auth}>
                {userHasNovedadesAdminAccess(auth) ? (
                  <ConciliacionesModule auth={auth} />
                ) : (
                  <Navigate to="/admin" replace />
                )}
              </ProtectedRoute>
            )}
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route
              path="dashboard"
              element={<ConciliacionesDashboardPage token={auth?.token || ''} />}
            />
            <Route path="resumen" element={<ConciliacionesPage token={auth?.token || ''} />} />
          </Route>
          <Route
            path="/admin"
            element={
              auth?.user?.authProvider === 'entra_consultor'
              && String(auth?.user?.role || '').toLowerCase() === 'consultor' ? (
                  <Navigate to="/consultor" replace />
              ) : auth?.user ? (
                  moduleCount === 0 ? (
                    <AdminPortalSinModulos onLogout={handleLogout} />
                  ) : (
                    <AdminPortalHome auth={auth} onLogout={handleLogout} />
                  )
              ) : (
                <Login setAuth={onLoggedIn} />
              )
            }
          />
          <Route path="/admin/forgot" element={<ForgotPassword />} />
          <Route path="/admin/reset" element={<ResetPassword />} />
          <Route
            path="/perfil/cambiar-clave"
            element={(
              <ProtectedRoute auth={auth}>
                {auth?.user?.authProvider === 'entra_consultor' ? (
                  <Navigate to="/consultor" replace />
                ) : (
                  <ChangePassword />
                )}
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/comercial"
            element={(
              <ProtectedRoute auth={auth}>
                {userHasCotizadorAccess(auth) ? (
                    <ComercialModule token={auth?.token || ''} auth={auth} />
                ) : (
                    <Navigate to="/admin" replace />
                )}
              </ProtectedRoute>
            )}
          />
          <Route path="/admin/catalogo-ti-roles" element={<Navigate to="/admin/directorio?v=catalogo-ti" replace />} />
          <Route
            path="/admin/contratacion"
            element={(
              <ProtectedRoute auth={auth}>
                {auth?.user && userHasContratacionPanel(auth) ? (
                  <ContratacionModule auth={auth} />
                ) : (
                  <Navigate to="/admin" replace />
                )}
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/directorio"
            element={(
              <ProtectedRoute auth={auth}>
                {(() => {
                  return userHasDirectorioPanel(auth) ? (
                    <DirectorioClienteColaboradorModule token={auth?.token || ''} auth={auth} />
                  ) : (
                    <Navigate to="/admin" replace />
                  );
                })()}
              </ProtectedRoute>
            )}
          />
          <Route path="/admin/cotizador" element={<Navigate to="/admin/comercial" replace />} />
          <Route path="/admin/comercial/catalogo-roles-ti" element={<Navigate to="/admin/directorio?v=catalogo-ti" replace />} />
          <Route
            path="*"
            element={(
              <Navigate
                to={
                  auth?.user?.authProvider === 'entra_consultor' &&
                  String(auth?.user?.role || '').toLowerCase() === 'consultor'
                    ? '/consultor'
                    : auth?.user
                      ? '/admin'
                      : '/'
                }
                replace
              />
            )}
          />
        </Routes>
      </main>
    </div>
  );
}

export default App;
