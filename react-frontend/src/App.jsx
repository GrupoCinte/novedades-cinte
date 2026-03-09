import { useEffect, useState } from 'react';
import { Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, KeyRound } from 'lucide-react';

import Dashboard from './Dashboard';
import FormularioNovedad from './FormularioNovedad';
import Login from './Login';

import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import ChangePassword from './ChangePassword';

// Helpers auth
function readAuth() {
  try { return JSON.parse(localStorage.getItem('cinteAuth') || 'null'); }
  catch { return null; }
}

function ProtectedRoute({ children }) {
  const auth = readAuth();
  if (!auth?.token) return <Navigate to="/admin" replace />;
  return children;
}

export default function App() {
  const [auth, setAuth] = useState(() => readAuth());
  const navigate = useNavigate();
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  // Sincroniza estado si cambias sesión en otra pestaña
  useEffect(() => {
    const onStorage = (e) => { if (e.key === 'cinteAuth') setAuth(readAuth()); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleLogout = () => {
    setAuth(null);
    localStorage.removeItem('cinteAuth');
    navigate('/admin'); // volver al login
  };

  const onLoggedIn = (authData) => setAuth(authData);

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      {/* Header */}
      <header className="bg-[#0f2437]/95 px-8 py-3 border-b border-[#21405f] flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <img src="http://localhost:3005/assets/logo-cinte.png" className="h-11" alt="CINTE" />
          <span className="font-bold text-[#2a90ff] text-xl tracking-wide">Grupo CINTE</span>
        </div>

        <nav className="flex gap-2 items-center">
          {/* Botón Dashboard → SIEMPRE apunta a /admin */}
          <Link
            to="/admin"
            className={`px-4 py-2 rounded-md font-semibold transition-colors ${
              isAdminRoute ? 'bg-[#2a90ff] text-white' : 'text-[#9fb3c8] hover:text-white hover:bg-white/5'
            }`}
          >
            Dashboard RR.HH.
          </Link>

          {/* Público */}
          <Link
            to="/"
            className={`px-4 py-2 rounded-md font-semibold transition-colors ${
              location.pathname === '/' ? 'bg-[#2a90ff] text-white' : 'text-[#9fb3c8] hover:text-white hover:bg-white/5'
            }`}
          >
            Simular Empleado
          </Link>

          {/* Acciones de sesión */}
          {auth?.token && (
            <>
              <Link
                to="/perfil/cambiar-clave"
                title="Cambiar contraseña"
                className="px-3 py-2 rounded-md text-[#9fb3c8] hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
              >
                <KeyRound size={18} />
                <span className="hidden md:inline">Cambiar contraseña</span>
              </Link>
              <button
                onClick={handleLogout}
                title="Cerrar Sesión"
                className="p-2 ml-1 rounded-md text-[#ff6b6b] hover:bg-[#ff6b6b]/10 transition-colors"
              >
                <LogOut size={20} />
              </button>
            </>
          )}
        </nav>
      </header>

      {/* Contenido */}
      <main className={`flex-1 ${isAdminRoute ? 'overflow-hidden flex flex-col' : 'p-6 md:p-10 container mx-auto'}`}>
        <Routes>
          {/* Pública: radicación */}
          <Route path="/" element={<FormularioNovedad />} />

          {/* 👇 Mejora opción 4:
                /admin → si NO hay token: Login
                         si SÍ hay token: SIEMPRE Dashboard (no redirige al formulario)
           */}
          <Route
            path="/admin"
            element={
              auth?.token
                ? <Dashboard token={auth.token} />
                : <Login setAuth={onLoggedIn} />
            }
          />

          {/* Recuperación de contraseña */}
          <Route path="/admin/forgot" element={<ForgotPassword />} />
          <Route path="/admin/reset" element={<ResetPassword />} />

          {/* Cambiar contraseña (protegida) */}
          <Route
            path="/perfil/cambiar-clave"
            element={
              <ProtectedRoute>
                <ChangePassword />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to={auth?.token ? '/admin' : '/'} replace />} />
        </Routes>
      </main>
    </div>
  );
}