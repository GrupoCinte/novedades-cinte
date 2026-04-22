import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Dashboard from './Dashboard';
import FormularioNovedad from './FormularioNovedad';
import Login from './Login';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import ChangePassword from './ChangePassword';
import ComercialModule from './ComercialModule';
import ContratacionModule from './ContratacionModule';
import DirectorioClienteColaboradorModule from './DirectorioClienteColaboradorModule';
import { userHasContratacionPanel } from './contratacion/contratacionAccess';

function AdminPortalSinModulos({ onLogout }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center text-[#e6edf3]">
      <p className="max-w-md text-sm text-[#9fb3c8]">
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
import { userHasNovedadesAdminAccess, userHasCotizadorAccess } from './comercialAccess';
import { userHasDirectorioPanel } from './directorioAccess';
import { cognitoSignOut } from './cognitoAuth';


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
  // CRIT-002 — La sesión se hidrata exclusivamente desde /api/me (cookie HttpOnly).
  // No se lee localStorage en el arranque para evitar exposición de tokens a XSS.
  const [auth, setAuth] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const isFormularioPublico = location.pathname === '/';
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isComercialRoute = location.pathname.startsWith('/admin/comercial');
  const isContratacionRoute = location.pathname.startsWith('/admin/contratacion');
  const isDirectorioRoute = location.pathname.startsWith('/admin/directorio');
  const showContratacionNav = auth?.user && userHasContratacionPanel(auth);
  const showNovedadesNav = auth?.user && userHasNovedadesAdminAccess(auth);
  const showComercialNav = auth?.user && userHasCotizadorAccess(auth);
  const showDirectorioNav = auth?.user && userHasDirectorioPanel(auth);
  /** Login / forgot / reset: sin cabecera global para usar viewport completo. */
  const showGlobalHeader = !isFormularioPublico && !(isAdminRoute && !auth?.user);

  const handleLogout = useCallback(async () => {
    // CRIT-002 + LOW-005: Llama al endpoint de logout para revocar el token en servidor y limpiar cookies.
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignora error de red en logout */ }
    cognitoSignOut();
    setAuth(null);
    navigate('/admin', { replace: true });
  }, [navigate]);

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

  // CRIT-002 — No se persiste auth en localStorage. La sesión vive solo en la cookie HttpOnly.

  const onLoggedIn = (authData) => setAuth(authData);
  const headerTitle = (auth?.user && isAdminRoute)
    ? 'SISTEMA UNIFICADO DE GESTIÓN'
    : 'PORTAL DE RADICACIÓN DE NOVEDADES';
  return (
    <div className="h-screen overflow-hidden flex flex-col">
      {showGlobalHeader && (
      <header className="bg-[#04141E]/95 backdrop-blur-md px-8 py-3 border-b border-[#1a3a56] flex justify-between items-center sticky top-0 z-50 relative">
        <div className="flex items-center">
          <img src="/assets/logo-cinte-header.png" className="h-16 w-auto" alt="CINTE" />
        </div>
        <div className="hidden md:flex lg:hidden absolute left-1/2 -translate-x-1/2 text-[15px] font-heading font-extrabold text-[#65BCF7] tracking-wide uppercase text-center whitespace-nowrap">
          {headerTitle}
        </div>
        <div className="hidden lg:flex absolute left-1/2 -translate-x-1/2 text-[24px] font-heading font-extrabold text-[#9fb3c8] tracking-wide uppercase text-center whitespace-nowrap">
          {headerTitle}
        </div>
        <div className="hidden lg:flex w-[220px]" />
      </header>
      )}
      {auth?.user && isAdminRoute && (
        <div className="bg-[#04141E]/90 border-b border-[#1a3a56] px-4 md:px-8 py-2 flex flex-wrap items-center gap-2 font-body">
          {showNovedadesNav ? (
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className={`px-3 py-1.5 rounded-md text-xs md:text-sm font-semibold transition-all ${
                !isComercialRoute && !isContratacionRoute && !isDirectorioRoute
                  ? 'bg-[#2F7BB8] text-white'
                  : 'bg-[#0b1e30] text-[#9fb3c8] hover:text-white hover:bg-[#0f2942]'
              }`}
            >
              Gestión de Novedades
            </button>
          ) : null}
          {showComercialNav ? (
            <button
              type="button"
              onClick={() => navigate('/admin/comercial')}
              className={`px-3 py-1.5 rounded-md text-xs md:text-sm font-semibold transition-all ${
                isComercialRoute
                  ? 'bg-[#088DC6] text-white'
                  : 'bg-[#0b1e30] text-[#9fb3c8] hover:text-white hover:bg-[#0f2942]'
              }`}
            >
              Módulo Comercial
            </button>
          ) : null}
          {showContratacionNav ? (
            <button
              type="button"
              onClick={() => navigate('/admin/contratacion')}
              className={`px-3 py-1.5 rounded-md text-xs md:text-sm font-semibold transition-all ${
                isContratacionRoute
                  ? 'bg-[#004D87] text-white'
                  : 'bg-[#0b1e30] text-[#9fb3c8] hover:text-white hover:bg-[#0f2942]'
              }`}
            >
              Módulo de Capital Humano Onboarding
            </button>
          ) : null}
          {showDirectorioNav ? (
            <button
              type="button"
              onClick={() => navigate('/admin/directorio')}
              className={`px-3 py-1.5 rounded-md text-xs md:text-sm font-semibold transition-all ${
                isDirectorioRoute
                  ? 'bg-[#1a5f8a] text-white'
                  : 'bg-[#0b1e30] text-[#9fb3c8] hover:text-white hover:bg-[#0f2942]'
              }`}
            >
              Módulo de administración
            </button>
          ) : null}
        </div>
      )}

      <main className={`flex-1 ${isFormularioPublico ? 'overflow-hidden' : isAdminRoute ? 'overflow-hidden flex flex-col' : 'w-full overflow-y-auto p-6 md:p-10 bg-[#04141E]'}`}>
        <Routes>
          <Route path="/" element={<FormularioNovedad />} />
          <Route
            path="/admin"
            element={
              auth?.user ? (
                userHasNovedadesAdminAccess(auth) ? (
                  <Dashboard token={auth.token || ''} auth={auth} onLogout={handleLogout} />
                ) : userHasCotizadorAccess(auth) ? (
                  <Navigate to="/admin/comercial" replace />
                ) : userHasContratacionPanel(auth) ? (
                  <Navigate to="/admin/contratacion" replace />
                ) : userHasDirectorioPanel(auth) ? (
                  <Navigate to="/admin/directorio" replace />
                ) : (
                  <AdminPortalSinModulos onLogout={handleLogout} />
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
                <ChangePassword />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/comercial"
            element={(
              <ProtectedRoute auth={auth}>
                {(() => {
                  return userHasCotizadorAccess(auth) ? (
                    <ComercialModule token={auth?.token || ''} auth={auth} onLogout={handleLogout} />
                  ) : (
                    <Navigate to="/admin" replace />
                  );
                })()}
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/contratacion"
            element={(
              <ProtectedRoute auth={auth}>
                {auth?.user && userHasContratacionPanel(auth) ? (
                  <ContratacionModule auth={auth} onLogout={handleLogout} />
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
                    <DirectorioClienteColaboradorModule token={auth?.token || ''} auth={auth} onLogout={handleLogout} />
                  ) : (
                    <Navigate to="/admin" replace />
                  );
                })()}
              </ProtectedRoute>
            )}
          />
          <Route path="/admin/cotizador" element={<Navigate to="/admin/comercial" replace />} />
          <Route path="*" element={<Navigate to={auth?.user ? '/admin' : '/'} replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
