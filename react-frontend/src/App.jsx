import { useState } from 'react'
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom'
import Dashboard from './Dashboard'
import FormularioNovedad from './FormularioNovedad'
import Login from './Login'
import { LogOut } from 'lucide-react'

function App() {
  const [auth, setAuth] = useState(() => {
    const saved = localStorage.getItem('cinteAuth');
    return saved ? JSON.parse(saved) : null;
  })
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = () => {
    setAuth(null)
    localStorage.removeItem('cinteAuth')
    navigate('/') // Redirigir al inicio tras cerrar
  }

  return (
    <div className="h-screen overflow-hidden flex flex-col">
      <header className="bg-[#0f2437]/95 px-8 py-3 border-b border-[#21405f] flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <img src="http://localhost:3005/assets/logo-cinte.png" className="h-11" alt="CINTE" />
          <span className="font-bold text-[#2a90ff] text-xl tracking-wide">Grupo CINTE</span>
        </div>
        <nav className="flex gap-4 items-center">
          {location.pathname === '/admin' || auth ? (
            <>
              <Link
                to="/admin"
                className={`px-4 py-2 rounded-md font-semibold transition-colors ${location.pathname === '/admin' ? 'bg-[#2a90ff] text-white' : 'text-[#9fb3c8] hover:text-white hover:bg-white/5'}`}
              >
                Dashboard RR.HH.
              </Link>
              <Link
                to="/"
                className={`px-4 py-2 rounded-md font-semibold transition-colors ${location.pathname === '/' ? 'bg-[#2a90ff] text-white' : 'text-[#9fb3c8] hover:text-white hover:bg-white/5'}`}
              >
                Simular Empleado
              </Link>
              {auth && (
                <button
                  onClick={handleLogout}
                  title="Cerrar Sesión"
                  className="p-2 ml-2 rounded-md text-[#ff6b6b] hover:bg-[#ff6b6b]/10 transition-colors"
                >
                  <LogOut size={20} />
                </button>
              )}
            </>
          ) : (
            <span className="text-[#9fb3c8] text-sm font-semibold tracking-wide uppercase">Portal de Radicación</span>
          )}
        </nav>
      </header>

      <main className={`flex-1 ${location.pathname === '/admin' ? 'overflow-hidden flex flex-col' : 'p-6 md:p-10 container mx-auto'}`}>
        <Routes>
          <Route path="/" element={<FormularioNovedad />} />
          <Route path="/admin" element={auth ? <Dashboard token={auth.token} /> : <Login setAuth={setAuth} />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
