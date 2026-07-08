import React, { lazy, Suspense, useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { fetchAuthSession } from 'aws-amplify/auth';
import { apiFetch } from '@cinte/api-client';
import UserAccountMenu from '@cinte/ui-shell/UserAccountMenu.jsx';
import ChatWidget from './ChatWidget';
import ConsultorProtectedLayout from './ConsultorProtectedLayout.jsx';
import ConsultorModulePlaceholder from './ConsultorModulePlaceholder.jsx';
import Login from './Login';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import ChangePassword from './ChangePassword';
import AdminPortalHome from './AdminPortalHome';
import { userHasContratacionPanel } from '@cinte/shared/contratacionAccess.js';
import { userHasOnboardingPanel } from '@cinte/shared/onboardingAccess.js';
import { userHasNovedadesAdminAccess, userHasCotizadorAccess } from '@cinte/shared/comercialAccess.js';
import { userHasDirectorioPanel } from '@cinte/shared/directorioAccess.js';
import { cognitoSignOut } from '@cinte/shared/cognitoAuth.js';
import { useUiTheme, pathIsAdminModuleShell, ADMIN_PORTAL_UNIFIED_TITLE } from '@cinte/ui-shell';
import { installRuntimeClientTrace } from '@cinte/shared/runtimeClientTrace.js';
import { RemoteModule } from './RemoteModule.jsx';

const RadicacionModule = () => import('radicacion/Module');
const ConsultorPortalHome = lazy(() => import('consultor/PortalHome'));
const ConsultorNovedadesPage = lazy(() => import('consultor/NovedadesPage'));
const NovedadesModule = () => import('novedades/Module');
const ConciliacionesModule = () => import('conciliaciones/Module');
const ComercialModule = () => import('comercial/Module');
const CapitalHumanoModule = () => import('capitalHumano/Module');
const DirectorioModule = () => import('directorio/Module');

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
  if (userHasContratacionPanel(auth) || userHasOnboardingPanel(auth)) n += 1;
  if (userHasDirectorioPanel(auth)) n += 1;
  return n;
}

function ProtectedRoute({ children, auth }) {
  if (!auth?.user) {
    return <Navigate to="/admin" replace />;
  }
  return children;
}

function ConsultorRemote({ children }) {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center p-8 font-body text-sm">Cargando…</div>}>
      {children}
    </Suspense>
  );
}

