import { useEffect, useState } from 'react';
import { Routes, Route, Link, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, KeyRound } from 'lucide-react';

import Dashboard from './Dashboard';
import FormularioNovedad from './FormularioNovedad';
import Login from './Login';

// Recuperación
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import ChangePassword from './ChangePassword';

// NUEVAS PÁGINAS DE REGISTRO
import RegisterEmail from './RegisterEmail';
import VerifyCode from './VerifyCode';
import RegisterForm from './RegisterForm';

// Helpers
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

  // Sincroniza el estado cuando cambias sesión en otra pestaña
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'cinteAuth') setAuth(readAuth());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const handleLogout = () => {
    setAuth(null);
    localStorage.removeItem('cinteAuth');
    navigate('/admin');
  };

  const onLoggedIn = (authData) => {
    setAuth(authData);
    navigate('/admin', { replace: true });
  };

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      {/* HEADER */}
      <header className="bg-[#0f2437]/95 px-8 py-3 border-b border-[#21405f] flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <img src="http://localhost:3005/assets/logo-cinte.png" className="h-11" alt="CINTE" />
          <span className="font-bold text-[#2a90ff] text-xl tracking-wide">Grupo CINTE</span>
        </div>

        <nav className="flex gap-2 items-center">
          {/* Dashboard */}
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

      {/* CONTENIDO */}
      <main className={`flex-1 ${isAdminRoute ? 'overflow-hidden flex flex-col' : 'p-6 md:p-10 container mx-auto'}`}>
        <Routes>
          {/* FORMULARIO PÚBLICO */}
          <Route path="/" element={<FormularioNovedad />} />

          {/* LOGIN Y DASHBOARD */}
          <Route
            path="/admin"
            element={
              auth?.token
                ? <Dashboard token={auth.token} />
                : <Login setAuth={onLoggedIn} />
            }
          />

          {/* REGISTRO */}
          <Route path="/admin/register" element={<RegisterEmail />} />
          <Route path="/admin/verify" element={<VerifyCode />} />
          <Route path="/admin/register-data" element={<RegisterForm />} />

          {/* RECUPERACIÓN */}
          <Route path="/admin/forgot" element={<ForgotPassword />} />
          <Route path="/admin/reset" element={<ResetPassword />} />

          {/* CAMBIAR CONTRASEÑA */}
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