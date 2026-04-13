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
import { userHasContratacionPanel } from './contratacion/contratacionAccess';
import { userHasNovedadesAdminAccess, userHasCotizadorAccess } from './comercialAccess';
import { cognitoSignOut } from './cognitoAuth';


function readAuth() {
  try {
    return JSON.parse(localStorage.getItem('cinteAuth') || 'null');
  } catch {
    return null;
  }
}

/**
 * Decodifica el payload del JWT (sin verificar firma — solo para leer `exp`).
 * La verificación de firma real ocurre en el backend en cada petición.
 */
function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/**
 * Devuelve true si el token existe Y su claim `exp` es mayor al momento actual.
 * Si el token está expirado o malformado, limpia localStorage y retorna false.
 */
function isTokenValid(token) {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  // exp está en segundos, Date.now() en milisegundos
  const isExpired = payload.exp * 1000 < Date.now();
  if (isExpired) {
    localStorage.removeItem('cinteAuth');
    return false;
  }
  return true;
}

/**
 * Guard de ruta protegida. Verifica existencia Y validez temporal del token.
 * Si no hay token válido, redirige a /admin (que renderiza el Login).
 */
function ProtectedRoute({ children }) {
  const auth = readAuth();
  if (!auth?.token || !isTokenValid(auth.token)) {
    localStorage.removeItem('cinteAuth');
    return <Navigate to="/admin" replace />;
  }
  return children;
}

function App() {
  const [auth, setAuth] = useState(() => {
    const stored = readAuth();
    // Al iniciar la app, descartar sesiones con token expirado
    if (stored?.token && !isTokenValid(stored.token)) {
      localStorage.removeItem('cinteAuth');
      return null;
    }
    return stored;
  });
  const navigate = useNavigate();
  const location = useLocation();
  const isFormularioPublico = location.pathname === '/';
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isComercialRoute = location.pathname.startsWith('/admin/comercial');
  const isContratacionRoute = location.pathname.startsWith('/admin/contratacion');
  const showContratacionNav = auth?.token && userHasContratacionPanel(auth.token);
  const showNovedadesNav = auth?.token && userHasNovedadesAdminAccess(auth.token);
  const showComercialNav = auth?.token && userHasCotizadorAccess(auth.token);
  /** Login / forgot / reset: sin cabecera global para usar viewport completo. */
  const showGlobalHeader = !isFormularioPublico && !(isAdminRoute && !auth?.token);

  const handleLogout = useCallback(() => {
    cognitoSignOut();
    setAuth(null);
    localStorage.removeItem('cinteAuth');
    navigate('/admin', { replace: true });
  }, [navigate]);

  // Escucha cambios de sesión en otras pestañas del navegador
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'cinteAuth') {
        const fresh = readAuth();
        if (!fresh?.token || !isTokenValid(fresh.token)) {
          setAuth(null);
          localStorage.removeItem('cinteAuth');
        } else {
          setAuth(fresh);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Auto-logout cuando el token expira mientras la app está abierta
  useEffect(() => {
    if (!auth?.token) return;
    const payload = decodeJwtPayload(auth.token);
    if (!payload?.exp) return;
    const msUntilExpiry = payload.exp * 1000 - Date.now();
    if (msUntilExpiry <= 0) {
      handleLogout();
      return;
    }
    const timer = setTimeout(() => {
      handleLogout();
    }, msUntilExpiry);
    return () => clearTimeout(timer);
  }, [auth?.token, handleLogout]);

  const onLoggedIn = (authData) => setAuth(authData);
  const headerTitle = (auth?.token && isAdminRoute)
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
      {auth?.token && isAdminRoute && (
        <div className="bg-[#04141E]/90 border-b border-[#1a3a56] px-4 md:px-8 py-2 flex flex-wrap items-center gap-2 font-body">
          {showNovedadesNav ? (
            <button
              type="button"
              onClick={() => navigate('/admin')}
              className={`px-3 py-1.5 rounded-md text-xs md:text-sm font-semibold transition-all ${
                !isComercialRoute && !isContratacionRoute
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
        </div>
      )}

      <main className={`flex-1 ${isFormularioPublico ? 'overflow-hidden' : isAdminRoute ? 'overflow-hidden flex flex-col' : 'w-full overflow-y-auto p-6 md:p-10 bg-[#04141E]'}`}>
        <Routes>
          <Route path="/" element={<FormularioNovedad />} />
          <Route
            path="/admin"
            element={
              auth?.token ? (
                userHasNovedadesAdminAccess(auth.token) ? (
                  <Dashboard token={auth.token} onLogout={handleLogout} />
                ) : userHasCotizadorAccess(auth.token) ? (
                  <Navigate to="/admin/comercial" replace />
                ) : (
                  <Navigate to="/" replace />
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
              <ProtectedRoute>
                <ChangePassword />
              </ProtectedRoute>
            )}
          />
          <Route
            path="/admin/comercial"
            element={(
              <ProtectedRoute>
                {(() => {
                  const token = readAuth()?.token || '';
                  return userHasCotizadorAccess(token) ? (
                    <ComercialModule token={token} onLogout={handleLogout} />
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
              <ProtectedRoute>
                {auth?.token && userHasContratacionPanel(auth.token) ? (
                  <ContratacionModule token={auth.token} onLogout={handleLogout} />
                ) : (
                  <Navigate to="/admin" replace />
                )}
              </ProtectedRoute>
            )}
          />
          <Route path="/admin/cotizador" element={<Navigate to="/admin/comercial" replace />} />
          <Route path="*" element={<Navigate to={auth?.token ? '/admin' : '/'} replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