function App() {
  const { theme } = useUiTheme();
  const isLight = theme === 'light';
  const [auth, setAuth] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isFormularioPublico = location.pathname === '/';
  const isConsultorShell = location.pathname.startsWith('/consultor');
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isNovedadesRoute = location.pathname.startsWith('/admin/novedades');
  const moduleCount = adminPortalModuleCount(auth);
  const isAdminHubHome = Boolean(auth?.user && location.pathname === '/admin' && moduleCount > 0);
  const isAdminModuleShell = Boolean(auth?.user) && pathIsAdminModuleShell(location.pathname);
  const showGlobalHeader =
    !isFormularioPublico &&
    !isConsultorShell &&
    !(isAdminRoute && !auth?.user) &&
    !isAdminHubHome &&
    !isAdminModuleShell;

  const handleLogout = useCallback(async () => {
    try {
      // Notificamos al backend por si hay cookies residuales
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch { /* ignore */ }
    cognitoSignOut();
    setAuth(null);
    navigate('/', { replace: true });
  }, [navigate]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await apiFetch('/api/me');
        const data = await res.json().catch(() => ({}));
        
        let sessionToken = '';
        try {
          const session = await fetchAuthSession();
          if (session?.tokens?.idToken) {
            sessionToken = session.tokens.idToken.toString();
          }
        } catch { /* ignore */ }

        if (!mounted) return;
        if (res.ok && data?.ok && data?.me) {
          setAuth((prev) =>
            prev || {
              ok: true,
              user: data.me,
              claims: data.me,
              token: sessionToken,
              ...(data.devDb ? { devDb: data.devDb } : {}),
            }
          );
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

  useEffect(() => {
    if (import.meta.env.DEV) installRuntimeClientTrace();
  }, []);

  useEffect(() => {
    if (!isConsultorShell) return;
    let mounted = true;
    (async () => {
      try {
        const res = await apiFetch('/api/me');
        const data = await res.json().catch(() => ({}));
        if (!mounted) return;
        if (res.ok && data?.ok && data?.me) {
          setAuth({
            ok: true,
            user: data.me,
            claims: data.me,
            ...(data.devDb ? { devDb: data.devDb } : {}),
          });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isConsultorShell, location.pathname]);

  useEffect(() => {
    const root = document.documentElement;
    if (isFormularioPublico) {
      root.classList.remove('cinte-ui-light');
      return;
    }
    root.classList.toggle('cinte-ui-light', isLight);
  }, [isFormularioPublico, isLight]);

  const onLoggedIn = (authData) => setAuth(authData);
  const headerTitle = auth?.user && isAdminRoute ? ADMIN_PORTAL_UNIFIED_TITLE : 'PORTAL DE RADICACIÓN DE NOVEDADES';
  const token = auth?.token || '';

  const subtitleClass =
    auth?.user && isAdminRoute
      ? isLight
        ? 'text-[#004D87]'
        : 'text-white'
      : isLight
        ? 'text-slate-700'
        : 'text-[#9fb3c8]';

  const headerLayoutClass = isAdminModuleShell ? 'justify-end py-2' : 'justify-between py-3';
  const headerBarClass = isLight
    ? 'bg-slate-50/95 backdrop-blur-md border-b border-slate-200'
    : 'bg-[#04141E]/95 backdrop-blur-md border-b border-[#1a3a56]';
  const mainShell = isLight
    ? 'flex-1 min-h-0 bg-slate-50 text-slate-900'
    : 'flex-1 min-h-0 bg-[#04141E] text-slate-200';
  const appRootClass = isFormularioPublico
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
              <p className={`font-heading font-extrabold uppercase tracking-wide text-[10px] sm:text-xs leading-tight ${subtitleClass}`}>
                {headerTitle}
              </p>
            </div>
          ) : null}
          <div className="flex shrink-0 items-center justify-end">
            {auth?.user ? (
              <UserAccountMenu
                auth={auth}
                onLogout={handleLogout}
                surface="header"
                notificationCount={0}
                assistantSlot={isNovedadesRoute ? <ChatWidget ctx={{ role: auth?.user?.role }} /> : null}
              />
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
          <Route
            path="/"
            element={<RemoteModule loader={RadicacionModule} auth={auth} onLogout={handleLogout} token={token} />}
          />
          <Route path="/consultor" element={<ConsultorProtectedLayout />}>
            <Route
              index
              element={(
                <ConsultorRemote>
                  <ConsultorPortalHome />
                </ConsultorRemote>
              )}
            />
            <Route
              path="novedades"
              element={(
                <ConsultorRemote>
                  <ConsultorNovedadesPage />
                </ConsultorRemote>
              )}
            />
            <Route path="vacaciones" element={<ConsultorModulePlaceholder title="Gestión de Vacaciones" />} />
            <Route path="examenes-evaluaciones" element={<ConsultorModulePlaceholder title="Exámenes y Evaluaciones" />} />
            <Route path="documentacion" element={<ConsultorModulePlaceholder title="Documentación" />} />
          </Route>
          <Route
            path="/admin/novedades"
            element={(
              <ProtectedRoute auth={auth}>
                {userHasNovedadesAdminAccess(auth) ? (
                  <RemoteModule loader={NovedadesModule} auth={auth} onLogout={handleLogout} token={token} />
                ) : (
                  <Navigate to="/admin" replace />
                )}
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/conciliaciones/*"
            element={(
              <ProtectedRoute auth={auth}>
                {userHasNovedadesAdminAccess(auth) ? (
                  <RemoteModule loader={ConciliacionesModule} auth={auth} onLogout={handleLogout} token={token} />
                ) : (
                  <Navigate to="/admin" replace />
                )}
              </ProtectedRoute>
            )}
          />
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
                  <RemoteModule loader={ComercialModule} auth={auth} onLogout={handleLogout} token={token} />
                ) : (
                  <Navigate to="/admin" replace />
                )}
              </ProtectedRoute>
            )}
          />
          <Route path="/admin/catalogo-ti-roles" element={<Navigate to="/admin/directorio?v=catalogo-ti" replace />} />
          <Route
            path="/admin/capital-humano"
            element={(
              <ProtectedRoute auth={auth}>
                {auth?.user && (userHasContratacionPanel(auth) || userHasOnboardingPanel(auth)) ? (
                  <RemoteModule loader={CapitalHumanoModule} auth={auth} onLogout={handleLogout} token={token} />
                ) : (
                  <Navigate to="/admin" replace />
                )}
              </ProtectedRoute>
            )}
          />
          <Route path="/admin/contratacion" element={<Navigate to="/admin/capital-humano?v=monitor-active" replace />} />
          <Route path="/admin/onboarding" element={<Navigate to="/admin/capital-humano?v=personal" replace />} />
          <Route
            path="/admin/directorio"
            element={(
              <ProtectedRoute auth={auth}>
                {userHasDirectorioPanel(auth) ? (
                  <RemoteModule loader={DirectorioModule} auth={auth} onLogout={handleLogout} token={token} />
                ) : (
                  <Navigate to="/admin" replace />
                )}
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
                  auth?.user?.authProvider === 'entra_consultor'
                  && String(auth?.user?.role || '').toLowerCase() === 'consultor'
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
